import { describe, expect, it } from 'vitest';
import { runAutoBattle } from './ai';
import { applyAction, judgeWinner, startBattle } from './battle';
import type { BattleAction, BattleSetup, BattleState } from './battleTypes';
import { flat, makeState, testAiConfigs, testArcher, testJobs, testRules, testWarrior } from './testSupport';

const setup: BattleSetup = {
  id: 'test-battle',
  map: {
    id: 'test-map',
    heights: [
      [0, 0, 0, 0, 0, 0],
      [0, 0, 1, 2, 0, 0],
      [0, 0, 2, 3, 1, 0],
      [0, 1, 1, 2, 0, 0],
      [0, 0, 0, 0, 0, 0],
      [0, 0, 0, 0, 0, 0],
    ],
    terrain: ['gggggg', 'gggggg', 'gggggg', 'gggggg', 'gggggg', 'gggggg'],
    legend: { g: 'grass' },
  },
  units: [
    { id: 'p1', team: 'player', jobId: 'warrior', x: 1, z: 5, facing: 'north' },
    { id: 'p2', team: 'player', jobId: 'archer', x: 4, z: 5, facing: 'north' },
    { id: 'e1', team: 'enemy', jobId: 'warrior', x: 4, z: 0, facing: 'south' },
    { id: 'e2', team: 'enemy', jobId: 'archer', x: 1, z: 0, facing: 'south' },
  ],
};

describe('startBattle', () => {
  it('定義データから状態を作り、最初の手番を始める', () => {
    const { state, events } = startBattle(setup, testJobs, testRules, 42);
    expect(state.units).toHaveLength(4);
    expect(state.units[0]).toMatchObject({ hp: testWarrior.stats.maxHp, stats: testWarrior.stats });
    // 素早さの高い弓使いのうち、並び順の早い p2 が最初
    expect(state.turn?.unitId).toBe('p2');
    expect(events).toEqual([{ type: 'turnStarted', unitId: 'p2', turnNumber: 1 }]);
  });

  it('状態はそのまま JSON に変換して戻せる', () => {
    const { state } = startBattle(setup, testJobs, testRules, 42);
    expect(JSON.parse(JSON.stringify(state))).toEqual(state);
  });

  it('存在しないジョブはエラー', () => {
    expect(() =>
      startBattle({ ...setup, units: [{ ...setup.units[0]!, jobId: 'nope' }] }, testJobs, testRules, 1),
    ).toThrow();
  });
});

describe('applyAction', () => {
  const duel = () =>
    makeState({
      heights: flat(5, 5),
      units: [
        { id: 'a', team: 'player', x: 2, z: 4, facing: 'north' },
        { id: 'e', team: 'enemy', x: 2, z: 1, facing: 'north', hp: 10 },
        { id: 'e2', team: 'enemy', x: 4, z: 0, facing: 'south' },
      ],
    });

  it('移動 → 攻撃 → 向きを決めて終了。両方したので CT は 0', () => {
    let state = duel();
    let r = applyAction(state, { type: 'move', x: 2, z: 2 });
    expect(r.events).toEqual([
      { type: 'moved', unitId: 'a', path: [{ x: 2, z: 4 }, { x: 2, z: 3 }, { x: 2, z: 2 }] },
    ]);
    state = r.state;
    expect(state.units[0]).toMatchObject({ x: 2, z: 2, facing: 'north' });

    r = applyAction(state, { type: 'attack', targetId: 'e' });
    const attack = r.events[0]!;
    // 北を向いた相手を南から攻撃 → 背面。命中率 100%
    expect(attack).toMatchObject({ type: 'attacked', side: 'back', hitPercent: 100, hit: true, damage: 10, targetHp: 0 });
    expect(r.events[1]).toEqual({ type: 'defeated', unitId: 'e' });
    state = r.state;

    r = applyAction(state, { type: 'endTurn', facing: 'east' });
    expect(r.events[0]).toEqual({ type: 'turnEnded', unitId: 'a', facing: 'east', ct: 0 });
    expect(r.events[1]).toMatchObject({ type: 'turnStarted' });
    expect(r.state.units[0]).toMatchObject({ facing: 'east' });
  });

  it('攻撃 → 移動の順でもできる。片方だけなら CT 20、待機なら CT 40', () => {
    const attacked = applyAction(
      makeState({
        heights: flat(5, 5),
        units: [
          { id: 'a', team: 'player', x: 2, z: 2 },
          { id: 'e', team: 'enemy', x: 2, z: 1 },
        ],
      }),
      { type: 'attack', targetId: 'e' },
    ).state;
    expect(applyAction(attacked, { type: 'move', x: 2, z: 4 }).state.units[0]).toMatchObject({ x: 2, z: 4 });
    expect(applyAction(attacked, { type: 'endTurn', facing: 'north' }).events[0]).toMatchObject({ ct: 20 });
    expect(applyAction(duel(), { type: 'endTurn', facing: 'north' }).events[0]).toMatchObject({ ct: 40 });
  });

  it('移動も攻撃も1回まで', () => {
    const moved = applyAction(duel(), { type: 'move', x: 2, z: 3 }).state;
    expect(() => applyAction(moved, { type: 'move', x: 2, z: 2 })).toThrow();
  });

  it('届かない相手や味方は攻撃できず、移動範囲外には移動できない', () => {
    expect(() => applyAction(duel(), { type: 'attack', targetId: 'e' })).toThrow();
    expect(() => applyAction(duel(), { type: 'move', x: 2, z: 0 })).toThrow();
  });

  it('攻撃する前なら移動を取り消せる。攻撃した後は取り消せない', () => {
    const moved = applyAction(duel(), { type: 'move', x: 1, z: 2 }).state;
    const undone = applyAction(moved, { type: 'undoMove' });
    expect(undone.events).toEqual([{ type: 'moveUndone', unitId: 'a', x: 2, z: 4, facing: 'north' }]);
    expect(undone.state.units[0]).toMatchObject({ x: 2, z: 4, facing: 'north' });
    expect(undone.state.turn).toMatchObject({ moved: false });
    // 取り消した後は、もう一度移動できる
    expect(() => applyAction(undone.state, { type: 'move', x: 2, z: 2 })).not.toThrow();

    const attacked = applyAction(applyAction(duel(), { type: 'move', x: 2, z: 2 }).state, {
      type: 'attack',
      targetId: 'e',
    }).state;
    expect(() => applyAction(attacked, { type: 'undoMove' })).toThrow();
  });

  it('命中は乱数で決まり、乱数の状態は戦闘の状態に保存される', () => {
    // 正面（85%）からの攻撃を、シード値を変えて何度も試すと、当たりも外れも出る
    const results = new Set<boolean>();
    for (let seed = 1; seed <= 40; seed++) {
      const state = makeState({
        heights: flat(3, 3),
        seed,
        units: [
          { id: 'a', team: 'player', x: 1, z: 2 },
          { id: 'e', team: 'enemy', x: 1, z: 1, facing: 'south' },
        ],
      });
      const r = applyAction(state, { type: 'attack', targetId: 'e' });
      const ev = r.events[0];
      if (ev?.type === 'attacked') results.add(ev.hit);
      expect(r.state.rngState).not.toBe(state.rngState);
    }
    expect(results).toEqual(new Set([true, false]));
  });

  it('決着後は行動できない', () => {
    const state = makeState({
      heights: flat(3, 3),
      units: [
        { id: 'a', team: 'player', x: 1, z: 2 },
        { id: 'e', team: 'enemy', x: 1, z: 1, facing: 'north', hp: 1 },
      ],
    });
    const r = applyAction(state, { type: 'attack', targetId: 'e' });
    expect(r.events.at(-1)).toEqual({ type: 'battleEnded', winner: 'player' });
    expect(r.state.winner).toBe('player');
    expect(r.state.turn).toBeNull();
    expect(() => applyAction(r.state, { type: 'endTurn', facing: 'north' })).toThrow();
  });
});

describe('勝敗判定', () => {
  const units = (playerHp: number, enemyHp: number) =>
    makeState({
      heights: flat(3, 3),
      units: [
        { id: 'p1', team: 'player', x: 0, z: 0, hp: playerHp },
        { id: 'p2', team: 'player', job: testArcher, x: 1, z: 0, hp: playerHp },
        { id: 'e1', team: 'enemy', x: 2, z: 2, hp: enemyHp },
      ],
    });
  it('敵が全滅したら味方の勝ち、味方が全滅したら敵の勝ち、どちらも残っていれば決着していない', () => {
    expect(judgeWinner(units(10, 0))).toBe('player');
    expect(judgeWinner(units(0, 10))).toBe('enemy');
    expect(judgeWinner(units(10, 10))).toBeNull();
  });
});

describe('再現性', () => {
  it('同じシード値と同じ行動の列から、同じ結果になる', () => {
    const first = runAutoBattle(startBattle(setup, testJobs, testRules, 2024).state, 500, testAiConfigs);
    // 記録した行動の列を、同じシード値の初期状態にもう一度与える
    let replayed: BattleState = startBattle(setup, testJobs, testRules, 2024).state;
    const replayedEvents = [];
    for (const action of first.actions) {
      const r = applyAction(replayed, action);
      replayedEvents.push(...r.events);
      replayed = r.state;
    }
    expect(replayed).toEqual(first.state);
    expect(first.state.winner).not.toBeNull();
  });

  it('同じ状態に同じ行動を与えると、何度やっても同じ出来事と状態になる', () => {
    const start = startBattle(setup, testJobs, testRules, 7).state;
    const actions: BattleAction[] = [{ type: 'endTurn', facing: 'west' }];
    const a = applyAction(start, actions[0]!);
    const b = applyAction(start, actions[0]!);
    expect(a).toEqual(b);
  });

  it('シード値が違えば、結果が変わりうる', () => {
    const outcomes = new Set<string>();
    for (let seed = 1; seed <= 10; seed++) {
      outcomes.add(JSON.stringify(runAutoBattle(startBattle(setup, testJobs, testRules, seed).state, 500, testAiConfigs).state.units));
    }
    expect(outcomes.size).toBeGreaterThan(1);
  });
});
