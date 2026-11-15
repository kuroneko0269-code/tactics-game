import { describe, expect, it } from 'vitest';
import { chooseQuicken, chooseStatusSpell } from './ai';
import { applyAction, getUnit, startBattle } from './battle';
import type { BattleState, JobDefinition } from './battleTypes';
import { previewAttack } from './combat';
import { applyPassiveStats } from './effects';
import { previewSpellAt } from './magic';
import { reachableTiles } from './movement';
import { judgeStalemate, stalemateTurnsLeft } from './scenario';
import { findSeed, flat, makeState, testAi, testMage, testRules, testWarrior } from './testSupport';

/** 魔道士の氷と土、時魔道士・召喚士・魔法剣士（フェーズ2-6）と、膠着の決まり */
const caster: JobDefinition = { ...testMage, id: 'caster', stats: { ...testMage.stats, maxMp: 99 } };
const wait = (state: BattleState) => applyAction(state, { type: 'endTurn', facing: getUnit(state, state.turn!.unitId).facing });
/** 詠唱が発動するまで待機を続ける */
const untilResolved = (state: BattleState) => {
  let s = state;
  for (let i = 0; i < 20 && s.units.some((u) => u.charging); i++) s = wait(s).state;
  return s;
};

describe('土', () => {
  it('相手が低い位置にいるほど威力が上がる（1 段ごとに +25%、上限 +100%）', () => {
    const state = makeState({
      heights: [[3, 2, 0, 0, 3]],
      units: [
        { id: 'm', team: 'player', job: caster, x: 0, z: 0, commands: [{ jobId: 'caster', abilityIds: ['earth'] }] },
        { id: 'a', team: 'enemy', x: 1, z: 0 },
        { id: 'b', team: 'enemy', x: 3, z: 0 },
        { id: 'c', team: 'enemy', x: 4, z: 0 },
      ],
    });
    const m = getUnit(state, 'm');
    const amount = (id: string) => previewSpellAt(state, m, m.spells[0]!, getUnit(state, id)).results[0]!.amount;
    // 魔力 10、威力 100%: 同じ高さ 10、1 段下 12、3 段下 17
    expect([amount('c'), amount('a'), amount('b')]).toEqual([10, 12, 17]);
  });
});

describe('時魔道士', () => {
  const scene = () =>
    makeState({
      heights: flat(6, 2),
      units: [
        { id: 't', team: 'player', job: caster, x: 0, z: 0, commands: [{ jobId: 'caster', abilityIds: ['haste', 'decelerate', 'stop', 'quicken'] }] },
        { id: 'a', team: 'player', x: 1, z: 1, ct: 10 },
        { id: 'e', team: 'enemy', x: 4, z: 0, ct: 10 },
      ],
    });

  it('加速・減速・停止は、発動すると状態変化を付ける（素早さが変わる・次の手番が過ぎる）', () => {
    const hasted = untilResolved(applyAction(scene(), { type: 'cast', spellId: 'haste', target: { kind: 'unit', unitId: 'a' } }).state);
    expect(getUnit(hasted, 'a').stats.speed).toBe(9);
    const slowed = untilResolved(applyAction(scene(), { type: 'cast', spellId: 'decelerate', target: { kind: 'unit', unitId: 'e' } }).state);
    expect(getUnit(slowed, 'e').stats.speed).toBe(3);
    const stopped = applyAction(scene(), { type: 'cast', spellId: 'stop', target: { kind: 'unit', unitId: 'e' } }).state;
    let s = stopped;
    let skipped = false;
    for (let i = 0; i < 30 && !skipped; i++) {
      const r = wait(s);
      skipped = r.events.some((e) => e.type === 'turnSkipped' && e.unitId === 'e');
      s = r.state;
    }
    expect(skipped).toBe(true);
  });

  it('早送り: 発動すると味方の CT が満ち、次に行動する', () => {
    const cast = applyAction(scene(), { type: 'cast', spellId: 'quicken', target: { kind: 'unit', unitId: 'a' } }).state;
    const r = wait(cast);
    expect(r.events.some((e) => e.type === 'spellResolved' && e.spellId === 'quicken')).toBe(true);
    expect(r.state.turn?.unitId).toBe('a');
  });

  it('AI: 加速は治癒師以外の味方に、減速・停止は敵に使う。早送りは CT の少ない味方に使う', () => {
    const state = { ...scene(), turn: { ...scene().turn!, moved: true } };
    const t = getUnit(state, 't');
    const plan = chooseStatusSpell(state, t, false, { ...testAi, sealMaxDanger: 2 });
    expect(plan).toBeDefined();
    const target = plan!.target.kind === 'unit' ? getUnit(state, plan!.target.unitId) : undefined;
    const spell = t.spells.find((x) => x.id === plan!.spellId)!;
    expect(target?.team).toBe(spell.inflicts === 'haste' ? 'player' : 'enemy');
    expect(chooseQuicken(state, t, false)?.target).toEqual({ kind: 'unit', unitId: 'a' });
  });

  it('危機の加速: ダメージを受けて HP が 1/4 以下になると、自分に加速が付く', () => {
    const state = makeState({
      heights: flat(3, 1),
      units: [
        { id: 'w', team: 'player', x: 0, z: 0 },
        { id: 'e', team: 'enemy', x: 1, z: 0, hp: 30, passives: ['criticalHaste'] },
      ],
    });
    const r = findSeed(state, { type: 'attack', targetId: 'e' }, (x) => x.events.some((e) => e.type === 'attacked' && e.hit));
    expect(getUnit(r.state, 'e').hp).toBe(10);
    expect(r.events).toContainEqual({ type: 'reaction', unitId: 'e', abilityId: 'criticalHaste' });
    expect(getUnit(r.state, 'e').statuses.map((x) => x.id)).toEqual(['haste']);
  });

  it('瞬間移動: 段差とほかのユニットを無視して、移動力の歩数以内の空いたマスへ移動できる', () => {
    const state = makeState({
      heights: [[0, 9, 0, 0]],
      units: [
        { id: 't', team: 'player', x: 0, z: 0, passives: ['teleport'] },
        { id: 'e', team: 'enemy', x: 2, z: 0 },
      ],
    });
    expect(reachableTiles(state, getUnit(state, 't')).map((t) => t.x).sort()).toEqual([1, 3]);
  });
});

describe('召喚士', () => {
  const state = makeState({
    heights: flat(7, 3),
    units: [
      { id: 's', team: 'player', job: caster, x: 0, z: 1, commands: [{ jobId: 'caster', abilityIds: ['fireSpirit', 'healSpirit'] }] },
      { id: 'a', team: 'player', x: 3, z: 1, hp: 20 },
      { id: 'e1', team: 'enemy', x: 4, z: 1, hp: 40 },
      { id: 'e2', team: 'enemy', x: 3, z: 0, hp: 40 },
    ],
  });
  const s = getUnit(state, 's');

  it('精霊は、中心から 2 マス以内の敵だけにダメージ（味方は巻き込まない）', () => {
    const p = previewSpellAt(state, s, s.spells.find((x) => x.id === 'fireSpirit')!, { x: 3, z: 1 });
    expect(p.results.map((r) => r.unitId).sort()).toEqual(['e1', 'e2']);
    const after = untilResolved(applyAction(state, { type: 'cast', spellId: 'fireSpirit', target: { kind: 'tile', x: 3, z: 1 } }).state);
    expect(['a', 'e1', 'e2'].map((id) => getUnit(after, id).hp)).toEqual([20, 30, 30]);
  });

  it('癒しの精霊は、味方だけを回復する（敵は回復しない）', () => {
    const p = previewSpellAt(state, s, s.spells.find((x) => x.id === 'healSpirit')!, { x: 3, z: 1 });
    expect(p.results.map((r) => r.unitId)).toEqual(['a']);
  });

  it('精霊の守り: 詠唱中に受けるダメージが増えない', () => {
    const charging = { spellId: 'fireSpirit', target: { kind: 'tile' as const, x: 3, z: 1 }, progress: 10 };
    const base = makeState({
      heights: flat(3, 1),
      units: [
        { id: 'w', team: 'player', x: 0, z: 0 },
        { id: 'c', team: 'enemy', job: caster, x: 1, z: 0, facing: 'west', charging, commands: [{ jobId: 'caster', abilityIds: ['fireSpirit'] }] },
      ],
    });
    const ward = { ...base, units: base.units.map((u) => (u.id === 'c' ? { ...u, passives: [{ id: 'spiritWard', slot: 'support' as const, effect: { kind: 'steadyCasting' as const } }] } : u)) };
    expect(previewAttack(base, getUnit(base, 'w'), getUnit(base, 'c')).chargingPercent).toBe(125);
    expect(previewAttack(ward, getUnit(ward, 'w'), getUnit(ward, 'c')).chargingPercent).toBe(100);
  });
});

describe('魔法剣士', () => {
  const knight: JobDefinition = { ...testWarrior, id: 'mk', stats: { ...testWarrior.stats, magic: 10, maxMp: 10 } };
  it('魔法剣: ダメージは攻撃力 + 魔力から計算し、MP を使う。MP が足りなければ使えない', () => {
    const state = makeState({
      heights: flat(3, 1),
      units: [
        { id: 'k', team: 'player', job: knight, x: 0, z: 0, commands: [{ jobId: 'mk', abilityIds: ['fireBlade'] }] },
        { id: 'e', team: 'enemy', x: 1, z: 0, facing: 'west' },
      ],
    });
    const k = getUnit(state, 'k');
    // (20 + 10) × 70% = 21
    expect(previewAttack(state, k, getUnit(state, 'e'), k, k.strikes[0]).damage).toBe(21);
    const r = applyAction(state, { type: 'attack', targetId: 'e', abilityId: 'fireBlade' });
    expect(getUnit(r.state, 'k').mp).toBe(4);
    const empty = { ...state, units: state.units.map((u) => (u.id === 'k' ? { ...u, mp: 5 } : u)) };
    expect(() => applyAction(empty, { type: 'attack', targetId: 'e', abilityId: 'fireBlade' })).toThrow();
  });

  it('魔力の刃: 魔力の 40% を攻撃力に加える', () => {
    const stats = { ...testWarrior.stats, magic: 10 };
    expect(applyPassiveStats(stats, [{ id: 'manaBlade', slot: 'support', effect: { kind: 'magicToAttack', percent: 40 } }]).attack).toBe(24);
  });
});

describe('膠着（PR #16 の回答）', () => {
  const quiet = (lastActivityTurn: number, turnNumber: number, enemyHp = 10) =>
    ({
      ...makeState({
        heights: flat(5, 1),
        units: [
          { id: 'p', team: 'player', x: 0, z: 0, hp: 25 },
          { id: 'e', team: 'enemy', x: 4, z: 0, hp: enemyHp },
        ],
      }),
      lastActivityTurn,
      turnNumber,
    }) as BattleState;

  it('30 手番のあいだダメージ・回復・状態変化の付与がなければ、HP の割合が高い側の勝ち。同じならプレイヤー側の負け', () => {
    expect(judgeStalemate(quiet(10, 39), 39)).toBeNull();
    expect(judgeStalemate(quiet(10, 40), 40)).toEqual({ winner: 'player', reason: 'stalemate' });
    expect(judgeStalemate(quiet(10, 40, 40), 40)).toEqual({ winner: 'enemy', reason: 'stalemate' });
    expect(judgeStalemate(quiet(10, 40, 25), 40)).toEqual({ winner: 'enemy', reason: 'stalemate' });
  });

  it('残りの手番数（今の手番を含む）。手番数の勝敗条件がある戦闘では、膠着で終わらない', () => {
    expect(stalemateTurnsLeft(quiet(10, 31))).toBe(10);
    const timed = quiet(10, 40);
    const withTurns = { ...timed, scenario: { ...timed.scenario, objectives: { victory: [{ kind: 'surviveTurns' as const, turns: 99 }], defeat: [] } } };
    expect(judgeStalemate(withTurns, 40)).toBeNull();
    expect(stalemateTurnsLeft(withTurns)).toBeNull();
  });

  it('戦闘の中で、だれも攻撃しないまま 30 手番が過ぎると決着する。攻撃が当たると数え直す', () => {
    const setup = {
      id: 't',
      map: { id: 'm', heights: flat(9, 1), terrain: ['ggggggggg'], legend: { g: 'grass' as const } },
      units: [
        { id: 'p', team: 'player' as const, jobId: 'warrior', x: 0, z: 0, facing: 'east' as const },
        { id: 'e', team: 'enemy' as const, jobId: 'warrior', x: 8, z: 0, facing: 'west' as const },
      ],
    };
    let s = startBattle(setup, [testWarrior], testRules, 1).state;
    let ended;
    for (let i = 0; i < 40 && !s.winner; i++) {
      const r = wait(s);
      ended = r.events.find((e) => e.type === 'battleEnded');
      s = r.state;
    }
    expect(ended).toEqual({ type: 'battleEnded', winner: 'enemy', reason: 'stalemate' });
    expect(s.turnNumber).toBe(30);
  });
});
