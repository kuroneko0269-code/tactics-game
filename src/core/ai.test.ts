import { describe, expect, it } from 'vitest';
import {
  chooseApproach,
  chooseAttack,
  chooseDamageSpell,
  chooseHealSpell,
  decideNextAction,
  defaultFacing,
  playAiTurn,
  runAutoBattle,
  threatMap,
} from './ai';
import { startBattle } from './battle';
import type { BattleSetup } from './battleTypes';
import {
  flat,
  makeState,
  testAi,
  testAiConfigs,
  testArcher,
  testHealer,
  testJobs,
  testMage,
  testRules,
  testSpells,
} from './testSupport';

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
    expect(chooseApproach(state, state.units[0]!, { ...testAi, stance: 'advance' })).toEqual({ x: 3, z: 1 });
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
    expect(chooseApproach(state, state.units[0]!, { ...testAi, stance: 'advance' })).toEqual({ x: 0, z: 3 });
  });

  it('攻撃する手番は「移動 → 攻撃 → 相手の方を向いて終了」と進む', () => {
    const state = makeState({
      heights: flat(5, 5),
      units: [
        { id: 'ai', team: 'enemy', x: 0, z: 2 },
        { id: 't', team: 'player', x: 2, z: 2, facing: 'north' },
      ],
    });
    expect(decideNextAction(state, testAi)).toEqual({ type: 'move', x: 2, z: 3 });
    const { actions } = playAiTurn(state, testAi);
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
      const { state } = runAutoBattle(startBattle(setup, testJobs, testRules, seed).state, 1000, testAiConfigs);
      expect(state.winner, `シード値 ${seed}`).not.toBeNull();
    }
  });
});

describe('敵 AI: 攻撃できない時の動き', () => {
  // 敵の戦士（移動 3 + 隣接）は、x = 0〜4 の列まで攻撃を届かせられる。x = 5 から先は届かない
  const field = (aiX: number, extra: Parameters<typeof makeState>[0]['units'] = [], options = {}) =>
    makeState({
      heights: flat(12, 3),
      units: [{ id: 'ai', team: 'enemy', x: aiX, z: 1 }, { id: 'p', team: 'player', x: 0, z: 1 }, ...extra],
      ...options,
    });

  it('単独では、相手の攻撃が届く位置へ踏み込まず、届かないぎりぎりの位置で止まる', () => {
    const state = field(8);
    const threat = threatMap(state, 'enemy');
    expect(threat.get(1 * 12 + 4)).toBe(1);
    expect(threat.get(1 * 12 + 5)).toBeUndefined();
    expect(chooseApproach(state, state.units[0]!, testAi)).toEqual({ x: 5, z: 1 });
    // 改良前の動き（前に出る）なら、届く範囲に踏み込む
    expect(chooseApproach(state, state.units[0]!, { ...testAi, stance: 'advance' })).toEqual({ x: 5, z: 1 });
    const far = field(11);
    expect(chooseApproach(far, far.units[0]!, { ...testAi, stance: 'advance' })).toEqual({ x: 8, z: 1 });
    // ぎりぎりの位置にいれば、それ以上は進まない
    const edge = field(5);
    expect(chooseApproach(edge, edge.units[0]!, testAi)).toBeUndefined();
    expect(decideNextAction(edge, testAi)).toEqual({ type: 'endTurn', facing: 'west' });
  });

  it('すでに相手の攻撃が届く位置にいれば、下がって手番を無駄にせず、届く相手が増えないマスへ進む', () => {
    const state = makeState({
      heights: flat(12, 5),
      units: [
        { id: 'ai', team: 'enemy', job: testArcher, x: 2, z: 1 },
        { id: 'p', team: 'player', x: 0, z: 1 },
      ],
    });
    const threat = threatMap(state, 'enemy');
    expect(threat.get(1 * 12 + 2)).toBe(1);
    const dest = chooseApproach(state, state.units[0]!, testAi)!;
    expect(threat.get(dest.z * 12 + dest.x) ?? 0).toBeLessThanOrEqual(1);
    // 下がらない（相手との距離が今より遠くならない）
    expect(Math.abs(dest.x) + Math.abs(dest.z - 1)).toBeLessThanOrEqual(2);
  });

  it('近くに味方が十分いれば、単独ではないので踏み込む', () => {
    // 味方 2 体が近くにいる。届く相手は 1 体
    const alone = field(7);
    expect(chooseApproach(alone, alone.units[0]!, testAi)).toEqual({ x: 5, z: 1 });
    const state = field(7, [
      { id: 'f1', team: 'enemy', x: 6, z: 0 },
      { id: 'f2', team: 'enemy', x: 6, z: 2 },
    ]);
    expect(chooseApproach(state, state.units[0]!, testAi)).toEqual({ x: 4, z: 1 });
  });

  it('どちらの軍も一定の手番数（12）攻撃や魔法をしていなければ、前進に切り替える', () => {
    const calm = field(8, [], { turnNumber: 12, lastAggressionTurn: 1 });
    expect(chooseApproach(calm, calm.units[0]!, testAi)).toEqual({ x: 5, z: 1 });
    const stale = field(8, [], { turnNumber: 13, lastAggressionTurn: 1 });
    expect(chooseApproach(stale, stale.units[0]!, testAi)).toEqual({ x: 5, z: 1 });
    const far = field(11, [], { turnNumber: 13, lastAggressionTurn: 1 });
    expect(chooseApproach(far, far.units[0]!, testAi)).toEqual({ x: 8, z: 1 });
    const edge = field(5, [], { turnNumber: 13, lastAggressionTurn: 1 });
    expect(chooseApproach(edge, edge.units[0]!, testAi)).toEqual({ x: 2, z: 1 });
  });

  it('攻撃や魔法があると、にらみ合いの手番数は数え直しになる', () => {
    const start = startBattle(
      {
        id: 'duel',
        map: { id: 'm', heights: flat(4, 1), terrain: ['gggg'], legend: { g: 'grass' } },
        units: [
          { id: 'p', team: 'player', jobId: 'warrior', x: 0, z: 0, facing: 'east' },
          { id: 'e', team: 'enemy', jobId: 'warrior', x: 1, z: 0, facing: 'west' },
        ],
      },
      testJobs,
      testRules,
      1,
      testSpells,
    ).state;
    expect(start.lastAggressionTurn).toBe(0);
    const { state } = playAiTurn(start, testAi);
    expect(state.lastAggressionTurn).toBe(1);
  });

  it('攻撃できる時は、今までどおり攻撃を優先する。詠唱中の相手を攻撃できれば、そちらを狙う', () => {
    const state = makeState({
      heights: flat(5, 5),
      units: [
        { id: 'ai', team: 'enemy', x: 2, z: 2 },
        // 背面を取れる相手より、詠唱中の相手を優先する
        { id: 'back', team: 'player', x: 2, z: 1, facing: 'north', hp: 1 },
        { id: 'caster', team: 'player', job: testMage, x: 2, z: 4, facing: 'north', charging: { spellId: 'fire', target: { kind: 'tile', x: 0, z: 0 }, progress: 0 } },
      ],
    });
    expect(chooseAttack(state, state.units[0]!, true)?.targetId).toBe('caster');
  });
});

describe('敵 AI: 魔術師', () => {
  /** 魔術師が立つ (4,1) だけ高さ 3 の柱にして、相手の通常攻撃が届かないようにする（届く位置からは撃ち方が変わるため） */
  const pillar = () => {
    const h = flat(9, 9);
    h[1]![4] = 3;
    return h;
  };
  it('巻き込む敵の数から味方の数を引いた値が最も大きい場所に撃つ', () => {
    const state = makeState({
      heights: pillar(),
      units: [
        { id: 'm', team: 'enemy', job: testMage, x: 4, z: 1 },
        // (4,4) の周りに敵 3 体。(5,4) を中心にすると 3 体だが、味方も 1 体巻き込む
        { id: 'p1', team: 'player', x: 4, z: 4 },
        { id: 'p2', team: 'player', x: 3, z: 4 },
        { id: 'p3', team: 'player', x: 4, z: 5 },
        { id: 'ally', team: 'enemy', x: 5, z: 3 },
      ],
    });
    // 移動はせず、今の位置から撃つ場所を選ぶ
    const plan = chooseDamageSpell(state, state.units[0]!, false)!;
    expect(plan.spellId).toBe('fire');
    expect(plan.target).toEqual({ kind: 'unit', unitId: 'p1' });
  });

  it('味方を巻き込んで差し引き 0 以下になる場所には撃たない', () => {
    const state = makeState({
      heights: pillar(),
      units: [
        { id: 'm', team: 'enemy', job: testMage, x: 4, z: 1 },
        { id: 'p1', team: 'player', x: 4, z: 4 },
        // 敵 1 体のすぐ隣に味方が 2 体。炎は使えないが、風（単体）なら撃てる
        { id: 'a1', team: 'enemy', x: 3, z: 4 },
        { id: 'a2', team: 'enemy', x: 5, z: 4 },
      ],
    });
    const plan = chooseDamageSpell(state, state.units[0]!, false)!;
    expect(plan.spellId).toBe('wind');
    expect(plan.target).toEqual({ kind: 'unit', unitId: 'p1' });
  });

  it('巻き込める数が同じなら、動いていない相手や詠唱中の相手を優先する', () => {
    const state = makeState({
      heights: pillar(),
      units: [
        { id: 'm', team: 'enemy', job: testMage, x: 4, z: 1 },
        { id: 'moving', team: 'player', x: 2, z: 3, movedLastTurn: true },
        { id: 'still', team: 'player', x: 6, z: 3, movedLastTurn: false },
      ],
    });
    expect(chooseDamageSpell(state, state.units[0]!, false)?.target).toEqual({ kind: 'unit', unitId: 'still' });
    const charging = makeState({
      heights: pillar(),
      units: [
        { id: 'm', team: 'enemy', job: testMage, x: 4, z: 1 },
        { id: 'a', team: 'player', x: 2, z: 3, movedLastTurn: true },
        { id: 'caster', team: 'player', job: testMage, x: 6, z: 3, movedLastTurn: true, charging: { spellId: 'wind', target: { kind: 'tile', x: 0, z: 0 }, progress: 0 } },
      ],
    });
    expect(chooseDamageSpell(charging, charging.units[0]!, false)?.target).toEqual({ kind: 'unit', unitId: 'caster' });
  });

  it('手番の行動は「（必要なら移動）→ 魔法の指定 → 相手の方を向いて終了」', () => {
    const state = makeState({
      heights: flat(9, 9),
      units: [
        { id: 'm', team: 'enemy', job: testMage, x: 4, z: 0 },
        { id: 'p', team: 'player', x: 4, z: 6 },
      ],
    });
    const { actions } = playAiTurn(state, testAi);
    expect(actions.map((a) => a.type)).toEqual(['move', 'cast', 'endTurn']);
  });

  it('詠唱中に手番が来たら、待機して詠唱を続ける', () => {
    const state = makeState({
      heights: flat(9, 9),
      units: [
        { id: 'm', team: 'enemy', job: testMage, x: 4, z: 0, charging: { spellId: 'fire', target: { kind: 'tile', x: 4, z: 4 }, progress: 50 } },
        { id: 'p', team: 'player', x: 4, z: 1 },
      ],
    });
    expect(decideNextAction(state, testAi)).toEqual({ type: 'endTurn', facing: 'south' });
  });
});

describe('敵 AI: 癒し手', () => {
  const party = (allyHp: number) =>
    makeState({
      heights: flat(12, 5),
      units: [
        { id: 'h', team: 'enemy', job: testHealer, x: 10, z: 2 },
        { id: 'a', team: 'enemy', x: 7, z: 2, hp: allyHp },
        { id: 'p', team: 'player', x: 1, z: 2 },
      ],
    });

  it('HP が半分以下の味方がいれば回復する', () => {
    const state = party(25);
    const plan = chooseHealSpell(state, state.units[0]!, true, testAi)!;
    expect(plan.spellId).toBe('heal');
    expect(plan.target).toEqual({ kind: 'unit', unitId: 'a' });
    expect(decideNextAction(state, testAi)).toEqual({ type: 'cast', spellId: 'heal', target: { kind: 'unit', unitId: 'a' } });
  });

  it('HP が半分より多ければ回復せず、相手の攻撃が届かない位置を保つ', () => {
    const state = party(26);
    expect(chooseHealSpell(state, state.units[0]!, true, testAi)).toBeUndefined();
    const action = decideNextAction(state, testAi);
    expect(action.type).toBe('move');
    if (action.type !== 'move') return;
    expect(threatMap(state, 'enemy').get(action.z * 12 + action.x)).toBeUndefined();
    // にらみ合いになっても、癒し手は前に出ない
    const stale = { ...state, turnNumber: 30, lastAggressionTurn: 0 };
    const staleAction = decideNextAction(stale, testAi);
    if (staleAction.type === 'move') expect(threatMap(stale, 'enemy').get(staleAction.z * 12 + staleAction.x)).toBeUndefined();
  });

  it('回復の詠唱がすでに届く予定の味方には、重ねて回復しない', () => {
    const state = makeState({
      heights: flat(12, 5),
      units: [
        { id: 'h', team: 'enemy', job: testHealer, x: 10, z: 2 },
        { id: 'h2', team: 'enemy', job: testHealer, x: 10, z: 4, charging: { spellId: 'heal', target: { kind: 'unit', unitId: 'a' }, progress: 0 } },
        { id: 'a', team: 'enemy', x: 7, z: 2, hp: 10 },
        { id: 'p', team: 'player', x: 1, z: 2 },
      ],
    });
    expect(chooseHealSpell(state, state.units[0]!, true, testAi)).toBeUndefined();
  });
});

describe('手番の終わりの向きの初期値', () => {
  it('最も近い敵の方向を向く。距離が同じなら HP の少ない敵、敵がいなければ今の向き', () => {
    const state = makeState({
      heights: flat(9, 9),
      units: [
        { id: 'p', team: 'player', x: 4, z: 4, facing: 'south' },
        // 遠い敵（西に 3）と近い敵（北に 2）
        { id: 'far', team: 'enemy', x: 1, z: 4 },
        { id: 'near', team: 'enemy', x: 4, z: 2 },
        // 味方は数えない
        { id: 'ally', team: 'player', x: 5, z: 4 },
      ],
    });
    expect(defaultFacing(state, state.units[0]!)).toBe('north');

    const tie = makeState({
      heights: flat(9, 9),
      units: [
        { id: 'p', team: 'player', x: 4, z: 4, facing: 'south' },
        { id: 'a', team: 'enemy', x: 4, z: 2 },
        { id: 'b', team: 'enemy', x: 6, z: 4, hp: 10 },
      ],
    });
    expect(defaultFacing(tie, tie.units[0]!)).toBe('east');

    const alone = makeState({ heights: flat(9, 9), units: [{ id: 'p', team: 'player', x: 4, z: 4, facing: 'west' }] });
    expect(defaultFacing(alone, alone.units[0]!)).toBe('west');
  });
});
