import type { Direction } from '../../core/geometry';
import type { MapDefinition } from '../../core/map';
import { stageMap } from './mapRows';

export { stageMap } from './mapRows';
import { hillBattle } from '../battles/prologue/hill';
import { weirBattle } from '../battles/prologue/weir';

/**
 * 会話の場面のための、戦闘をしない小さなマップ（物語の土台）。会話の場面（章のデータ）から id で選ぶ。
 * 名前は text.ts の mapNames に id で引く。
 *
 * マップは文字の行で書ける（序章に足りない仕組み）: stageMap(id, 行の列)。1マスは「高さの数字 + 地形の文字」で、空白で区切る。
 * 地形の文字は g 草地・d 土・s 岩場（石畳・壁）・w 水・b 板張り（床・橋）。例: '4s 4s 0b 0b 0w'
 * props は、場面の始めから置いておく物（家具など。台本の @置く と同じ物の種類の名前。呼び名は id）。台本から @消す・@変える もできる。
 */
export interface StageProp {
  readonly id: string;
  readonly kind: string;
  readonly x: number;
  readonly z: number;
  readonly facing?: Direction;
}

export interface StageDefinition {
  readonly id: string;
  readonly map: MapDefinition;
  readonly props?: readonly StageProp[];
}

/** 室内（仮）: 5×5 の床と、奥の壁（高さ 4） */
export const roomStage: StageDefinition = {
  id: 'stage-room',
  map: stageMap('stage-room', ['4s 4s 4s 4s 4s', '0d 0d 0d 0d 0d', '0d 0d 0d 0d 0d', '0d 0d 0d 0d 0d', '0d 0d 0d 0d 0d']),
};

/** 野外（仮）: 7×6 の草地と小さな段差 */
export const yardStage: StageDefinition = {
  id: 'stage-yard',
  map: stageMap('stage-yard', [
    '2s 2s 1g 1g 1g 2s 2s',
    '1g 1g 0g 0g 0g 1g 2s',
    '0g 0g 0g 0d 0g 0g 1g',
    '0g 0g 0g 0d 0g 0g 0g',
    '0g 0g 0g 1d 0g 0g 0g',
    '0g 0g 0g 0d 0g 0g 0g',
  ]),
};

// ---- 序章の会話用のマップ（序章の PR B。形と家具の置き方は仮） ----

/**
 * トウマの家（8×6）。左に食卓のある居間、右の奥にユナの部屋（のちの物置）。中ほどの壁（高さ 2）の (5,2) が廊下の口。
 * 手前（z=5）は戸の外。戸は (2,4) の手前の縁。ユナの部屋の物（作業台、のちの樽・箒・ほこり）は台本が置く
 */
export const homeStage: StageDefinition = {
  id: 'stage-home',
  map: stageMap('stage-home', [
    '4s 4s 4s 4s 4s 4s 4s 4s',
    '0b 0b 0b 0b 0b 2s 0b 0b',
    '0b 0b 0b 0b 0b 0b 0b 0b',
    '0b 0b 0b 0b 0b 2s 0b 0b',
    '0b 0b 0b 0b 0b 2s 2s 2s',
    '0d 0d 0d 0d 0d 0d 0d 0d',
  ]),
  props: [
    { id: '食卓', kind: '食卓', x: 2, z: 2 },
    { id: '戸', kind: '戸', x: 2, z: 4 },
  ],
};

/**
 * 暦の塔（9×7）。奥の壁に暦盤、中ほどに円卓と十三の椅子、右奥に時の門の輪、左手前にハルドの机（話を聞く部屋）
 */
export const towerStage: StageDefinition = {
  id: 'stage-tower',
  map: stageMap('stage-tower', [
    '5s 5s 5s 5s 5s 5s 5s 5s 5s',
    '0s 0s 0s 0s 0s 0s 0s 0s 0s',
    '0s 0s 0s 0s 0s 0s 0s 0s 0s',
    '0s 0s 0s 0s 0s 0s 0s 0s 0s',
    '0s 0s 0s 0s 0s 0s 0s 0s 0s',
    '0s 0s 0s 0s 0s 0s 0s 0s 0s',
    '0s 0s 0s 0s 0s 0s 0s 0s 0s',
  ]),
  props: [
    { id: '暦盤', kind: '壁の暦盤', x: 4, z: 1 },
    { id: '円卓', kind: '円卓', x: 4, z: 3 },
    { id: '門の輪', kind: '門の輪', x: 7, z: 1 },
    { id: '机', kind: '書き物机', x: 1, z: 5 },
  ],
};

/**
 * 都の通り（9×8）。奥に家並み、パン屋の店先 (1,1)、薬屋 (4,0)、商会の露店 (7,2)。手前に掘割と橋 (4,5)
 */
export const cityStage: StageDefinition = {
  id: 'stage-city',
  map: stageMap('stage-city', [
    '0s 0s 0s 0s 0s 0s 0s 0s 0s',
    '0s 0s 0s 0s 0s 0s 0s 0s 0s',
    '0s 0s 0s 0s 0s 0s 0s 0s 0s',
    '0s 0s 0s 0s 0s 0s 0s 0s 0s',
    '0s 0s 0s 0s 0s 0s 0s 0s 0s',
    '0w 0w 0w 0w 1b 0w 0w 0w 0w',
    '0s 0s 0s 0s 0s 0s 0s 0s 0s',
    '0g 0g 0g 0g 0g 0g 0g 0g 0g',
  ]),
  props: [
    { id: '家1', kind: '家', x: 0, z: 0 },
    { id: '家2', kind: '家', x: 2, z: 0 },
    { id: '家3', kind: '家', x: 6, z: 0 },
    { id: '家4', kind: '家', x: 8, z: 0 },
    { id: 'パン屋', kind: 'パン屋の店先', x: 1, z: 1 },
    { id: '薬屋', kind: '薬屋の棚', x: 4, z: 0 },
    { id: '露店', kind: '露店', x: 7, z: 2 },
    { id: '木1', kind: '木', x: 8, z: 7 },
    { id: '木2', kind: '木', x: 0, z: 7 },
  ],
};

/** 谷の外れの堰（序章の戦闘1と同じマップ。戦闘の前の会話に使う） */
export const weirStage: StageDefinition = {
  id: 'stage-weir',
  map: weirBattle.map,
  props: [
    { id: '積み石1', kind: '積み石', x: 1, z: 3 },
    { id: '積み石2', kind: '積み石', x: 7, z: 4 },
  ],
};

/** アスタルの丘（序章の戦闘2と同じマップ。戦闘の前の会話に使う） */
export const hillStage: StageDefinition = {
  id: 'stage-hill',
  map: hillBattle.map,
  props: [
    { id: '旗1', kind: '旗', x: 2, z: 1 },
    { id: '旗2', kind: '青い旗', x: 6, z: 1 },
  ],
};

export const stages: readonly StageDefinition[] = [roomStage, yardStage, homeStage, towerStage, cityStage, weirStage, hillStage];
