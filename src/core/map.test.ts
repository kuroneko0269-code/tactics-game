import { describe, expect, it } from 'vitest';
import { createMap, getTile, isInBounds, type MapDefinition } from './map';
import { testMap } from '../data/maps/testMap';

const small: MapDefinition = {
  id: 'small',
  name: '小',
  heights: [
    [0, 1, 2],
    [3, 4, 5],
  ],
  terrain: ['gds', 'ggg'],
  legend: { g: 'grass', d: 'dirt', s: 'stone' },
};

describe('createMap', () => {
  it('定義から幅・奥行き・高さ・地形を読み取る', () => {
    const map = createMap(small);
    expect(map.width).toBe(3);
    expect(map.depth).toBe(2);
    expect(getTile(map, 2, 0)).toEqual({ x: 2, z: 0, height: 2, terrain: 'stone' });
    expect(getTile(map, 1, 1)?.height).toBe(4);
  });

  it('範囲外のマスは undefined', () => {
    const map = createMap(small);
    expect(getTile(map, 3, 0)).toBeUndefined();
    expect(getTile(map, -1, 0)).toBeUndefined();
    expect(isInBounds(map, 0.5, 0)).toBe(false);
  });

  it('行の幅がそろっていない定義はエラー', () => {
    expect(() => createMap({ ...small, heights: [[0, 1, 2], [0, 1]] })).toThrow();
  });

  it('legend にない地形記号はエラー', () => {
    expect(() => createMap({ ...small, terrain: ['gdx', 'ggg'] })).toThrow();
  });

  it('動作確認用マップのデータが正しく読める', () => {
    const map = createMap(testMap);
    expect(map.width).toBe(8);
    expect(map.depth).toBe(8);
    expect(new Set(map.tiles.map((t) => t.height)).size).toBeGreaterThan(1);
  });
});
