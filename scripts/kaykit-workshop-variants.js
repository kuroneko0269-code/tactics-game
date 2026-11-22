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

const WHITE = 0xe2ded2;
const SILVER = 0xaeb3bc;
const TOUMA_CLOAK = (edge) => ({ cloak: { color: 0x34405a, length: 'knee', hoodDown: true, edge: true }, accentB: edge });
const toumaA = (grooves, extra = {}) => ({
  ...TOUMA,
  shape: { mirror: true, fringe: 0.88, volume: 0.97, subdivide: 2, hem: TOUMA_HEM, grooves, ...extra },
});
const YUNA_B = { tie: [0.48, 1.48, -0.12], path: [[0.33, 1.3, -0.06], [0.37, 1.2, -0.03], [0.38, 1.12, -0.02]], root: 0.058, bulge: 0.3, taper: 0.8, chest: true };
const YUNA = { kit: 'rogue', color: 0x1e1a1e, shape: { fringe: 0.8 }, tails: YUNA_B };

export const VARIANTS = {
  touma: {
    0: [{ name: '今', look: {} }],
    2: [
      {
        name: 'A1 溝3本',
        note: '深く太い溝・白の縁・胸の印',
        look: {
          ...TOUMA_CLOAK(WHITE),
          emblem: 'chest',
          hair: toumaA([
            { path: [[-15, 28], [-25, 62], [-140, 60], [-168, 22]], depth: 0.085, width: 10 },
            { path: [[35, 30], [55, 60], [125, 52], [150, 18]], depth: 0.085, width: 10 },
            { path: [[-75, 34], [-98, 24], [-114, 6]], depth: 0.07, width: 9 },
          ]),
        },
      },
      {
        name: 'A2 溝5本',
        note: '浅く細い溝・銀の縁・肩の印',
        look: {
          ...TOUMA_CLOAK(SILVER),
          emblem: 'shoulder',
          hair: toumaA([
            { path: [[-30, 28], [-40, 62], [-150, 60], [-172, 22]], depth: 0.06, width: 6 },
            { path: [[5, 30], [5, 64], [175, 62], [180, 22]], depth: 0.06, width: 6 },
            { path: [[38, 30], [55, 60], [125, 52], [150, 18]], depth: 0.06, width: 6 },
            { path: [[70, 34], [92, 26], [108, 6]], depth: 0.05, width: 6 },
            { path: [[-72, 34], [-96, 26], [-112, 6]], depth: 0.05, width: 6 },
          ]),
        },
      },
      {
        name: 'A3 溝4本・えり足長め',
        note: '白の縁・胸の印',
        look: {
          ...TOUMA_CLOAK(WHITE),
          emblem: 'chest',
          hair: toumaA(
            [
              { path: [[-20, 28], [-30, 62], [-140, 60], [-168, 22]], depth: 0.075, width: 8 },
              { path: [[25, 30], [45, 60], [125, 52], [150, 18]], depth: 0.075, width: 8 },
              { path: [[68, 34], [92, 26], [108, 6]], depth: 0.06, width: 7 },
              { path: [[-70, 34], [-95, 26], [-112, 6]], depth: 0.06, width: 7 },
            ],
            { hem: [[0, 0.3], [55, 0.5], [92, 0.08], [125, 0.26], [160, 0.5], [180, 0.62], [200, 0.5], [235, 0.26], [268, 0.08], [305, 0.5]] },
          ),
        },
      },
    ],
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
    3: [
      {
        name: 'Y1 生成りと錆色',
        note: '明るい生成り・茶のズボン・焦げ茶の前掛け・錆色の首の布',
        look: {
          cloth: 0xe2d6ba, cloth2: 0xcbbb96, pants: 0x86664a, boots: 0x3e2c22, leather: 0x5a3e2c,
          apron: { color: 0x4e3426 }, accent: 0xb0532e, accentB: 0xc09a50, neckerchief: true,
          hair: { ...YUNA, extras: ['twinTails', 'pin'] },
        },
      },
      {
        name: 'Y2 生成りと青緑',
        note: '生成り・灰青のズボン・胸当てつきの革の前掛け・青緑の差し色',
        look: {
          cloth: 0xdfd2b4, cloth2: 0xc6b591, pants: 0x5b676c, boots: 0x3e2e26, leather: 0x7a5234,
          apron: { color: 0x8a5e3a, bib: true }, accent: 0x2f6f6a, accentB: 0xc09a50, neckerchief: true,
          hair: { ...YUNA, extras: ['twinTails', 'pin'] },
        },
      },
      {
        name: 'Y3 発明家の小物',
        note: '生成り・帆布の胸当て・からし色の差し色・頭に上げた眼鏡',
        look: {
          cloth: 0xe0d4b6, cloth2: 0xc8b893, pants: 0x6c5a42, boots: 0x3a2b22, leather: 0x6a4a30,
          apron: { color: 0x6b6845, bib: true }, accent: 0xc8963a, accentB: 0xb8904c,
          hair: { ...YUNA, extras: ['twinTails', 'goggles'] },
        },
      },
    ],
    2: [
      { name: 'B1 リボン', note: '結び目に赤茶の小さなリボン', look: { hair: { ...YUNA, extras: ['twinTails', 'bows'] } } },
      { name: 'B2 髪留め', note: '前髪の横に真鍮の丸い髪留め', look: { accentB: 0xb8904c, hair: { ...YUNA, extras: ['twinTails', 'pin'] } } },
      { name: 'B3 花', note: '耳の上に小さな花', look: { accentB: 0xd8b860, hair: { ...YUNA, extras: ['twinTails', 'flower'] } } },
    ],
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
