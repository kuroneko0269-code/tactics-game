/**
 * 通常攻撃の届く範囲と、命中率・ダメージの計算。
 *
 * - 命中率は向きだけで決まる（攻撃対象から見て、攻撃側が正面・側面・背面のどこにいるか）。
 * - ダメージ = 攻撃力 × 向きの倍率 × 高低差の補正。整数で計算し、端数は切り捨てる。
 * - 高低差の補正は、攻撃側が高いと 1 段ごとに増え、低いと減る（上限・下限あり）。
 * - 技（強打など）は、その後に技の倍率を掛け（切り捨て）、命中率に技の補正を足す（0〜100 に収める）。
 * - 詠唱中の相手には、さらに詠唱中の倍率が掛かる（切り捨て、最小値あり）。
 */
import type { AttackProfile, BattleRules, BattleState, StrikeDefinition, UnitState, WeaponType } from './battleTypes';
import { directionToward, manhattan, relativeSide, type Coord, type Direction, type RelativeSide } from './geometry';
import { getTile, type BattleMap } from './map';
import { isAlive } from './movement';

function heightAt(map: BattleMap, c: Coord): number {
  const tile = getTile(map, c.x, c.z);
  if (!tile) throw new Error(`マップ外の座標です (${c.x}, ${c.z})`);
  return tile.height;
}

/** from にいる攻撃側が、to のマスを攻撃できるか（相手がいるかどうかは問わない） */
export function canReach(map: BattleMap, profile: AttackProfile, from: Coord, to: Coord): boolean {
  if (!getTile(map, to.x, to.z)) return false;
  const distance = manhattan(from, to);
  const diff = heightAt(map, from) - heightAt(map, to);
  if (profile.kind === 'melee') {
    return distance === 1 && Math.abs(diff) <= profile.maxHeightDiff;
  }
  const extra = diff > 0 ? Math.floor(diff / profile.heightPerExtraRange) : 0;
  return distance >= profile.minRange && distance <= profile.maxRange + extra;
}

/** from にいる unit が攻撃できるマスの一覧（表示用） */
export function attackRangeTiles(state: BattleState, unit: UnitState, from: Coord): Coord[] {
  const result: Coord[] = [];
  for (const tile of state.map.tiles) {
    if (canReach(state.map, unit.attack, from, tile)) result.push({ x: tile.x, z: tile.z });
  }
  return result;
}

/** from にいる unit が攻撃できる相手（生きている敵だけ） */
export function attackableTargets(state: BattleState, unit: UnitState, from: Coord): UnitState[] {
  return state.units.filter(
    (u) => isAlive(u) && u.team !== unit.team && canReach(state.map, unit.attack, from, u),
  );
}

/** 高低差によるダメージ補正（%） */
export function heightDamagePercent(rules: BattleRules, attackerHeight: number, targetHeight: number): number {
  const raw = (attackerHeight - targetHeight) * rules.heightDamagePercentPerStep;
  const cap = rules.heightDamagePercentCap;
  return Math.max(-cap, Math.min(cap, raw));
}

/**
 * 命中した時のダメージ。chargingPercent は詠唱中の相手への倍率（詠唱中でなければ 100）、
 * abilityPercent は技の倍率（通常攻撃なら 100）
 */
export function computeDamage(
  rules: BattleRules,
  attack: number,
  side: RelativeSide,
  heightPercent: number,
  chargingPercent = 100,
  abilityPercent = 100,
): number {
  const base = Math.floor((attack * rules.damagePercent[side] * (100 + heightPercent)) / 10000);
  const withAbility = Math.floor((base * abilityPercent) / 100);
  return Math.max(rules.minimumDamage, Math.floor((withAbility * chargingPercent) / 100));
}

/** 武器の種類が合っていて、そのアビリティを使えるか（必要な武器がなければ、いつでも使える） */
export function weaponFits(weapons: readonly WeaponType[] | undefined, weapon: WeaponType | null): boolean {
  return !weapons || (weapon !== null && weapons.includes(weapon));
}

/** ユニットが持っている技の定義。持っていなければエラー */
export function strikeOf(unit: UnitState, strikeId: string): StrikeDefinition {
  const strike = unit.strikes.find((s) => s.id === strikeId);
  if (!strike) throw new Error(`ユニット ${unit.id} は技 ${strikeId} を使えません`);
  return strike;
}

export interface AttackPreview {
  readonly side: RelativeSide;
  readonly hitPercent: number;
  readonly heightPercent: number;
  /** 相手が詠唱中なら詠唱中の倍率（%）、そうでなければ 100 */
  readonly chargingPercent: number;
  /** 命中した時のダメージ */
  readonly damage: number;
  /** 攻撃のために攻撃側が向き直る向き */
  readonly attackerFacing: Direction;
}

/**
 * 攻撃の予測（実際の攻撃もこの計算を使う）。from を省くと攻撃側の今の位置から。
 * strike を渡すと、その技（強打など）で攻撃した場合
 */
export function previewAttack(
  state: BattleState,
  attacker: UnitState,
  target: UnitState,
  from: Coord = attacker,
  strike?: StrikeDefinition,
): AttackPreview {
  const side = relativeSide(from, target, target.facing);
  const heightPercent = heightDamagePercent(state.rules, heightAt(state.map, from), heightAt(state.map, target));
  const chargingPercent = target.charging ? state.rules.chargingDamagePercent : 100;
  const hit = state.rules.hitPercent[side] + (strike?.hitBonus ?? 0);
  return {
    side,
    hitPercent: Math.max(0, Math.min(100, hit)),
    heightPercent,
    chargingPercent,
    damage: computeDamage(state.rules, attacker.stats.attack, side, heightPercent, chargingPercent, strike?.damagePercent ?? 100),
    attackerFacing: directionToward(from, target, attacker.facing),
  };
}
