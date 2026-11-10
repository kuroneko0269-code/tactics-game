import type { MapDefinition } from '../../core/map';

/**
 * フェーズ1-1 の戦闘用 10×10 マップ「ふたつの丘」。
 * heights は各マスの高さ（段数）、terrain は各マスの地形を1文字で表す。
 * 上の行ほど画面の奥（z が小さい）。敵は奥（上）、味方は手前（下）から始まる。
 *
 * 西（左）に高い丘（高さ 4）、東（右）に低めの丘（高さ 3）がある。
 * 地形は上下（奥と手前）で対称なので、両軍の初期位置から丘までの距離は同じになる。
 * 丘へは高さの差 2 以下の段差を伝って登る。
 */
export const twinHills: MapDefinition = {
  id: 'twin-hills',
  heights: [
    [0, 0, 0, 1, 1, 1, 1, 0, 0, 0],
    [0, 0, 0, 0, 1, 1, 0, 0, 0, 0],
    [1, 0, 0, 0, 0, 0, 0, 0, 1, 1],
    [2, 1, 0, 0, 0, 0, 0, 1, 2, 2],
    [4, 3, 1, 0, 1, 1, 0, 1, 3, 2],
    [4, 3, 1, 0, 1, 1, 0, 1, 3, 2],
    [2, 1, 0, 0, 0, 0, 0, 1, 2, 2],
    [1, 0, 0, 0, 0, 0, 0, 0, 1, 1],
    [0, 0, 0, 0, 1, 1, 0, 0, 0, 0],
    [0, 0, 0, 1, 1, 1, 1, 0, 0, 0],
  ],
  terrain: [
    'ggggddgggg',
    'gggggggggg',
    'dggggggggd',
    'sdggggggds',
    'ssdgddgdss',
    'ssdgddgdss',
    'sdggggggds',
    'dggggggggd',
    'gggggggggg',
    'ggggddgggg',
  ],
  legend: { g: 'grass', d: 'dirt', s: 'stone' },
};
