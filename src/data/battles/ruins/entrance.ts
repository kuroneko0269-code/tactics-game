import type { MapDefinition } from '../../../core/map';
import type { BattleSite } from '../../../core/sortie';
import { archer, mage, warrior } from '../../jobs';
import { enemyUnit } from '../enemyUnits';

/**
 * ダンジョン「はじまりの遺跡」第1戦「入口」: 8×8 の小さめのマップ。勝利は敵の全滅。敵は4体（レベル 1、受動的なアビリティなし）。
 * 最初に遊ぶ戦闘として、高低差の使い方が自然に分かる地形にした:
 * - 奥（敵の側）は高さ 2 の石段で、敵の弓使いと魔術師が上から狙ってくる。
 * - 手前の西に高さ 2 の小さな丘があり、味方もそこに登ると高さの有利（ダメージ +10%、弓の射程 +1）を得られる。
 * - 中央は低い通路で、石段の両脇に高さ 1 の踏み台があり、そこから石段の上へ登れる。
 */
const map: MapDefinition = {
  id: 'ruins-entrance',
  heights: [
    [2, 2, 2, 1, 1, 2, 2, 2],
    [2, 2, 1, 0, 0, 1, 2, 2],
    [1, 1, 0, 0, 0, 0, 1, 1],
    [0, 0, 0, 0, 0, 0, 0, 0],
    [0, 0, 1, 0, 0, 0, 0, 0],
    [0, 1, 2, 1, 0, 0, 1, 0],
    [0, 0, 1, 0, 0, 0, 0, 0],
    [0, 0, 0, 0, 0, 0, 0, 0],
  ],
  terrain: [
    'ssssssss',
    'sssddsss',
    'ssddddss',
    'gddddddg',
    'ggsdddgg',
    'gssgdgsg',
    'ggsgdggg',
    'gggddggg',
  ],
  legend: { g: 'grass', d: 'dirt', s: 'stone' },
};

export const ruinsEntrance: BattleSite = {
  id: 'ruins-entrance',
  map,
  playerSlots: [
    { x: 3, z: 6, facing: 'north' },
    { x: 4, z: 6, facing: 'north' },
    { x: 5, z: 7, facing: 'north' },
    { x: 2, z: 7, facing: 'north' },
    { x: 4, z: 7, facing: 'north' },
  ],
  tiers: [
    {
      id: 'main',
      units: [
        enemyUnit({ id: 'r1-warrior-1', job: warrior, x: 3, z: 2, level: 1 }),
        enemyUnit({ id: 'r1-archer-1', job: archer, x: 1, z: 0, level: 1 }),
        enemyUnit({ id: 'r1-warrior-2', job: warrior, x: 4, z: 2, level: 1 }),
        enemyUnit({ id: 'r1-mage-1', job: mage, x: 6, z: 0, level: 1, abilities: ['wind'] }),
      ],
    },
  ],
  objectives: { victory: [{ kind: 'defeatAll' }], defeat: [{ kind: 'allDefeated' }] },
  events: [{ id: 'r1-intro', trigger: { kind: 'turn', turn: 0 }, effects: [{ kind: 'message', messageId: 'ruinsEntranceIntro' }] }],
};
