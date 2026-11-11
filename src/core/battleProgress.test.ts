import { describe, expect, it } from 'vitest';
import { runAutoBattle } from './ai';
import { applyAction, getUnit, startBattle } from './battle';
import type { ActionResult, BattleEvent, BattleSetup, BattleState, ProgressionRules, UnitProgressState } from './battleTypes';
import {
  findSeed,
  flat,
  makeState,
  testAiConfigs,
  testHealer,
  testJobs,
  testMage,
  testRules,
  testSpells,
  testStrikes,
  testWarrior,
} from './testSupport';

/**
 * 戦闘中の経験値・JP・レベルアップ（フェーズ2-3）。
 * 経験値と JP は行動した時点でユニットに入り、貯まればその場でレベルが上がる。
 */
const rules: ProgressionRules = {
  maxLevel: 50,
  expBase: 100,
  expPerLevel: 10,
  expPerAction: 10,
  expPerSupportAction: 15,
  expVictory: 20,
  expLevelOffset: 10,
  expLevelPercentMax: 200,
  jpPerAction: 20,
  jpVictoryBonus: 50,
  jobLevelJp: [100, 250, 450, 700, 1000, 1350, 1750],
  growthCap: { maxHp: 5000, maxMp: 5000, attack: 1000, magic: 1000, speed: 500 },
  growthWeights: { maxHp: 1, maxMp: 1, attack: 4, magic: 4, speed: 20 },
  growthTotalCap: 900,
};

const fresh = (patch: Partial<UnitProgressState> = {}): UnitProgressState => ({
  exp: 0,
  jp: 0,
  jpTotal: 0,
  gainedExp: 0,
  gainedJp: 0,
  ...patch,
});

/** 成長率 HP 3.0、MP 2.0、攻撃力 1.0 の戦士（1レベルで HP +3、MP +2、攻撃力 +1） */
const grower = { ...testWarrior, growth: { maxHp: 300, maxMp: 200, attack: 100, magic: 0, speed: 0 } };

/** 戦士 w（味方）が隣の敵 e を攻撃する場面 */
const duel = (progress: UnitProgressState, extra: { wLevel?: number; eLevel?: number; ePassives?: string[] } = {}) =>
  makeState({
    heights: flat(3, 3),
    units: [
      { id: 'w', team: 'player', job: grower, x: 1, z: 1, level: extra.wLevel ?? 1, progress, facing: 'north' },
      { id: 'e', team: 'enemy', x: 1, z: 0, level: extra.eLevel ?? 1, facing: 'south', hp: 500, passives: extra.ePassives },
    ],
    progression: rules,
  });

const gained = (events: readonly BattleEvent[]) => events.filter((e) => e.type === 'progressGained');

describe('戦闘中の経験値と JP', () => {
  it('攻撃した時点で経験値と JP がユニットに入る（出来事にも出る）', () => {
    const r = findSeed(duel(fresh()), { type: 'attack', targetId: 'e' }, (x) =>
      x.events.some((e) => e.type === 'attacked' && e.hit),
    );
    expect(gained(r.events)).toEqual([{ type: 'progressGained', unitId: 'w', exp: 10, jp: 20 }]);
    expect(getUnit(r.state, 'w').progress).toEqual({ exp: 10, jp: 20, jpTotal: 20, gainedExp: 10, gainedJp: 20 });
  });

  it('攻撃が外れても、当たった時と同じ量が入る', () => {
    const hit = findSeed(duel(fresh()), { type: 'attack', targetId: 'e' }, (x) => x.events.some((e) => e.type === 'attacked' && e.hit));
    const miss = findSeed(duel(fresh()), { type: 'attack', targetId: 'e' }, (x) =>
      x.events.some((e) => e.type === 'attacked' && !e.hit),
    );
    expect(getUnit(miss.state, 'w').progress).toEqual(getUnit(hit.state, 'w').progress);
  });

  it('相手のレベルで増減する（Lv 1 が Lv 8 を攻撃すると 163%）', () => {
    const r = applyAction(duel(fresh(), { eLevel: 8 }), { type: 'attack', targetId: 'e' });
    expect(gained(r.events)[0]).toMatchObject({ exp: 16, jp: 20 });
  });

  it('経験値が貯まると、戦闘の途中でレベルが上がり、成長値と能力値が変わる。今の HP と MP は増えた分だけ増える（全回復はしない）', () => {
    const base = duel(fresh({ exp: 95 }));
    // HP を減らしておく（全回復しないことを確かめる）
    const state: BattleState = { ...base, units: base.units.map((u) => (u.id === 'w' ? { ...u, hp: 20, mp: 0 } : u)) };
    const r = applyAction(state, { type: 'attack', targetId: 'e' });
    const w = getUnit(r.state, 'w');
    expect(w.level).toBe(2);
    expect(w.progress!.exp).toBe(5);
    expect(w.growth).toEqual({ maxHp: 300, maxMp: 200, attack: 100, magic: 0, speed: 0 });
    expect(w.stats.maxHp).toBe(testWarrior.stats.maxHp + 3);
    expect(w.stats.attack).toBe(testWarrior.stats.attack + 1);
    expect(w.stats.maxMp).toBe(2);
    expect(w.hp).toBe(23);
    expect(w.mp).toBe(2);
    expect(r.events).toContainEqual({ type: 'leveledUp', unitId: 'w', from: 1, to: 2, stats: w.stats, hp: 23, mp: 2 });
    // 出来事の順番: 攻撃 → 経験値と JP → レベルアップ
    const types = r.events.map((e) => e.type);
    expect(types.indexOf('attacked')).toBeLessThan(types.indexOf('progressGained'));
    expect(types.indexOf('progressGained')).toBeLessThan(types.indexOf('leveledUp'));
  });

  it('上がったレベルの能力値は、すぐ次の計算に使われる（攻撃力が上がればダメージも上がる）', () => {
    const r = applyAction(duel(fresh({ exp: 99 })), { type: 'attack', targetId: 'e' });
    const after = getUnit(r.state, 'w');
    expect(after.stats.attack).toBe(getUnit(duel(fresh()), 'w').stats.attack + 1);
  });

  it('JP の累計がしきい値を超えると、ジョブのレベルが上がる', () => {
    const r = applyAction(duel(fresh({ jp: 85, jpTotal: 85 })), { type: 'attack', targetId: 'e' });
    expect(r.events).toContainEqual({ type: 'jobLeveledUp', unitId: 'w', jobId: 'warrior', from: 1, to: 2 });
    expect(getUnit(r.state, 'w').progress).toMatchObject({ jp: 105, jpTotal: 105 });
  });

  it('レベルの上限では経験値は貯まらない（JP は入る）', () => {
    const r = applyAction(duel(fresh(), { wLevel: 50 }), { type: 'attack', targetId: 'e' });
    const w = getUnit(r.state, 'w');
    expect(w.level).toBe(50);
    expect(w.progress).toMatchObject({ exp: 0, jp: 20 });
  });

  it('リアクション（反撃）では、反撃したユニットに経験値と JP は入らない', () => {
    const state = makeState({
      heights: flat(3, 3),
      units: [
        { id: 'e', team: 'enemy', x: 1, z: 0, facing: 'south', hp: 500 },
        { id: 'w', team: 'player', job: grower, x: 1, z: 1, progress: fresh(), passives: ['counter'], hp: 500 },
      ],
      progression: rules,
    });
    const r = findSeed(state, { type: 'attack', targetId: 'w' }, (x) =>
      x.events.some((e) => e.type === 'attacked' && e.counter),
    );
    expect(gained(r.events)).toEqual([]);
    expect(getUnit(r.state, 'w').progress).toEqual(fresh());
  });

  it('敵のユニットは、経験値も JP も得ない', () => {
    const state = makeState({
      heights: flat(3, 3),
      units: [
        { id: 'e', team: 'enemy', x: 1, z: 0, facing: 'south' },
        { id: 'w', team: 'player', job: grower, x: 1, z: 1, progress: fresh(), hp: 500 },
      ],
      progression: rules,
    });
    const r = applyAction(state, { type: 'attack', targetId: 'w' });
    expect(gained(r.events)).toEqual([]);
    expect(getUnit(r.state, 'e').progress).toBeNull();
    expect(getUnit(r.state, 'e').level).toBe(1);
  });
});

describe('詠唱のある魔法の経験値と JP', () => {
  /** 魔術師 m（味方）。敵 e1（Lv 3）と e2（Lv 6）が隣り合っている */
  const mageScene = (progress: UnitProgressState = fresh()) =>
    makeState({
      heights: flat(6, 6),
      units: [
        { id: 'm', team: 'player', job: testMage, x: 0, z: 2, progress },
        { id: 'e1', team: 'enemy', x: 3, z: 2, level: 3, hp: 200 },
        { id: 'e2', team: 'enemy', x: 3, z: 3, level: 6, hp: 200 },
        { id: 'far', team: 'enemy', x: 5, z: 5, level: 20 },
      ],
      progression: rules,
    });

  /** 詠唱者の魔法が発動（か中断・不発）するまで、手番を待機で回す */
  const untilDone = (state: BattleState, casterId: string): ActionResult => {
    let s = state;
    const events: BattleEvent[] = [];
    for (let i = 0; i < 20 && getUnit(s, casterId).charging && s.turn; i++) {
      const r = applyAction(s, { type: 'endTurn', facing: 'north' });
      events.push(...r.events);
      s = r.state;
    }
    return { state: s, events };
  };

  it('指定した時点では入らず、発動した時に入る', () => {
    const cast = applyAction(mageScene(), { type: 'cast', spellId: 'wind', target: { kind: 'unit', unitId: 'e1' } });
    expect(gained(cast.events)).toEqual([]);
    expect(getUnit(cast.state, 'm').progress).toEqual(fresh());
    const done = untilDone(cast.state, 'm');
    expect(done.events.some((e) => e.type === 'spellResolved')).toBe(true);
    // 相手は Lv 3: 10 ×（3 + 10）÷（1 + 10）= 118% → 11
    expect(gained(done.events)).toEqual([{ type: 'progressGained', unitId: 'm', exp: 11, jp: 20 }]);
  });

  it('範囲に複数の対象がいても1回分だけ。レベルによる増減は、対象の中で最もレベルの高いユニットで計算する', () => {
    const cast = applyAction(mageScene(), { type: 'cast', spellId: 'fire', target: { kind: 'tile', x: 3, z: 2 } });
    const done = untilDone(cast.state, 'm');
    const resolved = done.events.find((e) => e.type === 'spellResolved');
    expect(resolved && resolved.type === 'spellResolved' && resolved.results.map((r) => r.unitId).sort()).toEqual(['e1', 'e2']);
    // 最もレベルの高い e2（Lv 6）: 10 × 16 ÷ 11 = 145% → 14。範囲の外の Lv 20 は数えない
    expect(gained(done.events)).toEqual([{ type: 'progressGained', unitId: 'm', exp: 14, jp: 20 }]);
  });

  it('対象が1体もいない時は入らない', () => {
    const cast = applyAction(mageScene(), { type: 'cast', spellId: 'fire', target: { kind: 'tile', x: 1, z: 5 } });
    const done = untilDone(cast.state, 'm');
    expect(done.events.some((e) => e.type === 'spellResolved')).toBe(true);
    expect(gained(done.events)).toEqual([]);
  });

  it('詠唱が中断されたら入らない（自分の手番で動いた時）', () => {
    const base = mageScene();
    const charging: BattleState = {
      ...base,
      units: base.units.map((u) => (u.id === 'm' ? { ...u, charging: { spellId: 'fire', target: { kind: 'tile', x: 3, z: 2 }, progress: 0 } } : u)),
      turn: { ...base.turn!, chargingAtStart: true },
    };
    const moved = applyAction(charging, { type: 'move', x: 0, z: 3 });
    expect(moved.events.some((e) => e.type === 'castInterrupted')).toBe(true);
    const rest = untilDone(moved.state, 'm');
    expect(gained([...moved.events, ...rest.events])).toEqual([]);
  });

  it('詠唱者が倒れて不発になったら入らない', () => {
    const state = makeState({
      heights: flat(4, 4),
      units: [
        { id: 'e', team: 'enemy', x: 0, z: 1, facing: 'south' },
        { id: 'm', team: 'player', job: testMage, x: 0, z: 2, hp: 1, progress: fresh(), charging: { spellId: 'wind', target: { kind: 'tile', x: 3, z: 3 }, progress: 0 } },
        { id: 'p', team: 'player', x: 3, z: 0 },
      ],
      progression: rules,
    });
    const r = findSeed(state, { type: 'attack', targetId: 'm' }, (x) => x.events.some((e) => e.type === 'spellFizzled'));
    expect(gained(r.events)).toEqual([]);
    expect(getUnit(r.state, 'm').progress).toEqual(fresh());
  });

  it('味方に使う魔法（回復）は、元の量が expPerSupportAction', () => {
    const state = makeState({
      heights: flat(5, 5),
      units: [
        { id: 'h', team: 'player', job: testHealer, x: 0, z: 2, progress: fresh() },
        { id: 'p', team: 'player', x: 2, z: 2, level: 1, hp: 10 },
        { id: 'e', team: 'enemy', x: 4, z: 4 },
      ],
      progression: rules,
    });
    const cast = applyAction(state, { type: 'cast', spellId: 'heal', target: { kind: 'unit', unitId: 'p' } });
    const done = untilDone(cast.state, 'h');
    expect(gained(done.events)).toEqual([{ type: 'progressGained', unitId: 'h', exp: 15, jp: 20 }]);
  });
});

describe('同じシード値なら同じ結果', () => {
  it('戦闘中の経験値とレベルアップを含めて、同じシード値・同じ行動なら同じ結果になる', () => {
    const setup: BattleSetup = {
      id: 't',
      map: { id: 'm', heights: flat(6, 6), terrain: flat(6, 6).map((r) => 'g'.repeat(r.length)), legend: { g: 'grass' } },
      units: [
        { id: 'p1', team: 'player', jobId: 'warrior', x: 1, z: 5, facing: 'north', progress: { exp: 50, jp: 0, jpTotal: 0 } },
        { id: 'p2', team: 'player', jobId: 'mage', x: 3, z: 5, facing: 'north', progress: { exp: 90, jp: 80, jpTotal: 80 } },
        { id: 'e1', team: 'enemy', jobId: 'warrior', x: 1, z: 0, facing: 'south', level: 3 },
        { id: 'e2', team: 'enemy', jobId: 'archer', x: 4, z: 0, facing: 'south', level: 3 },
      ],
      progression: rules,
    };
    const run = (seed: number) =>
      runAutoBattle(startBattle(setup, testJobs, testRules, seed, testSpells, testStrikes).state, 400, testAiConfigs);
    const a = run(77);
    const b = run(77);
    expect(JSON.stringify(a.state)).toBe(JSON.stringify(b.state));
    expect(a.events).toEqual(b.events);
    // 実際に経験値が入り、JSON にそのまま変換できる
    expect(a.events.some((e) => e.type === 'progressGained')).toBe(true);
    expect(JSON.parse(JSON.stringify(a.state))).toEqual(a.state);
  });
});
