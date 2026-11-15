import type { ScriptCatalog } from '../../core/script';
import { MELODIES, SOUND_EFFECTS, TIMBRES } from '../sounds';

/**
 * 会話の場面で使う、名前で呼び出す部品（物語の土台）: 仕草・姿勢・物の種類・人物の見た目・光の色。
 * 台本には、ここに書いた日本語の名前で書く。足す時はここに1つ足す。
 * - 仕草の動きの形は下の GESTURES（姿勢の値を、時刻ごとに並べる）。
 * - 物の見た目は models.ts、人物の見た目は looks.ts に書き、ここでは台本の名前とつなぐだけ。
 */

/**
 * 仕草の動き（短い動き）。frames は 0〜1 の時刻ごとの姿勢で、間はなめらかにつなぐ。最後は元の姿勢に戻す。
 * 姿勢の値（角度はラジアン）: bow 体を前に倒す、head 頭を下げる（負なら上げる）、headTurn 頭を横に向ける、tilt 首をかしげる、
 * armL・armR 腕を前に上げる、spreadL・spreadR 腕を横に開く、drop 体を沈める（膝をつく）、lift 体を浮かせる（驚く）、
 * back 体を後ろへずらす（後ずさる。マスの一辺が 1）、turn 体ごと回す（背を向ける）
 */
export interface GesturePose {
  readonly bow?: number;
  readonly head?: number;
  readonly headTurn?: number;
  readonly tilt?: number;
  readonly armL?: number;
  readonly armR?: number;
  readonly spreadL?: number;
  readonly spreadR?: number;
  readonly drop?: number;
  readonly lift?: number;
  readonly back?: number;
  readonly turn?: number;
}

export interface GestureDefinition {
  readonly seconds: number;
  readonly frames: readonly (GesturePose & { readonly t: number })[];
  /** 終えた後も、向きが反対に変わったままになる（背を向ける） */
  readonly turnAway?: boolean;
}

/** 同じ姿勢を何度か繰り返す（三度叩く・背をさする など）。base は繰り返しの間の姿勢、hit は叩いた時の姿勢 */
function repeat(times: number, base: GesturePose, hit: GesturePose, start = 0.12, end = 0.9): (GesturePose & { t: number })[] {
  const frames: (GesturePose & { t: number })[] = [{ t: 0 }, { t: start, ...base }];
  const span = (end - start) / times;
  for (let i = 0; i < times; i++) {
    frames.push({ t: start + span * (i + 0.5), ...base, ...hit });
    frames.push({ t: start + span * (i + 1), ...base });
  }
  frames.push({ t: 1 });
  return frames;
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
  // ---- 序章に足りない仕組みで足した仕草 ----
  深く会釈する: { seconds: 1.3, frames: [{ t: 0 }, { t: 0.35, bow: 0.85, head: 0.3 }, { t: 0.7, bow: 0.85, head: 0.3 }, { t: 1 }] },
  首をかしげる: { seconds: 1.1, frames: [{ t: 0 }, { t: 0.3, tilt: 0.38 }, { t: 0.75, tilt: 0.38 }, { t: 1 }] },
  /** 作業台や灯の底を指で三度叩く（節の終わりの三つの音に合わせる。叩く間は 0.4 秒ほど） */
  三度叩く: { seconds: 1.5, frames: repeat(3, { armR: 0.75, bow: 0.12, head: 0.25 }, { armR: 0.55 }, 0.1, 0.92) },
  /** 箸や指で人を指す */
  指さす: { seconds: 1.0, frames: [{ t: 0 }, { t: 0.25, armR: 1.55 }, { t: 0.75, armR: 1.55 }, { t: 1 }] },
  /** 隣の人の背をさする */
  背をさする: { seconds: 1.8, frames: repeat(3, { armL: 1.0, bow: 0.1 }, { armL: 0.75 }) },
  /** 物を手渡す */
  手渡す: { seconds: 1.0, frames: [{ t: 0 }, { t: 0.4, armR: 1.35, bow: 0.12 }, { t: 0.7, armR: 1.35, bow: 0.12 }, { t: 1 }] },
  /** 相手の腕をつかむ（前へ手を伸ばしたまま） */
  腕をつかむ: { seconds: 1.2, frames: [{ t: 0 }, { t: 0.25, armR: 1.45, armL: 1.2, bow: 0.15 }, { t: 0.85, armR: 1.45, armL: 1.2, bow: 0.15 }, { t: 1 }] },
  /** 剣を振り上げる */
  振り上げる: { seconds: 1.0, frames: [{ t: 0 }, { t: 0.35, armR: 2.9, armL: 2.6, head: -0.15 }, { t: 0.8, armR: 2.9, armL: 2.6, head: -0.15 }, { t: 1 }] },
  /** 後ずさる */
  後ずさる: { seconds: 1.0, frames: [{ t: 0 }, { t: 0.5, back: 0.25, armL: 0.5, armR: 0.5 }, { t: 0.8, back: 0.25 }, { t: 1 }] },
  /** 耳に当てる（石を耳に当てる） */
  耳に当てる: { seconds: 1.8, frames: [{ t: 0 }, { t: 0.25, armR: 2.3, tilt: 0.25 }, { t: 0.8, armR: 2.3, tilt: 0.25 }, { t: 1 }] },
  /** 床から物を拾う */
  拾う: { seconds: 1.2, frames: [{ t: 0 }, { t: 0.4, drop: 0.16, bow: 0.6, armR: 0.9 }, { t: 0.6, drop: 0.16, bow: 0.6, armR: 0.9 }, { t: 1 }] },
  /** 泣く（肩を震わせる） */
  泣く: { seconds: 1.8, frames: repeat(4, { head: 0.6, bow: 0.25, armL: 0.6, armR: 0.6 }, { lift: 0.02 }) },
  /** 小刀で何かを刻む（手もとを見ながら） */
  刻む: { seconds: 1.6, frames: repeat(4, { head: 0.55, bow: 0.25, armL: 0.9, armR: 0.95 }, { armR: 0.75 }) },
  /** 帳面を閉じる・紙を畳む（両手を合わせる） */
  畳む: { seconds: 0.9, frames: [{ t: 0 }, { t: 0.35, armL: 1.0, armR: 1.0, head: 0.3 }, { t: 0.6, armL: 1.1, armR: 1.1, head: 0.3 }, { t: 1 }] },
  /** あたりを見回す */
  見回す: { seconds: 1.8, frames: [{ t: 0 }, { t: 0.3, headTurn: 0.7 }, { t: 0.7, headTurn: -0.7 }, { t: 1 }] },
  /** 武器を構える */
  構える: { seconds: 1.0, frames: [{ t: 0 }, { t: 0.3, armR: 1.1, armL: 0.6, drop: 0.05, bow: 0.12 }, { t: 0.8, armR: 1.1, armL: 0.6, drop: 0.05, bow: 0.12 }, { t: 1 }] },
  /** こめかみに指を当てる */
  こめかみに指を当てる: { seconds: 1.6, frames: [{ t: 0 }, { t: 0.3, armR: 2.5, spreadR: 0.4, tilt: -0.15 }, { t: 0.8, armR: 2.5, spreadR: 0.4, tilt: -0.15 }, { t: 1 }] },
  /** 両腕を広げる（呼び込み・歌う） */
  腕を広げる: { seconds: 1.2, frames: [{ t: 0 }, { t: 0.3, spreadL: 1.0, spreadR: 1.0, head: -0.15 }, { t: 0.8, spreadL: 1.0, spreadR: 1.0, head: -0.15 }, { t: 1 }] },
  /** 歌う（体を少し揺らす） */
  歌う: { seconds: 2.4, frames: [{ t: 0 }, { t: 0.25, head: -0.2, tilt: 0.15 }, { t: 0.5, head: -0.2, tilt: -0.15 }, { t: 0.75, head: -0.2, tilt: 0.15 }, { t: 1 }] },
  /** 足を止める（はっとする） */
  足を止める: { seconds: 0.8, frames: [{ t: 0 }, { t: 0.25, lift: 0.04, head: -0.1 }, { t: 0.6, head: -0.1 }, { t: 1 }] },
};

/**
 * 続く姿勢（@姿勢 名前 座る）。「立つ」で元の姿勢に戻す。値の意味は GesturePose と同じ（turn は使わない）
 */
export const POSTURES: Readonly<Record<string, GesturePose>> = {
  座る: { drop: 0.2, armL: 0.6, armR: 0.6 },
  膝をついたまま: { drop: 0.22, bow: 0.3 },
  うつむいたまま: { head: 0.6, bow: 0.1 },
  背を丸める: { bow: 0.3, head: 0.2 },
};

/** 物の種類（台本に書く名前 → 見た目の id。見た目は models.ts） */
export const PROP_KINDS: Readonly<Record<string, string>> = {
  椀: 'bowl',
  灯: 'lamp',
  ともった灯: 'lampLit',
  石: 'stone',
  机: 'table',
  箱: 'box',
  瓦礫: 'rubble',
  木箱: 'crate',
  // 持ち物（人物の手・腰・背に付ける小さな物）
  測り棒: 'measuringRod',
  小さな灯: 'lampSmall',
  ともった小さな灯: 'lampSmallLit',
  袋: 'pouch',
  薬箱: 'medicineBox',
  紙包み: 'parcel',
  守り袋: 'charm',
  帳面: 'ledger',
  指示書: 'scroll',
  箸: 'chopsticks',
  剣: 'sword',
  折れた剣: 'brokenSword',
  槍: 'spear',
  小刀: 'knife',
  箒: 'broom',
};

/**
 * 人物の見た目（台本に書く名前 → 見た目の id。見た目は looks.ts）。
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
  ガレス: 'gareth',
  ミオ: 'mio',
  おかみ: 'baker',
  老婆: 'apothecary',
  売り子: 'vendor',
  番兵: 'guard',
  教官: 'instructor',
  見習い: 'apprentice',
};

/** 光の色（台本に書く名前 → 色） */
export const LIGHT_COLORS: Readonly<Record<string, number>> = {
  白: 0xf4f6ff,
  青: 0x9fd8ff,
  金: 0xffd27a,
};

/** 台本の読み込みに渡す、使える名前の一覧 */
export const scriptCatalog: ScriptCatalog = {
  gestures: Object.keys(GESTURES),
  props: Object.keys(PROP_KINDS),
  turnAway: Object.entries(GESTURES).flatMap(([name, g]) => (g.turnAway ? [name] : [])),
  melodies: Object.keys(MELODIES),
  timbres: Object.keys(TIMBRES),
  sounds: Object.keys(SOUND_EFFECTS),
  lightColors: Object.keys(LIGHT_COLORS),
  postures: Object.keys(POSTURES),
};
