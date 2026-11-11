import type { PassiveDefinition } from '../core/battleTypes';

/**
 * 受動的なアビリティ（リアクション・サポート・ムーブ）の定義。数値はすべて仮（バランス調整で変える）。
 * 画面に出す名前と説明は src/ui/text.ts に id で引けるようにまとめている。どのジョブで習得できるかは jobs.ts。
 * どのジョブで習得したものでも、ジョブを問わず付けられる（枠は、リアクション・サポート・ムーブを1つずつ）。
 *
 * - slot: reaction（特定の出来事に反応して自動で発動）、support（付けている間、常に効く）、movement（移動の能力）
 * - effect: 効果の種類と数値（計算は src/core/effects.ts と combat.ts）
 */

// ---- リアクション ----

/** 反撃（戦士）: 隣接するマスから近接攻撃を受けて生き残った時、通常攻撃で反撃する。反撃に対する反撃は起きない */
export const counter: PassiveDefinition = { id: 'counter', slot: 'reaction', effect: { kind: 'counter' } };

/** 身かわし（弓使い）: 正面と側面からの、武器による攻撃の命中率 -20 */
export const evade: PassiveDefinition = { id: 'evade', slot: 'reaction', effect: { kind: 'evade', hitPenalty: 20 } };

/** 魔力の殻（魔術師）: 魔法で受けるダメージ -20%（倍率 80%、切り捨て） */
export const magicShell: PassiveDefinition = {
  id: 'magicShell',
  slot: 'reaction',
  effect: { kind: 'magicShell', damageTakenPercent: 80 },
};

/** 瞑想（癒し手）: ダメージを受けて生き残った時、MP を 6 回復する（最大 MP まで） */
export const meditate: PassiveDefinition = { id: 'meditate', slot: 'reaction', effect: { kind: 'meditate', mp: 6 } };

// ---- サポート ----

/** 重装（戦士）: 最大 HP +15%（倍率 115%、切り捨て） */
export const heavyArmor: PassiveDefinition = {
  id: 'heavyArmor',
  slot: 'support',
  effect: { kind: 'maxHpPercent', percent: 115 },
};

/** 集中（弓使い）: 武器による攻撃の命中率 +10 */
export const focus: PassiveDefinition = { id: 'focus', slot: 'support', effect: { kind: 'weaponHitBonus', bonus: 10 } };

/** 早口（魔術師）: 詠唱の速さ +25%（倍率 125%、切り捨て） */
export const quickCast: PassiveDefinition = {
  id: 'quickCast',
  slot: 'support',
  effect: { kind: 'castSpeedPercent', percent: 125 },
};

/** 節約（癒し手）: 消費 MP -25%（倍率 75%、切り捨て） */
export const thrift: PassiveDefinition = { id: 'thrift', slot: 'support', effect: { kind: 'mpCostPercent', percent: 75 } };

// ---- ムーブ ----

/** 早足（戦士）: 移動力 +1 */
export const quickStep: PassiveDefinition = { id: 'quickStep', slot: 'movement', effect: { kind: 'moveBonus', amount: 1 } };

/** 身軽（弓使い）: ジャンプ力 +1 */
export const lightFoot: PassiveDefinition = { id: 'lightFoot', slot: 'movement', effect: { kind: 'jumpBonus', amount: 1 } };

export const passives: readonly PassiveDefinition[] = [
  counter,
  evade,
  magicShell,
  meditate,
  heavyArmor,
  focus,
  quickCast,
  thrift,
  quickStep,
  lightFoot,
];
