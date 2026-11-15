import { describe, expect, it } from 'vitest';
import { applyAction, getUnit } from './battle';
import type { BattleState, JobDefinition } from './battleTypes';
import { previewAttack, weaponFits } from './combat';
import { isValidSpellTarget, previewSpellAt } from './magic';
import { predictTimeline } from './turnOrder';
import { decideNextAction } from './ai';
import { findSeed, flat, makeState, testAi, testWarrior } from './testSupport';

/**
 * 時守（トウマの専用ジョブ。フェーズ2-6）の行動アビリティと受動的なアビリティ。
 * 斬り分け・引き戻し・門渡り・時送り、踏みとどまる、時守の心得
 */
const timekeeper: JobDefinition = { ...testWarrior, id: 'timekeeper', stats: { ...testWarrior.stats, maxMp: 20 } };
const tkCmd = [{ jobId: 'timekeeper', abilityIds: ['sweep', 'rewind', 'gateSwap', 'timeDelay'] }];
const wait = (state: BattleState) => applyAction(state, { type: 'endTurn', facing: getUnit(state, state.turn!.unitId).facing });

describe('斬り分け', () => {
  // 時守 (1,0) が南の (1,1) の敵を狙うと、正面 (1,1) と左右 (0,1)・(2,1) の敵をまとめて斬る
  const state = makeState({
    heights: flat(4, 3),
    units: [
      { id: 't', team: 'player', job: timekeeper, x: 1, z: 0, commands: tkCmd },
      { id: 'front', team: 'enemy', x: 1, z: 1, facing: 'north' },
      { id: 'left', team: 'enemy', x: 0, z: 1, facing: 'north' },
      { id: 'right', team: 'player', x: 2, z: 1 },
      { id: 'far', team: 'enemy', x: 1, z: 2, facing: 'north' },
    ],
  });
  const action = { type: 'attack' as const, targetId: 'front', abilityId: 'sweep' };

  it('正面と左右のマスの敵だけを斬る（味方と、2マス先の敵は斬らない）。1体ずつ命中を判定する', () => {
    const t = getUnit(state, 't');
    const p = previewAttack(state, t, getUnit(state, 'front'), t, t.strikes.find((s) => s.id === 'sweep'));
    expect(p.sweep?.map((x) => x.unitId)).toEqual(['left']);
    const r = findSeed(state, action, (x) => x.events.filter((e) => e.type === 'attacked' && e.hit).length === 2);
    const attacked = r.events.filter((e) => e.type === 'attacked');
    expect(attacked.map((e) => e.type === 'attacked' && e.targetId)).toEqual(['left', 'front']);
    // ダメージは通常攻撃（攻撃力 20）の 70%、予測と同じ
    expect(getUnit(r.state, 'front').hp).toBe(50 - p.damage);
    expect(p.damage).toBe(14);
    expect(getUnit(r.state, 'left').hp).toBe(50 - p.sweep![0]!.damage);
    expect(getUnit(r.state, 'right').hp).toBe(50);
    expect(getUnit(r.state, 'far').hp).toBe(50);
    // 当たり外れは別々に決まる（片方だけ当たる乱数もある）
    expect(() => findSeed(state, action, (x) => x.events.filter((e) => e.type === 'attacked' && e.hit).length === 1)).not.toThrow();
  });

  it('剣が必要', () => {
    expect(weaponFits(['sword'], 'sword')).toBe(true);
    expect(weaponFits(['sword'], null)).toBe(false);
  });
});

describe('引き戻し', () => {
  it('味方の HP を、その味方の前回の手番が始まった時の値に戻す。今の方が高ければ何も起きない', () => {
    const state = makeState({
      heights: flat(5, 1),
      units: [
        { id: 't', team: 'player', job: timekeeper, x: 0, z: 0, commands: tkCmd },
        { id: 'a', team: 'player', x: 2, z: 0, hp: 18, turnStartHp: 40 },
        { id: 'b', team: 'player', x: 1, z: 0, hp: 45, turnStartHp: 30 },
        { id: 'e', team: 'enemy', x: 4, z: 0 },
      ],
    });
    const t = getUnit(state, 't');
    const target = { kind: 'unit' as const, unitId: 'a' };
    const preview = previewSpellAt(state, t, t.spells.find((s) => s.id === 'rewind')!, getUnit(state, 'a'));
    expect(preview.results).toEqual([{ unitId: 'a', amount: 22, hp: 40 }]);
    const r = applyAction(state, { type: 'cast', spellId: 'rewind', target });
    // 詠唱せず、その場で発動する
    expect(getUnit(r.state, 't').charging).toBeNull();
    expect(getUnit(r.state, 'a').hp).toBe(40);
    expect(getUnit(r.state, 't').mp).toBe(14);
    expect(r.state.turn?.acted).toBe(true);
    // 今の方が高い味方には何も起きない
    const r2 = applyAction(state, { type: 'cast', spellId: 'rewind', target: { kind: 'unit', unitId: 'b' } });
    expect(getUnit(r2.state, 'b').hp).toBe(45);
    // 自分・敵・マスは狙えない。射程は 3
    expect(isValidSpellTarget(state, t.spells.find((s) => s.id === 'rewind')!, t, { kind: 'unit', unitId: 't' })).toBe(false);
    expect(isValidSpellTarget(state, t.spells.find((s) => s.id === 'rewind')!, t, { kind: 'unit', unitId: 'e' })).toBe(false);
    expect(isValidSpellTarget(state, t.spells.find((s) => s.id === 'rewind')!, t, { kind: 'tile', x: 2, z: 0 })).toBe(false);
  });

  it('手番が始まった時の HP を覚える。相手の手番で受けたダメージを、次の味方の手番で引き戻せる（途中保存をはさんでも同じ）', () => {
    // 手番の順: a → e → t（CT で決まる）
    let state = makeState({
      heights: flat(5, 1),
      units: [
        { id: 'a', team: 'player', x: 2, z: 0, ct: 100, hp: 44 },
        { id: 'e', team: 'enemy', x: 3, z: 0, ct: 95, hp: 33, turnStartHp: 50 },
        { id: 't', team: 'player', job: timekeeper, x: 0, z: 0, ct: 90, commands: tkCmd },
      ],
    });
    // a の手番が始まった時の HP（44）を覚えさせるため、手番を回す: a 待機 → e の手番が始まる
    state = { ...state, turn: null };
    state = applyAction({ ...state, turn: { unitId: 'a', moved: false, acted: false, origin: { x: 2, z: 0, facing: 'south' }, chargingAtStart: false } }, { type: 'endTurn', facing: 'east' }).state;
    expect(state.turn?.unitId).toBe('e');
    // 手番が始まったユニットは、その時の HP を覚える
    expect(getUnit(state, 'e').turnStartHp).toBe(33);
    // e が a を攻撃して当てる
    const hitA = findSeed(state, { type: 'attack', targetId: 'a' }, (x) => getUnit(x.state, 'a').hp < 44);
    state = wait(hitA.state).state;
    expect(state.turn?.unitId).toBe('t');
    // 途中保存（JSON にして戻す）をはさむ
    const saved = JSON.parse(JSON.stringify(state)) as BattleState;
    const target = { kind: 'unit' as const, unitId: 'a' };
    const a = applyAction(state, { type: 'cast', spellId: 'rewind', target });
    const b = applyAction(saved, { type: 'cast', spellId: 'rewind', target });
    expect(getUnit(a.state, 'a').hp).toBe(44);
    expect(b).toEqual(a);
  });
});

describe('門渡り', () => {
  const state = makeState({
    heights: flat(5, 2),
    units: [
      { id: 't', team: 'player', job: timekeeper, x: 0, z: 0, commands: tkCmd },
      { id: 'a', team: 'player', x: 3, z: 0 },
      { id: 'e', team: 'enemy', x: 4, z: 1 },
    ],
  });

  it('射程 3 の中の味方と位置を入れ替える。その後に移動して、やり直しても入れ替わった先に戻る', () => {
    const r = applyAction(state, { type: 'cast', spellId: 'gateSwap', target: { kind: 'unit', unitId: 'a' } });
    expect(getUnit(r.state, 't')).toMatchObject({ x: 3, z: 0 });
    expect(getUnit(r.state, 'a')).toMatchObject({ x: 0, z: 0 });
    expect(r.events).toContainEqual({ type: 'swapped', a: 't', b: 'a', aTo: { x: 3, z: 0 }, bTo: { x: 0, z: 0 } });
    const moved = applyAction(r.state, { type: 'move', x: 3, z: 1 }).state;
    // 行動した後なので、移動はやり直せない（入れ替わる前の位置には戻らない）
    expect(() => applyAction(moved, { type: 'undoMove' })).toThrow();
    expect(r.state.turn?.origin).toMatchObject({ x: 3, z: 0 });
  });

  it('敵とは入れ替えられない', () => {
    const t = getUnit(state, 't');
    expect(isValidSpellTarget(state, t.spells.find((s) => s.id === 'gateSwap')!, t, { kind: 'unit', unitId: 'e' })).toBe(false);
  });
});

describe('時送り', () => {
  it('敵の CT を 40 減らす（0 より下にはしない）。予測の行動順も、実際の結果と同じだけ下がる', () => {
    const state = makeState({
      heights: flat(5, 1),
      units: [
        { id: 't', team: 'player', job: timekeeper, x: 0, z: 0, commands: tkCmd },
        { id: 'e', team: 'enemy', x: 2, z: 0, ct: 90 },
        { id: 'a', team: 'player', x: 4, z: 0, ct: 70 },
      ],
    });
    const t = getUnit(state, 't');
    const p = previewSpellAt(state, t, t.spells.find((s) => s.id === 'timeDelay')!, getUnit(state, 'e'));
    expect(p.results).toEqual([{ unitId: 'e', amount: 40, hp: 50 }]);
    const r = applyAction(state, { type: 'cast', spellId: 'timeDelay', target: { kind: 'unit', unitId: 'e' } });
    expect(getUnit(r.state, 'e').ct).toBe(50);
    // 予測（UI はこの形で、時送りを使った後の状態から行動順を数える）
    const before = predictTimeline(state, 4).map((x) => (x.kind === 'turn' ? x.unitId : x.casterId));
    const after = predictTimeline(r.state, 4).map((x) => (x.kind === 'turn' ? x.unitId : x.casterId));
    expect(before.indexOf('e')).toBeLessThan(after.indexOf('e'));
    const low = applyAction({ ...state, units: state.units.map((u) => (u.id === 'e' ? { ...u, ct: 10 } : u)) }, {
      type: 'cast',
      spellId: 'timeDelay',
      target: { kind: 'unit', unitId: 'e' },
    });
    expect(getUnit(low.state, 'e').ct).toBe(0);
  });
});

describe('踏みとどまる・時守の心得', () => {
  it('HP が 0 になるダメージを、1戦に1度だけ HP 1 で耐える（予測にも出る）。2度目は倒れる', () => {
    const state = makeState({
      heights: flat(3, 1),
      units: [
        { id: 'w', team: 'player', x: 0, z: 0 },
        { id: 'e', team: 'enemy', x: 1, z: 0, hp: 10, passives: ['endure'] },
      ],
    });
    const w = getUnit(state, 'w');
    const p = previewAttack(state, w, getUnit(state, 'e'));
    expect(p).toMatchObject({ endures: true, damage: 9 });
    const r = findSeed(state, { type: 'attack', targetId: 'e' }, (x) => x.events.some((e) => e.type === 'attacked' && e.hit));
    expect(getUnit(r.state, 'e')).toMatchObject({ hp: 1, endureUsed: true });
    expect(r.events).toContainEqual({ type: 'endured', unitId: 'e', abilityId: 'endure' });
    const again = { ...r.state, turn: { ...state.turn!, acted: false } };
    expect(previewAttack(again, getUnit(again, 'w'), getUnit(again, 'e')).endures).toBe(false);
    const r2 = findSeed(again, { type: 'attack', targetId: 'e' }, (x) => x.events.some((e) => e.type === 'attacked' && e.hit));
    expect(getUnit(r2.state, 'e').hp).toBe(0);
  });

  it('時守の心得: 待機した時の CT が 40 → 60。移動か行動をした時は増えない', () => {
    const state = makeState({
      heights: flat(3, 1),
      units: [
        { id: 't', team: 'player', job: timekeeper, x: 0, z: 0, passives: ['timekeeperWisdom'] },
        { id: 'e', team: 'enemy', x: 2, z: 0 },
      ],
    });
    const r = wait(state);
    expect(r.events).toContainEqual(expect.objectContaining({ type: 'turnEnded', unitId: 't', ct: 60 }));
    const moved = applyAction(applyAction(state, { type: 'move', x: 1, z: 0 }).state, { type: 'endTurn', facing: 'east' });
    expect(moved.events).toContainEqual(expect.objectContaining({ type: 'turnEnded', unitId: 't', ct: 20 }));
  });
});

describe('AI の時守', () => {
  it('引き戻しで味方の HP を目安以上戻せる時は使う。斬り分けは巻き込む敵が多い時に選ぶ', () => {
    const base = {
      heights: flat(5, 3),
      units: [
        { id: 't', team: 'player' as const, job: timekeeper, x: 1, z: 0, commands: tkCmd },
        { id: 'a', team: 'player' as const, x: 3, z: 0, hp: 10, turnStartHp: 40 },
        { id: 'front', team: 'enemy' as const, x: 1, z: 1, facing: 'north' as const },
        { id: 'left', team: 'enemy' as const, x: 0, z: 1, facing: 'north' as const },
        { id: 'right', team: 'enemy' as const, x: 2, z: 1, facing: 'north' as const },
      ],
    };
    const config = { ...testAi, rewindMinHp: 12 };
    // 移動はもう済ませた手番（その場から行動を選ぶ）
    const moved = (st: BattleState): BattleState => ({ ...st, turn: { ...st.turn!, moved: true } });
    expect(decideNextAction(moved(makeState(base)), config)).toEqual({ type: 'cast', spellId: 'rewind', target: { kind: 'unit', unitId: 'a' } });
    // 目安の設定がなければ使わず、3体を巻き込める斬り分けで攻撃する
    const action = decideNextAction(moved(makeState(base)), testAi);
    expect(action).toMatchObject({ type: 'attack', abilityId: 'sweep' });
  });
});
