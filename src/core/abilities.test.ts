import { describe, expect, it } from 'vitest';
import { chooseAttack, chooseDamageSpell, chooseHealSpell, decideNextAction } from './ai';
import { applyAction, getUnit } from './battle';
import type { BattleAction, BattleState } from './battleTypes';
import { previewAttack } from './combat';
import { previewSpellAt, spellRangeTiles } from './magic';
import {
  flat,
  makeState,
  testAi,
  testAimedShot,
  testArcher,
  testBigHeal,
  testHealer,
  testMage,
  testPowerStrike,
  testThunder,
  testWarrior,
} from './testSupport';

/** 行動を順に適用する */
const run = (state: BattleState, actions: BattleAction[]) =>
  actions.reduce((s, a) => applyAction(s, a).state, state);

const warriorWithStrike = { jobId: 'warrior', abilityIds: ['powerStrike'] };

describe('行動アビリティ: 強打', () => {
  const duel = (facing: 'north' | 'south' = 'north') =>
    makeState({
      heights: flat(3, 3),
      units: [
        { id: 'w', team: 'player', x: 1, z: 2, commands: [warriorWithStrike] },
        { id: 'e', team: 'enemy', x: 1, z: 1, facing },
      ],
    });

  it('ダメージ 1.5 倍（向きと高低差の補正の後に掛けて切り捨て）、命中率 -15', () => {
    const state = duel('south');
    const w = state.units[0]!;
    const e = state.units[1]!;
    const normal = previewAttack(state, w, e);
    const strike = previewAttack(state, w, e, w, testPowerStrike);
    expect(normal.side).toBe('front');
    expect(strike.hitPercent).toBe(normal.hitPercent - 15);
    expect(strike.damage).toBe(Math.floor((normal.damage * 150) / 100));
    // 背面（命中 100%）からでも、命中率は 85% になる（0〜100 に収める）
    const back = previewAttack(duel('north'), w, getUnit(duel('north'), 'e'), w, testPowerStrike);
    expect(back.hitPercent).toBe(85);
  });

  it('攻撃の行動に技の id を付けると強打になり、出来事にも技の id が残る。行動の回数が数えられる', () => {
    const state = duel('north');
    const { state: after, events } = applyAction(state, { type: 'attack', targetId: 'e', abilityId: 'powerStrike' });
    const attacked = events.find((e) => e.type === 'attacked')!;
    expect(attacked).toMatchObject({ abilityId: 'powerStrike' });
    expect(getUnit(after, 'w').actionCount).toBe(1);
    const plain = applyAction(state, { type: 'attack', targetId: 'e' }).events.find((e) => e.type === 'attacked')!;
    expect(plain).toMatchObject({ abilityId: null });
  });

  it('必要な武器が合わなければ使えない（弓使いは強打を使えない）', () => {
    const state = makeState({
      heights: flat(6, 1),
      units: [
        { id: 'a', team: 'player', job: testArcher, x: 0, z: 0, commands: [{ jobId: 'warrior', abilityIds: ['powerStrike'] }] },
        { id: 'e', team: 'enemy', x: 3, z: 0 },
      ],
    });
    expect(() => applyAction(state, { type: 'attack', targetId: 'e', abilityId: 'powerStrike' })).toThrow('武器');
    // 覚えていない技も使えない
    expect(() => applyAction(duel(), { type: 'attack', targetId: 'e', abilityId: 'nope' })).toThrow();
  });
});

describe('行動アビリティ: 狙い撃ち', () => {
  const field = () =>
    makeState({
      heights: flat(9, 1),
      units: [
        { id: 'a', team: 'player', job: testArcher, x: 0, z: 0, ct: 100, commands: [{ jobId: 'archer', abilityIds: ['aimedShot'] }] },
        { id: 'e', team: 'enemy', x: 6, z: 0 },
        { id: 'near', team: 'enemy', x: 2, z: 0 },
      ],
    });

  it('射程は 3〜6（弓より 1 長い）。近すぎるマスは狙えない', () => {
    const tiles = spellRangeTiles(field().map, testAimedShot, { x: 0, z: 0 }).map((t) => t.x);
    expect(tiles).toEqual([3, 4, 5, 6]);
    expect(() => applyAction(field(), { type: 'cast', spellId: 'aimedShot', target: { kind: 'unit', unitId: 'near' } })).toThrow();
  });

  it('詠唱があり、発動するとダメージは攻撃力の 1.5 倍（必ず当たる）', () => {
    const state = field();
    const expected = Math.floor((testArcher.stats.attack * 150) / 100);
    expect(previewSpellAt(state, state.units[0]!, testAimedShot, { x: 6, z: 0 }).results).toEqual([
      { unitId: 'e', amount: expected, hp: testWarrior.stats.maxHp - expected },
    ]);
    const cast = applyAction(state, { type: 'cast', spellId: 'aimedShot', target: { kind: 'unit', unitId: 'e' } });
    expect(getUnit(cast.state, 'a').charging?.spellId).toBe('aimedShot');
    expect(getUnit(cast.state, 'e').hp).toBe(testWarrior.stats.maxHp);
    // 詠唱が終わるまで手番を進めると、発動する
    let s = applyAction(cast.state, { type: 'endTurn', facing: 'east' }).state;
    for (let i = 0; i < 10 && getUnit(s, 'a').charging; i++) s = applyAction(s, { type: 'endTurn', facing: 'west' }).state;
    expect(getUnit(s, 'e').hp).toBe(testWarrior.stats.maxHp - expected);
  });

  it('弓がなければ使えない', () => {
    const state = makeState({
      heights: flat(9, 1),
      units: [
        { id: 'w', team: 'player', x: 0, z: 0, commands: [{ jobId: 'archer', abilityIds: ['aimedShot'] }] },
        { id: 'e', team: 'enemy', x: 4, z: 0 },
      ],
    });
    expect(() => applyAction(state, { type: 'cast', spellId: 'aimedShot', target: { kind: 'unit', unitId: 'e' } })).toThrow('武器');
  });
});

describe('行動アビリティ: 雷と大癒し', () => {
  it('雷は単体で威力が高く、炎より詠唱が遅い。大癒しは単体で回復量が大きい', () => {
    const state = makeState({
      heights: flat(6, 6),
      units: [
        { id: 'm', team: 'player', job: testMage, x: 0, z: 0, commands: [{ jobId: 'mage', abilityIds: ['thunder'] }] },
        { id: 'h', team: 'player', job: testHealer, x: 1, z: 0, commands: [{ jobId: 'healer', abilityIds: ['heal', 'bigHeal'] }] },
        { id: 'e', team: 'enemy', x: 3, z: 0 },
        { id: 'e2', team: 'enemy', x: 3, z: 1 },
      ],
    });
    const thunder = previewSpellAt(state, state.units[0]!, testThunder, { x: 3, z: 0 });
    expect(thunder.results).toEqual([{ unitId: 'e', amount: 30, hp: testWarrior.stats.maxHp - 30 }]);
    expect(testThunder.castSpeed).toBeLessThan(25);
    const hurt = { ...state.units[1]!, hp: 1 };
    const big = previewSpellAt({ ...state, units: state.units.map((u) => (u.id === 'h' ? hurt : u)) }, hurt, testBigHeal, { x: 1, z: 0 });
    expect(big.results).toEqual([{ unitId: 'h', amount: 29, hp: 30 }]);
  });
});

describe('敵 AI が新しい行動アビリティを使う', () => {
  it('強打の方が「命中率 × ダメージ」が大きければ強打で攻撃する。通常攻撃で倒せるなら、命中率の高い通常攻撃', () => {
    const state = makeState({
      heights: flat(3, 3),
      units: [
        { id: 'w', team: 'enemy', x: 1, z: 0, commands: [warriorWithStrike] },
        // 背を向けている（w は背面にいる）ので、移動せずにその場で攻撃する
        { id: 'p', team: 'player', x: 1, z: 1, facing: 'south' },
      ],
    });
    expect(chooseAttack(state, state.units[0]!, false)).toMatchObject({ targetId: 'p', abilityId: 'powerStrike' });
    expect(decideNextAction(state, testAi)).toEqual({ type: 'attack', targetId: 'p', abilityId: 'powerStrike' });
    const weak = { ...state, units: state.units.map((u) => (u.id === 'p' ? { ...u, hp: 5 } : u)) };
    expect(chooseAttack(weak, weak.units[0]!, false)?.abilityId).toBeUndefined();
  });

  it('弓使いは、相手の攻撃が届かない位置から狙い撃ちを使う', () => {
    const state = makeState({
      heights: flat(12, 1),
      units: [
        // 戦士 p の攻撃は x = 4 まで届く。弓使いは x = 6 まで近づけば、射程 6 の狙い撃ちが届く
        { id: 'a', team: 'enemy', job: testArcher, x: 9, z: 0, commands: [{ jobId: 'archer', abilityIds: ['aimedShot'] }] },
        { id: 'p', team: 'player', x: 0, z: 0 },
      ],
    });
    const plan = chooseDamageSpell(state, state.units[0]!, true)!;
    expect(plan.spellId).toBe('aimedShot');
    expect(plan.target).toEqual({ kind: 'unit', unitId: 'p' });
  });

  it('魔術師は、留まりやすい相手（前の手番で動かなかった）には、単体で強い雷を使う。動いた相手には速い風', () => {
    const make = (moved: boolean) =>
      makeState({
        // 魔術師は高さ 5 の柱の上にいて、戦士 p の攻撃は届かない
        heights: [[5, 0, 0, 0, 0, 0]],
        units: [
          { id: 'm', team: 'enemy', job: testMage, x: 0, z: 0, commands: [{ jobId: 'mage', abilityIds: ['fire', 'wind', 'thunder'] }] },
          { id: 'p', team: 'player', x: 4, z: 0, movedLastTurn: moved },
        ],
      });
    const still = make(false);
    expect(chooseDamageSpell(still, still.units[0]!, false)?.spellId).toBe('thunder');
    const moving = make(true);
    expect(chooseDamageSpell(moving, moving.units[0]!, false)?.spellId).toBe('wind');
  });

  it('癒し手は、1体だけを回復する時は回復量の大きい大癒しを使う', () => {
    const state = makeState({
      heights: flat(6, 1),
      units: [
        { id: 'h', team: 'enemy', job: testHealer, x: 0, z: 0, commands: [{ jobId: 'healer', abilityIds: ['heal', 'bigHeal'] }] },
        { id: 'f', team: 'enemy', x: 2, z: 0, hp: 5 },
        { id: 'p', team: 'player', x: 5, z: 0 },
      ],
    });
    expect(chooseHealSpell(state, state.units[0]!, false, testAi)?.spellId).toBe('bigHeal');
  });

  it('副コマンドの回復魔法を持つ戦士は、癒し手としては振る舞わない（前に出て攻撃する）', () => {
    const state = makeState({
      heights: flat(3, 3),
      units: [
        { id: 'w', team: 'enemy', x: 1, z: 0, mp: 30, commands: [{ jobId: 'warrior', abilityIds: [] }, { jobId: 'healer', abilityIds: ['heal'] }] },
        { id: 'p', team: 'player', x: 1, z: 1 },
      ],
    });
    expect(decideNextAction(state, testAi)).toEqual({ type: 'attack', targetId: 'p' });
    // 戦士も行動を数える
    const after = run(state, [{ type: 'attack', targetId: 'p' }]);
    expect(getUnit(after, 'w').actionCount).toBe(1);
  });
});
