import { describe, expect, it } from 'vitest';
import { applyAction, getUnit, startBattle } from './battle';
import { chooseApproach, decideNextAction, runAutoBattle } from './ai';
import type { BattleEvent, BattleObjectives, BattleSetup, BattleState, MapEventDefinition, ObjectPlacement, UnitPlacement } from './battleTypes';
import { previewAttack } from './combat';
import { previewSpellAt } from './magic';
import { reachableTiles } from './movement';
import { judgeOutcome } from './scenario';
import { findSeed, flat, makeState, testAi, testAiConfigs, testJobs, testSpells, testStrikes } from './testSupport';

/**
 * 対象物（物語の土台）: どちらの陣営でもない、行動しない「物」。攻撃と魔法の対象にでき、壊れる。
 * 新しい勝利条件（物をすべて壊す・正面以外から攻撃を当てる）、会話と地形の変化のイベント、敵 AI の守り。
 */
function begin(options: {
  units?: UnitPlacement[];
  objects?: ObjectPlacement[];
  objectives?: BattleObjectives;
  events?: MapEventDefinition[];
  heights?: number[][];
  seed?: number;
}): { state: BattleState; events: readonly BattleEvent[] } {
  const heights = options.heights ?? flat(6, 6);
  const setup: BattleSetup = {
    id: 'test',
    map: { id: 'test', heights, terrain: heights.map((r) => 'g'.repeat(r.length)), legend: { g: 'grass', w: 'water' } },
    units: options.units ?? [
      { id: 'p1', team: 'player', jobId: 'warrior', x: 2, z: 3, facing: 'north' },
      { id: 'e1', team: 'enemy', jobId: 'warrior', x: 5, z: 0, facing: 'south' },
    ],
    objects: options.objects ?? [{ id: 'o1', kind: 'seam', x: 2, z: 2, hp: 10 }],
    objectives: options.objectives,
    events: options.events,
  };
  return startBattle(setup, testJobs, makeState({ heights: flat(1, 1), units: [] }).rules, options.seed ?? 1, testSpells, testStrikes);
}

/** 手番のユニットを p1 にした状態（素早さが同じなら配置の早い p1 が先に動く） */
const playerTurn = (r: { state: BattleState }) => {
  expect(r.state.turn?.unitId).toBe('p1');
  return r.state;
};

describe('対象物', () => {
  it('どちらの陣営でもなく、手番は来ない。マスはふさぐ', () => {
    const state = playerTurn(begin({}));
    const o = getUnit(state, 'o1');
    expect(o.team).toBe('neutral');
    expect(o.object).toEqual({ kind: 'seam' });
    expect(reachableTiles(state, getUnit(state, 'p1')).some((t) => t.x === 2 && t.z === 2)).toBe(false);
    let s = state;
    for (let i = 0; i < 20 && s.turn; i++) {
      expect(s.turn.unitId).not.toBe('o1');
      s = applyAction(s, { type: 'endTurn', facing: 'north' }).state;
    }
  });

  it('攻撃は必ず当たり（正面として数える）、HP が 0 になると壊れて消える（戦闘不能にはならない）', () => {
    const state = playerTurn(begin({ objects: [{ id: 'o1', kind: 'seam', x: 2, z: 2, hp: 3 }] }));
    const p = previewAttack(state, getUnit(state, 'p1'), getUnit(state, 'o1'));
    expect(p.hitPercent).toBe(100);
    expect(p.side).toBe('front');
    const r = applyAction(state, { type: 'attack', targetId: 'o1' });
    expect(r.events).toContainEqual({ type: 'objectBroken', unitId: 'o1' });
    expect(r.events.some((e) => e.type === 'defeated')).toBe(false);
    const o = getUnit(r.state, 'o1');
    expect(o.hp).toBe(0);
    expect(o.retired).toBe(true);
    // 壊れた後は、マスをふさがない
    const s = { ...r.state, turn: { ...r.state.turn!, moved: false } };
    expect(reachableTiles(s, getUnit(s, 'p1')).some((t) => t.x === 2 && t.z === 2)).toBe(true);
  });

  it('攻撃の魔法は当たり、回復や状態変化の魔法は効かない', () => {
    const state = playerTurn(begin({}));
    const fire = testSpells.find((s) => s.id === 'fire')!;
    const heal = testSpells.find((s) => s.id === 'heal')!;
    const p1 = getUnit(state, 'p1');
    expect(previewSpellAt(state, p1, fire, { x: 2, z: 2 }).results.map((r) => r.unitId)).toContain('o1');
    expect(previewSpellAt(state, p1, heal, { x: 2, z: 2 }).results.map((r) => r.unitId)).not.toContain('o1');
  });

  it('勝利条件「指定の物をすべて壊す」: 全部壊すと勝ち、1つでも残っていれば続く', () => {
    const objectives: BattleObjectives = { victory: [{ kind: 'destroyObjects', unitIds: ['o1', 'o2'] }], defeat: [{ kind: 'allDefeated' }] };
    const r = begin({
      objectives,
      objects: [
        { id: 'o1', kind: 'seam', x: 2, z: 2, hp: 3 },
        { id: 'o2', kind: 'seam', x: 0, z: 0, hp: 3 },
      ],
    });
    const one = applyAction(playerTurn(r), { type: 'attack', targetId: 'o1' });
    expect(one.state.winner).toBeNull();
    const both = { ...one.state, units: one.state.units.map((u) => (u.id === 'o2' ? { ...u, hp: 0, retired: true } : u)) };
    expect(judgeOutcome(both)).toEqual({ winner: 'player', reason: 'destroyObjects' });
  });

  it('存在しない物を勝利条件に書くと、戦闘を始める時にエラー', () => {
    expect(() => begin({ objectives: { victory: [{ kind: 'destroyObjects', unitIds: ['nope'] }], defeat: [] } })).toThrow();
  });
});

describe('勝利条件「正面以外から攻撃を当てる」', () => {
  const objectives: BattleObjectives = {
    victory: [{ kind: 'hitUnit', id: 'sword', unitId: 'e1', times: 2, labelId: 'oathSword' }],
    defeat: [{ kind: 'allDefeated' }],
  };
  const units = (facing: 'north' | 'south'): UnitPlacement[] => [
    { id: 'p1', team: 'player', jobId: 'warrior', x: 2, z: 3, facing: 'north' },
    // 敵は p1 の北隣。facing が south なら p1 は正面、north なら背面
    { id: 'e1', team: 'enemy', jobId: 'warrior', x: 2, z: 2, facing, statBonus: { maxHp: 200 } },
  ];

  it('正面から当てても数えず、背面から当てると数える。規定の回数で勝利', () => {
    const front = playerTurn(begin({ units: units('south'), objects: [], objectives }));
    const hitFront = findSeed(front, { type: 'attack', targetId: 'e1' }, (x) => x.events.some((e) => e.type === 'attacked' && e.hit));
    expect(hitFront.events.some((e) => e.type === 'tallied')).toBe(false);

    const back = playerTurn(begin({ units: units('north'), objects: [], objectives }));
    const hit = findSeed(back, { type: 'attack', targetId: 'e1' }, (x) => x.events.some((e) => e.type === 'attacked' && e.hit));
    expect(hit.events).toContainEqual({ type: 'tallied', id: 'sword', count: 1, times: 2 });
    expect(hit.state.scenario.tallies).toEqual({ sword: 1 });
    expect(hit.state.winner).toBeNull();
    const twice = { ...hit.state, scenario: { ...hit.state.scenario, tallies: { sword: 2 } } };
    expect(judgeOutcome(twice)).toEqual({ winner: 'player', reason: 'hitUnit' });
  });

  it('数えた回数が届いた時のきっかけ（tally）でイベントが起きる', () => {
    const r = begin({
      units: units('north'),
      objects: [],
      objectives: { victory: [{ kind: 'hitUnit', id: 'sword', unitId: 'e1', times: 3 }], defeat: [{ kind: 'allDefeated' }] },
      events: [{ id: 'talk', trigger: { kind: 'tally', id: 'sword', count: 1 }, effects: [{ kind: 'dialogue', scriptId: 'swordCracks' }] }],
    });
    const hit = findSeed(playerTurn(r), { type: 'attack', targetId: 'e1' }, (x) => x.events.some((e) => e.type === 'attacked' && e.hit));
    expect(hit.events).toContainEqual({ type: 'dialogue', scriptId: 'swordCracks' });
  });
});

describe('物を壊した時のイベント（会話と地形の変化）', () => {
  it('物が壊れると、会話の出来事と、マスの高さ・種類の変化が起きる（地形は状態に残る）', () => {
    const r = begin({
      objects: [{ id: 'o1', kind: 'seam', x: 2, z: 2, hp: 3 }],
      objectives: { victory: [{ kind: 'destroyObjects', unitIds: ['o1'] }, { kind: 'defeatAll' }], defeat: [{ kind: 'allDefeated' }] },
      events: [
        {
          id: 'burst',
          trigger: { kind: 'unitDefeated', unitId: 'o1' },
          effects: [
            { kind: 'dialogue', scriptId: 'weirBreaks' },
            { kind: 'terrain', tiles: [{ x: 0, z: 5, height: 0, terrain: 'water' }, { x: 1, z: 5, terrain: 'water' }] },
          ],
        },
      ],
      heights: flat(6, 6).map((row, z) => (z === 5 ? row.map(() => 1) : row)),
    });
    const after = applyAction(playerTurn(r), { type: 'attack', targetId: 'o1' });
    const types = after.events.map((e) => e.type);
    expect(types.indexOf('objectBroken')).toBeLessThan(types.indexOf('dialogue'));
    const changed = after.events.find((e) => e.type === 'terrainChanged');
    expect(changed).toEqual({
      type: 'terrainChanged',
      tiles: [
        { x: 0, z: 5, height: 0, terrain: 'water' },
        { x: 1, z: 5, height: 1, terrain: 'water' },
      ],
    });
    expect(after.state.map.tiles[5 * 6 + 0]).toEqual({ x: 0, z: 5, height: 0, terrain: 'water' });
    expect(after.state.winner).toBe('player');
  });

  it('会話をはさんでも戦闘の結果は同じ（JSON に直して読み込んだ状態から続けても同じ）', () => {
    const r = begin({
      events: [{ id: 'hello', trigger: { kind: 'turn', turn: 1 }, effects: [{ kind: 'dialogue', scriptId: 'hello' }] }],
      seed: 7,
    });
    const s1 = applyAction(r.state, { type: 'endTurn', facing: 'north' });
    expect(s1.events).toContainEqual({ type: 'dialogue', scriptId: 'hello' });
    const restored = JSON.parse(JSON.stringify(s1.state)) as BattleState;
    const a = runAutoBattle(s1.state, 80, testAiConfigs).state;
    const b = runAutoBattle(restored, 80, testAiConfigs).state;
    expect(b).toEqual(a);
  });
});

describe('きっかけ「物が N 個壊れた」', () => {
  it('どれが壊れたかを問わず、数が届いた時に1回だけ起きる', () => {
    const r = begin({
      objects: [
        { id: 'o1', kind: 'seam', x: 2, z: 2, hp: 3 },
        { id: 'o2', kind: 'seam', x: 0, z: 0, hp: 3 },
      ],
      events: [{ id: 'one', trigger: { kind: 'objectsBroken', unitIds: ['o1', 'o2'], count: 1 }, effects: [{ kind: 'dialogue', scriptId: 'one' }] }],
    });
    const after = applyAction(playerTurn(r), { type: 'attack', targetId: 'o1' });
    expect(after.events).toContainEqual({ type: 'dialogue', scriptId: 'one' });
  });
});

describe('敵 AI と対象物', () => {
  const objectives: BattleObjectives = { victory: [{ kind: 'destroyObjects', unitIds: ['o1'] }], defeat: [{ kind: 'allDefeated' }] };

  it('敵は対象物を攻撃しない', () => {
    const state = begin({
      units: [
        { id: 'e1', team: 'enemy', jobId: 'warrior', x: 2, z: 3, facing: 'north' },
        { id: 'p1', team: 'player', jobId: 'warrior', x: 5, z: 5, facing: 'north' },
      ],
      objectives,
    }).state;
    expect(state.turn?.unitId).toBe('e1');
    const action = decideNextAction(state, testAi);
    expect(action.type === 'attack' && action.targetId === 'o1').toBe(false);
  });

  it('敵は、守る物までの道のりで、どの味方よりも近い位置に留まる', () => {
    const state = begin({
      units: [
        { id: 'e1', team: 'enemy', jobId: 'warrior', x: 5, z: 0, facing: 'south' },
        { id: 'p1', team: 'player', jobId: 'warrior', x: 0, z: 5, facing: 'north' },
      ],
      heights: flat(8, 8),
      objects: [{ id: 'o1', kind: 'seam', x: 1, z: 2, hp: 30 }],
      objectives,
    }).state;
    const e1 = getUnit(state, 'e1');
    const dest = chooseApproach(state, e1, testAi)!;
    expect(dest).toBeDefined();
    // 物までの歩数が、味方（物まで 4 歩）より近い
    const d = Math.abs(dest.x - 1) + Math.abs(dest.z - 2);
    expect(d).toBeLessThan(4);
  });

  it('味方の AI は、壊すと勝つ物を狙う', () => {
    const state = begin({ objectives }).state;
    expect(decideNextAction(state, testAi)).toEqual({ type: 'attack', targetId: 'o1' });
  });
});
