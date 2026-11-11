import { describe, expect, it } from 'vitest';
import type { EquipmentDefinition } from './battleTypes';
import { clearRewardItems, type DungeonDefinition } from './dungeon';
import { ZERO_GROWTH, type Roster } from './progression';
import {
  addItems,
  buyItem,
  buyRefusal,
  grantSpoils,
  recordTrainingWin,
  rollSpoils,
  sellItem,
  sellPrice,
  sellRefusal,
  shopStock,
  type BattleReward,
  type ProgressRecords,
  type ShopDefinition,
} from './shop';

/** お金・店・戦利品（フェーズ2-4）。数値はテスト用 */
const def = (id: string, price: number, tier = 1): EquipmentDefinition => ({ id, slot: 'accessory', tier, price, stats: {} });
const catalog = { equipment: [def('t1', 100), def('t2', 300, 2), def('t2b', 300, 2), def('t3', 1000, 3), def('odd', 75)] };
const shop: ShopDefinition = {
  sellPercent: 50,
  entries: [
    { itemId: 't1' },
    { itemId: 't2' },
    { itemId: 't2b', requires: { kind: 'dungeonCleared', dungeonId: 'ruins' } },
    { itemId: 't3', requires: { kind: 'trainingWon', tierId: 'normal' } },
  ],
};
const none: ProgressRecords = { trainingWins: {}, dungeonClears: {} };

const roster = (gold: number): Roster => ({
  units: [
    {
      id: 'a',
      jobId: 'warrior',
      level: 1,
      exp: 0,
      growth: ZERO_GROWTH,
      jobs: { warrior: { jp: 0, jpTotal: 0, learned: [] } },
      slots: { secondary: null, reaction: null, support: null, movement: null },
      equipment: { weapon: null, armor: null, accessory: 'i1' },
    },
  ],
  gold,
  items: [
    { uid: 'i1', itemId: 't1' },
    { uid: 'i2', itemId: 't2' },
  ],
  nextItemSeq: 3,
});

describe('店の品ぞろえ', () => {
  it('最初は条件のない物だけ。ダンジョンを初めてクリアすると、訓練戦の「ふつう」に勝つと、それぞれ増える', () => {
    expect(shopStock(shop, none)).toEqual(['t1', 't2']);
    expect(shopStock(shop, { ...none, dungeonClears: { ruins: 1 } })).toEqual(['t1', 't2', 't2b']);
    expect(shopStock(shop, { ...none, trainingWins: { easy: 5 } })).toEqual(['t1', 't2']);
    expect(shopStock(shop, { trainingWins: { normal: 1 }, dungeonClears: { ruins: 2 } })).toEqual(['t1', 't2', 't2b', 't3']);
  });

  it('訓練戦の勝利を段階ごとに数える', () => {
    expect(recordTrainingWin(recordTrainingWin({}, 'normal'), 'normal')).toEqual({ normal: 2 });
  });
});

describe('買う・売る', () => {
  it('買うと、ゴールドが減り、新しい個体が増える（uid は通し番号）', () => {
    const stock = shopStock(shop, none);
    const { roster: after, item } = buyItem(roster(500), 't2', stock, catalog);
    expect(after.gold).toBe(200);
    expect(item).toEqual({ uid: 'i3', itemId: 't2' });
    expect(after.items).toHaveLength(3);
    expect(after.nextItemSeq).toBe(4);
  });

  it('ゴールドが足りない時と、品ぞろえにない物は買えない', () => {
    const stock = shopStock(shop, none);
    expect(buyRefusal(roster(299), 't2', stock, catalog)).toBe('notEnoughGold');
    expect(buyRefusal(roster(300), 't2', stock, catalog)).toBeNull();
    expect(buyRefusal(roster(5000), 't3', stock, catalog)).toBe('notInStock');
    expect(() => buyItem(roster(299), 't2', stock, catalog)).toThrow();
  });

  it('売値は買値の半分（切り捨て）。売るとゴールドが増え、個体がなくなる', () => {
    expect(sellPrice(def('x', 300), shop)).toBe(150);
    expect(sellPrice(def('odd', 75), shop)).toBe(37);
    const after = sellItem(roster(10), 'i2', catalog, shop);
    expect(after.gold).toBe(160);
    expect(after.items.map((i) => i.uid)).toEqual(['i1']);
    // 売った物の uid は使い回さない
    expect(addItems(after, ['t1']).added).toEqual([{ uid: 'i3', itemId: 't1' }]);
  });

  it('装備中の物と、持っていない物は売れない', () => {
    expect(sellRefusal(roster(0), 'i1')).toBe('equipped');
    expect(sellRefusal(roster(0), 'i9')).toBe('notOwned');
    expect(sellRefusal(roster(0), 'i2')).toBeNull();
    expect(() => sellItem(roster(0), 'i1', catalog, shop)).toThrow();
  });
});

describe('ゴールドと戦利品', () => {
  const reward: BattleReward = {
    gold: 120,
    loot: [
      { itemId: 't1', percent: 50 },
      { itemId: 't2', percent: 50 },
      { itemId: 't3', percent: 100 },
    ],
  };

  it('勝った時だけ、決まった量のゴールドと戦利品を得る。負けた時と報酬のない戦闘は何もない', () => {
    const won = rollSpoils(reward, true, 12345);
    expect(won.gold).toBe(120);
    expect(won.itemIds).toContain('t3');
    expect(rollSpoils(reward, false, 12345)).toEqual({ gold: 0, itemIds: [] });
    expect(rollSpoils(undefined, true, 12345)).toEqual({ gold: 0, itemIds: [] });
  });

  it('戦利品の抽選は、同じ乱数の状態（シード値）なら同じ結果になる。状態が違えば結果も変わりうる', () => {
    expect(rollSpoils(reward, true, 777)).toEqual(rollSpoils(reward, true, 777));
    const outcomes = new Set(Array.from({ length: 40 }, (_, i) => rollSpoils(reward, true, i + 1).itemIds.join(',')));
    // 50% の候補が2つあるので、4通り（t3 は必ず）が出る
    expect([...outcomes].sort()).toEqual(['t1,t2,t3', 't1,t3', 't2,t3', 't3']);
  });

  it('確率どおりに出る（多数回の抽選で、50% の候補はおよそ半分）', () => {
    let count = 0;
    for (let i = 1; i <= 2000; i++) if (rollSpoils(reward, true, i * 7919).itemIds.includes('t1')) count++;
    expect(count).toBeGreaterThan(900);
    expect(count).toBeLessThan(1100);
  });

  it('得たものを部隊に入れる（ゴールドを足し、戦利品を新しい個体として足す）', () => {
    const { roster: after, added } = grantSpoils(roster(5), { gold: 120, itemIds: ['t3', 't1'] });
    expect(after.gold).toBe(125);
    expect(added).toEqual([
      { uid: 'i3', itemId: 't3' },
      { uid: 'i4', itemId: 't1' },
    ]);
    expect(after.items).toHaveLength(4);
  });

  it('ダンジョンのボスからは、初めてのクリアの時だけ、決まった装備が必ず1つ手に入る', () => {
    const dungeon: DungeonDefinition = { id: 'd', battles: [], clearRewardJp: 0, repeatClearRewardJp: 0, firstClearItemId: 'crown' };
    expect(clearRewardItems(dungeon, true)).toEqual(['crown']);
    expect(clearRewardItems(dungeon, false)).toEqual([]);
    expect(clearRewardItems({ ...dungeon, firstClearItemId: undefined }, true)).toEqual([]);
  });
});
