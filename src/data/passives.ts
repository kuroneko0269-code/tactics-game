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
export const counter: PassiveDefinition = { id: 'counter', slot: 'reaction', effect: { kind: 'counter', damagePercent: 75 } };

/** 身かわし（弓使い）: 正面と側面からの、武器による攻撃の命中率 -20 */
export const evade: PassiveDefinition = { id: 'evade', slot: 'reaction', effect: { kind: 'evade', hitPenalty: 20 } };

/** 魔力の殻（魔道士）: 魔法で受けるダメージ -20%（倍率 80%、切り捨て） */
export const magicShell: PassiveDefinition = {
  id: 'magicShell',
  slot: 'reaction',
  effect: { kind: 'magicShell', damageTakenPercent: 80 },
};

/** 瞑想（治癒師）: ダメージを受けて生き残った時、MP を 6 回復する（最大 MP まで） */
export const meditate: PassiveDefinition = { id: 'meditate', slot: 'reaction', effect: { kind: 'meditate', mp: 6 } };

// ---- サポート ----

/** 重装（戦士）: 最大 HP +15%（倍率 115%、切り捨て） */
export const heavyArmor: PassiveDefinition = {
  id: 'heavyArmor',
  slot: 'support',
  effect: { kind: 'maxHpPercent', percent: 110 },
};

/** 集中（弓使い）: 武器による攻撃の命中率 +10 */
export const focus: PassiveDefinition = { id: 'focus', slot: 'support', effect: { kind: 'weaponHitBonus', bonus: 10 } };

/** 早口（魔道士）: 詠唱の速さ +25%（倍率 125%、切り捨て） */
export const quickCast: PassiveDefinition = {
  id: 'quickCast',
  slot: 'support',
  effect: { kind: 'castSpeedPercent', percent: 125 },
};

/** 節約（治癒師）: 消費 MP -25%（倍率 75%、切り捨て） */
export const thrift: PassiveDefinition = { id: 'thrift', slot: 'support', effect: { kind: 'mpCostPercent', percent: 75 } };

// ---- ムーブ ----

/** 早足（戦士）: 移動力 +1 */
export const quickStep: PassiveDefinition = { id: 'quickStep', slot: 'movement', effect: { kind: 'moveBonus', amount: 1 } };

/** 身軽（弓使い）: ジャンプ力 +1 */
export const lightFoot: PassiveDefinition = { id: 'lightFoot', slot: 'movement', effect: { kind: 'jumpBonus', amount: 1 } };

// ---- 時守（フェーズ2-6）----

/** 踏みとどまる（リアクション）: HP が 0 になるダメージを受けた時、1戦に1度だけ HP 1 で耐える */
export const endure: PassiveDefinition = { id: 'endure', slot: 'reaction', effect: { kind: 'endure' } };

/** 時守の心得（サポート）: 待機した（移動も行動もしなかった）時に、手番の後の CT が 20 増える（40 → 60） */
export const timekeeperWisdom: PassiveDefinition = {
  id: 'timekeeperWisdom',
  slot: 'support',
  effect: { kind: 'waitCtBonus', amount: 20 },
};

// ---- 騎士・格闘家・盗賊（フェーズ2-6）----

/** かばう（騎士・リアクション）: 隣の味方が HP の半分以下の時、その味方への武器による攻撃を代わりに受ける */
export const cover: PassiveDefinition = { id: 'cover', slot: 'reaction', effect: { kind: 'cover' } };
/** 背水（騎士・サポート）: 背面からのダメージの補正（125%）を受けない */
export const backGuard: PassiveDefinition = { id: 'backGuard', slot: 'support', effect: { kind: 'backGuard' } };
/** 見切り（格闘家・リアクション）: 正面からの、武器による攻撃の命中率 -20 */
export const parry: PassiveDefinition = { id: 'parry', slot: 'reaction', effect: { kind: 'parry', hitPenalty: 20 } };
/** 鍛えた拳（格闘家・サポート）: 素手の時の攻撃力 +3 */
export const ironFist: PassiveDefinition = { id: 'ironFist', slot: 'support', effect: { kind: 'unarmedAttackBonus', amount: 3 } };
/** 逃げ足（盗賊・リアクション）: 武器による攻撃を受けて生き残った時、攻撃した相手から1マス離れる */
export const flee: PassiveDefinition = { id: 'flee', slot: 'reaction', effect: { kind: 'flee' } };
/** 俊足（盗賊・ムーブ）: 移動力 +2 */
export const swiftFeet: PassiveDefinition = { id: 'swiftFeet', slot: 'movement', effect: { kind: 'moveBonus', amount: 2 } };

// ---- 時魔道士・召喚士・魔法剣士（フェーズ2-6）----

/** 危機の加速（時魔道士・リアクション）: ダメージを受けて HP が 1/4 以下になった時、自分に加速が付く */
export const criticalHaste: PassiveDefinition = { id: 'criticalHaste', slot: 'reaction', effect: { kind: 'criticalHaste', divisor: 4 } };
/** 瞬間移動（時魔道士・ムーブ）: 段差とほかのユニットを無視して移動する（移動できる距離は移動力と同じ） */
export const teleport: PassiveDefinition = { id: 'teleport', slot: 'movement', effect: { kind: 'teleport' } };
/** 精霊の守り（召喚士・サポート）: 詠唱中に受けるダメージが増えない */
export const spiritWard: PassiveDefinition = { id: 'spiritWard', slot: 'support', effect: { kind: 'steadyCasting' } };
/** 魔力の刃（魔法剣士・サポート）: 魔力の 40% を攻撃力に加える */
export const manaBlade: PassiveDefinition = { id: 'manaBlade', slot: 'support', effect: { kind: 'magicToAttack', percent: 40 } };

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
  endure,
  timekeeperWisdom,
  cover,
  backGuard,
  parry,
  ironFist,
  flee,
  swiftFeet,
  criticalHaste,
  teleport,
  spiritWard,
  manaBlade,
];
