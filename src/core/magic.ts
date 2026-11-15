/**
 * 魔法（詠唱してから発動する行動）の計算。
 *
 * - 魔法は指定してもすぐには発動しない。詠唱の進み具合がユニットの CT と同じ時計で溜まり、しきい値に達すると発動する。
 * - 狙い方は2通り。ユニットを狙うと、発動までに対象が動いても追いかける（発動前に倒れたら、倒れたマスに撃つ）。
 *   マスを狙うと、その場所に撃つ。
 * - 範囲の魔法は、発動した時点で範囲内にいる全員に効く（攻撃魔法は味方も巻き込み、回復魔法は敵も回復する）。
 * - 範囲は中心からの歩数で決まる。中心のマスとの高さの差が「高さの許容」を超えるマスには届かない。
 * - 魔法は必ず命中し、向きと高低差の補正を受けない。乱数の揺れもない。
 *   ただし狙い撃ち（directional）は、ダメージに通常攻撃と同じ向きと高低差の補正が掛かる（必ず当たる点は同じ）。
 *   ダメージ・回復量 = 魔力 × 威力 ÷ 100（切り捨て）。詠唱中のユニットが受けるダメージは倍率が掛かる。
 * - 射程は指定する時だけ確かめる（発動時に離れていても発動する）。射程の下限がある技（狙い撃ち）は、近すぎるマスを狙えない。
 * - 狙い撃ちのような溜めのある技も、ここでは魔法と同じに扱う（効果量の元が攻撃力になるだけ）。
 *   ただし沈黙で使えなくなるのと、魔力の殻で軽くなるのは魔法（kind が magic）だけ。
 * - 状態変化の魔法（封じ・守りの祈り）は、範囲内の全員に状態変化を付ける（ダメージも回復もない）。
 *   沈黙が付いた時に魔法を詠唱中なら、その詠唱は中断される（battle.ts）。
 * - 消費 MP は「節約」で、詠唱の速さは「早口」で変わる（effects.ts）。
 * - 戦闘不能のユニット（フェーズ2-5）は、攻撃・回復・状態変化の魔法の対象にならない。対象にできるのは蘇生（effect が revive）だけで、
 *   蘇生は戦闘不能のユニット（退場していない）だけに効く。復帰した時の HP は最大 HP × 威力 ÷ 100（切り捨て、最小 1）。
 */
import type { BattleRules, BattleState, ChargeState, SpellDefinition, SpellTarget, UnitState } from './battleTypes';
import { computeDamage, heightDamagePercent, weaponFits } from './combat';
import { damageTaken, enduredDamage, isSilencedFor, mpCostOf } from './effects';
import { manhattan, relativeSide, type Coord, type RelativeSide } from './geometry';
import { getTile, type BattleMap } from './map';
import { isAlive, isKnockedOut, unitAt } from './movement';

/** ユニットが持っている魔法の定義。持っていなければエラー */
export function spellOf(unit: UnitState, spellId: string): SpellDefinition {
  const spell = unit.spells.find((s) => s.id === spellId);
  if (!spell) throw new Error(`ユニット ${unit.id} は魔法 ${spellId} を使えません`);
  return spell;
}

/** MP が足りているか（消費 MP は「節約」で減る） */
export function hasMpFor(unit: UnitState, spell: SpellDefinition): boolean {
  return unit.mp >= mpCostOf(unit, spell);
}

/** 武器が合っていて、MP も足りていて、沈黙で封じられていないか（今その魔法・技を指定できるか） */
export function canCast(unit: UnitState, spell: SpellDefinition): boolean {
  return weaponFits(spell.weapons, unit.weapon) && hasMpFor(unit, spell) && !isSilencedFor(unit, spell);
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
export function spellArea(map: BattleMap, spell: SpellDefinition, center: Coord, from?: Coord): Coord[] {
  const centerTile = getTile(map, center.x, center.z);
  if (!centerTile) return [];
  // 直線（地走り。フェーズ2-6）: 詠唱者から狙ったマスへの向きに、狙ったマスから lineLength マス。
  // 隣り合うマスの高さの差が lineMaxStep を超えたところで止まる（そのマスから先には届かない）
  if (spell.shape === 'line') {
    if (!from) return [{ x: center.x, z: center.z }];
    const dx = Math.sign(center.x - from.x);
    const dz = Math.sign(center.z - from.z);
    const line: Coord[] = [];
    let prev = getTile(map, from.x, from.z);
    for (let i = 0; i < (spell.lineLength ?? 1); i++) {
      const t = getTile(map, center.x + dx * i, center.z + dz * i);
      if (!t || (prev && Math.abs(t.height - prev.height) > (spell.lineMaxStep ?? 1))) break;
      line.push({ x: t.x, z: t.z });
      prev = t;
    }
    return line;
  }
  const result: Coord[] = [];
  for (const t of map.tiles) {
    if (manhattan(center, t) > spell.areaRadius) continue;
    if (Math.abs(t.height - centerTile.height) > spell.heightTolerance) continue;
    result.push({ x: t.x, z: t.z });
  }
  return result;
}

/** 魔法の基本の効果量（詠唱中の倍率などを掛ける前）。元の能力値は魔力（狙い撃ちなどは攻撃力） */
export function baseSpellAmount(caster: UnitState, spell: SpellDefinition, powerBonus = 0): number {
  const stat = spell.stat === 'attack' ? caster.stats.attack : caster.stats.magic;
  return Math.floor((stat * (spell.power + powerBonus)) / 100);
}

/** 土（フェーズ2-6）: 相手が詠唱者より低いほど上がる威力（%）。heightDiff は詠唱者の高さ − 相手の高さ */
export function heightPowerBonus(spell: SpellDefinition, heightDiff: number): number {
  if (!spell.heightPowerPerStep) return 0;
  return Math.min(spell.heightPowerCap ?? Infinity, Math.max(0, heightDiff) * spell.heightPowerPerStep);
}

/**
 * 魔法の効果量。ダメージなら受けるダメージの補正（詠唱中・守り・魔力の殻）と最小値、回復なら最大 HP までの上限を反映する。
 * 状態変化だけの魔法は 0
 */
export function spellAmountOn(
  rules: BattleRules,
  caster: UnitState,
  spell: SpellDefinition,
  target: UnitState,
  angle?: { side: RelativeSide; heightPercent: number },
  powerBonus = 0,
): number {
  if (spell.effect === 'status' || spell.effect === 'swap' || spell.effect === 'cleanse' || spell.effect === 'quicken') return 0;
  if (spell.effect === 'revive') return reviveHp(target, spell);
  // 引き戻し: 最後に手番が始まった時の HP に戻す（今の方が高ければ何もしない）。最大 HP は超えない
  if (spell.effect === 'rewind') return Math.max(0, Math.min(target.turnStartHp, target.stats.maxHp) - target.hp);
  // 時送り: CT を減らす（0 より下にはしない）
  if (spell.effect === 'delay') return Math.min(target.ct, spell.ctDelay ?? 0);
  const stat = spell.stat === 'attack' ? caster.stats.attack : caster.stats.magic;
  const base =
    spell.directional && angle
      ? computeDamage(rules, stat, angle.side, angle.heightPercent, 100, spell.power)
      : baseSpellAmount(caster, spell, powerBonus);
  if (spell.effect === 'heal') return Math.max(0, Math.min(base, target.stats.maxHp - target.hp));
  const damage = damageTaken(rules, target, Math.max(rules.minimumDamage, base), { magical: spell.kind === 'magic' });
  // 「踏みとどまる」で耐える時は、HP 1 を残す
  return enduredDamage(target, damage).damage;
}

/** 蘇生で復帰した時の HP（最大 HP × 威力 ÷ 100、切り捨て、最小 1） */
export function reviveHp(target: UnitState, spell: SpellDefinition): number {
  return Math.max(1, Math.floor((target.stats.maxHp * spell.power) / 100));
}

/**
 * その魔法の対象になるユニットか（蘇生なら戦闘不能のユニット、それ以外は立っているユニット）。
 * 狙える相手が決まっている業（時守の業。フェーズ2-6）は、caster から見て自分以外の味方か、敵だけ
 */
export function affectsUnit(spell: SpellDefinition, unit: UnitState, caster?: Pick<UnitState, 'id' | 'team'>): boolean {
  if (spell.effect === 'revive') return isKnockedOut(unit) && !unit.object;
  if (!isAlive(unit)) return false;
  // 対象物（物語の土台）は、ダメージの魔法・技だけを受ける（味方だけに効くもの・味方を狙う業は除く）
  if (unit.object) return spell.effect === 'damage' && spell.affects !== 'allies' && spell.targets !== 'ally' && spell.targets !== 'allyOrSelf';
  if (spell.targets === 'ally') return caster !== undefined && unit.team === caster.team && unit.id !== caster.id;
  if (spell.targets === 'enemy') return caster !== undefined && unit.team !== caster.team;
  if (spell.targets === 'allyOrSelf') return caster !== undefined && unit.team === caster.team;
  // 敵だけ・味方だけに効く（地走り・召喚。フェーズ2-6）
  if (spell.affects === 'enemies') return caster !== undefined && unit.team !== caster.team;
  if (spell.affects === 'allies') return caster !== undefined && unit.team === caster.team;
  return true;
}

export interface SpellPreview {
  readonly center: Coord;
  readonly tiles: readonly Coord[];
  /**
   * 巻き込まれるユニットと、それぞれの効果量（ダメージまたは回復量）と効果の後の HP。
   * 向きと高低差の補正が掛かる技（狙い撃ち）では、その向きと補正（%）も入る
   */
  readonly results: readonly {
    readonly unitId: string;
    readonly amount: number;
    readonly hp: number;
    readonly side?: RelativeSide;
    readonly heightPercent?: number;
    /** 「踏みとどまる」で HP 1 で耐えるか */
    readonly endured?: boolean;
  }[];
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
  const from = casterOverride ?? caster;
  const tiles = spellArea(state.map, spell, center, from);
  const heightOf = (c: Coord) => getTile(state.map, c.x, c.z)?.height ?? 0;
  const results: { unitId: string; amount: number; hp: number; side?: RelativeSide; heightPercent?: number; endured?: boolean }[] = [];
  for (const unit of state.units) {
    const u = casterOverride && unit.id === caster.id ? casterOverride : unit;
    if (!affectsUnit(spell, u, caster) || !tiles.some((t) => t.x === u.x && t.z === u.z)) continue;
    const angle = spell.directional
      ? { side: relativeSide(from, u, u.facing), heightPercent: heightDamagePercent(state.rules, heightOf(from), heightOf(u)) }
      : undefined;
    const bonus = heightPowerBonus(spell, heightOf(from) - heightOf(u));
    const amount = spellAmountOn(state.rules, caster, spell, u, angle, bonus);
    const hp =
      spell.effect === 'heal' || spell.effect === 'rewind'
        ? u.hp + amount
        : spell.effect === 'damage'
          ? u.hp - amount
          : spell.effect === 'revive'
            ? amount
            : u.hp;
    // 踏みとどまるを使えないものとして計算した量と違えば、耐えた
    const endured = spell.effect === 'damage' && amount !== spellAmountOn(state.rules, caster, spell, { ...u, endureUsed: true }, angle, bonus);
    results.push({ unitId: u.id, amount, hp, ...angle, ...(endured ? { endured: true } : {}) });
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
  // 倒れたユニットは、新しく狙うことはできない（蘇生は、戦闘不能のユニットだけを狙える）
  const caster = 'team' in from ? (from as UnitState) : undefined;
  if (target.kind === 'unit' && !state.units.some((u) => u.id === target.unitId && affectsUnit(spell, u, caster))) return false;
  // 狙える相手が決まっている業は、ユニットだけを狙う
  if (spell.targets && target.kind !== 'unit') return false;
  const center = targetCenter(state, target);
  if (!center || !getTile(state.map, center.x, center.z)) return false;
  if (target.kind === 'tile' && (!Number.isInteger(target.x) || !Number.isInteger(target.z))) return false;
  return inSpellRange(spell, from, center);
}

/**
 * マスにいるユニットを狙うか、マスそのものを狙うかを決める補助（マスにその魔法の対象になるユニットがいればその id）。
 * spell を省くと、立っているユニット
 */
export function unitOnTile(state: BattleState, c: Coord, spell?: SpellDefinition): string | undefined {
  if (!spell) return unitAt(state, c.x, c.z)?.id;
  return state.units.find((u) => affectsUnit(spell, u) && u.x === c.x && u.z === c.z)?.id;
}

/** 詠唱中の魔法が今発動したら届くマス（画面で予約範囲を薄く表示するため）。詠唱中でなければ空 */
export function chargeArea(state: BattleState, caster: UnitState): Coord[] {
  const charge: ChargeState | null = caster.charging;
  if (!charge || !isAlive(caster)) return [];
  const center = targetCenter(state, charge.target);
  if (!center) return [];
  return spellArea(state.map, spellOf(caster, charge.spellId), center, caster);
}
