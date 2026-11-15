import { describe, expect, it } from 'vitest';
import { decideNextAction } from './ai';
import { applyAction, getUnit, startBattle } from './battle';
import type { BattleEvent, EquipmentDefinition, JobDefinition } from './battleTypes';
import { previewAttack } from './combat';
import { previewSpellAt } from './magic';
import { findSeed, flat, makeState, testAi, testRules, testWarrior } from './testSupport';

/** 騎士・格闘家・盗賊（フェーズ2-6）の行動と受動的なアビリティ */
const monk: JobDefinition = { ...testWarrior, id: 'monk', weaponTypes: [], stats: { ...testWarrior.stats, maxMp: 10 } };
const sword: EquipmentDefinition = { id: 'sword-x', slot: 'weapon', weaponType: 'sword', tier: 1, price: 100, stats: { attack: 5 } };
const crown: EquipmentDefinition = { id: 'crown-x', slot: 'accessory', tier: 0, price: 100, stats: { maxHp: 10 } };
const hit = (r: { events: readonly BattleEvent[] }) => r.events.some((e) => e.type === 'attacked' && e.hit);

describe('騎士', () => {
  it('武器破壊: 通常攻撃の 60% のダメージで、当たると攻撃力低下が付き、相手の攻撃力が下がる（予測と同じ）', () => {
    const state = makeState({
      heights: flat(3, 1),
      units: [
        { id: 'k', team: 'player', x: 0, z: 0, commands: [{ jobId: 'warrior', abilityIds: ['breakWeapon'] }] },
        { id: 'e', team: 'enemy', x: 1, z: 0, facing: 'west' },
      ],
    });
    const k = getUnit(state, 'k');
    const p = previewAttack(state, k, getUnit(state, 'e'), k, k.strikes[0]);
    expect(p).toMatchObject({ damage: 12, inflicts: 'attackDown' });
    const r = findSeed(state, { type: 'attack', targetId: 'e', abilityId: 'breakWeapon' }, hit);
    expect(getUnit(r.state, 'e')).toMatchObject({ hp: 38, stats: expect.objectContaining({ attack: 15 }) });
  });

  it('かばう: 隣の味方の HP が半分以下なら、その味方への武器による攻撃を代わりに受ける（予測にも出る）', () => {
    const state = makeState({
      heights: flat(4, 2),
      units: [
        { id: 'e', team: 'enemy', x: 0, z: 0, facing: 'east' },
        { id: 'weak', team: 'player', x: 1, z: 0, hp: 20, facing: 'west' },
        { id: 'k', team: 'player', x: 1, z: 1, passives: ['cover'], facing: 'north' },
      ],
    });
    const e = getUnit(state, 'e');
    const p = previewAttack(state, e, getUnit(state, 'weak'));
    expect(p.coveredBy).toBe('k');
    const r = findSeed(state, { type: 'attack', targetId: 'weak' }, hit);
    expect(getUnit(r.state, 'weak').hp).toBe(20);
    expect(getUnit(r.state, 'k').hp).toBe(50 - p.damage);
    expect(r.events).toContainEqual({ type: 'reaction', unitId: 'k', abilityId: 'cover' });
    // HP が半分より多ければ、かばわない
    const healthy = { ...state, units: state.units.map((u) => (u.id === 'weak' ? { ...u, hp: 26 } : u)) };
    expect(previewAttack(healthy, e, getUnit(healthy, 'weak')).coveredBy).toBeUndefined();
  });

  it('背水: 背面からのダメージの補正（125%）を受けない（命中率は背面のまま）', () => {
    const units = (passives: string[]) => [
      { id: 'w', team: 'player' as const, x: 0, z: 0 },
      { id: 'e', team: 'enemy' as const, x: 1, z: 0, facing: 'east' as const, passives },
    ];
    const plain = makeState({ heights: flat(3, 1), units: units([]) });
    const guarded = makeState({ heights: flat(3, 1), units: units(['backGuard']) });
    const p0 = previewAttack(plain, getUnit(plain, 'w'), getUnit(plain, 'e'));
    const p1 = previewAttack(guarded, getUnit(guarded, 'w'), getUnit(guarded, 'e'));
    expect([p0.side, p0.damage, p0.hitPercent]).toEqual(['back', 25, 100]);
    expect([p1.side, p1.damage, p1.hitPercent]).toEqual(['back', 20, 100]);
  });
});

describe('格闘家', () => {
  it('連撃: 素手で2回、1回ごとに命中を判定する。武器を持っていると使えない', () => {
    const state = makeState({
      heights: flat(3, 1),
      units: [
        { id: 'm', team: 'player', job: monk, x: 0, z: 0, commands: [{ jobId: 'monk', abilityIds: ['doubleStrike'] }] },
        { id: 'e', team: 'enemy', x: 1, z: 0, facing: 'west' },
      ],
    });
    const m = getUnit(state, 'm');
    const p = previewAttack(state, m, getUnit(state, 'e'), m, m.strikes[0]);
    expect([p.hits, p.damage]).toEqual([2, 12]);
    const both = findSeed(state, { type: 'attack', targetId: 'e', abilityId: 'doubleStrike' }, (x) => x.events.filter((e) => e.type === 'attacked' && e.hit).length === 2);
    expect(both.events.filter((e) => e.type === 'attacked')).toHaveLength(2);
    expect(getUnit(both.state, 'e').hp).toBe(26);
    const one = findSeed(state, { type: 'attack', targetId: 'e', abilityId: 'doubleStrike' }, (x) => x.events.filter((e) => e.type === 'attacked' && e.hit).length === 1);
    expect(getUnit(one.state, 'e').hp).toBe(38);
    const armed = { ...state, units: state.units.map((u) => (u.id === 'm' ? { ...u, weapon: 'sword' as const } : u)) };
    expect(() => applyAction(armed, { type: 'attack', targetId: 'e', abilityId: 'doubleStrike' })).toThrow();
  });

  it('気功は自分か隣の味方を回復し、喝は状態変化をすべて解く（詠唱なし）', () => {
    const state = makeState({
      heights: flat(4, 1),
      units: [
        { id: 'm', team: 'player', job: monk, x: 0, z: 0, hp: 30, commands: [{ jobId: 'monk', abilityIds: ['chakra', 'shout'] }] },
        { id: 'a', team: 'player', x: 1, z: 0, hp: 40, statuses: [{ id: 'blind', turns: 2 }, { id: 'attackDown', turns: 2 }] },
        { id: 'e', team: 'enemy', x: 3, z: 0 },
      ],
    });
    const self = applyAction(state, { type: 'cast', spellId: 'chakra', target: { kind: 'unit', unitId: 'm' } });
    expect(getUnit(self.state, 'm').hp).toBe(50);
    const cleansed = applyAction(state, { type: 'cast', spellId: 'shout', target: { kind: 'unit', unitId: 'a' } });
    expect(getUnit(cleansed.state, 'a').statuses).toEqual([]);
    expect(cleansed.events).toContainEqual({ type: 'statusCleared', unitId: 'a', statuses: ['blind', 'attackDown'] });
    // AI: 不利な状態変化が2つ付いた隣の味方に喝を使う
    expect(decideNextAction({ ...state, turn: { ...state.turn!, moved: true } }, testAi)).toEqual({
      type: 'cast',
      spellId: 'shout',
      target: { kind: 'unit', unitId: 'a' },
    });
  });

  it('地走り: 正面の直線 3 マスの敵だけにダメージ。高さの差が 1 を超えるマスで止まる', () => {
    const state = makeState({
      heights: [[0, 0, 1, 1, 3, 3]],
      units: [
        { id: 'm', team: 'player', job: monk, x: 0, z: 0, commands: [{ jobId: 'monk', abilityIds: ['earthWave'] }] },
        { id: 'e1', team: 'enemy', x: 1, z: 0 },
        { id: 'a', team: 'player', x: 2, z: 0 },
        { id: 'e2', team: 'enemy', x: 3, z: 0 },
        { id: 'e3', team: 'enemy', x: 4, z: 0 },
      ],
    });
    const m = getUnit(state, 'm');
    const p = previewSpellAt(state, m, m.spells[0]!, { x: 1, z: 0 });
    expect(p.tiles).toEqual([{ x: 1, z: 0 }, { x: 2, z: 0 }, { x: 3, z: 0 }]);
    expect(p.results.map((r) => [r.unitId, r.amount])).toEqual([['e1', 16], ['e2', 16]]);
    const r = applyAction(state, { type: 'cast', spellId: 'earthWave', target: { kind: 'tile', x: 1, z: 0 } });
    expect(['e1', 'a', 'e2', 'e3'].map((id) => getUnit(r.state, id).hp)).toEqual([34, 50, 34, 50]);
  });

  it('見切り: 正面からの武器による攻撃の命中率 -20（側面・背面は変わらない）', () => {
    const state = makeState({
      heights: flat(3, 3),
      units: [
        { id: 'w', team: 'player', x: 0, z: 1 },
        { id: 'm', team: 'enemy', x: 1, z: 1, facing: 'west', passives: ['parry'] },
        { id: 'w2', team: 'player', x: 1, z: 0 },
      ],
    });
    expect(previewAttack(state, getUnit(state, 'w'), getUnit(state, 'm'))).toMatchObject({ hitPercent: 65, parryPenalty: 20 });
    expect(previewAttack(state, getUnit(state, 'w2'), getUnit(state, 'm')).hitPercent).toBe(95);
  });

  it('素手の補正と鍛えた拳は、武器の枠が空の時だけ攻撃力に足す', () => {
    const fistMonk: JobDefinition = { ...monk, unarmedBonus: { attack: 6 } };
    const setup = (equipment: EquipmentDefinition[]) => ({
      id: 't',
      map: { id: 'm', heights: flat(3, 1), terrain: ['ggg'], legend: { g: 'grass' as const } },
      units: [
        { id: 'm', team: 'player' as const, jobId: 'monk', x: 0, z: 0, facing: 'east' as const, equipment, passives: ['ironFist'] },
        { id: 'e', team: 'enemy' as const, jobId: 'warrior', x: 2, z: 0, facing: 'west' as const },
      ],
    });
    const passives = [{ id: 'ironFist', slot: 'support' as const, effect: { kind: 'unarmedAttackBonus' as const, amount: 3 } }];
    const bare = startBattle(setup([]), [fistMonk, testWarrior], testRules, 1, [], [], passives).state;
    const armed = startBattle(setup([sword]), [fistMonk, testWarrior], testRules, 1, [], [], passives).state;
    expect(getUnit(bare, 'm').stats.attack).toBe(29);
    expect(getUnit(armed, 'm').stats.attack).toBe(25);
  });
});

describe('盗賊', () => {
  const scene = (facing: 'west' | 'east' | 'north', equipment: EquipmentDefinition[] = [sword]) =>
    makeState({
      heights: flat(3, 3),
      units: [
        { id: 't', team: 'player', x: 0, z: 1, commands: [{ jobId: 'warrior', abilityIds: ['stealGold', 'stealGear', 'backstab'] }] },
        { id: 'e', team: 'enemy', x: 1, z: 1, facing, level: 3, equipment },
      ],
    });

  it('盗みの成功率は、背面が最も高く、正面が最も低い（予測に出る）。ダメージは与えない', () => {
    const pct = (facing: 'west' | 'east' | 'north') => {
      const s = scene(facing);
      const t = getUnit(s, 't');
      return previewAttack(s, t, getUnit(s, 'e'), t, t.strikes.find((x) => x.id === 'stealGold')).hitPercent;
    };
    expect([pct('east'), pct('north'), pct('west')]).toEqual([80, 55, 30]);
  });

  it('ゴールドを盗むと、戦闘の後に入るゴールドが記録される（20 + 10 × 相手のレベル）', () => {
    const r = findSeed(scene('east'), { type: 'attack', targetId: 'e', abilityId: 'stealGold' }, (x) => x.events.some((e) => e.type === 'stole' && e.success));
    expect(r.state.stolen).toEqual({ gold: 50, items: [] });
    expect(getUnit(r.state, 'e').hp).toBe(50);
  });

  it('装備を盗むと、相手はその装備を失って能力値が下がり（武器なら素手になる）、盗んだ物が記録される。ボスの専用の装備は盗めない', () => {
    const s = scene('east');
    const withBonus = { ...s, units: s.units.map((u) => (u.id === 'e' ? { ...u, statBonus: { attack: 5 }, stats: { ...u.stats, attack: 25 } } : u)) };
    const r = findSeed(withBonus, { type: 'attack', targetId: 'e', abilityId: 'stealGear' }, (x) => x.events.some((e) => e.type === 'stole' && e.success));
    const e = getUnit(r.state, 'e');
    expect(r.state.stolen).toEqual({ gold: 0, items: ['sword-x'] });
    expect(e).toMatchObject({ weapon: null, equipment: [], stats: expect.objectContaining({ attack: 20 }) });
    // ボスの専用の装備（段階 0）しかなければ、成功率 0
    const boss = scene('east', [crown]);
    const t = getUnit(boss, 't');
    expect(previewAttack(boss, t, getUnit(boss, 'e'), t, t.strikes.find((x) => x.id === 'stealGear')).hitPercent).toBe(0);
  });

  it('不意打ち: 背面から攻撃した時だけ 2 倍', () => {
    const back = scene('east');
    const front = scene('west');
    const dmg = (s: typeof back) => {
      const t = getUnit(s, 't');
      return previewAttack(s, t, getUnit(s, 'e'), t, t.strikes.find((x) => x.id === 'backstab')).damage;
    };
    expect([dmg(back), dmg(front)]).toEqual([50, 20]);
  });

  it('逃げ足: 武器による攻撃を受けて生き残ったら、攻撃した相手から1マス離れる。離れられなければ発動しない', () => {
    const state = makeState({
      heights: flat(4, 1),
      units: [
        { id: 'w', team: 'player', x: 0, z: 0 },
        { id: 'e', team: 'enemy', x: 1, z: 0, passives: ['flee'] },
      ],
    });
    const r = findSeed(state, { type: 'attack', targetId: 'e' }, hit);
    expect(getUnit(r.state, 'e')).toMatchObject({ x: 2, z: 0 });
    expect(r.events).toContainEqual({ type: 'fled', unitId: 'e', from: { x: 1, z: 0 }, to: { x: 2, z: 0 } });
    const blocked = makeState({
      heights: flat(3, 1),
      units: [
        { id: 'w', team: 'player', x: 0, z: 0 },
        { id: 'e', team: 'enemy', x: 1, z: 0, passives: ['flee'] },
        { id: 'x', team: 'enemy', x: 2, z: 0 },
      ],
    });
    const r2 = findSeed(blocked, { type: 'attack', targetId: 'e' }, hit);
    expect(getUnit(r2.state, 'e')).toMatchObject({ x: 1, z: 0 });
    expect(r2.events.some((e) => e.type === 'fled')).toBe(false);
  });
});

describe('反撃の倍率（フェーズ2-6 のバランス調整）', () => {
  it('反撃の倍率を指定すると、反撃のダメージはその割合になる（予測と実際が同じ）', () => {
    const state = makeState({
      heights: flat(3, 1),
      units: [
        { id: 'w', team: 'player', x: 0, z: 0, facing: 'east' },
        { id: 'e', team: 'enemy', x: 1, z: 0, facing: 'west' },
      ],
    });
    const withCounter = {
      ...state,
      units: state.units.map((u) => (u.id === 'e' ? { ...u, passives: [{ id: 'counter', slot: 'reaction' as const, effect: { kind: 'counter' as const, damagePercent: 75 } }] } : u)),
    };
    const p = previewAttack(withCounter, getUnit(withCounter, 'w'), getUnit(withCounter, 'e'));
    expect(p.counter?.damage).toBe(15);
    const r = findSeed(withCounter, { type: 'attack', targetId: 'e' }, (x) => x.events.filter((e) => e.type === 'attacked' && e.hit).length === 2);
    expect(getUnit(r.state, 'w').hp).toBe(35);
  });
});
