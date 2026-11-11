import { describe, expect, it } from 'vitest';
import {
  clearCount,
  EMPTY_DUNGEON_STATE,
  finishRunBattle,
  grantClearReward,
  normalizeDungeonState,
  retreat,
  startRun,
  type DungeonDefinition,
} from './dungeon';
import { ZERO_GROWTH, type Roster } from './progression';
import type { BattleSite } from './sortie';
import { flat } from './testSupport';

const site = (id: string): BattleSite => ({
  id,
  map: { id, heights: flat(2, 2), terrain: ['gg', 'gg'], legend: { g: 'grass' } },
  playerSlots: [],
  tiers: [{ id: 'main', units: [] }],
});
const dungeon: DungeonDefinition = { id: 'd', battles: [site('a'), site('b'), site('c')], clearRewardJp: 300 };

describe('連戦のダンジョン', () => {
  it('勝つと次の戦闘へ進み、最後の戦闘に勝つとクリア（挑戦を終え、回数を記録する）', () => {
    let state = startRun(EMPTY_DUNGEON_STATE, 'd');
    expect(state.run).toEqual({ dungeonId: 'd', battle: 0 });
    let r = finishRunBattle(state, dungeon, true);
    expect(r.outcome).toEqual({ kind: 'next', battle: 1 });
    r = finishRunBattle(r.state, dungeon, true);
    expect(r.outcome).toEqual({ kind: 'next', battle: 2 });
    r = finishRunBattle(r.state, dungeon, true);
    expect(r.outcome).toEqual({ kind: 'cleared', firstClear: true });
    expect(r.state).toEqual({ run: null, clears: { d: 1 } });
    // クリア後も何度でも挑める。2回目のクリアは初めてではない
    state = startRun(r.state, 'd');
    for (let i = 0; i < 2; i++) state = finishRunBattle(state, dungeon, true).state;
    r = finishRunBattle(state, dungeon, true);
    expect(r.outcome).toEqual({ kind: 'cleared', firstClear: false });
    expect(clearCount(r.state, 'd')).toBe(2);
  });

  it('負けたら進み具合はそのまま（同じ戦闘をやり直せる）。撤退すると挑戦を終える（クリアの記録は残る）', () => {
    const at2 = { run: { dungeonId: 'd', battle: 1 }, clears: { d: 3 } };
    const r = finishRunBattle(at2, dungeon, false);
    expect(r.outcome).toEqual({ kind: 'defeat', battle: 1 });
    expect(r.state).toEqual(at2);
    expect(retreat(r.state)).toEqual({ run: null, clears: { d: 3 } });
    // 挑戦していないダンジョンの戦闘は終えられない
    expect(() => finishRunBattle(EMPTY_DUNGEON_STATE, dungeon, true)).toThrow();
  });

  it('クリアの報酬: 全員の今のジョブに JP を配る', () => {
    const unit = (id: string, jobId: string) => ({
      id,
      jobId,
      level: 1,
      exp: 0,
      growth: ZERO_GROWTH,
      jobs: { [jobId]: { jp: 10, jpTotal: 50, learned: [] } },
      slots: { secondary: null, reaction: null, support: null, movement: null },
    });
    const roster: Roster = { units: [unit('a', 'warrior'), unit('b', 'mage')] };
    const after = grantClearReward(roster, dungeon);
    expect(after.units.map((u) => u.jobs[u.jobId])).toEqual([
      { jp: 310, jpTotal: 350, learned: [] },
      { jp: 310, jpTotal: 350, learned: [] },
    ]);
  });

  it('読み込んだ記録のうち、今はないダンジョンや範囲の外の戦闘への挑戦は取り消す', () => {
    expect(normalizeDungeonState({ run: { dungeonId: 'd', battle: 2 }, clears: {} }, [dungeon]).run).toEqual({ dungeonId: 'd', battle: 2 });
    expect(normalizeDungeonState({ run: { dungeonId: 'd', battle: 3 }, clears: { d: 1 } }, [dungeon])).toEqual({ run: null, clears: { d: 1 } });
    expect(normalizeDungeonState({ run: { dungeonId: 'x', battle: 0 }, clears: {} }, [dungeon]).run).toBeNull();
  });
});
