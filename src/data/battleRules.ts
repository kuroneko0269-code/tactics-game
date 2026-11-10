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
};
