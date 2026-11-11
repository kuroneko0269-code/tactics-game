/**
 * 通常攻撃の届く範囲と、命中率・ダメージの計算。
 *
 * - 命中率は向きだけで決まる（攻撃対象から見て、攻撃側が正面・側面・背面のどこにいるか）。
 * - ダメージ = 攻撃力 × 向きの倍率 × 高低差の補正。整数で計算し、端数は切り捨てる。
 * - 高低差の補正は、攻撃側が高いと 1 段ごとに増え、低いと減る（上限・下限あり）。
 * - 技（強打など）は、その後に技の倍率を掛け（切り捨て）、命中率に技の補正を足す（0〜100 に収める）。
 * - 詠唱中の相手には、さらに詠唱中の倍率が掛かる（切り捨て、最小値あり）。守りが付いた相手は、さらに減る（effects.ts の damageTaken）。
 * - 命中率には、自分の「集中」と相手の「身かわし」（正面・側面の時だけ）が効く。
 * - 突き飛ばし: 当たった相手を1マス押し出す。押し出した先が低ければ落下ダメージ、押し出せなければ追加のダメージ。
 * - 反撃: 隣接するマスから近接攻撃を受けて生き残った相手が「反撃」を付けていれば、通常攻撃で反撃する。
 */
import type { AttackProfile, BattleRules, BattleState, StatusId, StrikeDefinition, UnitState, WeaponType } from './battleTypes';
import { chargingPercentOf, damageTaken, hasStatus, passiveEffect, passiveIdOf } from './effects';
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

/** 突き飛ばしの見込み（当たった場合） */
export interface KnockbackPreview {
  /** 押し出す先。押し出せない時は null */
  readonly to: Coord | null;
  /** 押し出せない理由（マップの外、ほかのユニット、ジャンプ力で登れない段差） */
  readonly blockedBy?: 'edge' | 'unit' | 'cliff';
  /** 押し出した先が低い時の落下ダメージ、または押し出せない時の追加のダメージ（受けるダメージの補正の後。なければ 0） */
  readonly damage: number;
}

/** 反撃の見込み（当たって相手が倒れなかった場合） */
export interface CounterPreview {
  /** 反撃のリアクションの id（画面で名前を出すため） */
  readonly abilityId: string;
  readonly hitPercent: number;
  readonly damage: number;
}

export interface AttackPreview {
  readonly side: RelativeSide;
  readonly hitPercent: number;
  readonly heightPercent: number;
  /** 相手が詠唱中なら詠唱中の倍率（%）、そうでなければ 100 */
  readonly chargingPercent: number;
  /** 相手に守りが付いていれば、受けるダメージの倍率（%）。そうでなければ 100 */
  readonly protectPercent: number;
  /** 相手の「身かわし」で下がった命中率（なければ 0） */
  readonly evadePenalty: number;
  /** 自分の「集中」で上がった命中率（なければ 0） */
  readonly focusBonus: number;
  /** 命中した時のダメージ */
  readonly damage: number;
  /** 攻撃のために攻撃側が向き直る向き */
  readonly attackerFacing: Direction;
  /** 突き飛ばしなら、当たった場合の押し出しの見込み（相手が倒れる時は undefined） */
  readonly knockback?: KnockbackPreview;
  /** 当たった相手に付ける状態変化 */
  readonly inflicts?: StatusId;
  /** 当たると、相手の詠唱を中断させるか（詠唱中の相手への突き飛ばし） */
  readonly interrupts: boolean;
  /** 相手が反撃する見込み（当たって相手が倒れなかった場合）。反撃しなければ undefined */
  readonly counter?: CounterPreview;
}

/**
 * 武器による攻撃の命中率: 向きで決まる値 + 技の補正 + 自分の「集中」− 相手の「身かわし」（正面・側面の時だけ）。0〜100 に収める
 */
function weaponHit(
  rules: BattleRules,
  attacker: UnitState,
  target: UnitState,
  side: RelativeSide,
  strike: StrikeDefinition | undefined,
): { hitPercent: number; evadePenalty: number; focusBonus: number } {
  const focusBonus = passiveEffect(attacker, 'weaponHitBonus')?.bonus ?? 0;
  const evade = side === 'back' ? undefined : passiveEffect(target, 'evade');
  const evadePenalty = evade?.hitPenalty ?? 0;
  const hit = rules.hitPercent[side] + (strike?.hitBonus ?? 0) + focusBonus - evadePenalty;
  return { hitPercent: Math.max(0, Math.min(100, hit)), evadePenalty, focusBonus };
}

/**
 * from にいる攻撃側が隣の target を突き飛ばした時の見込み。押し出す向きは、攻撃側から相手への向き。
 * - 押し出した先が低い時は、高さの差 1 につき最大 HP の一定の割合の落下ダメージ。
 * - マップの外・ほかのユニットがいる・ジャンプ力で登れない段差の時は、動かさずに追加のダメージ。
 * ダメージには、守りの補正が掛かる（詠唱は突き飛ばしで中断されるので、詠唱中の倍率は掛からない）。
 * attackerId のユニットは from にいるものとして数える（今いるマスは邪魔にならない）。
 */
export function knockbackOutcome(state: BattleState, attackerId: string, from: Coord, target: UnitState): KnockbackPreview {
  const dx = Math.sign(target.x - from.x);
  const dz = Math.sign(target.z - from.z);
  const to = { x: target.x + dx, z: target.z + dz };
  const rules = state.rules;
  const percentOfMaxHp = (percent: number) =>
    damageTaken(rules, target, Math.floor((target.stats.maxHp * percent) / 100), { ignoreCharging: true });
  const blocked = (blockedBy: 'edge' | 'unit' | 'cliff'): KnockbackPreview => ({
    to: null,
    blockedBy,
    damage: percentOfMaxHp(rules.knockback.blockedDamagePercent),
  });
  const tile = getTile(state.map, to.x, to.z);
  if (!tile) return blocked('edge');
  const occupant = state.units.find((u) => isAlive(u) && u.id !== attackerId && u.id !== target.id && u.x === to.x && u.z === to.z);
  if (occupant) return blocked('unit');
  const rise = tile.height - heightAt(state.map, target);
  if (rise > target.stats.jump) return blocked('cliff');
  const fall = Math.max(0, -rise);
  return { to, damage: fall > 0 ? percentOfMaxHp(rules.knockback.fallDamagePercentPerHeight * fall) : 0 };
}

/**
 * 攻撃の予測（実際の攻撃もこの計算を使う）。from を省くと攻撃側の今の位置から。
 * strike を渡すと、その技（強打など）で攻撃した場合。
 * 相手のリアクション（身かわし・反撃）と状態変化（守り）、自分のサポート（集中）による補正をすべて反映する。
 * options.counter は、反撃として行う攻撃（反撃に対する反撃は起きない）。
 */
export function previewAttack(
  state: BattleState,
  attacker: UnitState,
  target: UnitState,
  from: Coord = attacker,
  strike?: StrikeDefinition,
  options: { counter?: boolean } = {},
): AttackPreview {
  const rules = state.rules;
  const side = relativeSide(from, target, target.facing);
  const heightPercent = heightDamagePercent(rules, heightAt(state.map, from), heightAt(state.map, target));
  const chargingPercent = chargingPercentOf(rules, target);
  const protectPercent = hasStatus(target, 'protect') ? rules.status.protect.damageTakenPercent : 100;
  const hit = weaponHit(rules, attacker, target, side, strike);
  const raw = computeDamage(rules, attacker.stats.attack, side, heightPercent, 100, strike?.damagePercent ?? 100);
  const damage = damageTaken(rules, target, raw);
  const attackerFacing = directionToward(from, target, attacker.facing);
  const adjacent = manhattan(from, target) === 1;
  const survives = target.hp - damage > 0;
  const interrupts = Boolean(strike?.knockback && adjacent && target.charging);
  const knockback =
    strike?.knockback && adjacent && survives
      ? knockbackOutcome(state, attacker.id, from, { ...target, charging: null })
      : undefined;
  const after = target.hp - damage - (knockback?.damage ?? 0);
  // 反撃: 隣接するマスからの攻撃で、当たっても倒れず、押し出されずに隣に残り、通常攻撃が届くなら
  let counter: CounterPreview | undefined;
  const counterId = passiveIdOf(target, 'counter');
  if (!options.counter && counterId && adjacent && after > 0 && (!knockback || knockback.to === null)) {
    const self: UnitState = { ...attacker, x: from.x, z: from.z, facing: attackerFacing, charging: null };
    const counterer: UnitState = { ...target, hp: after };
    if (canReach(state.map, counterer.attack, counterer, self)) {
      const p = previewAttack(state, counterer, self, counterer, undefined, { counter: true });
      counter = { abilityId: counterId, hitPercent: p.hitPercent, damage: p.damage };
    }
  }
  return {
    side,
    hitPercent: hit.hitPercent,
    heightPercent,
    chargingPercent,
    protectPercent,
    evadePenalty: hit.evadePenalty,
    focusBonus: hit.focusBonus,
    damage,
    attackerFacing,
    knockback,
    inflicts: strike?.inflicts,
    interrupts,
    counter,
  };
}
