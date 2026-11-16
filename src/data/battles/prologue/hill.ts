import type { BattleSite } from '../../../core/sortie';
import { stageMap } from '../../story/mapRows';
import { warrior } from '../../jobs';
import { enemyUnit, kit } from '../enemyUnits';

/**
 * 序章の戦闘2「アスタルの丘」（設計書「4. 章の表」の序章: 誓いの剣を折る。5ターン前後。祭壇は坂の上）。
 * 坂の上の祭壇（高さ 4）にガレス。ガレスの HP は尽きない（HP は 1 より下がらない。折るのは剣で、ガレスは生きたまま問いかけ、門に落ちる）。
 * 祭壇から動かない（移動力 0）。
 * 誓いの剣（ガレス）に、正面以外から武器の攻撃を4回当てると勝利。最後の1回（剣を折る一撃）はトウマだけが当てられる
 * （ほかの仲間の攻撃では、3回の後は回数が進まない。PR の回答 4）。ガレスは反撃と受け流しを持ち、強い。
 * 衛士は、隊が退けて駆け上がった後（会話の「隊は衛士を退け、祭壇へ駆け上がった。」）なので、戦闘には出さない。
 * 隊は祭壇の手前（高さ 2 の段）から始める。始めに演出（ゴードが斬りかかって剣ごと押し返され、キリの矢が2本払われる）を見せてから操作が始まる。
 * 坂の両わきに、七つの氏族の人々（戦わない）が立つ。
 */
const map = stageMap('prologue-hill', [
  '3s 3s 3s 5s 5s 5s 3s 3s 3s',
  '3s 2g 3g 4s 4s 4s 3g 2g 3s',
  '2g 2g 3g 3g 3g 3g 3g 2g 2g',
  '1g 2g 2g 2g 2g 2g 2g 2g 1g',
  '1g 1g 1g 2g 2g 2g 1g 1g 1g',
  '0g 1g 1g 1g 1g 1g 1g 1g 0g',
  '0g 0g 1g 1g 0d 1g 1g 0g 0g',
  '0g 0g 0g 0g 0d 0g 0g 0g 0g',
  '0g 0g 0g 0g 0d 0g 0g 0g 0g',
]);

export const hillBattle: BattleSite = {
  id: 'prologue-hill',
  map,
  // トウマ・ゴード・キリ・フェン・ノノの順。ゴードは祭壇の正面の下（始めの演出で、ここから斬りかかって押し返される）
  playerSlots: [
    { x: 3, z: 4, facing: 'north' },
    { x: 4, z: 3, facing: 'north' },
    { x: 6, z: 4, facing: 'north' },
    { x: 5, z: 5, facing: 'north' },
    { x: 4, z: 5, facing: 'north' },
  ],
  tiers: [
    {
      id: 'main',
      units: [
        {
          ...enemyUnit({
            id: 'hill-gareth',
            job: warrior,
            x: 4,
            z: 1,
            level: 6,
            passives: ['counter', 'parry'],
            statBonus: { move: -9, maxHp: 30 },
            equipment: kit(warrior, 2),
          }),
          minHp: 1,
          // 祭壇から動かず、HP も尽きないので、退場の決まりは関係しない
        },
      ],
    },
  ],
  objectives: {
    victory: [{ kind: 'hitUnit', id: 'oath-sword', unitId: 'hill-gareth', times: 4, labelId: 'oathSword', finisherId: 'touma' }],
    defeat: [{ kind: 'allDefeated' }],
  },
  events: [
    { id: 'hill-start', trigger: { kind: 'turn', turn: 0 }, effects: [{ kind: 'dialogue', scriptId: 'prologueHillStart' }] },
  ],
  // 七つの氏族の人々（戦わない）。坂の両わきと、砦の壁の前
  bystanders: [
    { id: 'clan-1', x: 0, z: 2, facing: 'east', look: 'clanA' },
    { id: 'clan-2', x: 0, z: 3, facing: 'east', look: 'clanB' },
    { id: 'clan-3', x: 0, z: 5, facing: 'east', look: 'clanC' },
    { id: 'clan-4', x: 8, z: 2, facing: 'west', look: 'clanD' },
    { id: 'clan-5', x: 8, z: 3, facing: 'west', look: 'clanA' },
    { id: 'clan-6', x: 8, z: 5, facing: 'west', look: 'clanB' },
    { id: 'clan-7', x: 1, z: 1, facing: 'south', look: 'clanC' },
    { id: 'clan-8', x: 7, z: 1, facing: 'south', look: 'clanD' },
  ],
  cast: {
    ガレス: 'hill-gareth',
    氏族: 'clan-1',
    氏族B: 'clan-4',
    氏族C: 'clan-7',
    氏族D: 'clan-8',
    氏族E: 'clan-3',
    氏族F: 'clan-6',
    氏族G: 'clan-2',
    氏族H: 'clan-5',
  },
  looks: { 'hill-gareth': 'garethOath', touma: 'toumaLamp' },
  afterVictory: 'prologueHillAfter',
};
