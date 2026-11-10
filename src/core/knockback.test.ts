import { describe, expect, it } from 'vitest';
import { chooseKnockback, chooseProtectSpell, chooseSealSpell, decideNextAction } from './ai';
import { applyAction, getUnit } from './battle';
import type { BattleEvent, BattleState } from './battleTypes';
import { previewAttack } from './combat';
import { previewSpellAt } from './magic';
import {
  findSeed,
  flat,
  makeState,
  testAi,
  testArcher,
  testHealer,
  testMage,
  testSlowArrow,
  testSpells,
  type TestUnit,
} from './testSupport';

const knockbackCommand = [{ jobId: 'warrior', abilityIds: ['knockback'] }];
const attacked = (events: readonly BattleEvent[]) => events.filter((e) => e.type === 'attacked');

/** w が北隣の e を突き飛ばす場面。e は北を向いている（w は背面から攻撃する。命中率 100%） */
const pushScene = (heights: number[][], extra: TestUnit[] = [], target: Partial<TestUnit> = {}) =>
  makeState({
    heights,
    units: [
      { id: 'w', team: 'player', x: 1, z: 2, commands: knockbackCommand },
      { id: 'e', team: 'enemy', x: 1, z: 1, facing: 'north', ...target },
      ...extra,
    ],
  });

describe('突き飛ばし', () => {
  it('隣接する相手に小さなダメージ（通常攻撃の半分）を与え、1マス押し出す。向きは変わらない', () => {
    const state = pushScene(flat(3, 4));
    const r = applyAction(state, { type: 'attack', targetId: 'e', abilityId: 'knockback' });
    // 背面 25 → 半分 12
    expect(attacked(r.events)[0]).toMatchObject({ abilityId: 'knockback', hit: true, damage: 12 });
    expect(r.events).toContainEqual({ type: 'knockedBack', unitId: 'e', from: { x: 1, z: 1 }, to: { x: 1, z: 0 }, damage: 0, hp: 38 });
    const e = getUnit(r.state, 'e');
    expect([e.x, e.z, e.hp, e.facing]).toEqual([1, 0, 38, 'north']);
  });

  it('押し出した先が低い時は、高さの差に応じた落下ダメージ（高さの差 1 につき最大 HP の 10%）', () => {
    // e は高さ 2、押し出す先は高さ 0
    const state = pushScene([
      [0, 0, 0],
      [2, 2, 2],
      [0, 0, 0],
    ]);
    const r = applyAction(state, { type: 'attack', targetId: 'e', abilityId: 'knockback' });
    // 攻撃側が 2 低いので -10%: 背面 floor(20 × 1.25 × 0.9) = 22 → 半分 11。落下 50 × 20% = 10
    expect(attacked(r.events)[0]!.damage).toBe(11);
    expect(r.events).toContainEqual({ type: 'knockedBack', unitId: 'e', from: { x: 1, z: 1 }, to: { x: 1, z: 0 }, damage: 10, hp: 29 });
  });

  it('押し出せない時（マップの外・ほかのユニット・登れない段差）は、動かさずに追加の小さなダメージ（最大 HP の 10%）', () => {
    const cases: { name: string; state: BattleState }[] = [
      {
        name: 'マップの外',
        state: makeState({
          heights: flat(3, 3),
          units: [
            { id: 'w', team: 'player', x: 1, z: 1, commands: knockbackCommand },
            { id: 'e', team: 'enemy', x: 1, z: 0, facing: 'north' },
          ],
        }),
      },
      { name: 'ほかのユニット', state: pushScene(flat(3, 4), [{ id: 'x', team: 'enemy', x: 1, z: 0 }]) },
      {
        name: '登れない段差（ジャンプ力 2 で高さの差 3）',
        state: pushScene([
          [3, 3, 3],
          [0, 0, 0],
          [0, 0, 0],
        ]),
      },
    ];
    for (const { name, state } of cases) {
      const before = getUnit(state, 'e');
      const r = applyAction(state, { type: 'attack', targetId: 'e', abilityId: 'knockback' });
      const kb = r.events.find((e) => e.type === 'knockedBack');
      expect(kb, name).toMatchObject({ to: null, damage: 5, hp: 50 - 12 - 5 });
      const e = getUnit(r.state, 'e');
      expect([e.x, e.z], name).toEqual([before.x, before.z]);
    }
  });

  it('登れる段差（高さの差がジャンプ力以下）なら、押し上げる（落下ダメージはない）', () => {
    const state = pushScene([
      [2, 2, 2],
      [0, 0, 0],
      [0, 0, 0],
    ]);
    const r = applyAction(state, { type: 'attack', targetId: 'e', abilityId: 'knockback' });
    expect(r.events.find((e) => e.type === 'knockedBack')).toMatchObject({ to: { x: 1, z: 0 }, damage: 0 });
  });

  it('相手が詠唱中なら、詠唱を中断させる（当たったダメージには詠唱中の倍率が掛かる）', () => {
    const state = pushScene(flat(3, 4), [], {
      job: testMage,
      charging: { spellId: 'fire', target: { kind: 'tile', x: 1, z: 3 }, progress: 50 },
    });
    const r = applyAction(state, { type: 'attack', targetId: 'e', abilityId: 'knockback' });
    // 攻撃力 20 背面 25 → 半分 12 → 詠唱中 ×1.25 で 15
    expect(attacked(r.events)[0]!.damage).toBe(15);
    expect(r.events).toContainEqual({ type: 'castInterrupted', casterId: 'e', spellId: 'fire', reason: 'knockedBack' });
    expect(getUnit(r.state, 'e').charging).toBeNull();
  });

  it('外れたら、押し出しも詠唱の中断も起きない', () => {
    const state = makeState({
      heights: flat(3, 4),
      units: [
        { id: 'w', team: 'player', x: 1, z: 2, commands: knockbackCommand },
        { id: 'e', team: 'enemy', job: testMage, x: 1, z: 1, facing: 'south', charging: { spellId: 'fire', target: { kind: 'tile', x: 1, z: 3 }, progress: 50 } },
      ],
    });
    const miss = findSeed(state, { type: 'attack', targetId: 'e', abilityId: 'knockback' }, (r) => !attacked(r.events)[0]!.hit);
    expect(miss.events.some((e) => e.type === 'knockedBack' || e.type === 'castInterrupted')).toBe(false);
    expect(getUnit(miss.state, 'e').charging).not.toBeNull();
  });
});

describe('足止めの矢', () => {
  it('小さなダメージ（通常攻撃の 60%）を与え、鈍足を付ける。命中率は通常攻撃と同じ', () => {
    const state = makeState({
      heights: flat(1, 5),
      units: [
        { id: 'a', team: 'player', job: testArcher, x: 0, z: 4, commands: [{ jobId: 'archer', abilityIds: ['slowArrow'] }] },
        { id: 'e', team: 'enemy', x: 0, z: 0, facing: 'south' },
      ],
    });
    const a = getUnit(state, 'a');
    const e = getUnit(state, 'e');
    expect(previewAttack(state, a, e, a, testSlowArrow).hitPercent).toBe(previewAttack(state, a, e).hitPercent);
    const hit = findSeed(state, { type: 'attack', targetId: 'e', abilityId: 'slowArrow' }, (r) => attacked(r.events)[0]!.hit);
    expect(attacked(hit.events)[0]!.damage).toBe(6);
    expect(hit.events).toContainEqual({ type: 'statusAdded', unitId: 'e', status: 'slow', turns: 2 });
  });
});

describe('反撃', () => {
  const duel = (attacker: Partial<TestUnit> = {}, target: Partial<TestUnit> = {}) =>
    makeState({
      heights: flat(3, 3),
      units: [
        { id: 'w', team: 'player', x: 1, z: 2, ...attacker },
        { id: 'e', team: 'enemy', x: 1, z: 1, facing: 'north', passives: ['counter'], ...target },
      ],
    });

  it('隣接するマスから近接攻撃を受けて生き残った時、通常攻撃で反撃する。名前を出す', () => {
    const state = duel();
    const r = findSeed(state, { type: 'attack', targetId: 'e' }, (x) => attacked(x.events).every((a) => a.hit));
    const list = attacked(r.events);
    expect(list).toHaveLength(2);
    expect(list[1]).toMatchObject({ attackerId: 'e', targetId: 'w', counter: true, abilityId: null });
    expect(r.events).toContainEqual({ type: 'reaction', unitId: 'e', abilityId: 'counter' });
    // 反撃は、攻撃してきた相手の正面から（攻撃側は相手の方へ向き直っているため）
    expect(list[1]).toMatchObject({ side: 'front', damage: 20 });
    expect(getUnit(r.state, 'w').hp).toBe(30);
  });

  it('反撃に対する反撃は起きない', () => {
    const state = duel({ passives: ['counter'] });
    const r = findSeed(state, { type: 'attack', targetId: 'e' }, (x) => attacked(x.events).every((a) => a.hit));
    expect(attacked(r.events)).toHaveLength(2);
    expect(r.events.filter((e) => e.type === 'reaction')).toHaveLength(1);
  });

  it('外れた攻撃・離れたマスからの攻撃・倒された時は、反撃しない', () => {
    const state = duel({}, { facing: 'south' });
    const miss = findSeed(state, { type: 'attack', targetId: 'e' }, (x) => !attacked(x.events)[0]!.hit);
    expect(attacked(miss.events)).toHaveLength(1);
    const ranged = makeState({
      heights: flat(1, 5),
      units: [
        { id: 'a', team: 'player', job: testArcher, x: 0, z: 4 },
        { id: 'e', team: 'enemy', x: 0, z: 0, facing: 'north', passives: ['counter'] },
      ],
    });
    const shot = findSeed(ranged, { type: 'attack', targetId: 'e' }, (x) => attacked(x.events)[0]!.hit);
    expect(attacked(shot.events)).toHaveLength(1);
    const killed = applyAction(duel({}, { hp: 10 }), { type: 'attack', targetId: 'e' });
    expect(attacked(killed.events)).toHaveLength(1);
  });

  it('押し出されて隣にいなくなった時は反撃しない。押し出せずに隣に残れば反撃する', () => {
    const pushed = applyAction(duel({ commands: knockbackCommand }), { type: 'attack', targetId: 'e', abilityId: 'knockback' });
    expect(attacked(pushed.events)).toHaveLength(1);
    const blocked = makeState({
      heights: flat(3, 3),
      units: [
        { id: 'w', team: 'player', x: 1, z: 1, commands: knockbackCommand },
        { id: 'e', team: 'enemy', x: 1, z: 0, facing: 'north', passives: ['counter'] },
      ],
    });
    const r = findSeed(blocked, { type: 'attack', targetId: 'e', abilityId: 'knockback' }, (x) => attacked(x.events).every((a) => a.hit));
    expect(attacked(r.events)).toHaveLength(2);
  });

  it('反撃で手番のユニットが倒れたら、その手番はそこで終わり、次の手番が始まる', () => {
    const state = duel({ hp: 10 });
    const r = findSeed(state, { type: 'attack', targetId: 'e' }, (x) => attacked(x.events).every((a) => a.hit));
    expect(r.events).toContainEqual({ type: 'defeated', unitId: 'w' });
    // 味方が全滅したので決着
    expect(r.state.winner).toBe('enemy');
    const withAlly = makeState({
      heights: flat(4, 3),
      units: [
        { id: 'w', team: 'player', x: 1, z: 2, hp: 10 },
        { id: 'e', team: 'enemy', x: 1, z: 1, facing: 'north', passives: ['counter'] },
        { id: 'p2', team: 'player', x: 3, z: 2 },
      ],
    });
    const r2 = findSeed(withAlly, { type: 'attack', targetId: 'e' }, (x) => attacked(x.events).every((a) => a.hit));
    expect(r2.state.winner).toBeNull();
    expect(r2.state.turn!.unitId).not.toBe('w');
    expect(r2.events[r2.events.length - 1]!.type).toBe('turnStarted');
  });
});

describe('予測表示の数値が、実際の結果と一致する（命中の当たり外れを除く）', () => {
  const scenes: { name: string; state: BattleState; abilityId?: string }[] = [
    { name: '反撃（守りと身かわしと集中つき）', state: makeState({
      heights: [[0, 0, 0], [1, 1, 1], [0, 0, 0]],
      units: [
        { id: 'w', team: 'player', x: 1, z: 2, passives: ['focus', 'evade'], statuses: [{ id: 'protect', turns: 2 }] },
        { id: 'e', team: 'enemy', x: 1, z: 1, facing: 'east', passives: ['counter', 'evade'], statuses: [{ id: 'protect', turns: 1 }] },
      ],
    }) },
    { name: '突き飛ばし（落下）', abilityId: 'knockback', state: pushScene([[0, 0, 0], [3, 2, 3], [1, 1, 1]], [], { statuses: [{ id: 'protect', turns: 2 }] }) },
    { name: '突き飛ばし（押し出せない・反撃あり）', abilityId: 'knockback', state: makeState({
      heights: flat(3, 3),
      units: [
        { id: 'w', team: 'player', x: 1, z: 1, commands: knockbackCommand },
        { id: 'e', team: 'enemy', x: 1, z: 0, facing: 'west', passives: ['counter'] },
      ],
    }) },
  ];
  for (const { name, state, abilityId } of scenes) {
    it(name, () => {
      const w = getUnit(state, 'w');
      const e = getUnit(state, 'e');
      const strike = abilityId ? w.strikes.find((s) => s.id === abilityId) : undefined;
      const p = previewAttack(state, w, e, w, strike);
      const action = abilityId ? { type: 'attack' as const, targetId: 'e', abilityId } : { type: 'attack' as const, targetId: 'e' };
      const r = findSeed(state, action, (x) => attacked(x.events).every((a) => a.hit));
      const [main, counter] = attacked(r.events);
      expect(main).toMatchObject({ hitPercent: p.hitPercent, damage: p.damage, side: p.side });
      if (p.knockback) {
        const kb = r.events.find((x) => x.type === 'knockedBack')!;
        expect(kb).toMatchObject({ to: p.knockback.to, damage: p.knockback.damage });
      }
      if (p.counter) {
        expect(counter).toMatchObject({ hitPercent: p.counter.hitPercent, damage: p.counter.damage, counter: true });
      } else {
        expect(counter).toBeUndefined();
      }
    });
  }

  it('魔法の予測（守り・魔力の殻・詠唱中）も、実際に発動した結果と一致する', () => {
    const state = makeState({
      heights: flat(5, 3),
      units: [
        { id: 'm', team: 'player', job: testMage, x: 0, z: 1 },
        { id: 'e1', team: 'enemy', x: 3, z: 1, passives: ['magicShell'], statuses: [{ id: 'protect', turns: 3 }] },
        { id: 'e2', team: 'enemy', job: testMage, x: 3, z: 0, charging: { spellId: 'wind', target: { kind: 'tile', x: 0, z: 0 }, progress: 0 } },
      ],
    });
    const fire = testSpells.find((s) => s.id === 'fire')!;
    const predicted = previewSpellAt(state, getUnit(state, 'm'), fire, { x: 3, z: 1 }, { ...getUnit(state, 'm'), charging: null });
    expect(predicted.results.find((r) => r.unitId === 'e1')!.amount).toBe(Math.floor(Math.floor(20 * 0.75) * 0.8));
    let s = applyAction(state, { type: 'cast', spellId: 'fire', target: { kind: 'tile', x: 3, z: 1 } }).state;
    let resolved: Extract<BattleEvent, { type: 'spellResolved' }> | undefined;
    for (let i = 0; i < 20 && !resolved; i++) {
      const r = applyAction(s, { type: 'endTurn', facing: 'east' });
      resolved = r.events.find((x): x is Extract<BattleEvent, { type: 'spellResolved' }> => x.type === 'spellResolved' && x.casterId === 'm');
      s = r.state;
    }
    // 詠唱中の e2 の風は先に発動するので、炎の発動時には詠唱中ではない（その分だけ予測と変わる）
    expect(resolved!.results.find((r) => r.unitId === 'e1')).toEqual(predicted.results.find((r) => r.unitId === 'e1'));
  });
});

describe('敵 AI が新しい行動アビリティを使う', () => {
  it('突き飛ばしは、落下ダメージが見込める時に優先する', () => {
    const state = makeState({
      heights: [
        [0, 0, 0, 0],
        [2, 2, 2, 2],
        [2, 2, 2, 2],
        [2, 2, 2, 2],
      ],
      units: [
        { id: 'w', team: 'enemy', x: 1, z: 2, commands: knockbackCommand },
        { id: 'p', team: 'player', x: 1, z: 1, facing: 'north' },
      ],
    });
    expect(chooseKnockback(state, getUnit(state, 'w'), false)).toMatchObject({ targetId: 'p', abilityId: 'knockback' });
    expect(decideNextAction(state, testAi)).toEqual({ type: 'attack', targetId: 'p', abilityId: 'knockback' });
    // 平らで落下ダメージがなく、詠唱中でもなければ、通常攻撃
    const flatState = makeState({
      heights: flat(4, 4),
      units: [
        { id: 'w', team: 'enemy', x: 1, z: 2, commands: knockbackCommand },
        { id: 'p', team: 'player', x: 1, z: 1, facing: 'north' },
      ],
    });
    expect(decideNextAction(flatState, testAi)).toEqual({ type: 'attack', targetId: 'p' });
  });

  it('突き飛ばしは、詠唱中の相手を中断できる時に優先する', () => {
    const state = makeState({
      heights: flat(4, 4),
      units: [
        { id: 'w', team: 'enemy', x: 1, z: 2, commands: knockbackCommand },
        { id: 'p', team: 'player', job: testMage, x: 1, z: 1, facing: 'south', hp: 30, charging: { spellId: 'fire', target: { kind: 'tile', x: 3, z: 3 }, progress: 0 } },
      ],
    });
    // 移動できない時はその場から（正面）、移動できる時は側面に回ってから突き飛ばす（ダメージが大きいため）
    expect(chooseKnockback(state, getUnit(state, 'w'), false)).toMatchObject({ targetId: 'p', abilityId: 'knockback' });
    const first = decideNextAction(state, testAi);
    expect(first.type).toBe('move');
    expect(decideNextAction(applyAction(state, first).state, testAi)).toEqual({ type: 'attack', targetId: 'p', abilityId: 'knockback' });
  });

  it('封じは、魔法を使う相手を優先する（詠唱中の相手が最優先）', () => {
    // 魔術師は高い柱の上にいて、相手の攻撃が届かない
    const heights = flat(8, 8).map((row, z) => row.map((h, x) => (x === 0 && z === 0 ? 5 : h)));
    const units: TestUnit[] = [
      { id: 'm', team: 'enemy', job: testMage, x: 0, z: 0, commands: [{ jobId: 'mage', abilityIds: ['seal'] }] },
      { id: 'pw', team: 'player', x: 3, z: 0 },
      { id: 'ph', team: 'player', job: testHealer, x: 0, z: 3 },
      { id: 'pm', team: 'player', job: testMage, x: 2, z: 2 },
    ];
    const state = makeState({ heights, units });
    // 戦士は魔法を使わないので狙わない。回復魔法を使う相手を優先する
    expect(chooseSealSpell(state, getUnit(state, 'm'), false)?.target).toEqual({ kind: 'unit', unitId: 'ph' });
    const charging = makeState({
      heights,
      units: units.map((u) => (u.id === 'pm' ? { ...u, charging: { spellId: 'fire', target: { kind: 'tile', x: 0, z: 0 }, progress: 0 } } : u)),
    });
    expect(chooseSealSpell(charging, getUnit(charging, 'm'), false)?.target).toEqual({ kind: 'unit', unitId: 'pm' });
    // 沈黙が付いている相手は狙わない
    const silenced = makeState({
      heights,
      units: units.map((u) => (u.id === 'ph' || u.id === 'pm' ? { ...u, statuses: [{ id: 'silence', turns: 2 }] } : u)),
    });
    expect(chooseSealSpell(silenced, getUnit(silenced, 'm'), false)).toBeUndefined();
  });

  it('守りの祈りは、回復が要らない時に、相手の攻撃が届く位置にいる味方を2体以上守れるなら使う', () => {
    const state = makeState({
      heights: flat(8, 8),
      units: [
        { id: 'h', team: 'enemy', job: testHealer, x: 0, z: 0, commands: [{ jobId: 'healer', abilityIds: ['protectPrayer'] }] },
        { id: 'e1', team: 'enemy', x: 3, z: 3 },
        { id: 'e2', team: 'enemy', x: 4, z: 3 },
        { id: 'p', team: 'player', x: 6, z: 4 },
      ],
    });
    const plan = chooseProtectSpell(state, getUnit(state, 'h'), true, testAi);
    expect(plan?.spellId).toBe('protectPrayer');
    // 守る味方が1体だけなら使わない
    const lone = makeState({
      heights: flat(8, 8),
      units: [
        { id: 'h', team: 'enemy', job: testHealer, x: 0, z: 0, commands: [{ jobId: 'healer', abilityIds: ['protectPrayer'] }] },
        { id: 'e1', team: 'enemy', x: 3, z: 3 },
        { id: 'p', team: 'player', x: 6, z: 3 },
      ],
    });
    expect(chooseProtectSpell(lone, getUnit(lone, 'h'), true, testAi)).toBeUndefined();
  });

  it('足止めの矢は、鈍足の付いていない相手に使う（付いている相手には通常攻撃）', () => {
    const scene = (statuses: TestUnit['statuses'] = []) =>
      makeState({
        heights: flat(1, 6),
        units: [
          { id: 'a', team: 'enemy', job: testArcher, x: 0, z: 0, commands: [{ jobId: 'archer', abilityIds: ['slowArrow'] }] },
          { id: 'p', team: 'player', x: 0, z: 4, facing: 'north', statuses },
        ],
      });
    expect(decideNextAction(scene(), testAi)).toEqual({ type: 'attack', targetId: 'p', abilityId: 'slowArrow' });
    expect(decideNextAction(scene([{ id: 'slow', turns: 1 }]), testAi)).toEqual({ type: 'attack', targetId: 'p' });
  });

  it('反撃で倒されてしまう攻撃はしない（その攻撃で相手を倒せる時を除く）', () => {
    const state = makeState({
      heights: flat(5, 5),
      units: [
        { id: 'w', team: 'enemy', x: 1, z: 1, hp: 15 },
        { id: 'p1', team: 'player', x: 1, z: 3, passives: ['counter'], facing: 'south' },
        { id: 'p2', team: 'player', x: 3, z: 1, facing: 'north' },
      ],
    });
    const action = decideNextAction(state, testAi);
    expect(action.type).toBe('move');
    const after = applyAction(state, action).state;
    expect(decideNextAction(after, testAi)).toEqual({ type: 'attack', targetId: 'p2' });
  });
});
