import { describe, expect, it } from 'vitest';
import { createMap } from '../../core/map';
import { testMap } from './testMap';

// data は型と検証のために core を使ってよい（逆に core から data は読み込まない）。
describe('testMap', () => {
  it('動作確認用マップのデータが正しく読める', () => {
    const map = createMap(testMap);
    expect(map.width).toBe(8);
    expect(map.depth).toBe(8);
    expect(new Set(map.tiles.map((t) => t.height)).size).toBeGreaterThan(1);
  });
});
