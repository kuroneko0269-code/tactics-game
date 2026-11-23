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

// ---- 往復2: 隊の4人。A 時守のそろい（濃紺・白い縁・胸の印。外套の形と持ち物を職業ごとに）・B 印と濃紺だけそろえ、服は職業らしく・C そろえず、職業らしい服と各自の色 ----
const T_NAVY = 0x2f3a55;
const T_WHITE = 0xe2ded2;
const UNIFORM = { accent: T_NAVY, accentB: T_WHITE, emblem: 'chest' };
const BADGE = { accentB: T_WHITE, emblem: 'chest' };
const NAVY_CLOTH = { cloth: 0x34405a, cloth2: 0x2a3449 };
const FEN_HAIR = { kit: 'knight', color: 0x8e8a84 };
const NONO_HAIR = {
  kit: 'mage', color: 0x6a4228,
  shape: { length: 0.62, volume: 1.12, subdivide: 1, steps: [{ az: 180, el: -10, offset: 0.1, step: 0.05, wave: [14, 7] }, { az: 0, el: 20, offset: 0.25, step: 0.03, wave: [10, 6] }] },
};
const KIRI_HAIR = { kit: 'rogue', color: 0x2a2018, shape: { length: 0.7 }, extras: ['ponytail'] };
const NONO_ITEMS = { items: [{ model: 'staffRing', slot: 'hand' }, { model: 'medicineBox', slot: 'waist' }] };
const GORD_BODY = { base: 'barbarian', head: 'knight', height: 1.1, width: 1.15, skin: 0xb8967e, trim: 0x8a7a5a, ...EARTH, hair: GORD_HAIR };
const KIRI_BODY = { base: 'rogue', head: 'rogue', width: 0.88, skin: 0xbf9f86, ...EARTH, hair: KIRI_HAIR };
const FEN_BODY = { base: 'mage', head: 'knight', height: 0.9, skin: 0xbf9f86, trim: 0x4a4650, ...EARTH, hair: FEN_HAIR };
const NONO_BODY = { base: 'mage', head: 'mage', width: 1.2, skin: 0xc8a890, trim: 0x8a7a5a, ...EARTH, hair: NONO_HAIR, face: { brows: 'thin' } };

Object.assign(VARIANTS.gord, {
  2: [
    { name: 'A 時守のそろい', note: '濃紺の短い外套（前の身頃）・白い縁・胸の印・鉄の肩当て', def: GORD_ITEMS, look: { ...GORD_BODY, cloth: 0x7a3e34, cloth2: 0x66342c, pauldrons: 'iron', cloak: { color: T_NAVY, length: 'short', edge: true, front: true }, ...UNIFORM } },
    { name: 'B 印と濃紺', note: '濃紺の上着・胸の印・鉄の肩当て（外套なし）', def: GORD_ITEMS, look: { ...GORD_BODY, ...NAVY_CLOTH, pauldrons: 'iron', ...BADGE } },
    { name: 'C 戦士の服', note: '鈍い赤の上着・鉄の肩当て・赤い短いマント', def: GORD_ITEMS, look: { ...GORD_BODY, cloth: 0x7a3e34, cloth2: 0x66342c, pauldrons: 'iron', cloak: { color: 0x6a3a32, length: 'short' } } },
  ],
});
Object.assign(VARIANTS.kiri, {
  2: [
    { name: 'A 時守のそろい', note: '濃紺の腰までの外套・下ろした頭巾・白い縁・胸の印・緑の上着', def: KIRI_ITEMS, look: { ...KIRI_BODY, cloth: 0x4a5a44, cloth2: 0x3e4c3a, cloak: { color: T_NAVY, length: 'short', hoodDown: true, edge: true, front: true }, ...UNIFORM } },
    { name: 'B 印と濃紺', note: '濃紺の上着と肩掛け・胸の印・弓と矢筒', def: KIRI_ITEMS, look: { ...KIRI_BODY, ...NAVY_CLOTH, mantle: 0x2c3650, ...BADGE } },
    { name: 'C 狩人の服', note: '深い緑の上着・頭巾つきの緑の外套', def: KIRI_ITEMS, look: { ...KIRI_BODY, cloth: 0x4a5a44, cloth2: 0x3e4c3a, cloak: { color: 0x3a5440, length: 'short', hoodDown: true } } },
  ],
});
Object.assign(VARIANTS.fen, {
  2: [
    { name: 'A 時守のそろい', note: '濃紺の足もとまでの外套（前の身頃）・白い縁・胸の印・黒の長衣', def: STAFF, look: { ...FEN_BODY, cloth: 0x2e2c30, cloth2: 0x26242a, cloak: { color: T_NAVY, length: 'long', edge: true, front: true }, ...UNIFORM } },
    { name: 'B 印と濃紺', note: '濃紺の長衣と帽子・胸の印', def: STAFF, look: { ...FEN_BODY, ...NAVY_CLOTH, headwear: { kind: 'hat', color: 0x2a3247 }, accent: 0x6a5a7a, ...BADGE } },
    { name: 'C 魔道士の服', note: '黒の長衣・黒い帽子・帯に紫', def: STAFF, look: { ...FEN_BODY, cloth: 0x2e2c30, cloth2: 0x26242a, headwear: { kind: 'hat', color: 0x2a282e }, accent: 0x6a5a7a } },
  ],
});
VARIANTS.nono = {
  2: [
    { name: 'A 時守のそろい', note: '濃紺の膝までの外套（前の身頃）・白い縁・胸の印・生成りの長衣', def: NONO_ITEMS, look: { ...NONO_BODY, cloth: 0xc6b898, cloth2: 0xb0a284, cloak: { color: T_NAVY, length: 'knee', edge: true, front: true }, ...UNIFORM } },
    { name: 'B 印と濃紺', note: '濃紺の長衣・生成りの胸当てつき前掛け・胸の印', def: NONO_ITEMS, look: { ...NONO_BODY, ...NAVY_CLOTH, apron: { color: 0xc6b898, bib: true }, ...BADGE } },
    { name: 'C 治癒師の服', note: '生成りの長衣・毛織の肩掛け・薄緑の首の布', def: NONO_ITEMS, look: { ...NONO_BODY, cloth: 0xc6b898, cloth2: 0xb0a284, mantle: 0x6a5e4c, accent: 0x7a8a62, neckerchief: true } },
  ],
};

// ---- 往復3（size）: B（印と濃紺）に決定。ゴードとノノの頭と体の大きさを、キリ・フェンに合わせる（bodyOnly: 背丈と肩幅を体だけに掛ける） ----
const gordB = VARIANTS.gord[2][1];
const nonoB = VARIANTS.nono[2][1];
const sized = (v, name, note, extra) => ({ name, note, def: v.def, look: { ...v.look, ...extra } });
VARIANTS.gord.size = [
  sized(gordB, 'A 頭はキリと同じ', '大柄の体（背 1.1・肩幅 1.15）・頭は大人のふつうの大きさ', { bodyOnly: true, headScale: 1 }),
  sized(gordB, 'B 頭を少し小さく', '大柄の体・頭 0.92（体が大きく見える）', { bodyOnly: true, headScale: 0.92 }),
  sized(gordB, 'C 体も少し控えめ', '背 1.05・肩幅 1.1・頭 0.95', { bodyOnly: true, height: 1.05, width: 1.1, headScale: 0.95 }),
];
VARIANTS.nono.size = [
  sized(nonoB, 'A 頭はキリと同じ', 'ふくよかな体（肩幅 1.2）・頭は大人のふつうの大きさ', { bodyOnly: true, headScale: 1 }),
  sized(nonoB, 'B 頭を少し小さく', 'ふくよかな体・頭 0.95', { bodyOnly: true, headScale: 0.95 }),
  sized(nonoB, 'C 体も少し控えめ', '肩幅 1.12・頭 0.97', { bodyOnly: true, width: 1.12, headScale: 0.97 }),
];
VARIANTS.kiri.size = [{ ...VARIANTS.kiri[2][1], name: 'B 決定' }];
VARIANTS.fen.size = [{ ...VARIANTS.fen[2][1], name: 'B 決定' }];
// トウマとユナを同じ決まりにした場合（見比べだけ。ゲームには入れない）
VARIANTS.touma.size = [{ name: '今', look: {} }, { name: '合わせた場合', note: '肩幅 0.9 を体だけに（頭の横幅がふつうに戻る）', look: { bodyOnly: true } }];
VARIANTS.yuna.size = [
  { name: '今', look: {} },
  { name: '合わせた場合', note: '背 0.9 を体だけに・頭 0.9（フェンと同じ大きさ）', look: { bodyOnly: true, headScale: 0.9 } },
];

// ---- 往復4（slim）: 合わせた方が太って見えた → 細く見せる3案（体を背だけ高く・肩幅を細く・頭の横幅を細く） ----
VARIANTS.touma.slim = [
  { name: '今', look: {} },
  { name: 'A 背を高く', note: '体だけ背 1.08・頭の横幅 0.92', look: { bodyOnly: true, height: 1.08, width: 0.9, headWidth: 0.92 } },
  { name: 'B 細身', note: '肩幅 0.82・頭の横幅 0.9', look: { bodyOnly: true, width: 0.82, headWidth: 0.9 } },
  { name: 'C 背を高く細身', note: '背 1.08・肩幅 0.84・頭の横幅 0.9', look: { bodyOnly: true, height: 1.08, width: 0.84, headWidth: 0.9 } },
];
VARIANTS.yuna.slim = [
  { name: '今', look: {} },
  { name: 'A 背を高く', note: '体だけ背 0.96・頭 0.88・頭の横幅 0.92', look: { bodyOnly: true, height: 0.96, headScale: 0.88, headWidth: 0.92 } },
  { name: 'B 細身', note: '肩幅 0.86・頭 0.86・頭の横幅 0.9', look: { bodyOnly: true, width: 0.86, headScale: 0.86, headWidth: 0.9 } },
  { name: 'C 背を高く細身', note: '背 0.96・肩幅 0.86・頭 0.88・頭の横幅 0.9', look: { bodyOnly: true, height: 0.96, width: 0.86, headScale: 0.88, headWidth: 0.9 } },
];
// 往復4 の作り直し: 肩幅や背の倍率だけでは差が小さかったので、腕と脚を骨の軸のまわりで細くする（limbs）
VARIANTS.touma.slim = [
  { name: '今', look: {} },
  { name: 'A 腕と脚を細く', note: '腕と脚 0.75', look: { limbs: 0.75 } },
  { name: 'B 細く・背を高く', note: '腕と脚 0.75・体だけ背 1.08・頭の横幅 0.92', look: { limbs: 0.75, bodyOnly: true, height: 1.08, width: 0.9, headWidth: 0.92 } },
  { name: 'C いちばん細く', note: '腕と脚 0.68・背 1.08・肩幅 0.84・頭の横幅 0.9', look: { limbs: 0.68, bodyOnly: true, height: 1.08, width: 0.84, headWidth: 0.9 } },
];
VARIANTS.yuna.slim = [
  { name: '今', look: {} },
  { name: 'A 腕と脚を細く', note: '腕と脚 0.75', look: { limbs: 0.75 } },
  { name: 'B 細く・背を高く', note: '腕と脚 0.75・体だけ背 0.96・頭 0.88・頭の横幅 0.92', look: { limbs: 0.75, bodyOnly: true, height: 0.96, headScale: 0.88, headWidth: 0.92 } },
  { name: 'C いちばん細く', note: '腕と脚 0.68・背 0.96・肩幅 0.86・頭 0.88・頭の横幅 0.9', look: { limbs: 0.68, bodyOnly: true, height: 0.96, width: 0.86, headScale: 0.88, headWidth: 0.9 } },
];
// 往復4 の作り直し2: 太く見える主な所は胴の丸さだったので、胴を細くする（torso）を加える
VARIANTS.touma.slim = [
  { name: '今', look: {} },
  { name: 'A 胴を細く', note: '胴 0.8・腕と脚 0.8', look: { torso: 0.8, limbs: 0.8 } },
  { name: 'B 胴を細く・背を高く', note: '胴 0.8・腕と脚 0.8・体だけ背 1.08・頭の横幅 0.92', look: { torso: 0.8, limbs: 0.8, bodyOnly: true, height: 1.08, width: 0.9, headWidth: 0.92 } },
  { name: 'C いちばん細く', note: '胴 0.72・腕と脚 0.72・背 1.1・頭の横幅 0.9', look: { torso: 0.72, limbs: 0.72, bodyOnly: true, height: 1.1, width: 0.9, headWidth: 0.9 } },
];
VARIANTS.yuna.slim = [
  { name: '今', look: {} },
  { name: 'A 胴を細く', note: '胴 0.8・腕と脚 0.8', look: { torso: 0.8, limbs: 0.8 } },
  { name: 'B 胴を細く・背を高く', note: '胴 0.8・腕と脚 0.8・体だけ背 0.96・頭 0.88・頭の横幅 0.92', look: { torso: 0.8, limbs: 0.8, bodyOnly: true, height: 0.96, headScale: 0.88, headWidth: 0.92 } },
  { name: 'C いちばん細く', note: '胴 0.72・腕と脚 0.72・背 0.98・頭 0.88・頭の横幅 0.9', look: { torso: 0.72, limbs: 0.72, bodyOnly: true, height: 0.98, headScale: 0.88, headWidth: 0.9 } },
];

// ---- 往復5（team）: トウマ B・ユナ A の細さに決定。隊の4人（B 印と濃紺）に、細くする決まりを当てるかの見比べ ----
const SLIM = { torso: 0.8, limbs: 0.8 };
const teamB = (who, extra) => ({ ...VARIANTS[who][2][1], look: { ...VARIANTS[who][2][1].look, ...extra } });
VARIANTS.gord.team = [
  { ...teamB('gord', { bodyOnly: true, headScale: 0.92 }), name: '今' },
  { ...teamB('gord', { bodyOnly: true, headScale: 0.92, ...SLIM }), name: '細く' },
];
VARIANTS.nono.team = [
  { ...teamB('nono', { bodyOnly: true, headScale: 0.95 }), name: '今' },
  { ...teamB('nono', { bodyOnly: true, headScale: 0.95, torso: 0.88, limbs: 0.85 }), name: '細く' },
];
VARIANTS.kiri.team = [{ ...teamB('kiri', {}), name: '今' }, { ...teamB('kiri', SLIM), name: '細く' }];
VARIANTS.fen.team = [{ ...teamB('fen', {}), name: '今' }, { ...teamB('fen', SLIM), name: '細く' }];

// ---- 区切り1（隊の4人と、父と母の体つき）が決まった後 ----
DECIDED.push('gord', 'kiri', 'fen', 'nono');
VARIANTS.father = { slim: [{ name: '前', look: { torso: 1, limbs: 1 } }, { name: '決定', look: {} }] };
VARIANTS.mother = { slim: [{ name: '前', look: { torso: 1, limbs: 1 } }, { name: '決定', look: {} }] };
for (const id of ['gord', 'kiri', 'fen', 'nono', 'touma', 'yuna']) VARIANTS[id].final2 = [{ name: '決定', look: {} }];
// 父の頭を少しだけ小さく（3案）
VARIANTS.father.head = [
  { name: '今', look: {} },
  { name: 'A 少し', note: '背と肩幅の倍率を頭に掛けない（頭がおよそ 0.95 倍）', look: { bodyOnly: true } },
  { name: 'B もう少し', note: 'A ＋ 頭 0.95（およそ 0.9 倍）', look: { bodyOnly: true, headScale: 0.95 } },
  { name: 'C はっきり', note: 'A ＋ 頭 0.91（およそ 0.86 倍）', look: { bodyOnly: true, headScale: 0.91 } },
];

// ---- 往復7: ハルド・イェルマ・テオ。体つきは決まりどおり細く（胴と腕・脚 0.8）。頭は大きくしない（bodyOnly） ----
const SILVER2 = 0xaeb3bc;
const HALD_BODY = { base: 'barbarian', head: 'knight', height: 1.04, width: 1.12, bodyOnly: true, headScale: 0.95, torso: 0.8, limbs: 0.8, skin: 0xb8967e, cloth: 0x34405a, cloth2: 0x2a3449, trim: 0x8a8a8a, ...EARTH, hair: { kit: 'knight', color: 0x6a5c4e, shape: { length: 0.6 } } };
VARIANTS.hald = {
  7: [
    { name: 'A 濃紺の外套', note: '膝までの濃紺の外套・銀の縁と胸の留め具（監督官らしく）', def: { items: [{ model: 'parcel', slot: 'waist' }] }, look: { ...HALD_BODY, cloak: { color: 0x2f3a55, length: 'knee', edge: true, front: true }, accent: 0x2f3a55, accentB: SILVER2, emblem: 'chest' } },
    { name: 'B 長衣と灰の肩掛け', note: '長衣の体・濃紺・灰の肩掛け・銀の留め具（話を聞き取る役）', def: { items: [{ model: 'parcel', slot: 'waist' }] }, look: { ...HALD_BODY, base: 'mage', mantle: 0x6a6e78, accentB: SILVER2, emblem: 'chest' } },
    { name: 'C 守護騎士', note: '濃紺の上着・鉄の肩当て・背に丸い盾・銀の留め具', def: { items: [{ model: 'shieldBack', slot: 'back' }] }, look: { ...HALD_BODY, pauldrons: 'iron', accentB: SILVER2, emblem: 'chest' } },
  ],
};
const YELMA_BODY = { base: 'mage', head: 'mage', height: 1.1, bodyOnly: true, torso: 0.8, limbs: 0.8, skin: 0xc8aa94, cloth: 0xd8d0be, cloth2: 0xc4bca8, trim: 0x8a8a90, ...EARTH, pants: 0x4a5274, face: { brows: 'thin' } };
VARIANTS.yelma = {
  7: [
    { name: 'A 白い長衣と灰の肩掛け', note: '銀の長い髪（服より暗い銀）・塔の白の長衣・灰の肩掛け・濃い青の帯', def: { items: [{ model: 'charm', slot: 'waist' }] }, look: { ...YELMA_BODY, hair: { kit: 'mage', color: 0x6e6e78, shape: { length: 1.35 } }, mantle: 0x4a4e5e, accent: 0x34405e } },
    { name: 'B 灰の長い外套', note: '白の長衣に、足もとまでの灰の外套（前の身頃・細い白の縁）', def: { items: [{ model: 'charm', slot: 'waist' }] }, look: { ...YELMA_BODY, hair: { kit: 'mage', color: 0x6e6e78, shape: { length: 1.35 } }, cloak: { color: 0x5a5e6a, length: 'long', edge: true, front: true }, accent: 0x5a5e6a, accentB: 0xe2ded2 } },
    { name: 'C 下ろした頭巾', note: '灰の長い外套に下ろした頭巾・髪は後ろでゆるくまとめる', def: { items: [{ model: 'charm', slot: 'waist' }] }, look: { ...YELMA_BODY, hair: { kit: 'mage', color: 0x6e6e78, extras: ['ponytail'] }, cloak: { color: 0x5a5e6a, length: 'long', hoodDown: true }, accent: 0x34405e } },
  ],
};
const TEO_BODY = { base: 'rogue', head: 'rogue', height: 0.92, torso: 0.8, limbs: 0.8, skin: 0xc4a48c, cloth: 0x34405a, cloth2: 0x2a3449, ...EARTH };
const TEO_HAIR = { kit: 'rogue', color: 0x7a5e44 };
VARIANTS.teo = {
  7: [
    { name: 'A ふくらんだ髪・短い外套', note: '柔らかくふくらんだ茶髪・腰までの濃紺の外套・白い襟', def: { items: [{ model: 'charm', slot: 'waist' }] }, look: { ...TEO_BODY, hair: { ...TEO_HAIR, shape: { volume: 1.12, fringe: 1.15 } }, cloak: { color: 0x2f3a55, length: 'short' }, accent: 0xe2ded2 } },
    { name: 'B 耳を隠す髪・長衣', note: '耳にかかる長さの茶髪・濃紺の長衣・白い首の布・短い杖', def: { items: [{ model: 'staff', slot: 'hand' }] }, look: { ...TEO_BODY, base: 'mage', hair: { ...TEO_HAIR, shape: { length: 1.15, volume: 1.06, fringe: 1.1 } }, accent: 0xe2ded2, neckerchief: true } },
    { name: 'C 下ろした前髪・膝の外套', note: '丸く下ろした前髪・膝までの濃紺の外套と白い襟・星図の巻物', def: { items: [{ model: 'scroll', slot: 'hand' }] }, look: { ...TEO_BODY, hair: { kit: 'knight', color: 0x7a5e44, shape: { volume: 1.1, fringe: 1.3 } }, cloak: { color: 0x2f3a55, length: 'knee', front: true }, accent: 0xe2ded2 } },
  ],
};
// 往復7 の直し: テオ C の巻物が顔の前に来たので腰に下げる。イェルマの守り袋は外す（テオの守り袋と同じ物が並ぶと、序章で伏せている事柄の手がかりになりうるため）。説明を短く
VARIANTS.teo[7][2] = { ...VARIANTS.teo[7][2], note: '丸く下ろした前髪・膝までの濃紺の外套と白い襟・腰に星図', def: { items: [{ model: 'scroll', slot: 'waist' }] } };
for (const v of VARIANTS.yelma[7]) v.def = { items: [] };
VARIANTS.yelma[7][0].note = '暗い銀の長い髪・白の長衣・灰の肩掛け';
VARIANTS.yelma[7][1].note = '白の長衣・足もとまでの灰の外套';
VARIANTS.yelma[7][2].note = '灰の外套・下ろした頭巾・ゆるくまとめた髪';
VARIANTS.hald[7][0].note = '膝までの濃紺の外套・銀の縁と留め具';
VARIANTS.hald[7][1].note = '長衣の体・灰の肩掛け・銀の留め具';
VARIANTS.hald[7][2].note = '鉄の肩当て・背に丸い盾・銀の留め具';
