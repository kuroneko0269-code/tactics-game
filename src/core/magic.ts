/**
 * 魔法（詠唱してから発動する行動）の計算。
 *
 * - 魔法は指定してもすぐには発動しない。詠唱の進み具合がユニットの CT と同じ時計で溜まり、しきい値に達すると発動する。
 * - 狙い方は2通り。ユニットを狙うと、発動までに対象が動いても追いかける（発動前に倒れたら、倒れたマスに撃つ）。
 *   マスを狙うと、その場所に撃つ。
 * - 範囲の魔法は、発動した時点で範囲内にいる全員に効く（攻撃魔法は味方も巻き込み、回復魔法は敵も回復する）。
 * - 範囲は中心からの歩数で決まる。中心のマスとの高さの差が「高さの許容」を超えるマスには届かない。
 * - 魔法は必ず命中し、向きと高低差の補正を受けない。乱数の揺れもない。
 *   ダメージ・回復量 = 魔力 × 威力 ÷ 100（切り捨て）。詠唱中のユニットが受けるダメージは倍率が掛かる。
 * - 射程は指定する時だけ確かめる（発動時に離れていても発動する）。射程の下限がある技（狙い撃ち）は、近すぎるマスを狙えない。
 * - 狙い撃ちのような溜めのある技も、ここでは魔法と同じに扱う（効果量の元が攻撃力になるだけ）。
 */
import type { BattleRules, BattleState, ChargeState, SpellDefinition, SpellTarget, UnitState } from './battleTypes';
import { weaponFits } from './combat';
import { manhattan, type Coord } from './geometry';
import { getTile, type BattleMap } from './map';
import { isAlive, unitAt } from './movement';

/** ユニットが持っている魔法の定義。持っていなければエラー */
export function spellOf(unit: UnitState, spellId: string): SpellDefinition {
  const spell = unit.spells.find((s) => s.id === spellId);
  if (!spell) throw new Error(`ユニット ${unit.id} は魔法 ${spellId} を使えません`);
  return spell;
}

/** MP が足りているか */
export function hasMpFor(unit: UnitState, spell: SpellDefinition): boolean {
  return unit.mp >= spell.mpCost;
}

/** 武器が合っていて、MP も足りているか（今その魔法・技を指定できるか） */
export function canCast(unit: UnitState, spell: SpellDefinition): boolean {
  return weaponFits(spell.weapons, unit.weapon) && hasMpFor(unit, spell);
}

/** from から c までが、spell の射程の内側か */
export function inSpellRange(spell: SpellDefinition, from: Coord, c: Coord): boolean {
  const d = manhattan(from, c);
  return d >= (spell.minRange ?? 0) && d <= spell.range;
}

/** from から spell で狙えるマスの一覧（射程の内側。高さは問わない） */
export function spellRangeTiles(map: BattleMap, spell: SpellDefinition, from: Coord): Coord[] {
  return map.tiles.filter((t) => inSpellRange(spell, from, t)).map((t) => ({ x: t.x, z: t.z }));
}

/**
 * 狙い先の中心のマス。ユニットを狙っていれば、そのユニットの今の位置。
 * 発動前にそのユニットが倒れていても不発にはせず、倒れたマスを中心にする（倒れたユニットは位置を変えないため）。
 * そのユニットがいなければ undefined。
 */
export function targetCenter(state: BattleState, target: SpellTarget): Coord | undefined {
  if (target.kind === 'tile') return { x: target.x, z: target.z };
  const unit = state.units.find((u) => u.id === target.unitId);
  return unit ? { x: unit.x, z: unit.z } : undefined;
}

/** center を中心に spell が届くマス（範囲の内側で、中心との高さの差が許容以下のマス） */
export function spellArea(map: BattleMap, spell: SpellDefinition, center: Coord): Coord[] {
  const centerTile = getTile(map, center.x, center.z);
  if (!centerTile) return [];
  const result: Coord[] = [];
  for (const t of map.tiles) {
    if (manhattan(center, t) > spell.areaRadius) continue;
    if (Math.abs(t.height - centerTile.height) > spell.heightTolerance) continue;
    result.push({ x: t.x, z: t.z });
  }
  return result;
}

/** 魔法の基本の効果量（詠唱中の倍率などを掛ける前）。元の能力値は魔力（狙い撃ちなどは攻撃力） */
export function baseSpellAmount(caster: UnitState, spell: SpellDefinition): number {
  const stat = spell.stat === 'attack' ? caster.stats.attack : caster.stats.magic;
  return Math.floor((stat * spell.power) / 100);
}

/** 魔法の効果量。ダメージなら詠唱中の倍率と最小値、回復なら最大 HP までの上限を反映する */
export function spellAmountOn(
  rules: BattleRules,
  caster: UnitState,
  spell: SpellDefinition,
  target: UnitState,
): number {
  const base = baseSpellAmount(caster, spell);
  if (spell.effect === 'heal') return Math.max(0, Math.min(base, target.stats.maxHp - target.hp));
  const percent = target.charging ? rules.chargingDamagePercent : 100;
  const damage = Math.max(rules.minimumDamage, Math.floor((base * percent) / 100));
  return Math.min(damage, target.hp);
}

export interface SpellPreview {
  readonly center: Coord;
  readonly tiles: readonly Coord[];
  /** 巻き込まれるユニットと、それぞれの効果量（ダメージまたは回復量）と効果の後の HP */
  readonly results: readonly { readonly unitId: string; readonly amount: number; readonly hp: number }[];
}

/**
 * 今のまま誰も動かなかった場合に、魔法が center に発動したらどうなるか。
 * 実際の発動もこの計算を使う。詠唱者自身も範囲内にいれば巻き込まれる。
 * casterOverride を渡すと、詠唱者がその位置・状態にいるものとして数える（AI の位置選び用）。
 */
export function previewSpellAt(
  state: BattleState,
  caster: UnitState,
  spell: SpellDefinition,
  center: Coord,
  casterOverride?: UnitState,
): SpellPreview {
  const tiles = spellArea(state.map, spell, center);
  const results: { unitId: string; amount: number; hp: number }[] = [];
  for (const unit of state.units) {
    const u = casterOverride && unit.id === caster.id ? casterOverride : unit;
    if (!isAlive(u) || !tiles.some((t) => t.x === u.x && t.z === u.z)) continue;
    const amount = spellAmountOn(state.rules, caster, spell, u);
    const hp = spell.effect === 'heal' ? u.hp + amount : u.hp - amount;
    results.push({ unitId: u.id, amount, hp });
  }
  return { center, tiles, results };
}

/** 狙い先が正しいか（指定する時に確かめる）。from は詠唱者の位置 */
export function isValidSpellTarget(
  state: BattleState,
  spell: SpellDefinition,
  from: Coord,
  target: SpellTarget,
): boolean {
  // 倒れたユニットは、新しく狙うことはできない
  if (target.kind === 'unit' && !state.units.some((u) => u.id === target.unitId && isAlive(u))) return false;
  const center = targetCenter(state, target);
  if (!center || !getTile(state.map, center.x, center.z)) return false;
  if (target.kind === 'tile' && (!Number.isInteger(target.x) || !Number.isInteger(target.z))) return false;
  return inSpellRange(spell, from, center);
}

/** マスにいるユニットを狙うか、マスそのものを狙うかを決める補助（マスに生きているユニットがいればその id） */
export function unitOnTile(state: BattleState, c: Coord): string | undefined {
  return unitAt(state, c.x, c.z)?.id;
}

/** 詠唱中の魔法が今発動したら届くマス（画面で予約範囲を薄く表示するため）。詠唱中でなければ空 */
export function chargeArea(state: BattleState, caster: UnitState): Coord[] {
  const charge: ChargeState | null = caster.charging;
  if (!charge || !isAlive(caster)) return [];
  const center = targetCenter(state, charge.target);
  if (!center) return [];
  return spellArea(state.map, spellOf(caster, charge.spellId), center);
}
