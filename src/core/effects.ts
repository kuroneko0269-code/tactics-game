/**
 * 状態変化（守り・鈍足・沈黙）と、受動的なアビリティ（リアクション・サポート・ムーブ）の効果。
 *
 * 状態変化:
 * - 持続は「そのユニットの手番の回数」で数える。付いた後、そのユニットの手番が終わるたびに 1 減り、0 で消える
 *   （例: 2手番の鈍足は、付いた後のそのユニットの手番 2 回ぶん効く）。
 * - 同じ効果を重ねて付けた時は、持続を付け直すだけで、効果は重ならない。
 * - 守り: 受けるダメージが減る。鈍足: 移動力が下がる（下限あり）。沈黙: 魔法を使えない（溜めのある技は使える）。
 *
 * 受動的なアビリティ:
 * - 最大 HP・移動力・ジャンプ力を変えるもの（重装・早足・身軽）は、戦闘の開始時に能力値へ反映する。
 * - それ以外（反撃・身かわし・魔力の殻・瞑想・集中・早口・節約）は、その場面の計算で効く。
 *
 * 装備の効果（フェーズ2-4。主に装飾品）:
 * - 状態変化を防ぐ（その状態変化が付かない）。
 * - 詠唱中に受けるダメージの増加を打ち消す。
 *
 * 数値は src/data から受け取る（BattleRules.status と、受動的なアビリティ・装備の定義）。計算はすべて整数で、端数は切り捨て。
 */
import type {
  BattleRules,
  EquipmentDefinition,
  EquipmentEffect,
  PassiveDefinition,
  PassiveEffect,
  SpellDefinition,
  StatusId,
  StatusState,
  UnitState,
  UnitStats,
} from './battleTypes';

/** 状態変化の並び（表示や処理は、いつもこの順で行う） */
export const STATUS_IDS: readonly StatusId[] = ['protect', 'slow', 'silence'];

/** 付いている状態変化の残りの手番数（付いていなければ 0） */
export function statusTurns(unit: Pick<UnitState, 'statuses'>, id: StatusId): number {
  return unit.statuses.find((s) => s.id === id)?.turns ?? 0;
}

export function hasStatus(unit: Pick<UnitState, 'statuses'>, id: StatusId): boolean {
  return statusTurns(unit, id) > 0;
}

/** 状態変化を付けた後の一覧。すでに付いていれば、持続を付け直すだけ（効果は重ならない） */
export function addStatus(statuses: readonly StatusState[], id: StatusId, rules: BattleRules): StatusState[] {
  const turns = rules.status[id].turns;
  const rest = statuses.filter((s) => s.id !== id);
  return sortStatuses([...rest, { id, turns }]);
}

/** 手番が終わった時に、持続を 1 減らす。0 になったものは消して、expired に入れる */
export function tickStatuses(statuses: readonly StatusState[]): { statuses: StatusState[]; expired: StatusId[] } {
  const next: StatusState[] = [];
  const expired: StatusId[] = [];
  for (const s of statuses) {
    if (s.turns <= 1) expired.push(s.id);
    else next.push({ id: s.id, turns: s.turns - 1 });
  }
  return { statuses: next, expired };
}

function sortStatuses(statuses: StatusState[]): StatusState[] {
  return statuses.sort((a, b) => STATUS_IDS.indexOf(a.id) - STATUS_IDS.indexOf(b.id));
}

/** ユニットが付けている受動的なアビリティのうち、効果の種類が kind のもの（なければ undefined） */
export function passiveEffect<K extends PassiveEffect['kind']>(
  unit: Pick<UnitState, 'passives'>,
  kind: K,
): Extract<PassiveEffect, { kind: K }> | undefined {
  const found = unit.passives.find((p) => p.effect.kind === kind);
  return found?.effect as Extract<PassiveEffect, { kind: K }> | undefined;
}

/** 効果の種類が kind の受動的なアビリティの id（画面で名前を出すため。なければ undefined） */
export function passiveIdOf(unit: Pick<UnitState, 'passives'>, kind: PassiveEffect['kind']): string | undefined {
  return unit.passives.find((p) => p.effect.kind === kind)?.id;
}

/** 装備の特別な効果のうち、種類が kind のものを持つ装備（なければ undefined） */
export function equipmentWithEffect(
  unit: { readonly equipment?: readonly EquipmentDefinition[] },
  match: (e: EquipmentEffect) => boolean,
): EquipmentDefinition | undefined {
  return (unit.equipment ?? []).find((item) => (item.effects ?? []).some(match));
}

/** 装備でその状態変化を防ぐ時は、防いだ装備（なければ undefined） */
export function statusBlocker(
  unit: { readonly equipment?: readonly EquipmentDefinition[] },
  status: StatusId,
): EquipmentDefinition | undefined {
  return equipmentWithEffect(unit, (e) => e.kind === 'statusImmunity' && e.status === status);
}

/** 詠唱中のユニットが受けるダメージの倍率（%）。詠唱中でない時と、装備で打ち消している時は 100 */
export function chargingPercentOf(
  rules: BattleRules,
  target: Pick<UnitState, 'charging'> & { readonly equipment?: readonly EquipmentDefinition[] },
): number {
  if (!target.charging) return 100;
  if (equipmentWithEffect(target, (e) => e.kind === 'steadyCasting')) return 100;
  return rules.chargingDamagePercent;
}

/** 戦闘の開始時の能力値に、受動的なアビリティ（重装・早足・身軽）を反映する */
export function applyPassiveStats(stats: UnitStats, passives: readonly PassiveDefinition[]): UnitStats {
  let result = stats;
  for (const p of passives) {
    const e = p.effect;
    if (e.kind === 'maxHpPercent') result = { ...result, maxHp: Math.floor((result.maxHp * e.percent) / 100) };
    else if (e.kind === 'moveBonus') result = { ...result, move: result.move + e.amount };
    else if (e.kind === 'jumpBonus') result = { ...result, jump: result.jump + e.amount };
  }
  return result;
}

/** 今の移動力（鈍足なら下がる。下限あり） */
export function effectiveMove(unit: Pick<UnitState, 'stats' | 'statuses'>, rules: BattleRules): number {
  if (!hasStatus(unit, 'slow')) return unit.stats.move;
  const slow = rules.status.slow;
  return Math.max(Math.min(slow.minMove, unit.stats.move), unit.stats.move - slow.movePenalty);
}

/** 沈黙で使えない魔法か */
export function isSilencedFor(unit: Pick<UnitState, 'statuses'>, spell: SpellDefinition): boolean {
  return spell.kind === 'magic' && hasStatus(unit, 'silence');
}

/** 消費 MP（節約なら減る。切り捨て） */
export function mpCostOf(unit: Pick<UnitState, 'passives'>, spell: SpellDefinition): number {
  const thrift = passiveEffect(unit, 'mpCostPercent');
  return thrift ? Math.floor((spell.mpCost * thrift.percent) / 100) : spell.mpCost;
}

/** 詠唱の速さ（早口なら速くなる。切り捨て） */
export function castSpeedOf(unit: Pick<UnitState, 'passives'>, spell: SpellDefinition): number {
  const quick = passiveEffect(unit, 'castSpeedPercent');
  return quick ? Math.floor((spell.castSpeed * quick.percent) / 100) : spell.castSpeed;
}

/**
 * 受けるダメージの最終的な値。元のダメージに、詠唱中の倍率（装備で打ち消せる） → 守り → 魔力の殻（魔法の時だけ）の順に掛けて、
 * そのたびに切り捨てる。最後に最小値（rules.minimumDamage）を下回らないようにする。
 */
export function damageTaken(
  rules: BattleRules,
  target: Pick<UnitState, 'charging' | 'statuses' | 'passives'> & { readonly equipment?: readonly EquipmentDefinition[] },
  amount: number,
  options: { magical?: boolean; ignoreCharging?: boolean } = {},
): number {
  let d = amount;
  if (!options.ignoreCharging) d = Math.floor((d * chargingPercentOf(rules, target)) / 100);
  if (hasStatus(target, 'protect')) d = Math.floor((d * rules.status.protect.damageTakenPercent) / 100);
  const shell = options.magical ? passiveEffect(target, 'magicShell') : undefined;
  if (shell) d = Math.floor((d * shell.damageTakenPercent) / 100);
  return Math.max(rules.minimumDamage, d);
}
