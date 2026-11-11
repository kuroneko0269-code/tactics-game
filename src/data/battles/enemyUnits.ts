import type { GrowthValues, JobDefinition, UnitPlacement, UnitStats } from '../../core/battleTypes';
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
 * 成長値は、そのジョブだけで (レベル − 1) 回上げた場合と同じ。
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
  };
}
