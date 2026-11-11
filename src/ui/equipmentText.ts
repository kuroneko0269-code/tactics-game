import type { EquipmentDefinition, UnitStats } from '../core/battleTypes';
import { TEXT } from './text';

/**
 * 装備の表示の部品（フェーズ2-4）。文言そのものは text.ts にあり、ここは組み合わせるだけ。
 * 編成の画面の「装備」のタブと、店の画面で使う。
 */

/** 能力値の並び（表示の順） */
export const STAT_ORDER: readonly (keyof UnitStats)[] = ['maxHp', 'maxMp', 'attack', 'magic', 'speed', 'move', 'jump'];

export function itemName(id: string): string {
  return TEXT.equipment[id]?.name ?? id;
}

/** 種類の名前（剣・鎧・装飾品など） */
export function itemKind(def: EquipmentDefinition): string {
  if (def.weaponType) return TEXT.weapons[def.weaponType];
  if (def.armorType) return TEXT.armors[def.armorType];
  return TEXT.equipSlots[def.slot];
}

/** 装備の値と効果の短い説明（例: 「攻撃力 +3」「HP +4・MP +6」「沈黙を防ぐ」） */
export function itemEffectText(def: EquipmentDefinition): string {
  const parts = STAT_ORDER.filter((k) => (def.stats[k] ?? 0) !== 0).map((k) => {
    const v = def.stats[k]!;
    return `${TEXT.equipStatNames[k]} ${v > 0 ? '+' : ''}${v}`;
  });
  for (const e of def.effects ?? []) parts.push(TEXT.equipmentEffect(e, (id) => TEXT.statuses[id]));
  return parts.join('・');
}

/** 能力値の変化（変わる物だけ）。例: [{ text: '攻撃力 14→16', up: true }] */
export function statChanges(before: UnitStats, after: UnitStats): { readonly text: string; readonly up: boolean }[] {
  return STAT_ORDER.filter((k) => before[k] !== after[k]).map((k) => ({
    text: `${TEXT.equipStatNames[k]} ${before[k]}→${after[k]}`,
    up: after[k] > before[k],
  }));
}
