import type { MapDefinition } from '../../core/map';
import type { BattleSite } from '../../core/sortie';
import { archer, warrior } from '../jobs';
import { enemyUnit, kit } from './enemyUnits';

/**
 * 試しの場面の戦闘（物語の土台の仕組みを確かめる、仮の戦場。序章ができたら消す）。
 * 堰の積み石の合わせ目（対象物）を2つ壊すと勝利。番兵2体が合わせ目を守る。
 * どちらか1つ目を壊すと会話が入り、2つ目を壊すと（決着の直前に）会話の後で低いマスが水になる。
 * 8×7: 北の高さ 2 の堰の上に合わせ目、南が味方の開始位置。東西の低い谷（高さ 0）に水が流れ込む。
 */
const map: MapDefinition = {
  id: 'trial-weir',
  heights: [
    [3, 3, 3, 3, 3, 3, 3, 3],
    [2, 2, 2, 2, 2, 2, 2, 2],
    [0, 1, 1, 1, 1, 1, 1, 0],
    [0, 1, 1, 1, 1, 1, 1, 0],
    [0, 0, 1, 1, 1, 1, 0, 0],
    [0, 0, 1, 1, 1, 1, 0, 0],
    [0, 0, 0, 1, 1, 0, 0, 0],
  ],
  terrain: ['ssssssss', 'ssssssss', 'dggggggd', 'dggggggd', 'ddggggdd', 'ddggggdd', 'dddggddd'],
  legend: { s: 'stone', g: 'grass', d: 'dirt' },
};

const seams = ['trial-seam-1', 'trial-seam-2'];
/** 水になる低いマス（谷） */
const valley = map.heights.flatMap((row, z) => row.flatMap((h, x) => (h === 0 ? [{ x, z, terrain: 'water' as const }] : [])));

export const trialWeirBattle: BattleSite = {
  id: 'trial-weir',
  map,
  playerSlots: [
    { x: 3, z: 6, facing: 'north' },
    { x: 4, z: 6, facing: 'north' },
    { x: 2, z: 5, facing: 'north' },
    { x: 5, z: 5, facing: 'north' },
    { x: 3, z: 5, facing: 'north' },
  ],
  tiers: [
    {
      id: 'main',
      reward: { gold: 60, loot: [] },
      units: [
        // 倒れない番兵（序章に足りない仕組みの確かめ）: HP は 1 より下がらない
        { ...enemyUnit({ id: 'trial-guard-1', job: warrior, x: 2, z: 2, level: 1, statBonus: { maxHp: -20 }, equipment: kit(warrior, 1) }), minHp: 1 },
        enemyUnit({ id: 'trial-guard-2', job: archer, x: 5, z: 1, level: 1, statBonus: { maxHp: -16 }, equipment: kit(archer, 1) }),
      ],
    },
  ],
  objects: [
    { id: 'trial-seam-1', kind: 'seam', x: 2, z: 1, hp: 24 },
    { id: 'trial-seam-2', kind: 'seam', x: 5, z: 2, hp: 24 },
  ],
  objectives: { victory: [{ kind: 'destroyObjects', unitIds: ['trial-seam-1', 'trial-seam-2'] }], defeat: [{ kind: 'allDefeated' }] },
  // 序章に足りない仕組みの確かめ: 背景の人（堰の上の見物人）、人物の名前、見た目、戦闘の後の台本、手ほどき
  bystanders: [{ id: 'trial-watcher', x: 7, z: 0, facing: 'south', look: 'worker' }],
  cast: { 番兵: 'trial-guard-1', 見物人: 'trial-watcher' },
  looks: { 'trial-guard-1': 'guard', 'trial-guard-2': 'guard' },
  afterVictory: 'trialAfterVictory',
  tutorial: [
    { id: 'trial-move', mode: 'main', point: { kind: 'reachToward', x: 3, z: 2 } },
    { id: 'trial-attack', mode: 'afterMove', point: { kind: 'button', button: 'attack' } },
    { id: 'trial-target', mode: 'targeting' },
    { id: 'trial-confirm', mode: 'confirm', point: { kind: 'button', button: 'confirm' } },
    { id: 'trial-facing', mode: 'facing', point: { kind: 'button', button: 'endTurn' } },
  ],
  events: [
    { id: 'trial-first-seam', trigger: { kind: 'objectsBroken', unitIds: seams, count: 1 }, effects: [{ kind: 'dialogue', scriptId: 'trialFirstSeam' }] },
    {
      id: 'trial-second-seam',
      trigger: { kind: 'objectsBroken', unitIds: seams, count: 2 },
      effects: [{ kind: 'dialogue', scriptId: 'trialWeirBreaks' }, { kind: 'terrain', tiles: valley }],
    },
  ],
};
