import type { SpellDefinition } from '../core/battleTypes';

/**
 * 魔法の定義。数値はすべて仮（バランス調整で変える）。
 * 画面に出す魔法の名前は src/ui/text.ts に id で引けるようにまとめている。
 *
 * - power: 威力（%）。ダメージ・回復量 = 魔力 × 威力 ÷ 100（切り捨て）
 * - range: 射程（歩数）。areaRadius: 範囲（中心からの歩数。0 で単体、1 で中心と上下左右の5マス）
 * - heightTolerance: 高さの許容。中心のマスとの高さの差がこれを超えるマスには届かない
 * - castSpeed: 詠唱の速さ。ユニットの CT と同じ時計で毎回これだけ溜まり、100 に達すると発動する
 *   （素早さ 6〜7 のユニットが10体いると、時計が1回進むごとにおよそ 0.6 回ぶんの手番が入る）
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

export const spells: readonly SpellDefinition[] = [fire, wind, heal];
