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
  /** 空の色（省くと時刻の空。夜空のカットなど） */
  readonly sky?: number;
  /** 場面の時刻の光（朝・昼・夕方・夜。src/data/lighting.ts。省くと昼）。台本の @時刻 で変えられる */
  readonly time?: string;
  /** 遠景のカット（@遠景）で、カメラを向けるマスと寄り（省くとマップの中央を中くらいに） */
  readonly view?: { readonly x: number; readonly z: number; readonly zoom: 'far' | 'mid' | 'near' };
  /** マップの外で、台本のカメラを向けてよいマス（堰の下流の村など）。カメラを動かせる範囲が、ここまで広がる */
  readonly lookouts?: readonly { readonly x: number; readonly z: number }[];
  /** マップのマスを描かない（夜空だけを映す場面。地面の板が何か分からない箱に見えないように） */
  readonly hideGround?: boolean;
  /**
   * 室内の明るさの割合（空からの光と日の光を、この割合に弱める。灯の光で人物を照らし、部屋の隅を暗く沈めるため。省くと 1）
   */
  readonly ambient?: number;
  /** 台本のカメラの「近」の寄りの倍率（近をこの倍だけ寄せる。人物の顔と手もとが分かる距離まで寄るため。省くと 1） */
  readonly cameraZoom?: number;
  /** 台本のカメラを動かす秒の倍率（大きいほどゆっくり。省くと 1） */
  readonly cameraPace?: number;
  /** カメラの高さ（0 低い・1 標準・2 高い。省くと標準）。低いほど人物の顔が見える */
  readonly cameraHeight?: 0 | 1 | 2;
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
 * トウマの家（8×6）。左に食卓のある居間、右の奥にユナの部屋（のちの物置）。中ほどの仕切り（x=5）の (5,2) が戸口。
 * 手前（z=5）は戸の外。戸は (2,4) の手前の縁。ユナの部屋の物（作業台、のちの樽・箒・ほこり）は台本が置く。
 * 壁は家の殻（物の形 homeShell）で描く: 奥と左の壁は高く、手前と右の壁は低く切った模型の家（序章の場面4の見本の PR で、石の段の壁から作り直した）。
 * 部屋は暗めにして（ambient）、食卓の灯・かまど・作業台の灯の暖かい光で人物を照らす
 */
export const homeStage: StageDefinition = {
  id: 'stage-home',
  // 室内: 家のまわりは濃紺に沈める（家が空に浮いて見えないように）
  sky: 0x0b111e,
  ambient: 0.52,
  cameraZoom: 1.45,
  cameraPace: 1.5,
  cameraHeight: 0,
  map: stageMap('stage-home', [
    '0b 0b 0b 0b 0b 0b 0b 0b',
    '0b 0b 0b 0b 0b 0b 0b 0b',
    '0b 0b 0b 0b 0b 0b 0b 0b',
    '0b 0b 0b 0b 0b 0b 0b 0b',
    '0b 0b 0b 0b 0b 0b 0b 0b',
    '0d 0d 0d 0d 0d 0d 0d 0d',
  ]),
  props: [
    { id: '家の殻', kind: '家の殻', x: 0, z: 0 },
    { id: 'かまど', kind: 'かまど', x: 0, z: 1 },
    { id: '壁の棚', kind: '壁の棚', x: 3, z: 1 },
    { id: '長椅子', kind: '長椅子', x: 2, z: 2 },
    { id: '卓の灯', kind: 'ともった卓の灯', x: 2, z: 2 },
    { id: '食卓', kind: '食卓', x: 2, z: 2 },
    { id: '戸', kind: '戸', x: 2, z: 4 },
    // ユナの部屋（のちの物置）の窓。場面4と場面9で、同じ形と位置（改訂の決まり: 物置が元はユナの部屋だったと分かるように）
    { id: '窓', kind: '窓', x: 6, z: 1 },
  ],
};

/**
 * 暦の塔（9×7）。奥の壁に暦盤、中ほどに円卓と十三の椅子、右奥に時の門の輪（話を聞く部屋は別の会話用マップ stage-hearing）
 */
export const towerStage: StageDefinition = {
  id: 'stage-tower',
  time: '昼',
  // 室内: 部屋のまわりは空ではなく、暗い塔の中（部屋が空に浮いて見えないように）
  sky: 0x24222a,
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
  ],
};

/**
 * 帰ってきた時守の話を聞く部屋（5×5。PR の回答 2 で、門の前の広間と分けた）。奥の壁、ハルドの机と腰掛け、記録の箱
 */
export const hearingStage: StageDefinition = {
  id: 'stage-hearing',
  time: '昼',
  sky: 0x24222a,
  map: stageMap('stage-hearing', ['4s 4s 4s 4s 4s', '0b 0b 0b 0b 0b', '0b 0b 0b 0b 0b', '0b 0b 0b 0b 0b', '0b 0b 0b 0b 0b']),
  props: [
    { id: '机', kind: '書き物机', x: 2, z: 2 },
    { id: '腰掛け', kind: '腰掛け', x: 2, z: 1 },
    { id: '箱1', kind: '箱', x: 0, z: 1 },
    { id: '箱2', kind: '箱', x: 4, z: 1 },
    { id: '箱3', kind: '箱', x: 4, z: 2 },
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
    { id: '橋', kind: '橋の欄干', x: 4, z: 5 },
    { id: '木1', kind: '木', x: 8, z: 7 },
    { id: '木2', kind: '木', x: 0, z: 7 },
  ],
};

/** 谷の外れの堰（序章の戦闘1と同じマップ。戦闘の前の会話に使う） */
export const weirStage: StageDefinition = {
  id: 'stage-weir',
  map: weirBattle.map,
  time: weirBattle.time ?? '昼',
  props: [
    { id: '積み石1', kind: '積み石', x: 1, z: 3 },
    { id: '積み石2', kind: '積み石', x: 7, z: 4 },
    // マップの外の土地と、下流の三つの村（百年後に沈む村。堰から川筋をたどった先）。戦闘と同じ置き物
    ...(weirBattle.decor ?? []).map((d) => ({ id: d.id, kind: d.kind, x: d.x, z: d.z })),
  ],
  ...(weirBattle.lookouts ? { lookouts: weirBattle.lookouts } : {}),
};

/**
 * アスタルの丘（序章の戦闘2と同じマップ。戦闘の前の会話に使う）。砦と旗、遠景の大勢の人々（数千の人々。マップの外の左右と手前）は、
 * 戦闘の時も同じ物を置く（戦場の定義の decor）
 */
export const hillStage: StageDefinition = {
  id: 'stage-hill',
  map: hillBattle.map,
  time: hillBattle.time ?? '朝',
  props: (hillBattle.decor ?? []).map((d) => ({ id: d.id, kind: d.kind, x: d.x, z: d.z })),
};

// ---- 離れた場所を映す短いカット（@遠景。ゲーム脚本の序章） ----

/** 遠い谷の家々（堰で水が移ってきた村。第2章）。昼なのに、軒の灯が揺れている */
export const farValleyStage: StageDefinition = {
  id: 'stage-far-valley',
  map: stageMap('stage-far-valley', ['2g 2g 3g 3g 3g 2g 2g', '1g 1g 1g 2g 1g 1g 1g', '0g 0g 0g 1g 0g 0g 0g', '0w 0w 0w 0w 0w 0w 0w', '0g 0g 0g 0g 0g 0g 0g']),
  props: [
    { id: '家々1', kind: '遠い谷の家々', x: 1, z: 2 },
    { id: '家々2', kind: '遠い谷の家々', x: 3, z: 2 },
    { id: '家々3', kind: '遠い谷の家々', x: 5, z: 2 },
    { id: '木1', kind: '木', x: 0, z: 1 },
    { id: '木2', kind: '木', x: 6, z: 1 },
    // 地面と奥の山並み（谷が浮いて見えないように。下流の村々とは別の、山あいの谷）
    { id: 'まわり', kind: '遠い谷のまわり', x: 3, z: 4 },
  ],
  // 引きの画（奥の山並みまで入れて、山あいの遠い谷だと分かるように）
  view: { x: 3, z: 1, zoom: 'far' },
  time: '昼',
};

/** 夜空（家の窓の外）。星のよく見える空。星の並びがはっきり分かる画（第2章で、ここからひとつ欠ける） */
export const nightSkyStage: StageDefinition = {
  id: 'stage-night-sky',
  // 星空だけを映す（初見の検査で、地面の箱と家の屋根が何か分からないと言われたので、地面を描かず、家を置かない）
  map: stageMap('stage-night-sky', ['0d 0d 0d 0d 0d']),
  hideGround: true,
  props: [{ id: '星', kind: '星の並び', x: 2, z: 0 }],
  sky: 0x0c1428,
  time: '夜',
  view: { x: 2, z: 0, zoom: 'mid' },
};

export const stages: readonly StageDefinition[] = [roomStage, yardStage, homeStage, towerStage, hearingStage, cityStage, weirStage, hillStage, farValleyStage, nightSkyStage];
