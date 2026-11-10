import type { JobDefinition } from '../core/battleTypes';

/**
 * ジョブの定義。数値はすべて仮（バランス調整で変える）。
 * 画面に出すジョブ名とコマンド名は src/ui/text.ts に id で引けるようにまとめている。
 *
 * - stats: 基本の能力値。ユニットの能力値は、これに成長値を足したもの。maxMp は MP の最大値、magic は魔力
 * - weapon: 武器の種類（装備が入るまでは、ジョブごとに固定）
 * - abilities: 行動アビリティの一覧（コマンド）。jpCost はそのジョブの JP で習得する時の消費量。
 *   starter はそのジョブに就いた時点で習得済み
 * - growth: 成長率。レベルが 1 上がるごとに増える成長値（能力値の 1/100 単位。300 なら HP 3.0）。
 *   差は控えめにしている（育て方を気にしなくても困らず、こだわると違いが分かる程度）
 * - unlock: 解放条件（ほかのジョブのレベル）。今は4つとも最初から就ける
 */

/** 戦士「武技」: 隣接マスに近接攻撃。高さの差が 2 以内の相手だけ攻撃できる。HP と攻撃力が高く、HP と攻撃力が伸びやすい */
export const warrior: JobDefinition = {
  id: 'warrior',
  stats: { maxHp: 72, attack: 14, speed: 6, move: 4, jump: 2, maxMp: 0, magic: 0 },
  attack: { kind: 'melee', maxHeightDiff: 2 },
  weapon: 'sword',
  abilities: [{ id: 'powerStrike', jpCost: 100 }],
  growth: { maxHp: 300, maxMp: 40, attack: 60, magic: 20, speed: 4 },
  unlock: [],
};

/** 弓使い「弓術」: 射程 3〜5 マス。相手より高い位置にいると、高さの差 2 ごとに射程が 1 伸びる。攻撃力と素早さが伸びやすい */
export const archer: JobDefinition = {
  id: 'archer',
  stats: { maxHp: 50, attack: 11, speed: 7, move: 3, jump: 2, maxMp: 0, magic: 0 },
  attack: { kind: 'ranged', minRange: 3, maxRange: 5, heightPerExtraRange: 2 },
  weapon: 'bow',
  abilities: [{ id: 'aimedShot', jpCost: 120 }],
  growth: { maxHp: 230, maxMp: 40, attack: 55, magic: 25, speed: 8 },
  unlock: [],
};

/** 魔術師「攻撃魔法」: HP が低く、魔力が高い。杖の通常攻撃（隣接マス）は弱い。魔力と MP が伸びやすい */
export const mage: JobDefinition = {
  id: 'mage',
  stats: { maxHp: 40, attack: 6, speed: 6, move: 3, jump: 2, maxMp: 36, magic: 12 },
  attack: { kind: 'melee', maxHeightDiff: 2 },
  weapon: 'staff',
  abilities: [
    { id: 'wind', jpCost: 0, starter: true },
    { id: 'fire', jpCost: 120 },
    { id: 'thunder', jpCost: 170 },
  ],
  growth: { maxHp: 190, maxMp: 120, attack: 30, magic: 70, speed: 4 },
  unlock: [],
};

/** 癒し手「回復魔法」: HP は低め。杖の通常攻撃（隣接マス）は弱い。MP と魔力と HP が伸びやすい */
export const healer: JobDefinition = {
  id: 'healer',
  stats: { maxHp: 45, attack: 6, speed: 6, move: 3, jump: 2, maxMp: 40, magic: 12 },
  attack: { kind: 'melee', maxHeightDiff: 2 },
  weapon: 'staff',
  abilities: [
    { id: 'heal', jpCost: 0, starter: true },
    { id: 'bigHeal', jpCost: 150 },
  ],
  growth: { maxHp: 250, maxMp: 100, attack: 30, magic: 55, speed: 4 },
  unlock: [],
};

export const jobs: readonly JobDefinition[] = [warrior, archer, mage, healer];
