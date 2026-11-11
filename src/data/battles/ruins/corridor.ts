import type { MapDefinition } from '../../../core/map';
import type { BattleSite } from '../../../core/sortie';
import { archer, healer, mage, warrior } from '../../jobs';
import { enemyUnit, kit } from '../enemyUnits';

/**
 * 第2戦「崩れた回廊」: 7×14 の細長いマップ。勝利は、味方のだれかが奥（北の端）の扉のマスに到達すること。
 * - 高さ 3 の回廊が南北に通る。回廊の幅が1マスになる「細い道」が2か所あり、その両脇は高さ 0 の崩れた穴。
 *   細い道から穴へ突き飛ばすと高さの差 3 の落下ダメージ（最大 HP の 24%）。穴に落ちると、回廊へは直接戻れない。
 * - 両端には高さ 1 の低い脇道があり、細い道を通らずに回り込める（ただし回廊の上から狙われやすい）。
 * - 数手番ごとに、後方（南の端）から増援が現れる（出現の 3 手番前から予告の目印を出す）。待つほど不利になる。
 * - 隠れた罠: ぬかるみと落石を、回廊の上に1つずつ。
 * 敵はレベル 2。弓使いに「集中」、戦士に「早足」。
 */
const map: MapDefinition = {
  id: 'ruins-corridor',
  heights: [
    [0, 1, 3, 3, 3, 1, 0],
    [1, 1, 3, 3, 3, 1, 1],
    [1, 2, 3, 3, 3, 2, 1],
    [1, 1, 0, 3, 0, 1, 1],
    [1, 1, 0, 3, 0, 1, 1],
    [1, 2, 3, 3, 3, 2, 1],
    [1, 1, 3, 3, 3, 1, 1],
    [1, 1, 0, 3, 0, 1, 1],
    [1, 1, 0, 3, 0, 1, 1],
    [1, 2, 3, 3, 3, 2, 1],
    [1, 1, 3, 3, 3, 1, 1],
    [1, 2, 3, 3, 3, 2, 1],
    [2, 2, 3, 3, 3, 2, 2],
    [2, 2, 2, 2, 2, 2, 2],
  ],
  terrain: [
    'ddsssdd',
    'ddsssdd',
    'dsssssd',
    'dddsddd',
    'dddsddd',
    'dsssssd',
    'ddsssdd',
    'dddsddd',
    'dddsddd',
    'dsssssd',
    'ddsssdd',
    'dsssssd',
    'sssssss',
    'ggggggg',
  ],
  legend: { g: 'grass', d: 'dirt', s: 'stone' },
};

const level = 2;
/** 後方からの増援（2体）。id には、イベントの何回目かが付く（r2-wave-warrior-1 など） */
const wave = [
  { ...enemyUnit({ id: 'r2-wave-warrior', job: warrior, x: 2, z: 13, level, facing: 'north', abilities: ['powerStrike'], equipment: kit(warrior, 1) }), team: 'enemy' as const },
  { ...enemyUnit({ id: 'r2-wave-archer', job: archer, x: 4, z: 13, level, facing: 'north', equipment: kit(archer, 1) }), team: 'enemy' as const },
];

export const ruinsCorridor: BattleSite = {
  id: 'ruins-corridor',
  map,
  playerSlots: [
    { x: 3, z: 11, facing: 'north' },
    { x: 2, z: 11, facing: 'north' },
    { x: 4, z: 12, facing: 'north' },
    { x: 2, z: 12, facing: 'north' },
    { x: 3, z: 12, facing: 'north' },
  ],
  tiers: [
    {
      id: 'main',
      // 勝った時の報酬（フェーズ2-4）
      reward: {
        gold: 220,
        loot: [
          { itemId: 'quiet-amulet', percent: 15 },
          { itemId: 'light-2', percent: 10 },
          { itemId: 'robe-2', percent: 10 },
        ],
      },
      units: [
        enemyUnit({ id: 'r2-warrior-1', job: warrior, x: 3, z: 6, level, abilities: ['powerStrike'], passives: ['quickStep'], equipment: kit(warrior, 1) }),
        enemyUnit({ id: 'r2-archer-1', job: archer, x: 2, z: 2, level, passives: ['focus'], equipment: kit(archer, 1) }),
        enemyUnit({ id: 'r2-warrior-2', job: warrior, x: 3, z: 3, level, abilities: ['knockback'], passives: ['quickStep'], equipment: kit(warrior, 1) }),
        enemyUnit({ id: 'r2-mage-1', job: mage, x: 4, z: 1, level, abilities: ['wind', 'fire'], equipment: kit(mage, 1) }),
        enemyUnit({ id: 'r2-healer-1', job: healer, x: 3, z: 0, level, abilities: ['heal'], statBonus: { maxMp: -24 }, equipment: kit(healer, 1) }),
      ],
    },
  ],
  objectives: { victory: [{ kind: 'reachTile', tiles: [{ x: 2, z: 0 }, { x: 3, z: 0 }, { x: 4, z: 0 }] }], defeat: [{ kind: 'allDefeated' }] },
  events: [
    { id: 'r2-intro', trigger: { kind: 'turn', turn: 0 }, effects: [{ kind: 'message', messageId: 'ruinsCorridorIntro' }] },
    // 6 手番目の後から 10 手番ごとに予告し、3 手番後に現れる（2体ずつ、最大 4 回）
    {
      id: 'r2-wave',
      trigger: { kind: 'turn', turn: 8, every: 11 },
      times: 4,
      effects: [
        { kind: 'message', messageId: 'reinforcementBehind' },
        { kind: 'reinforce', delay: 3, units: wave },
      ],
    },
  ],
  traps: [
    { x: 3, z: 9, kind: 'mud' },
    { x: 3, z: 4, kind: 'rockfall' },
  ],
};
