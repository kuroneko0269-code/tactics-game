import type { SpellDefinition, StrikeDefinition } from '../core/battleTypes';

/**
 * 行動アビリティの定義。数値はすべて仮（バランス調整で変える）。
 * 画面に出す名前は src/ui/text.ts に id で引けるようにまとめている。どのジョブで習得できるかは jobs.ts。
 *
 * 詠唱のあるもの（spells。魔法と狙い撃ち）:
 * - power: 威力（%）。効果量 = 元の能力値（魔力。stat が attack なら攻撃力）× 威力 ÷ 100（切り捨て）
 * - range: 射程（歩数）。minRange は射程の下限。areaRadius: 範囲（中心からの歩数。0 で単体、1 で中心と上下左右の5マス）
 * - heightTolerance: 高さの許容。中心のマスとの高さの差がこれを超えるマスには届かない
 * - castSpeed: 詠唱の速さ。ユニットの CT と同じ時計で毎回これだけ溜まり、100 に達すると発動する
 *   （素早さ 6〜7 のユニットが10体いると、時計が1回進むごとにおよそ 0.6 回ぶんの手番が入る）
 * - weapons: 使うのに必要な武器の種類（省くと問わない）
 *
 * - kind: magic は魔法（沈黙で使えず、魔力の殻で軽くなる）、skill は溜めのある技（狙い撃ち）
 * - effect: damage（ダメージ）、heal（回復）、status（状態変化を付けるだけ。inflicts が付ける状態変化）
 *
 * すぐに出るもの（strikes。強打・突き飛ばし・足止めの矢）:
 * - damagePercent: 通常攻撃のダメージに掛ける倍率（%）。hitBonus: 命中率に足す値（%）
 * - knockback: 当たった相手を1マス押し出す。inflicts: 当たった相手に付ける状態変化
 */

/** 炎: 範囲の攻撃魔法。威力は高く、詠唱は遅い（発動までにほかのユニットの手番が2〜3回入る程度） */
export const fire: SpellDefinition = {
  id: 'fire',
  kind: 'magic',
  element: 'fire',
  effect: 'damage',
  power: 200,
  mpCost: 12,
  range: 4,
  areaRadius: 1,
  heightTolerance: 2,
  castSpeed: 25,
};

/** 風: 単体の攻撃魔法。威力は控えめで、詠唱は速い（ほかのユニットの手番が1回入る程度） */
export const wind: SpellDefinition = {
  id: 'wind',
  kind: 'magic',
  element: 'wind',
  effect: 'damage',
  power: 125,
  mpCost: 6,
  range: 4,
  areaRadius: 0,
  heightTolerance: 0,
  castSpeed: 50,
};

/** 雷: 単体の攻撃魔法。威力が高く、詠唱は遅い（炎よりさらに遅い） */
export const thunder: SpellDefinition = {
  id: 'thunder',
  kind: 'magic',
  element: 'thunder',
  effect: 'damage',
  power: 260,
  mpCost: 14,
  range: 4,
  areaRadius: 0,
  heightTolerance: 0,
  castSpeed: 20,
};

/** 癒し: 範囲の回復魔法。敵も範囲内にいれば回復する。詠唱は速い */
export const heal: SpellDefinition = {
  id: 'heal',
  kind: 'magic',
  element: 'light',
  effect: 'heal',
  power: 200,
  mpCost: 8,
  range: 4,
  areaRadius: 1,
  heightTolerance: 2,
  castSpeed: 50,
};

/** 大癒し: 単体の回復魔法。回復量が大きく、詠唱は癒しより遅い */
export const bigHeal: SpellDefinition = {
  id: 'bigHeal',
  kind: 'magic',
  element: 'light',
  effect: 'heal',
  power: 350,
  mpCost: 12,
  range: 4,
  areaRadius: 0,
  heightTolerance: 0,
  castSpeed: 34,
};

/**
 * 狙い撃ち: 弓の溜め撃ち。詠唱（狙いを付ける時間）があり、ダメージは攻撃力の 1.5 倍、射程は弓より 1 長い（3〜6）。
 * 魔法と同じく必ず当たる。ダメージには通常攻撃と同じ向きと高低差の補正が掛かる（フェーズ2-1b。高所や背面を取る意味を残すため）。弓が必要
 */
export const aimedShot: SpellDefinition = {
  id: 'aimedShot',
  kind: 'skill',
  element: 'none',
  effect: 'damage',
  stat: 'attack',
  directional: true,
  power: 150,
  mpCost: 0,
  range: 6,
  minRange: 3,
  areaRadius: 0,
  heightTolerance: 0,
  castSpeed: 50,
  weapons: ['bow'],
};

/** 封じ: 単体に沈黙を付ける魔法（ダメージはない）。詠唱は速い。相手が魔法を詠唱中なら、その詠唱は中断される */
export const seal: SpellDefinition = {
  id: 'seal',
  kind: 'magic',
  element: 'none',
  effect: 'status',
  inflicts: 'silence',
  power: 0,
  mpCost: 8,
  range: 4,
  areaRadius: 0,
  heightTolerance: 0,
  castSpeed: 50,
};

/** 守りの祈り: 中心と上下左右の5マスに守りを付ける魔法（敵も範囲内にいれば付く）。詠唱は速い。光属性 */
export const protectPrayer: SpellDefinition = {
  id: 'protectPrayer',
  kind: 'magic',
  element: 'light',
  effect: 'status',
  inflicts: 'protect',
  power: 0,
  mpCost: 10,
  range: 4,
  areaRadius: 1,
  heightTolerance: 2,
  castSpeed: 50,
};

/** 詠唱のある行動アビリティ（魔法と狙い撃ち） */
export const spells: readonly SpellDefinition[] = [fire, wind, thunder, heal, bigHeal, aimedShot, seal, protectPrayer];

/** 強打: 通常攻撃のダメージ 1.5 倍、命中率 -15。近接武器（剣・杖）が必要 */
export const powerStrike: StrikeDefinition = {
  id: 'powerStrike',
  damagePercent: 150,
  hitBonus: -15,
  weapons: ['sword', 'staff'],
};

/**
 * 突き飛ばし: 隣接する相手に小さなダメージ（通常攻撃の半分）を与え、1マス押し出す。命中率は通常攻撃と同じ。
 * 押し出した先が低ければ落下ダメージ、押し出せなければ追加のダメージ（数値は battleRules.ts の knockback）。
 * 相手が詠唱中なら、詠唱を中断させる。近接武器（剣・杖）が必要
 */
export const knockback: StrikeDefinition = {
  id: 'knockback',
  damagePercent: 50,
  hitBonus: 0,
  weapons: ['sword', 'staff'],
  knockback: true,
};

/** 足止めの矢: 小さなダメージ（通常攻撃の 60%）を与え、鈍足を付ける。命中率は通常攻撃と同じ。弓が必要 */
export const slowArrow: StrikeDefinition = {
  id: 'slowArrow',
  damagePercent: 60,
  hitBonus: 0,
  weapons: ['bow'],
  inflicts: 'slow',
};

/** すぐに出る技 */
export const strikes: readonly StrikeDefinition[] = [powerStrike, knockback, slowArrow];
