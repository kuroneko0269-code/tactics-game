import type { JobDefinition } from '../core/battleTypes';

/**
 * ジョブの定義。数値はすべて仮（バランス調整で変える）。
 * 画面に出すジョブ名は src/ui/text.ts に id で引けるようにまとめている。
 * maxMp は MP の最大値、magic は魔力（魔法のダメージと回復量の元）。
 */

/** 戦士: 隣接マスに近接攻撃。高さの差が 2 以内の相手だけ攻撃できる。HP と攻撃力が高い */
export const warrior: JobDefinition = {
  id: 'warrior',
  stats: { maxHp: 80, attack: 14, speed: 6, move: 4, jump: 2, maxMp: 0, magic: 0 },
  attack: { kind: 'melee', maxHeightDiff: 2 },
};

/** 弓使い: 射程 3〜5 マス。相手より高い位置にいると、高さの差 2 ごとに射程が 1 伸びる。隣接マスは撃てない */
export const archer: JobDefinition = {
  id: 'archer',
  stats: { maxHp: 56, attack: 11, speed: 7, move: 3, jump: 2, maxMp: 0, magic: 0 },
  attack: { kind: 'ranged', minRange: 3, maxRange: 5, heightPerExtraRange: 2 },
};

/** 魔術師: HP が低く、魔力が高い。杖の通常攻撃（隣接マス）は弱い。「炎」と「風」を使う */
export const mage: JobDefinition = {
  id: 'mage',
  stats: { maxHp: 44, attack: 6, speed: 6, move: 3, jump: 2, maxMp: 36, magic: 12 },
  attack: { kind: 'melee', maxHeightDiff: 2 },
  spellIds: ['fire', 'wind'],
};

/** 癒し手: HP は低め。杖の通常攻撃（隣接マス）は弱い。「癒し」を使う */
export const healer: JobDefinition = {
  id: 'healer',
  stats: { maxHp: 50, attack: 6, speed: 6, move: 3, jump: 2, maxMp: 40, magic: 12 },
  attack: { kind: 'melee', maxHeightDiff: 2 },
  spellIds: ['heal'],
};

export const jobs: readonly JobDefinition[] = [warrior, archer, mage, healer];
