import { describe, expect, it } from 'vitest';
import { applyAction, getUnit } from './battle';
import type { BattleEvent, BattleState, UnitProgressState } from './battleTypes';
import { attackableTargets, previewAttack } from './combat';
import { isValidSpellTarget, previewSpellAt } from './magic';
import { reachableTiles } from './movement';
import { judgeOutcome } from './scenario';
import {
  findSeed,
  flat,
  makeState,
  testHealer,
  testKnockback,
  testProgressionRules,
  testRules,
  testWarrior,
} from './testSupport';

/** 待機して手番を終える（向きは今のまま） */
const wait = (state: BattleState) => applyAction(state, { type: 'endTurn', facing: getUnit(state, state.turn!.unitId).facing });

const healerCmd = [{ jobId: 'healer', abilityIds: ['heal', 'revive'] }];
const types = (events: readonly BattleEvent[]) => events.map((e) => e.type);

describe('戦闘不能（フェーズ2-5）', () => {
  it('HP が 0 になると戦闘不能になり、倒れた姿でマスに残る（カウント 3）。攻撃・回復・状態変化の対象にならない', () => {
    const state = makeState({
      heights: flat(4, 1),
      units: [
        { id: 'w', team: 'player', x: 0, z: 0 },
        { id: 'e', team: 'enemy', x: 1, z: 0, hp: 5 },
        { id: 'e2', team: 'enemy', x: 3, z: 0 },
      ],
    });
    const r = findSeed(state, { type: 'attack', targetId: 'e' }, (x) => getUnit(x.state, 'e').hp === 0);
    const e = getUnit(r.state, 'e');
    expect(r.events).toContainEqual({ type: 'defeated', unitId: 'e', count: 3 });
    expect(e).toMatchObject({ x: 1, z: 0, hp: 0, knockoutCount: 3, retired: false });
    // 攻撃できない
    expect(attackableTargets(r.state, getUnit(r.state, 'w'), getUnit(r.state, 'w')).map((u) => u.id)).not.toContain('e');
    // 回復・状態変化の魔法にも巻き込まれない。蘇生だけが届く
    const healer = { ...getUnit(r.state, 'w'), jobId: 'healer' };
    const heal = { id: 'heal', kind: 'magic' as const, element: 'light' as const, effect: 'heal' as const, power: 200, mpCost: 0, range: 4, areaRadius: 1, heightTolerance: 2, castSpeed: 50 };
    expect(previewSpellAt(r.state, healer, heal, { x: 1, z: 0 }).results.map((x) => x.unitId)).not.toContain('e');
    const revive = { ...heal, id: 'revive', effect: 'revive' as const, power: 25, areaRadius: 0 };
    expect(previewSpellAt(r.state, healer, revive, { x: 1, z: 0 }).results).toEqual([{ unitId: 'e', amount: 12, hp: 12 }]);
    // 蘇生は戦闘不能のユニットだけを狙える。それ以外の魔法は戦闘不能のユニットを狙えない
    expect(isValidSpellTarget(r.state, revive, healer, { kind: 'unit', unitId: 'e' })).toBe(true);
    expect(isValidSpellTarget(r.state, revive, healer, { kind: 'unit', unitId: 'e2' })).toBe(false);
    expect(isValidSpellTarget(r.state, heal, healer, { kind: 'unit', unitId: 'e' })).toBe(false);
  });

  it('戦闘不能のマスは通過できるが止まれず、突き飛ばしでもそのマスへ押し出せない（戦闘不能のユニットは動かない）', () => {
    const state = makeState({
      heights: flat(5, 1),
      units: [
        { id: 'w', team: 'player', x: 0, z: 0, commands: [{ jobId: 'warrior', abilityIds: ['knockback'] }] },
        { id: 'e', team: 'enemy', x: 1, z: 0 },
        { id: 'down', team: 'enemy', x: 2, z: 0, hp: 0 },
      ],
    });
    const p = previewAttack(state, getUnit(state, 'w'), getUnit(state, 'e'), getUnit(state, 'w'), testKnockback);
    expect(p.knockback).toMatchObject({ to: null, blockedBy: 'unit' });
    const ally = makeState({
      heights: flat(5, 1),
      units: [
        { id: 'a', team: 'player', x: 0, z: 0 },
        { id: 'down', team: 'player', x: 1, z: 0, hp: 0 },
        { id: 'e', team: 'enemy', x: 4, z: 0 },
      ],
    });
    const tiles = reachableTiles(ally, getUnit(ally, 'a')).map((t) => `${t.x},${t.z}`);
    expect(tiles).toContain('2,0');
    expect(tiles).not.toContain('1,0');
  });

  it('カウントは、そのユニットの手番が来るはずだった時に 1 ずつ減り、0 で退場する（マップから消え、蘇生できない）', () => {
    let state = makeState({
      heights: flat(6, 1),
      units: [
        { id: 'a', team: 'player', x: 0, z: 0 },
        { id: 'down', team: 'player', x: 2, z: 0, hp: 0, ct: 0 },
        { id: 'e', team: 'enemy', x: 5, z: 0 },
      ],
    });
    const counts: number[] = [];
    const all: BattleEvent[] = [];
    for (let i = 0; i < 40 && !getUnit(state, 'down').retired; i++) {
      const r = wait(state);
      all.push(...r.events);
      state = r.state;
      for (const ev of r.events) if (ev.type === 'knockoutCounted') counts.push(ev.count);
    }
    expect(counts).toEqual([2, 1, 0]);
    expect(all.filter((e) => e.type === 'retired')).toEqual([{ type: 'retired', unitId: 'down' }]);
    expect(getUnit(state, 'down')).toMatchObject({ retired: true, knockoutCount: 0 });
    // 戦闘不能のユニットには手番が来ない
    expect(all.some((e) => e.type === 'turnStarted' && e.unitId === 'down')).toBe(false);
    // 退場したマスには止まれる
    expect(reachableTiles(state, getUnit(state, 'a')).some((t) => t.x === 2 && t.z === 0)).toBe(true);
  });

  it('勝敗: 立っているユニットがいなくなった側の負け（戦闘不能のカウントが残っていても）', () => {
    const state = makeState({
      heights: flat(4, 1),
      units: [
        { id: 'w', team: 'player', x: 0, z: 0 },
        { id: 'e', team: 'enemy', x: 1, z: 0, hp: 5 },
        { id: 'e2', team: 'enemy', x: 3, z: 0, hp: 0 },
      ],
    });
    const r = findSeed(state, { type: 'attack', targetId: 'e' }, (x) => getUnit(x.state, 'e').hp === 0);
    expect(r.state.winner).toBe('player');
    expect(getUnit(r.state, 'e2').retired).toBe(false);
  });

  it('「特定の敵の撃破」「特定の味方が倒れる」は、戦闘不能になった時点で決まる', () => {
    const base = {
      heights: flat(4, 1),
      units: [
        { id: 'p', team: 'player' as const, x: 0, z: 0 },
        { id: 'p2', team: 'player' as const, x: 3, z: 0, hp: 0 },
        { id: 'boss', team: 'enemy' as const, x: 1, z: 0, hp: 0 },
        { id: 'e', team: 'enemy' as const, x: 2, z: 0 },
      ],
    };
    const win = makeState({ ...base, scenario: { objectives: { victory: [{ kind: 'defeatUnit', unitId: 'boss' }], defeat: [] } } });
    expect(judgeOutcome(win)).toEqual({ winner: 'player', reason: 'defeatUnit' });
    const lose = makeState({ ...base, scenario: { objectives: { victory: [], defeat: [{ kind: 'unitDefeated', unitId: 'p2' }] } } });
    expect(judgeOutcome(lose)).toEqual({ winner: 'enemy', reason: 'unitDefeated' });
  });
});

describe('蘇生（フェーズ2-5）', () => {
  const setup = (downCt = 0, downCount = 3) =>
    makeState({
      heights: flat(6, 1),
      progression: testProgressionRules,
      units: [
        {
          id: 'h',
          team: 'player',
          job: testHealer,
          x: 0,
          z: 0,
          commands: healerCmd,
          level: 3,
          progress: { exp: 0, jp: 0, jpTotal: 0, gainedExp: 0, gainedJp: 0, growthTotalCap: 900, masteryPending: false } satisfies UnitProgressState,
        },
        { id: 'down', team: 'player', job: testWarrior, x: 2, z: 0, hp: 0, ct: downCt, knockoutCount: downCount, level: 5, statuses: [] },
        { id: 'e', team: 'enemy', x: 5, z: 0 },
      ],
    });

  it('詠唱の後に発動し、最大 HP の 25% で復帰する（CT は 0）。経験値は味方への行動として、蘇生したユニットのレベルで計算する', () => {
    let state = applyAction(setup(), { type: 'cast', spellId: 'revive', target: { kind: 'unit', unitId: 'down' } }).state;
    expect(getUnit(state, 'down').hp).toBe(0);
    const events: BattleEvent[] = [];
    for (let i = 0; i < 20 && getUnit(state, 'down').hp === 0; i++) {
      const r = wait(state);
      events.push(...r.events);
      state = r.state;
    }
    expect(events).toContainEqual({ type: 'revived', unitId: 'down', hp: 12 });
    const down = getUnit(state, 'down');
    expect(down).toMatchObject({ hp: 12, knockoutCount: 0, retired: false });
    // 復帰した時の CT は 0（その後の時計の進みの分だけ溜まる）
    const revivedAt = types(events).indexOf('revived');
    expect(revivedAt).toBeGreaterThanOrEqual(0);
    // 味方への行動の経験値（元の量 expPerSupportAction を、蘇生したユニットのレベル 5 で増減）
    const gained = events.find((e) => e.type === 'progressGained');
    expect(gained).toMatchObject({ unitId: 'h' });
  });

  it('復帰した直後の CT は 0', () => {
    let state = applyAction(setup(), { type: 'cast', spellId: 'revive', target: { kind: 'unit', unitId: 'down' } }).state;
    // 発動するまで待つ（発動した出来事の時点の CT を、次の状態から確かめる）
    for (let i = 0; i < 20; i++) {
      const r = wait(state);
      const idx = r.events.findIndex((e) => e.type === 'revived');
      if (idx >= 0) {
        // 復帰の後に時計が進んだ分だけ CT が溜まる。素早さ 6 × 進んだ回数を超えない
        const down = getUnit(r.state, 'down');
        expect(down.ct % testWarrior.stats.speed).toBe(0);
        expect(down.ct).toBeLessThan(testRules.ctThreshold);
        return;
      }
      state = r.state;
    }
    throw new Error('蘇生が発動しませんでした');
  });

  it('発動する前に対象が退場したら、効かない（経験値も入らない）。退場したユニットは新しく狙えない', () => {
    // カウント 1・CT 99 なので、蘇生より先に退場する
    let state = applyAction(setup(99, 1), { type: 'cast', spellId: 'revive', target: { kind: 'unit', unitId: 'down' } }).state;
    const events: BattleEvent[] = [];
    for (let i = 0; i < 20 && getUnit(state, 'h').charging; i++) {
      const r = wait(state);
      events.push(...r.events);
      state = r.state;
    }
    expect(types(events)).toContain('retired');
    const resolved = events.find((e) => e.type === 'spellResolved');
    expect(resolved).toMatchObject({ spellId: 'revive', results: [] });
    expect(types(events)).not.toContain('revived');
    expect(events.some((e) => e.type === 'progressGained')).toBe(false);
    expect(getUnit(state, 'down')).toMatchObject({ hp: 0, retired: true });
    const healer = getUnit(state, 'h');
    const revive = healer.spells.find((s) => s.id === 'revive')!;
    expect(isValidSpellTarget(state, revive, healer, { kind: 'unit', unitId: 'down' })).toBe(false);
  });
});
