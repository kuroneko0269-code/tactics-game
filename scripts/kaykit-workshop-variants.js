// 人形の工房の案（scripts/kaykit-workshop.html）。往復ごとに、A・B・C の3案を書く。look は looks.ts の kaykit に上書きする値。
// 向きは度で、0 が正面、90 が人形の左の耳（画面では右）、180 が後ろ。

/** トウマの縁の長さ（3案に共通）: もみあげを残し、耳の上を短く、えり足を少し長く */
const TOUMA_HEM = [
  [0, 0.3],
  [55, 0.45],
  [92, 0.08],
  [125, 0.2],
  [160, 0.36],
  [180, 0.44],
  [200, 0.36],
  [235, 0.2],
  [268, 0.08],
  [305, 0.45],
];
const TOUMA = { kit: 'rogue', color: 0x2a2224, extras: ['forelock', 'flicks'] };

export const VARIANTS = {
  touma: {
    0: [{ name: '今', look: {} }],
    1: [
      {
        name: 'A 溝',
        note: '面に浅い溝4本',
        look: {
          hair: {
            ...TOUMA,
            shape: {
              mirror: true,
              fringe: 0.88,
              volume: 0.97,
              subdivide: 2,
              hem: TOUMA_HEM,
              grooves: [
                { path: [[-20, 28], [-30, 62], [-140, 60], [-168, 22]], depth: 0.075, width: 8 },
                { path: [[25, 30], [45, 60], [125, 52], [150, 18]], depth: 0.075, width: 8 },
                { path: [[68, 34], [92, 26], [108, 6]], depth: 0.06, width: 7 },
                { path: [[-70, 34], [-95, 26], [-112, 6]], depth: 0.06, width: 7 },
              ],
            },
          },
        },
      },
      {
        name: 'B 塊',
        note: '上・横・後ろの3つの塊に段差',
        look: {
          hair: {
            ...TOUMA,
            shape: {
              mirror: true,
              fringe: 0.88,
              volume: 0.97,
              subdivide: 2,
              hem: TOUMA_HEM,
              steps: [
                { az: 0, el: 90, offset: 0.25, step: 0.05, wave: [9, 3] },
                { az: -90, el: 0, offset: -0.5, step: 0.035 },
              ],
            },
          },
        },
      },
      {
        name: 'C 不ぞろい',
        note: '縁の高さをばらばらに',
        look: {
          hair: {
            ...TOUMA,
            shape: {
              mirror: true,
              fringe: 0.88,
              volume: 0.97,
              subdivide: 1,
              hem: [
                [0, 0.3],
                [40, 0.5],
                [62, 0.36],
                [92, 0.06],
                [115, 0.3],
                [140, 0.16],
                [165, 0.46],
                [190, 0.3],
                [215, 0.5],
                [240, 0.18],
                [268, 0.08],
                [298, 0.48],
                [322, 0.3],
              ],
            },
          },
        },
      },
    ],
  },
  yuna: {
    0: [{ name: '今', look: {} }],
    1: [
      {
        name: 'A 肩の後ろ',
        note: '耳の後ろで結び、肩の後ろへ',
        look: { hair: { tails: { tie: [0.44, 1.58, -0.3], path: [[0.29, 1.34, -0.3], [0.29, 1.18, -0.32], [0.27, 1.02, -0.3]], root: 0.055, bulge: 0.3, taper: 0.8, chest: true } } },
      },
      {
        name: 'B 肩の外',
        note: '低く結び、肩の外に沿って短め',
        look: { hair: { tails: { tie: [0.48, 1.48, -0.12], path: [[0.33, 1.3, -0.06], [0.37, 1.2, -0.03], [0.38, 1.12, -0.02]], root: 0.05, bulge: 0.3, taper: 0.8, chest: true } } },
      },
      {
        name: 'C 短い房',
        note: '太く短い房',
        look: { hair: { tails: { tie: [0.47, 1.6, -0.2], path: [[0.33, 1.42, -0.17], [0.36, 1.31, -0.15]], root: 0.065, bulge: 0.35, taper: 0.85, chest: false, strings: 0.06 } } },
      },
    ],
  },
};
