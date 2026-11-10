import { describe, expect, it } from 'vitest';
import { startBattle } from './battle';
import { ZERO_GROWTH, type Roster } from './progression';
import { buildSortie, interleaveTeams, type BattleSite } from './sortie';
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
  ...patch,
});

describe('出撃', () => {
  it('味方と敵を1体ずつ組にして、組ごとに先になる側を入れ替えて並べる', () => {
    expect(interleaveTeams(['p1', 'p2', 'p3'], ['e1', 'e2', 'e3'])).toEqual(['p1', 'e1', 'e2', 'p2', 'p3', 'e3']);
    expect(interleaveTeams(['p1'], ['e1', 'e2'])).toEqual(['p1', 'e1', 'e2']);
  });

  it('部隊の並び順に味方を置き、敵は選んだ段階の決まったレベル・成長値・アビリティで置く', () => {
    const roster: Roster = {
      units: [
        unit('a', 'warrior', { level: 7, growth: { ...ZERO_GROWTH, maxHp: 1234 } }),
        unit('b', 'mage', { jobs: { mage: { jp: 0, jpTotal: 0, learned: ['wind'] } } }),
      ],
    };
    const setup = buildSortie(site, 'easy', roster, { jobs: testJobs });
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
    expect(() => buildSortie(site, 'nope', roster, { jobs: testJobs })).toThrow();
  });
});
