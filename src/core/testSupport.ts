/**
 * core のテスト用の部品。小さなマップとユニットで戦闘の状態を手早く組み立てる。
 * core は src/data を読み込まないので、テスト用の数値はここに置く（本番の数値は src/data）。
 */
import type { BattleRules, BattleState, ChargeState, JobDefinition, SpellDefinition, Team, UnitState } from './battleTypes';
import type { AiConfig, AiConfigs } from './ai';
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
  chargingDamagePercent: 125,
};

export const testWarrior: JobDefinition = {
  id: 'warrior',
  stats: { maxHp: 50, attack: 20, speed: 6, move: 3, jump: 2, maxMp: 0, magic: 0 },
  attack: { kind: 'melee', maxHeightDiff: 2 },
};

export const testArcher: JobDefinition = {
  id: 'archer',
  stats: { maxHp: 30, attack: 10, speed: 8, move: 3, jump: 2, maxMp: 0, magic: 0 },
  attack: { kind: 'ranged', minRange: 3, maxRange: 5, heightPerExtraRange: 2 },
};

/** 範囲の攻撃魔法（中心と上下左右の5マス、高さの許容 2）。詠唱は遅い */
export const testFire: SpellDefinition = {
  id: 'fire',
  element: 'fire',
  effect: 'damage',
  power: 200,
  mpCost: 10,
  range: 4,
  areaRadius: 1,
  heightTolerance: 2,
  castSpeed: 25,
};

/** 単体の攻撃魔法。詠唱は速い */
export const testWind: SpellDefinition = {
  id: 'wind',
  element: 'wind',
  effect: 'damage',
  power: 100,
  mpCost: 5,
  range: 4,
  areaRadius: 0,
  heightTolerance: 0,
  castSpeed: 50,
};

/** 範囲の回復魔法 */
export const testHeal: SpellDefinition = {
  id: 'heal',
  element: 'holy',
  effect: 'heal',
  power: 200,
  mpCost: 8,
  range: 4,
  areaRadius: 1,
  heightTolerance: 2,
  castSpeed: 50,
};

export const testSpells = [testFire, testWind, testHeal];

/** 魔力 10。炎は 20、風は 10 のダメージ */
export const testMage: JobDefinition = {
  id: 'mage',
  stats: { maxHp: 30, attack: 4, speed: 6, move: 3, jump: 2, maxMp: 30, magic: 10 },
  attack: { kind: 'melee', maxHeightDiff: 2 },
  spellIds: ['fire', 'wind'],
};

/** 魔力 10。癒しは 20 回復 */
export const testHealer: JobDefinition = {
  id: 'healer',
  stats: { maxHp: 30, attack: 4, speed: 6, move: 3, jump: 2, maxMp: 30, magic: 10 },
  attack: { kind: 'melee', maxHeightDiff: 2 },
  spellIds: ['heal'],
};

export const testJobs = [testWarrior, testArcher, testMage, testHealer];

export const testAi: AiConfig = { advanceAfterIdleTurns: 12, healBelowPercent: 50, supportRange: 3 };
export const testAiConfigs: AiConfigs = { player: testAi, enemy: testAi };

export interface TestUnit {
  id: string;
  team: Team;
  job?: JobDefinition;
  x: number;
  z: number;
  facing?: Direction;
  hp?: number;
  ct?: number;
  mp?: number;
  charging?: ChargeState;
  movedLastTurn?: boolean;
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
  turnNumber?: number;
  lastAggressionTurn?: number;
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
      mp: u.mp ?? job.stats.maxMp,
      spells: (job.spellIds ?? []).map((id) => testSpells.find((sp) => sp.id === id)!),
      charging: u.charging ?? null,
      movedLastTurn: u.movedLastTurn ?? false,
    };
  });
  const active = units.find((u) => u.id === (options.activeId ?? units[0]?.id));
  return {
    map,
    rules: testRules,
    units,
    turn: active
      ? {
          unitId: active.id,
          moved: false,
          acted: false,
          origin: { x: active.x, z: active.z, facing: active.facing },
          chargingAtStart: active.charging !== null,
        }
      : null,
    winner: null,
    rngState: options.seed ?? 1,
    turnNumber: options.turnNumber ?? 1,
    lastAggressionTurn: options.lastAggressionTurn ?? 0,
  };
}
