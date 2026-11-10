import { describe, expect, it } from 'vitest';
import { chooseApproach, chooseAttack, decideNextAction, playAiTurn, runAutoBattle } from './ai';
import { startBattle } from './battle';
import type { BattleSetup } from './battleTypes';
import { flat, makeState, testArcher, testJobs, testRules } from './testSupport';

describe('敵 AI の位置選び', () => {
  it('攻撃できる位置が複数あれば、背面 → 側面 → 正面 の順に選ぶ', () => {
    // 相手は北を向いている。背面（南側）に回り込める
    const state = makeState({
      heights: flat(5, 5),
      units: [
        { id: 'ai', team: 'enemy', x: 0, z: 2 },
        { id: 't', team: 'player', x: 2, z: 2, facing: 'north' },
      ],
    });
    expect(chooseAttack(state, state.units[0]!, true)).toEqual({ position: { x: 2, z: 3 }, targetId: 't' });
  });

  it('背面に回れなければ側面を選ぶ', () => {
    // 背面（2,3）は塞がれている
    const state = makeState({
      heights: flat(5, 5),
      units: [
        { id: 'ai', team: 'enemy', x: 0, z: 0 },
        { id: 't', team: 'player', x: 2, z: 2, facing: 'north' },
        { id: 'block', team: 'player', x: 2, z: 3 },
      ],
    });
    const plan = chooseAttack(state, state.units[0]!, true)!;
    expect(plan.targetId).toBe('t');
    expect([
      { x: 1, z: 2 },
      { x: 3, z: 2 },
    ]).toContainEqual(plan.position);
  });

  it('向きが同じなら高い位置を選ぶ', () => {
    // 相手の側面は (1,2) と (3,2)。(3,2) の方が高い
    const heights = flat(5, 5);
    heights[2]![3] = 1;
    const state = makeState({
      heights,
      units: [
        { id: 'ai', team: 'enemy', x: 2, z: 0 },
        { id: 't', team: 'player', x: 2, z: 2, facing: 'north' },
        { id: 'block', team: 'player', x: 2, z: 3 },
      ],
    });
    expect(chooseAttack(state, state.units[0]!, true)?.position).toEqual({ x: 3, z: 2 });
  });

  it('弓使いも背面を優先し、同じなら高い位置から撃つ', () => {
    const heights = flat(7, 7);
    heights[6]![3] = 1;
    const state = makeState({
      heights,
      units: [
        { id: 'ai', team: 'enemy', job: testArcher, x: 3, z: 5 },
        { id: 't', team: 'player', x: 3, z: 2, facing: 'north' },
      ],
    });
    // 今いる (3,5) からも背面を撃てるが、(3,6) の方が高い
    expect(chooseAttack(state, state.units[0]!, true)).toEqual({ position: { x: 3, z: 6 }, targetId: 't' });
  });

  it('攻撃できる相手がいなければ、最も近い相手に近づく', () => {
    const state = makeState({
      heights: flat(10, 3),
      units: [
        { id: 'ai', team: 'enemy', x: 0, z: 1 },
        { id: 'near', team: 'player', x: 9, z: 1 },
        { id: 'far', team: 'player', x: 9, z: 0, hp: 1 },
      ],
    });
    expect(chooseAttack(state, state.units[0]!, true)).toBeUndefined();
    expect(chooseApproach(state, state.units[0]!)).toEqual({ x: 3, z: 1 });
  });

  it('近づく時は、崖を避けて実際に歩ける道のりで近い方を選ぶ', () => {
    // 中央の列は高さ 5 の壁で、通れるのは一番下の行だけ
    const heights = [
      [0, 5, 0],
      [0, 5, 0],
      [0, 5, 0],
      [0, 0, 0],
    ];
    const state = makeState({
      heights,
      units: [
        { id: 'ai', team: 'enemy', x: 0, z: 0 },
        { id: 't', team: 'player', x: 2, z: 0 },
      ],
    });
    expect(chooseApproach(state, state.units[0]!)).toEqual({ x: 0, z: 3 });
  });

  it('攻撃する手番は「移動 → 攻撃 → 相手の方を向いて終了」と進む', () => {
    const state = makeState({
      heights: flat(5, 5),
      units: [
        { id: 'ai', team: 'enemy', x: 0, z: 2 },
        { id: 't', team: 'player', x: 2, z: 2, facing: 'north' },
      ],
    });
    expect(decideNextAction(state)).toEqual({ type: 'move', x: 2, z: 3 });
    const { actions } = playAiTurn(state);
    expect(actions).toEqual([
      { type: 'move', x: 2, z: 3 },
      { type: 'attack', targetId: 't' },
      { type: 'endTurn', facing: 'north' },
    ]);
  });
});

describe('AI 同士の自動戦闘', () => {
  const setup: BattleSetup = {
    id: 'auto',
    map: {
      id: 'auto-map',
      heights: [
        [0, 0, 0, 0, 0, 0, 0, 0],
        [0, 0, 0, 1, 1, 0, 0, 0],
        [0, 2, 0, 0, 0, 0, 0, 0],
        [0, 3, 1, 0, 0, 2, 2, 0],
        [0, 3, 1, 0, 0, 2, 2, 0],
        [0, 2, 0, 0, 0, 0, 0, 0],
        [0, 0, 0, 1, 1, 0, 0, 0],
        [0, 0, 0, 0, 0, 0, 0, 0],
      ],
      terrain: Array.from({ length: 8 }, () => 'gggggggg'),
      legend: { g: 'grass' },
    },
    units: [
      { id: 'p1', team: 'player', jobId: 'warrior', x: 2, z: 7, facing: 'north' },
      { id: 'p2', team: 'player', jobId: 'warrior', x: 5, z: 7, facing: 'north' },
      { id: 'p3', team: 'player', jobId: 'archer', x: 3, z: 7, facing: 'north' },
      { id: 'p4', team: 'player', jobId: 'archer', x: 4, z: 7, facing: 'north' },
      { id: 'e1', team: 'enemy', jobId: 'warrior', x: 2, z: 0, facing: 'south' },
      { id: 'e2', team: 'enemy', jobId: 'warrior', x: 5, z: 0, facing: 'south' },
      { id: 'e3', team: 'enemy', jobId: 'archer', x: 3, z: 0, facing: 'south' },
      { id: 'e4', team: 'enemy', jobId: 'archer', x: 4, z: 0, facing: 'south' },
    ],
  };

  it('どのシード値でも、必ず決着がつく', () => {
    for (let seed = 1; seed <= 30; seed++) {
      const { state } = runAutoBattle(startBattle(setup, testJobs, testRules, seed).state, 1000);
      expect(state.winner, `シード値 ${seed}`).not.toBeNull();
    }
  });
});
