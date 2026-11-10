import type { JobDefinition } from '../core/battleTypes';

/**
 * ジョブの定義。数値はすべて仮（バランス調整で変える）。
 * 画面に出すジョブ名は src/ui/text.ts に id で引けるようにまとめている。
 */

/** 戦士: 隣接マスに近接攻撃。高さの差が 2 以内の相手だけ攻撃できる。HP と攻撃力が高い */
export const warrior: JobDefinition = {
  id: 'warrior',
  stats: { maxHp: 80, attack: 14, speed: 6, move: 4, jump: 2 },
  attack: { kind: 'melee', maxHeightDiff: 2 },
};

/** 弓使い: 射程 3〜5 マス。相手より高い位置にいると、高さの差 2 ごとに射程が 1 伸びる。隣接マスは撃てない */
export const archer: JobDefinition = {
  id: 'archer',
  stats: { maxHp: 56, attack: 11, speed: 7, move: 3, jump: 2 },
  attack: { kind: 'ranged', minRange: 3, maxRange: 5, heightPerExtraRange: 2 },
};

export const jobs: readonly JobDefinition[] = [warrior, archer];
