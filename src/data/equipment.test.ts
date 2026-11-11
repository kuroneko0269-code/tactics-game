import { describe, expect, it } from 'vitest';
import { equippedStats } from '../core/equipment';
import { validateRoster } from '../core/progression';
import { shopStock } from '../core/shop';
import { spells, strikes } from './abilities';
import { twinHillsBattle } from './battles/twinHillsBattle';
import { ruinsDungeon } from './battles/ruins';
import { equipment, shop, starterEquipment } from './equipment';
import { jobs } from './jobs';
import { passives } from './passives';
import { progressionRules } from './progression';
import { initialRoster } from './roster';

const catalog = { jobs, spells, strikes, passives, equipment };
const ids = new Set(equipment.map((e) => e.id));

describe('装備の定義（フェーズ2-4）', () => {
  it('id は重ならず、武器と防具はそれぞれの種類に3段階ある。段階が上がるほど強く、高い', () => {
    expect(ids.size).toBe(equipment.length);
    const kinds = [
      ...['sword', 'bow', 'staff'].map((t) => equipment.filter((e) => e.weaponType === t)),
      ...['heavy', 'light', 'robe'].map((t) => equipment.filter((e) => e.armorType === t)),
    ];
    for (const list of kinds) {
      expect(list.map((e) => e.tier)).toEqual([1, 2, 3]);
      const power = (e: (typeof list)[number]) => Object.values(e.stats).reduce((s, v) => s + (v ?? 0), 0);
      expect(power(list[1]!)).toBeGreaterThan(power(list[0]!));
      expect(power(list[2]!)).toBeGreaterThan(power(list[1]!));
      expect(list[1]!.price).toBeGreaterThan(list[0]!.price);
      expect(list[2]!.price).toBeGreaterThan(list[1]!.price);
    }
    // 武器は届き方を持つ
    expect(equipment.filter((e) => e.slot === 'weapon').every((e) => e.attack !== undefined)).toBe(true);
    // 装飾品は6種類（ほかに、店で買えないボスの物）
    expect(equipment.filter((e) => e.slot === 'accessory' && e.tier > 0)).toHaveLength(6);
  });

  it('ジョブごとの装備できる種類: 戦士は剣と鎧、弓使いは弓と軽装、魔術師と癒し手は杖とローブ', () => {
    const of = (id: string) => jobs.find((j) => j.id === id)!;
    expect([of('warrior').weaponTypes, of('warrior').armorTypes]).toEqual([['sword'], ['heavy']]);
    expect([of('archer').weaponTypes, of('archer').armorTypes]).toEqual([['bow'], ['light']]);
    expect([of('mage').weaponTypes, of('mage').armorTypes]).toEqual([['staff'], ['robe']]);
    expect([of('healer').weaponTypes, of('healer').armorTypes]).toEqual([['staff'], ['robe']]);
  });

  it('最初の5人は1段階目の武器と防具を付けていて、その能力値は装備が入る前（フェーズ2-3）とほぼ同じ', () => {
    expect(validateRoster(initialRoster, catalog, progressionRules)).toEqual([]);
    const before: Record<string, { maxHp: number; attack: number; maxMp: number; magic: number }> = {
      warrior: { maxHp: 72, attack: 14, maxMp: 0, magic: 0 },
      archer: { maxHp: 50, attack: 11, maxMp: 0, magic: 0 },
      mage: { maxHp: 40, attack: 6, maxMp: 36, magic: 12 },
      healer: { maxHp: 45, attack: 6, maxMp: 40, magic: 12 },
    };
    for (const u of initialRoster.units) {
      expect(equippedStats(u, initialRoster, catalog)).toMatchObject(before[u.jobId]!);
      const worn = Object.values(u.equipment).map((uid) => initialRoster.items.find((i) => i.uid === uid)?.itemId ?? null);
      expect(worn.filter((x) => x !== null)).toEqual(starterEquipment[u.jobId]);
    }
  });

  it('店・戦利品・ボスの報酬に出てくる装備は、すべて定義がある。ボスの物は店に並ばない', () => {
    for (const e of shop.entries) expect(ids.has(e.itemId)).toBe(true);
    const tiers = [...twinHillsBattle.tiers, ...ruinsDungeon.battles.flatMap((b) => b.tiers)];
    for (const t of tiers) {
      expect(t.reward).toBeDefined();
      for (const l of t.reward!.loot) {
        expect(ids.has(l.itemId)).toBe(true);
        expect(l.percent).toBeGreaterThan(0);
        expect(l.percent).toBeLessThanOrEqual(100);
      }
    }
    expect(ids.has(ruinsDungeon.firstClearItemId!)).toBe(true);
    const all = shopStock(shop, { trainingWins: { normal: 1 }, dungeonClears: { ruins: 1 } });
    expect(all).not.toContain(ruinsDungeon.firstClearItemId);
    // 条件をすべて満たすと、ボスの物以外の装備がすべて並ぶ
    expect(new Set(all)).toEqual(new Set(equipment.filter((e) => e.tier > 0).map((e) => e.id)));
  });

  it('品ぞろえ: 最初は1段階目と2段階目の一部。遺跡のクリアで2段階目がそろい、「ふつう」の勝利で3段階目が並ぶ', () => {
    const tierOf = (id: string) => equipment.find((e) => e.id === id)!;
    const weaponsArmor = (list: string[]) => list.map(tierOf).filter((e) => e.slot !== 'accessory');
    const start = weaponsArmor(shopStock(shop, { trainingWins: {}, dungeonClears: {} }));
    expect(start.filter((e) => e.tier === 1)).toHaveLength(6);
    expect(start.filter((e) => e.tier === 2).length).toBeGreaterThan(0);
    expect(start.filter((e) => e.tier === 2).length).toBeLessThan(6);
    expect(start.some((e) => e.tier === 3)).toBe(false);
    const cleared = weaponsArmor(shopStock(shop, { trainingWins: {}, dungeonClears: { ruins: 1 } }));
    expect(cleared.filter((e) => e.tier === 2)).toHaveLength(6);
    expect(cleared.some((e) => e.tier === 3)).toBe(false);
    const won = weaponsArmor(shopStock(shop, { trainingWins: { normal: 1 }, dungeonClears: {} }));
    expect(won.filter((e) => e.tier === 3)).toHaveLength(6);
  });

  it('お金の段階: 難しい戦闘ほど多くのゴールドを得る', () => {
    const gold = twinHillsBattle.tiers.map((t) => t.reward!.gold);
    expect(gold[1]).toBeGreaterThan(gold[0]!);
    expect(gold[2]).toBeGreaterThan(gold[1]!);
    const ruins = ruinsDungeon.battles.map((b) => b.tiers[0]!.reward!.gold);
    expect(ruins[1]).toBeGreaterThan(ruins[0]!);
    expect(ruins[2]).toBeGreaterThan(ruins[1]!);
  });
});
