import type { EquipmentDefinition, GrowthValues, JobDefinition, UnitStats } from '../../core/battleTypes';
import type { BattleReward } from '../../core/shop';
import type { BattleSite, EnemyTier } from '../../core/sortie';
import { quickRing, quietAmulet, springBoots, steadyBangle } from '../equipment';
import { archer, healer, mage, warrior } from '../jobs';
import { twinHills } from '../maps/twinHills';
import { kit, weaponOf } from './enemyUnits';

/**
 * 「ふたつの丘」の戦場: 味方5体 対 敵5体。数値はすべて仮。
 * 配置は上下対称。味方は手前（z が大きい側）で奥を向き、敵は奥で手前を向く。前列に2体、後列に3体。
 * 味方は部隊の並び順（最初の5人なら 戦士・戦士・弓使い・魔術師・癒し手）に、playerSlots の順で置く。
 *
 * 敵の強さは3段階。段階ごとに、敵は決まったレベル・成長値・習得済みアビリティを持つ
 * （プレイヤーのレベルに合わせて変えない。育てる目的を作るため）。
 * 成長値は、そのジョブだけで (レベル − 1) 回レベルを上げた場合と同じにしている。
 * 装備（フェーズ2-4）: やさしい は1段階目の武器だけ（防具なし。癒し手は杖もなし）、ふつう は2段階目の武器と防具、
 * むずかしい は3段階目の武器と防具と装飾品。勝った時の報酬（ゴールドと戦利品の候補）も段階ごとに決める。
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

/**
 * 敵の段階。level のレベルで、abilities[ジョブ] の行動アビリティを習得し、passives[ジョブ] の受動的なアビリティを付けている
 */
const tier = (
  id: string,
  level: number,
  abilities: Readonly<Record<string, readonly string[]>>,
  passives: Readonly<Record<string, readonly string[]>>,
  equipment: (job: JobDefinition) => readonly EquipmentDefinition[],
  reward: BattleReward,
  statBonus: Readonly<Record<string, Partial<UnitStats>>> = {},
): EnemyTier => {
  const unit = (id: string, job: JobDefinition, x: number, z: number) => ({
    id,
    jobId: job.id,
    x,
    z,
    facing: 'south' as const,
    level,
    growth: grownBy(job, level - 1),
    commands: [{ jobId: job.id, abilityIds: abilities[job.id] ?? [] }],
    passives: passives[job.id] ?? [],
    statBonus: statBonus[job.id],
    equipment: equipment(job),
  });
  return {
    id,
    reward,
    units: [
      unit('e-warrior-1', warrior, 3, 1),
      unit('e-warrior-2', warrior, 6, 1),
      unit('e-archer-1', archer, 5, 0),
      unit('e-mage-1', mage, 4, 0),
      unit('e-healer-1', healer, 6, 0),
    ],
  };
};

/** 「むずかしい」の敵の装飾品 */
const HARD_ACCESSORY: Readonly<Record<string, EquipmentDefinition>> = {
  warrior: springBoots,
  archer: quickRing,
  mage: steadyBangle,
  healer: quietAmulet,
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
    // やさしい: 最初の部隊とほぼ同じ（レベル 1、最初から使えるアビリティだけ、受動的なアビリティなし）。
    // ただし防具を付けておらず、癒し手は杖も持たない（ほかは1段階目の武器だけ）。育てていない部隊でも7割ほど勝てるように
    // （フェーズ2-1b では「敵の癒し手の MP 16」という能力値の補正で表していた調整を、フェーズ2-4 で装備に置き換えた）
    tier('easy', 1, { mage: ['wind', 'fire'], healer: ['heal'] }, {}, (job) => (job.id === 'healer' ? [] : weaponOf(job, 1)), {
      gold: 100,
      loot: [
        { itemId: 'spring-boots', percent: 8 },
        { itemId: 'mana-charm', percent: 8 },
        { itemId: 'sword-1', percent: 10 },
        { itemId: 'bow-1', percent: 10 },
        { itemId: 'staff-1', percent: 10 },
      ],
    }),
    // ふつう: レベル 8。各ジョブの技を覚えていて、受動的なアビリティを1つずつ付けている。2段階目の武器と防具
    tier(
      'normal',
      8,
      {
        warrior: ['powerStrike', 'knockback'],
        archer: ['aimedShot', 'slowArrow'],
        mage: ['wind', 'fire', 'seal'],
        healer: ['heal', 'bigHeal', 'protectPrayer'],
      },
      { warrior: ['quickStep'], archer: ['focus'], mage: ['magicShell'], healer: ['meditate'] },
      (job) => kit(job, 2),
      {
        gold: 300,
        loot: ['sword-2', 'bow-2', 'staff-2', 'heavy-2', 'light-2', 'robe-2'].map((itemId) => ({ itemId, percent: 6 })).concat([
          { itemId: 'quick-ring', percent: 3 },
        ]),
      },
    ),
    // むずかしい: レベル 18。すべての行動アビリティを覚えていて、付けられる受動的なアビリティをすべて付けている。
    // 3段階目の武器と防具と、装飾品（戦士 跳ね靴、弓使い 早駆けの指輪、魔術師 不動の腕輪、癒し手 静寂よけの護符）
    tier(
      'hard',
      18,
      {
        warrior: ['powerStrike', 'knockback'],
        archer: ['aimedShot', 'slowArrow'],
        mage: ['wind', 'fire', 'thunder', 'seal'],
        healer: ['heal', 'bigHeal', 'protectPrayer'],
      },
      {
        warrior: ['counter', 'heavyArmor', 'quickStep'],
        archer: ['evade', 'focus', 'lightFoot'],
        mage: ['magicShell', 'quickCast'],
        healer: ['meditate', 'thrift'],
      },
      (job) => [...kit(job, 3), HARD_ACCESSORY[job.id]!],
      {
        gold: 500,
        loot: ['sword-3', 'bow-3', 'staff-3', 'heavy-3', 'light-3', 'robe-3'].map((itemId) => ({ itemId, percent: 5 })).concat([
          { itemId: 'swift-boots', percent: 5 },
          { itemId: 'steady-bangle', percent: 5 },
        ]),
      },
    ),
  ],
};
