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
const A1_HAIR = {
  ...TOUMA,
  shape: {
    mirror: true, fringe: 0.88, volume: 0.97, subdivide: 2, hem: TOUMA_HEM,
    grooves: [
      { path: [[-15, 28], [-25, 62], [-140, 60], [-168, 22]], depth: 0.085, width: 10 },
      { path: [[35, 30], [55, 60], [125, 52], [150, 18]], depth: 0.085, width: 10 },
      { path: [[-75, 34], [-98, 24], [-114, 6]], depth: 0.07, width: 9 },
    ],
  },
};
const YUNA_B = { tie: [0.48, 1.48, -0.12], path: [[0.33, 1.3, -0.06], [0.37, 1.2, -0.03], [0.38, 1.12, -0.02]], root: 0.058, bulge: 0.3, taper: 0.8, chest: true };
const YUNA = { kit: 'rogue', color: 0x1e1a1e, shape: { fringe: 0.8 }, tails: YUNA_B };

export const VARIANTS = {
  touma: {
    0: [{ name: '今', look: {} }],
    final: [{ name: '決定（A1・T3）', look: {} }],
    3: [
      {
        name: 'T1 濃紺と白',
        note: '濃紺の外套に白の縁・炭色の上着・暗い茶の革',
        look: {
          cloak: { color: 0x2f3a55, length: 'knee', hoodDown: true, edge: true, front: true },
          accentB: WHITE, accent: 0x3a4560, emblem: 'chest',
          cloth: 0x3a3a40, cloth2: 0x2e2e34, trim: 0x4a4a52, pants: 0x2c2b2e, leather: 0x3a2a20, boots: 0x2e221c,
          hair: A1_HAIR,
        },
      },
      {
        name: 'T2 濃紺と銀',
        note: '銀の縁・灰青の上着・襟に鈍い青緑',
        look: {
          cloak: { color: 0x2c3650, length: 'knee', hoodDown: true, edge: true, front: true },
          accentB: SILVER, accent: 0x4f7476, emblem: 'shoulder',
          cloth: 0x56627a, cloth2: 0x48536a, trim: 0x6a7488, pants: 0x30323a, leather: 0x4a3426, boots: 0x33261e,
          hair: A1_HAIR,
        },
      },
      {
        name: 'T3 濃紺と白と革',
        note: '白の縁・明るい灰の上着・飴色の革',
        look: {
          cloak: { color: 0x2f3a55, length: 'knee', hoodDown: true, edge: true, front: true },
          accentB: WHITE, accent: 0x2f3a55, emblem: 'chest',
          cloth: 0x8c8a84, cloth2: 0x77756f, trim: 0x9a978f, pants: 0x3a3634, leather: 0x7a4e2c, boots: 0x5a3820,
          hair: A1_HAIR,
        },
      },
    ],
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
    final: [{ name: '決定（B・Y1）', look: {} }],
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

// ---- 人形の工房 その2（序章の残りの人物）----

/** 画像に入れる人物の名前 */
export const NAMES = {
  touma: 'トウマ', yuna: 'ユナ', father: '父', mother: '母',
  gord: 'ゴード', kiri: 'キリ', fen: 'フェン', nono: 'ノノ',
  hald: 'ハルド', yelma: 'イェルマ', teo: 'テオ', mio: 'ミオ', gareth: 'ガレス',
  baker: 'パン屋のおかみ', apothecary: '薬屋の老婆', vendor: '売り子', stranger: '見知らぬ男',
};
/** 並びの写真に出す、決まった人物（決まるたびに足す） */
export const DECIDED = ['touma', 'yuna', 'father', 'mother'];

const EARTH = { leather: 0x5e4430, pants: 0x3e342c, boots: 0x3a2a20 };
const GORD_HAIR = { kit: 'knight', color: 0x4a3222, shape: { length: 0.8 } };
const GORD_ITEMS = { items: [{ model: 'sword', slot: 'hand' }, { model: 'measuringRod', slot: 'back' }] };
const KIRI_ITEMS = { items: [{ model: 'bow', slot: 'handL' }, { model: 'quiver', slot: 'back' }] };
const STAFF = { items: [{ model: 'staff', slot: 'hand' }] };

Object.assign(VARIANTS, {
  gord: {
    1: [
      {
        name: 'A 鉄の肩当て',
        note: 'がっしりした体・鈍い赤の上着・鉄の肩当て',
        def: GORD_ITEMS,
        look: { base: 'barbarian', head: 'knight', height: 1.1, width: 1.15, skin: 0xb8967e, cloth: 0x7a3e34, cloth2: 0x66342c, trim: 0x8a7a5a, ...EARTH, hair: GORD_HAIR, pauldrons: 'iron' },
      },
      {
        name: 'B 革の胴と赤いマント',
        note: '短い上着の体・革の胴・腰までの赤いマント',
        def: GORD_ITEMS,
        look: { base: 'rogue', head: 'knight', height: 1.1, width: 1.18, skin: 0xb8967e, cloth: 0x6a5040, cloth2: 0x5a4436, trim: 0x8a7a5a, ...EARTH, hair: GORD_HAIR, pauldrons: 'leather', cloak: { color: 0x7a3e34, length: 'short' } },
      },
      {
        name: 'C 赤い肩掛け',
        note: 'がっしりした体・土色の上着・赤い肩掛け',
        def: GORD_ITEMS,
        look: { base: 'barbarian', head: 'knight', height: 1.1, width: 1.15, skin: 0xb8967e, cloth: 0x5a4e44, cloth2: 0x4a4038, trim: 0x8a7a5a, ...EARTH, hair: { ...GORD_HAIR, shape: { length: 0.7, volume: 1.04 } }, mantle: 0x7a3e34 },
      },
    ],
  },
  kiri: {
    1: [
      {
        name: 'A 青年・緑の短い外套',
        note: '後ろで束ねた髪・腰までの緑の外套・弓と矢筒',
        def: KIRI_ITEMS,
        look: { base: 'rogue', head: 'rogue', width: 0.88, skin: 0xbf9f86, cloth: 0x4a5a44, cloth2: 0x3e4c3a, ...EARTH, hair: { kit: 'rogue', color: 0x2a2018, shape: { length: 0.7 }, extras: ['ponytail'] }, cloak: { color: 0x3a5440, length: 'short', hoodDown: true } },
      },
      {
        name: 'B 女性・高い一つ結び',
        note: '長い髪を一つに結ぶ・深い緑の上着・弓と矢筒',
        def: KIRI_ITEMS,
        look: { base: 'rogue', head: 'mage', height: 0.95, width: 0.85, skin: 0xc4a48c, cloth: 0x3a5440, cloth2: 0x2f4636, ...EARTH, hair: { kit: 'mage', color: 0x2a2018, shape: { length: 0.6 }, extras: ['ponytail'] }, face: { brows: 'thin' } },
      },
      {
        name: 'C 緑の肩掛け',
        note: '短めの髪を後ろで結ぶ・生成りの上着・緑の肩掛け',
        def: KIRI_ITEMS,
        look: { base: 'rogue', head: 'rogue', width: 0.88, skin: 0xbf9f86, cloth: 0xa89a7c, cloth2: 0x8e8268, ...EARTH, hair: { kit: 'rogue', color: 0x3a2a1e, shape: { length: 0.55 }, extras: ['ponytail'] }, mantle: 0x3a5440 },
      },
    ],
  },
  fen: {
    1: [
      {
        name: 'A 黒い長衣',
        note: '小柄・白髪まじりの短髪・黒の長衣と肩掛け・杖',
        def: STAFF,
        look: { base: 'mage', head: 'knight', height: 0.9, skin: 0xbf9f86, cloth: 0x2e2c30, cloth2: 0x26242a, trim: 0x6a5a7a, ...EARTH, hair: { kit: 'knight', color: 0x8e8a84 }, mantle: 0x3a3634 },
      },
      {
        name: 'B つばの広い帽子',
        note: '黒の長衣・黒い帽子・帯に紫・杖',
        def: STAFF,
        look: { base: 'mage', head: 'knight', height: 0.9, skin: 0xbf9f86, cloth: 0x2e2c30, cloth2: 0x26242a, trim: 0x4a4650, ...EARTH, hair: { kit: 'knight', color: 0x8e8a84 }, headwear: { kind: 'hat', color: 0x2a282e }, accent: 0x6a5a7a },
      },
      {
        name: 'C 女性・まとめ髪',
        note: '白髪まじりの長い髪をまとめる・黒の長衣・杖',
        def: STAFF,
        look: { base: 'mage', head: 'mage', height: 0.9, skin: 0xc4a48c, cloth: 0x2e2c30, cloth2: 0x26242a, trim: 0x6a5a7a, ...EARTH, hair: { kit: 'mage', color: 0x8e8a84, extras: ['bun'] }, mantle: 0x3a3634, face: { brows: 'thin' } },
      },
    ],
  },
});
