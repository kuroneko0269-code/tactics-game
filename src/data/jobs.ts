import type { JobDefinition } from '../core/battleTypes';

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
 * - unlock: 解放条件（ほかのジョブのレベル）。今は4つとも最初から就ける
 */

/** 戦士「武技」: 隣接マスに近接攻撃。高さの差が 2 以内の相手だけ攻撃できる。HP と攻撃力が高く、HP と攻撃力が伸びやすい */
export const warrior: JobDefinition = {
  id: 'warrior',
  stats: { maxHp: 62, attack: 11, speed: 6, move: 4, jump: 2, maxMp: 0, magic: 0 },
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

/** 魔術師「攻撃魔法」: HP が低く、魔力が高い。杖の通常攻撃（隣接マス）は弱い。魔力と MP が伸びやすい */
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
  ],
  passives: [
    { id: 'magicShell', jpCost: 180, jobLevel: 2 },
    { id: 'quickCast', jpCost: 280, jobLevel: 4 },
  ],
  growth: { maxHp: 190, maxMp: 120, attack: 30, magic: 70, speed: 4 },
  unlock: [],
};

/** 癒し手「回復魔法」: HP は低め。杖の通常攻撃（隣接マス）は弱い。MP と魔力と HP が伸びやすい */
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
  ],
  passives: [
    { id: 'meditate', jpCost: 150 },
    { id: 'thrift', jpCost: 220, jobLevel: 3 },
  ],
  growth: { maxHp: 250, maxMp: 100, attack: 30, magic: 55, speed: 4 },
  unlock: [],
};

export const jobs: readonly JobDefinition[] = [warrior, archer, mage, healer];
