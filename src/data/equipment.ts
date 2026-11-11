import type { AttackProfile, EquipmentDefinition } from '../core/battleTypes';
import type { AutoEquipWeights } from '../core/equipment';
import type { SaveMigrationContext } from '../core/saveData';
import type { ShopDefinition } from '../core/shop';

/**
 * 装備の定義（フェーズ2-4）。数値はすべて仮（バランス調整で変える）。
 * 画面に出す名前と説明は src/ui/text.ts に id で引けるようにまとめている。
 *
 * - 武器: 剣・弓・杖。剣と弓は攻撃力、杖は魔力を上げる。通常攻撃の届き方は武器で決まる（剣と杖は隣接マス、弓は 3〜5 マス）。
 * - 防具: 鎧・軽装・ローブ。主に最大 HP を上げる。ローブは最大 MP も上げる（防御力という能力値は作らない）。
 * - 装飾品: 小さいが性格のはっきりした効果。だれでも付けられる。
 * - 武器と防具は、種類ごとに3段階の強さ（tier 1〜3）。tier 0 は店で買えない特別な物（ボスからの初回の報酬）。
 * - price は買値（ゴールド）。売値はその半分（shop.sellPercent）。
 * - ジョブの基本値は、1段階目の武器と防具を付けた時に、装備が入る前（フェーズ2-3）の強さとほぼ同じになるようにしている（jobs.ts）。
 */

/** 武器の届き方 */
const swordAttack: AttackProfile = { kind: 'melee', maxHeightDiff: 2 };
const bowAttack: AttackProfile = { kind: 'ranged', minRange: 3, maxRange: 5, heightPerExtraRange: 2 };
const staffAttack: AttackProfile = { kind: 'melee', maxHeightDiff: 2 };

const sword = (id: string, tier: number, price: number, attack: number): EquipmentDefinition => ({
  id,
  slot: 'weapon',
  weaponType: 'sword',
  tier,
  price,
  stats: { attack },
  attack: swordAttack,
});
const bow = (id: string, tier: number, price: number, attack: number): EquipmentDefinition => ({
  id,
  slot: 'weapon',
  weaponType: 'bow',
  tier,
  price,
  stats: { attack },
  attack: bowAttack,
});
const staff = (id: string, tier: number, price: number, magic: number): EquipmentDefinition => ({
  id,
  slot: 'weapon',
  weaponType: 'staff',
  tier,
  price,
  stats: { magic },
  attack: staffAttack,
});

// ---- 武器（剣・弓: 攻撃力 +3 / +5 / +8、杖: 魔力 +3 / +5 / +7）----
export const sword1 = sword('sword-1', 1, 150, 3);
export const sword2 = sword('sword-2', 2, 320, 5);
export const sword3 = sword('sword-3', 3, 1000, 8);
export const bow1 = bow('bow-1', 1, 150, 3);
export const bow2 = bow('bow-2', 2, 320, 5);
export const bow3 = bow('bow-3', 3, 1000, 8);
export const staff1 = staff('staff-1', 1, 150, 3);
export const staff2 = staff('staff-2', 2, 320, 5);
export const staff3 = staff('staff-3', 3, 1000, 7);

// ---- 防具（鎧: 最大 HP +10 / +18 / +28、軽装: +7 / +12 / +18、ローブ: 最大 HP +4 / +7 / +10 と最大 MP +6 / +10 / +16）----
export const heavy1: EquipmentDefinition = { id: 'heavy-1', slot: 'armor', armorType: 'heavy', tier: 1, price: 130, stats: { maxHp: 10 } };
export const heavy2: EquipmentDefinition = { id: 'heavy-2', slot: 'armor', armorType: 'heavy', tier: 2, price: 280, stats: { maxHp: 18 } };
export const heavy3: EquipmentDefinition = { id: 'heavy-3', slot: 'armor', armorType: 'heavy', tier: 3, price: 850, stats: { maxHp: 28 } };
export const light1: EquipmentDefinition = { id: 'light-1', slot: 'armor', armorType: 'light', tier: 1, price: 130, stats: { maxHp: 7 } };
export const light2: EquipmentDefinition = { id: 'light-2', slot: 'armor', armorType: 'light', tier: 2, price: 280, stats: { maxHp: 12 } };
export const light3: EquipmentDefinition = { id: 'light-3', slot: 'armor', armorType: 'light', tier: 3, price: 850, stats: { maxHp: 18 } };
export const robe1: EquipmentDefinition = { id: 'robe-1', slot: 'armor', armorType: 'robe', tier: 1, price: 130, stats: { maxHp: 4, maxMp: 6 } };
export const robe2: EquipmentDefinition = { id: 'robe-2', slot: 'armor', armorType: 'robe', tier: 2, price: 280, stats: { maxHp: 7, maxMp: 10 } };
export const robe3: EquipmentDefinition = { id: 'robe-3', slot: 'armor', armorType: 'robe', tier: 3, price: 850, stats: { maxHp: 10, maxMp: 16 } };

// ---- 装飾品（だれでも付けられる。tier は品ぞろえの目安）----
/** 疾風の靴: 移動力 +1 */
export const swiftBoots: EquipmentDefinition = { id: 'swift-boots', slot: 'accessory', tier: 2, price: 600, stats: { move: 1 } };
/** 跳ね靴: ジャンプ力 +1 */
export const springBoots: EquipmentDefinition = { id: 'spring-boots', slot: 'accessory', tier: 1, price: 300, stats: { jump: 1 } };
/** 早駆けの指輪: 素早さ +1 */
export const quickRing: EquipmentDefinition = { id: 'quick-ring', slot: 'accessory', tier: 3, price: 700, stats: { speed: 1 } };
/** 魔力の首飾り: 最大 MP +10 */
export const manaCharm: EquipmentDefinition = { id: 'mana-charm', slot: 'accessory', tier: 1, price: 300, stats: { maxMp: 10 } };
/** 静寂よけの護符: 沈黙が付かない */
export const quietAmulet: EquipmentDefinition = {
  id: 'quiet-amulet',
  slot: 'accessory',
  tier: 1,
  price: 350,
  stats: {},
  effects: [{ kind: 'statusImmunity', status: 'silence' }],
};
/** 不動の腕輪: 詠唱中に受けるダメージの増加（1.25 倍）を打ち消す */
export const steadyBangle: EquipmentDefinition = {
  id: 'steady-bangle',
  slot: 'accessory',
  tier: 2,
  price: 450,
  stats: {},
  effects: [{ kind: 'steadyCasting' }],
};

// ---- 店では買えない物 ----
/** 主の宝冠: はじまりの遺跡のボス「祭壇の主」が付けている。初めてのクリアで必ず手に入る。最大 HP +10、最大 MP +12、魔力 +2 */
export const altarCrown: EquipmentDefinition = {
  id: 'altar-crown',
  slot: 'accessory',
  tier: 0,
  price: 1200,
  stats: { maxHp: 10, maxMp: 12, magic: 2 },
};

export const equipment: readonly EquipmentDefinition[] = [
  sword1,
  sword2,
  sword3,
  bow1,
  bow2,
  bow3,
  staff1,
  staff2,
  staff3,
  heavy1,
  heavy2,
  heavy3,
  light1,
  light2,
  light3,
  robe1,
  robe2,
  robe3,
  swiftBoots,
  springBoots,
  quickRing,
  manaCharm,
  quietAmulet,
  steadyBangle,
  altarCrown,
];

/** ジョブごとの最初の装備（はじめから遊ぶ時の5人と、古いセーブデータを直す時に配る物） */
export const starterEquipment: Readonly<Record<string, readonly string[]>> = {
  warrior: ['sword-1', 'heavy-1'],
  archer: ['bow-1', 'light-1'],
  mage: ['staff-1', 'robe-1'],
  healer: ['staff-1', 'robe-1'],
};

/** 最初の所持金 */
export const startingGold = 300;

/** 古いセーブデータを直す時に使う定義（core の saveData.ts に渡す） */
export const saveMigrationContext: SaveMigrationContext = { starterEquipment, startingGold, equipment };

/**
 * 店（拠点の「店」）。品ぞろえは進み具合で増える。
 * - 最初から: 1段階目のすべてと、2段階目の一部（剣・杖・鎧）、装飾品の一部
 * - はじまりの遺跡を初めてクリアすると: 2段階目がそろう（弓・軽装・ローブ）、装飾品の追加
 * - 訓練戦の「ふつう」に勝つと: 3段階目と、早駆けの指輪
 */
export const shop: ShopDefinition = {
  sellPercent: 50,
  entries: [
    ...['sword-1', 'bow-1', 'staff-1', 'heavy-1', 'light-1', 'robe-1'].map((itemId) => ({ itemId })),
    ...['sword-2', 'staff-2', 'heavy-2'].map((itemId) => ({ itemId })),
    ...['bow-2', 'light-2', 'robe-2'].map((itemId) => ({ itemId, requires: { kind: 'dungeonCleared' as const, dungeonId: 'ruins' } })),
    ...['sword-3', 'bow-3', 'staff-3', 'heavy-3', 'light-3', 'robe-3'].map((itemId) => ({
      itemId,
      requires: { kind: 'trainingWon' as const, tierId: 'normal' },
    })),
    ...['spring-boots', 'mana-charm', 'quiet-amulet'].map((itemId) => ({ itemId })),
    ...['swift-boots', 'steady-bangle'].map((itemId) => ({ itemId, requires: { kind: 'dungeonCleared' as const, dungeonId: 'ruins' } })),
    { itemId: 'quick-ring', requires: { kind: 'trainingWon' as const, tierId: 'normal' } },
  ],
};

/**
 * 「おまかせ」の点数の重み。能力値 1 あたり: 最大 HP・MP 1点、攻撃力・魔力 4点、素早さ 20点（成長の点数と同じ）、
 * 移動力 12点、ジャンプ力 6点。特別な効果は 1つ 6点。魔力と MP は、魔法を使えるユニットだけ数える（core の equipment.ts）
 */
export const autoEquipWeights: AutoEquipWeights = {
  stats: { maxHp: 1, maxMp: 1, attack: 4, magic: 4, speed: 20, move: 12, jump: 6 },
  effects: { statusImmunity: 6, steadyCasting: 6 },
};
