/**
 * お金・店・戦利品（フェーズ2-4）。
 *
 * - 所持金（ゴールド）は部隊（Roster.gold）に持つ。訓練戦とダンジョンの各戦闘に勝つと、戦闘ごとに決まった量を得る（負けたら得られない）。
 * - 戦利品: 戦闘ごとに「手に入る可能性のある装備と確率（%）」の一覧をデータで決め、勝った時に1つずつ抽選する。
 *   抽選には、戦闘が終わった時点の乱数の状態（BattleState.rngState）から続けて引くシード付きの乱数を使う
 *   （同じシード値・同じ行動の戦闘なら、同じ戦利品になる）。
 * - 店: 品ぞろえは、進み具合（ダンジョンのクリア・訓練戦の勝利）で増える。買うと所持品に新しい個体が1つ増える。
 *   売値は買値の sellPercent%（切り捨て）。装備中の物は売れない。
 * - 手に入れた個体には、"i" + 通し番号の uid を付ける（売った物の uid を使い回さない）。
 *
 * 数値（値段・ゴールド・確率・品ぞろえの条件）は src/data から受け取る。計算はすべて整数。
 */
import type { EquipmentDefinition } from './battleTypes';
import { findEquipment, type ItemInstance } from './items';
import { wearerOf } from './equipment';
import type { GameCatalog, Roster } from './progression';
import { restoreRng } from './rng';

/** 戦闘に勝った時の報酬（src/data に置く。戦場の段階ごと） */
export interface BattleReward {
  /** 勝った時に得るゴールド */
  readonly gold: number;
  /** 戦利品の候補。1つずつ percent% の確率で手に入る */
  readonly loot: readonly LootEntry[];
}

export interface LootEntry {
  readonly itemId: string;
  /** 手に入る確率（%。1〜100） */
  readonly percent: number;
}

/** 進み具合の記録のうち、店の品ぞろえに使うもの（セーブデータの records とダンジョンのクリアの回数） */
export interface ProgressRecords {
  /** 訓練戦の段階ごとの勝利の回数 */
  readonly trainingWins: Readonly<Record<string, number>>;
  /** ダンジョンごとのクリアの回数 */
  readonly dungeonClears: Readonly<Record<string, number>>;
}

/** 品ぞろえに並ぶ条件 */
export type ShopRequirement =
  | { readonly kind: 'dungeonCleared'; readonly dungeonId: string }
  | { readonly kind: 'trainingWon'; readonly tierId: string };

export interface ShopEntry {
  readonly itemId: string;
  /** 並ぶ条件（省くと最初から並ぶ） */
  readonly requires?: ShopRequirement;
}

/** 店の定義（src/data に置く） */
export interface ShopDefinition {
  /** 並べる順の品ぞろえ */
  readonly entries: readonly ShopEntry[];
  /** 売値の、買値に対する割合（%。切り捨て） */
  readonly sellPercent: number;
}

/** 条件を満たしているか */
export function meetsRequirement(req: ShopRequirement | undefined, records: ProgressRecords): boolean {
  if (!req) return true;
  if (req.kind === 'dungeonCleared') return (records.dungeonClears[req.dungeonId] ?? 0) > 0;
  return (records.trainingWins[req.tierId] ?? 0) > 0;
}

/** 今の品ぞろえ（装備の id。定義の順） */
export function shopStock(shop: ShopDefinition, records: ProgressRecords): string[] {
  return shop.entries.filter((e) => meetsRequirement(e.requires, records)).map((e) => e.itemId);
}

/** 売値（買値の sellPercent%、切り捨て） */
export function sellPrice(def: EquipmentDefinition, shop: ShopDefinition): number {
  return Math.floor((def.price * shop.sellPercent) / 100);
}

/** 個体を足す（uid は "i" + 通し番号） */
export function addItems(roster: Roster, itemIds: readonly string[]): { roster: Roster; added: ItemInstance[] } {
  let seq = roster.nextItemSeq;
  const added = itemIds.map((itemId) => ({ uid: `i${seq++}`, itemId }));
  return { roster: { ...roster, items: [...roster.items, ...added], nextItemSeq: seq }, added };
}

export type BuyRefusal = 'notInStock' | 'notEnoughGold';

export function buyRefusal(roster: Roster, itemId: string, stock: readonly string[], catalog: Pick<GameCatalog, 'equipment'>): BuyRefusal | null {
  if (!stock.includes(itemId)) return 'notInStock';
  if (roster.gold < findEquipment(catalog, itemId).price) return 'notEnoughGold';
  return null;
}

/** 買う（品ぞろえにない・ゴールドが足りない時はエラー）。手に入れた個体も返す */
export function buyItem(
  roster: Roster,
  itemId: string,
  stock: readonly string[],
  catalog: Pick<GameCatalog, 'equipment'>,
): { roster: Roster; item: ItemInstance } {
  const refusal = buyRefusal(roster, itemId, stock, catalog);
  if (refusal) throw new Error(`${itemId} を買えません（${refusal}）`);
  const paid = { ...roster, gold: roster.gold - findEquipment(catalog, itemId).price };
  const { roster: next, added } = addItems(paid, [itemId]);
  return { roster: next, item: added[0]! };
}

export type SellRefusal = 'notOwned' | 'equipped';

export function sellRefusal(roster: Roster, uid: string): SellRefusal | null {
  if (!roster.items.some((i) => i.uid === uid)) return 'notOwned';
  if (wearerOf(roster, uid)) return 'equipped';
  return null;
}

/** 売る（持っていない・装備中の時はエラー） */
export function sellItem(roster: Roster, uid: string, catalog: Pick<GameCatalog, 'equipment'>, shop: ShopDefinition): Roster {
  const refusal = sellRefusal(roster, uid);
  if (refusal) throw new Error(`${uid} を売れません（${refusal}）`);
  const item = roster.items.find((i) => i.uid === uid)!;
  return {
    ...roster,
    gold: roster.gold + sellPrice(findEquipment(catalog, item.itemId), shop),
    items: roster.items.filter((i) => i.uid !== uid),
  };
}

/** 戦闘で得たもの */
export interface BattleSpoils {
  readonly gold: number;
  /** 手に入れた装備の id（候補の一覧の順） */
  readonly itemIds: readonly string[];
}

export const NO_SPOILS: BattleSpoils = { gold: 0, itemIds: [] };

/**
 * 戦闘の報酬を決める。勝った時だけ、ゴールドと戦利品の抽選（候補ごとに 1〜100 の乱数を1回引き、percent 以下なら手に入る）。
 * rngState は戦闘が終わった時点の乱数の状態（同じ状態なら同じ結果）。
 */
export function rollSpoils(reward: BattleReward | undefined, victory: boolean, rngState: number): BattleSpoils {
  if (!reward || !victory) return NO_SPOILS;
  const rng = restoreRng(rngState);
  const itemIds = reward.loot.filter((entry) => rng.nextInt(1, 100) <= entry.percent).map((e) => e.itemId);
  return { gold: reward.gold, itemIds };
}

/** 報酬を部隊に入れる（ゴールドを足し、戦利品を個体として足す） */
export function grantSpoils(roster: Roster, spoils: BattleSpoils): { roster: Roster; added: ItemInstance[] } {
  return addItems({ ...roster, gold: roster.gold + spoils.gold }, spoils.itemIds);
}

/** 訓練戦の勝利を記録する */
export function recordTrainingWin(trainingWins: Readonly<Record<string, number>>, tierId: string): Record<string, number> {
  return { ...trainingWins, [tierId]: (trainingWins[tierId] ?? 0) + 1 };
}
