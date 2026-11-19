import type { BattleSite } from '../../../core/sortie';
import { stageMap } from '../../story/mapRows';
import { archer, warrior } from '../../jobs';
import { enemyUnit, kit } from '../enemyUnits';

/**
 * 序章の戦闘1「谷の外れの堰」（設計書「4. 章の表」の序章: 合わせ目3か所を壊す。短い手ほどき）。
 * 北の堰（高さ 3）に積み石の合わせ目が3つ。番兵3人が守る。番兵は HP が尽きると膝をつき、この戦闘では退場しない
 * （膝をついたまま最後まで残り、勝った後、崩れる堰を呆然と見る。戦闘で人は死なない決まり）。
 * 番兵をすべて退けても勝ちにはならない（堰を崩すまで続く）。
 * 東の崖の上（高さ 3〜4）から弓で撃ち下ろせる（札の「高い所から撃つ矢は、遠くまで届く」）。
 * 合わせ目を3つ壊すと勝利。3つ目を壊すと、西の涸れた谷に水が流れはじめる（水が別の谷へ）。
 * 初めて遊ぶ人が、説明を読まなくても勝てる強さにする（番兵は弱い。味方が倒れることはまずない）。
 * 堰の下から南へ、土の川床が続き（マップの中ほど）、マップの外の南に下流の三つの村がある（置き物の decor）。
 * 西の涸れた谷は、マップの外で西へ折れて、遠くの別の谷へ続く。勝った後、この谷に水が流れる（@変える 西の谷 水の流れる谷）。
 */
const map = stageMap('prologue-weir', [
  '0d 2w 2w 2w 2w 2w 2w 2w 4s',
  '0d 2w 2w 2w 2w 2w 2w 2w 4s',
  '0d 3s 3s 3s 3s 3s 3s 3s 4s',
  '0d 2d 2d 2d 2d 2d 2d 2d 3s',
  '0d 1g 1g 1g 1d 1g 1g 1g 3g',
  '0d 1g 0g 0g 0d 0g 0g 1g 2g',
  '0d 0g 0g 0d 0d 0d 0g 0g 2g',
  '1g 0g 0g 0d 0d 0d 0g 0g 1g',
  '1g 1g 0g 0d 0d 0d 0g 1g 1g',
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
        { ...enemyUnit({ id: 'weir-guard-1', job: warrior, x: 3, z: 3, level: 1, statBonus: { maxHp: -16, attack: -2 }, equipment: kit(warrior, 1) }), noRetire: true },
        { ...enemyUnit({ id: 'weir-guard-2', job: warrior, x: 5, z: 3, level: 1, statBonus: { maxHp: -16, attack: -2 }, equipment: kit(warrior, 1) }), noRetire: true },
        { ...enemyUnit({ id: 'weir-guard-3', job: archer, x: 7, z: 3, level: 1, statBonus: { maxHp: -12, attack: -2 }, equipment: kit(archer, 1) }), noRetire: true },
      ],
    },
  ],
  objects: [
    { id: 'weir-seam-1', kind: 'seam', x: 2, z: 2, hp: 22 },
    { id: 'weir-seam-2', kind: 'seam', x: 4, z: 2, hp: 22 },
    { id: 'weir-seam-3', kind: 'seam', x: 6, z: 2, hp: 22 },
  ],
  objectives: { victory: [{ kind: 'destroyObjects', unitIds: seams }], defeat: [{ kind: 'allDefeated' }], defeatAllWins: false },
  // 合わせ目が一つ割れるたびに、石の割れる音と水の音が少しずつ強まる（戦闘中の台詞はない。音だけの台本）
  events: [
    { id: 'weir-seam-crack-1', trigger: { kind: 'objectsBroken', unitIds: seams, count: 1 }, effects: [{ kind: 'dialogue', scriptId: 'prologueWeirCrack1' }] },
    { id: 'weir-seam-crack-2', trigger: { kind: 'objectsBroken', unitIds: seams, count: 2 }, effects: [{ kind: 'dialogue', scriptId: 'prologueWeirCrack2' }] },
    {
      id: 'weir-last-seam',
      trigger: { kind: 'objectsBroken', unitIds: seams, count: 3 },
      effects: [{ kind: 'terrain', tiles: westValley }, { kind: 'dialogue', scriptId: 'prologueWeirCrack3' }],
    },
  ],
  // 堰を積む男たち（戦わない）。東の崖の上から見ている
  bystanders: [
    { id: 'weir-worker-1', x: 8, z: 0, facing: 'south', look: 'worker' },
    { id: 'weir-worker-2', x: 8, z: 1, facing: 'west', look: 'clanD' },
  ],
  cast: { 番兵: 'weir-guard-2', 番兵A: 'weir-guard-1', 番兵B: 'weir-guard-3', 男たち: 'weir-worker-1', 男: 'weir-worker-2' },
  looks: { 'weir-guard-1': 'guard', 'weir-guard-2': 'guard', 'weir-guard-3': 'guardBow' },
  afterVictory: 'prologueWeirAfter',
  // マップの外の土地（地面・上流の湖・西の谷・下流の川筋と三つの村）。浮いて見える物を置かない（足もとに地面がある）
  decor: [
    { id: '土地', kind: '堰のまわりの土地', x: 4, z: 12 },
    { id: '村1', kind: '下流の村1', x: 4, z: 11 },
    { id: '村2', kind: '下流の村2', x: 4, z: 14 },
    { id: '村3', kind: '下流の村3', x: 4, z: 17 },
    { id: '西の谷', kind: '涸れた谷', x: -1, z: 5 },
  ],
  // 台本のカメラが向く、マップの外のマス（下流の村々・西の谷の先）
  lookouts: [
    { x: 4, z: 17 },
    { x: -6, z: 5 },
  ],
  // 隊員の名札に役目を添える（戦士ゴード、弓使いキリ、魔道士フェン、治癒師ノノ）
  roleTags: ['gord', 'kiri', 'fen', 'nono'],
  // 昼（勝った後の遠い谷の家々は「昼なのに、軒の灯が揺れている」）
  time: '昼',
  tutorial: [
    { id: 'weir-move', mode: 'main', point: { kind: 'reachToward', x: 4, z: 3 } },
    { id: 'weir-attack', mode: 'afterMove', point: { kind: 'button', button: 'attack' } },
    { id: 'weir-target', mode: 'targeting' },
    { id: 'weir-confirm', mode: 'confirm', point: { kind: 'button', button: 'confirm' } },
    { id: 'weir-facing', mode: 'facing', point: { kind: 'button', button: 'endTurn' } },
    // ゴードを前へ、キリを崖の上へ、フェンの火で合わせ目を割る。キリが崖の上に立った時、測り棒の札（署名「ユナ」。台本 prologueWeirTag）を出す
    { id: 'weir-gord', mode: 'main', unitId: 'gord', point: { kind: 'reachToward', x: 4, z: 3 } },
    { id: 'weir-kiri', mode: 'main', unitId: 'kiri', point: { kind: 'reachToward', x: 8, z: 3 } },
    { id: 'weir-high', mode: 'afterMove', unitId: 'kiri', minHeight: 3, scriptId: 'prologueWeirTag' },
    { id: 'weir-fen', mode: 'main', unitId: 'fen', point: { kind: 'button', button: 'ability' } },
  ],
};
