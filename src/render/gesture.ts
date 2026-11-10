/**
 * 指（マウス）の動きを「タップ」「ドラッグ（平行移動）」「ピンチ（拡大・縮小）」に振り分ける仕組み。
 * 画面（DOM）や Three.js には依存しない、座標だけを扱う部品にしてある（テストしやすくするため）。
 *
 * タップとして扱うのは、次の条件をすべて満たした時だけ。
 * - 1本の指だけで触れ、離すまでに2本目の指が触れなかった
 * - 触れてから離すまでに、指がほとんど動かなかった（TAP_MAX_MOVE_PX 以内）
 * つまり、ドラッグやピンチの終わりに指を離しても、マスやユニットは選ばれない。
 */

/** タップとみなす指の移動量の上限（CSS ピクセル） */
export const TAP_MAX_MOVE_PX = 10;

export interface Point {
  readonly x: number;
  readonly y: number;
}

export type GestureEvent =
  | { readonly type: 'tap'; readonly at: Point }
  /** from の位置にあった地面が to に来るように動かす */
  | { readonly type: 'pan'; readonly from: Point; readonly to: Point }
  /** center を中心に scale 倍に拡大する（1 より大きいと拡大） */
  | { readonly type: 'pinch'; readonly center: Point; readonly scale: number };

export interface GestureTracker {
  down(id: number, at: Point): GestureEvent[];
  move(id: number, at: Point): GestureEvent[];
  /** 指を離した */
  up(id: number, at: Point): GestureEvent[];
  /** 操作が取り消された（着信などで指の追跡が途切れた）。タップにはしない */
  cancel(id: number): GestureEvent[];
  /** 触れている指の本数 */
  readonly count: number;
}

type Phase = 'idle' | 'pending' | 'pan' | 'pinch';

export function createGestureTracker(tapMaxMove = TAP_MAX_MOVE_PX): GestureTracker {
  const pointers = new Map<number, { start: Point; last: Point }>();
  let phase: Phase = 'idle';
  /** この一連の操作（最初の指が触れてから全部離れるまで）が、まだタップになりうるか */
  let tapAllowed = false;

  const firstTwo = () => [...pointers.values()].slice(0, 2).map((p) => p.last) as [Point, Point];
  const mid = (a: Point, b: Point): Point => ({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 });
  const dist = (a: Point, b: Point) => Math.hypot(a.x - b.x, a.y - b.y);

  const release = (id: number, at: Point | undefined): GestureEvent[] => {
    const p = pointers.get(id);
    if (!p) return [];
    pointers.delete(id);
    const events: GestureEvent[] = [];
    if (pointers.size === 0) {
      if (at && phase === 'pending' && tapAllowed) events.push({ type: 'tap', at: p.start });
      phase = 'idle';
      tapAllowed = false;
    } else if (pointers.size === 1) {
      // ピンチの途中で1本離したら、残りの指でそのまま平行移動を続ける（タップにはしない）
      phase = 'pan';
    }
    return events;
  };

  return {
    get count() {
      return pointers.size;
    },
    down(id, at) {
      pointers.set(id, { start: at, last: at });
      if (pointers.size === 1) {
        phase = 'pending';
        tapAllowed = true;
      } else {
        phase = 'pinch';
        tapAllowed = false;
      }
      return [];
    },
    move(id, at) {
      const p = pointers.get(id);
      if (!p) return [];
      const events: GestureEvent[] = [];
      if (phase === 'pinch' && pointers.size >= 2) {
        const [a0, b0] = firstTwo();
        p.last = at;
        const [a1, b1] = firstTwo();
        const before = dist(a0, b0);
        const after = dist(a1, b1);
        const m0 = mid(a0, b0);
        const m1 = mid(a1, b1);
        if (before > 0 && after > 0 && after !== before) events.push({ type: 'pinch', center: m1, scale: after / before });
        if (m0.x !== m1.x || m0.y !== m1.y) events.push({ type: 'pan', from: m0, to: m1 });
        return events;
      }
      const prev = p.last;
      p.last = at;
      if (phase === 'pending') {
        if (dist(p.start, at) <= tapMaxMove) return [];
        // ほとんど動かない範囲を超えたらドラッグ。触れた位置からの動きをまとめて反映する
        phase = 'pan';
        tapAllowed = false;
        return [{ type: 'pan', from: p.start, to: at }];
      }
      if (phase === 'pan') events.push({ type: 'pan', from: prev, to: at });
      return events;
    },
    up: (id, at) => release(id, at),
    cancel(id) {
      tapAllowed = false;
      return release(id, undefined);
    },
  };
}
