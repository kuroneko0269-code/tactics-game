import type { BattleSite } from '../../../core/sortie';
import { stageMap } from '../../story/mapRows';
import { archer, warrior } from '../../jobs';
import { enemyUnit, kit } from '../enemyUnits';

/**
 * 序章の戦闘1「谷の外れの堰」（設計書「4. 章の表」の序章: 合わせ目3か所を壊す。短い手ほどき）。
 * 北の堰（高さ 3）に積み石の合わせ目が3つ。番兵3人が守る。番兵は倒れない（HP は 1 より下がらない。勝った後、崩れる堰を呆然と見る）。
 * 東の崖の上（高さ 3〜4）から弓で撃ち下ろせる（札の「高い所から撃つ矢は、遠くまで届く」）。
 * 合わせ目を3つ壊すと勝利。3つ目を壊すと、西の涸れた谷に水が流れはじめる（水が別の谷へ）。
 * 初めて遊ぶ人が、説明を読まなくても勝てる強さにする（番兵は弱い。味方が倒れることはまずない）。
 */
const map = stageMap('prologue-weir', [
  '0d 2w 2w 2w 2w 2w 2w 2w 4s',
  '0d 2w 2w 2w 2w 2w 2w 2w 4s',
  '0d 3s 3s 3s 3s 3s 3s 3s 4s',
  '0d 2d 2d 2d 2d 2d 2d 2d 3s',
  '0d 1g 1g 1g 1g 1g 1g 1g 3g',
  '0d 1g 0g 0g 0g 0g 0g 1g 2g',
  '0d 0g 0g 0d 0d 0d 0g 0g 2g',
  '1g 0g 0g 0d 0d 0d 0g 0g 1g',
  '1g 1g 0g 0g 0g 0g 0g 1g 1g',
]);

const seams = ['weir-seam-1', 'weir-seam-2', 'weir-seam-3'];
/** 水が流れこむ、西の涸れた谷 */
const westValley = map.heights.flatMap((row, z) => row.flatMap((h, x) => (x === 0 && h === 0 ? [{ x, z, terrain: 'water' as const }] : [])));

export const weirBattle: BattleSite = {
  id: 'prologue-weir',
  map,
  playerSlots: [
    { x: 4, z: 6, facing: 'north' },
    { x: 3, z: 5, facing: 'north' },
    { x: 8, z: 5, facing: 'north' },
    { x: 5, z: 7, facing: 'north' },
    { x: 4, z: 8, facing: 'north' },
  ],
  tiers: [
    {
      id: 'main',
      units: [
        { ...enemyUnit({ id: 'weir-guard-1', job: warrior, x: 3, z: 3, level: 1, statBonus: { maxHp: -16, attack: -2 }, equipment: kit(warrior, 1) }), minHp: 1 },
        { ...enemyUnit({ id: 'weir-guard-2', job: warrior, x: 5, z: 3, level: 1, statBonus: { maxHp: -16, attack: -2 }, equipment: kit(warrior, 1) }), minHp: 1 },
        { ...enemyUnit({ id: 'weir-guard-3', job: archer, x: 7, z: 3, level: 1, statBonus: { maxHp: -12, attack: -2 }, equipment: kit(archer, 1) }), minHp: 1 },
      ],
    },
  ],
  objects: [
    { id: 'weir-seam-1', kind: 'seam', x: 2, z: 2, hp: 22 },
    { id: 'weir-seam-2', kind: 'seam', x: 4, z: 2, hp: 22 },
    { id: 'weir-seam-3', kind: 'seam', x: 6, z: 2, hp: 22 },
  ],
  objectives: { victory: [{ kind: 'destroyObjects', unitIds: seams }], defeat: [{ kind: 'allDefeated' }] },
  events: [
    { id: 'weir-last-seam', trigger: { kind: 'objectsBroken', unitIds: seams, count: 3 }, effects: [{ kind: 'terrain', tiles: westValley }] },
  ],
  // 堰を積む男たち（戦わない）。東の崖の上から見ている
  bystanders: [
    { id: 'weir-worker-1', x: 8, z: 0, facing: 'south', look: 'worker' },
    { id: 'weir-worker-2', x: 8, z: 1, facing: 'west', look: 'clanD' },
  ],
  cast: { 番兵: 'weir-guard-2', 番兵A: 'weir-guard-1', 番兵B: 'weir-guard-3', 男たち: 'weir-worker-1', 男: 'weir-worker-2' },
  looks: { 'weir-guard-1': 'guard', 'weir-guard-2': 'guard', 'weir-guard-3': 'guardBow' },
  afterVictory: 'prologueWeirAfter',
  tutorial: [
    { id: 'weir-move', mode: 'main', point: { kind: 'reachToward', x: 4, z: 3 } },
    { id: 'weir-attack', mode: 'afterMove', point: { kind: 'button', button: 'attack' } },
    { id: 'weir-target', mode: 'targeting' },
    { id: 'weir-confirm', mode: 'confirm', point: { kind: 'button', button: 'confirm' } },
    { id: 'weir-facing', mode: 'facing', point: { kind: 'button', button: 'endTurn' } },
    { id: 'weir-high', mode: 'main', turn: 2 },
  ],
};
