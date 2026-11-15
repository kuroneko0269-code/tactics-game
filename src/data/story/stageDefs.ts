import type { ScriptCatalog } from '../../core/script';

/**
 * 会話の場面で使う、名前で呼び出す部品（物語の土台）: 仕草・物の種類・人物の見た目。
 * 台本には、ここに書いた日本語の名前で書く。足す時はここに1つ足す（仕草の動きの形は下の GESTURES）。
 */

/**
 * 仕草の動き（短い動き）。frames は 0〜1 の時刻ごとの姿勢で、間はなめらかにつなぐ。最後は元の姿勢に戻す。
 * 姿勢の値（角度はラジアン）: bow 体を前に倒す、head 頭を下げる（負なら上げる）、headTurn 頭を横に向ける、
 * armL・armR 腕を前に上げる、drop 体を沈める（膝をつく）、lift 体を浮かせる（驚く）、turn 体ごと回す（背を向ける）
 */
export interface GesturePose {
  readonly bow?: number;
  readonly head?: number;
  readonly headTurn?: number;
  readonly armL?: number;
  readonly armR?: number;
  readonly drop?: number;
  readonly lift?: number;
  readonly turn?: number;
}

export interface GestureDefinition {
  readonly seconds: number;
  readonly frames: readonly (GesturePose & { readonly t: number })[];
  /** 終えた後も、向きが反対に変わったままになる（背を向ける） */
  readonly turnAway?: boolean;
}

export const GESTURES: Readonly<Record<string, GestureDefinition>> = {
  うなずく: { seconds: 0.6, frames: [{ t: 0 }, { t: 0.35, head: 0.45 }, { t: 0.7, head: 0.1 }, { t: 1 }] },
  首を振る: { seconds: 0.8, frames: [{ t: 0 }, { t: 0.25, headTurn: 0.5 }, { t: 0.5, headTurn: -0.5 }, { t: 0.75, headTurn: 0.4 }, { t: 1 }] },
  背を向ける: { seconds: 0.5, frames: [{ t: 0 }, { t: 1, turn: Math.PI }], turnAway: true },
  指で数える: {
    seconds: 1.4,
    frames: [{ t: 0 }, { t: 0.2, armR: 1.2, head: 0.3 }, { t: 0.4, armR: 1.0, head: 0.3 }, { t: 0.6, armR: 1.2, head: 0.3 }, { t: 0.8, armR: 1.0, head: 0.3 }, { t: 1 }],
  },
  膝をつく: { seconds: 1.6, frames: [{ t: 0 }, { t: 0.3, drop: 0.22, bow: 0.3 }, { t: 0.8, drop: 0.22, bow: 0.3 }, { t: 1 }] },
  見上げる: { seconds: 1.2, frames: [{ t: 0 }, { t: 0.3, head: -0.5 }, { t: 0.8, head: -0.5 }, { t: 1 }] },
  うつむく: { seconds: 1.2, frames: [{ t: 0 }, { t: 0.3, head: 0.6, bow: 0.1 }, { t: 0.8, head: 0.6, bow: 0.1 }, { t: 1 }] },
  手を上げる: { seconds: 1.0, frames: [{ t: 0 }, { t: 0.3, armR: 2.6 }, { t: 0.7, armR: 2.6 }, { t: 1 }] },
  胸に手を当てる: { seconds: 1.2, frames: [{ t: 0 }, { t: 0.3, armR: 1.3 }, { t: 0.8, armR: 1.3 }, { t: 1 }] },
  会釈する: { seconds: 0.9, frames: [{ t: 0 }, { t: 0.4, bow: 0.5, head: 0.2 }, { t: 0.6, bow: 0.5, head: 0.2 }, { t: 1 }] },
  驚く: { seconds: 0.5, frames: [{ t: 0 }, { t: 0.3, lift: 0.12, armL: 0.8, armR: 0.8 }, { t: 1 }] },
};

/** 物の種類（台本に書く名前 → 見た目の id。見た目は src/render/props.ts） */
export const PROP_KINDS: Readonly<Record<string, string>> = {
  椀: 'bowl',
  灯: 'lamp',
  ともった灯: 'lampLit',
  石: 'stone',
  机: 'table',
  箱: 'box',
  瓦礫: 'rubble',
  木箱: 'crate',
};

/**
 * 人物の見た目（台本に書く名前 → 見た目の id。見た目は src/render/actorLooks.ts）。
 * ここにない名前（番兵・村人など）は、ふつうの人の見た目になる
 */
export const ACTOR_LOOKS: Readonly<Record<string, string>> = {
  トウマ: 'touma',
  ユナ: 'yuna',
  母: 'mother',
  父: 'father',
  ハルド: 'hald',
  テオ: 'teo',
  イェルマ: 'yelma',
  ゴード: 'gord',
  キリ: 'kiri',
  フェン: 'fen',
  ノノ: 'nono',
  教官: 'instructor',
  見習い: 'apprentice',
};

/** 台本の読み込みに渡す、使える名前の一覧 */
export const scriptCatalog: ScriptCatalog = {
  gestures: Object.keys(GESTURES),
  props: Object.keys(PROP_KINDS),
  turnAway: Object.entries(GESTURES).flatMap(([name, g]) => (g.turnAway ? [name] : [])),
};
