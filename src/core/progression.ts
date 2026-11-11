/**
 * 育成の計算（キャラクターのレベルと成長、JP とジョブのレベル、アビリティの習得、ジョブチェンジ、付け替え）。
 *
 * - キャラクターのレベル: 能力値を伸ばす。レベルが上がると、その時のジョブの成長率ぶん「成長値」が増える。
 *   能力値 = 今のジョブの基本値 + 成長値（100 で割って切り捨て。端数は内部で持ち越す）。成長値はジョブを変えても残る。
 * - レベルを 1 つ下げると、その時のジョブの成長率ぶん成長値が減る（0 より下にはならない）。
 *   伸びの悪いジョブで下げ、伸びの良いジョブで上げ直すと、差し引きで成長値が増える（意図した裏技。ゲーム内では説明しない）。
 * - 成長値には、能力ごとの上限と、合計の上限がある（合計は能力ごとの重みを掛けた「成長の点数」で数える）。
 * - ジョブのレベル: そのジョブで得た JP の累計で決まる。能力値には影響せず、アビリティの習得と解放条件に使う。
 * - アビリティは、ジョブごとの JP を消費して習得する。習得にそのジョブのレベルが必要なものもある。
 *   受動的なアビリティ（リアクション・サポート・ムーブ）は、習得するとジョブを問わず、種類ごとに1つ付けられる。
 * - 経験値と JP: 行動のたびに、戦闘中のその場で得る（battle.ts。相手のレベルによって経験値が増減する）。
 *   戦闘が終わったら、戦闘中の値を部隊へ書き戻し、勝利していれば全員に勝利のボーナスを足す（applyBattleResult）。
 *
 * 計算はすべて整数。数値（成長率、必要な経験値など）は src/data から引数で受け取る。
 * 部隊の状態（Roster）は JSON にそのまま変換できる単純なデータにする（セーブにそのまま使うため）。
 */
import type {
  BattleState,
  EquipmentDefinition,
  GrowthStat,
  GrowthValues,
  JobAbility,
  JobDefinition,
  PassiveDefinition,
  PassiveSlot,
  ProgressionRules,
  SpellDefinition,
  StrikeDefinition,
  UnitCommand,
  UnitStats,
} from './battleTypes';
import { canEquip, EQUIP_SLOTS, type EquipmentSlots, type ItemInstance } from './items';

/** 成長値を持つ能力の並び（成長値の計算は、いつもこの順で行う） */
export const GROWTH_STATS: readonly GrowthStat[] = ['maxHp', 'maxMp', 'attack', 'magic', 'speed'];

export const ZERO_GROWTH: GrowthValues = { maxHp: 0, maxMp: 0, attack: 0, magic: 0, speed: 0 };

/** 育成の数値（src/data に置く）。戦闘の状態にも持たせるので、型は battleTypes.ts にある */
export type { ProgressionRules };

/** 1つのジョブでの進み具合 */
export interface JobProgress {
  /** 使える JP（習得で減る） */
  readonly jp: number;
  /** 得た JP の累計（ジョブのレベルを決める。習得しても減らない） */
  readonly jpTotal: number;
  /** 習得済みのアビリティ（行動アビリティと受動的なアビリティ）の id */
  readonly learned: readonly string[];
}

/**
 * アビリティの枠。secondary は副コマンドにするジョブの id。
 * reaction / support / movement は、付けている受動的なアビリティの id（なければ null）。
 */
export interface AbilitySlots {
  readonly secondary: string | null;
  readonly reaction: string | null;
  readonly support: string | null;
  readonly movement: string | null;
}

/** 部隊の1人 */
export interface RosterUnit {
  readonly id: string;
  /** 今のジョブ */
  readonly jobId: string;
  readonly level: number;
  /** 今のレベルの中で貯まっている経験値（次のレベルまでに必要な量に達すると上がる） */
  readonly exp: number;
  readonly growth: GrowthValues;
  /** ジョブごとの進み具合（一度も就いていないジョブは含まないことがある） */
  readonly jobs: Readonly<Record<string, JobProgress>>;
  readonly slots: AbilitySlots;
  /** 装備の枠（武器・防具・装飾品）。値は部隊の所持品（Roster.items）の uid */
  readonly equipment: EquipmentSlots;
}

/** プレイヤーの部隊（戦闘をまたいで育てる） */
export interface Roster {
  readonly units: readonly RosterUnit[];
  /** 所持金（ゴールド） */
  readonly gold: number;
  /** 所持品（装備中の物も含む。1つずつ別の個体） */
  readonly items: readonly ItemInstance[];
  /** 次に手に入れる個体に付ける番号（uid は "i" + 番号。売った個体の uid を使い回さないため） */
  readonly nextItemSeq: number;
}

/** 育成で参照する定義データ */
export interface GameCatalog {
  readonly jobs: readonly JobDefinition[];
  readonly spells: readonly SpellDefinition[];
  readonly strikes: readonly StrikeDefinition[];
  readonly passives: readonly PassiveDefinition[];
  /** 装備の定義（フェーズ2-4） */
  readonly equipment: readonly EquipmentDefinition[];
}

/** 受動的なアビリティの枠の並び */
export const PASSIVE_SLOTS: readonly PassiveSlot[] = ['reaction', 'support', 'movement'];

export const EMPTY_SLOTS: AbilitySlots = { secondary: null, reaction: null, support: null, movement: null };
const EMPTY_PROGRESS: JobProgress = { jp: 0, jpTotal: 0, learned: [] };

export function findJob(catalog: Pick<GameCatalog, 'jobs'>, jobId: string): JobDefinition {
  const job = catalog.jobs.find((j) => j.id === jobId);
  if (!job) throw new Error(`ジョブ ${jobId} が見つかりません`);
  return job;
}

export function findUnit(roster: Roster, unitId: string): RosterUnit {
  const unit = roster.units.find((u) => u.id === unitId);
  if (!unit) throw new Error(`ユニット ${unitId} が部隊にいません`);
  return unit;
}

export function replaceUnit(roster: Roster, unit: RosterUnit): Roster {
  return { ...roster, units: roster.units.map((u) => (u.id === unit.id ? unit : u)) };
}

// ---- 能力値と成長値 ----

/** 能力値 = ジョブの基本値 + 成長値（100 で割って切り捨て） */
export function statsWithGrowth(base: UnitStats, growth: GrowthValues): UnitStats {
  const add = (stat: GrowthStat) => base[stat] + Math.floor(growth[stat] / 100);
  return {
    ...base,
    maxHp: add('maxHp'),
    maxMp: add('maxMp'),
    attack: add('attack'),
    magic: add('magic'),
    speed: add('speed'),
  };
}

/** ユニットの今の能力値（今のジョブの基本値 + 成長値） */
export function unitStats(unit: RosterUnit, catalog: Pick<GameCatalog, 'jobs'>): UnitStats {
  return statsWithGrowth(findJob(catalog, unit.jobId).stats, unit.growth);
}

/** 成長の点数（能力ごとの重みを掛けた合計）。100 倍した整数で返す（端数を落とさないため） */
export function growthPointsX100(growth: GrowthValues, rules: ProgressionRules): number {
  return GROWTH_STATS.reduce((sum, s) => sum + growth[s] * rules.growthWeights[s], 0);
}

/** 成長の点数（切り捨て） */
export function growthPoints(growth: GrowthValues, rules: ProgressionRules): number {
  return Math.floor(growthPointsX100(growth, rules) / 100);
}

/** 成長の点数の合計が上限に達しているか */
export function isGrowthCapped(growth: GrowthValues, rules: ProgressionRules): boolean {
  return growthPointsX100(growth, rules) >= rules.growthTotalCap * 100;
}

/**
 * 成長値に、1レベルぶんの成長率を足す。能力ごとの上限と、合計の上限を超えない範囲で足す。
 * 合計の上限に近い時は、GROWTH_STATS の順に、入る分だけ足す。
 */
export function addGrowth(growth: GrowthValues, rates: GrowthValues, rules: ProgressionRules): GrowthValues {
  let room = rules.growthTotalCap * 100 - growthPointsX100(growth, rules);
  const next: Record<GrowthStat, number> = { ...growth };
  for (const s of GROWTH_STATS) {
    let inc = Math.max(0, Math.min(rates[s], rules.growthCap[s] - growth[s]));
    const weight = rules.growthWeights[s];
    if (weight > 0) inc = Math.max(0, Math.min(inc, Math.floor(room / weight)));
    next[s] = growth[s] + inc;
    room -= inc * weight;
  }
  return next;
}

/** 成長値から、1レベルぶんの成長率を引く（0 より下にはしない） */
export function subtractGrowth(growth: GrowthValues, rates: GrowthValues): GrowthValues {
  const next: Record<GrowthStat, number> = { ...growth };
  for (const s of GROWTH_STATS) next[s] = Math.max(0, growth[s] - rates[s]);
  return next;
}

/** ジョブの成長率（定義がなければ 0） */
export function growthRates(job: JobDefinition): GrowthValues {
  return job.growth ?? ZERO_GROWTH;
}

// ---- キャラクターのレベルと経験値 ----

/** レベル level から次のレベルに上がるのに必要な経験値 */
export function expToNext(level: number, rules: ProgressionRules): number {
  return rules.expBase + rules.expPerLevel * (level - 1);
}

/** レベルを 1 つ上げる（今のジョブの成長率ぶん成長値が増える）。上限なら何もしない */
export function levelUp(unit: RosterUnit, catalog: Pick<GameCatalog, 'jobs'>, rules: ProgressionRules): RosterUnit {
  if (unit.level >= rules.maxLevel) return unit;
  const rates = growthRates(findJob(catalog, unit.jobId));
  return { ...unit, level: unit.level + 1, growth: addGrowth(unit.growth, rates, rules) };
}

/**
 * レベルを 1 つ下げる（今のジョブの成長率ぶん成長値が減る）。レベル 1 なら何もしない。
 * 貯まっていた経験値は 0 に戻す。（フェーズ2-2 の脱力の罠で下がったレベルを、戦闘の後に部隊へ反映する時に使う）
 */
export function levelDown(unit: RosterUnit, catalog: Pick<GameCatalog, 'jobs'>): RosterUnit {
  if (unit.level <= 1) return unit;
  const rates = growthRates(findJob(catalog, unit.jobId));
  return { ...unit, level: unit.level - 1, exp: 0, growth: subtractGrowth(unit.growth, rates) };
}

/**
 * 相手のレベルによる経験値の倍率（%）。相手が自分より高いほど大きく、低いほど小さい。
 * （相手のレベル + offset）× 100 ÷（自分のレベル + offset）を切り捨て、上限で抑える
 */
export function expLevelPercent(ownLevel: number, targetLevel: number, rules: ProgressionRules): number {
  const percent = Math.floor(((targetLevel + rules.expLevelOffset) * 100) / (ownLevel + rules.expLevelOffset));
  return Math.min(rules.expLevelPercentMax, percent);
}

/** 経験値の元の量に、相手のレベルによる増減を掛ける（切り捨て、最低 1） */
export function scaledExp(base: number, ownLevel: number, targetLevel: number, rules: ProgressionRules): number {
  return Math.max(1, Math.floor((base * expLevelPercent(ownLevel, targetLevel, rules)) / 100));
}

/** 1回の行動で得る経験値。味方に使う行動（回復・守り）は expPerSupportAction、それ以外は expPerAction が元の量 */
export function actionExp(supportive: boolean, ownLevel: number, targetLevel: number, rules: ProgressionRules): number {
  return scaledExp(supportive ? rules.expPerSupportAction : rules.expPerAction, ownLevel, targetLevel, rules);
}

/** 経験値を得る。必要な量に達するたびにレベルが上がる。レベルの上限では経験値は貯まらない */
export function gainExp(
  unit: RosterUnit,
  amount: number,
  catalog: Pick<GameCatalog, 'jobs'>,
  rules: ProgressionRules,
): RosterUnit {
  let current: RosterUnit = { ...unit, exp: unit.exp + Math.max(0, amount) };
  while (current.level < rules.maxLevel && current.exp >= expToNext(current.level, rules)) {
    const rest = current.exp - expToNext(current.level, rules);
    current = { ...levelUp(current, catalog, rules), exp: rest };
  }
  if (current.level >= rules.maxLevel) current = { ...current, exp: 0 };
  return current;
}

// ---- JP とジョブのレベル ----

export function jobProgress(unit: RosterUnit, jobId: string): JobProgress {
  return unit.jobs[jobId] ?? EMPTY_PROGRESS;
}

/** JP の累計からジョブのレベル（1 から） */
export function jobLevelFromJp(jpTotal: number, rules: ProgressionRules): number {
  let level = 1;
  for (const need of rules.jobLevelJp) if (jpTotal >= need) level++;
  return level;
}

/** ジョブのレベルの上限 */
export function maxJobLevel(rules: ProgressionRules): number {
  return rules.jobLevelJp.length + 1;
}

export function jobLevel(unit: RosterUnit, jobId: string, rules: ProgressionRules): number {
  return jobLevelFromJp(jobProgress(unit, jobId).jpTotal, rules);
}

/** 次のジョブのレベルまでに必要な JP の累計（上限なら undefined） */
export function nextJobLevelJp(jpTotal: number, rules: ProgressionRules): number | undefined {
  return rules.jobLevelJp.find((need) => jpTotal < need);
}

/** jobId の JP を得る */
export function gainJp(unit: RosterUnit, jobId: string, amount: number): RosterUnit {
  const p = jobProgress(unit, jobId);
  const add = Math.max(0, amount);
  return { ...unit, jobs: { ...unit.jobs, [jobId]: { ...p, jp: p.jp + add, jpTotal: p.jpTotal + add } } };
}

// ---- アビリティ ----

/** jobId で習得済みの行動アビリティ（ジョブの一覧の順） */
export function learnedAbilities(unit: RosterUnit, job: JobDefinition): string[] {
  const learned = jobProgress(unit, job.id).learned;
  return (job.abilities ?? []).filter((a) => learned.includes(a.id)).map((a) => a.id);
}

/** ジョブで習得できるアビリティ（行動アビリティと受動的なアビリティ）の一覧の中から、id のもの */
export function jobAbilityEntry(job: JobDefinition, abilityId: string): JobAbility | undefined {
  return (job.abilities ?? []).find((a) => a.id === abilityId) ?? (job.passives ?? []).find((a) => a.id === abilityId);
}

export function findPassive(catalog: Pick<GameCatalog, 'passives'>, id: string): PassiveDefinition {
  const p = catalog.passives.find((x) => x.id === id);
  if (!p) throw new Error(`受動的なアビリティ ${id} が見つかりません`);
  return p;
}

/**
 * 習得済みの受動的なアビリティのうち、枠 slot に付けられるもの（どのジョブで習得したものでもよい）。
 * ジョブの並び順、ジョブの中の一覧の順
 */
export function passiveChoices(unit: RosterUnit, slot: PassiveSlot, catalog: Pick<GameCatalog, 'jobs' | 'passives'>): string[] {
  const result: string[] = [];
  for (const job of catalog.jobs) {
    const learned = jobProgress(unit, job.id).learned;
    for (const a of job.passives ?? []) {
      if (!learned.includes(a.id) || result.includes(a.id)) continue;
      if (catalog.passives.find((p) => p.id === a.id)?.slot === slot) result.push(a.id);
    }
  }
  return result;
}

/** 受動的なアビリティを枠に付ける（null で外す）。習得していない・枠が違う時はエラー */
export function setPassive(
  unit: RosterUnit,
  slot: PassiveSlot,
  abilityId: string | null,
  catalog: Pick<GameCatalog, 'jobs' | 'passives'>,
): RosterUnit {
  if (abilityId !== null && !passiveChoices(unit, slot, catalog).includes(abilityId)) {
    throw new Error(`${unit.id} は ${abilityId} を ${slot} の枠に付けられません`);
  }
  return { ...unit, slots: { ...unit.slots, [slot]: abilityId } };
}

/** 戦闘で使う、付けている受動的なアビリティの id（リアクション・サポート・ムーブの順） */
export function equippedPassives(unit: RosterUnit): string[] {
  return PASSIVE_SLOTS.map((slot) => unit.slots[slot]).filter((id): id is string => id !== null);
}

export type LearnRefusal = 'unknownAbility' | 'alreadyLearned' | 'notEnoughJp' | 'jobLocked' | 'jobLevelTooLow';

/** アビリティを習得できるか。できなければ理由を返す */
export function learnRefusal(
  unit: RosterUnit,
  jobId: string,
  abilityId: string,
  catalog: Pick<GameCatalog, 'jobs'>,
  rules: ProgressionRules,
): LearnRefusal | null {
  const job = findJob(catalog, jobId);
  const entry = jobAbilityEntry(job, abilityId);
  if (!entry) return 'unknownAbility';
  const p = jobProgress(unit, jobId);
  if (p.learned.includes(abilityId)) return 'alreadyLearned';
  if (!isJobUnlocked(unit, job, rules)) return 'jobLocked';
  if (jobLevel(unit, jobId, rules) < (entry.jobLevel ?? 1)) return 'jobLevelTooLow';
  if (p.jp < entry.jpCost) return 'notEnoughJp';
  return null;
}

/** アビリティを習得する（そのジョブの JP を消費する）。できなければエラー */
export function learnAbility(
  unit: RosterUnit,
  jobId: string,
  abilityId: string,
  catalog: Pick<GameCatalog, 'jobs'>,
  rules: ProgressionRules,
): RosterUnit {
  const refusal = learnRefusal(unit, jobId, abilityId, catalog, rules);
  if (refusal) throw new Error(`${unit.id} は ${jobId} の ${abilityId} を習得できません（${refusal}）`);
  const entry = jobAbilityEntry(findJob(catalog, jobId), abilityId)!;
  const p = jobProgress(unit, jobId);
  return {
    ...unit,
    jobs: { ...unit.jobs, [jobId]: { ...p, jp: p.jp - entry.jpCost, learned: [...p.learned, abilityId] } },
  };
}

// ---- ジョブチェンジと副コマンド ----

/** ジョブの解放条件（ほかのジョブのレベル）をすべて満たしているか */
export function isJobUnlocked(unit: RosterUnit, job: JobDefinition, rules: ProgressionRules): boolean {
  return (job.unlock ?? []).every((r) => jobLevel(unit, r.jobId, rules) >= r.level);
}

/**
 * ジョブを変える（戦闘の外でいつでも）。そのジョブの「最初から習得済み」のアビリティは、この時に習得済みになる。
 * 副コマンドが新しいジョブと同じなら、副コマンドを外す。解放されていなければエラー
 */
export function changeJob(
  unit: RosterUnit,
  jobId: string,
  catalog: Pick<GameCatalog, 'jobs'>,
  rules: ProgressionRules,
): RosterUnit {
  const job = findJob(catalog, jobId);
  if (!isJobUnlocked(unit, job, rules)) throw new Error(`${unit.id} はまだ ${jobId} に就けません`);
  const p = jobProgress(unit, jobId);
  const starters = (job.abilities ?? []).filter((a) => a.starter && !p.learned.includes(a.id)).map((a) => a.id);
  return {
    ...unit,
    jobId,
    jobs: { ...unit.jobs, [jobId]: { ...p, learned: [...p.learned, ...starters] } },
    slots: unit.slots.secondary === jobId ? { ...unit.slots, secondary: null } : unit.slots,
  };
}

/** 副コマンドにできるジョブ（今のジョブ以外で、習得済みの行動アビリティが1つ以上あるもの） */
export function secondaryChoices(unit: RosterUnit, catalog: Pick<GameCatalog, 'jobs'>): string[] {
  return catalog.jobs
    .filter((j) => j.id !== unit.jobId && learnedAbilities(unit, j).length > 0)
    .map((j) => j.id);
}

/** 副コマンドを付け替える（null で外す）。付けられないジョブならエラー */
export function setSecondary(unit: RosterUnit, jobId: string | null, catalog: Pick<GameCatalog, 'jobs'>): RosterUnit {
  if (jobId !== null && !secondaryChoices(unit, catalog).includes(jobId)) {
    throw new Error(`${unit.id} は ${jobId} を副コマンドにできません`);
  }
  return { ...unit, slots: { ...unit.slots, secondary: jobId } };
}

/** 戦闘で使うコマンド（主コマンド = 今のジョブの習得済み、副コマンド = 選んだジョブの習得済み） */
export function unitCommands(unit: RosterUnit, catalog: Pick<GameCatalog, 'jobs'>): UnitCommand[] {
  const main = findJob(catalog, unit.jobId);
  const commands: UnitCommand[] = [{ jobId: main.id, abilityIds: learnedAbilities(unit, main) }];
  if (unit.slots.secondary) {
    const sub = findJob(catalog, unit.slots.secondary);
    commands.push({ jobId: sub.id, abilityIds: learnedAbilities(unit, sub) });
  }
  return commands;
}

// ---- 編成の検証 ----

/** 編成の誤りの種類（画面ではなく、セーブの読み込みやテストで使う） */
export type RosterProblem =
  | { readonly kind: 'duplicateUnit'; readonly unitId: string }
  | { readonly kind: 'unknownJob'; readonly unitId: string; readonly jobId: string }
  | { readonly kind: 'jobLocked'; readonly unitId: string; readonly jobId: string }
  | { readonly kind: 'badLevel'; readonly unitId: string }
  | { readonly kind: 'badExp'; readonly unitId: string }
  | { readonly kind: 'badGrowth'; readonly unitId: string; readonly stat: GrowthStat }
  | { readonly kind: 'growthOverTotal'; readonly unitId: string }
  | { readonly kind: 'badJp'; readonly unitId: string; readonly jobId: string }
  | { readonly kind: 'unknownAbility'; readonly unitId: string; readonly jobId: string; readonly abilityId: string }
  | { readonly kind: 'badSecondary'; readonly unitId: string; readonly jobId: string }
  | { readonly kind: 'badPassive'; readonly unitId: string; readonly slot: PassiveSlot; readonly abilityId: string }
  | { readonly kind: 'badGold' }
  | { readonly kind: 'badItem'; readonly uid: string }
  | { readonly kind: 'duplicateItem'; readonly uid: string }
  | { readonly kind: 'badEquipment'; readonly unitId: string; readonly uid: string };

/** 部隊の状態がルールどおりかを確かめ、誤りの一覧を返す（正しければ空） */
export function validateRoster(roster: Roster, catalog: GameCatalog, rules: ProgressionRules): RosterProblem[] {
  const problems: RosterProblem[] = [];
  const seen = new Set<string>();
  const isInt = (n: unknown) => Number.isInteger(n);
  // 所持金と所持品（同じ uid は1つだけ。定義のある装備だけ）
  if (!isInt(roster.gold) || roster.gold < 0) problems.push({ kind: 'badGold' });
  if (!isInt(roster.nextItemSeq) || roster.nextItemSeq < 1) problems.push({ kind: 'badGold' });
  const items = new Map<string, EquipmentDefinition>();
  for (const item of roster.items) {
    if (items.has(item.uid)) problems.push({ kind: 'duplicateItem', uid: item.uid });
    const def = catalog.equipment.find((e) => e.id === item.itemId);
    if (!def) problems.push({ kind: 'badItem', uid: item.uid });
    else items.set(item.uid, def);
  }
  /** 装備の枠に入っている uid（同じ個体を2か所に付けていないか） */
  const worn = new Set<string>();
  for (const u of roster.units) {
    const unitId = u.id;
    if (seen.has(unitId)) problems.push({ kind: 'duplicateUnit', unitId });
    seen.add(unitId);
    const job = catalog.jobs.find((j) => j.id === u.jobId);
    if (!job) problems.push({ kind: 'unknownJob', unitId, jobId: u.jobId });
    else if (!isJobUnlocked(u, job, rules)) problems.push({ kind: 'jobLocked', unitId, jobId: u.jobId });
    if (!isInt(u.level) || u.level < 1 || u.level > rules.maxLevel) problems.push({ kind: 'badLevel', unitId });
    if (!isInt(u.exp) || u.exp < 0 || (isInt(u.level) && u.level < rules.maxLevel && u.exp >= expToNext(u.level, rules))) {
      problems.push({ kind: 'badExp', unitId });
    }
    for (const stat of GROWTH_STATS) {
      const g = u.growth[stat];
      if (!isInt(g) || g < 0 || g > rules.growthCap[stat]) problems.push({ kind: 'badGrowth', unitId, stat });
    }
    if (growthPointsX100(u.growth, rules) > rules.growthTotalCap * 100) problems.push({ kind: 'growthOverTotal', unitId });
    for (const [jobId, p] of Object.entries(u.jobs)) {
      const def = catalog.jobs.find((j) => j.id === jobId);
      if (!def) {
        problems.push({ kind: 'unknownJob', unitId, jobId });
        continue;
      }
      if (!isInt(p.jp) || !isInt(p.jpTotal) || p.jp < 0 || p.jpTotal < p.jp) problems.push({ kind: 'badJp', unitId, jobId });
      for (const abilityId of p.learned) {
        if (!jobAbilityEntry(def, abilityId)) {
          problems.push({ kind: 'unknownAbility', unitId, jobId, abilityId });
        }
      }
    }
    const secondary = u.slots.secondary;
    if (secondary !== null && (secondary === u.jobId || !secondaryChoices(u, catalog).includes(secondary))) {
      problems.push({ kind: 'badSecondary', unitId, jobId: secondary });
    }
    // リアクション・サポート・ムーブは、習得済みで、その枠の種類のものだけ
    for (const slot of PASSIVE_SLOTS) {
      const abilityId = u.slots[slot];
      if (abilityId !== null && !passiveChoices(u, slot, catalog).includes(abilityId)) {
        problems.push({ kind: 'badPassive', unitId, slot, abilityId });
      }
    }
    // 装備: 持っている個体で、その枠の物で、今のジョブで付けられる物。同じ個体を2か所に付けない
    for (const slot of EQUIP_SLOTS) {
      const uid = u.equipment[slot];
      if (uid === null) continue;
      const def = items.get(uid);
      if (!def || def.slot !== slot || worn.has(uid) || (job && !canEquip(job, def))) {
        problems.push({ kind: 'badEquipment', unitId, uid });
      }
      worn.add(uid);
    }
  }
  return problems;
}

// ---- 戦闘の結果を部隊に反映する ----

/** 戦闘の後の、1人ぶんの成果 */
export interface UnitBattleReport {
  readonly unitId: string;
  /** 戦闘で経験値を得た行動の回数 */
  readonly actions: number;
  /** 得た経験値の合計（戦闘中 + 勝利のボーナス） */
  readonly exp: number;
  /** 得た JP の合計（戦闘中 + 勝利のボーナス） */
  readonly jp: number;
  /** 戦闘中に得た経験値と JP */
  readonly battleExp: number;
  readonly battleJp: number;
  /** 勝利のボーナス（負けたら 0） */
  readonly bonusExp: number;
  readonly bonusJp: number;
  /** JP が入ったジョブ */
  readonly jobId: string;
  /** 戦闘の前のレベル */
  readonly levelBefore: number;
  /** 戦闘が終わった時点のレベル（勝利のボーナスの前） */
  readonly levelAfterBattle: number;
  /** 勝利のボーナスを足した後のレベル */
  readonly levelAfter: number;
  /** 脱力の罠で下がったレベルの数 */
  readonly levelDrops: number;
  readonly jobLevelBefore: number;
  readonly jobLevelAfterBattle: number;
  readonly jobLevelAfter: number;
}

export interface BattleReport {
  readonly victory: boolean;
  readonly units: readonly UnitBattleReport[];
}

/**
 * 戦闘の結果を部隊に反映する。
 * - 戦闘中に得た経験値と JP（とレベルアップ・脱力の罠で下がったレベル）は、戦闘中のユニットの値をそのまま部隊へ書き戻す。
 *   負けても持ち帰れる。
 * - 勝利すると、倒れたユニットを含む全員に、敵の最も高いレベルによって増減した expVictory と、jpVictoryBonus を足す
 *   （自分のレベルは、戦闘が終わった時点のレベル）。
 * battle の味方のユニットのうち、部隊にいて（id が同じ）、戦闘中の進み具合（progress）を持つユニットに反映する。
 */
export function applyBattleResult(
  roster: Roster,
  battle: BattleState,
  catalog: Pick<GameCatalog, 'jobs'>,
  rules: ProgressionRules,
): { roster: Roster; report: BattleReport } {
  const victory = battle.winner === 'player';
  const enemyLevel = Math.max(1, ...battle.units.filter((u) => u.team === 'enemy').map((u) => u.level));
  const reports: UnitBattleReport[] = [];
  let next = roster;
  for (const u of battle.units) {
    if (u.team !== 'player' || !u.progress) continue;
    const before = next.units.find((r) => r.id === u.id);
    if (!before) continue;
    const jobId = before.jobId;
    const p = jobProgress(before, jobId);
    const afterBattle: RosterUnit = {
      ...before,
      level: u.level,
      exp: u.progress.exp,
      growth: u.growth,
      jobs: { ...before.jobs, [jobId]: { ...p, jp: u.progress.jp, jpTotal: u.progress.jpTotal } },
    };
    const bonusExp = victory ? scaledExp(rules.expVictory, afterBattle.level, enemyLevel, rules) : 0;
    const bonusJp = victory ? rules.jpVictoryBonus : 0;
    const after = gainJp(gainExp(afterBattle, bonusExp, catalog, rules), jobId, bonusJp);
    reports.push({
      unitId: u.id,
      actions: u.actionCount,
      exp: u.progress.gainedExp + bonusExp,
      jp: u.progress.gainedJp + bonusJp,
      battleExp: u.progress.gainedExp,
      battleJp: u.progress.gainedJp,
      bonusExp,
      bonusJp,
      jobId,
      levelBefore: before.level,
      levelAfterBattle: afterBattle.level,
      levelAfter: after.level,
      levelDrops: u.levelDrops,
      jobLevelBefore: jobLevel(before, jobId, rules),
      jobLevelAfterBattle: jobLevel(afterBattle, jobId, rules),
      jobLevelAfter: jobLevel(after, jobId, rules),
    });
    next = replaceUnit(next, after);
  }
  return { roster: next, report: { victory, units: reports } };
}
