import type { Direction } from '../../core/geometry';
import type { MapDefinition, Terrain } from '../../core/map';

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

const LEGEND: Readonly<Record<string, Terrain>> = { g: 'grass', d: 'dirt', s: 'stone', w: 'water', b: 'wood' };

/** 文字の行から、マップの定義を作る（行の長さがそろっていなければエラー） */
export function stageMap(id: string, rows: readonly string[]): MapDefinition {
  const cells = rows.map((r) => r.trim().split(/\s+/));
  const width = cells[0]?.length ?? 0;
  const heights = cells.map((row, z) => {
    if (row.length !== width) throw new Error(`マップ ${id}: ${z + 1}行目のマスの数が違います`);
    return row.map((c) => {
      const h = Number(c.slice(0, -1));
      if (!Number.isInteger(h) || h < 0) throw new Error(`マップ ${id}: 「${c}」の高さを読めません`);
      return h;
    });
  });
  const terrain = cells.map((row) => row.map((c) => c.slice(-1)).join(''));
  return { id, heights, terrain, legend: LEGEND };
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

export const stages: readonly StageDefinition[] = [roomStage, yardStage];
