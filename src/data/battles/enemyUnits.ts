import type { EquipmentDefinition, GrowthValues, JobDefinition, UnitPlacement, UnitStats } from '../../core/battleTypes';
import { bow1, bow2, bow3, heavy1, heavy2, heavy3, light1, light2, light3, robe1, robe2, robe3, staff1, staff2, staff3, sword1, sword2, sword3 } from '../equipment';

/** ジョブと強さの段階ごとの、武器と防具の組（敵の装備に使う） */
const KITS: Readonly<Record<string, readonly (readonly EquipmentDefinition[])[]>> = {
  warrior: [[sword1, heavy1], [sword2, heavy2], [sword3, heavy3]],
  archer: [[bow1, light1], [bow2, light2], [bow3, light3]],
  mage: [[staff1, robe1], [staff2, robe2], [staff3, robe3]],
  healer: [[staff1, robe1], [staff2, robe2], [staff3, robe3]],
};

/** そのジョブの、tier 段階目（1〜3）の武器と防具 */
export function kit(job: JobDefinition, tier: number): readonly EquipmentDefinition[] {
  const sets = KITS[job.id];
  if (!sets?.[tier - 1]) throw new Error(`${job.id} の ${tier} 段階目の装備がありません`);
  return sets[tier - 1]!;
}

/** そのジョブの、tier 段階目の武器だけ */
export function weaponOf(job: JobDefinition, tier: number): readonly EquipmentDefinition[] {
  return kit(job, tier).filter((e) => e.slot === 'weapon');
}
import type { Direction } from '../../core/geometry';

/** job だけで levels 回レベルを上げた時の成長値（敵の成長値は、そのジョブだけで育てた場合と同じにする） */
export const grownBy = (job: JobDefinition, levels: number): GrowthValues => {
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
 * 敵のユニット1体の配置。level のレベルで、abilities の行動アビリティを習得し、passives の受動的なアビリティを付けている。
 * 成長値は、そのジョブだけで (レベル − 1) 回上げた場合と同じ。equipment は付けている装備（フェーズ2-4。省くと素手で何も付けていない）。
 */
export function enemyUnit(options: {
  id: string;
  job: JobDefinition;
  x: number;
  z: number;
  level: number;
  facing?: Direction;
  abilities?: readonly string[];
  passives?: readonly string[];
  statBonus?: Partial<UnitStats>;
  equipment?: readonly EquipmentDefinition[];
}): Omit<UnitPlacement, 'team'> {
  const { id, job, x, z, level } = options;
  return {
    id,
    jobId: job.id,
    x,
    z,
    facing: options.facing ?? 'south',
    level,
    growth: grownBy(job, level - 1),
    commands: [{ jobId: job.id, abilityIds: options.abilities ?? [] }],
    passives: options.passives ?? [],
    statBonus: options.statBonus,
    equipment: options.equipment ?? [],
  };
}
