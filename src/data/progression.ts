import type { ProgressionRules } from '../core/progression';

/**
 * 育成の数値。すべて仮（バランス調整で変える）。計算は src/core/progression.ts。
 *
 * 成長値と成長の上限は、能力値の 1/100 を単位にした整数（100 で能力値 1）。
 * 成長の点数は、能力値 1 ぶんの成長を、HP と MP は 1 点、攻撃力と魔力は 4 点、素早さは 20 点と数える
 * （1レベルでおよそ 7〜8 点増える）。
 */
export const progressionRules: ProgressionRules = {
  maxLevel: 50,
  /** レベル L → L+1 に必要な経験値 = 60 + 4 × (L − 1)（レベル 1 → 2 は 60、49 → 50 は 252） */
  expBase: 60,
  expPerLevel: 4,
  /** 攻撃・魔法・技を1回実行するたびに 20 */
  expPerAction: 20,
  /** 攻撃・魔法・技を1回実行するたびに、今のジョブに 20 JP */
  jpPerAction: 20,
  /** 勝利すると、全員の今のジョブに 100 JP */
  jpVictoryBonus: 100,
  /** ジョブのレベル 2〜8 になる JP の累計 */
  jobLevelJp: [90, 220, 400, 620, 880, 1180, 1500],
  /**
   * 能力ごとの成長値の上限。1つのジョブだけでレベル 50 まで育てても届かない高さにしている
   * （例: HP の成長率が最も高い戦士の 49 レベルぶんは 14700）
   */
  growthCap: { maxHp: 18000, maxMp: 7500, attack: 3600, magic: 4200, speed: 500 },
  growthWeights: { maxHp: 1, maxMp: 1, attack: 4, magic: 4, speed: 20 },
  /**
   * 成長の点数の合計の上限。1つのジョブだけでレベル 50 まで育てると 360〜390 点ほどで、届かない。
   * 能力ごとの上限をすべて満たすと 667 点になるので、すべての能力を最大にはできない
   */
  growthTotalCap: 450,
};
