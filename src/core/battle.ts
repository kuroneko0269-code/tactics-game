/**
 * 戦闘の進行。「現在の状態 + 行動 → 新しい状態 + 起きた出来事の一覧」という関数で進める。
 *
 * 1回の手番では、移動と攻撃を1回ずつ、好きな順でできる。最後に向きを選んで手番を終える。
 * 攻撃する前なら、移動を取り消して手番開始時の位置に戻れる。
 * 行動は通常攻撃か魔法の指定。魔法はすぐには発動せず、手番と手番の間の時計の進みの中で発動する（magic.ts）。
 * 詠唱中に自分の手番が来たら、待機すれば詠唱を続け、移動か行動をすると詠唱は中断される（MP は戻らない）。
 * 行動には、通常攻撃のほかに行動アビリティ（強打のようにすぐ出る技と、詠唱のある魔法・狙い撃ち）がある。
 * アビリティは、必要な武器の種類が合わなければ使えない。
 * 経験値と JP（フェーズ2-3）: 部隊のユニット（progress を持つ）は、行動した時点で経験値と JP を得る。経験値が貯まれば、
 * その場でレベルが上がり、成長値と能力値が変わる（最大 HP・MP が増えた分だけ、今の HP・MP も増える。全回復はしない）。
 * - 攻撃・技は、当たっても外れても同じ量。相手のレベルで増減する。反撃では入らない。
 * - 詠唱のある魔法・技は、発動した時に入る（中断・不発では入らない）。範囲に何体いても1回分で、
 *   レベルによる増減は、意図した側（攻撃なら敵、回復・補助なら味方）のうち効果が届いた中で最もレベルの高いユニットで計算する。
 *   意図した側が1体もいなければ経験値は最低の 1、誰にも届かなければ入らない（フェーズ2-4）。
 * - 敵のユニットは得ない。
 * 勝敗は、戦闘ごとの勝敗条件で決まる（省くと全滅。判定は scenario.ts）。
 *
 * マップ上のイベント・罠・増援（フェーズ2-2）:
 * - 手番の区切り（ある手番が終わり、次の手番が始まる前）で、手番数の勝敗条件 →「手番」のきっかけのイベント
 *   → 予告済みの増援の出現 → 状態で決まるきっかけのイベント の順に処理する。
 * - ユニットが移動か突き飛ばしでマスに入ったら、そのマスの罠 →「マスに入る」のきっかけのイベント の順に処理する。
 * - HP が減った後（攻撃・魔法・罠）に、「HP が一定以下」「撃破」のきっかけを調べる。
 * - 罠やイベントが起きた移動は、取り消せない。自分の移動で倒れたら、その手番はそこで終わる。
 *
 * 戦闘不能と蘇生（フェーズ2-5）:
 * - HP が 0 になったユニットは戦闘不能になり、倒れた姿でそのマスに残る（行動できず、手番も来ない。詠唱は不発、状態変化は消える）。
 *   CT は溜まり続け、手番が来るはずだった時にカウントが 1 減る。0 になると退場し、マップから消える。
 * - 蘇生の魔法で、退場する前なら復帰できる（最大 HP の一定の割合、CT は 0）。
 * - 勝敗では、戦闘不能は倒れたものとして数える（立っているユニットがいなくなった側の負け）。
 *
 * ジョブのマスター（フェーズ2-5）: 今のジョブのアビリティをすべて習得しているユニットは、戦闘中にジョブのレベルが上限に届くと
 * マスターになり、成長の点数の合計の上限が増える（progress.growthTotalCap）。
 *
 * 状態変化（守り・鈍足・沈黙）は、そのユニットの手番が終わるたびに持続が 1 減り、0 で消える（effects.ts）。
 * 攻撃が当たった後の順番: ダメージ → 突き飛ばし（詠唱の中断、押し出しと落下・追加のダメージ）→ 状態変化 → 瞑想 → 反撃。
 * 反撃で手番のユニットが倒れたら、その手番はそこで終わる。
 */
import type {
  ActionResult,
  BattleAction,
  BattleEvent,
  BattleRules,
  BattleSetup,
  BattleState,
  JobDefinition,
  ObjectPlacement,
  MapEventState,
  PassiveDefinition,
  PendingReinforcement,
  ProgressionRules,
  ScenarioState,
  SpellDefinition,
  StatusId,
  StrikeDefinition,
  Team,
  TileChange,
  TrapKind,
  TurnState,
  UnitCommand,
  UnitPlacement,
  UnitState,
  UnitStats,
} from './battleTypes';
import { attackableTargets, canReach, counterStrike, knockbackOutcome, previewAttack, strikeOf, sweepExtraTargets, weaponFits } from './combat';
import {
  addStatus,
  applyPassiveStats,
  applyStatusStats,
  damageTaken,
  enduredDamage,
  hasStatus,
  isSilencedFor,
  mpCostOf,
  passiveEffect,
  passiveIdOf,
  statusBlocker,
  tickStatuses,
} from './effects';
import { DIRECTIONS, directionToward, manhattan, type Coord, type RelativeSide } from './geometry';
import { hasMpFor, isValidSpellTarget, previewSpellAt, spellOf, targetCenter } from './magic';
import {
  actionExp,
  addGrowth,
  expToNext,
  jobLevelFromJp,
  statsWithGrowth,
  subtractGrowth,
  ZERO_GROWTH,
} from './progression';
import { createMap, getTile, type Tile } from './map';
import { canStep, isAlive, isOnMap, reachableTiles, unitAt } from './movement';
import { createRng, restoreRng } from './rng';
import {
  DEFAULT_OBJECTIVES,
  enterTriggerDue,
  judgeOutcome,
  judgeStalemate,
  judgeTurnOutcome,
  spawnTile,
  stateTriggerDue,
  trapAt,
  turnTriggerDue,
  type Outcome,
} from './scenario';
import { ctAfterTurnFor, nextTimelineEntry } from './turnOrder';

/**
 * 定義データから戦闘を始める。最初の手番が始まった状態を返す。
 * 能力値は、ジョブの基本値に配置の成長値を足し、受動的なアビリティ（重装・早足・身軽）を反映したもの。
 * 使えるアビリティは配置のコマンドのもの。付けている受動的なアビリティは配置の passives のもの。
 */
export function startBattle(
  setup: BattleSetup,
  jobs: readonly JobDefinition[],
  rules: BattleRules,
  seed: number,
  spells: readonly SpellDefinition[] = [],
  strikes: readonly StrikeDefinition[] = [],
  passives: readonly PassiveDefinition[] = [],
): ActionResult {
  const map = createMap(setup.map);
  const ids = new Set<string>();
  const build = (p: UnitPlacement) => buildUnit(p, rules, jobs, spells, strikes, passives, setup.progression);
  const units: UnitState[] = setup.units.map((p) => {
    if (ids.has(p.id)) throw new Error(`ユニット id ${p.id} が重複しています`);
    ids.add(p.id);
    if (!getTile(map, p.x, p.z)) throw new Error(`ユニット ${p.id}: 配置 (${p.x}, ${p.z}) がマップ外です`);
    return build(p);
  });
  // 対象物（物語の土台）: どちらの陣営でもない、行動しない「物」。ユニットと同じ一覧に入れる
  for (const o of setup.objects ?? []) {
    if (ids.has(o.id)) throw new Error(`対象物 id ${o.id} が重複しています`);
    ids.add(o.id);
    if (!getTile(map, o.x, o.z)) throw new Error(`対象物 ${o.id}: 配置 (${o.x}, ${o.z}) がマップ外です`);
    if (!Number.isInteger(o.hp) || o.hp < 1) throw new Error(`対象物 ${o.id}: HP は 1 以上の整数にしてください`);
    units.push(buildObject(o, rules));
  }
  const objectives = setup.objectives ?? DEFAULT_OBJECTIVES;
  const known = (id: string) => ids.has(id);
  const events: MapEventState[] = (setup.events ?? []).map((e) => {
    const effects = e.effects.map((effect) => {
      if (effect.kind !== 'reinforce') return effect;
      if (!Number.isInteger(effect.delay) || effect.delay < 1) throw new Error(`イベント ${e.id}: 増援の delay は 1 以上にしてください`);
      return {
        kind: 'reinforce' as const,
        delay: effect.delay,
        units: effect.units.map((p) => {
          if (!getTile(map, p.x, p.z)) throw new Error(`イベント ${e.id}: 増援 ${p.id} の位置がマップ外です`);
          return build(p);
        }),
      };
    });
    // HP と撃破のきっかけは1回だけ（状態で決まるので、繰り返すと同じ時点で何度も起きてしまう）
    const once = e.trigger.kind === 'hpBelow' || e.trigger.kind === 'unitDefeated' || e.trigger.kind === 'tally' || e.trigger.kind === 'objectsBroken';
    const times = once ? 1 : (e.times ?? 1);
    return { id: e.id, trigger: e.trigger, effects, times, fired: 0 };
  });
  for (const c of [...objectives.victory, ...objectives.defeat]) {
    if ((c.kind === 'defeatUnit' || c.kind === 'unitDefeated' || c.kind === 'hitUnit') && !known(c.unitId)) {
      throw new Error(`勝敗条件のユニット ${c.unitId} がいません`);
    }
    if (c.kind === 'destroyObjects') {
      for (const id of c.unitIds) {
        if (!units.some((u) => u.id === id && u.object)) throw new Error(`勝敗条件の対象物 ${id} がいません`);
      }
    }
  }
  for (const t of setup.traps ?? []) {
    if (!getTile(map, t.x, t.z)) throw new Error(`罠 (${t.x}, ${t.z}) がマップ外です`);
  }
  const scenario: ScenarioState = {
    objectives,
    events,
    traps: (setup.traps ?? []).map((t) => ({ x: t.x, z: t.z, kind: t.kind, revealed: false })),
    reinforcements: [],
    tallies: {},
  };
  const state: BattleState = {
    map,
    rules,
    units,
    turn: null,
    winner: null,
    rngState: createRng(seed).getState(),
    progression: setup.progression ?? null,
    turnNumber: 0,
    lastAggressionTurn: 0,
    scenario,
    lastActivityTurn: 0,
  };
  const out: BattleEvent[] = [];
  return { state: beginNextTurn(state, out), events: out };
}

/**
 * 配置の定義から、戦闘中のユニットを組み立てる（戦闘の開始時の味方・敵と、増援）。
 * 能力値は、ジョブの基本値に配置の成長値を足し、受動的なアビリティ（重装・早足・身軽）を反映したもの。
 */
function buildUnit(
  p: UnitPlacement,
  rules: BattleRules,
  jobs: readonly JobDefinition[],
  spells: readonly SpellDefinition[],
  strikes: readonly StrikeDefinition[],
  passives: readonly PassiveDefinition[],
  progression: ProgressionRules | undefined,
): UnitState {
  const job = jobs.find((j) => j.id === p.jobId);
  if (!job) throw new Error(`ユニット ${p.id}: ジョブ ${p.jobId} が見つかりません`);
  const commands: readonly UnitCommand[] = p.commands ?? [
    { jobId: job.id, abilityIds: (job.abilities ?? []).map((a) => a.id) },
  ];
  const unitSpells: SpellDefinition[] = [];
  const unitStrikes: StrikeDefinition[] = [];
  for (const id of commands.flatMap((c) => c.abilityIds)) {
    const spell = spells.find((s) => s.id === id);
    const strike = strikes.find((s) => s.id === id);
    if (spell && !unitSpells.includes(spell)) unitSpells.push(spell);
    else if (strike && !unitStrikes.includes(strike)) unitStrikes.push(strike);
    else if (!spell && !strike) throw new Error(`ユニット ${p.id}: アビリティ ${id} が見つかりません`);
  }
  const unitPassives = (p.passives ?? []).map((id) => {
    const def = passives.find((x) => x.id === id);
    if (!def) throw new Error(`ユニット ${p.id}: 受動的なアビリティ ${id} が見つかりません`);
    return def;
  });
  const growth = p.growth ?? ZERO_GROWTH;
  // 装備を指定した配置: 能力値に装備の値を足し、武器の種類と届き方は武器で決まる（武器がなければ素手）。
  // 指定しない配置（テスト用）: ジョブの届き方と、装備できる武器の先頭の種類を使う
  const equipment = p.equipment ?? [];
  const weaponItem = equipment.find((e) => e.slot === 'weapon');
  const weapon = p.equipment ? (weaponItem?.weaponType ?? null) : (job.weaponTypes?.[0] ?? null);
  const attack = p.equipment ? (weaponItem?.attack ?? rules.unarmedAttack) : job.attack;
  // 素手（武器の枠が空）の時のジョブの補正（格闘家。フェーズ2-6）
  // 鍛えた拳（受動的なアビリティ）も、素手の時だけ攻撃力に足す
  const fist = weapon === null ? unitPassives.flatMap((x) => (x.effect.kind === 'unarmedAttackBonus' ? [{ attack: x.effect.amount }] : [])) : [];
  const unarmed = [...(weapon === null && job.unarmedBonus ? [job.unarmedBonus] : []), ...fist];
  const statBonus = sumStats([p.statBonus ?? {}, ...equipment.map((e) => e.stats), ...unarmed]);
  const stats = computeStats(job.stats, growth, statBonus, unitPassives);
  return {
    id: p.id,
    team: p.team,
    jobId: p.jobId,
    x: p.x,
    z: p.z,
    facing: p.facing,
    hp: stats.maxHp,
    ct: 0,
    knockoutCount: 0,
    retired: false,
    stats,
    attack,
    mp: stats.maxMp,
    level: p.level ?? 1,
    levelDrops: 0,
    baseStats: job.stats,
    growth,
    growthRates: job.growth ?? ZERO_GROWTH,
    statBonus,
    equipment,
    progress: p.progress
      ? {
          exp: p.progress.exp,
          jp: p.progress.jp,
          jpTotal: p.progress.jpTotal,
          gainedExp: 0,
          gainedJp: 0,
          growthTotalCap: p.progress.growthTotalCap ?? progression?.growthTotalCap ?? 0,
          masteryPending: p.progress.masteryPending ?? false,
        }
      : null,
    weapon,
    commands,
    spells: unitSpells,
    strikes: unitStrikes,
    passives: unitPassives,
    statuses: [],
    actionCount: 0,
    charging: null,
    movedLastTurn: false,
    turnStartHp: stats.maxHp,
    endureUsed: false,
  };
}

/**
 * 対象物（物語の土台）を、戦闘中のユニットの形に組み立てる。陣営は neutral、能力値は HP だけ（素早さ 0 なので手番は来ない）。
 * 状態変化・受動的なアビリティ・装備は持たない
 */
function buildObject(o: ObjectPlacement, rules: BattleRules): UnitState {
  const stats: UnitStats = { maxHp: o.hp, attack: 0, speed: 0, move: 0, jump: 0, maxMp: 0, magic: 0 };
  return {
    id: o.id,
    team: 'neutral',
    // ジョブの定義はない。画面で名前を引くため、ジョブの欄は「object:種類」にする
    jobId: `object:${o.kind}`,
    x: o.x,
    z: o.z,
    facing: 'south',
    hp: o.hp,
    ct: 0,
    knockoutCount: 0,
    retired: false,
    stats,
    attack: rules.unarmedAttack,
    mp: 0,
    level: o.level ?? 1,
    levelDrops: 0,
    baseStats: stats,
    growth: ZERO_GROWTH,
    growthRates: ZERO_GROWTH,
    statBonus: {},
    equipment: [],
    progress: null,
    weapon: null,
    commands: [],
    spells: [],
    strikes: [],
    passives: [],
    statuses: [],
    actionCount: 0,
    charging: null,
    movedLastTurn: false,
    turnStartHp: o.hp,
    endureUsed: false,
    object: { kind: o.kind },
  };
}

/** 能力値 = 基本値 + 成長値（100 で割って切り捨て）+ 補正、に受動的なアビリティ（重装・早足・身軽）を反映したもの */
function computeStats(
  base: UnitStats,
  growth: UnitState['growth'],
  bonus: Partial<UnitStats>,
  passives: readonly PassiveDefinition[],
): UnitStats {
  return applyPassiveStats(withBonus(statsWithGrowth(base, growth), bonus), passives);
}

/** 能力値の補正を足し合わせる（装備の値と、敵の段階の調整） */
function sumStats(parts: readonly Partial<UnitStats>[]): Partial<UnitStats> {
  const result: Partial<Record<keyof UnitStats, number>> = {};
  for (const part of parts) {
    for (const key of Object.keys(part) as (keyof UnitStats)[]) result[key] = (result[key] ?? 0) + (part[key] ?? 0);
  }
  return result;
}

/** 能力値に補正を足す（0 より下にはしない） */
function withBonus(stats: UnitStats, bonus: Partial<UnitStats> | undefined): UnitStats {
  if (!bonus) return stats;
  const result: Record<keyof UnitStats, number> = { ...stats };
  for (const key of Object.keys(bonus) as (keyof UnitStats)[]) result[key] = Math.max(0, stats[key] + (bonus[key] ?? 0));
  return result;
}

/** 今の能力値: 基本値 + 成長値 + 補正 に、受動的なアビリティと状態変化（フェーズ2-6）を反映したもの */
function currentStats(u: UnitState, rules: BattleRules, growth = u.growth, statuses = u.statuses): UnitStats {
  return applyStatusStats(computeStats(u.baseStats, growth, u.statBonus, u.passives), statuses, rules);
}

/**
 * 状態変化の一覧を入れ替え、能力値を計算し直す（攻撃力低下・加速などが付いた・消えた時）。
 * 最大 HP・MP が下がったら、今の HP・MP は最大を超えないように抑える（上がっても今の値は増やさない）
 */
function setStatuses(state: BattleState, unitId: string, statuses: UnitState['statuses']): BattleState {
  const u = getUnit(state, unitId);
  const stats = currentStats(u, state.rules, u.growth, statuses);
  return updateUnit(state, unitId, { statuses, stats, hp: Math.min(u.hp, stats.maxHp), mp: Math.min(u.mp, stats.maxMp) });
}

/** 「踏みとどまる」で耐えた: 使ったことを記録し、出来事に残す */
function markEndured(state: BattleState, unitId: string, events: BattleEvent[]): BattleState {
  const u = getUnit(state, unitId);
  events.push({ type: 'endured', unitId, abilityId: passiveIdOf(u, 'endure') ?? '' });
  return updateUnit(state, unitId, { endureUsed: true });
}

export function getUnit(state: BattleState, id: string): UnitState {
  const unit = state.units.find((u) => u.id === id);
  if (!unit) throw new Error(`ユニット ${id} が見つかりません`);
  return unit;
}

/** 手番を持っているユニット（決着後は undefined） */
export function activeUnit(state: BattleState): UnitState | undefined {
  return state.turn ? getUnit(state, state.turn.unitId) : undefined;
}

/**
 * ダメージ・回復・状態変化の付与が起きた出来事か（膠着の判定。フェーズ2-6）
 */
function isActivity(e: BattleEvent): boolean {
  switch (e.type) {
    case 'attacked':
      return e.hit && e.damage > 0;
    case 'knockedBack':
    case 'trapTriggered':
      return e.damage > 0;
    case 'spellResolved':
      return (e.effect === 'damage' || e.effect === 'heal' || e.effect === 'rewind' || e.effect === 'revive') && e.results.some((r) => r.amount > 0);
    case 'statusAdded':
    case 'revived':
      return true;
    default:
      return false;
  }
}

/** 行動を1つ適用する。ルール上できない行動ならエラーにする */
export function applyAction(state: BattleState, action: BattleAction): ActionResult {
  const result = applyActionInner(state, action);
  // 膠着の判定のため、ダメージ・回復・状態変化の付与が起きた手番を覚える（次の手番の前に発動した魔法の分も）
  if (!result.events.some(isActivity)) return result;
  const last = Math.max(result.state.lastActivityTurn ?? 0, state.turnNumber);
  return { state: { ...result.state, lastActivityTurn: last }, events: result.events };
}

function applyActionInner(state: BattleState, action: BattleAction): ActionResult {
  if (!state.turn || state.winner) throw new Error('戦闘は終わっています');
  const events: BattleEvent[] = [];
  const original = state;
  const turn0 = state.turn;

  // 手番開始時から詠唱中なら、移動・行動の前に詠唱を中断する（MP は戻らない）
  const interrupts = action.type === 'move' || action.type === 'attack' || action.type === 'cast';
  if (interrupts) validateBeforeInterrupt(state, action);
  if (interrupts && turn0.chargingAtStart) {
    const caster = getUnit(state, turn0.unitId);
    if (caster.charging) {
      events.push({ type: 'castInterrupted', casterId: caster.id, spellId: caster.charging.spellId, reason: 'acted' });
      state = updateUnit(state, caster.id, { charging: null });
    }
    state = { ...state, turn: { ...turn0, chargingAtStart: false } };
  }
  const turn = state.turn!;
  const unit = getUnit(state, turn.unitId);

  switch (action.type) {
    case 'move': {
      const dest = reachableTiles(original, unit).find((t) => t.x === action.x && t.z === action.z)!;
      const last = dest.path[dest.path.length - 1]!;
      const prev = dest.path[dest.path.length - 2]!;
      // 移動後は、最後に進んだ方向を向く
      const facing = directionToward(prev, last, unit.facing);
      events.push({ type: 'moved', unitId: unit.id, path: dest.path });
      const before = events.length;
      let next: BattleState = { ...updateUnit(state, unit.id, { x: dest.x, z: dest.z, facing }), turn: { ...turn, moved: true } };
      next = arrive(next, unit.id, events);
      next = runStateEvents(next, events);
      // 罠やイベントが起きた移動は、取り消せない
      if (events.length > before && next.turn) next = { ...next, turn: { ...next.turn, moveLocked: true } };
      next = endIfDecided(next, events);
      // 罠で手番のユニットが倒れたら、その手番はそこで終わる
      if (!next.winner && !isAlive(getUnit(next, unit.id))) next = beginNextTurn({ ...next, turn: null }, events);
      return { state: next, events };
    }

    case 'undoMove': {
      if (!turn.moved) throw new Error('取り消す移動がありません');
      if (turn.acted) throw new Error('行動した後は移動を取り消せません');
      if (turn.moveLocked) throw new Error('罠やイベントが起きた移動は取り消せません');
      const { x, z, facing } = turn.origin;
      events.push({ type: 'moveUndone', unitId: unit.id, x, z, facing });
      return {
        state: { ...updateUnit(state, unit.id, { x, z, facing }), turn: { ...turn, moved: false } },
        events,
      };
    }

    case 'attack': {
      const target = getUnit(state, action.targetId);
      const strike = action.abilityId === undefined ? undefined : strikeOf(unit, action.abilityId);
      // 斬り分け: 正面の左右のマスの敵を先に、選んだ相手（正面）を最後に攻撃する（反撃は正面の相手だけなので、最後に起きる）
      const extras = strike?.sweep ? sweepExtraTargets(state, unit, unit, target) : [];
      // 魔法剣など、MP を使う技（フェーズ2-6）
      let next = strike?.mpCost ? updateUnit(state, unit.id, { mp: unit.mp - strike.mpCost }) : state;
      if (strike?.steal) {
        next = resolveSteal(next, unit.id, target.id, strike, events);
      } else {
        for (const extra of extras) {
          if (!isAlive(getUnit(next, unit.id))) break;
          next = resolveWeaponAttack(next, unit.id, extra.id, { ...strike!, sweep: false }, false, events);
        }
        // 連撃: 1回ごとに命中を判定する。途中で相手か自分が倒れたら、そこで終わる
        const hits = Math.max(1, strike?.hits ?? 1);
        for (let i = 0; i < hits; i++) {
          if (!isAlive(getUnit(next, unit.id)) || !isAlive(getUnit(next, target.id))) break;
          // 相手が逃げ足で離れたら、続きは届かない
          if (i > 0 && !attackableTargets(next, getUnit(next, unit.id), getUnit(next, unit.id)).some((u) => u.id === target.id)) break;
          next = resolveWeaponAttack(next, unit.id, target.id, strike, false, events);
        }
      }
      // 当たっても外れても、同じ量の経験値と JP（反撃を受けて倒れても入る）。巻き込んだ敵の中で最もレベルの高い相手で計算する
      next = grantProgress(next, unit.id, Math.max(target.level, ...extras.map((e) => e.level)), false, events);
      next = runStateEvents(next, events);
      next = { ...next, turn: { ...turn, acted: true }, lastAggressionTurn: state.turnNumber, teamAggression: aggressed(state, unit.team) };
      next = endIfDecided(next, events);
      // 反撃で手番のユニットが倒れたら、その手番はそこで終わる
      if (!next.winner && !isAlive(getUnit(next, unit.id))) next = beginNextTurn({ ...next, turn: null }, events);
      return { state: next, events };
    }

    case 'cast': {
      const spell = spellOf(unit, action.spellId);
      const center = targetCenter(state, action.target)!;
      const casterFacing = directionToward(unit, center, unit.facing);
      const mp = unit.mp - mpCostOf(unit, spell);
      const target = action.target.kind === 'unit'
        ? { kind: 'unit' as const, unitId: action.target.unitId }
        : { kind: 'tile' as const, x: action.target.x, z: action.target.z };
      events.push({ type: 'castStarted', casterId: unit.id, spellId: spell.id, target, mp, casterFacing });
      // 詠唱のない業（時守。フェーズ2-6）は、その場で発動する
      if (spell.instant) {
        let next = updateUnit(state, unit.id, { mp, facing: casterFacing });
        next = { ...next, turn: { ...turn, acted: true }, lastAggressionTurn: state.turnNumber, ...harmfulCast(state, unit.team, spell) };
        next = resolveSpellAt(next, unit.id, spell, center, events);
        next = runStateEvents(next, events);
        next = endIfDecided(next, events);
        if (!next.winner && !isAlive(getUnit(next, unit.id))) next = beginNextTurn({ ...next, turn: null }, events);
        return { state: next, events };
      }
      // 経験値と JP は、発動した時に入る（resolveCharge）
      const next = updateUnit(state, unit.id, {
        mp,
        facing: casterFacing,
        charging: { spellId: spell.id, target, progress: 0 },
      });
      return { state: { ...next, turn: { ...turn, acted: true }, lastAggressionTurn: state.turnNumber, ...harmfulCast(state, unit.team, spell) }, events };
    }

    case 'endTurn': {
      if (!DIRECTIONS.includes(action.facing)) throw new Error(`向き ${String(action.facing)} が不正です`);
      const ct = ctAfterTurnFor(state.rules, unit, turn.moved, turn.acted);
      events.push({ type: 'turnEnded', unitId: unit.id, facing: action.facing, ct });
      // 状態変化の持続を 1 減らす（0 になったものは消える）
      const ticked = tickStatuses(unit.statuses);
      for (const status of ticked.expired) events.push({ type: 'statusExpired', unitId: unit.id, status });
      let next: BattleState = updateUnit(state, unit.id, { facing: action.facing, ct, movedLastTurn: turn.moved });
      next = { ...setStatuses(next, unit.id, ticked.statuses), turn: null };
      return { state: beginNextTurn(next, events), events };
    }
  }
}

/** 陣営 team が今の手番で攻めたことを記録した teamAggression */
function aggressed(state: BattleState, team: Team): BattleState['teamAggression'] {
  return { ...state.teamAggression, [team]: state.turnNumber };
}

/** 害のある魔法・技（ダメージ・不利な状態変化・時送り）を使った時だけ、陣営が攻めたことを記録する */
function harmfulCast(state: BattleState, team: Team, spell: SpellDefinition): Partial<BattleState> {
  const harmful =
    spell.effect === 'damage' || spell.effect === 'delay' || (spell.effect === 'status' && state.rules.status[spell.inflicts!].harmful);
  return harmful ? { teamAggression: aggressed(state, team) } : {};
}

/** 決着していれば勝った陣営を返す（手番数の条件は除く。scenario.ts の judgeOutcome） */
export function judgeWinner(state: BattleState): Team | null {
  return judgeOutcome(state)?.winner ?? null;
}

/** 移動・攻撃・魔法の指定が、ルール上できるかを確かめる（詠唱の中断より前に確かめる） */
function validateBeforeInterrupt(state: BattleState, action: BattleAction): void {
  const turn = state.turn!;
  const unit = getUnit(state, turn.unitId);
  if (action.type === 'move') {
    if (turn.moved) throw new Error('この手番ではもう移動しています');
    if (!reachableTiles(state, unit).some((t) => t.x === action.x && t.z === action.z)) {
      throw new Error(`(${action.x}, ${action.z}) へは移動できません`);
    }
  } else if (action.type === 'attack') {
    if (turn.acted) throw new Error('この手番ではもう行動しています');
    if (!attackableTargets(state, unit, unit).some((u) => u.id === action.targetId)) {
      throw new Error(`${action.targetId} は攻撃できません`);
    }
    if (action.abilityId !== undefined) {
      const strike = strikeOf(unit, action.abilityId);
      if (!weaponFits(strike.weapons, unit.weapon)) throw new Error(`武器が合いません（${strike.id}）`);
      if ((strike.mpCost ?? 0) > unit.mp) throw new Error(`MP が足りません（${strike.id}）`);
    }
  } else if (action.type === 'cast') {
    if (turn.acted) throw new Error('この手番ではもう行動しています');
    const spell = spellOf(unit, action.spellId);
    if (!weaponFits(spell.weapons, unit.weapon)) throw new Error(`武器が合いません（${spell.id}）`);
    if (isSilencedFor(unit, spell)) throw new Error(`沈黙のため魔法を使えません（${spell.id}）`);
    if (!hasMpFor(unit, spell)) throw new Error(`MP が足りません（${spell.id}）`);
    if (!isValidSpellTarget(state, spell, unit, action.target)) throw new Error(`${spell.id} はそこを狙えません`);
  }
}

/**
 * ユニットを戦闘不能にする（倒れた姿でマスに残り、カウントが始まる）。詠唱中だった魔法は不発になり、状態変化は消える
 */
function defeat(state: BattleState, unitId: string, events: BattleEvent[]): BattleState {
  // 対象物は、戦闘不能にならずに壊れて消える（物語の土台）
  if (getUnit(state, unitId).object) {
    events.push({ type: 'objectBroken', unitId });
    return updateUnit(state, unitId, { hp: 0, retired: true });
  }
  const count = state.rules.knockout.count;
  events.push({ type: 'defeated', unitId, count });
  const unit = getUnit(state, unitId);
  const next = updateUnit(setStatuses(state, unitId, []), unitId, { knockoutCount: count, hp: 0 });
  if (!unit.charging) return next;
  events.push({ type: 'spellFizzled', casterId: unitId, spellId: unit.charging.spellId, reason: 'casterDefeated' });
  return updateUnit(next, unitId, { charging: null });
}

/** 詠唱を中断させる（詠唱中でなければ何もしない） */
function interruptCharge(
  state: BattleState,
  unitId: string,
  reason: 'silenced' | 'knockedBack',
  events: BattleEvent[],
): BattleState {
  const unit = getUnit(state, unitId);
  if (!unit.charging) return state;
  events.push({ type: 'castInterrupted', casterId: unitId, spellId: unit.charging.spellId, reason });
  return updateUnit(state, unitId, { charging: null });
}

/**
 * 状態変化を付ける（すでに付いていれば持続を付け直す）。沈黙が付いた時に魔法を詠唱中なら、詠唱を中断させる。
 * 装備でその状態変化を防いでいれば、付かない（防いだことを出来事に残す）
 */
function inflict(state: BattleState, unitId: string, status: StatusId, events: BattleEvent[]): BattleState {
  const unit = getUnit(state, unitId);
  // 対象物には状態変化が付かない
  if (unit.object) return state;
  const blocker = statusBlocker(unit, status);
  if (blocker) {
    events.push({ type: 'statusBlocked', unitId, status, itemId: blocker.id });
    return state;
  }
  const statuses = addStatus(unit.statuses, status, state.rules);
  events.push({ type: 'statusAdded', unitId, status, turns: state.rules.status[status].turns });
  const next = setStatuses(state, unitId, statuses);
  if (status === 'silence' && unit.charging && spellOf(unit, unit.charging.spellId).kind === 'magic') {
    return interruptCharge(next, unitId, 'silenced', events);
  }
  return next;
}

/** ダメージを受けて生き残ったユニットの「瞑想」（MP を回復する。最大 MP まで）と「危機の加速」（フェーズ2-6） */
function meditate(state: BattleState, unitId: string, events: BattleEvent[]): BattleState {
  return criticalHaste(meditateOnly(state, unitId, events), unitId, events);
}

/** 危機の加速: HP が最大 HP の 1/divisor 以下になったら、自分に加速が付く（すでに付いていれば何もしない） */
function criticalHaste(state: BattleState, unitId: string, events: BattleEvent[]): BattleState {
  const unit = getUnit(state, unitId);
  const effect = passiveEffect(unit, 'criticalHaste');
  if (!effect || !isAlive(unit) || hasStatus(unit, 'haste') || unit.hp * effect.divisor > unit.stats.maxHp) return state;
  events.push({ type: 'reaction', unitId, abilityId: passiveIdOf(unit, 'criticalHaste')! });
  return inflict(state, unitId, 'haste', events);
}

function meditateOnly(state: BattleState, unitId: string, events: BattleEvent[]): BattleState {
  const unit = getUnit(state, unitId);
  const effect = passiveEffect(unit, 'meditate');
  if (!effect || !isAlive(unit)) return state;
  const amount = Math.max(0, Math.min(effect.mp, unit.stats.maxMp - unit.mp));
  events.push({ type: 'reaction', unitId, abilityId: passiveIdOf(unit, 'meditate')! });
  if (amount === 0) return state;
  const mp = unit.mp + amount;
  events.push({ type: 'mpRestored', unitId, amount, mp });
  return updateUnit(state, unitId, { mp });
}

/**
 * 武器による攻撃（通常攻撃・技・反撃）を1回行う。命中の判定に乱数を1回使う。
 * 当たった後: ダメージ → 突き飛ばし → 状態変化 → 瞑想 → 反撃（反撃に対する反撃は起きない）。
 * 外れた時、相手の「身かわし」が効いていれば、その名前を出す。
 */
function resolveWeaponAttack(
  state: BattleState,
  attackerId: string,
  targetId: string,
  strike: StrikeDefinition | undefined,
  isCounter: boolean,
  events: BattleEvent[],
): BattleState {
  const attacker = getUnit(state, attackerId);
  const preview = previewAttack(state, attacker, getUnit(state, targetId), attacker, strike, { counter: isCounter });
  // かばう: 隣の味方が代わりに受ける（フェーズ2-6）
  if (preview.coveredBy) {
    events.push({ type: 'reaction', unitId: preview.coveredBy, abilityId: passiveIdOf(getUnit(state, preview.coveredBy), 'cover') ?? '' });
    targetId = preview.coveredBy;
  }
  const target = getUnit(state, targetId);
  const rng = restoreRng(state.rngState);
  const hit = rng.nextInt(1, 100) <= preview.hitPercent;
  const damage = hit ? Math.min(preview.damage, target.hp) : 0;
  const targetHp = target.hp - damage;
  events.push({
    type: 'attacked',
    attackerId,
    targetId,
    abilityId: strike?.id ?? null,
    attackerFacing: preview.attackerFacing,
    side: preview.side,
    hitPercent: preview.hitPercent,
    heightPercent: preview.heightPercent,
    hit,
    damage,
    targetHp,
    chargingPercent: preview.chargingPercent,
    counter: isCounter,
  });
  let next = updateUnit(state, attackerId, { facing: preview.attackerFacing });
  next = { ...updateUnit(next, targetId, { hp: targetHp }), rngState: rng.getState() };
  if (hit && preview.endures) next = markEndured(next, targetId, events);
  if (hit) next = tallyHit(next, attacker, targetId, preview.side, events);
  if (!hit) {
    if (preview.evadePenalty > 0) events.push({ type: 'reaction', unitId: targetId, abilityId: passiveIdOf(target, 'evade')! });
    return next;
  }
  if (targetHp === 0) return defeat(next, targetId, events);

  // 突き飛ばし: 詠唱を中断させ、1マス押し出す（押し出せなければ、その場で追加のダメージ）
  if (strike?.knockback && manhattan(attacker, target) === 1 && !target.object) {
    next = interruptCharge(next, targetId, 'knockedBack', events);
    const t = getUnit(next, targetId);
    const kb = knockbackOutcome(next, attackerId, attacker, t);
    const kbHit = enduredDamage(t, kb.damage);
    const kbDamage = kbHit.damage;
    const hp = t.hp - kbDamage;
    events.push({ type: 'knockedBack', unitId: targetId, from: { x: t.x, z: t.z }, to: kb.to, damage: kbDamage, hp });
    next = updateUnit(next, targetId, kb.to ? { x: kb.to.x, z: kb.to.z, hp } : { hp });
    if (kbHit.endured) next = markEndured(next, targetId, events);
    if (hp === 0) return defeat(next, targetId, events);
    // 押し出された先の罠と「マスに入る」のイベント
    if (kb.to) {
      next = arrive(next, targetId, events);
      if (!isAlive(getUnit(next, targetId))) return next;
    }
  }
  if (strike?.inflicts) next = inflict(next, targetId, strike.inflicts, events);
  next = meditate(next, targetId, events);
  // 逃げ足: 生き残ったら、攻撃した相手から1マス離れる（離れられるマスがなければ発動しない）
  if (!isCounter) next = flee(next, targetId, attackerId, events);

  // 反撃: 隣接するマスからの近接攻撃を受けて生き残り、まだ隣にいて、通常攻撃が届くなら
  if (!isCounter) {
    const counterer = getUnit(next, targetId);
    const self = getUnit(next, attackerId);
    const counterId = passiveIdOf(counterer, 'counter');
    const adjacentBefore = manhattan(attacker, target) === 1;
    if (
      counterId &&
      adjacentBefore &&
      isAlive(counterer) &&
      isAlive(self) &&
      manhattan(counterer, self) === 1 &&
      canReach(next.map, counterer.attack, counterer, self)
    ) {
      events.push({ type: 'reaction', unitId: targetId, abilityId: counterId });
      next = resolveWeaponAttack(next, targetId, attackerId, counterStrike(counterer), true, events);
    }
  }
  return next;
}

/**
 * 逃げ足（フェーズ2-6）: unitId が、攻撃した fromId から1マス離れる。離れる向きは、攻撃側から自分への向き（縦横の差の大きい方）。
 * マップの外・ほかのユニット（戦闘不能を含む）がいる・ジャンプ力で進めない段差なら、発動しない
 */
function flee(state: BattleState, unitId: string, fromId: string, events: BattleEvent[]): BattleState {
  const unit = getUnit(state, unitId);
  const id = passiveIdOf(unit, 'flee');
  if (!id || !isAlive(unit)) return state;
  const from = getUnit(state, fromId);
  const dx = unit.x - from.x;
  const dz = unit.z - from.z;
  const step = Math.abs(dx) >= Math.abs(dz) ? { x: Math.sign(dx), z: 0 } : { x: 0, z: Math.sign(dz) };
  const to = { x: unit.x + step.x, z: unit.z + step.z };
  if (!getTile(state.map, to.x, to.z) || state.units.some((u) => isOnMap(u) && u.x === to.x && u.z === to.z)) return state;
  if (!canStep(state, unit, to, unit.stats.jump)) return state;
  events.push({ type: 'reaction', unitId, abilityId: id });
  events.push({ type: 'fled', unitId, from: { x: unit.x, z: unit.z }, to });
  return arrive(updateUnit(state, unitId, { x: to.x, z: to.z }), unitId, events);
}

/**
 * 盗む（フェーズ2-6）。成功を乱数で1回判定する。ゴールドは味方が盗んだ時だけ戦闘の後に部隊へ入る。
 * 装備を盗むと、相手はその装備を失い（能力値が下がる。武器なら素手になる）、味方が盗んだ物は戦闘の後に所持品に加わる
 */
function resolveSteal(state: BattleState, thiefId: string, targetId: string, strike: StrikeDefinition, events: BattleEvent[]): BattleState {
  const thief = getUnit(state, thiefId);
  const target = getUnit(state, targetId);
  const p = previewAttack(state, thief, target, thief, strike);
  const rng = restoreRng(state.rngState);
  const success = rng.nextInt(1, 100) <= p.hitPercent;
  let next: BattleState = { ...updateUnit(state, thiefId, { facing: p.attackerFacing }), rngState: rng.getState() };
  const kind = strike.steal!;
  const mine = thief.team === 'player';
  // 対象物からは盗めない（物語の土台）
  if (target.object) {
    events.push({ type: 'stole', thiefId, targetId, kind, success: false, percent: 0 });
    return next;
  }
  const stolen = next.stolen ?? { gold: 0, items: [] };
  if (!success) {
    events.push({ type: 'stole', thiefId, targetId, kind, success: false, percent: p.hitPercent });
    return next;
  }
  if (kind === 'gold') {
    const steal = state.rules.steal!;
    const gold = steal.goldBase + steal.goldPerLevel * target.level;
    events.push({ type: 'stole', thiefId, targetId, kind, success: true, percent: p.hitPercent, gold });
    return mine ? { ...next, stolen: { ...stolen, gold: stolen.gold + gold } } : next;
  }
  const itemId = p.stealItemId!;
  events.push({ type: 'stole', thiefId, targetId, kind, success: true, percent: p.hitPercent, itemId });
  next = loseItem(next, targetId, itemId);
  return mine ? { ...next, stolen: { ...stolen, items: [...stolen.items, itemId] } } : next;
}

/** 戦闘中に装備を失う（盗まれた）。能力値から装備の値を引き、武器なら素手になる */
function loseItem(state: BattleState, unitId: string, itemId: string): BattleState {
  const u = getUnit(state, unitId);
  const index = u.equipment.findIndex((e) => e.id === itemId);
  if (index < 0) return state;
  const item = u.equipment[index]!;
  const statBonus: Record<string, number> = { ...u.statBonus };
  for (const key of Object.keys(item.stats) as (keyof UnitStats)[]) statBonus[key] = (statBonus[key] ?? 0) - (item.stats[key] ?? 0);
  const equipment = u.equipment.filter((_, i) => i !== index);
  const weaponLost = item.slot === 'weapon';
  const patched: UnitState = {
    ...u,
    equipment,
    statBonus,
    ...(weaponLost ? { weapon: null, attack: state.rules.unarmedAttack } : {}),
  };
  const stats = currentStats(patched, state.rules);
  return updateUnit(state, unitId, { ...patched, stats, hp: Math.min(u.hp, stats.maxHp), mp: Math.min(u.mp, stats.maxMp) });
}

/** 支援の魔法（回復・味方に有利な状態変化）か。経験値の元の量が変わる */
function isSupportive(state: BattleState, spell: SpellDefinition): boolean {
  return (
    spell.effect === 'heal' ||
    spell.effect === 'revive' ||
    spell.effect === 'rewind' ||
    spell.effect === 'swap' ||
    spell.effect === 'cleanse' ||
    spell.effect === 'quicken' ||
    (spell.effect === 'status' && !state.rules.status[spell.inflicts!].harmful)
  );
}

/**
 * 行動の経験値と JP を、その場で与える（部隊のユニットだけ。敵や、進み具合を持たないユニットには、行動の回数を数えるだけ）。
 * targetLevel は相手（範囲なら、意図した側のうち効果が届いた中で最もレベルの高いユニット）のレベル。
 * null なら、意図した側に効果が届かなかった（経験値は最低の 1。JP はいつもどおり）。
 */
function grantProgress(
  state: BattleState,
  unitId: string,
  targetLevel: number | null,
  supportive: boolean,
  events: BattleEvent[],
): BattleState {
  const rules = state.progression;
  const unit = getUnit(state, unitId);
  // 行動の回数は、敵も含めて数える（バランス確認の集計用）
  const counted = updateUnit(state, unitId, { actionCount: unit.actionCount + 1 });
  if (!rules || !unit.progress) return counted;
  const exp = targetLevel === null ? 1 : actionExp(supportive, unit.level, targetLevel, rules);
  const jp = rules.jpPerAction;
  events.push({ type: 'progressGained', unitId, exp, jp });
  const p = unit.progress;
  let next = updateUnit(counted, unitId, {
    progress: { ...p, exp: p.exp + exp, jp: p.jp + jp, jpTotal: p.jpTotal + jp, gainedExp: p.gainedExp + exp, gainedJp: p.gainedJp + jp },
  });
  // ジョブのレベル（JP の累計で決まる）
  const jobFrom = jobLevelFromJp(p.jpTotal, rules);
  const jobTo = jobLevelFromJp(p.jpTotal + jp, rules);
  if (jobTo > jobFrom) events.push({ type: 'jobLeveledUp', unitId, jobId: unit.jobId, from: jobFrom, to: jobTo });
  // ジョブのレベルが上限に届き、アビリティもすべて習得済みなら、マスターになる（成長の上限が増える）
  if (p.masteryPending && jobTo > jobFrom && jobTo >= rules.jobLevelJp.length + 1) {
    events.push({ type: 'jobMastered', unitId, jobId: unit.jobId });
    const q = getUnit(next, unitId).progress!;
    next = updateUnit(next, unitId, {
      progress: {
        ...q,
        masteryPending: false,
        growthTotalCap: q.growthTotalCap + Math.floor((rules.growthTotalCap * rules.masteryGrowthCapPercent) / 100),
      },
    });
  }
  // 経験値が貯まったら、その場でレベルを上げる（何度でも）
  for (;;) {
    const u = getUnit(next, unitId);
    const progress = u.progress!;
    if (u.level >= rules.maxLevel) {
      if (progress.exp !== 0) next = updateUnit(next, unitId, { progress: { ...progress, exp: 0 } });
      break;
    }
    const need = expToNext(u.level, rules);
    if (progress.exp < need) break;
    const growth = addGrowth(u.growth, u.growthRates, rules, progress.growthTotalCap);
    const stats = currentStats(u, state.rules, growth);
    // 最大 HP・MP が増えた分だけ、今の HP・MP も増やす（倒れているユニットは起き上がらない）
    const alive = isAlive(u);
    const hp = alive ? Math.max(0, u.hp + stats.maxHp - u.stats.maxHp) : 0;
    const mp = Math.max(0, Math.min(stats.maxMp, u.mp + Math.max(0, stats.maxMp - u.stats.maxMp)));
    events.push({ type: 'leveledUp', unitId, from: u.level, to: u.level + 1, stats, hp, mp });
    next = updateUnit(next, unitId, {
      level: u.level + 1,
      growth,
      stats,
      hp,
      mp,
      progress: { ...progress, exp: progress.exp - need },
    });
  }
  return next;
}

/** 決着していれば、勝敗を記録して手番をなくす */
function endIfDecided(state: BattleState, events: BattleEvent[]): BattleState {
  if (state.winner) return state;
  return decide(state, judgeOutcome(state), events);
}

function decide(state: BattleState, outcome: Outcome | null, events: BattleEvent[]): BattleState {
  if (!outcome) return state;
  events.push({ type: 'battleEnded', winner: outcome.winner, reason: outcome.reason });
  return { ...state, winner: outcome.winner, turn: null };
}

// ---- マップ上のイベント・罠・増援 ----

/** ユニットがマスに入った（移動か突き飛ばし）: そのマスの罠 →「マスに入る」のきっかけのイベント */
function arrive(state: BattleState, unitId: string, events: BattleEvent[]): BattleState {
  let next = state;
  const unit = getUnit(next, unitId);
  const trap = trapAt(next, unit);
  if (trap) {
    const revealed = !trap.revealed;
    if (revealed) {
      next = {
        ...next,
        scenario: {
          ...next.scenario,
          traps: next.scenario.traps.map((t) => (t === trap ? { ...t, revealed: true } : t)),
        },
      };
    }
    next = springTrap(next, unitId, trap.kind, unit, revealed, events);
  }
  const mover = getUnit(next, unitId);
  const at = { x: unit.x, z: unit.z };
  for (let i = 0; i < next.scenario.events.length; i++) {
    if (enterTriggerDue(next.scenario.events[i]!, mover, at)) next = fireEvent(next, i, events);
  }
  return next;
}

/**
 * 罠の効果を与える。unitId のユニットが c にいる（イベントの罠でマスに誰もいなければ null）。
 * 落石はダメージ、ぬかるみは鈍足、脱力の罠はレベルが 1 下がる（1 より下にはならない）。
 */
function springTrap(
  state: BattleState,
  unitId: string | null,
  kind: TrapKind,
  c: Coord,
  revealed: boolean,
  events: BattleEvent[],
): BattleState {
  const base = { type: 'trapTriggered' as const, trap: kind, x: c.x, z: c.z, revealed };
  if (unitId === null) {
    events.push({ ...base, unitId: null, damage: 0, hp: 0 });
    return state;
  }
  const unit = getUnit(state, unitId);
  if (kind === 'rockfall') {
    const raw = Math.floor((unit.stats.maxHp * state.rules.trap.rockfallDamagePercent) / 100);
    const taken = enduredDamage(unit, damageTaken(state.rules, unit, raw, { ignoreCharging: true }));
    const damage = taken.damage;
    const hp = unit.hp - damage;
    events.push({ ...base, unitId, damage, hp });
    let next = updateUnit(state, unitId, { hp });
    if (taken.endured) next = markEndured(next, unitId, events);
    return hp === 0 ? defeat(next, unitId, events) : next;
  }
  if (kind === 'mud') {
    events.push({ ...base, unitId, damage: 0, hp: unit.hp });
    return inflict(state, unitId, 'slow', events);
  }
  // 脱力の罠: その場でレベルが 1 下がる（今のジョブの成長率ぶん成長値が減り、貯まっていた経験値は 0 に戻る。戦闘の後も戻らない）。
  // 最大 HP・MP が減ったら、今の HP・MP は最大を超えないように抑える
  const from = unit.level;
  if (from <= 1) {
    events.push({ ...base, unitId, damage: 0, hp: unit.hp, level: { from, to: from } });
    return state;
  }
  const growth = subtractGrowth(unit.growth, unit.growthRates);
  const stats = currentStats(unit, state.rules, growth);
  const hp = Math.min(unit.hp, stats.maxHp);
  events.push({ ...base, unitId, damage: 0, hp, level: { from, to: from - 1 } });
  return updateUnit(state, unitId, {
    level: from - 1,
    levelDrops: unit.levelDrops + 1,
    growth,
    stats,
    hp,
    mp: Math.min(unit.mp, stats.maxMp),
    progress: unit.progress ? { ...unit.progress, exp: 0 } : null,
  });
}

/** イベントを起こす（起きた回数を数え、起きることを順に処理する） */
function fireEvent(state: BattleState, index: number, events: BattleEvent[]): BattleState {
  const event = state.scenario.events[index]!;
  const fired = event.fired + 1;
  let next: BattleState = {
    ...state,
    scenario: { ...state.scenario, events: state.scenario.events.map((e, i) => (i === index ? { ...e, fired } : e)) },
  };
  events.push({ type: 'eventFired', eventId: event.id });
  for (const effect of event.effects) {
    if (effect.kind === 'dialogue') {
      events.push({ type: 'dialogue', scriptId: effect.scriptId });
    } else if (effect.kind === 'terrain') {
      next = changeTerrain(next, effect.tiles, events);
    } else if (effect.kind === 'trap') {
      for (const t of effect.tiles) {
        const occupant = unitAt(next, t.x, t.z);
        next = springTrap(next, occupant?.id ?? null, effect.trap, t, false, events);
      }
    } else {
      // 増援: delay 手番後に現れる。繰り返すイベントでは、id に何回目かを付ける
      const suffix = event.times > 1 ? `-${fired}` : '';
      const pending: PendingReinforcement = {
        eventId: event.id,
        appearAfterTurn: next.turnNumber + effect.delay,
        units: effect.units.map((u) => ({ ...u, id: `${u.id}${suffix}` })),
      };
      events.push({
        type: 'reinforcementWarned',
        eventId: event.id,
        appearAfterTurn: pending.appearAfterTurn,
        tiles: pending.units.map((u) => ({ x: u.x, z: u.z })),
      });
      next = { ...next, scenario: { ...next.scenario, reinforcements: [...next.scenario.reinforcements, pending] } };
    }
  }
  return next;
}

/**
 * 味方の武器による攻撃が当たった: 数える勝利条件（hitUnit）の相手で、向きが合えば回数を 1 増やす（物語の土台）。
 * 向きを省いた条件は、正面以外（側面と背面）から当てた時だけ数える
 */
function tallyHit(state: BattleState, attacker: UnitState, targetId: string, side: RelativeSide, events: BattleEvent[]): BattleState {
  if (attacker.team !== 'player') return state;
  let next = state;
  for (const c of state.scenario.objectives.victory) {
    if (c.kind !== 'hitUnit' || c.unitId !== targetId) continue;
    if (!(c.sides ?? ['side', 'back']).includes(side)) continue;
    const count = (next.scenario.tallies?.[c.id] ?? 0) + 1;
    events.push({ type: 'tallied', id: c.id, count, times: c.times });
    next = { ...next, scenario: { ...next.scenario, tallies: { ...next.scenario.tallies, [c.id]: count } } };
  }
  return next;
}

/** 地形を変える（イベント。物語の土台）。マップの外のマスは無視する */
function changeTerrain(state: BattleState, changes: readonly TileChange[], events: BattleEvent[]): BattleState {
  const tiles = [...state.map.tiles];
  const changed: Tile[] = [];
  for (const c of changes) {
    const index = c.z * state.map.width + c.x;
    const old = getTile(state.map, c.x, c.z);
    if (!old) continue;
    if (c.height !== undefined && (!Number.isInteger(c.height) || c.height < 0)) throw new Error(`地形の変化 (${c.x}, ${c.z}) の高さが不正です`);
    const tile: Tile = { ...old, height: c.height ?? old.height, terrain: c.terrain ?? old.terrain };
    tiles[index] = tile;
    changed.push(tile);
  }
  events.push({ type: 'terrainChanged', tiles: changed });
  return { ...state, map: { ...state.map, tiles } };
}

/** 状態で決まるきっかけ（HP が一定以下・撃破）のイベントを、起きなくなるまで起こす */
function runStateEvents(state: BattleState, events: BattleEvent[]): BattleState {
  let next = state;
  for (let guard = 0; guard < 100; guard++) {
    const index = next.scenario.events.findIndex((e) => stateTriggerDue(e, next));
    if (index < 0) return next;
    next = fireEvent(next, index, events);
  }
  return next;
}

/**
 * 手番の区切り（state.turnNumber 回の手番が終わった時点）の処理:
 * 手番数の勝敗条件 →「手番」のきっかけのイベント → 予告済みの増援の出現 → 状態で決まるきっかけ → 勝敗。
 */
function turnBoundary(state: BattleState, events: BattleEvent[]): BattleState {
  const finished = state.turnNumber;
  // この手番の中でダメージ・回復・状態変化の付与が起きていれば、膠着の数え直し
  const active = events.some(isActivity);
  let next: BattleState = active ? { ...state, lastActivityTurn: finished } : state;
  next = decide(next, judgeTurnOutcome(state.scenario.objectives, finished), events);
  if (next.winner) return next;
  // 膠着（フェーズ2-6）: 手番数の勝敗条件がある戦闘では、そちらを優先する（judgeStalemate が null を返す）
  next = decide(next, judgeStalemate(next, finished), events);
  if (next.winner) return next;
  for (let i = 0; i < next.scenario.events.length; i++) {
    if (turnTriggerDue(next.scenario.events[i]!, finished)) next = fireEvent(next, i, events);
  }
  const due = next.scenario.reinforcements.filter((r) => r.appearAfterTurn <= finished);
  if (due.length > 0) {
    next = { ...next, scenario: { ...next.scenario, reinforcements: next.scenario.reinforcements.filter((r) => !due.includes(r)) } };
    for (const r of due) next = spawn(next, r, events);
  }
  next = runStateEvents(next, events);
  return endIfDecided(next, events);
}

/** 増援を出す。予定のマスにユニットがいれば、近くの空いたマスに出す（空いたマスがなければ出さない） */
function spawn(state: BattleState, reinforcement: PendingReinforcement, events: BattleEvent[]): BattleState {
  let next = state;
  for (const template of reinforcement.units) {
    if (next.units.some((u) => u.id === template.id)) throw new Error(`増援の id ${template.id} が重複しています`);
    const tile = spawnTile(next, template);
    if (!tile) continue;
    const unit: UnitState = { ...template, x: tile.x, z: tile.z, ct: 0 };
    next = { ...next, units: [...next.units, unit] };
    events.push({ type: 'unitAppeared', unit });
  }
  return next;
}

/** 詠唱が満ちた魔法を発動する */
function resolveCharge(state: BattleState, casterId: string, events: BattleEvent[]): BattleState {
  const caster = getUnit(state, casterId);
  const charge = caster.charging!;
  const spell = spellOf(caster, charge.spellId);
  // 詠唱は終わったので、発動の計算では詠唱者を詠唱中として扱わない
  const next = updateUnit(state, casterId, { charging: null });
  const center = targetCenter(next, charge.target);
  // 狙ったユニットが倒れていても、倒れたマスを中心に発動する（不発にはしない）
  if (!center) throw new Error(`魔法の狙い先がありません（${spell.id}）`);
  return resolveSpellAt(next, casterId, spell, center, events);
}

/** 魔法・業を center に発動する（詠唱が満ちた時と、詠唱のない業を指定した時） */
function resolveSpellAt(state: BattleState, casterId: string, spell: SpellDefinition, center: Coord, events: BattleEvent[]): BattleState {
  let next = state;
  const caster = getUnit(next, casterId);
  const preview = previewSpellAt(next, caster, spell, center);
  events.push({
    type: 'spellResolved',
    casterId,
    spellId: spell.id,
    element: spell.element,
    effect: spell.effect,
    center,
    tiles: preview.tiles,
    results: preview.results,
  });
  // 経験値と JP（フェーズ2-4 で変更。PR #11 の回答）: 意図した側（攻撃なら敵、回復・補助なら味方）のうち、
  // 効果が届いた中で最もレベルの高いユニットで計算する。届いたユニットの中に意図した側が1体もいなければ、経験値は最低の 1。
  // 誰にも届かなければ入らない
  const supportive = isSupportive(next, spell);
  const intended = preview.results
    .map((r) => getUnit(next, r.unitId))
    .filter((u) => (supportive ? u.team === caster.team : u.team !== caster.team));
  const targetLevel = intended.length > 0 ? Math.max(...intended.map((u) => u.level)) : null;
  const grant = (s: BattleState) =>
    preview.results.length > 0 ? grantProgress(s, casterId, targetLevel, supportive, events) : s;
  if (spell.effect === 'status') {
    for (const r of preview.results) next = inflict(next, r.unitId, spell.inflicts!, events);
    return grant(next);
  }
  // 喝: 状態変化をすべて解く（フェーズ2-6）
  if (spell.effect === 'cleanse') {
    for (const r of preview.results) {
      const u = getUnit(next, r.unitId);
      if (u.statuses.length === 0) continue;
      events.push({ type: 'statusCleared', unitId: u.id, statuses: u.statuses.map((x) => x.id) });
      next = setStatuses(next, u.id, []);
    }
    return grant(next);
  }
  // 引き戻し: 最後に手番が始まった時の HP に戻す（今の方が高ければ何もしない）
  if (spell.effect === 'rewind') {
    for (const r of preview.results) next = updateUnit(next, r.unitId, { hp: r.hp });
    return grant(next);
  }
  // 早送り（フェーズ2-6）: 味方の CT を満たし、すぐに行動させる
  if (spell.effect === 'quicken') {
    for (const r of preview.results) next = updateUnit(next, r.unitId, { ct: Math.max(getUnit(next, r.unitId).ct, next.rules.ctThreshold) });
    return grant(next);
  }
  // 時送り: 相手の CT を減らす（次の行動が遅れる）
  if (spell.effect === 'delay') {
    for (const r of preview.results) next = updateUnit(next, r.unitId, { ct: getUnit(next, r.unitId).ct - r.amount });
    return grant(next);
  }
  // 門渡り: 味方と位置を入れ替える。入れ替わった先の罠と「マスに入る」のイベントは、使ったユニット → 相手の順
  if (spell.effect === 'swap') {
    for (const r of preview.results) {
      const self = getUnit(next, casterId);
      const other = getUnit(next, r.unitId);
      const aTo = { x: other.x, z: other.z };
      const bTo = { x: self.x, z: self.z };
      events.push({ type: 'swapped', a: casterId, b: other.id, aTo, bTo });
      next = updateUnit(updateUnit(next, casterId, aTo), other.id, bTo);
      // 手番の中で後から移動を取り消しても、入れ替わった後の位置から動かないように、戻す先を入れ替わった先にする
      if (next.turn?.unitId === casterId) {
        next = { ...next, turn: { ...next.turn, origin: { ...aTo, facing: self.facing } } };
      }
      next = arrive(next, casterId, events);
      if (isAlive(getUnit(next, other.id))) next = arrive(next, other.id, events);
    }
    return grant(next);
  }
  // 蘇生: 戦闘不能のユニットを、決まった HP で復帰させる（CT は 0。退場していたら効かない）
  if (spell.effect === 'revive') {
    for (const r of preview.results) {
      events.push({ type: 'revived', unitId: r.unitId, hp: r.hp });
      next = updateUnit(next, r.unitId, { hp: r.hp, ct: 0, knockoutCount: 0 });
    }
    return grant(next);
  }
  for (const r of preview.results) next = updateUnit(next, r.unitId, { hp: r.hp });
  for (const r of preview.results) {
    const u = getUnit(next, r.unitId);
    if (spell.effect !== 'damage') continue;
    // 魔力の殻で軽くなった時は、その名前を出す
    const shell = spell.kind === 'magic' ? passiveIdOf(u, 'magicShell') : undefined;
    if (shell) events.push({ type: 'reaction', unitId: u.id, abilityId: shell });
    if (r.endured) next = markEndured(next, r.unitId, events);
    if (r.hp === 0) next = defeat(next, r.unitId, events);
    else if (r.amount > 0) next = meditate(next, r.unitId, events);
  }
  return grant(next);
}

/** 時計を進め、途中で発動する魔法を発動しながら、次の手番を始める。途中で決着したらそこで止める */
function beginNextTurn(state: BattleState, events: BattleEvent[]): BattleState {
  let current = turnBoundary(state, events);
  if (current.winner) return current;
  for (;;) {
    const { units, entry } = nextTimelineEntry(current.units, current.rules);
    current = { ...current, units };
    if (entry.kind === 'spell') {
      current = endIfDecided(runStateEvents(resolveCharge(current, entry.casterId, events), events), events);
      if (current.winner) return current;
      continue;
    }
    if (entry.kind === 'knockout') {
      current = countKnockout(current, entry.unitId, events);
      continue;
    }
    const unit = getUnit(current, entry.unitId);
    // 停止（フェーズ2-6）: 手番は何もできずに過ぎる（手番の数には数えない）。状態変化の持続はふつうの手番と同じく 1 減る
    if (hasStatus(unit, 'stop')) {
      const ct = current.rules.status.stop.ctAfterSkip;
      events.push({ type: 'turnSkipped', unitId: unit.id, ct });
      const ticked = tickStatuses(unit.statuses);
      for (const status of ticked.expired) events.push({ type: 'statusExpired', unitId: unit.id, status });
      current = setStatuses(updateUnit(current, unit.id, { ct, movedLastTurn: false }), unit.id, ticked.statuses);
      continue;
    }
    // 引き戻しで戻す値として、手番が始まった時の HP を覚えておく
    current = updateUnit(current, unit.id, { turnStartHp: unit.hp });
    const turn: TurnState = {
      unitId: unit.id,
      moved: false,
      acted: false,
      origin: { x: unit.x, z: unit.z, facing: unit.facing },
      chargingAtStart: unit.charging !== null,
    };
    const turnNumber = current.turnNumber + 1;
    events.push({ type: 'turnStarted', unitId: unit.id, turnNumber });
    return { ...current, turn, turnNumber };
  }
}

/** 戦闘不能のユニットの手番が来るはずだった時: カウントを 1 減らす。0 になれば退場する */
function countKnockout(state: BattleState, unitId: string, events: BattleEvent[]): BattleState {
  const unit = getUnit(state, unitId);
  const count = Math.max(0, unit.knockoutCount - 1);
  const ct = state.rules.knockout.ctAfterTick;
  if (count > 0) {
    events.push({ type: 'knockoutCounted', unitId, count });
    return updateUnit(state, unitId, { knockoutCount: count, ct });
  }
  events.push({ type: 'knockoutCounted', unitId, count: 0 });
  events.push({ type: 'retired', unitId });
  return updateUnit(state, unitId, { knockoutCount: 0, ct, retired: true, charging: null });
}

function updateUnit(state: BattleState, id: string, patch: Partial<UnitState>): BattleState {
  return { ...state, units: state.units.map((u) => (u.id === id ? { ...u, ...patch } : u)) };
}
