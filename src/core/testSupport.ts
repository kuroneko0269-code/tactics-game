/**
 * core のテスト用の部品。小さなマップとユニットで戦闘の状態を手早く組み立てる。
 * core は src/data を読み込まないので、テスト用の数値はここに置く（本番の数値は src/data）。
 */
import type { BattleRules, BattleState, JobDefinition, Team, UnitState } from './battleTypes';
import type { Direction } from './geometry';
import { createMap } from './map';

export const testRules: BattleRules = {
  ctThreshold: 100,
  ctAfterMoveAndAct: 0,
  ctAfterMoveOrAct: 20,
  ctAfterWait: 40,
  hitPercent: { front: 85, side: 95, back: 100 },
  damagePercent: { front: 100, side: 100, back: 125 },
  heightDamagePercentPerStep: 5,
  heightDamagePercentCap: 20,
  minimumDamage: 1,
};

export const testWarrior: JobDefinition = {
  id: 'warrior',
  stats: { maxHp: 50, attack: 20, speed: 6, move: 3, jump: 2 },
  attack: { kind: 'melee', maxHeightDiff: 2 },
};

export const testArcher: JobDefinition = {
  id: 'archer',
  stats: { maxHp: 30, attack: 10, speed: 8, move: 3, jump: 2 },
  attack: { kind: 'ranged', minRange: 3, maxRange: 5, heightPerExtraRange: 2 },
};

export const testJobs = [testWarrior, testArcher];

export interface TestUnit {
  id: string;
  team: Team;
  job?: JobDefinition;
  x: number;
  z: number;
  facing?: Direction;
  hp?: number;
  ct?: number;
}

/** 平らなマップ（すべて高さ 0） */
export function flat(width: number, depth: number): number[][] {
  return Array.from({ length: depth }, () => Array.from({ length: width }, () => 0));
}

/**
 * 状態を組み立てる。手番は units の先頭のユニット（activeId で変えられる）。
 */
export function makeState(options: {
  heights: number[][];
  units: TestUnit[];
  activeId?: string;
  seed?: number;
}): BattleState {
  const map = createMap({
    id: 'test',
    heights: options.heights,
    terrain: options.heights.map((row) => 'g'.repeat(row.length)),
    legend: { g: 'grass' },
  });
  const units: UnitState[] = options.units.map((u) => {
    const job = u.job ?? testWarrior;
    return {
      id: u.id,
      team: u.team,
      jobId: job.id,
      x: u.x,
      z: u.z,
      facing: u.facing ?? 'south',
      hp: u.hp ?? job.stats.maxHp,
      ct: u.ct ?? 0,
      stats: job.stats,
      attack: job.attack,
    };
  });
  const active = units.find((u) => u.id === (options.activeId ?? units[0]?.id));
  return {
    map,
    rules: testRules,
    units,
    turn: active
      ? { unitId: active.id, moved: false, acted: false, origin: { x: active.x, z: active.z, facing: active.facing } }
      : null,
    winner: null,
    rngState: options.seed ?? 1,
    turnNumber: 1,
  };
}
