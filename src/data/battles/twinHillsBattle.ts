import type { GrowthValues, JobDefinition } from '../../core/battleTypes';
import type { BattleSite, EnemyTier } from '../../core/sortie';
import { archer, healer, mage, warrior } from '../jobs';
import { twinHills } from '../maps/twinHills';

/**
 * 「ふたつの丘」の戦場: 味方5体 対 敵5体。数値はすべて仮。
 * 配置は上下対称。味方は手前（z が大きい側）で奥を向き、敵は奥で手前を向く。前列に2体、後列に3体。
 * 味方は部隊の並び順（最初の5人なら 戦士・戦士・弓使い・魔術師・癒し手）に、playerSlots の順で置く。
 *
 * 敵の強さは3段階。段階ごとに、敵は決まったレベル・成長値・習得済みアビリティを持つ
 * （プレイヤーのレベルに合わせて変えない。育てる目的を作るため）。
 * 成長値は、そのジョブだけで (レベル − 1) 回レベルを上げた場合と同じにしている。
 */

/** job だけで levels 回レベルを上げた時の成長値 */
const grownBy = (job: JobDefinition, levels: number): GrowthValues => {
  const r = job.growth!;
  return {
    maxHp: r.maxHp * levels,
    maxMp: r.maxMp * levels,
    attack: r.attack * levels,
    magic: r.magic * levels,
    speed: r.speed * levels,
  };
};

/** 敵の段階。level のレベルで、abilities[ジョブ] の行動アビリティを習得している */
const tier = (id: string, level: number, abilities: Readonly<Record<string, readonly string[]>>): EnemyTier => {
  const unit = (id: string, job: JobDefinition, x: number, z: number) => ({
    id,
    jobId: job.id,
    x,
    z,
    facing: 'south' as const,
    level,
    growth: grownBy(job, level - 1),
    commands: [{ jobId: job.id, abilityIds: abilities[job.id] ?? [] }],
  });
  return {
    id,
    units: [
      unit('e-warrior-1', warrior, 3, 1),
      unit('e-warrior-2', warrior, 6, 1),
      unit('e-archer-1', archer, 5, 0),
      unit('e-mage-1', mage, 4, 0),
      unit('e-healer-1', healer, 6, 0),
    ],
  };
};

export const twinHillsBattle: BattleSite = {
  id: 'twin-hills',
  map: twinHills,
  playerSlots: [
    { x: 3, z: 8, facing: 'north' },
    { x: 6, z: 8, facing: 'north' },
    { x: 5, z: 9, facing: 'north' },
    { x: 4, z: 9, facing: 'north' },
    { x: 6, z: 9, facing: 'north' },
  ],
  tiers: [
    // やさしい: 最初の部隊と同じ強さ（レベル 1、最初から使えるアビリティだけ）
    tier('easy', 1, { mage: ['wind', 'fire'], healer: ['heal'] }),
    // ふつう: レベル 8。各ジョブの技を1つずつ覚えている
    tier('normal', 8, { warrior: ['powerStrike'], archer: ['aimedShot'], mage: ['wind', 'fire'], healer: ['heal', 'bigHeal'] }),
    // むずかしい: レベル 18。すべての行動アビリティを覚えている
    tier('hard', 18, {
      warrior: ['powerStrike'],
      archer: ['aimedShot'],
      mage: ['wind', 'fire', 'thunder'],
      healer: ['heal', 'bigHeal'],
    }),
  ],
};
