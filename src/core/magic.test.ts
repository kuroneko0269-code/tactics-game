import { describe, expect, it } from 'vitest';
import { applyAction, getUnit } from './battle';
import type { BattleAction, BattleEvent, BattleState } from './battleTypes';
import { previewAttack } from './combat';
import { chargeArea, previewSpellAt, spellArea } from './magic';
import { flat, makeState, testFire, testHealer, testMage, testWarrior, testWind } from './testSupport';
import { predictTimeline } from './turnOrder';

/** 行動を順に適用し、最後の状態と出来事をすべて返す */
function run(state: BattleState, actions: BattleAction[]): { state: BattleState; events: BattleEvent[] } {
  const events: BattleEvent[] = [];
  let current = state;
  for (const a of actions) {
    const r = applyAction(current, a);
    events.push(...r.events);
    current = r.state;
  }
  return { state: current, events };
}

/** 今の手番のユニットに、待機（移動も行動もせず）で手番を終えさせる */
const wait: BattleAction = { type: 'endTurn', facing: 'north' };

/**
 * 魔術師 m（魔力 10。炎 20 ダメージ・詠唱の速さ 25、風 10 ダメージ・詠唱の速さ 50）と、
 * 素早さ 6 の戦士たち。全員 CT 0 から始め、m が最初の手番。
 */
function arena(extra: Parameters<typeof makeState>[0]['units'] = [], heights = flat(9, 9)) {
  return makeState({
    heights,
    units: [{ id: 'm', team: 'player', job: testMage, x: 4, z: 8, ct: 100 }, ...extra],
  });
}

describe('魔法の指定と発動の順序', () => {
  it('指定してもすぐには発動せず、詠唱の速さが CT と同じ時計で溜まって 100 に達した時点で発動する', () => {
    const state = arena([
      { id: 'e', team: 'enemy', x: 4, z: 5, ct: 70 },
      { id: 'a', team: 'player', x: 0, z: 0, ct: 90 },
    ]);
    const cast = applyAction(state, { type: 'cast', spellId: 'fire', target: { kind: 'unit', unitId: 'e' } });
    expect(cast.events).toEqual([
      expect.objectContaining({ type: 'castStarted', casterId: 'm', spellId: 'fire', mp: 20 }),
    ]);
    expect(getUnit(cast.state, 'e').hp).toBe(50);
    expect(getUnit(cast.state, 'm').charging).toEqual({ spellId: 'fire', target: { kind: 'unit', unitId: 'e' }, progress: 0 });

    // 時計が2回進むと a（CT 90 → 102）、5回で e（CT 70 → 100）の手番。炎は4回進むと 100 に達する
    const end = applyAction(cast.state, wait);
    expect(end.state.turn?.unitId).toBe('a');
    expect(end.events.some((e) => e.type === 'spellResolved')).toBe(false);
    const next = applyAction(end.state, wait);
    const order = next.events.map((e) => e.type);
    expect(order).toEqual(['turnEnded', 'spellResolved', 'turnStarted']);
    expect(next.state.turn?.unitId).toBe('e');
    expect(getUnit(next.state, 'e').hp).toBe(30);
    expect(getUnit(next.state, 'm').charging).toBeNull();
  });

  it('発動の予定は、行動順の予測にユニットの手番と並べて出る。指定する前にも何番目になるかを予測できる', () => {
    const state = arena([
      { id: 'e', team: 'enemy', x: 4, z: 5, ct: 70 },
      { id: 'a', team: 'player', x: 0, z: 0, ct: 90 },
    ]);
    const before = predictTimeline(state, 4, { pendingSpellId: 'fire' });
    expect(before).toEqual([
      { kind: 'turn', unitId: 'm' },
      { kind: 'turn', unitId: 'a' },
      { kind: 'spell', casterId: 'm', spellId: 'fire' },
      { kind: 'turn', unitId: 'e' },
    ]);
    const cast = applyAction(state, { type: 'cast', spellId: 'fire', target: { kind: 'unit', unitId: 'e' } });
    expect(predictTimeline(cast.state, 4)).toEqual(before);
  });
});

describe('ユニットを狙う・マスを狙う', () => {
  const setup = () =>
    arena([
      { id: 'e', team: 'enemy', x: 4, z: 5, ct: 95 },
      { id: 'far', team: 'enemy', x: 0, z: 0 },
    ]);

  it('ユニットを狙うと、発動までに対象が動いても追いかけて当たる', () => {
    const { state, events } = run(setup(), [
      { type: 'cast', spellId: 'wind', target: { kind: 'unit', unitId: 'e' } },
      wait,
      // e の手番。2マス横へ逃げる
      { type: 'move', x: 6, z: 5 },
      wait,
    ]);
    const resolved = events.find((e) => e.type === 'spellResolved');
    expect(resolved).toMatchObject({ center: { x: 6, z: 5 }, results: [{ unitId: 'e', amount: 10, hp: 40 }] });
    expect(getUnit(state, 'e').hp).toBe(40);
  });

  it('マスを狙うと、その場所に撃つ。発動までに対象が動けば外れる', () => {
    const { state, events } = run(setup(), [
      { type: 'cast', spellId: 'wind', target: { kind: 'tile', x: 4, z: 5 } },
      wait,
      { type: 'move', x: 6, z: 5 },
      wait,
    ]);
    const resolved = events.find((e) => e.type === 'spellResolved');
    expect(resolved).toMatchObject({ center: { x: 4, z: 5 }, results: [] });
    expect(getUnit(state, 'e').hp).toBe(50);
  });

  it('ユニットを狙った魔法は、発動前に対象が倒れていれば不発になる', () => {
    const state = arena([
      { id: 'e', team: 'enemy', x: 4, z: 5, hp: 5 },
      { id: 'w', team: 'player', x: 4, z: 6, ct: 99 },
    ]);
    const { events } = run(state, [
      { type: 'cast', spellId: 'fire', target: { kind: 'unit', unitId: 'e' } },
      wait,
      // w の手番。e を倒す
      { type: 'attack', targetId: 'e' },
    ]);
    expect(events.some((e) => e.type === 'battleEnded')).toBe(true);
    const lastWithTarget = makeState({
      heights: flat(9, 9),
      units: [
        { id: 'm', team: 'player', job: testMage, x: 4, z: 8, charging: { spellId: 'fire', target: { kind: 'unit', unitId: 'gone' }, progress: 99 } },
        { id: 'gone', team: 'enemy', x: 4, z: 5, hp: 0 },
        { id: 'e2', team: 'enemy', x: 0, z: 0 },
      ],
      activeId: 'e2',
    });
    const r = applyAction(lastWithTarget, wait);
    expect(r.events).toContainEqual({ type: 'spellFizzled', casterId: 'm', spellId: 'fire', reason: 'targetDefeated' });
  });

  it('射程は指定の時だけ確かめる。射程の外は指定できないが、発動時に離れていても発動する', () => {
    const state = arena([{ id: 'e', team: 'enemy', x: 4, z: 3, ct: 99 }]);
    // 距離 5 は射程 4 の外
    expect(() => applyAction(state, { type: 'cast', spellId: 'wind', target: { kind: 'unit', unitId: 'e' } })).toThrow();
    const near = arena([{ id: 'e', team: 'enemy', x: 4, z: 4, ct: 99 }]);
    const { events } = run(near, [
      { type: 'cast', spellId: 'wind', target: { kind: 'unit', unitId: 'e' } },
      wait,
      // e は遠くへ逃げる（距離 4 → 7）
      { type: 'move', x: 4, z: 1 },
      wait,
    ]);
    expect(events.find((e) => e.type === 'spellResolved')).toMatchObject({ results: [{ unitId: 'e', amount: 10 }] });
  });
});

describe('範囲と高さの許容', () => {
  it('範囲 1 は中心と上下左右の5マス。中心との高さの差が許容を超えるマスには届かない', () => {
    const heights = flat(5, 5);
    heights[2]![3] = 2; // 差 2: 届く
    heights[1]![2] = 3; // 差 3: 届かない
    const state = makeState({ heights, units: [{ id: 'm', team: 'player', job: testMage, x: 0, z: 0 }] });
    const area = spellArea(state.map, testFire, { x: 2, z: 2 });
    expect(area).toHaveLength(4);
    expect(area).toEqual(
      expect.arrayContaining([
        { x: 2, z: 2 },
        { x: 3, z: 2 },
        { x: 1, z: 2 },
        { x: 2, z: 3 },
      ]),
    );
    expect(spellArea(state.map, testWind, { x: 2, z: 2 })).toEqual([{ x: 2, z: 2 }]);
  });

  it('範囲の攻撃魔法は、発動した時点で範囲内にいる味方も巻き込む。回復魔法は敵も回復する', () => {
    const state = makeState({
      heights: flat(7, 7),
      units: [
        { id: 'm', team: 'player', job: testMage, x: 3, z: 6 },
        { id: 'e', team: 'enemy', x: 3, z: 3 },
        { id: 'ally', team: 'player', x: 3, z: 4 },
        { id: 'h', team: 'player', job: testHealer, x: 0, z: 6 },
        { id: 'hurtEnemy', team: 'enemy', x: 1, z: 4, hp: 10 },
        { id: 'hurtAlly', team: 'player', x: 0, z: 4, hp: 10 },
      ],
    });
    const m = getUnit(state, 'm');
    const fire = previewSpellAt(state, m, testFire, { x: 3, z: 3 });
    expect(fire.results).toEqual([
      { unitId: 'e', amount: 20, hp: 30 },
      { unitId: 'ally', amount: 20, hp: 30 },
    ]);
    const h = getUnit(state, 'h');
    const heal = previewSpellAt(state, h, h.spells[0]!, { x: 0, z: 4 });
    expect(heal.results).toEqual([
      { unitId: 'hurtEnemy', amount: 20, hp: 30 },
      { unitId: 'hurtAlly', amount: 20, hp: 30 },
    ]);
    // 回復は最大 HP まで
    const nearlyFull = makeState({
      heights: flat(3, 3),
      units: [
        { id: 'h', team: 'player', job: testHealer, x: 0, z: 0 },
        { id: 'a', team: 'player', x: 1, z: 1, hp: 45 },
      ],
    });
    const h2 = getUnit(nearlyFull, 'h');
    expect(previewSpellAt(nearlyFull, h2, h2.spells[0]!, { x: 1, z: 1 }).results).toEqual([{ unitId: 'a', amount: 5, hp: 50 }]);
  });

  it('魔法は必ず当たり、向きと高低差の補正を受けない', () => {
    const heights = flat(5, 5);
    heights[0]![2] = 2;
    const state = makeState({
      heights,
      units: [
        { id: 'm', team: 'player', job: testMage, x: 2, z: 4 },
        { id: 'e', team: 'enemy', x: 2, z: 0, facing: 'north' },
      ],
    });
    const preview = previewSpellAt(state, getUnit(state, 'm'), testWind, { x: 2, z: 0 });
    expect(preview.results).toEqual([{ unitId: 'e', amount: 10, hp: 40 }]);
  });

  it('予約されている範囲は、ユニット狙いなら対象の今の位置、マス狙いならそのマスに出る', () => {
    const state = makeState({
      heights: flat(5, 5),
      units: [
        { id: 'm', team: 'player', job: testMage, x: 0, z: 0, charging: { spellId: 'wind', target: { kind: 'unit', unitId: 'e' }, progress: 0 } },
        { id: 'e', team: 'enemy', x: 3, z: 3 },
        { id: 'm2', team: 'enemy', job: testMage, x: 4, z: 4, charging: { spellId: 'fire', target: { kind: 'tile', x: 1, z: 1 }, progress: 0 } },
      ],
    });
    expect(chargeArea(state, getUnit(state, 'm'))).toEqual([{ x: 3, z: 3 }]);
    expect(chargeArea(state, getUnit(state, 'm2'))).toHaveLength(5);
  });
});

describe('詠唱中のユニット', () => {
  it('受けるダメージが 1.25 倍になる（通常攻撃も魔法も）', () => {
    const state = makeState({
      heights: flat(5, 5),
      units: [
        { id: 'w', team: 'enemy', x: 2, z: 1, facing: 'south' },
        { id: 'm', team: 'player', job: testMage, x: 2, z: 2, facing: 'north', charging: { spellId: 'fire', target: { kind: 'tile', x: 0, z: 0 }, progress: 0 } },
        { id: 'm2', team: 'enemy', job: testMage, x: 2, z: 4 },
      ],
    });
    const w = getUnit(state, 'w');
    const m = getUnit(state, 'm');
    // 正面から攻撃力 20 → 25
    expect(previewAttack(state, w, m)).toMatchObject({ side: 'front', chargingPercent: 125, damage: 25 });
    // 炎 20 → 25（HP 30 なので 25）
    expect(previewSpellAt(state, getUnit(state, 'm2'), testFire, { x: 2, z: 2 }).results).toContainEqual({ unitId: 'm', amount: 25, hp: 5 });
  });

  it('倒されると魔法は不発になる', () => {
    const state = makeState({
      heights: flat(5, 5),
      units: [
        { id: 'w', team: 'enemy', x: 2, z: 1, facing: 'south' },
        { id: 'm', team: 'player', job: testMage, x: 2, z: 2, facing: 'north', hp: 10, charging: { spellId: 'fire', target: { kind: 'tile', x: 2, z: 0 }, progress: 50 } },
        { id: 'ally', team: 'player', x: 4, z: 4 },
      ],
      seed: 3,
    });
    // 命中するシード値を探す（正面は 85%）
    let result;
    for (let seed = 1; seed < 50; seed++) {
      result = applyAction({ ...state, rngState: seed }, { type: 'attack', targetId: 'm' });
      if (getUnit(result.state, 'm').hp === 0) break;
    }
    expect(result!.events).toContainEqual({ type: 'spellFizzled', casterId: 'm', spellId: 'fire', reason: 'casterDefeated' });
    expect(getUnit(result!.state, 'm').charging).toBeNull();
    // その後、時計が進んでも発動しない
    const after = applyAction(result!.state, { type: 'endTurn', facing: 'south' });
    expect(after.events.some((e) => e.type === 'spellResolved')).toBe(false);
  });

  it('詠唱中に自分の手番が来た時、待機なら詠唱を続ける', () => {
    const state = makeState({
      heights: flat(5, 5),
      units: [
        { id: 'm', team: 'player', job: testMage, x: 0, z: 4, mp: 20, charging: { spellId: 'fire', target: { kind: 'tile', x: 0, z: 0 }, progress: 30 } },
        { id: 'e', team: 'enemy', x: 4, z: 0, ct: 95 },
      ],
    });
    expect(state.turn?.chargingAtStart).toBe(true);
    const r = applyAction(state, wait);
    expect(r.events.some((e) => e.type === 'castInterrupted')).toBe(false);
    // 詠唱は続き、時計が進んだ分（1回ぶん）だけ溜まっている
    const m = getUnit(r.state, 'm');
    expect(m.charging).toMatchObject({ spellId: 'fire', progress: 55 });
    expect(m.mp).toBe(20);
  });

  it('詠唱中に自分の手番が来た時、移動か行動をすると詠唱は中断され、MP は戻らない', () => {
    const charging = { spellId: 'fire', target: { kind: 'tile' as const, x: 0, z: 0 }, progress: 30 };
    const base = (mp: number) =>
      makeState({
        heights: flat(5, 5),
        units: [
          { id: 'm', team: 'player', job: testMage, x: 2, z: 2, mp, charging },
          { id: 'e', team: 'enemy', x: 2, z: 1 },
        ],
      });
    for (const action of [
      { type: 'move', x: 2, z: 4 },
      { type: 'attack', targetId: 'e' },
      { type: 'cast', spellId: 'wind', target: { kind: 'unit', unitId: 'e' } },
    ] satisfies BattleAction[]) {
      const r = applyAction(base(20), action);
      expect(r.events[0], action.type).toEqual({ type: 'castInterrupted', casterId: 'm', spellId: 'fire' });
      const m = getUnit(r.state, 'm');
      expect(m.mp, action.type).toBe(action.type === 'cast' ? 15 : 20);
      expect(m.charging?.spellId ?? null, action.type).toBe(action.type === 'cast' ? 'wind' : null);
    }
    // 中断したのは手番開始時の詠唱だけ。この手番で指定した魔法は、その後の移動では中断されない
    const r = run(base(20), [
      { type: 'cast', spellId: 'wind', target: { kind: 'unit', unitId: 'e' } },
      { type: 'move', x: 2, z: 4 },
    ]);
    expect(r.events.filter((e) => e.type === 'castInterrupted')).toHaveLength(1);
    expect(getUnit(r.state, 'm').charging?.spellId).toBe('wind');
  });

  it('ルール上できない操作はエラーになり、詠唱は中断されない', () => {
    const state = makeState({
      heights: flat(5, 5),
      units: [
        { id: 'm', team: 'player', job: testMage, x: 2, z: 2, charging: { spellId: 'fire', target: { kind: 'tile', x: 0, z: 0 }, progress: 30 } },
        { id: 'e', team: 'enemy', x: 0, z: 0 },
      ],
    });
    expect(() => applyAction(state, { type: 'attack', targetId: 'e' })).toThrow();
    expect(getUnit(state, 'm').charging).not.toBeNull();
  });
});

describe('MP', () => {
  it('魔法を指定すると MP を消費する。足りない魔法は指定できない', () => {
    const state = makeState({
      heights: flat(7, 7),
      units: [
        { id: 'm', team: 'player', job: testMage, x: 3, z: 6, mp: 7 },
        { id: 'e', team: 'enemy', x: 3, z: 3 },
      ],
    });
    expect(() => applyAction(state, { type: 'cast', spellId: 'fire', target: { kind: 'unit', unitId: 'e' } })).toThrow(/MP/);
    const r = applyAction(state, { type: 'cast', spellId: 'wind', target: { kind: 'unit', unitId: 'e' } });
    expect(getUnit(r.state, 'm').mp).toBe(2);
  });

  it('使えない魔法や、一度行動した後の指定はエラー', () => {
    const state = makeState({
      heights: flat(7, 7),
      units: [
        { id: 'w', team: 'player', job: testWarrior, x: 3, z: 4 },
        { id: 'e', team: 'enemy', x: 3, z: 3 },
      ],
    });
    expect(() => applyAction(state, { type: 'cast', spellId: 'fire', target: { kind: 'unit', unitId: 'e' } })).toThrow();
    const mageState = makeState({
      heights: flat(7, 7),
      units: [
        { id: 'm', team: 'player', job: testMage, x: 3, z: 4 },
        { id: 'e', team: 'enemy', x: 3, z: 3 },
      ],
    });
    const after = applyAction(mageState, { type: 'cast', spellId: 'wind', target: { kind: 'unit', unitId: 'e' } });
    expect(() => applyAction(after.state, { type: 'cast', spellId: 'wind', target: { kind: 'unit', unitId: 'e' } })).toThrow();
  });
});
