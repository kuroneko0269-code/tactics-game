import { describe, expect, it } from 'vitest';
import { applyAction, getUnit, startBattle } from './battle';
import type { EquipmentDefinition, JobDefinition, UnitPlacement } from './battleTypes';
import {
  autoEquip,
  changeJobWithEquipment,
  equipCandidates,
  equipItem,
  equipRefusal,
  equippedDefinitions,
  equippedStats,
  removeUnfitEquipment,
  wearerOf,
  type AutoEquipWeights,
} from './equipment';
import { canEquip } from './items';
import { findUnit, ZERO_GROWTH, type GameCatalog, type ProgressionRules, type Roster, type RosterUnit } from './progression';
import { buildSortie, type BattleSite } from './sortie';
import {
  flat,
  makeState,
  testArcher,
  testMage,
  testPassives,
  testPowerStrike,
  testRules,
  testSpells,
  testStrikes,
  testWarrior,
} from './testSupport';

/**
 * 装備（フェーズ2-4）: 能力値の変化、ジョブごとの制限、ジョブを変えた時に外れること、武器の種類とアビリティ、
 * 「おまかせ」、装飾品の効果。数値はテスト用。
 */
const sword: EquipmentDefinition = {
  id: 'sword',
  slot: 'weapon',
  weaponType: 'sword',
  tier: 1,
  price: 100,
  stats: { attack: 3 },
  attack: { kind: 'melee', maxHeightDiff: 2 },
};
const bigSword: EquipmentDefinition = { ...sword, id: 'big-sword', tier: 2, price: 300, stats: { attack: 6 } };
const bow: EquipmentDefinition = {
  id: 'bow',
  slot: 'weapon',
  weaponType: 'bow',
  tier: 1,
  price: 100,
  stats: { attack: 2 },
  attack: { kind: 'ranged', minRange: 3, maxRange: 5, heightPerExtraRange: 2 },
};
const staff: EquipmentDefinition = {
  id: 'staff',
  slot: 'weapon',
  weaponType: 'staff',
  tier: 1,
  price: 100,
  stats: { magic: 4 },
  attack: { kind: 'melee', maxHeightDiff: 2 },
};
const mail: EquipmentDefinition = { id: 'mail', slot: 'armor', armorType: 'heavy', tier: 1, price: 80, stats: { maxHp: 10 } };
const robe: EquipmentDefinition = { id: 'robe', slot: 'armor', armorType: 'robe', tier: 1, price: 80, stats: { maxHp: 4, maxMp: 6 } };
const boots: EquipmentDefinition = { id: 'boots', slot: 'accessory', tier: 1, price: 200, stats: { move: 1 } };
const charm: EquipmentDefinition = { id: 'charm', slot: 'accessory', tier: 1, price: 150, stats: { maxMp: 30 } };
const amulet: EquipmentDefinition = {
  id: 'amulet',
  slot: 'accessory',
  tier: 1,
  price: 150,
  stats: {},
  effects: [{ kind: 'statusImmunity', status: 'silence' }],
};
const bangle: EquipmentDefinition = { id: 'bangle', slot: 'accessory', tier: 1, price: 150, stats: {}, effects: [{ kind: 'steadyCasting' }] };
const allEquipment = [sword, bigSword, bow, staff, mail, robe, boots, charm, amulet, bangle];

const warrior: JobDefinition = { ...testWarrior, abilities: [{ id: 'powerStrike', jpCost: 50 }] };
const mage: JobDefinition = { ...testMage };
const catalog: GameCatalog = {
  jobs: [warrior, testArcher, mage],
  spells: testSpells,
  strikes: testStrikes,
  passives: testPassives,
  equipment: allEquipment,
};
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
  jobLevelJp: [100],
  growthCap: ZERO_GROWTH,
  growthWeights: ZERO_GROWTH,
  growthTotalCap: 0,
};
const weights: AutoEquipWeights = {
  stats: { maxHp: 1, maxMp: 1, attack: 4, magic: 4, speed: 20, move: 12, jump: 6 },
  effects: { statusImmunity: 6, steadyCasting: 6 },
};

const member = (id: string, jobId: string, equipment: Partial<RosterUnit['equipment']> = {}, learned: string[] = []): RosterUnit => ({
  id,
  jobId,
  level: 1,
  exp: 0,
  growth: ZERO_GROWTH,
  jobs: { [jobId]: { jp: 0, jpTotal: 0, learned } },
  slots: { secondary: null, reaction: null, support: null, movement: null },
  equipment: { weapon: null, armor: null, accessory: null, ...equipment },
});

/** 戦士 a（剣・鎧）、魔術師 b（杖）。所持品は剣・大剣・弓・杖・鎧・ローブ・靴・首飾り・護符 */
const party = (): Roster => ({
  units: [member('a', 'warrior', { weapon: 'i1', armor: 'i5' }), member('b', 'mage', { weapon: 'i4' }, ['fire'])],
  gold: 0,
  items: [
    { uid: 'i1', itemId: 'sword' },
    { uid: 'i2', itemId: 'big-sword' },
    { uid: 'i3', itemId: 'bow' },
    { uid: 'i4', itemId: 'staff' },
    { uid: 'i5', itemId: 'mail' },
    { uid: 'i6', itemId: 'robe' },
    { uid: 'i7', itemId: 'boots' },
    { uid: 'i8', itemId: 'charm' },
    { uid: 'i9', itemId: 'amulet' },
  ],
  nextItemSeq: 10,
});

describe('装備による能力値の変化', () => {
  it('能力値 = ジョブの基本値 + 成長値 + 装備の値', () => {
    const roster = party();
    const a = findUnit(roster, 'a');
    expect(equippedDefinitions(a, roster, catalog).map((d) => d.id)).toEqual(['sword', 'mail']);
    expect(equippedStats(a, roster, catalog)).toEqual({ ...warrior.stats, attack: warrior.stats.attack + 3, maxHp: warrior.stats.maxHp + 10 });
    const withBoots = equipItem(roster, 'a', 'accessory', 'i7', catalog);
    expect(equippedStats(findUnit(withBoots, 'a'), withBoots, catalog).move).toBe(warrior.stats.move + 1);
  });

  it('出撃すると、戦闘中の能力値にも装備の値が入り、通常攻撃の届き方は武器で決まる', () => {
    const site: BattleSite = {
      id: 's',
      map: { id: 'm', heights: flat(6, 6), terrain: flat(6, 6).map((r) => 'g'.repeat(r.length)), legend: { g: 'grass' } },
      playerSlots: [
        { x: 0, z: 5, facing: 'north' },
        { x: 1, z: 5, facing: 'north' },
      ],
      tiers: [{ id: 'main', units: [{ id: 'e', jobId: 'warrior', x: 0, z: 0, facing: 'south', equipment: [bow] }] }],
    };
    const { state } = startBattle(buildSortie(site, 'main', party(), catalog), catalog.jobs, testRules, 1, testSpells, testStrikes);
    expect(getUnit(state, 'a').stats.attack).toBe(warrior.stats.attack + 3);
    expect(getUnit(state, 'a').stats.maxHp).toBe(warrior.stats.maxHp + 10);
    expect(getUnit(state, 'a').hp).toBe(warrior.stats.maxHp + 10);
    expect(getUnit(state, 'a').equipment.map((e) => e.id)).toEqual(['sword', 'mail']);
    expect(getUnit(state, 'b').stats.magic).toBe(mage.stats.magic + 4);
    // 敵の戦士が弓を持っていれば（データの上では）、武器の種類は弓で、射程も弓のもの
    const e = getUnit(state, 'e');
    expect(e.weapon).toBe('bow');
    expect(e.attack.kind).toBe('ranged');
  });

  it('武器がなければ素手（武器の種類なし、ルールの素手の届き方）', () => {
    const placement: UnitPlacement = { id: 'x', team: 'player', jobId: 'archer', x: 0, z: 0, facing: 'south', equipment: [] };
    const map = { id: 'm', heights: flat(3, 3), terrain: flat(3, 3).map((r) => 'g'.repeat(r.length)), legend: { g: 'grass' as const } };
    const { state } = startBattle(
      { id: 't', map, units: [placement, { ...placement, id: 'y', team: 'enemy', x: 2, z: 2 }] },
      catalog.jobs,
      testRules,
      1,
    );
    expect(getUnit(state, 'x').weapon).toBeNull();
    expect(getUnit(state, 'x').attack).toEqual(testRules.unarmedAttack);
  });
});

describe('ジョブごとの装備の制限', () => {
  it('武器と防具は、ジョブの装備できる種類だけ。装飾品はだれでも', () => {
    expect(canEquip(warrior, sword)).toBe(true);
    expect(canEquip(warrior, bow)).toBe(false);
    expect(canEquip(warrior, robe)).toBe(false);
    expect(canEquip(mage, staff)).toBe(true);
    expect(canEquip(mage, mail)).toBe(false);
    expect([warrior, testArcher, mage].every((j) => canEquip(j, boots))).toBe(true);
  });

  it('付けられない物・枠の違う物・持っていない物は付けられない', () => {
    const roster = party();
    expect(equipRefusal(roster, 'a', 'weapon', 'i3', catalog)).toBe('cannotEquip');
    expect(equipRefusal(roster, 'a', 'armor', 'i1', catalog)).toBe('wrongSlot');
    expect(equipRefusal(roster, 'a', 'weapon', 'i99', catalog)).toBe('notOwned');
    expect(equipRefusal(roster, 'a', 'weapon', 'i2', catalog)).toBeNull();
    expect(() => equipItem(roster, 'b', 'armor', 'i5', catalog)).toThrow();
  });

  it('枠の候補は、その枠の物で今のジョブが付けられる物（ほかのユニットが付けている物も、付け替えた後の能力値も出す）', () => {
    const roster = party();
    const weapons = equipCandidates(roster, 'a', 'weapon', catalog);
    expect(weapons.map((c) => c.def.id)).toEqual(['big-sword', 'sword']);
    expect(weapons[0]!.statsAfter.attack).toBe(warrior.stats.attack + 6);
    expect(weapons[1]!.wornBy).toBe('a');
    expect(equipCandidates(roster, 'b', 'armor', catalog).map((c) => c.def.id)).toEqual(['robe']);
  });

  it('ほかのユニットが付けている物を選ぶと、そのユニットから外して付け替える', () => {
    const roster = equipItem(party(), 'b', 'accessory', 'i7', catalog);
    expect(wearerOf(roster, 'i7')?.id).toBe('b');
    const moved = equipItem(roster, 'a', 'accessory', 'i7', catalog);
    expect(findUnit(moved, 'a').equipment.accessory).toBe('i7');
    expect(findUnit(moved, 'b').equipment.accessory).toBeNull();
    // 外す
    expect(findUnit(equipItem(moved, 'a', 'accessory', null, catalog), 'a').equipment.accessory).toBeNull();
  });
});

describe('ジョブを変えた時', () => {
  it('新しいジョブで付けられなくなった物は自動で外れ、外れた物を返す。装飾品は外れない', () => {
    const roster = equipItem(party(), 'a', 'accessory', 'i7', catalog);
    const { roster: after, removed } = changeJobWithEquipment(roster, 'a', 'mage', catalog, rules);
    expect(findUnit(after, 'a').jobId).toBe('mage');
    expect(removed.map((i) => i.itemId)).toEqual(['sword', 'mail']);
    expect(findUnit(after, 'a').equipment).toEqual({ weapon: null, armor: null, accessory: 'i7' });
    // 外れた物は所持品に残る
    expect(after.items).toHaveLength(roster.items.length);
    // 同じ種類を付けられるジョブなら外れない
    expect(changeJobWithEquipment(roster, 'a', 'warrior', catalog, rules).removed).toEqual([]);
    expect(removeUnfitEquipment(roster, 'a', catalog).removed).toEqual([]);
  });
});

describe('武器の種類とアビリティ', () => {
  const duel = (equipment: readonly EquipmentDefinition[]) =>
    startBattle(
      {
        id: 't',
        map: { id: 'm', heights: flat(3, 3), terrain: flat(3, 3).map((r) => 'g'.repeat(r.length)), legend: { g: 'grass' } },
        units: [
          { id: 'w', team: 'player', jobId: 'warrior', x: 1, z: 1, facing: 'north', equipment, commands: [{ jobId: 'warrior', abilityIds: ['powerStrike'] }] },
          { id: 'e', team: 'enemy', jobId: 'warrior', x: 1, z: 0, facing: 'south' },
        ],
      },
      catalog.jobs,
      testRules,
      1,
      testSpells,
      [testPowerStrike],
    ).state;

  it('アビリティの「必要な武器の種類」は、装備している武器で判定する（剣なら強打を使え、素手や弓では使えない）', () => {
    expect(getUnit(duel([sword]), 'w').weapon).toBe('sword');
    expect(() => applyAction(duel([sword]), { type: 'attack', targetId: 'e', abilityId: 'powerStrike' })).not.toThrow();
    expect(() => applyAction(duel([]), { type: 'attack', targetId: 'e', abilityId: 'powerStrike' })).toThrow(/武器/);
  });
});

describe('「おまかせ」', () => {
  it('ほかのユニットが付けていない物の中から、今のジョブで付けられる、枠ごとに最も強い物を付ける', () => {
    const roster = autoEquip(party(), 'a', catalog, weights);
    const a = findUnit(roster, 'a');
    // 武器: 大剣（攻撃力 +6）。弓と杖は付けられない。防具: 鎧（ローブは付けられない）
    expect(a.equipment.weapon).toBe('i2');
    expect(a.equipment.armor).toBe('i5');
    // 装飾品: 戦士は魔法を使わないので、MP の首飾りより移動力の靴
    expect(a.equipment.accessory).toBe('i7');
    // 魔術師は、MP の首飾り（MP +30 = 30点）を靴（12点）より選ぶ。杖は自分の物のまま、ローブを付ける
    const b = findUnit(autoEquip(party(), 'b', catalog, weights), 'b');
    expect(b.equipment).toEqual({ weapon: 'i4', armor: 'i6', accessory: 'i8' });
  });

  it('ほかのユニットが付けている物は選ばない', () => {
    const roster = equipItem(party(), 'b', 'accessory', 'i7', catalog);
    const a = findUnit(autoEquip(roster, 'a', catalog, weights), 'a');
    expect(a.equipment.accessory).not.toBe('i7');
    expect(findUnit(autoEquip(roster, 'a', catalog, weights), 'b').equipment.accessory).toBe('i7');
  });

  it('付けられる物がなければ、その枠は空にする', () => {
    const roster: Roster = { ...party(), items: party().items.filter((i) => i.itemId !== 'staff') };
    const b = findUnit(autoEquip({ ...roster, units: [findUnit(roster, 'a'), { ...findUnit(roster, 'b'), equipment: { weapon: null, armor: null, accessory: null } }] }, 'b', catalog, weights), 'b');
    expect(b.equipment.weapon).toBeNull();
  });
});

describe('装飾品の効果', () => {
  it('状態変化を防ぐ: 沈黙が付かず、防いだことが出来事に出る（詠唱も中断されない）', () => {
    const state = makeState({
      heights: flat(5, 5),
      units: [
        { id: 'm', team: 'player', job: testMage, x: 0, z: 0 },
        { id: 'e', team: 'enemy', job: testMage, x: 2, z: 0, equipment: [amulet], charging: { spellId: 'fire', target: { kind: 'tile', x: 4, z: 4 }, progress: 0 } },
      ],
    });
    // テスト用の「封じ」で沈黙を狙う
    const seal = testSpells.find((s) => s.effect === 'status' && s.inflicts === 'silence');
    expect(seal).toBeDefined();
    let s = applyAction(
      { ...state, units: state.units.map((u) => (u.id === 'm' ? { ...u, spells: [...u.spells, seal!], commands: [{ jobId: 'mage', abilityIds: ['fire', 'wind', seal!.id] }] } : u)) },
      { type: 'cast', spellId: seal!.id, target: { kind: 'unit', unitId: 'e' } },
    );
    const events = [...s.events];
    for (let i = 0; i < 10 && getUnit(s.state, 'm').charging && s.state.turn; i++) {
      s = applyAction(s.state, { type: 'endTurn', facing: 'north' });
      events.push(...s.events);
    }
    expect(events.some((e) => e.type === 'statusBlocked' && e.unitId === 'e' && e.status === 'silence' && e.itemId === 'amulet')).toBe(true);
    expect(events.some((e) => e.type === 'statusAdded' && e.unitId === 'e')).toBe(false);
    expect(events.some((e) => e.type === 'castInterrupted' && e.casterId === 'e')).toBe(false);
  });

  it('詠唱中に受けるダメージの増加を打ち消す（予測も実際のダメージも 1.25 倍にならない）', () => {
    const charging = { spellId: 'fire', target: { kind: 'tile' as const, x: 4, z: 4 }, progress: 0 };
    const scene = (equipment: EquipmentDefinition[], isCharging = true) =>
      makeState({
        heights: flat(3, 3),
        units: [
          { id: 'w', team: 'player', x: 1, z: 1, facing: 'north' },
          { id: 'm', team: 'enemy', job: testMage, x: 1, z: 0, facing: 'north', hp: 200, charging: isCharging ? charging : undefined, equipment },
        ],
      });
    const hitDamage = (equipment: EquipmentDefinition[], isCharging = true) => {
      for (let seed = 1; seed < 50; seed++) {
        const r = applyAction({ ...scene(equipment, isCharging), rngState: seed }, { type: 'attack', targetId: 'm' });
        const a = r.events.find((e) => e.type === 'attacked');
        if (a && a.type === 'attacked' && a.hit) return a;
      }
      throw new Error('当たりませんでした');
    };
    const plain = hitDamage([]);
    const steady = hitDamage([bangle]);
    expect(plain.chargingPercent).toBe(125);
    expect(steady.chargingPercent).toBe(100);
    expect(steady.damage).toBeLessThan(plain.damage);
    expect(steady.damage).toBe(hitDamage([], false).damage);
  });

  it('移動力・ジャンプ力・素早さ・最大 MP の装飾品は、戦闘中の能力値に足される', () => {
    const ring: EquipmentDefinition = { id: 'ring', slot: 'accessory', tier: 1, price: 1, stats: { speed: 1 } };
    const springs: EquipmentDefinition = { id: 'springs', slot: 'accessory', tier: 1, price: 1, stats: { jump: 1 } };
    const statsWith = (e: EquipmentDefinition) =>
      startBattle(
        {
          id: 't',
          map: { id: 'm', heights: flat(3, 3), terrain: flat(3, 3).map((r) => 'g'.repeat(r.length)), legend: { g: 'grass' } },
          units: [
            { id: 'x', team: 'player', jobId: 'mage', x: 0, z: 0, facing: 'south', equipment: [staff, e] },
            { id: 'y', team: 'enemy', jobId: 'warrior', x: 2, z: 2, facing: 'north' },
          ],
        },
        catalog.jobs,
        testRules,
        1,
        testSpells,
        testStrikes,
      ).state.units[0]!.stats;
    expect(statsWith(boots).move).toBe(mage.stats.move + 1);
    expect(statsWith(springs).jump).toBe(mage.stats.jump + 1);
    expect(statsWith(ring).speed).toBe(mage.stats.speed + 1);
    expect(statsWith(charm).maxMp).toBe(mage.stats.maxMp + 30);
  });
});

describe('編成の検証（装備と所持品）', () => {
  it('正しい部隊には誤りがない。持っていない個体・付けられない物・同じ個体を2人で付ける・所持金の誤りを見つける', async () => {
    const { validateRoster } = await import('./progression');
    expect(validateRoster(party(), catalog, rules)).toEqual([]);
    const ghost = { ...party(), units: [{ ...findUnit(party(), 'a'), equipment: { weapon: 'i99', armor: null, accessory: null } }] };
    expect(validateRoster(ghost, catalog, rules)).toEqual([{ kind: 'badEquipment', unitId: 'a', uid: 'i99' }]);
    const unfit = { ...party(), units: [{ ...findUnit(party(), 'a'), equipment: { weapon: 'i3', armor: null, accessory: null } }] };
    expect(validateRoster(unfit, catalog, rules)).toEqual([{ kind: 'badEquipment', unitId: 'a', uid: 'i3' }]);
    const shared: Roster = { ...party(), units: [findUnit(party(), 'a'), { ...findUnit(party(), 'b'), equipment: { weapon: null, armor: null, accessory: 'i1' } }] };
    expect(validateRoster(shared, catalog, rules)).toContainEqual({ kind: 'badEquipment', unitId: 'b', uid: 'i1' });
    expect(validateRoster({ ...party(), gold: -1 }, catalog, rules)).toEqual([{ kind: 'badGold' }]);
    expect(validateRoster({ ...party(), items: [...party().items, { uid: 'i1', itemId: 'sword' }] }, catalog, rules)).toEqual([
      { kind: 'duplicateItem', uid: 'i1' },
    ]);
    expect(validateRoster({ ...party(), items: [...party().items, { uid: 'i50', itemId: 'nope' }] }, catalog, rules)).toEqual([
      { kind: 'badItem', uid: 'i50' },
    ]);
  });
});
