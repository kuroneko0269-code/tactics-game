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
 * すぐに出るもの（strikes。強打）:
 * - damagePercent: 通常攻撃のダメージに掛ける倍率（%）。hitBonus: 命中率に足す値（%）
 */

/** 炎: 範囲の攻撃魔法。威力は高く、詠唱は遅い（発動までにほかのユニットの手番が2〜3回入る程度） */
export const fire: SpellDefinition = {
  id: 'fire',
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
 * 魔法と同じく必ず当たり、向きと高低差の補正は受けない。弓が必要
 */
export const aimedShot: SpellDefinition = {
  id: 'aimedShot',
  element: 'none',
  effect: 'damage',
  stat: 'attack',
  power: 150,
  mpCost: 0,
  range: 6,
  minRange: 3,
  areaRadius: 0,
  heightTolerance: 0,
  castSpeed: 50,
  weapons: ['bow'],
};

/** 詠唱のある行動アビリティ（魔法と狙い撃ち） */
export const spells: readonly SpellDefinition[] = [fire, wind, thunder, heal, bigHeal, aimedShot];

/** 強打: 通常攻撃のダメージ 1.5 倍、命中率 -15。近接武器（剣・杖）が必要 */
export const powerStrike: StrikeDefinition = {
  id: 'powerStrike',
  damagePercent: 150,
  hitBonus: -15,
  weapons: ['sword', 'staff'],
};

/** すぐに出る技 */
export const strikes: readonly StrikeDefinition[] = [powerStrike];
