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
    // ---- フェーズ2-6 ----
    /** 攻撃力低下: 攻撃力 -25%（倍率 75%、切り捨て）。3手番 */
    attackDown: { harmful: true, turns: 3, percent: 75 },
    /** 魔力低下: 魔力 -25%。3手番 */
    magicDown: { harmful: true, turns: 3, percent: 75 },
    /** 素早さ低下: 素早さ -25%（最低 1）。3手番 */
    speedDown: { harmful: true, turns: 3, percent: 75 },
    /** 最大 HP 低下: 最大 HP -20%（今の HP は新しい最大まで下がる。消えても戻らない）。3手番 */
    maxHpDown: { harmful: true, turns: 3, percent: 80 },
    /** 加速: 素早さ +50%（倍率 150%）。3手番 */
    haste: { harmful: false, turns: 3, percent: 150 },
    /** 目くらまし: 武器による攻撃の命中率 -30。3手番 */
    blind: { harmful: true, turns: 3, hitPenalty: 30 },
    /** 停止: 次の手番が何もできずに過ぎる（その後の CT は 0）。1手番 */
    stop: { harmful: true, turns: 1, ctAfterSkip: 0 },
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
  /**
   * 戦闘不能（フェーズ2-5）: HP が 0 になると、倒れた姿でマスに残る。カウントは 3 から始まり、
   * そのユニットの手番が来るはずだった時（CT が 100 に達した時）に 1 減って CT は 0 に戻る。0 で退場（マップから消える）
   */
  knockout: { count: 3, ctAfterTick: 0 },
  /**
   * 盗み（フェーズ2-6）: 成功率は、相手から見た盗む側の位置で決まる（正面 30%、側面 55%、背面 80%）。
   * ゴールドは 20 + 10 × 相手のレベル
   */
  steal: { percent: { front: 30, side: 55, back: 80 }, goldBase: 20, goldPerLevel: 10 },
};
