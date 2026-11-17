import { describe, expect, it } from 'vitest';
import { applyAction, getUnit, knockoutCountOf, startBattle } from './battle';
import type { BattleEvent, BattleObjectives, BattleRules, BattleSetup, BattleState, UnitPlacement } from './battleTypes';
import { isValidSpellTarget } from './magic';
import { migrateSaveData } from './saveData';
import { judgeOutcome } from './scenario';
import { findSeed, flat, makeState, testJobs, testRules, testSpells, testStrikes } from './testSupport';

/**
 * 戦闘で人は死なない決まり: ユニットの種類（人・影・獣・物）ごとの HP が尽きた時の動き、退場しない指定、
 * 敵をすべて退けても勝たない戦闘、最後の一撃を決めたユニットに限る勝利条件（序章の丘の誓いの剣）。
 */
const rules: BattleRules = { ...testRules, knockout: { count: 3, ctAfterTick: 0, kinds: { shade: { count: 0 }, beast: { count: 0 } } } };
const wait = (state: BattleState) => applyAction(state, { type: 'endTurn', facing: getUnit(state, state.turn!.unitId).facing });

function begin(units: UnitPlacement[], objectives?: BattleObjectives, seed = 1): BattleState {
  const setup: BattleSetup = {
    id: 'test',
    map: { id: 'test', heights: flat(6, 6), terrain: flat(6, 6).map((r) => 'g'.repeat(r.length)), legend: { g: 'grass' } },
    units,
    ...(objectives ? { objectives } : {}),
  };
  return startBattle(setup, testJobs, rules, seed, testSpells, testStrikes).state;
}

/** 手番を p にした状態にする（ほかのユニットは待機で回す） */
function turnOf(state: BattleState, id: string): BattleState {
  let s = state;
  for (let i = 0; i < 40 && s.turn?.unitId !== id; i++) s = wait(s).state;
  expect(s.turn?.unitId).toBe(id);
  return s;
}

describe('ユニットの種類', () => {
  it('配置で種類を省くと人。対象物は物。カウントは種類ごと（人 3・影 0・獣 0）', () => {
    const s = begin([
      { id: 'p1', team: 'player', jobId: 'warrior', x: 0, z: 0, facing: 'south' },
      { id: 'e1', team: 'enemy', jobId: 'warrior', x: 5, z: 5, facing: 'north', kind: 'shade' },
    ]);
    expect(getUnit(s, 'p1').kind).toBe('human');
    expect(getUnit(s, 'e1').kind).toBe('shade');
    expect(knockoutCountOf(rules, { kind: 'human' })).toBe(3);
    expect(knockoutCountOf(rules, { kind: 'shade' })).toBe(0);
    expect(knockoutCountOf(rules, { kind: 'beast' })).toBe(0);
  });

  it('人: HP が尽きると戦闘不能でマスに残り（カウント 3）、カウントが減って 0 で退場する。それまでは蘇生できる', () => {
    let state = makeState({
      heights: flat(6, 1),
      units: [
        { id: 'a', team: 'player', x: 0, z: 0, commands: [{ jobId: 'healer', abilityIds: ['revive'] }] },
        { id: 'e', team: 'enemy', x: 1, z: 0, hp: 3 },
        { id: 'e2', team: 'enemy', x: 5, z: 0 },
      ],
    });
    state = { ...state, rules };
    const r = findSeed(state, { type: 'attack', targetId: 'e' }, (x) => getUnit(x.state, 'e').hp === 0);
    expect(r.events).toContainEqual({ type: 'defeated', unitId: 'e', count: 3 });
    expect(r.events.some((e) => e.type === 'retired')).toBe(false);
    const revive = r.state.units[0]!.spells.find((s) => s.id === 'revive');
    if (revive) expect(isValidSpellTarget(r.state, revive, getUnit(r.state, 'a'), { kind: 'unit', unitId: 'e' })).toBe(true);
    let s = r.state;
    const counts: number[] = [];
    for (let i = 0; i < 60 && !getUnit(s, 'e').retired; i++) {
      const w = wait(s);
      s = w.state;
      for (const ev of w.events) if (ev.type === 'knockoutCounted' && ev.unitId === 'e') counts.push(ev.count);
    }
    expect(counts).toEqual([2, 1, 0]);
    expect(getUnit(s, 'e').retired).toBe(true);
  });

  it('影: HP が尽きると、すぐに退場する（戦闘不能の出来事の直後に退場。蘇生できない）', () => {
    let state = makeState({
      heights: flat(6, 1),
      units: [
        { id: 'a', team: 'player', x: 0, z: 0 },
        { id: 'shade', team: 'enemy', x: 1, z: 0, hp: 3, kind: 'shade' },
        { id: 'e2', team: 'enemy', x: 5, z: 0 },
      ],
    });
    state = { ...state, rules };
    const r = findSeed(state, { type: 'attack', targetId: 'shade' }, (x) => getUnit(x.state, 'shade').hp === 0);
    const types = r.events.filter((e) => e.type === 'defeated' || e.type === 'retired');
    expect(types).toEqual([
      { type: 'defeated', unitId: 'shade', count: 0 },
      { type: 'retired', unitId: 'shade' },
    ]);
    expect(getUnit(r.state, 'shade')).toMatchObject({ retired: true, hp: 0 });
  });
});

describe('退場しない（戦闘ごとの指定）', () => {
  it('戦闘不能になってもカウントが減らず、最後までマスに残る。勝敗の判定では戦闘不能として数え、蘇生もできる', () => {
    let state = makeState({
      heights: flat(6, 1),
      units: [
        { id: 'a', team: 'player', x: 0, z: 0, commands: [{ jobId: 'healer', abilityIds: ['revive'] }] },
        { id: 'guard', team: 'enemy', x: 3, z: 0, hp: 0, noRetire: true },
        { id: 'e2', team: 'enemy', x: 5, z: 0 },
      ],
    });
    state = { ...state, rules };
    const all: BattleEvent[] = [];
    for (let i = 0; i < 60; i++) {
      const w = wait(state);
      all.push(...w.events);
      state = w.state;
    }
    expect(all.some((e) => (e.type === 'knockoutCounted' || e.type === 'retired') && e.unitId === 'guard')).toBe(false);
    expect(getUnit(state, 'guard')).toMatchObject({ hp: 0, retired: false, knockoutCount: 3 });
    // 立っている敵がいなければ負け（退場しなくても、戦闘不能は戦闘不能）
    const lone = { ...state, units: state.units.map((u) => (u.id === 'e2' ? { ...u, hp: 0, retired: true } : u)) };
    expect(judgeOutcome(lone)).toEqual({ winner: 'player', reason: 'defeatAll' });
    const revive = state.units[0]!.spells.find((s) => s.id === 'revive');
    if (revive) expect(isValidSpellTarget(state, revive, getUnit(state, 'a'), { kind: 'unit', unitId: 'guard' })).toBe(true);
  });

  it('配置の noRetire がユニットに入る', () => {
    const s = begin([
      { id: 'p1', team: 'player', jobId: 'warrior', x: 0, z: 0, facing: 'south' },
      { id: 'e1', team: 'enemy', jobId: 'warrior', x: 5, z: 5, facing: 'north', noRetire: true },
    ]);
    expect(getUnit(s, 'e1').noRetire).toBe(true);
    expect(getUnit(s, 'p1').noRetire).toBeUndefined();
  });
});

describe('敵をすべて退けても勝たない戦闘（defeatAllWins: false。序章の堰）', () => {
  it('書いた勝利条件だけで勝つ', () => {
    let state = makeState({
      heights: flat(4, 1),
      units: [
        { id: 'a', team: 'player', x: 0, z: 0 },
        { id: 'e', team: 'enemy', x: 3, z: 0, hp: 0 },
      ],
    });
    expect(judgeOutcome(state)).toEqual({ winner: 'player', reason: 'defeatAll' });
    state = { ...state, scenario: { ...state.scenario, objectives: { ...state.scenario.objectives, defeatAllWins: false } } };
    expect(judgeOutcome(state)).toBeNull();
  });
});

describe('最後の一撃を決めたユニットに限る（hitUnit の finisherId。序章の丘）', () => {
  const objectives: BattleObjectives = {
    victory: [{ kind: 'hitUnit', id: 'sword', unitId: 'boss', times: 2, finisherId: 'touma' }],
    defeat: [{ kind: 'allDefeated' }],
  };
  const units: UnitPlacement[] = [
    // ボスは北を向いているので、南隣の 2 人は背面から当てる
    { id: 'gord', team: 'player', jobId: 'warrior', x: 2, z: 3, facing: 'north' },
    { id: 'touma', team: 'player', jobId: 'warrior', x: 3, z: 2, facing: 'west' },
    { id: 'boss', team: 'enemy', jobId: 'warrior', x: 2, z: 2, facing: 'north', statBonus: { maxHp: 500 }, minHp: 1 },
  ];
  const hitBy = (state: BattleState, id: string) =>
    findSeed(turnOf(state.turn?.unitId === id ? wait(state).state : state, id), { type: 'attack', targetId: 'boss' }, (x) =>
      x.events.some((e) => e.type === 'attacked' && e.hit),
    );

  it('ほかの仲間は最後の1回の手前まで数え、最後の1回は数えない（tallyBlocked）。決めたユニットが当てると勝つ', () => {
    const start = begin(units, objectives);
    const first = hitBy(start, 'gord');
    expect(first.events).toContainEqual({ type: 'tallied', id: 'sword', count: 1, times: 2 });
    // 2回目（最後）をゴードが当てても数えない
    const again = hitBy(first.state, 'gord');
    expect(again.events).toContainEqual({ type: 'tallyBlocked', id: 'sword', attackerId: 'gord', finisherId: 'touma' });
    expect(again.events.some((e) => e.type === 'tallied')).toBe(false);
    expect(again.state.scenario.tallies).toEqual({ sword: 1 });
    expect(again.state.winner).toBeNull();
    // トウマが当てると数えて勝つ
    const last = hitBy(again.state, 'touma');
    expect(last.events).toContainEqual({ type: 'tallied', id: 'sword', count: 2, times: 2 });
    expect(last.state.winner).toBe('player');
    // ボスの HP は尽きない
    expect(getUnit(last.state, 'boss').hp).toBeGreaterThanOrEqual(1);
  });

  it('決めたユニットが戦場にいなければ、組み立てで失敗する', () => {
    expect(() => begin(units.filter((u) => u.id !== 'touma'), objectives)).toThrow(/最後の一撃/);
  });
});

describe('セーブデータ（版 6 → 7）', () => {
  const context = { starterEquipment: {}, equipment: [], startingGold: 0, legacyUnitIds: {} };
  const unit = {
    id: 'touma',
    jobId: 'warrior',
    level: 3,
    exp: 12,
    growth: { maxHp: 600, maxMp: 80, attack: 120, magic: 40, speed: 8 },
    jobs: { warrior: { jp: 40, jpTotal: 300, learned: [] } },
    slots: { secondary: null, reaction: null, support: null, movement: null },
    equipment: { weapon: null, armor: null, accessory: null },
  };
  const roster = { units: [unit], gold: 0, items: [], nextItemSeq: 1 };
  const base = { version: 6, roster, dungeon: { run: null, clears: {} }, records: { trainingWins: {} } };

  it('途中の戦闘のユニットに種類を足す（対象物は物、ほかは人）', () => {
    const state = makeState({ heights: flat(2, 1), units: [{ id: 'a', team: 'player', x: 0, z: 0 }] });
    const units = state.units.map(({ kind: _k, ...u }) => (void _k, u));
    const battle = { origin: { kind: 'training', tierId: 'easy' }, state: { ...state, units: [...units, { ...units[0], id: 'o', object: { kind: 'seam' } }] } };
    const r = migrateSaveData({ ...base, battle, story: {} }, context);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.data.battle?.state.units.map((u) => u.kind)).toEqual(['human', 'object']);
  });

  it('物語の途中の戦闘は捨て、序章の場面の番号を新しい並びに付け替える', () => {
    const state = makeState({ heights: flat(2, 1), units: [{ id: 'a', team: 'player', x: 0, z: 0 }] });
    const battle = { origin: { kind: 'story', bookId: 'main', chapter: 0, scene: 8 }, state };
    const r = migrateSaveData({ ...base, battle, story: { main: { chapter: 0, scene: 8, finished: false } } }, context);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.data.battle).toBeNull();
    // 版 6 の 8 番目（丘の戦闘）は、版 7 では 10 番目、版 8 では 9 番目
    expect(r.data.story.main).toEqual({ chapter: 0, scene: 9, finished: false });
    const later = migrateSaveData({ ...base, battle: null, story: { main: { chapter: 0, scene: 11, finished: false } } }, context);
    expect(later.ok && later.data.story.main?.scene).toBe(11);
  });

  it('版 7 → 8: 序章の場面の番号をゲーム脚本の並び（12 の場面）に付け替え、物語の途中の戦闘は捨てる。訓練戦の途中の戦闘は残す', () => {
    const state = makeState({ heights: flat(2, 1), units: [{ id: 'a', team: 'player', x: 0, z: 0 }] });
    const v7 = { ...base, version: 7 };
    const at = (scene: number, battle: unknown = null) => migrateSaveData({ ...v7, battle, story: { main: { chapter: 0, scene, finished: false } } }, context);
    // 話を聞く部屋（4）は門と報告の部屋（3）へ、物置（14）は家までの道と物置（11）へ
    expect([0, 2, 4, 5, 6, 10, 12, 14].map((n) => {
      const r = at(n);
      return r.ok ? r.data.story.main?.scene : -1;
    })).toEqual([0, 2, 3, 4, 5, 9, 10, 11]);
    const story = at(10, { origin: { kind: 'story', bookId: 'main', chapter: 0, scene: 10 }, state });
    expect(story.ok && story.data.battle).toBeNull();
    const training = at(0, { origin: { kind: 'training', tierId: 'easy' }, state });
    expect(training.ok && training.data.battle?.origin).toEqual({ kind: 'training', tierId: 'easy' });
    // 終えた本は、そのまま
    const done = migrateSaveData({ ...v7, battle: null, story: { main: { chapter: 0, scene: 14, finished: true } } }, context);
    expect(done.ok && done.data.story.main).toEqual({ chapter: 0, scene: 14, finished: true });
  });
});
