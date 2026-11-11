import type { BattleRules } from '../core/battleTypes';

/** 戦闘ルールの数値。すべて仮（バランス調整で変える）。百分率は整数で書く */
export const battleRules: BattleRules = {
  ctThreshold: 100,
  ctAfterMoveAndAct: 0,
  ctAfterMoveOrAct: 20,
  ctAfterWait: 40,
  hitPercent: { front: 85, side: 95, back: 100 },
  damagePercent: { front: 100, side: 100, back: 125 },
  heightDamagePercentPerStep: 5,
  heightDamagePercentCap: 20,
  minimumDamage: 1,
  chargingDamagePercent: 125,
  /**
   * 状態変化。turns は持続（付いたユニットの手番の回数。手番が終わるたびに 1 減る）。
   * harmful は付けられた側に不利な効果か（経験値の計算で、味方に使った行動かを見分ける）
   */
  status: {
    /** 守り: 受けるダメージ -25%（倍率 75%、切り捨て）。3手番 */
    protect: { harmful: false, turns: 3, damageTakenPercent: 75 },
    /** 鈍足: 移動力 -2（最低 1）。2手番 */
    slow: { harmful: true, turns: 2, movePenalty: 2, minMove: 1 },
    /** 沈黙: 魔法を使えない。付いた時に魔法を詠唱中なら、詠唱が中断される。2手番 */
    silence: { harmful: true, turns: 2 },
  },
  /**
   * 突き飛ばし。ダメージは押し出された相手の最大 HP に対する割合（切り捨て、最小 1）。守りが付いていれば減る。
   * 落下: 高さの差 1 につき 8%（高さの差 2 なら 16%）。押し出せない時（マップの外・ほかのユニット・登れない段差）: 8%
   */
  knockback: { fallDamagePercentPerHeight: 8, blockedDamagePercent: 8 },
  /** 罠。落石は最大 HP の 20% のダメージ（切り捨て、最小 1。守りで減る）。ぬかるみの鈍足は status.slow の数値 */
  trap: { rockfallDamagePercent: 20 },
  /** 武器を装備していない時（素手）の通常攻撃: 隣接マス、高さの差 2 以内（フェーズ2-4） */
  unarmedAttack: { kind: 'melee', maxHeightDiff: 2 },
};
