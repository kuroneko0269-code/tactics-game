import type { MapDefinition } from '../../../core/map';
import type { BattleSite } from '../../../core/sortie';
import { archer, healer, mage, warrior } from '../../jobs';
import { altarCrown, robe1, staff1 } from '../../equipment';
import { enemyUnit, kit } from '../enemyUnits';

/**
 * 第3戦「祭壇の間」: 10×10 の広間。勝利はボス（魔術師）の撃破。
 * - ボスは奥の高さ 3 の祭壇にいて、詠唱のとても長い強力な範囲の魔法「業火」（範囲 2、13マス）を使う。
 *   予約された範囲から逃げるか、突き飛ばし・封じで詠唱を止めるかを選ぶ。ボスは相手の攻撃が届く位置へ不用意に出ない。
 * - 取り巻き: 祭壇の前の戦士2体（反撃）、両脇の柱の上の弓使い、祭壇の上の癒し手。
 * - ボスの HP が半分以下になると、祭壇の両脇に取り巻きの戦士が2体現れる（2 手番前に予告）。
 * - 隠れた罠: 落石・ぬかるみを広間に1つずつ。脱力の罠を、味方の開始位置の南西の隅（高い柱の陰の行き止まり）に1つ。
 *   北へ進めば踏まないが、場所を知っていれば、開始位置からすぐに何度でも踏みに行ける。
 * 敵はレベル 3（ボスは 6）。受動的なアビリティを段階的に付けている。装備は1段階目（ボスは主の宝冠も。フェーズ2-4）。
 */
const map: MapDefinition = {
  id: 'ruins-altar',
  heights: [
    [1, 1, 1, 3, 3, 3, 3, 1, 1, 1],
    [1, 0, 0, 2, 3, 3, 2, 0, 0, 1],
    [3, 1, 0, 1, 2, 2, 1, 0, 1, 3],
    [0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
    [0, 0, 1, 0, 0, 0, 0, 1, 0, 0],
    [0, 0, 1, 0, 0, 0, 0, 1, 0, 0],
    [0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
    [2, 0, 0, 0, 0, 0, 0, 0, 0, 2],
    [5, 0, 0, 0, 0, 0, 0, 0, 0, 1],
    [0, 0, 0, 0, 0, 0, 0, 0, 0, 1],
  ],
  terrain: [
    'ssssssssss',
    'sddssssdds',
    'ssdssssdss',
    'dddddddddd',
    'ddsddddsdd',
    'ddsddddsdd',
    'dddddddddd',
    'sdddddddds',
    'sddddddddd',
    'dddddddddd',
  ],
  legend: { d: 'dirt', s: 'stone' },
};

const level = 3;

export const ruinsAltar: BattleSite = {
  id: 'ruins-altar',
  map,
  playerSlots: [
    { x: 3, z: 8, facing: 'north' },
    { x: 6, z: 8, facing: 'north' },
    { x: 5, z: 9, facing: 'north' },
    { x: 4, z: 9, facing: 'north' },
    { x: 6, z: 9, facing: 'north' },
  ],
  tiers: [
    {
      id: 'main',
      // 勝った時の報酬（フェーズ2-4）。初めてのクリアでは、ほかに主の宝冠が必ず手に入る（index.ts の firstClearItemId）
      reward: {
        gold: 400,
        loot: [
          { itemId: 'bow-2', percent: 15 },
          { itemId: 'staff-2', percent: 15 },
          { itemId: 'heavy-2', percent: 15 },
          { itemId: 'steady-bangle', percent: 10 },
        ],
      },
      units: [
        enemyUnit({ id: 'r3-warrior-1', job: warrior, x: 4, z: 2, level, abilities: ['powerStrike', 'knockback'], passives: ['counter'], equipment: kit(warrior, 1) }),
        enemyUnit({
          id: 'r3-boss',
          job: mage,
          x: 4,
          z: 0,
          level: 6,
          abilities: ['inferno', 'wind', 'seal'],
          passives: ['magicShell'],
          // 主の宝冠（初めてのクリアで手に入る）を付けている。残りの強さは能力値の補正で表す
          equipment: [staff1, robe1, altarCrown],
          statBonus: { maxHp: 16, maxMp: 18 },
        }),
        enemyUnit({ id: 'r3-warrior-2', job: warrior, x: 5, z: 2, level, abilities: ['powerStrike', 'knockback'], passives: ['counter'], equipment: kit(warrior, 1) }),
        enemyUnit({ id: 'r3-archer-1', job: archer, x: 0, z: 2, level, abilities: ['aimedShot'], passives: ['focus'], equipment: kit(archer, 1) }),
        enemyUnit({ id: 'r3-healer-1', job: healer, x: 5, z: 0, level, abilities: ['heal', 'bigHeal'], passives: ['meditate'], equipment: kit(healer, 1) }),
      ],
    },
  ],
  objectives: { victory: [{ kind: 'defeatUnit', unitId: 'r3-boss' }], defeat: [{ kind: 'allDefeated' }] },
  events: [
    { id: 'r3-intro', trigger: { kind: 'turn', turn: 0 }, effects: [{ kind: 'message', messageId: 'ruinsAltarIntro' }] },
    {
      id: 'r3-rage',
      trigger: { kind: 'hpBelow', unitId: 'r3-boss', percent: 50 },
      effects: [
        { kind: 'message', messageId: 'ruinsAltarRage' },
        {
          kind: 'reinforce',
          delay: 2,
          units: [
            { ...enemyUnit({ id: 'r3-guard-1', job: warrior, x: 2, z: 0, level, abilities: ['powerStrike'], equipment: kit(warrior, 1) }), team: 'enemy' },
            { ...enemyUnit({ id: 'r3-guard-2', job: warrior, x: 7, z: 0, level, abilities: ['powerStrike'], equipment: kit(warrior, 1) }), team: 'enemy' },
          ],
        },
      ],
    },
  ],
  traps: [
    { x: 0, z: 9, kind: 'drain' },
    { x: 2, z: 3, kind: 'rockfall' },
    { x: 7, z: 6, kind: 'mud' },
  ],
};
