import type { JobDefinition } from '../core/battleTypes';
import { characterIds } from './characters';

/**
 * ジョブの定義。数値はすべて仮（バランス調整で変える）。
 * 画面に出すジョブ名とコマンド名は src/ui/text.ts に id で引けるようにまとめている。
 *
 * - stats: 基本の能力値。ユニットの能力値は、これに成長値と装備の値を足したもの。maxMp は MP の最大値、magic は魔力。
 *   フェーズ2-4 で、1段階目の武器と防具を付けた時に、それまでの値とほぼ同じになるよう下げた（例: 戦士の HP 72 → 62 + 鎧 10）
 * - attack: 通常攻撃の届き方。戦闘では、装備している武器の届き方を使う（ここは装備を指定しないテスト用）
 * - weaponTypes / armorTypes: 装備できる武器と防具の種類（装飾品はだれでも付けられる）
 * - abilities: 行動アビリティの一覧（コマンド）。jpCost はそのジョブの JP で習得する時の消費量。
 *   starter はそのジョブに就いた時点で習得済み。jobLevel は習得に必要なそのジョブのレベル（省くと 1）
 * - passives: 受動的なアビリティ（リアクション・サポート・ムーブ。定義は passives.ts）の一覧。習得の仕方は行動アビリティと同じ。
 *   習得すると、ジョブを問わず付けられる。ジョブのレベルを上げる意味を作るため、jobLevel が必要なものを混ぜている
 * - growth: 成長率。レベルが 1 上がるごとに増える成長値（能力値の 1/100 単位。300 なら HP 3.0）。
 *   差は控えめにしている（育て方を気にしなくても困らず、こだわると違いが分かる程度）
 * - unlock: 解放条件（ほかのジョブのレベル）。最初の4つ（戦士・弓使い・魔道士・治癒師）は、だれでも最初から就ける
 * - eligibility: 就ける対象（フェーズ2-6）。省くとだれでも。characters なら特定の人物だけ（専用ジョブ）、enemy なら敵専用
 */

/** 戦士「武技」: 隣接マスに近接攻撃。高さの差が 2 以内の相手だけ攻撃できる。HP と攻撃力が高く、HP と攻撃力が伸びやすい */
export const warrior: JobDefinition = {
  id: 'warrior',
  stats: { maxHp: 60, attack: 10, speed: 6, move: 4, jump: 2, maxMp: 0, magic: 0 },
  attack: { kind: 'melee', maxHeightDiff: 2 },
  weaponTypes: ['sword'],
  armorTypes: ['heavy'],
  abilities: [
    { id: 'powerStrike', jpCost: 100 },
    { id: 'knockback', jpCost: 130 },
  ],
  passives: [
    { id: 'counter', jpCost: 200, jobLevel: 3 },
    { id: 'heavyArmor', jpCost: 250, jobLevel: 4 },
    { id: 'quickStep', jpCost: 180 },
  ],
  growth: { maxHp: 300, maxMp: 40, attack: 60, magic: 20, speed: 4 },
  unlock: [],
};

/** 弓使い「弓術」: 射程 3〜5 マス。相手より高い位置にいると、高さの差 2 ごとに射程が 1 伸びる。攻撃力と素早さが伸びやすい */
export const archer: JobDefinition = {
  id: 'archer',
  stats: { maxHp: 43, attack: 8, speed: 7, move: 3, jump: 2, maxMp: 0, magic: 0 },
  attack: { kind: 'ranged', minRange: 3, maxRange: 5, heightPerExtraRange: 2 },
  weaponTypes: ['bow'],
  armorTypes: ['light'],
  abilities: [
    { id: 'aimedShot', jpCost: 120 },
    { id: 'slowArrow', jpCost: 100 },
  ],
  passives: [
    { id: 'evade', jpCost: 180, jobLevel: 2 },
    { id: 'focus', jpCost: 200, jobLevel: 3 },
    { id: 'lightFoot', jpCost: 150 },
  ],
  growth: { maxHp: 230, maxMp: 40, attack: 55, magic: 25, speed: 8 },
  unlock: [],
};

/** 魔道士「攻撃魔法」: HP が低く、魔力が高い。杖の通常攻撃（隣接マス）は弱い。魔力と MP が伸びやすい */
export const mage: JobDefinition = {
  id: 'mage',
  stats: { maxHp: 36, attack: 6, speed: 6, move: 3, jump: 2, maxMp: 30, magic: 9 },
  attack: { kind: 'melee', maxHeightDiff: 2 },
  weaponTypes: ['staff'],
  armorTypes: ['robe'],
  abilities: [
    { id: 'wind', jpCost: 0, starter: true },
    { id: 'fire', jpCost: 120 },
    { id: 'thunder', jpCost: 170 },
    { id: 'seal', jpCost: 140 },
    { id: 'ice', jpCost: 130 },
    { id: 'earth', jpCost: 150, jobLevel: 2 },
  ],
  passives: [
    { id: 'magicShell', jpCost: 180, jobLevel: 2 },
    { id: 'quickCast', jpCost: 280, jobLevel: 4 },
  ],
  growth: { maxHp: 190, maxMp: 120, attack: 30, magic: 70, speed: 4 },
  unlock: [],
};

/** 治癒師「回復魔法」: HP は低め。杖の通常攻撃（隣接マス）は弱い。MP と魔力と HP が伸びやすい */
export const healer: JobDefinition = {
  id: 'healer',
  stats: { maxHp: 41, attack: 6, speed: 6, move: 3, jump: 2, maxMp: 34, magic: 9 },
  attack: { kind: 'melee', maxHeightDiff: 2 },
  weaponTypes: ['staff'],
  armorTypes: ['robe'],
  abilities: [
    { id: 'heal', jpCost: 0, starter: true },
    { id: 'bigHeal', jpCost: 150 },
    { id: 'protectPrayer', jpCost: 160 },
    { id: 'revive', jpCost: 200 },
  ],
  passives: [
    { id: 'meditate', jpCost: 150 },
    { id: 'thrift', jpCost: 220, jobLevel: 3 },
  ],
  growth: { maxHp: 250, maxMp: 100, attack: 30, magic: 55, speed: 4 },
  unlock: [],
};

/**
 * 時守（トウマの専用ジョブ。フェーズ2-6）「時の業」: 前に出て剣で戦い、時を扱う業を持つ。装備は剣と鎧。
 * 能力値は戦士に近く、素早さが少し高い（7）。業のために少しの MP を持つ
 */
export const timekeeper: JobDefinition = {
  id: 'timekeeper',
  eligibility: { kind: 'characters', characterIds: [characterIds.touma] },
  stats: { maxHp: 64, attack: 10, speed: 6, move: 4, jump: 2, maxMp: 12, magic: 3 },
  attack: { kind: 'melee', maxHeightDiff: 2 },
  weaponTypes: ['sword'],
  armorTypes: ['heavy'],
  abilities: [
    { id: 'sweep', jpCost: 0, starter: true },
    { id: 'rewind', jpCost: 120 },
    { id: 'gateSwap', jpCost: 100, jobLevel: 2 },
    { id: 'timeDelay', jpCost: 160, jobLevel: 3 },
  ],
  passives: [
    { id: 'endure', jpCost: 200, jobLevel: 3 },
    { id: 'timekeeperWisdom', jpCost: 180, jobLevel: 2 },
  ],
  growth: { maxHp: 270, maxMp: 50, attack: 55, magic: 25, speed: 15 },
  unlock: [],
};

/**
 * 騎士「破壊術」（フェーズ2-6。戦士 Lv 2 で解放）: 敵を弱らせる役。剣と鎧。
 * 4つの破壊は武器による攻撃で、ダメージは通常攻撃より低く（60%）、当たると状態変化を付ける
 */
export const knight: JobDefinition = {
  id: 'knight',
  stats: { maxHp: 64, attack: 10, speed: 6, move: 3, jump: 2, maxMp: 0, magic: 0 },
  attack: { kind: 'melee', maxHeightDiff: 2 },
  weaponTypes: ['sword'],
  armorTypes: ['heavy'],
  abilities: [
    { id: 'breakWeapon', jpCost: 100 },
    { id: 'breakArmor', jpCost: 120 },
    { id: 'breakMagic', jpCost: 120 },
    { id: 'breakSpeed', jpCost: 150, jobLevel: 2 },
  ],
  passives: [
    { id: 'cover', jpCost: 180, jobLevel: 2 },
    { id: 'backGuard', jpCost: 220, jobLevel: 3 },
  ],
  growth: { maxHp: 300, maxMp: 30, attack: 55, magic: 15, speed: 4 },
  unlock: [{ jobId: 'warrior', level: 2 }],
};

/**
 * 格闘家「拳法」（フェーズ2-6。戦士 Lv 3 で解放）: 素手で戦い、自分で立て直せる役。武器は持てず、防具は軽装。
 * 素手の時に攻撃力 +6（unarmedBonus）
 */
export const monk: JobDefinition = {
  id: 'monk',
  unarmedBonus: { attack: 6 },
  stats: { maxHp: 60, attack: 8, speed: 6, move: 4, jump: 3, maxMp: 12, magic: 4 },
  attack: { kind: 'melee', maxHeightDiff: 2 },
  weaponTypes: [],
  armorTypes: ['light'],
  abilities: [
    { id: 'doubleStrike', jpCost: 120 },
    { id: 'chakra', jpCost: 100 },
    { id: 'shout', jpCost: 100 },
    { id: 'earthWave', jpCost: 150, jobLevel: 2 },
  ],
  passives: [
    { id: 'parry', jpCost: 160, jobLevel: 2 },
    { id: 'ironFist', jpCost: 200, jobLevel: 3 },
  ],
  growth: { maxHp: 280, maxMp: 40, attack: 60, magic: 20, speed: 6 },
  unlock: [{ jobId: 'warrior', level: 3 }],
};

/**
 * 盗賊「盗術」（フェーズ2-6。弓使い Lv 2 で解放）: 背面を取り、物を奪う役。短剣と軽装（短剣は素早さ +1）
 */
export const thief: JobDefinition = {
  id: 'thief',
  stats: { maxHp: 56, attack: 10, speed: 6, move: 4, jump: 3, maxMp: 0, magic: 0 },
  attack: { kind: 'melee', maxHeightDiff: 2 },
  weaponTypes: ['dagger'],
  armorTypes: ['light'],
  abilities: [
    { id: 'stealGold', jpCost: 80 },
    { id: 'blindStrike', jpCost: 100 },
    { id: 'backstab', jpCost: 130 },
    { id: 'stealGear', jpCost: 150, jobLevel: 2 },
  ],
  passives: [
    { id: 'flee', jpCost: 150 },
    { id: 'swiftFeet', jpCost: 250, jobLevel: 3 },
  ],
  growth: { maxHp: 240, maxMp: 30, attack: 55, magic: 20, speed: 8 },
  unlock: [{ jobId: 'archer', level: 2 }],
};

/** 時魔道士「時魔法」（フェーズ2-6。魔道士 Lv 2 で解放）: 行動順を操作する。杖とローブ */
export const timeMage: JobDefinition = {
  id: 'timeMage',
  stats: { maxHp: 42, attack: 6, speed: 7, move: 3, jump: 2, maxMp: 44, magic: 9 },
  attack: { kind: 'melee', maxHeightDiff: 2 },
  weaponTypes: ['staff'],
  armorTypes: ['robe'],
  abilities: [
    { id: 'haste', jpCost: 0, starter: true },
    { id: 'decelerate', jpCost: 120 },
    { id: 'stop', jpCost: 200, jobLevel: 3 },
    { id: 'quicken', jpCost: 250, jobLevel: 3 },
  ],
  passives: [
    { id: 'criticalHaste', jpCost: 180, jobLevel: 2 },
    { id: 'teleport', jpCost: 300, jobLevel: 4 },
  ],
  growth: { maxHp: 190, maxMp: 110, attack: 30, magic: 60, speed: 6 },
  unlock: [{ jobId: 'mage', level: 2 }],
};

/** 召喚士「召喚」（フェーズ2-6。魔道士 Lv 3 と時魔道士 Lv 3 で解放）: 広い範囲に、敵と味方を区別して効かせる。杖とローブ */
export const summoner: JobDefinition = {
  id: 'summoner',
  stats: { maxHp: 36, attack: 5, speed: 6, move: 3, jump: 2, maxMp: 44, magic: 10 },
  attack: { kind: 'melee', maxHeightDiff: 2 },
  weaponTypes: ['staff'],
  armorTypes: ['robe'],
  abilities: [
    { id: 'fireSpirit', jpCost: 0, starter: true },
    { id: 'healSpirit', jpCost: 150 },
    { id: 'iceSpirit', jpCost: 180 },
    { id: 'thunderSpirit', jpCost: 200, jobLevel: 2 },
    { id: 'earthSpirit', jpCost: 220, jobLevel: 3 },
  ],
  passives: [{ id: 'spiritWard', jpCost: 200, jobLevel: 2 }],
  growth: { maxHp: 180, maxMp: 130, attack: 25, magic: 70, speed: 4 },
  unlock: [
    { jobId: 'mage', level: 3 },
    { jobId: 'timeMage', level: 3 },
  ],
};

/** 魔法剣士「魔法剣」（フェーズ2-6。戦士 Lv 3 と魔道士 Lv 3 で解放）: 物理と魔法の両立。剣と軽装 */
export const magicKnight: JobDefinition = {
  id: 'magicKnight',
  stats: { maxHp: 54, attack: 9, speed: 6, move: 4, jump: 2, maxMp: 20, magic: 7 },
  attack: { kind: 'melee', maxHeightDiff: 2 },
  weaponTypes: ['sword'],
  armorTypes: ['light'],
  abilities: [
    { id: 'fireBlade', jpCost: 100 },
    { id: 'iceBlade', jpCost: 100 },
    { id: 'thunderBlade', jpCost: 120 },
    { id: 'sealBlade', jpCost: 150, jobLevel: 2 },
  ],
  passives: [{ id: 'manaBlade', jpCost: 220, jobLevel: 3 }],
  growth: { maxHp: 250, maxMp: 70, attack: 50, magic: 45, speed: 4 },
  unlock: [
    { jobId: 'warrior', level: 3 },
    { jobId: 'mage', level: 3 },
  ],
};

export const jobs: readonly JobDefinition[] = [
  warrior,
  archer,
  mage,
  healer,
  timekeeper,
  knight,
  monk,
  thief,
  timeMage,
  summoner,
  magicKnight,
];
