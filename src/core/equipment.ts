/**
 * 部隊の装備（フェーズ2-4）: 付け替え、ジョブを変えた時に外れる物、「おまかせ」、付け替えた時の能力値。
 *
 * - 枠は武器・防具・装飾品の3つ。持っている個体（Roster.items）を、今のジョブで付けられる物だけ付けられる。
 * - ほかのユニットが付けている個体を選ぶと、そのユニットから外して付け替える（同じ個体は1か所にしか付けられない）。
 * - ジョブを変えた時、新しいジョブで付けられなくなった物は自動で外れる（外れた物を返すので、画面でその旨を出す）。
 * - 「おまかせ」: ほかのユニットが付けていない物（と自分が付けている物）の中から、枠ごとに最も点数の高い物を付ける。
 *   点数は、装備の値に重み（src/data の autoEquipWeights）を掛けた合計と、特別な効果の点数。
 *   魔力と MP は、魔力を元にする魔法か、MP を使うアビリティを使えるユニットだけ数える（戦士に魔力の首飾りを選ばないため）。
 *   枠どうしの組み合わせによる効果はないので、枠ごとの最良が、最も強い組み合わせになる。
 *
 * 計算はすべて整数。数値は src/data から引数で受け取る。
 */
import type { EquipmentDefinition, EquipmentEffect, EquipSlot, UnitStats } from './battleTypes';
import {
  addEquipmentStats,
  canEquip,
  EMPTY_EQUIPMENT,
  EQUIP_SLOTS,
  findEquipment,
  type EquipmentSlots,
  type ItemInstance,
} from './items';
import {
  changeJob,
  findJob,
  findUnit,
  replaceUnit,
  unitCommands,
  unitStats,
  type GameCatalog,
  type ProgressionRules,
  type Roster,
  type RosterUnit,
} from './progression';

/** 「おまかせ」の点数の重み（src/data に置く） */
export interface AutoEquipWeights {
  /** 能力値 1 あたりの点数 */
  readonly stats: Readonly<Record<keyof UnitStats, number>>;
  /** 特別な効果 1 つあたりの点数 */
  readonly effects: Readonly<Record<EquipmentEffect['kind'], number>>;
}

type Catalog = Pick<GameCatalog, 'jobs' | 'equipment'>;

/** 持っている個体（なければ undefined） */
export function itemOf(roster: Roster, uid: string): ItemInstance | undefined {
  return roster.items.find((i) => i.uid === uid);
}

/** その個体を付けているユニット（だれも付けていなければ undefined） */
export function wearerOf(roster: Roster, uid: string): RosterUnit | undefined {
  return roster.units.find((u) => EQUIP_SLOTS.some((s) => u.equipment[s] === uid));
}

/** ユニットが付けている装備の定義（武器・防具・装飾品の順） */
export function equippedDefinitions(unit: RosterUnit, roster: Roster, catalog: Pick<GameCatalog, 'equipment'>): EquipmentDefinition[] {
  const result: EquipmentDefinition[] = [];
  for (const slot of EQUIP_SLOTS) {
    const uid = unit.equipment[slot];
    const item = uid === null ? undefined : itemOf(roster, uid);
    if (item) result.push(findEquipment(catalog, item.itemId));
  }
  return result;
}

/** ユニットの能力値（ジョブの基本値 + 成長値 + 装備。受動的なアビリティは戦闘の開始時に反映するので含めない） */
export function equippedStats(unit: RosterUnit, roster: Roster, catalog: Catalog): UnitStats {
  return addEquipmentStats(unitStats(unit, catalog), equippedDefinitions(unit, roster, catalog));
}

/** 装備の枠を変えたユニット */
function withSlot(unit: RosterUnit, slot: EquipSlot, uid: string | null): RosterUnit {
  return { ...unit, equipment: { ...unit.equipment, [slot]: uid } };
}

export type EquipRefusal = 'notOwned' | 'wrongSlot' | 'cannotEquip';

/** その個体をユニットの枠に付けられるか。付けられなければ理由を返す（ほかのユニットが付けていても付けられる） */
export function equipRefusal(roster: Roster, unitId: string, slot: EquipSlot, uid: string, catalog: Catalog): EquipRefusal | null {
  const item = itemOf(roster, uid);
  if (!item) return 'notOwned';
  const def = findEquipment(catalog, item.itemId);
  if (def.slot !== slot) return 'wrongSlot';
  if (!canEquip(findJob(catalog, findUnit(roster, unitId).jobId), def)) return 'cannotEquip';
  return null;
}

/**
 * 個体をユニットの枠に付ける（null で外す）。ほかのユニットが付けていれば、そのユニットから外す。
 * 付けられない時はエラー
 */
export function equipItem(roster: Roster, unitId: string, slot: EquipSlot, uid: string | null, catalog: Catalog): Roster {
  if (uid === null) return replaceUnit(roster, withSlot(findUnit(roster, unitId), slot, null));
  const refusal = equipRefusal(roster, unitId, slot, uid, catalog);
  if (refusal) throw new Error(`${unitId} は ${uid} を ${slot} に付けられません（${refusal}）`);
  let next = roster;
  const other = wearerOf(next, uid);
  if (other && other.id !== unitId) {
    const otherSlot = EQUIP_SLOTS.find((s) => other.equipment[s] === uid)!;
    next = replaceUnit(next, withSlot(other, otherSlot, null));
  }
  return replaceUnit(next, withSlot(findUnit(next, unitId), slot, uid));
}

/** 枠ごとの候補: その枠の物で、今のジョブで付けられる個体（ほかのユニットが付けている物も含む） */
export interface EquipCandidate {
  readonly item: ItemInstance;
  readonly def: EquipmentDefinition;
  /** 付けているユニット（自分を含む。だれも付けていなければ undefined） */
  readonly wornBy: string | undefined;
  /** 付け替えた後の能力値 */
  readonly statsAfter: UnitStats;
}

/** 枠の候補（強さの段階の高い順 → 値段の高い順 → 手に入れた順） */
export function equipCandidates(roster: Roster, unitId: string, slot: EquipSlot, catalog: Catalog): EquipCandidate[] {
  const unit = findUnit(roster, unitId);
  const job = findJob(catalog, unit.jobId);
  const result: EquipCandidate[] = [];
  for (const item of roster.items) {
    const def = findEquipment(catalog, item.itemId);
    if (def.slot !== slot || !canEquip(job, def)) continue;
    const after = withSlot(unit, slot, item.uid);
    result.push({ item, def, wornBy: wearerOf(roster, item.uid)?.id, statsAfter: equippedStats(after, roster, catalog) });
  }
  return result.sort((a, b) => b.def.tier - a.def.tier || b.def.price - a.def.price);
}

/** 付け替えた時の能力値（uid を null にすると、外した時） */
export function statsWithItem(roster: Roster, unitId: string, slot: EquipSlot, uid: string | null, catalog: Catalog): UnitStats {
  return equippedStats(withSlot(findUnit(roster, unitId), slot, uid), roster, catalog);
}

/** 今のジョブで付けられなくなった装備を外す。外した個体を返す */
export function removeUnfitEquipment(roster: Roster, unitId: string, catalog: Catalog): { roster: Roster; removed: ItemInstance[] } {
  const unit = findUnit(roster, unitId);
  const job = findJob(catalog, unit.jobId);
  const removed: ItemInstance[] = [];
  const equipment: Record<EquipSlot, string | null> = { ...unit.equipment };
  for (const slot of EQUIP_SLOTS) {
    const uid = equipment[slot];
    const item = uid === null ? undefined : itemOf(roster, uid);
    if (!item) continue;
    if (!canEquip(job, findEquipment(catalog, item.itemId))) {
      removed.push(item);
      equipment[slot] = null;
    }
  }
  return { roster: replaceUnit(roster, { ...unit, equipment }), removed };
}

/**
 * ジョブを変える（progression.ts の changeJob）。新しいジョブで付けられなくなった装備は自動で外れ、外れた個体を返す
 */
export function changeJobWithEquipment(
  roster: Roster,
  unitId: string,
  jobId: string,
  catalog: Catalog,
  rules: ProgressionRules,
): { roster: Roster; removed: ItemInstance[] } {
  const changed = replaceUnit(roster, changeJob(findUnit(roster, unitId), jobId, catalog, rules));
  return removeUnfitEquipment(changed, unitId, catalog);
}

/** 魔力と MP が役に立つユニットか（魔力を元にする魔法か、MP を使うアビリティを、主コマンドか副コマンドで使える） */
function usesMagic(unit: RosterUnit, catalog: Pick<GameCatalog, 'jobs' | 'spells'>): boolean {
  const ids = unitCommands(unit, catalog).flatMap((c) => c.abilityIds);
  return catalog.spells.some((s) => ids.includes(s.id) && (s.mpCost > 0 || (s.stat ?? 'magic') === 'magic'));
}

/** 「おまかせ」の点数 */
export function equipScore(def: EquipmentDefinition, weights: AutoEquipWeights, magicMatters: boolean): number {
  let score = 0;
  for (const key of Object.keys(def.stats) as (keyof UnitStats)[]) {
    if (!magicMatters && (key === 'magic' || key === 'maxMp')) continue;
    score += (def.stats[key] ?? 0) * weights.stats[key];
  }
  for (const e of def.effects ?? []) score += weights.effects[e.kind];
  return score;
}

/**
 * 「おまかせ」: ほかのユニットが付けていない物（と自分が付けている物）の中から、今のジョブで付けられる、
 * 枠ごとに最も点数の高い物を付ける。点数が同じなら、強さの段階 → 値段の高い方 → 今付けている物 → 手に入れた順。
 * 点数が 0 以下の物しかない枠は、何も付けない（今付けている物も外す）。
 */
export function autoEquip(
  roster: Roster,
  unitId: string,
  catalog: Catalog & Pick<GameCatalog, 'spells'>,
  weights: AutoEquipWeights,
): Roster {
  const unit = findUnit(roster, unitId);
  const job = findJob(catalog, unit.jobId);
  const magicMatters = usesMagic(unit, catalog);
  const equipment: Record<EquipSlot, string | null> = { ...EMPTY_EQUIPMENT };
  for (const slot of EQUIP_SLOTS) {
    let best: { uid: string; key: number[] } | undefined;
    for (const item of roster.items) {
      const def = findEquipment(catalog, item.itemId);
      if (def.slot !== slot || !canEquip(job, def)) continue;
      const wearer = wearerOf(roster, item.uid);
      if (wearer && wearer.id !== unitId) continue;
      const score = equipScore(def, weights, magicMatters);
      if (score <= 0) continue;
      const key = [score, def.tier, def.price, unit.equipment[slot] === item.uid ? 1 : 0];
      if (!best || compareKeys(key, best.key) > 0) best = { uid: item.uid, key };
    }
    equipment[slot] = best?.uid ?? null;
  }
  return replaceUnit(roster, { ...unit, equipment: equipment as EquipmentSlots });
}

/** 数の並びを前から比べる（大きい方が正） */
function compareKeys(a: readonly number[], b: readonly number[]): number {
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return a[i]! - b[i]!;
  return 0;
}
