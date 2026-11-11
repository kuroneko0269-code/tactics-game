import { describe, expect, it } from 'vitest';
import { applyAction, getUnit, startBattle } from './battle';
import type { ActionResult, BattleAction, BattleSetup, BattleState } from './battleTypes';
import { previewAttack } from './combat';
import { addStatus, effectiveMove, tickStatuses } from './effects';
import { canCast, previewSpellAt } from './magic';
import { reachableTiles } from './movement';
import { predictTimeline } from './turnOrder';
import {
  findSeed,
  flat,
  makeState,
  testArcher,
  testHealer,
  testJobs,
  testMage,
  testPassives,
  testRules,
  testSpells,
  testStrikes,
  testWarrior,
} from './testSupport';

/** 行動を順に適用する */
const run = (state: BattleState, actions: BattleAction[]) =>
  actions.reduce((s, a) => applyAction(s, a).state, state);

/** 詠唱中の魔法が発動するまで、手番を待機で終え続ける */
const untilResolved = (state: BattleState, casterId: string): ActionResult => {
  let s = state;
  const events: ActionResult['events'][number][] = [];
  for (let i = 0; i < 20 && getUnit(s, casterId).charging; i++) {
    const r = applyAction(s, { type: 'endTurn', facing: 'north' });
    events.push(...r.events);
    s = r.state;
  }
  return { state: s, events };
};

const all = (jobId: string, ids: string[]) => [{ jobId, abilityIds: ids }];

describe('状態変化: 付与・持続・付け直し', () => {
  it('持続はそのユニットの手番の回数で数え、手番が終わるたびに 1 減って 0 で消える', () => {
    // 手番は p → e → p の順に来る
    const state = makeState({
      heights: flat(4, 4),
      units: [
        { id: 'p', team: 'player', x: 0, z: 0, statuses: [{ id: 'slow', turns: 2 }] },
        { id: 'e', team: 'enemy', x: 3, z: 3, ct: 90 },
      ],
    });
    const first = applyAction(state, { type: 'endTurn', facing: 'south' });
    expect(getUnit(first.state, 'p').statuses).toEqual([{ id: 'slow', turns: 1 }]);
    expect(first.events.some((e) => e.type === 'statusExpired')).toBe(false);
    // ほかのユニットの手番では減らない
    expect(first.state.turn!.unitId).toBe('e');
    const second = applyAction(first.state, { type: 'endTurn', facing: 'north' });
    expect(getUnit(second.state, 'p').statuses).toEqual([{ id: 'slow', turns: 1 }]);
    // 自分の2回目の手番が終わると消える
    expect(second.state.turn!.unitId).toBe('p');
    const third = applyAction(second.state, { type: 'endTurn', facing: 'south' });
    expect(getUnit(third.state, 'p').statuses).toEqual([]);
    expect(third.events).toContainEqual({ type: 'statusExpired', unitId: 'p', status: 'slow' });
  });

  it('同じ効果を重ねて付けると、持続を付け直すだけで、効果は重ならない', () => {
    const once = addStatus([], 'slow', testRules);
    expect(once).toEqual([{ id: 'slow', turns: 2 }]);
    const ticked = tickStatuses(once).statuses;
    expect(ticked).toEqual([{ id: 'slow', turns: 1 }]);
    const again = addStatus([...ticked, { id: 'protect', turns: 2 }], 'slow', testRules);
    expect(again).toEqual([
      { id: 'protect', turns: 2 },
      { id: 'slow', turns: 2 },
    ]);
    // 鈍足を2つ付けても、移動力の下がり方は1つぶん
    const unit = { stats: { ...testWarrior.stats, move: 5 }, statuses: again };
    expect(effectiveMove(unit, testRules)).toBe(3);
  });

  it('守り: 受けるダメージ -25%（攻撃にも魔法にも）', () => {
    const state = makeState({
      heights: flat(3, 4),
      units: [
        { id: 'w', team: 'player', x: 1, z: 2 },
        { id: 'e', team: 'enemy', x: 1, z: 1, facing: 'north', statuses: [{ id: 'protect', turns: 3 }] },
        { id: 'm', team: 'player', job: testMage, x: 1, z: 3 },
      ],
    });
    const w = getUnit(state, 'w');
    const e = getUnit(state, 'e');
    // 背面 25 → 守りで 18（切り捨て）
    const p = previewAttack(state, w, e);
    expect(p.protectPercent).toBe(75);
    expect(p.damage).toBe(18);
    // 炎 20 → 15
    const spell = testSpells.find((s) => s.id === 'fire')!;
    const r = previewSpellAt(state, getUnit(state, 'm'), spell, e).results.find((x) => x.unitId === 'e')!;
    expect(r.amount).toBe(15);
  });

  it('鈍足: 移動力 -2（最低 1）', () => {
    const state = makeState({
      heights: flat(8, 1),
      units: [
        { id: 'p', team: 'player', x: 0, z: 0, statuses: [{ id: 'slow', turns: 2 }] },
        { id: 'e', team: 'enemy', x: 7, z: 0 },
      ],
    });
    // 移動力 3 → 1
    expect(reachableTiles(state, getUnit(state, 'p')).map((t) => t.x)).toEqual([1]);
    expect(effectiveMove({ stats: { ...testWarrior.stats, move: 2 }, statuses: [{ id: 'slow', turns: 1 }] }, testRules)).toBe(1);
  });

  it('沈黙: 魔法を使えない（溜めのある技の狙い撃ちは使える）', () => {
    const state = makeState({
      heights: flat(6, 1),
      units: [
        { id: 'm', team: 'player', job: testMage, x: 0, z: 0, statuses: [{ id: 'silence', turns: 2 }] },
        { id: 'a', team: 'player', job: testArcher, x: 1, z: 0, statuses: [{ id: 'silence', turns: 2 }], commands: all('archer', ['aimedShot']) },
        { id: 'e', team: 'enemy', x: 5, z: 0 },
      ],
    });
    const m = getUnit(state, 'm');
    const fire = testSpells.find((s) => s.id === 'fire')!;
    expect(canCast(m, fire)).toBe(false);
    expect(() => applyAction(state, { type: 'cast', spellId: 'fire', target: { kind: 'unit', unitId: 'e' } })).toThrow();
    const archerTurn = { ...state, turn: { ...state.turn!, unitId: 'a', origin: { x: 1, z: 0, facing: 'south' as const } } };
    expect(() => applyAction(archerTurn, { type: 'cast', spellId: 'aimedShot', target: { kind: 'unit', unitId: 'e' } })).not.toThrow();
  });

  it('沈黙が付いた時に魔法を詠唱中なら、詠唱が中断される（溜めのある技は中断されない）', () => {
    const state = makeState({
      heights: flat(6, 2),
      units: [
        { id: 'm', team: 'player', job: testMage, x: 0, z: 0, commands: all('mage', ['seal']) },
        { id: 'em', team: 'enemy', job: testMage, x: 3, z: 0, charging: { spellId: 'fire', target: { kind: 'tile', x: 5, z: 1 }, progress: 0 } },
        { id: 'ea', team: 'enemy', job: testArcher, x: 3, z: 1, commands: all('archer', ['aimedShot']), charging: { spellId: 'aimedShot', target: { kind: 'tile', x: 0, z: 1 }, progress: 0 } },
      ],
    });
    const sealMage = run(state, [{ type: 'cast', spellId: 'seal', target: { kind: 'unit', unitId: 'em' } }]);
    const resolved = untilResolved(sealMage, 'm');
    const interrupted = resolved.events.find((e) => e.type === 'castInterrupted');
    // 炎（遅い）の詠唱は、封じ（速い）が先に発動して中断される
    expect(interrupted).toEqual({ type: 'castInterrupted', casterId: 'em', spellId: 'fire', reason: 'silenced' });
    expect(resolved.events).toContainEqual({ type: 'statusAdded', unitId: 'em', status: 'silence', turns: 2 });

    const sealArcher = run(state, [{ type: 'cast', spellId: 'seal', target: { kind: 'unit', unitId: 'ea' } }]);
    const { events } = untilResolved(sealArcher, 'm');
    expect(events).toContainEqual({ type: 'statusAdded', unitId: 'ea', status: 'silence', turns: 2 });
    expect(events.some((e) => e.type === 'castInterrupted' && e.casterId === 'ea')).toBe(false);
  });

  it('守りの祈り: 範囲（5マス）にいる全員に守りを付ける（敵も）', () => {
    const state = makeState({
      heights: flat(5, 5),
      units: [
        { id: 'h', team: 'player', job: testHealer, x: 0, z: 2, commands: all('healer', ['protectPrayer']) },
        { id: 'p1', team: 'player', x: 2, z: 2, level: 3 },
        { id: 'p2', team: 'player', x: 2, z: 1 },
        { id: 'e', team: 'enemy', x: 3, z: 2 },
        { id: 'far', team: 'enemy', x: 4, z: 4 },
      ],
    });
    const cast = applyAction(state, { type: 'cast', spellId: 'protectPrayer', target: { kind: 'unit', unitId: 'p1' } });
    // 行動の回数は、発動した時に数える
    expect(getUnit(cast.state, 'h').actionCount).toBe(0);
    const { state: after } = untilResolved(cast.state, 'h');
    for (const id of ['p1', 'p2', 'e']) expect(getUnit(after, id).statuses.map((x) => x.id), id).toContain('protect');
    expect(getUnit(after, 'h').actionCount).toBe(1);
    expect(getUnit(after, 'far').statuses).toEqual([]);
  });
});

describe('受動的なアビリティ', () => {
  const setup = (passives: string[], jobId = 'warrior'): BattleSetup => ({
    id: 't',
    map: { id: 'm', heights: flat(6, 6), terrain: flat(6, 6).map((r) => 'g'.repeat(r.length)), legend: { g: 'grass' } },
    units: [
      { id: 'p', team: 'player', jobId, x: 0, z: 0, facing: 'south', passives },
      { id: 'e', team: 'enemy', jobId: 'warrior', x: 5, z: 5, facing: 'north' },
    ],
  });
  const begin = (passives: string[], jobId = 'warrior') =>
    startBattle(setup(passives, jobId), testJobs, testRules, 1, testSpells, testStrikes, testPassives).state;

  it('重装は最大 HP +15%、早足は移動力 +1、身軽はジャンプ力 +1（戦闘の開始時に能力値へ反映する）', () => {
    expect(getUnit(begin(['heavyArmor']), 'p').stats.maxHp).toBe(Math.floor((50 * 115) / 100));
    expect(getUnit(begin(['heavyArmor']), 'p').hp).toBe(57);
    expect(getUnit(begin(['quickStep']), 'p').stats.move).toBe(4);
    expect(getUnit(begin(['lightFoot']), 'p').stats.jump).toBe(3);
    expect(() => begin(['nope'])).toThrow();
  });

  it('節約は消費 MP -25%（切り捨て）、早口は詠唱の速さ +25%（切り捨て）', () => {
    const thrift = begin(['thrift'], 'mage');
    const cast = applyAction(thrift, { type: 'cast', spellId: 'fire', target: { kind: 'tile', x: 2, z: 0 } });
    // 炎の消費 MP 10 → 7
    expect(getUnit(cast.state, 'p').mp).toBe(30 - 7);
    // 早口: 炎の詠唱の速さ 25 → 31。発動までの時計の回数が減る
    const lookahead = (state: BattleState) => {
      const timeline = predictTimeline(state, 20, { pendingSpellId: 'fire' });
      return timeline.findIndex((e, i) => i > 0 && e.kind === 'spell');
    };
    expect(lookahead(begin(['quickCast'], 'mage'))).toBeLessThanOrEqual(lookahead(begin([], 'mage')));
  });

  it('集中は武器による攻撃の命中率 +10。身かわしは正面と側面からの武器による攻撃の命中率 -20（背面は変わらない）', () => {
    const duel = (facing: 'north' | 'south' | 'east', attacker: string[], target: string[]) =>
      makeState({
        heights: flat(3, 3),
        units: [
          { id: 'w', team: 'player', x: 1, z: 2, passives: attacker },
          { id: 'e', team: 'enemy', x: 1, z: 1, facing, passives: target },
        ],
      });
    const hit = (s: BattleState) => previewAttack(s, getUnit(s, 'w'), getUnit(s, 'e')).hitPercent;
    expect(hit(duel('south', ['focus'], []))).toBe(95);
    expect(hit(duel('south', [], ['evade']))).toBe(65);
    expect(hit(duel('east', [], ['evade']))).toBe(75);
    expect(hit(duel('north', [], ['evade']))).toBe(100);
    expect(previewAttack(duel('south', [], ['evade']), getUnit(duel('south', [], ['evade']), 'w'), getUnit(duel('south', [], ['evade']), 'e')).evadePenalty).toBe(20);
  });

  it('身かわしが効いて外れた時は、その名前を出す', () => {
    const state = makeState({
      heights: flat(3, 3),
      units: [
        { id: 'w', team: 'player', x: 1, z: 2 },
        { id: 'e', team: 'enemy', x: 1, z: 1, facing: 'south', passives: ['evade'] },
      ],
    });
    const miss = findSeed(state, { type: 'attack', targetId: 'e' }, (r) => r.events.some((e) => e.type === 'attacked' && !e.hit));
    expect(miss.events).toContainEqual({ type: 'reaction', unitId: 'e', abilityId: 'evade' });
  });

  it('魔力の殻は魔法で受けるダメージ -20%（溜めのある技の狙い撃ちは減らない）', () => {
    const state = makeState({
      heights: flat(6, 1),
      units: [
        { id: 'm', team: 'player', job: testMage, x: 0, z: 0 },
        { id: 'a', team: 'player', job: testArcher, x: 1, z: 0, commands: all('archer', ['aimedShot']) },
        { id: 'e', team: 'enemy', x: 5, z: 0, passives: ['magicShell'] },
      ],
    });
    const wind = testSpells.find((s) => s.id === 'wind')!;
    const aimed = testSpells.find((s) => s.id === 'aimedShot')!;
    const e = getUnit(state, 'e');
    expect(previewSpellAt(state, getUnit(state, 'm'), wind, e).results[0]!.amount).toBe(8);
    expect(previewSpellAt(state, getUnit(state, 'a'), aimed, e).results[0]!.amount).toBe(15);
  });

  it('瞑想はダメージを受けて生き残った時、MP を回復する（最大 MP まで）', () => {
    const state = makeState({
      heights: flat(3, 3),
      units: [
        { id: 'w', team: 'player', x: 1, z: 2 },
        { id: 'h', team: 'enemy', job: testHealer, x: 1, z: 1, facing: 'north', mp: 10, hp: 30, passives: ['meditate'] },
      ],
    });
    const r = applyAction(state, { type: 'attack', targetId: 'h' });
    expect(r.events).toContainEqual({ type: 'reaction', unitId: 'h', abilityId: 'meditate' });
    expect(r.events).toContainEqual({ type: 'mpRestored', unitId: 'h', amount: 6, mp: 16 });
    expect(getUnit(r.state, 'h').mp).toBe(16);
  });
});
