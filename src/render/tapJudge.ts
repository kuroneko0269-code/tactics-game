import type { Coord } from '../core/geometry';

/**
 * タップした点の下にあった物（一番手前の物だけ）。
 * - unit: ユニットの体。coord はそのユニットのいるマス
 * - top: マスの上面（色分けの板を含む）
 * - side: マスの柱の側面（段差の壁）。neighbor はその壁が面している隣のマス（壁の手前側の低いマス）
 */
export type TapHit =
  | { readonly kind: 'unit'; readonly coord: Coord }
  | { readonly kind: 'top'; readonly coord: Coord }
  | {
      readonly kind: 'side';
      readonly coord: Coord;
      readonly neighbor: Coord | undefined;
      /** 触れた点の高さ（ワールド座標） */
      readonly hitHeight: number;
      /** 壁の持ち主のマスの上面の高さ */
      readonly top: number;
      /** 隣のマスの上面の高さ */
      readonly neighborTop: number | undefined;
    };

/** タップで選ぶマスの候補（優先する順）。onUnit はユニットの体に触れたか */
export interface TapCandidates {
  readonly coords: readonly Coord[];
  readonly onUnit: boolean;
}

/**
 * タップした点から、選ぶマスの候補を決める（フェーズ1 の仕上げで見直した規則）。
 *
 * 1. 一番手前に写っている物だけを見る。以前は指の下の物を奥まですべて候補にしていたため、
 *    選べないマス（味方のいるマスや高い崖）をタップすると、その奥に隠れた別のマスが選ばれることがあった。
 * 2. ユニットの体に触れたら、そのユニットのマスだけ（近くのマスへは逃がさない）。
 * 3. 段差の壁（柱の側面）に触れたら、触れた高さで決める。壁の下半分なら手前の低いマスを先に、上半分なら壁の上のマスを先にする。
 *    壁の下の方は、手前の低いマスの奥の端を狙った指が少しずれて触れることが多いため。
 * 4. 2 と 3 で候補にしたマスが今の操作で選べない時のために、周りの点（nearby。指の太さぶんの範囲）に写っているマスも、
 *    多く写っている順に後ろへ足す。選べるマスのすぐ近くを外した時に、押し直さずに済むようにするため。
 *    使う側（battleController）は、候補を先頭から見て、今の操作で選べる最初のマスを選ぶ。
 */
export function judgeTap(hit: TapHit | undefined, nearby: readonly (TapHit | undefined)[]): TapCandidates {
  if (hit?.kind === 'unit') return { coords: [hit.coord], onUnit: true };
  const coords: Coord[] = hit ? primaryCoords(hit) : [];
  // 周りの点に写っているマスを、多い順（同じなら近い点で先に見つかった順）に並べる
  const counts = new Map<string, { coord: Coord; count: number; order: number }>();
  nearby.forEach((h, order) => {
    if (!h) return;
    const c = primaryCoords(h)[0]!;
    const key = `${c.x},${c.z}`;
    const entry = counts.get(key);
    if (entry) entry.count++;
    else counts.set(key, { coord: c, count: 1, order });
  });
  const ranked = [...counts.values()].sort((a, b) => b.count - a.count || a.order - b.order);
  for (const r of ranked) {
    if (!coords.some((c) => c.x === r.coord.x && c.z === r.coord.z)) coords.push(r.coord);
  }
  return { coords, onUnit: false };
}

function primaryCoords(hit: TapHit): Coord[] {
  if (hit.kind !== 'side') return [hit.coord];
  const { neighbor, neighborTop } = hit;
  if (!neighbor || neighborTop === undefined || neighborTop >= hit.top) return [hit.coord];
  const lowerHalf = hit.hitHeight - neighborTop < (hit.top - neighborTop) / 2;
  return lowerHalf ? [neighbor, hit.coord] : [hit.coord, neighbor];
}
