import type { AiConfig } from '../core/ai';

/** 敵 AI の設定。数値はすべて仮 */
export const aiConfig: AiConfig = {
  /** どちらの軍もこの手番数のあいだ攻撃や魔法を行わなければ、前進に切り替える（にらみ合いを防ぐ） */
  advanceAfterIdleTurns: 12,
  /** 癒し手は、HP が半分（50%）以下の味方がいれば回復する */
  healBelowPercent: 50,
  /**
   * 攻撃できない手番に、敵の攻撃が届くマスへ進む目安。そのマスから 3 歩以内にいる味方（癒し手を除く）の数が、
   * そのマスに攻撃を届かせられる敵の数以上なら、単独ではないとみなして進む。
   */
  supportRange: 3,
};
