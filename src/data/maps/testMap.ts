import type { MapDefinition } from '../../core/map';

/**
 * 動作確認用の 8×8 マップ。
 * heights は各マスの高さ（段数）、terrain は各マスの地形を1文字で表す。
 * 上の行ほど画面の奥（z が小さい）になる。
 */
export const testMap: MapDefinition = {
  id: 'test-8x8',
  name: '動作確認用の丘',
  heights: [
    [0, 0, 1, 1, 2, 3, 4, 4],
    [0, 0, 1, 1, 2, 3, 3, 4],
    [0, 0, 0, 1, 1, 2, 3, 3],
    [0, 0, 0, 0, 1, 1, 2, 2],
    [0, 0, 0, 0, 0, 1, 1, 1],
    [1, 0, 0, 0, 0, 0, 0, 1],
    [2, 1, 0, 0, 0, 0, 1, 2],
    [2, 2, 1, 0, 0, 1, 2, 3],
  ],
  terrain: [
    'ggdddsss',
    'ggddddss',
    'wggdddds',
    'wwggggdd',
    'wwgggggd',
    'gwgggggg',
    'ggggggdd',
    'ssggggds',
  ],
  legend: { g: 'grass', d: 'dirt', s: 'stone', w: 'water' },
};
