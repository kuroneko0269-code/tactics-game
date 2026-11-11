/**
 * core のテスト用の部品。小さなマップとユニットで戦闘の状態を手早く組み立てる。
 * core は src/data を読み込まないので、テスト用の数値はここに置く（本番の数値は src/data）。
 */
import { applyAction } from './battle';
import type {
  ActionResult,
  BattleAction,
  BattleRules,
  BattleState,
  ChargeState,
  GrowthValues,
  JobDefinition,
  PassiveDefinition,
  ProgressionRules,
  ScenarioState,
  SpellDefinition,
  StatusState,
  StrikeDefinition,
  Team,
  UnitCommand,
  UnitProgressState,
  UnitState,
} from './battleTypes';
import { ZERO_GROWTH } from './progression';
import type { AiConfig, AiConfigs } from './ai';
import type { Direction } from './geometry';
import { createMap } from './map';
import { DEFAULT_OBJECTIVES } from './scenario';

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
  status: {
    protect: { harmful: false, turns: 3, damageTakenPercent: 75 },
    slow: { harmful: true, turns: 2, movePenalty: 2, minMove: 1 },
    silence: { harmful: true, turns: 2 },
  },
  knockback: { fallDamagePercentPerHeight: 10, blockedDamagePercent: 10 },
  trap: { rockfallDamagePercent: 20 },
};

export const testWarrior: JobDefinition = {
  id: 'warrior',
  stats: { maxHp: 50, attack: 20, speed: 6, move: 3, jump: 2, maxMp: 0, magic: 0 },
  attack: { kind: 'melee', maxHeightDiff: 2 },
  weapon: 'sword',
};

export const testArcher: JobDefinition = {
  id: 'archer',
  stats: { maxHp: 30, attack: 10, speed: 8, move: 3, jump: 2, maxMp: 0, magic: 0 },
  attack: { kind: 'ranged', minRange: 3, maxRange: 5, heightPerExtraRange: 2 },
  weapon: 'bow',
};

/** 強打: ダメージ 1.5 倍、命中率 -15。剣か杖が必要 */
export const testPowerStrike: StrikeDefinition = { id: 'powerStrike', damagePercent: 150, hitBonus: -15, weapons: ['sword', 'staff'] };

/** 狙い撃ち: 攻撃力が元の、詠唱のある単体の技。射程 3〜6。弓が必要 */
export const testAimedShot: SpellDefinition = {
  id: 'aimedShot',
  kind: 'skill',
  element: 'none',
  effect: 'damage',
  stat: 'attack',
  directional: true,
  power: 150,
  mpCost: 0,
  range: 6,
  minRange: 3,
  areaRadius: 0,
  heightTolerance: 0,
  castSpeed: 50,
  weapons: ['bow'],
};

/** 雷: 単体で威力が高く、詠唱の遅い攻撃魔法 */
export const testThunder: SpellDefinition = {
  id: 'thunder',
  kind: 'magic',
  element: 'thunder',
  effect: 'damage',
  power: 300,
  mpCost: 12,
  range: 4,
  areaRadius: 0,
  heightTolerance: 0,
  castSpeed: 20,
};

/** 大癒し: 単体で回復量が大きい */
export const testBigHeal: SpellDefinition = {
  id: 'bigHeal',
  kind: 'magic',
  element: 'light',
  effect: 'heal',
  power: 400,
  mpCost: 12,
  range: 4,
  areaRadius: 0,
  heightTolerance: 0,
  castSpeed: 34,
};

/** 範囲の攻撃魔法（中心と上下左右の5マス、高さの許容 2）。詠唱は遅い */
export const testFire: SpellDefinition = {
  id: 'fire',
  kind: 'magic',
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
  kind: 'magic',
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
  kind: 'magic',
  element: 'light',
  effect: 'heal',
  power: 200,
  mpCost: 8,
  range: 4,
  areaRadius: 1,
  heightTolerance: 2,
  castSpeed: 50,
};

/** 封じ: 単体に沈黙を付ける。詠唱は速い */
export const testSeal: SpellDefinition = {
  id: 'seal',
  kind: 'magic',
  element: 'none',
  effect: 'status',
  inflicts: 'silence',
  power: 0,
  mpCost: 8,
  range: 4,
  areaRadius: 0,
  heightTolerance: 0,
  castSpeed: 50,
};

/** 守りの祈り: 5マスに守りを付ける */
export const testProtectPrayer: SpellDefinition = {
  id: 'protectPrayer',
  kind: 'magic',
  element: 'light',
  effect: 'status',
  inflicts: 'protect',
  power: 0,
  mpCost: 10,
  range: 4,
  areaRadius: 1,
  heightTolerance: 2,
  castSpeed: 50,
};

/** 突き飛ばし: ダメージ 50%、1マス押し出す。剣か杖が必要 */
export const testKnockback: StrikeDefinition = {
  id: 'knockback',
  damagePercent: 50,
  hitBonus: 0,
  weapons: ['sword', 'staff'],
  knockback: true,
};

/** 足止めの矢: ダメージ 60%、鈍足を付ける。弓が必要 */
export const testSlowArrow: StrikeDefinition = { id: 'slowArrow', damagePercent: 60, hitBonus: 0, weapons: ['bow'], inflicts: 'slow' };

export const testSpells = [testFire, testWind, testHeal, testAimedShot, testThunder, testBigHeal, testSeal, testProtectPrayer];
export const testStrikes = [testPowerStrike, testKnockback, testSlowArrow];

/** テスト用の受動的なアビリティ（本番の数値は src/data/passives.ts） */
export const testPassives: readonly PassiveDefinition[] = [
  { id: 'counter', slot: 'reaction', effect: { kind: 'counter' } },
  { id: 'evade', slot: 'reaction', effect: { kind: 'evade', hitPenalty: 20 } },
  { id: 'magicShell', slot: 'reaction', effect: { kind: 'magicShell', damageTakenPercent: 80 } },
  { id: 'meditate', slot: 'reaction', effect: { kind: 'meditate', mp: 6 } },
  { id: 'heavyArmor', slot: 'support', effect: { kind: 'maxHpPercent', percent: 115 } },
  { id: 'focus', slot: 'support', effect: { kind: 'weaponHitBonus', bonus: 10 } },
  { id: 'quickCast', slot: 'support', effect: { kind: 'castSpeedPercent', percent: 125 } },
  { id: 'thrift', slot: 'support', effect: { kind: 'mpCostPercent', percent: 75 } },
  { id: 'quickStep', slot: 'movement', effect: { kind: 'moveBonus', amount: 1 } },
  { id: 'lightFoot', slot: 'movement', effect: { kind: 'jumpBonus', amount: 1 } },
];

/** id の受動的なアビリティの定義（テスト用） */
export function testPassive(id: string): PassiveDefinition {
  const p = testPassives.find((x) => x.id === id);
  if (!p) throw new Error(`テスト用の受動的なアビリティ ${id} がありません`);
  return p;
}

/** 魔力 10。炎は 20、風は 10 のダメージ */
export const testMage: JobDefinition = {
  id: 'mage',
  stats: { maxHp: 30, attack: 4, speed: 6, move: 3, jump: 2, maxMp: 30, magic: 10 },
  attack: { kind: 'melee', maxHeightDiff: 2 },
  weapon: 'staff',
  abilities: [
    { id: 'fire', jpCost: 100 },
    { id: 'wind', jpCost: 0, starter: true },
  ],
};

/** 魔力 10。癒しは 20 回復 */
export const testHealer: JobDefinition = {
  id: 'healer',
  stats: { maxHp: 30, attack: 4, speed: 6, move: 3, jump: 2, maxMp: 30, magic: 10 },
  attack: { kind: 'melee', maxHeightDiff: 2 },
  weapon: 'staff',
  abilities: [{ id: 'heal', jpCost: 0, starter: true }],
};

export const testJobs = [testWarrior, testArcher, testMage, testHealer];

export const testAi: AiConfig = { advanceAfterIdleTurns: 12, healBelowPercent: 50, supportRange: 3, slowValue: 6, protectMinAllies: 2 };
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
  /** 使えるアビリティ（省くと、ジョブのアビリティすべてを主コマンドとして使える） */
  commands?: UnitCommand[];
  /** 付けている受動的なアビリティの id（testPassives から引く。能力値への反映はしない） */
  passives?: string[];
  statuses?: StatusState[];
  level?: number;
  levelDrops?: number;
  /** 経験値と JP の進み具合（渡すと、戦闘中に経験値と JP を得る。state の progression も要る） */
  progress?: UnitProgressState;
  growth?: GrowthValues;
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
  /** 勝敗条件・イベント・罠（省くと全滅の条件だけ） */
  scenario?: Partial<ScenarioState>;
  /** 育成の数値（渡すと、progress を持つユニットが戦闘中に経験値と JP を得る） */
  progression?: ProgressionRules;
}): BattleState {
  const map = createMap({
    id: 'test',
    heights: options.heights,
    terrain: options.heights.map((row) => 'g'.repeat(row.length)),
    legend: { g: 'grass' },
  });
  const units: UnitState[] = options.units.map((u) => {
    const job = u.job ?? testWarrior;
    const commands = u.commands ?? [{ jobId: job.id, abilityIds: (job.abilities ?? []).map((a) => a.id) }];
    const ids = commands.flatMap((c) => c.abilityIds);
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
      level: u.level ?? 1,
      levelDrops: u.levelDrops ?? 0,
      baseStats: job.stats,
      growth: u.growth ?? ZERO_GROWTH,
      growthRates: job.growth ?? ZERO_GROWTH,
      statBonus: {},
      progress: u.progress ?? null,
      weapon: job.weapon ?? null,
      commands,
      spells: testSpells.filter((sp) => ids.includes(sp.id)),
      strikes: testStrikes.filter((sp) => ids.includes(sp.id)),
      passives: (u.passives ?? []).map(testPassive),
      statuses: u.statuses ?? [],
      actionCount: 0,
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
    progression: options.progression ?? null,
    turnNumber: options.turnNumber ?? 1,
    lastAggressionTurn: options.lastAggressionTurn ?? 0,
    scenario: {
      objectives: DEFAULT_OBJECTIVES,
      events: [],
      traps: [],
      reinforcements: [],
      ...options.scenario,
    },
  };
}

/** seed を変えながら行動を適用し、条件に合う最初の結果を返す（当たり外れを決めるため） */
export function findSeed(state: BattleState, action: BattleAction, ok: (r: ActionResult) => boolean): ActionResult {
  for (let seed = 1; seed < 500; seed++) {
    const r = applyAction({ ...state, rngState: seed }, action);
    if (ok(r)) return r;
  }
  throw new Error('条件に合うシード値が見つかりません');
}
