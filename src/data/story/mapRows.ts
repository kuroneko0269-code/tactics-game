import type { MapDefinition, Terrain } from '../../core/map';

/**
 * マップを文字の行で書く（序章に足りない仕組み）。1マスは「高さの数字 + 地形の文字」で、空白で区切る。
 * 地形の文字は g 草地・d 土・s 岩場（石畳・壁）・w 水・b 板張り（床・橋）。例: '4s 4s 0b 0b 0w'
 * 会話用のマップ（stages.ts）と、物語の戦場（src/data/battles/）の両方で使う。
 */
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

