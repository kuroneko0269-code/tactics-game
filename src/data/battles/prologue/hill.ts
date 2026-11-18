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
 * 衛士が2人、祭壇の前にガレスと共に立つ（発注者の指定。弱め。HP が尽きると膝をつき、この戦闘では退場しない）。
 * 初めて遊ぶ人が、5手番前後で剣を折れる強さを保つ（npm run balance -- --prologue で確かめる）。
 * 隊は祭壇の手前（高さ 2 の段）から始める。始めに演出（ガレスが剣を抜き、ゴードが斬りかかって剣ごと押し返され、キリの矢が2本払われる）を
 * 見せてから操作が始まる（戦闘中の台詞はない）。3回目が当たった後、手ほどきで「最後の一撃は、トウマで」と出す。
 * 坂の両わきに、七つの氏族の人々（戦わない）が立つ。マップの外の左右と砦の後ろに、遠景の大勢の人々（decor）を並べる。
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
        // 祭壇の前の衛士（弱め）。HP が尽きると膝をつき、最後まで残る
        { ...enemyUnit({ id: 'hill-sentry-1', job: warrior, x: 2, z: 2, level: 1, statBonus: { maxHp: -16, attack: -9 }, equipment: kit(warrior, 1) }), noRetire: true },
        { ...enemyUnit({ id: 'hill-sentry-2', job: warrior, x: 6, z: 2, level: 1, statBonus: { maxHp: -16, attack: -9 }, equipment: kit(warrior, 1) }), noRetire: true },
      ],
    },
  ],
  objectives: {
    victory: [{ kind: 'hitUnit', id: 'oath-sword', unitId: 'hill-gareth', times: 4, labelId: 'oathSword', finisherId: 'touma' }],
    defeat: [{ kind: 'allDefeated' }],
  },
  events: [
    { id: 'hill-start', trigger: { kind: 'turn', turn: 0 }, effects: [{ kind: 'dialogue', scriptId: 'prologueHillStart' }] },
    // 誓いの剣に当たるたびに、鐘のような音（4回目は勝った後の台本で、剣が折れる音）
    ...[1, 2, 3].map((n) => ({ id: `hill-bell-${n}`, trigger: { kind: 'tally' as const, id: 'oath-sword', count: n }, effects: [{ kind: 'dialogue' as const, scriptId: 'prologueHillBell' }] })),
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
    衛士: 'hill-sentry-1',
    衛士B: 'hill-sentry-2',
  },
  looks: { 'hill-gareth': 'garethOath', touma: 'toumaLamp', 'hill-sentry-1': 'sentinel', 'hill-sentry-2': 'sentinel' },
  afterVictory: 'prologueHillAfter',
  // 隊員の名札に役目を添える（戦士ゴード、弓使いキリ、魔道士フェン、治癒師ノノ）
  roleTags: ['gord', 'kiri', 'fen', 'nono'],
  // 歌は戦闘中も遠くで続く
  ambient: { melody: '月を呼ぶ節', timbre: '歌声', level: 35 },
  tutorial: [{ id: 'hill-finisher', mode: 'main', tally: { id: 'oath-sword', atLeast: 3 }, point: { kind: 'unit', unitId: 'hill-gareth' } }],
  decor: [
    { id: '砦', kind: '砦', x: 4, z: 0 },
    { id: '旗1', kind: '旗', x: 2, z: 1 },
    { id: '旗2', kind: '青い旗', x: 6, z: 1 },
    // 遠景の大勢の人々（数千の人々・七つの氏族）。マップの外の左右と、砦の後ろ
    { id: '群衆1', kind: '群衆', x: -1, z: 2 },
    { id: '群衆2', kind: '群衆', x: -1, z: 4 },
    { id: '群衆3', kind: '群衆', x: -1, z: 6 },
    { id: '群衆4', kind: '群衆', x: 9, z: 2 },
    { id: '群衆5', kind: '群衆', x: 9, z: 4 },
    { id: '群衆6', kind: '群衆', x: 9, z: 6 },
    { id: '群衆7', kind: '群衆', x: 2, z: -1 },
    { id: '群衆8', kind: '群衆', x: 6, z: -1 },
  ],
};
