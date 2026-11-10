import { describe, expect, it } from 'vitest';
import { ctAfterTurn, nextTimelineEntry, predictTimeline, predictTurnOrder } from './turnOrder';
import type { BattleRules, UnitState } from './battleTypes';
import { flat, makeState, testArcher, testFire, testMage, testRules, testWarrior, testWind } from './testSupport';

/** 次の手番のユニットまで時計を進める（魔法の発動は無い前提） */
function advanceToNextTurn(units: readonly UnitState[], rules: BattleRules) {
  const { units: next, entry } = nextTimelineEntry(units, rules);
  if (entry.kind !== 'turn') throw new Error('魔法の発動が先に来ました');
  return { units: next, unitId: entry.unitId };
}

describe('行動順（CT 方式）', () => {
  it('素早さを足し続け、CT が 100 に達したユニットが行動する', () => {
    const state = makeState({
      heights: flat(3, 3),
      units: [
        { id: 'slow', team: 'player', job: testWarrior, x: 0, z: 0 }, // 素早さ 6 → 17 回目で 102
        { id: 'fast', team: 'enemy', job: testArcher, x: 2, z: 2 }, // 素早さ 8 → 13 回目で 104
      ],
    });
    const next = advanceToNextTurn(state.units, testRules);
    expect(next.unitId).toBe('fast');
    expect(next.units.find((u) => u.id === 'fast')!.ct).toBe(104);
    expect(next.units.find((u) => u.id === 'slow')!.ct).toBe(78);
  });

  it('同時に達したら CT の大きい方、それも同じなら素早さの高い方、それも同じなら並び順の早い方', () => {
    const state = makeState({
      heights: flat(3, 3),
      units: [
        { id: 'a', team: 'player', x: 0, z: 0, ct: 100 },
        { id: 'b', team: 'enemy', x: 1, z: 0, ct: 100 },
        { id: 'c', team: 'enemy', job: testArcher, x: 2, z: 0, ct: 100 },
        { id: 'd', team: 'enemy', x: 2, z: 2, ct: 101 },
      ],
    });
    expect(advanceToNextTurn(state.units, testRules).unitId).toBe('d');
    const withoutD = state.units.filter((u) => u.id !== 'd');
    expect(advanceToNextTurn(withoutD, testRules).unitId).toBe('c');
    const onlyAB = withoutD.filter((u) => u.id !== 'c');
    expect(advanceToNextTurn(onlyAB, testRules).unitId).toBe('a');
  });

  it('戦闘不能のユニットは CT が増えず、行動しない', () => {
    const state = makeState({
      heights: flat(3, 3),
      units: [
        { id: 'dead', team: 'player', x: 0, z: 0, ct: 120, hp: 0 },
        { id: 'alive', team: 'enemy', x: 1, z: 0 },
      ],
    });
    const next = advanceToNextTurn(state.units, testRules);
    expect(next.unitId).toBe('alive');
    expect(next.units[0]!.ct).toBe(120);
  });

  it('手番の後の CT: 移動と行動の両方で 0、片方だけで 20、待機で 40', () => {
    expect(ctAfterTurn(testRules, true, true)).toBe(0);
    expect(ctAfterTurn(testRules, true, false)).toBe(20);
    expect(ctAfterTurn(testRules, false, true)).toBe(20);
    expect(ctAfterTurn(testRules, false, false)).toBe(40);
  });

  it('行動順の予測: 先頭は今の手番のユニット。今の手番のユニットは、ここまでの移動・行動に応じた CT に戻るものとして数える', () => {
    const state = makeState({
      heights: flat(3, 3),
      units: [
        { id: 'slow', team: 'player', job: testWarrior, x: 0, z: 0, ct: 100 },
        { id: 'fast', team: 'enemy', job: testArcher, x: 2, z: 2 },
      ],
    });
    // まだ何もしていない → 待機の CT 40 から数えるので、slow がもう一度先に動く
    expect(predictTurnOrder(state, 4)).toEqual(['slow', 'slow', 'fast', 'fast']);
    // 移動と行動を済ませた後なら CT 0 から数える
    const done = { ...state, turn: { ...state.turn!, moved: true, acted: true } };
    expect(predictTurnOrder(done, 3)).toEqual(['slow', 'fast', 'slow']);
    expect(predictTurnOrder(state, 8)).toHaveLength(8);
  });

  it('詠唱中の魔法も同じ時計で進む。同じ時点なら、魔法の発動がユニットの手番より先', () => {
    const state = makeState({
      heights: flat(3, 3),
      units: [
        { id: 'm', team: 'player', job: testMage, x: 0, z: 0, ct: 0, charging: { spellId: 'wind', target: { kind: 'tile', x: 2, z: 2 }, progress: 50 } },
        // 1 回進むと CT 100、風も 100 になる
        { id: 'w', team: 'enemy', job: testWarrior, x: 2, z: 2, ct: 94 },
      ],
    });
    const next = nextTimelineEntry(state.units, testRules);
    expect(next.entry).toEqual({ kind: 'spell', casterId: 'm', spellId: testWind.id });
    expect(next.units.find((u) => u.id === 'm')!.charging!.progress).toBe(100);
    expect(next.units.find((u) => u.id === 'w')!.ct).toBe(100);
  });

  it('魔法どうしが同時なら、進み具合の大きい方が先', () => {
    const state = makeState({
      heights: flat(3, 3),
      units: [
        { id: 'a', team: 'player', job: testMage, x: 0, z: 0, charging: { spellId: 'fire', target: { kind: 'tile', x: 2, z: 2 }, progress: 75 } },
        { id: 'b', team: 'enemy', job: testMage, x: 2, z: 2, charging: { spellId: 'wind', target: { kind: 'tile', x: 0, z: 0 }, progress: 55 } },
      ],
    });
    // 1 回進むと a は 100、b は 105
    expect(nextTimelineEntry(state.units, testRules).entry).toMatchObject({ casterId: 'b' });
  });

  it('予測: 詠唱中のユニットは、手番が来ても待機して詠唱を続けるものとして数える', () => {
    const state = makeState({
      heights: flat(3, 3),
      units: [
        { id: 'w', team: 'player', job: testWarrior, x: 0, z: 0, ct: 100 },
        { id: 'm', team: 'enemy', job: testMage, x: 2, z: 2, ct: 90, charging: { spellId: testFire.id, target: { kind: 'tile', x: 0, z: 0 }, progress: 0 } },
      ],
    });
    const timeline = predictTimeline(state, 5);
    expect(timeline[0]).toEqual({ kind: 'turn', unitId: 'w' });
    expect(timeline).toContainEqual({ kind: 'spell', casterId: 'm', spellId: 'fire' });
    // 手番だけを取り出した予測には、魔法の発動は入らない
    expect(predictTurnOrder(state, 5).every((id) => id === 'w' || id === 'm')).toBe(true);
  });
});
