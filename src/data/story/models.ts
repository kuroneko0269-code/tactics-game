/**
 * 物の見た目（仮の形）を、箱・円柱・円すい・球・輪・多面体の組み合わせとして書くデータ（序章に足りない仕組み）。
 * 会話の場面で台本が出し入れする物、会話のマップに置いておく家具、戦闘の対象物、人物の持ち物の、すべての見た目に使う。
 * 物を足す時は、ここに1つ足し、台本で使う名前を stageDefs.ts の PROP_KINDS に足す（3D の描き方は src/render/props.ts が共通に受け持つ）。
 *
 * 位置と大きさはマスの一辺を 1 とした値。at は物の足もと（マスの上面の中央）からの位置で、y が高さ。
 * - box: size = [幅, 高さ, 奥行き]
 * - cyl: size = [上の半径, 高さ, 下の半径]
 * - cone: size = [半径, 高さ]
 * - ball: size = [半径]
 * - ring: size = [輪の半径, 太さ]。rot を省くと、輪は横向き（立てた輪）
 * - gem: size = [半径]（角ばった石）
 * glow は自分で光る色（ともった灯など）。rot は [x, y, z] の回転（ラジアン）
 */
export interface ShapePart {
  readonly shape: 'box' | 'cyl' | 'cone' | 'ball' | 'ring' | 'gem';
  readonly size: readonly number[];
  readonly at: readonly [number, number, number];
  readonly color: number;
  readonly glow?: number;
  readonly rot?: readonly [number, number, number];
  /** 透けさせる（0〜1。光の輪など） */
  readonly opacity?: number;
  /** 揺れる（左右に揺れる幅。マスの一辺が 1。軒の灯など） */
  readonly sway?: number;
}

export type ModelDefinition = readonly ShapePart[];

const box = (w: number, h: number, d: number, at: [number, number, number], color: number, extra: Partial<ShapePart> = {}): ShapePart => ({
  shape: 'box',
  size: [w, h, d],
  at,
  color,
  ...extra,
});
const cyl = (rt: number, h: number, rb: number, at: [number, number, number], color: number, extra: Partial<ShapePart> = {}): ShapePart => ({
  shape: 'cyl',
  size: [rt, h, rb],
  at,
  color,
  ...extra,
});
const ball = (r: number, at: [number, number, number], color: number, extra: Partial<ShapePart> = {}): ShapePart => ({ shape: 'ball', size: [r], at, color, ...extra });
const gem = (r: number, at: [number, number, number], color: number, extra: Partial<ShapePart> = {}): ShapePart => ({ shape: 'gem', size: [r], at, color, ...extra });

const WOOD = 0x8a5a2b;
const WOOD_DARK = 0x6a4422;
const BRASS = 0xc9a24a;
const STONE = 0x9b8f80;

/** 4本脚の台（机・作業台・円卓の脚に使う） */
const legs = (w: number, d: number, h: number, color: number): ShapePart[] =>
  [-1, 1].flatMap((sx) => [-1, 1].map((sz) => box(0.06, h, 0.06, [(sx * w) / 2, h / 2, (sz * d) / 2], color)));

/** 形を、ずらして置く（食卓や作業台の上に載せる物に使う） */
const shift = (parts: readonly ShapePart[], dx: number, dy: number, dz: number): ShapePart[] =>
  parts.map((p) => ({ ...p, at: [p.at[0] + dx, p.at[1] + dy, p.at[2] + dz] as [number, number, number] }));

/** 食卓の上の4つの席（椀と箸の位置） */
const SEATS: readonly (readonly [number, number])[] = [
  [-0.26, -0.18],
  [0.26, -0.18],
  [-0.26, 0.18],
  [0.26, 0.18],
];
const TABLE_TOP = 0.39;
const BENCH_TOP = 0.49;
const BOWL: ShapePart = cyl(0.09, 0.07, 0.05, [0, 0.035, 0], 0xe9e2d0);
const CHOPSTICKS: ShapePart[] = [box(0.01, 0.01, 0.18, [-0.01, 0.006, 0], 0x5a3a20), box(0.01, 0.01, 0.18, [0.01, 0.006, 0], 0x5a3a20)];

export const MODELS: Readonly<Record<string, ModelDefinition>> = {
  // ---- 戦闘の対象物 ----
  seam: [box(0.8, 0.5, 0.5, [0, 0.25, 0], STONE), box(0.7, 0.35, 0.45, [0.05, 0.67, 0], 0x8a7e70), box(0.05, 0.85, 0.52, [0, 0.42, 0], 0x3a3029)],
  pillar: [cyl(0.2, 1.1, 0.26, [0, 0.55, 0], 0xc8c0b4), gem(0.16, [0, 1.22, 0], 0x7fd6ff)],
  crate: [box(0.55, 0.5, 0.55, [0, 0.25, 0], 0x9a6a3a)],
  // ---- 会話の場面の物（物語の土台から） ----
  table: [box(0.9, 0.06, 0.7, [0, 0.42, 0], WOOD), ...legs(0.76, 0.56, 0.4, WOOD_DARK)],
  bowl: [cyl(0.11, 0.08, 0.06, [0, 0.04, 0], 0xe9e2d0)],
  lamp: [cyl(0.08, 0.2, 0.1, [0, 0.1, 0], BRASS), ball(0.07, [0, 0.25, 0], 0x5a4a2a)],
  lampLit: [cyl(0.08, 0.2, 0.1, [0, 0.1, 0], BRASS), ball(0.09, [0, 0.26, 0], 0xffe08a, { glow: 0xffc84a })],
  stone: [gem(0.08, [0, 0.07, 0], 0xd8dcf0)],
  box: [box(0.4, 0.3, 0.3, [0, 0.15, 0], 0x7a5a3a)],
  rubble: [gem(0.14, [-0.15, 0.1, 0.05], 0x8c7b6a), gem(0.1, [0.15, 0.08, -0.1], 0x7d6f60)],
  // ---- 序章の物（序章の PR B） ----
  /** 食卓（低い、四人がけ） */
  diningTable: [box(0.95, 0.06, 0.75, [0, 0.36, 0], WOOD), ...legs(0.8, 0.6, 0.34, WOOD_DARK)],
  /** 椅子（腰掛け） */
  stool: [cyl(0.13, 0.04, 0.13, [0, 0.24, 0], WOOD), cyl(0.03, 0.22, 0.03, [0, 0.11, 0], WOOD_DARK)],
  /** ユナの作業台（板の上に道具と油の染み） */
  workbench: [
    box(0.95, 0.06, 0.6, [0, 0.46, 0], 0x7a5230),
    ...legs(0.82, 0.48, 0.44, WOOD_DARK),
    box(0.25, 0.012, 0.18, [0.22, 0.495, 0.08], 0x3a2a1a),
    box(0.12, 0.08, 0.12, [-0.3, 0.53, -0.15], BRASS),
  ],
  /** 作業台の上の、隊の道具（留め金・弦受け・頭金・蝶番） */
  tools: [
    box(0.06, 0.02, 0.04, [-0.12, 0.01, 0], BRASS),
    cyl(0.025, 0.02, 0.025, [-0.03, 0.01, 0.03], 0x8a6a4a),
    ball(0.03, [0.05, 0.03, -0.02], 0x8a5cf0),
    box(0.05, 0.015, 0.05, [0.13, 0.008, 0.02], BRASS),
  ],
  /** 小さな真鍮の暦盤（ユナの手作り） */
  calendarSmall: [cyl(0.1, 0.02, 0.1, [0, 0.01, 0], BRASS), cyl(0.07, 0.012, 0.07, [0, 0.026, 0], 0xe0c070), box(0.012, 0.012, 0.08, [0, 0.034, 0.03], 0x3a2a1a)],
  /** 塔の広間の、壁の暦盤（月の欄が十三。ひとつは名が刻まれていない） */
  calendarWall: [
    cyl(0.62, 0.06, 0.62, [0, 1.25, -0.42], 0x8a7a5a, { rot: [Math.PI / 2, 0, 0] }),
    cyl(0.5, 0.07, 0.5, [0, 1.25, -0.4], BRASS, { rot: [Math.PI / 2, 0, 0] }),
    ...Array.from({ length: 13 }, (_, i): ShapePart => {
      const a = (i / 13) * Math.PI * 2;
      // 十三番目の欄だけ、刻みがない（暗い）
      return box(0.08, 0.08, 0.02, [Math.sin(a) * 0.42, 1.25 + Math.cos(a) * 0.42, -0.36], i === 12 ? 0x2a2018 : 0xf4e2a0, i === 12 ? {} : { glow: 0x3a3010 });
    }),
  ],
  /** 円卓と十三の椅子（ひとつはいつも空いている） */
  roundTable: [
    cyl(1.05, 0.08, 1.05, [0, 0.42, 0], 0x6a4a2e),
    cyl(0.18, 0.4, 0.26, [0, 0.2, 0], WOOD_DARK),
    ...Array.from({ length: 13 }, (_, i): ShapePart => {
      const a = (i / 13) * Math.PI * 2;
      // 手前の1つ（i = 0）だけ、だれも座らず埃をかぶっている（灰色）
      return box(0.2, 0.32, 0.2, [Math.sin(a) * 1.32, 0.16, Math.cos(a) * 1.32], i === 0 ? 0x9a948a : 0x5a3a24);
    }),
    // 空いた椅子の上の埃と、ほかの椅子の座面の擦り切れ（人が座った跡）
    box(0.21, 0.02, 0.21, [0, 0.33, 1.32], 0xc8c0b0, { opacity: 0.9 }),
    ...Array.from({ length: 12 }, (_, k): ShapePart => {
      const a = ((k + 1) / 13) * Math.PI * 2;
      return box(0.12, 0.012, 0.12, [Math.sin(a) * 1.32, 0.327, Math.cos(a) * 1.32], 0x8a6040);
    }),
  ],
  /** 時の門の輪（立てた石の輪） */
  gateRing: [
    { shape: 'ring', size: [0.75, 0.13], at: [0, 0.95, 0], color: 0x9aa0b0 },
    box(0.5, 0.2, 0.4, [-0.62, 0.1, 0], 0x7a7f8a),
    box(0.5, 0.2, 0.4, [0.62, 0.1, 0], 0x7a7f8a),
    ...Array.from({ length: 6 }, (_, i): ShapePart => {
      const a = (i / 6) * Math.PI * 2;
      return gem(0.07, [Math.sin(a) * 0.75, 0.95 + Math.cos(a) * 0.75, 0.08], 0xb8d8ff, { glow: 0x22344a });
    }),
  ],
  /** ハルドの机 */
  desk: [box(0.85, 0.06, 0.55, [0, 0.44, 0], 0x5a3a24), box(0.8, 0.4, 0.06, [0, 0.21, 0.24], 0x4a3020), box(0.12, 0.03, 0.16, [0.2, 0.485, 0], 0x5a3a2a)],
  /** 家の戸（入口の枠と戸板） */
  door: [box(0.08, 0.95, 0.12, [-0.4, 0.47, 0.45], WOOD_DARK), box(0.08, 0.95, 0.12, [0.4, 0.47, 0.45], WOOD_DARK), box(0.88, 0.08, 0.12, [0, 0.95, 0.45], WOOD_DARK), box(0.72, 0.86, 0.04, [0, 0.43, 0.47], 0x8a6a3a)],
  /** 樽 */
  barrel: [cyl(0.2, 0.42, 0.18, [0, 0.21, 0], 0x7a5230), cyl(0.205, 0.03, 0.205, [0, 0.33, 0], 0x4a4a4a), cyl(0.185, 0.03, 0.185, [0, 0.08, 0], 0x4a4a4a)],
  /** ほこり（床の灰色のかたまり） */
  dust: [cyl(0.22, 0.015, 0.25, [0.05, 0.008, 0], 0xa8a090, { opacity: 0.8 }), cyl(0.12, 0.015, 0.14, [-0.18, 0.008, 0.12], 0xb0a898, { opacity: 0.7 })],
  /** 椀が置かれた食卓の上の箸立て（箸の束） */
  chopstickJar: [cyl(0.04, 0.1, 0.04, [0, 0.05, 0], 0xb08a5a), box(0.01, 0.16, 0.01, [0.01, 0.12, 0], 0x5a3a20), box(0.01, 0.16, 0.01, [-0.01, 0.12, 0.01], 0x5a3a20)],
  /** パン屋の店先（台とパンと、ユナが直した秤） */
  bakeryStall: [
    box(0.9, 0.5, 0.5, [0, 0.25, 0], 0x9a6a3a),
    box(0.95, 0.04, 0.55, [0, 0.52, 0], 0xc89a5a),
    ball(0.08, [-0.25, 0.6, 0.05], 0xd8a050),
    ball(0.08, [-0.08, 0.6, -0.05], 0xd8a050),
    cyl(0.1, 0.03, 0.1, [0.25, 0.66, 0], BRASS),
    cyl(0.015, 0.12, 0.015, [0.25, 0.6, 0], BRASS),
    box(1.0, 0.04, 0.7, [0, 1.15, 0], 0xc84a3a),
    cyl(0.02, 0.6, 0.02, [-0.45, 0.85, 0.3], WOOD_DARK),
    cyl(0.02, 0.6, 0.02, [0.45, 0.85, 0.3], WOOD_DARK),
  ],
  /** 薬屋の棚（薬の壺と、薬研） */
  apothecaryShelf: [
    box(0.9, 0.9, 0.3, [0, 0.45, -0.3], 0x5a4030),
    ball(0.06, [-0.25, 0.75, -0.15], 0x6a9a5a),
    ball(0.06, [0.0, 0.75, -0.15], 0xb06a4a),
    ball(0.06, [0.25, 0.75, -0.15], 0x4a6aa0),
    box(0.6, 0.35, 0.35, [0, 0.18, 0.15], 0x7a5a3a),
    box(0.22, 0.05, 0.08, [0, 0.38, 0.15], 0x6a6a6a),
  ],
  /** 薬研（手で持つ小さな物） */
  grinder: [box(0.2, 0.05, 0.07, [0, 0.025, 0], 0x6a6a6a), cyl(0.04, 0.012, 0.04, [0, 0.06, 0], 0x8a8a8a, { rot: [0, 0, Math.PI / 2] })],
  /** 商会の露店（お守りの石を並べた台と、からしと赤の日よけ） */
  stoneStall: [
    box(0.9, 0.45, 0.5, [0, 0.22, 0], 0x7a5a3a),
    box(0.95, 0.04, 0.55, [0, 0.46, 0], 0xa02a2a),
    ...[-0.3, -0.1, 0.1, 0.3].map((x, i) => gem(0.045, [x, 0.52, i % 2 ? 0.08 : -0.05], 0xd8dcf0)),
    box(1.0, 0.04, 0.7, [0, 1.1, 0], 0xc8a030),
    cyl(0.02, 0.6, 0.02, [-0.45, 0.8, 0.3], WOOD_DARK),
    cyl(0.02, 0.6, 0.02, [0.45, 0.8, 0.3], WOOD_DARK),
  ],
  /** 家（都の家並み・遠い谷の家） */
  house: [box(0.85, 0.6, 0.8, [0, 0.3, 0], 0xd8c8a8), { shape: 'cone', size: [0.68, 0.45], at: [0, 0.82, 0], color: 0x8a4a3a, rot: [0, Math.PI / 4, 0] }, box(0.18, 0.3, 0.02, [0, 0.15, 0.41], 0x5a3a24)],
  /** 小さな家（遠い谷）。軒に灯 */
  houseLit: [
    box(0.6, 0.42, 0.55, [0, 0.21, 0], 0xd8c8a8),
    { shape: 'cone', size: [0.5, 0.32], at: [0, 0.58, 0], color: 0x8a4a3a, rot: [0, Math.PI / 4, 0] },
    ball(0.05, [0.22, 0.4, 0.32], 0xffe08a, { glow: 0xffb84a }),
  ],
  /** 積み石（堰を積む石の山） */
  stonePile: [box(0.3, 0.2, 0.3, [-0.1, 0.1, 0.05], STONE), box(0.25, 0.18, 0.22, [0.15, 0.09, -0.1], 0x8a7e70), box(0.22, 0.16, 0.22, [0.02, 0.28, 0], 0xa89a88)],
  /** 氏族の旗 */
  banner: [cyl(0.02, 1.3, 0.02, [0, 0.65, 0], WOOD_DARK), box(0.36, 0.5, 0.02, [0.19, 1.05, 0], 0xb8402a)],
  banner2: [cyl(0.02, 1.3, 0.02, [0, 0.65, 0], WOOD_DARK), box(0.36, 0.5, 0.02, [0.19, 1.05, 0], 0x2a6a8a)],
  /** 丘の祭壇（石の台） */
  altar: [box(0.9, 0.3, 0.6, [0, 0.15, -0.15], 0xb8b0a0), box(0.7, 0.12, 0.45, [0, 0.36, -0.15], 0xc8c0b0)],
  /** 木 */
  tree: [cyl(0.06, 0.5, 0.08, [0, 0.25, 0], 0x6a4a2a), { shape: 'cone', size: [0.35, 0.7], at: [0, 0.8, 0], color: 0x3a7a3a }],
  // 食卓の上の椀と箸（席ごと）・作業台の上の物
  ...Object.fromEntries(SEATS.map(([x, z], i) => [`tableBowl${i + 1}`, shift([BOWL], x, TABLE_TOP, z)])),
  ...Object.fromEntries(SEATS.map(([x, z], i) => [`tableChopsticks${i + 1}`, shift(CHOPSTICKS, x + 0.1, TABLE_TOP, z)])),
  benchTools: [
    box(0.06, 0.02, 0.04, [-0.12, BENCH_TOP + 0.01, 0.05], BRASS),
    cyl(0.025, 0.02, 0.025, [-0.03, BENCH_TOP + 0.01, 0.1], 0x8a6a4a),
    ball(0.03, [0.05, BENCH_TOP + 0.03, 0.06], 0x8a5cf0),
    box(0.05, 0.015, 0.05, [0.13, BENCH_TOP + 0.008, 0.1], BRASS),
  ],
  benchCalendar: shift([cyl(0.1, 0.02, 0.1, [0, 0.01, 0], BRASS), cyl(0.07, 0.012, 0.07, [0, 0.026, 0], 0xe0c070), box(0.012, 0.012, 0.08, [0, 0.034, 0.03], 0x3a2a1a)], 0.3, BENCH_TOP, 0.05),
  benchLamp: shift([cyl(0.06, 0.13, 0.07, [0, 0.065, 0], BRASS), ball(0.05, [0, 0.16, 0], 0x5a4a2a)], -0.25, BENCH_TOP, 0.12),
  // ---- ゲーム脚本の序章で足した物 ----
  /** 開いた戸（戸板が内側へ開いている） */
  doorOpen: [
    box(0.08, 0.95, 0.12, [-0.4, 0.47, 0.45], WOOD_DARK),
    box(0.08, 0.95, 0.12, [0.4, 0.47, 0.45], WOOD_DARK),
    box(0.88, 0.08, 0.12, [0, 0.95, 0.45], WOOD_DARK),
    box(0.04, 0.86, 0.72, [-0.36, 0.43, 0.09], 0x8a6a3a),
  ],
  /** 遠くの大勢の人々（細かく作らない遠景。小さな人の形を並べ、足もとに地面の板を付ける。マップの外にも置ける） */
  crowd: [
    box(1, 0.04, 1, [0, -0.02, 0], 0x5a7a3a),
    box(1, 1.6, 1, [0, -0.84, 0], 0x5a4a32),
    ...Array.from({ length: 12 }, (_, i): ShapePart[] => {
      const x = -0.36 + (i % 4) * 0.24 + (Math.floor(i / 4) % 2) * 0.1;
      const z = -0.32 + Math.floor(i / 4) * 0.3;
      const colors = [0x8a5a3a, 0x4a6a5a, 0x6a4a6a, 0x9a7a4a, 0xa8403a, 0x2a6a8a];
      return [cyl(0.05, 0.2, 0.06, [x, 0.1, z], colors[i % colors.length]!), ball(0.04, [x, 0.24, z], 0xd8b89a)];
    }).flat(),
  ],
  /** 遠い谷の家々（昼なのに、軒の灯が揺れている） */
  farHouses: [
    box(0.55, 0.38, 0.5, [-0.22, 0.19, -0.15], 0xd8c8a8),
    { shape: 'cone', size: [0.45, 0.3], at: [-0.22, 0.53, -0.15], color: 0x8a4a3a, rot: [0, Math.PI / 4, 0] },
    ball(0.055, [-0.02, 0.34, 0.12], 0xffe08a, { glow: 0xffb84a, sway: 0.03 }),
    box(0.45, 0.32, 0.42, [0.28, 0.16, 0.2], 0xc8b898),
    { shape: 'cone', size: [0.38, 0.26], at: [0.28, 0.45, 0.2], color: 0x7a4a3a, rot: [0, Math.PI / 4, 0] },
    ball(0.05, [0.46, 0.28, 0.43], 0xffe08a, { glow: 0xffb84a, sway: 0.03 }),
  ],
  /** 夜空の星の並び（窓の外。第2章で、ここからひとつ欠ける。並びがはっきり分かるよう、七つの明るい星を大きく） */
  stars: [
    ...[
      [-1.6, 2.2],
      [-0.9, 2.6],
      [-0.2, 2.35],
      [0.5, 2.7],
      [1.1, 2.3],
      [1.7, 2.65],
      [0.2, 1.8],
    ].map(([x, y]): ShapePart => ball(0.07, [x!, y!, 0], 0xffffff, { glow: 0xf4f0d0 })),
    ...Array.from({ length: 14 }, (_, i): ShapePart => ball(0.025, [-2.2 + ((i * 37) % 44) / 10, 1.4 + ((i * 53) % 17) / 10, -0.2], 0xd8d8e8, { glow: 0x8a8aa0 })),
  ],
  /**
   * ユナの部屋（のちの物置）の窓。奥の壁の面に付ける（床のマスの奥の縁）。場面4のユナの部屋と場面9の物置で、同じ形と位置にする
   */
  window: [
    box(0.62, 0.62, 0.05, [0, 1.05, -0.47], WOOD_DARK),
    box(0.52, 0.52, 0.03, [0, 1.05, -0.455], 0x24324a),
    box(0.03, 0.52, 0.04, [0, 1.05, -0.445], WOOD_DARK),
    box(0.52, 0.03, 0.04, [0, 1.05, -0.445], WOOD_DARK),
    box(0.7, 0.05, 0.12, [0, 0.72, -0.43], WOOD),
  ],
  /** 同じ窓の、夜の姿（ガラスの向こうに星が見える。場面4のユナの部屋の夜。形と位置は「窓」と同じ） */
  windowNight: [
    box(0.62, 0.62, 0.05, [0, 1.05, -0.47], WOOD_DARK),
    box(0.52, 0.52, 0.03, [0, 1.05, -0.455], 0x0c1428),
    ...[
      [-0.15, 1.2],
      [0.12, 1.25],
      [-0.08, 0.92],
      [0.17, 0.95],
      [0.02, 1.1],
    ].map(([x, y]): ShapePart => ball(0.016, [x!, y!, -0.44], 0xffffff, { glow: 0xf4f0d0 })),
    box(0.03, 0.52, 0.04, [0, 1.05, -0.445], WOOD_DARK),
    box(0.52, 0.03, 0.04, [0, 1.05, -0.445], WOOD_DARK),
    box(0.7, 0.05, 0.12, [0, 0.72, -0.43], WOOD),
  ],
  /** 作業台の上の、ともった灯（夜のユナの部屋） */
  benchLampLit: shift([cyl(0.06, 0.13, 0.07, [0, 0.065, 0], BRASS), ball(0.06, [0, 0.17, 0], 0xffe08a, { glow: 0xffc84a })], -0.25, BENCH_TOP, 0.12),
  /** 壁に掛けた工具（ユナの部屋。奥の壁の面） */
  wallTools: [
    box(0.7, 0.04, 0.04, [0, 1.15, -0.46], WOOD_DARK),
    box(0.03, 0.26, 0.02, [-0.22, 1.0, -0.45], 0x8a8a8a),
    box(0.08, 0.04, 0.02, [-0.22, 0.86, -0.45], 0x6a4a2a),
    box(0.03, 0.22, 0.02, [0, 1.02, -0.45], 0x9a9a9a),
    cyl(0.05, 0.02, 0.05, [0.2, 0.98, -0.45], BRASS, { rot: [Math.PI / 2, 0, 0] }),
  ],
  /** 円卓の上に広げた明日の指示書（封蝋の印「未来より」）。円卓の手前の縁に置く */
  scrollOpen: [box(0.42, 0.012, 0.3, [0, 0.47, 0.62], 0xf0e8d0), cyl(0.05, 0.02, 0.05, [0.1, 0.485, 0.66], 0xa02020), cyl(0.03, 0.42, 0.03, [0, 0.48, 0.47], 0xe0d4b0, { rot: [0, 0, Math.PI / 2] })],
  /** 丘の上の、石を積んだ砦 */
  fort: [box(2.6, 0.9, 0.4, [0, 0.45, 0], 0x9a9284), box(0.5, 1.3, 0.5, [-1.2, 0.65, 0], 0x8a8274), box(0.5, 1.3, 0.5, [1.2, 0.65, 0], 0x8a8274)],
  // ---- 人物の持ち物（小さな物。人形の手・腰・背に付ける） ----
  /** 真鍮の測り棒（背に括る） */
  measuringRod: [cyl(0.018, 0.62, 0.018, [0, 0.31, 0], BRASS), box(0.06, 0.04, 0.012, [0.03, 0.5, 0], 0xf4f1e8)],
  /** 腰に提げる小さな灯 */
  lampSmall: [cyl(0.045, 0.1, 0.055, [0, 0.05, 0], BRASS), ball(0.04, [0, 0.12, 0], 0x5a4a2a)],
  lampSmallLit: [cyl(0.045, 0.1, 0.055, [0, 0.05, 0], BRASS), ball(0.05, [0, 0.12, 0], 0xffe08a, { glow: 0xffc84a })],
  /** 腰の袋 */
  pouch: [box(0.1, 0.1, 0.06, [0, 0.05, 0], 0x7a5a3a)],
  /** 薬箱（腰） */
  medicineBox: [box(0.14, 0.1, 0.08, [0, 0.05, 0], 0xb08a5a), box(0.15, 0.012, 0.085, [0, 0.1, 0], BRASS)],
  /** 紙包み（蜜菓子） */
  parcel: [box(0.1, 0.06, 0.08, [0, 0.03, 0], 0xe8d8b0)],
  /** 守り袋 */
  charm: [box(0.06, 0.08, 0.03, [0, 0.04, 0], 0xb04050), box(0.02, 0.02, 0.02, [0, 0.09, 0], BRASS)],
  /** 帳面 */
  ledger: [box(0.12, 0.03, 0.16, [0, 0.015, 0], 0x5a3a2a)],
  /** 指示書（巻いた紙と封蝋） */
  scroll: [cyl(0.025, 0.2, 0.025, [0, 0.025, 0], 0xf0e8d0, { rot: [0, 0, Math.PI / 2] }), ball(0.018, [0, 0.05, 0], 0xa02020)],
  /** 箸（一膳） */
  chopsticks: [box(0.012, 0.012, 0.2, [-0.012, 0.01, 0], 0x5a3a20), box(0.012, 0.012, 0.2, [0.012, 0.01, 0], 0x5a3a20)],
  /** 剣（手に持つ。古い剣・誓いの剣） */
  sword: [box(0.04, 0.5, 0.02, [0, 0.25, 0], 0xd8dde3), box(0.14, 0.025, 0.03, [0, 0.0, 0], BRASS)],
  brokenSword: [box(0.04, 0.16, 0.02, [0, 0.08, 0], 0xd8dde3), box(0.14, 0.025, 0.03, [0, 0.0, 0], BRASS)],
  spear: [cyl(0.015, 0.9, 0.015, [0, 0.45, 0], WOOD), { shape: 'cone', size: [0.03, 0.12], at: [0, 0.96, 0], color: 0xd8dde3 }],
  /** 小刀 */
  knife: [box(0.015, 0.1, 0.008, [0, 0.05, 0], 0xd8dde3)],
  /** 箒 */
  broom: [cyl(0.015, 0.7, 0.015, [0, 0.45, 0], WOOD), { shape: 'cone', size: [0.09, 0.2], at: [0, 0.1, 0], color: 0xc8b070 }],
};
