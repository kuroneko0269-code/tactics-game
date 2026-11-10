import { describe, expect, it } from 'vitest';
import { createGestureTracker, TAP_MAX_MOVE_PX } from './gesture';

const types = (events: { type: string }[]) => events.map((e) => e.type);

describe('タップとドラッグ・ピンチの区別', () => {
  it('ほとんど動かずに離したらタップ（触れた位置）', () => {
    const g = createGestureTracker();
    g.down(1, { x: 100, y: 100 });
    expect(g.move(1, { x: 104, y: 103 })).toEqual([]);
    expect(g.up(1, { x: 104, y: 103 })).toEqual([{ type: 'tap', at: { x: 100, y: 100 } }]);
  });

  it('上限ちょうどの移動はタップ、超えたらドラッグ', () => {
    const g = createGestureTracker();
    g.down(1, { x: 0, y: 0 });
    g.move(1, { x: TAP_MAX_MOVE_PX, y: 0 });
    expect(types(g.up(1, { x: TAP_MAX_MOVE_PX, y: 0 }))).toEqual(['tap']);

    g.down(2, { x: 0, y: 0 });
    expect(g.move(2, { x: TAP_MAX_MOVE_PX + 1, y: 0 })).toEqual([
      { type: 'pan', from: { x: 0, y: 0 }, to: { x: TAP_MAX_MOVE_PX + 1, y: 0 } },
    ]);
    expect(g.move(2, { x: 30, y: 5 })).toEqual([
      { type: 'pan', from: { x: TAP_MAX_MOVE_PX + 1, y: 0 }, to: { x: 30, y: 5 } },
    ]);
    expect(g.up(2, { x: 30, y: 5 })).toEqual([]);
  });

  it('ドラッグして元の位置に戻してから離しても、タップにならない', () => {
    const g = createGestureTracker();
    g.down(1, { x: 50, y: 50 });
    g.move(1, { x: 90, y: 50 });
    g.move(1, { x: 50, y: 50 });
    expect(g.up(1, { x: 50, y: 50 })).toEqual([]);
  });

  it('2本指で広げるとピンチ（拡大）、離してもタップにならない', () => {
    const g = createGestureTracker();
    g.down(1, { x: 100, y: 100 });
    g.down(2, { x: 200, y: 100 });
    const events = g.move(2, { x: 300, y: 100 });
    expect(events[0]).toEqual({ type: 'pinch', center: { x: 200, y: 100 }, scale: 2 });
    expect(events[1]).toEqual({ type: 'pan', from: { x: 150, y: 100 }, to: { x: 200, y: 100 } });
    expect(g.up(2, { x: 300, y: 100 })).toEqual([]);
    expect(g.up(1, { x: 100, y: 100 })).toEqual([]);
    expect(g.count).toBe(0);
  });

  it('ほとんど動かさない2本指のタッチも、タップにならない', () => {
    const g = createGestureTracker();
    g.down(1, { x: 100, y: 100 });
    g.down(2, { x: 120, y: 100 });
    expect(g.up(2, { x: 120, y: 100 })).toEqual([]);
    expect(g.up(1, { x: 100, y: 100 })).toEqual([]);
  });

  it('ピンチの後に残った1本で動かすと平行移動になり、離してもタップにならない', () => {
    const g = createGestureTracker();
    g.down(1, { x: 100, y: 100 });
    g.down(2, { x: 200, y: 100 });
    g.up(2, { x: 200, y: 100 });
    expect(g.move(1, { x: 102, y: 100 })).toEqual([{ type: 'pan', from: { x: 100, y: 100 }, to: { x: 102, y: 100 } }]);
    expect(g.up(1, { x: 102, y: 100 })).toEqual([]);
  });

  it('操作が取り消されたらタップにしない', () => {
    const g = createGestureTracker();
    g.down(1, { x: 10, y: 10 });
    expect(g.cancel(1)).toEqual([]);
    expect(g.count).toBe(0);
  });

  it('一連の操作が終われば、次はまたタップできる', () => {
    const g = createGestureTracker();
    g.down(1, { x: 0, y: 0 });
    g.down(2, { x: 50, y: 0 });
    g.up(1, { x: 0, y: 0 });
    g.up(2, { x: 50, y: 0 });
    g.down(3, { x: 5, y: 5 });
    expect(types(g.up(3, { x: 5, y: 5 }))).toEqual(['tap']);
  });
});
