/**
 * 装備の基本（フェーズ2-4）: 所持品の個体、装備の枠、ジョブごとの装備の制限、装備による能力値の変化。
 *
 * - 部隊は、装備を1つずつ別の「個体」（ItemInstance）として持つ。同じ定義の物を2つ持てば、個体も2つ。
 *   後のフェーズで、個体ごとのランダムな特性を足すため（今回は特性を作らない。足す時は ItemInstance に項目を足す）。
 * - ユニットの枠は、武器・防具・装飾品の3つ。枠には個体の uid を入れる（何も付けていなければ null）。
 * - ジョブごとに、装備できる武器と防具の種類が決まっている（JobDefinition.weaponTypes / armorTypes）。装飾品はだれでも付けられる。
 * - 能力値 = ジョブの基本値 + 成長値 + 装備の値（progression.ts と equipment.ts）。
 *
 * ここは部隊（Roster）の形に依存しない小さな計算だけを置く（progression.ts と equipment.ts の両方から使う）。
 */
import type { EquipmentDefinition, EquipSlot, JobDefinition, UnitStats } from './battleTypes';

/** 所持品の1つ（個体）。uid は部隊の中で重ならない名前。itemId は装備の定義の id */
export interface ItemInstance {
  readonly uid: string;
  readonly itemId: string;
}

/** ユニットの装備の枠。値は所持品の uid（付けていなければ null） */
export type EquipmentSlots = Readonly<Record<EquipSlot, string | null>>;

/** 装備の枠の並び（表示や処理は、いつもこの順） */
export const EQUIP_SLOTS: readonly EquipSlot[] = ['weapon', 'armor', 'accessory'];

export const EMPTY_EQUIPMENT: EquipmentSlots = { weapon: null, armor: null, accessory: null };

export function findEquipment(catalog: { readonly equipment: readonly EquipmentDefinition[] }, id: string): EquipmentDefinition {
  const def = catalog.equipment.find((e) => e.id === id);
  if (!def) throw new Error(`装備 ${id} が見つかりません`);
  return def;
}

/** そのジョブが、その装備を付けられるか（武器と防具は種類で決まる。装飾品はだれでも） */
export function canEquip(job: JobDefinition, def: EquipmentDefinition): boolean {
  if (def.slot === 'weapon') return def.weaponType !== undefined && (job.weaponTypes ?? []).includes(def.weaponType);
  if (def.slot === 'armor') return def.armorType !== undefined && (job.armorTypes ?? []).includes(def.armorType);
  return true;
}

/** 装備の値の合計 */
export function equipmentStats(defs: readonly EquipmentDefinition[]): Partial<UnitStats> {
  const result: Partial<Record<keyof UnitStats, number>> = {};
  for (const def of defs) {
    for (const key of Object.keys(def.stats) as (keyof UnitStats)[]) result[key] = (result[key] ?? 0) + (def.stats[key] ?? 0);
  }
  return result;
}

/** 能力値に装備の値を足す（0 より下にはしない） */
export function addEquipmentStats(stats: UnitStats, defs: readonly EquipmentDefinition[]): UnitStats {
  const bonus = equipmentStats(defs);
  const result: Record<keyof UnitStats, number> = { ...stats };
  for (const key of Object.keys(bonus) as (keyof UnitStats)[]) result[key] = Math.max(0, stats[key] + (bonus[key] ?? 0));
  return result;
}
