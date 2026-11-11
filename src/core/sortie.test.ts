import { describe, expect, it } from 'vitest';
import { startBattle } from './battle';
import { ZERO_GROWTH, type Roster } from './progression';
import { buildSortie, interleaveTeams, swapPlacements, type BattleSite } from './sortie';
import { flat, testJobs, testRules, testSpells, testStrikes } from './testSupport';

const site: BattleSite = {
  id: 'test-site',
  map: { id: 'm', heights: flat(4, 4), terrain: ['gggg', 'gggg', 'gggg', 'gggg'], legend: { g: 'grass' } },
  playerSlots: [
    { x: 0, z: 3, facing: 'north' },
    { x: 1, z: 3, facing: 'north' },
  ],
  tiers: [
    {
      id: 'easy',
      units: [
        { id: 'e1', jobId: 'warrior', x: 0, z: 0, facing: 'south' },
        { id: 'e2', jobId: 'mage', x: 1, z: 0, facing: 'south', level: 5, growth: { ...ZERO_GROWTH, magic: 500 }, commands: [{ jobId: 'mage', abilityIds: ['fire'] }] },
      ],
    },
  ],
};
const unit = (id: string, jobId: string, patch = {}) => ({
  id,
  jobId,
  level: 1,
  exp: 0,
  growth: ZERO_GROWTH,
  jobs: { [jobId]: { jp: 0, jpTotal: 0, learned: [] as string[] } },
  slots: { secondary: null, reaction: null, support: null, movement: null },
  equipment: { weapon: null, armor: null, accessory: null },
  ...patch,
});

describe('出撃', () => {
  it('育成の数値を渡すと、味方は部隊の経験値と今のジョブの JP を持って出る（敵は持たない）', () => {
    const rules = {
      maxLevel: 50, expBase: 100, expPerLevel: 10, expPerAction: 10, expPerSupportAction: 15, expVictory: 20,
      expLevelOffset: 10, expLevelPercentMax: 200, jpPerAction: 20, jpVictoryBonus: 50, jobLevelJp: [100],
      growthCap: ZERO_GROWTH, growthWeights: ZERO_GROWTH, growthTotalCap: 0,
    };
    const roster: Roster = { gold: 0, items: [], nextItemSeq: 1, units: [unit('a', 'warrior', { exp: 42, jobs: { warrior: { jp: 30, jpTotal: 130, learned: [] } } })] };
    const setup = buildSortie(site, 'easy', roster, { jobs: testJobs, equipment: [] }, rules);
    expect(setup.progression).toBe(rules);
    const { state } = startBattle(setup, testJobs, testRules, 1, testSpells, testStrikes);
    expect(state.progression).toEqual(rules);
    expect(state.units.find((u) => u.id === 'a')!.progress).toEqual({ exp: 42, jp: 30, jpTotal: 130, gainedExp: 0, gainedJp: 0 });
    expect(state.units.find((u) => u.id === 'e1')!.progress).toBeNull();
    // 渡さなければ、戦闘中に経験値と JP は入らない
    expect(startBattle(buildSortie(site, 'easy', roster, { jobs: testJobs, equipment: [] }), testJobs, testRules, 1, testSpells, testStrikes).state.progression).toBeNull();
  });

  it('味方と敵を1体ずつ組にして、組ごとに先になる側を入れ替えて並べる', () => {
    expect(interleaveTeams(['p1', 'p2', 'p3'], ['e1', 'e2', 'e3'])).toEqual(['p1', 'e1', 'e2', 'p2', 'p3', 'e3']);
    expect(interleaveTeams(['p1'], ['e1', 'e2'])).toEqual(['p1', 'e1', 'e2']);
  });

  it('部隊の並び順に味方を置き、敵は選んだ段階の決まったレベル・成長値・アビリティで置く', () => {
    const roster: Roster = {
      gold: 0, items: [], nextItemSeq: 1,
      units: [
        unit('a', 'warrior', { level: 7, growth: { ...ZERO_GROWTH, maxHp: 1234 } }),
        unit('b', 'mage', { jobs: { mage: { jp: 0, jpTotal: 0, learned: ['wind'] } } }),
      ],
    };
    const setup = buildSortie(site, 'easy', roster, { jobs: testJobs, equipment: [] });
    expect(setup.units.map((u) => u.id)).toEqual(['a', 'e1', 'e2', 'b']);
    const { state } = startBattle(setup, testJobs, testRules, 1, testSpells, testStrikes);
    const a = state.units.find((u) => u.id === 'a')!;
    expect(a).toMatchObject({ team: 'player', x: 0, z: 3, level: 7 });
    expect(a.stats.maxHp).toBe(testJobs[0]!.stats.maxHp + 12);
    expect(state.units.find((u) => u.id === 'b')!.spells.map((s) => s.id)).toEqual(['wind']);
    const e2 = state.units.find((u) => u.id === 'e2')!;
    expect(e2).toMatchObject({ team: 'enemy', level: 5 });
    expect(e2.stats.magic).toBe(testJobs[2]!.stats.magic + 5);
    expect(e2.spells.map((s) => s.id)).toEqual(['fire']);
    expect(() => buildSortie(site, 'nope', roster, { jobs: testJobs, equipment: [] })).toThrow();
  });

  it('出撃前の配置: 味方2体の位置と向きを入れ替える（並び順は変えない）。敵や同じユニットとは入れ替えられない', () => {
    const roster: Roster = { gold: 0, items: [], nextItemSeq: 1, units: [unit('a', 'warrior'), unit('b', 'archer')] };
    const setup = buildSortie({ ...site, playerSlots: [{ x: 0, z: 3, facing: 'north' }, { x: 1, z: 2, facing: 'east' }] }, 'easy', roster, {
      jobs: testJobs,
      equipment: [],
    });
    const swapped = swapPlacements(setup, 'a', 'b');
    expect(swapped.units.map((u) => u.id)).toEqual(setup.units.map((u) => u.id));
    expect(swapped.units.find((u) => u.id === 'a')).toMatchObject({ x: 1, z: 2, facing: 'east' });
    expect(swapped.units.find((u) => u.id === 'b')).toMatchObject({ x: 0, z: 3, facing: 'north' });
    expect(swapPlacements(swapped, 'b', 'a')).toEqual(setup);
    expect(() => swapPlacements(setup, 'a', 'e1')).toThrow();
    expect(() => swapPlacements(setup, 'a', 'a')).toThrow();
  });

  it('戦場の勝敗条件・イベント・罠を、1戦の定義にそのまま渡す', () => {
    const setup = buildSortie(
      {
        ...site,
        objectives: { victory: [{ kind: 'defeatUnit', unitId: 'e2' }], defeat: [{ kind: 'allDefeated' }] },
        traps: [{ x: 2, z: 2, kind: 'drain' }],
        events: [{ id: 'm', trigger: { kind: 'turn', turn: 0 }, effects: [{ kind: 'message', messageId: 'x' }] }],
      },
      'easy',
      { gold: 0, items: [], nextItemSeq: 1, units: [unit('a', 'warrior')] },
      { jobs: testJobs, equipment: [] },
    );
    const { state } = startBattle(setup, testJobs, testRules, 1, testSpells, testStrikes);
    expect(state.scenario.objectives.victory).toEqual([{ kind: 'defeatUnit', unitId: 'e2' }]);
    expect(state.scenario.traps).toEqual([{ x: 2, z: 2, kind: 'drain', revealed: false }]);
    expect(state.scenario.events[0]!.fired).toBe(1);
  });
});
