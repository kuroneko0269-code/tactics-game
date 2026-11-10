import { describe, expect, it } from 'vitest';
import { judgeTap, type TapHit } from './tapJudge';

const top = (x: number, z: number): TapHit => ({ kind: 'top', coord: { x, z } });

describe('タップしたマスの判定', () => {
  it('上面に触れたら、そのマスが先頭。周りの点のマスは、多く写っている順に後ろへ続く', () => {
    const r = judgeTap(top(3, 3), [top(3, 3), top(4, 3), top(3, 2), top(4, 3), undefined]);
    expect(r).toEqual({ coords: [{ x: 3, z: 3 }, { x: 4, z: 3 }, { x: 3, z: 2 }], onUnit: false });
  });

  it('ユニットの体に触れたら、そのユニットのマスだけ（近くのマスへは逃がさない）', () => {
    const r = judgeTap({ kind: 'unit', coord: { x: 2, z: 5 } }, [top(2, 4), top(3, 5)]);
    expect(r).toEqual({ coords: [{ x: 2, z: 5 }], onUnit: true });
  });

  it('段差の壁の下半分に触れたら手前の低いマス、上半分なら壁の上のマスを先にする', () => {
    // マス (5,5) は高さ 2.0、手前の (5,6) は高さ 0.5
    const wall = (hitHeight: number): TapHit => ({
      kind: 'side',
      coord: { x: 5, z: 5 },
      neighbor: { x: 5, z: 6 },
      hitHeight,
      top: 2.0,
      neighborTop: 0.5,
    });
    expect(judgeTap(wall(0.9), []).coords).toEqual([{ x: 5, z: 6 }, { x: 5, z: 5 }]);
    expect(judgeTap(wall(1.6), []).coords).toEqual([{ x: 5, z: 5 }, { x: 5, z: 6 }]);
  });

  it('マップの端の壁（隣のマスがない）は、壁の持ち主のマス', () => {
    const r = judgeTap({ kind: 'side', coord: { x: 0, z: 9 }, neighbor: undefined, hitHeight: 0, top: 1, neighborTop: undefined }, []);
    expect(r.coords).toEqual([{ x: 0, z: 9 }]);
  });

  it('何にも触れなかった時は、周りの点に写っているマスだけ', () => {
    expect(judgeTap(undefined, [undefined, top(1, 1)]).coords).toEqual([{ x: 1, z: 1 }]);
    expect(judgeTap(undefined, []).coords).toEqual([]);
  });
});
