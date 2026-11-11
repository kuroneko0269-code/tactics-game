import { describe, expect, it } from 'vitest';
import { applyAction, startBattle } from './battle';
import type {
  BattleEvent,
  BattleObjectives,
  BattleSetup,
  BattleState,
  MapEventDefinition,
  TrapPlacement,
  UnitPlacement,
} from './battleTypes';
import { judgeOutcome, judgeTurnOutcome, spawnTile, turnsRemaining } from './scenario';
import { flat, makeState, testJobs, testSpells, testStrikes } from './testSupport';

/** テスト用の戦闘を始める（10×10 の平らなマップ） */
function begin(options: {
  units?: UnitPlacement[];
  objectives?: BattleObjectives;
  events?: MapEventDefinition[];
  traps?: TrapPlacement[];
  heights?: number[][];
}): { state: BattleState; events: readonly BattleEvent[] } {
  const heights = options.heights ?? flat(10, 10);
  const setup: BattleSetup = {
    id: 'test',
    map: { id: 'test', heights, terrain: heights.map((r) => 'g'.repeat(r.length)), legend: { g: 'grass' } },
    units: options.units ?? [
      { id: 'p1', team: 'player', jobId: 'warrior', x: 1, z: 8, facing: 'north' },
      { id: 'e1', team: 'enemy', jobId: 'warrior', x: 8, z: 1, facing: 'south' },
    ],
    objectives: options.objectives,
    events: options.events,
    traps: options.traps,
  };
  return startBattle(setup, testJobs, makeState({ heights: flat(1, 1), units: [] }).rules, 1, testSpells, testStrikes);
}

/** 手番を待機で終える（向きは北） */
const wait = (state: BattleState) => applyAction(state, { type: 'endTurn', facing: 'north' });

/** 手番を待機で n 回終え、その間の出来事をまとめて返す */
function waitTurns(state: BattleState, n: number): { state: BattleState; events: BattleEvent[] } {
  let current = state;
  const events: BattleEvent[] = [];
  for (let i = 0; i < n && current.turn; i++) {
    const r = wait(current);
    current = r.state;
    events.push(...r.events);
  }
  return { state: current, events };
}

describe('勝敗条件', () => {
  it('省くと、今までどおり敵の全滅で勝利、味方の全滅で敗北', () => {
    const units = (p: number, e: number) =>
      makeState({
        heights: flat(4, 4),
        units: [
          { id: 'p', team: 'player', x: 0, z: 0, hp: p },
          { id: 'e', team: 'enemy', x: 3, z: 3, hp: e },
        ],
      });
    expect(judgeOutcome(units(10, 0))).toEqual({ winner: 'player', reason: 'defeatAll' });
    expect(judgeOutcome(units(0, 10))).toEqual({ winner: 'enemy', reason: 'allDefeated' });
    expect(judgeOutcome(units(10, 10))).toBeNull();
  });

  it('特定の敵の撃破: その敵が倒れたら、ほかの敵が残っていても勝利', () => {
    const state = makeState({
      heights: flat(4, 4),
      units: [
        { id: 'p', team: 'player', x: 0, z: 0 },
        { id: 'boss', team: 'enemy', x: 3, z: 3, hp: 0 },
        { id: 'guard', team: 'enemy', x: 2, z: 3 },
      ],
      scenario: { objectives: { victory: [{ kind: 'defeatUnit', unitId: 'boss' }], defeat: [{ kind: 'allDefeated' }] } },
    });
    expect(judgeOutcome(state)).toEqual({ winner: 'player', reason: 'defeatUnit' });
  });

  it('指定のマスへの到達: 味方がマスに移動した時点で勝利（敵が入っても勝利にはならない）', () => {
    const objectives: BattleObjectives = {
      victory: [{ kind: 'reachTile', tiles: [{ x: 2, z: 0 }] }],
      defeat: [{ kind: 'allDefeated' }],
    };
    const state = makeState({
      heights: flat(4, 4),
      units: [
        { id: 'p', team: 'player', x: 0, z: 0 },
        { id: 'e', team: 'enemy', x: 3, z: 3 },
      ],
      scenario: { objectives },
    });
    const r = applyAction(state, { type: 'move', x: 2, z: 0 });
    expect(r.state.winner).toBe('player');
    expect(r.events.at(-1)).toEqual({ type: 'battleEnded', winner: 'player', reason: 'reachTile' });
    const enemyThere = makeState({
      heights: flat(4, 4),
      units: [
        { id: 'p', team: 'player', x: 0, z: 3 },
        { id: 'e', team: 'enemy', x: 2, z: 0 },
      ],
      scenario: { objectives },
    });
    expect(judgeOutcome(enemyThere)).toBeNull();
  });

  it('規定の手番数を耐える: turns 回の手番が終わった時点で勝利', () => {
    const { state } = begin({ objectives: { victory: [{ kind: 'surviveTurns', turns: 3 }], defeat: [{ kind: 'allDefeated' }] } });
    expect(state.turnNumber).toBe(1);
    expect(turnsRemaining(state)).toEqual({ kind: 'surviveTurns', turns: 3 });
    const two = waitTurns(state, 2).state;
    expect(two.winner).toBeNull();
    expect(two.turnNumber).toBe(3);
    expect(turnsRemaining(two)).toEqual({ kind: 'surviveTurns', turns: 1 });
    const r = wait(two);
    expect(r.state.winner).toBe('player');
    expect(r.state.turn).toBeNull();
    expect(r.events.at(-1)).toEqual({ type: 'battleEnded', winner: 'player', reason: 'surviveTurns' });
  });

  it('特定の味方が倒れたら敗北（ほかの味方が残っていても）', () => {
    const state = makeState({
      heights: flat(4, 4),
      units: [
        { id: 'leader', team: 'player', x: 0, z: 0, hp: 0 },
        { id: 'p2', team: 'player', x: 1, z: 0 },
        { id: 'e', team: 'enemy', x: 3, z: 3 },
      ],
      scenario: { objectives: { victory: [{ kind: 'defeatAll' }], defeat: [{ kind: 'unitDefeated', unitId: 'leader' }] } },
    });
    expect(judgeOutcome(state)).toEqual({ winner: 'enemy', reason: 'unitDefeated' });
  });

  it('規定の手番数を超える: turns 回の手番が終わっても勝っていなければ敗北', () => {
    const { state } = begin({ objectives: { victory: [{ kind: 'defeatAll' }], defeat: [{ kind: 'turnLimit', turns: 2 }] } });
    const r = waitTurns(state, 2);
    expect(r.state.winner).toBe('enemy');
    expect(r.events.at(-1)).toEqual({ type: 'battleEnded', winner: 'enemy', reason: 'turnLimit' });
  });

  it('勝利と敗北が同時に満たされた時は、勝利を優先する', () => {
    // 撃破の対象と、倒れると負けになる味方が同時に倒れている
    const both = makeState({
      heights: flat(4, 4),
      units: [
        { id: 'leader', team: 'player', x: 0, z: 0, hp: 0 },
        { id: 'p2', team: 'player', x: 1, z: 0 },
        { id: 'boss', team: 'enemy', x: 3, z: 3, hp: 0 },
        { id: 'guard', team: 'enemy', x: 2, z: 3 },
      ],
      scenario: {
        objectives: {
          victory: [{ kind: 'defeatUnit', unitId: 'boss' }],
          defeat: [{ kind: 'unitDefeated', unitId: 'leader' }],
        },
      },
    });
    expect(judgeOutcome(both)?.winner).toBe('player');
    // 両軍の全滅が同時（範囲の魔法など）
    const wiped = makeState({
      heights: flat(4, 4),
      units: [
        { id: 'p', team: 'player', x: 0, z: 0, hp: 0 },
        { id: 'e', team: 'enemy', x: 3, z: 3, hp: 0 },
      ],
    });
    expect(judgeOutcome(wiped)?.winner).toBe('player');
    // 耐える手番数と、超えてはいけない手番数が同じ
    const turnBoth: BattleObjectives = {
      victory: [{ kind: 'surviveTurns', turns: 5 }],
      defeat: [{ kind: 'turnLimit', turns: 5 }],
    };
    expect(judgeTurnOutcome(turnBoth, 5)?.winner).toBe('player');
    expect(judgeTurnOutcome(turnBoth, 4)).toBeNull();
  });
});

describe('マップ上のイベント', () => {
  it('「手番」のきっかけ: 戦闘の開始時（0）と、規定の手番数が経過した時にメッセージを出す', () => {
    const { state, events } = begin({
      events: [
        { id: 'intro', trigger: { kind: 'turn', turn: 0 }, effects: [{ kind: 'message', messageId: 'hello' }] },
        { id: 'later', trigger: { kind: 'turn', turn: 2 }, effects: [{ kind: 'message', messageId: 'later' }] },
      ],
    });
    expect(events.filter((e) => e.type === 'message')).toEqual([{ type: 'message', messageId: 'hello' }]);
    const one = wait(state);
    expect(one.events.some((e) => e.type === 'message')).toBe(false);
    const two = wait(one.state);
    expect(two.events.filter((e) => e.type === 'message')).toEqual([{ type: 'message', messageId: 'later' }]);
    // 1回だけ
    expect(waitTurns(two.state, 4).events.some((e) => e.type === 'message')).toBe(false);
  });

  it('every で繰り返し、times の回数で止まる', () => {
    const { state } = begin({
      events: [{ id: 'tick', trigger: { kind: 'turn', turn: 1, every: 2 }, effects: [{ kind: 'message', messageId: 't' }], times: 3 }],
    });
    const r = waitTurns(state, 10);
    // 1, 3, 5 手番の後（3回まで）
    expect(r.events.filter((e) => e.type === 'message')).toHaveLength(3);
  });

  it('「マスに入る」のきっかけ: 指定の陣営のユニットがマスに入った時だけ起き、その移動は取り消せない', () => {
    const base = {
      heights: flat(5, 5),
      units: [
        { id: 'p', team: 'player' as const, x: 0, z: 0 },
        { id: 'e', team: 'enemy' as const, x: 4, z: 4 },
      ],
    };
    const event = {
      id: 'step',
      trigger: { kind: 'enterTile' as const, tiles: [{ x: 2, z: 0 }], team: 'player' as const },
      effects: [{ kind: 'message' as const, messageId: 'step' }],
      times: 1,
      fired: 0,
    };
    const state = makeState({ ...base, scenario: { events: [event] } });
    const elsewhere = applyAction(state, { type: 'move', x: 1, z: 0 });
    expect(elsewhere.events.some((e) => e.type === 'message')).toBe(false);
    expect(() => applyAction(elsewhere.state, { type: 'undoMove' })).not.toThrow();
    const r = applyAction(state, { type: 'move', x: 2, z: 0 });
    expect(r.events.filter((e) => e.type === 'message')).toEqual([{ type: 'message', messageId: 'step' }]);
    expect(r.state.scenario.events[0]!.fired).toBe(1);
    expect(() => applyAction(r.state, { type: 'undoMove' })).toThrow();
    // 敵が入っても起きない
    const enemyTurn = makeState({ ...base, units: [base.units[1]!, base.units[0]!], scenario: { events: [event] } });
    const moved = applyAction({ ...enemyTurn, units: enemyTurn.units.map((u) => (u.id === 'e' ? { ...u, x: 2, z: 2 } : u)) }, {
      type: 'move',
      x: 2,
      z: 0,
    });
    expect(moved.events.some((e) => e.type === 'message')).toBe(false);
  });

  it('「HP が一定以下」と「撃破」のきっかけは、HP が減った時に1回だけ起きる', () => {
    const state = makeState({
      heights: flat(4, 4),
      units: [
        { id: 'p', team: 'player', x: 0, z: 0 },
        { id: 'e', team: 'enemy', x: 1, z: 0, hp: 30, facing: 'east' },
        { id: 'e2', team: 'enemy', x: 3, z: 3 },
      ],
      scenario: {
        events: [
          { id: 'hurt', trigger: { kind: 'hpBelow', unitId: 'e', percent: 50 }, effects: [{ kind: 'message', messageId: 'hurt' }], times: 1, fired: 0 },
          { id: 'down', trigger: { kind: 'unitDefeated', unitId: 'e' }, effects: [{ kind: 'message', messageId: 'down' }], times: 1, fired: 0 },
        ],
      },
    });
    // 背面から 20 × 1.25 = 25 ダメージで HP 5（最大 HP 50 の 50% 以下）
    const hurt = applyAction(state, { type: 'attack', targetId: 'e' });
    const hit = hurt.events.find((e) => e.type === 'attacked');
    expect(hit && hit.type === 'attacked' && hit.hit).toBe(true);
    expect(hurt.events.filter((e) => e.type === 'message')).toEqual([{ type: 'message', messageId: 'hurt' }]);
    // 次の攻撃で倒すと「撃破」だけが起きる（「HP が一定以下」は起き直さない）
    const again = applyAction(
      { ...hurt.state, turn: { ...hurt.state.turn!, acted: false, unitId: 'p' }, winner: null },
      { type: 'attack', targetId: 'e' },
    );
    expect(again.events.filter((e) => e.type === 'message')).toEqual([{ type: 'message', messageId: 'down' }]);
  });

  it('増援: きっかけの時点で予告し、delay 手番後の区切りで現れる', () => {
    const { state } = begin({
      events: [
        {
          id: 'wave',
          trigger: { kind: 'turn', turn: 1 },
          effects: [{ kind: 'reinforce', delay: 2, units: [{ id: 'r1', team: 'enemy', jobId: 'archer', x: 5, z: 0, facing: 'south' }] }],
        },
      ],
    });
    const warned = wait(state);
    expect(warned.events).toContainEqual({ type: 'reinforcementWarned', eventId: 'wave', appearAfterTurn: 3, tiles: [{ x: 5, z: 0 }] });
    expect(warned.state.scenario.reinforcements).toHaveLength(1);
    expect(warned.state.units.some((u) => u.id === 'r1')).toBe(false);
    const notYet = wait(warned.state);
    expect(notYet.state.units.some((u) => u.id === 'r1')).toBe(false);
    const appeared = wait(notYet.state);
    const ev = appeared.events.find((e) => e.type === 'unitAppeared');
    expect(ev && ev.type === 'unitAppeared' && ev.unit.id).toBe('r1');
    const r1 = appeared.state.units.find((u) => u.id === 'r1')!;
    expect({ x: r1.x, z: r1.z, team: r1.team, hp: r1.hp, ct: r1.ct }).toEqual({ x: 5, z: 0, team: 'enemy', hp: r1.stats.maxHp, ct: r1.ct });
    expect(appeared.state.scenario.reinforcements).toHaveLength(0);
    // 現れたユニットも行動順に入る
    const later = waitTurns(appeared.state, 6);
    expect(later.events.some((e) => e.type === 'turnStarted' && e.unitId === 'r1')).toBe(true);
  });

  it('繰り返す増援は、id に何回目かを付ける', () => {
    const { state } = begin({
      events: [
        {
          id: 'wave',
          trigger: { kind: 'turn', turn: 1, every: 2 },
          times: 2,
          effects: [{ kind: 'reinforce', delay: 1, units: [{ id: 'r', team: 'enemy', jobId: 'warrior', x: 5, z: 0, facing: 'south' }] }],
        },
      ],
    });
    const r = waitTurns(state, 6);
    expect(r.state.units.map((u) => u.id).filter((id) => id.startsWith('r-'))).toEqual(['r-1', 'r-2']);
  });

  it('出現するマスがふさがっている時は、近くの空いたマスに出す', () => {
    const { state } = begin({
      units: [
        { id: 'p1', team: 'player', jobId: 'warrior', x: 5, z: 0, facing: 'north' },
        { id: 'e1', team: 'enemy', jobId: 'warrior', x: 8, z: 8, facing: 'south' },
      ],
      events: [
        {
          id: 'wave',
          trigger: { kind: 'turn', turn: 0 },
          effects: [
            {
              kind: 'reinforce',
              delay: 1,
              units: [
                { id: 'r1', team: 'enemy', jobId: 'warrior', x: 5, z: 0, facing: 'south' },
                { id: 'r2', team: 'enemy', jobId: 'warrior', x: 5, z: 0, facing: 'south' },
              ],
            },
          ],
        },
      ],
    });
    const r = wait(state);
    const pos = (id: string) => {
      const u = r.state.units.find((x) => x.id === id)!;
      return { x: u.x, z: u.z };
    };
    // (5,0) には味方がいるので、近い順（同じ距離なら奥 → 西）: (5,1) の次は (4,0)
    expect(pos('r1')).toEqual({ x: 4, z: 0 });
    expect(pos('r2')).toEqual({ x: 6, z: 0 });
    expect(spawnTile(r.state, { x: 5, z: 0 })).toEqual({ x: 5, z: 1 });
  });

  it('イベントの罠: 指定のマスにいるユニットに効果を与える（誰もいないマスにも演出の出来事を出す）', () => {
    const { state } = begin({
      events: [
        { id: 'rocks', trigger: { kind: 'turn', turn: 1 }, effects: [{ kind: 'trap', trap: 'rockfall', tiles: [{ x: 1, z: 8 }, { x: 2, z: 8 }] }] },
      ],
    });
    const r = wait(state);
    const traps = r.events.filter((e) => e.type === 'trapTriggered');
    expect(traps).toHaveLength(2);
    const p1 = r.state.units.find((u) => u.id === 'p1')!;
    expect(traps[0]).toMatchObject({ unitId: 'p1', damage: 10, hp: p1.hp, revealed: false });
    expect(p1.hp).toBe(p1.stats.maxHp - 10);
    expect(traps[1]).toMatchObject({ unitId: null, x: 2, z: 8 });
  });
});

describe('罠', () => {
  const trapState = (kind: 'rockfall' | 'mud' | 'drain', first = 'p', level = 5) =>
    makeState({
      heights: flat(5, 5),
      units: [
        { id: 'p', team: 'player', x: 1, z: 2, level },
        { id: 'e', team: 'enemy', x: 4, z: 2, level },
      ],
      activeId: first,
      scenario: { traps: [{ x: 2, z: 2, kind, revealed: false }] },
    });

  it('踏むまで見えず、止まると発動して見えるようになる。その移動は取り消せない', () => {
    const state = trapState('rockfall');
    expect(state.scenario.traps[0]!.revealed).toBe(false);
    // 通り過ぎるだけでは発動しない（(1,2) → (2,2) → (3,2)）
    const passed = applyAction(state, { type: 'move', x: 3, z: 2 });
    expect(passed.events[0]).toMatchObject({ type: 'moved', path: [{ x: 1, z: 2 }, { x: 2, z: 2 }, { x: 3, z: 2 }] });
    expect(passed.events.some((e) => e.type === 'trapTriggered')).toBe(false);
    const r = applyAction(state, { type: 'move', x: 2, z: 2 });
    expect(r.events).toContainEqual({ type: 'trapTriggered', trap: 'rockfall', x: 2, z: 2, unitId: 'p', revealed: true, damage: 10, hp: 40 });
    expect(r.state.scenario.traps[0]!.revealed).toBe(true);
    expect(r.state.units.find((u) => u.id === 'p')!.hp).toBe(40);
    expect(() => applyAction(r.state, { type: 'undoMove' })).toThrow();
  });

  it('見えるようになっても、踏めば何度でも発動する', () => {
    const revealed = trapState('rockfall');
    const state = { ...revealed, scenario: { ...revealed.scenario, traps: [{ x: 2, z: 2, kind: 'rockfall' as const, revealed: true }] } };
    const r = applyAction(state, { type: 'move', x: 2, z: 2 });
    expect(r.events).toContainEqual(expect.objectContaining({ type: 'trapTriggered', revealed: false, damage: 10 }));
  });

  it('敵が踏んでも発動する', () => {
    const r = applyAction(trapState('mud', 'e'), { type: 'move', x: 2, z: 2 });
    expect(r.events).toContainEqual(expect.objectContaining({ type: 'trapTriggered', trap: 'mud', unitId: 'e', revealed: true }));
    expect(r.events).toContainEqual({ type: 'statusAdded', unitId: 'e', status: 'slow', turns: 2 });
    expect(r.state.units.find((u) => u.id === 'e')!.statuses.map((s) => s.id)).toEqual(['slow']);
  });

  it('脱力の罠: その場でレベルが 1 下がり、成長値と能力値も下がる（何度でも。レベル 1 より下にはならない）', () => {
    const growth = { maxHp: 1200, maxMp: 0, attack: 240, magic: 0, speed: 20 };
    const base = trapState('drain');
    const state = {
      ...base,
      units: base.units.map((u) =>
        u.id === 'p'
          ? { ...u, growth, growthRates: { maxHp: 300, maxMp: 0, attack: 60, magic: 0, speed: 4 }, stats: { ...u.stats, maxHp: 62, attack: 22 }, hp: 62 }
          : u,
      ),
    };
    const r = applyAction(state, { type: 'move', x: 2, z: 2 });
    expect(r.events).toContainEqual(expect.objectContaining({ type: 'trapTriggered', trap: 'drain', level: { from: 5, to: 4 } }));
    const p = r.state.units.find((u) => u.id === 'p')!;
    expect(p.level).toBe(4);
    expect(p.levelDrops).toBe(1);
    expect(p.growth).toEqual({ maxHp: 900, maxMp: 0, attack: 180, magic: 0, speed: 16 });
    // 能力値 = 基本値（HP 50、攻撃力 20）+ 成長値。今の HP は最大を超えないように抑える
    expect(p.stats.maxHp).toBe(59);
    expect(p.stats.attack).toBe(21);
    expect(p.hp).toBe(59);
    // レベル 1 のユニットは下がらない
    const low = applyAction(trapState('drain', 'p', 1), { type: 'move', x: 2, z: 2 });
    expect(low.events).toContainEqual(expect.objectContaining({ type: 'trapTriggered', level: { from: 1, to: 1 } }));
    expect(low.state.units.find((u) => u.id === 'p')!.levelDrops).toBe(0);
  });

  it('落石で手番のユニットが倒れたら、その手番はそこで終わる', () => {
    const base = trapState('rockfall');
    const state = { ...base, units: base.units.map((u) => (u.id === 'p' ? { ...u, hp: 5 } : u)) };
    const r = applyAction(state, { type: 'move', x: 2, z: 2 });
    expect(r.events).toContainEqual({ type: 'defeated', unitId: 'p' });
    // 味方が全滅したので敗北
    expect(r.state.winner).toBe('enemy');
  });

  it('突き飛ばしで押し出された先の罠も発動する', () => {
    const state = makeState({
      heights: flat(5, 5),
      units: [
        { id: 'p', team: 'player', x: 2, z: 0, commands: [{ jobId: 'warrior', abilityIds: ['knockback'] }] },
        { id: 'e', team: 'enemy', x: 2, z: 1, facing: 'south' },
      ],
      scenario: { traps: [{ x: 2, z: 2, kind: 'mud', revealed: false }] },
    });
    const r = applyAction(state, { type: 'attack', targetId: 'e', abilityId: 'knockback' });
    expect(r.events).toContainEqual(expect.objectContaining({ type: 'trapTriggered', trap: 'mud', unitId: 'e', revealed: true }));
  });
});
