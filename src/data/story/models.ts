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
