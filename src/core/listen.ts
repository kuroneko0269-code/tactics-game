/**
 * 「耳に当てて聞く」操作の進み具合（序章の場面9。台本の @聞く）。画面にも音の仕組みにも依存しない計算だけを持つ。
 *
 * - 押している間だけ時間が進む（離すと止まり、押し直すと続きから）。進んだ時間は「押していた時間の合計」。
 * - 始めの shellMs の間は、貝殻のようなかすかな音だけが鳴る。その後、旋律の音を順に鳴らす（旋律の最初の音は shellMs の時点）。
 * - 貝殻の音は、旋律が始まるにつれて小さくなる。旋律の音量は、始めは小さく、少しずつ大きくなる（「やがて、それが節になる」）。
 * - 旋律の最後の音が鳴りきったら終わり（終わりの三つの音まで）。
 * 時刻はすべてミリ秒の整数。
 */

export interface ListenTimeline {
  /** 貝殻の音だけの時間 */
  readonly shellMs: number;
  /** 旋律の各音の始まり（旋律の始まりからの時刻） */
  readonly noteStarts: readonly number[];
  /** 旋律の長さ（最後の音が鳴りきるまで） */
  readonly melodyMs: number;
  /** 旋律の音量が小さい所から大きくなるまでの時間 */
  readonly swellMs: number;
}

export interface ListenPhase {
  /** 旋律の何個目の音まで鳴りはじめたか（0 ならまだ貝殻の音だけ） */
  readonly notesStarted: number;
  /** 次に鳴らす音の番号（0 から。すべて鳴らしたら noteStarts の数） */
  readonly nextNote: number;
  /** 貝殻の音の大きさ（0〜100） */
  readonly shellLevel: number;
  /** 旋律の音の大きさ（0〜100） */
  readonly melodyLevel: number;
  /** 最後まで聞き終えた */
  readonly done: boolean;
}

/** 合計の長さ（貝殻の音 + 旋律） */
export const listenTotal = (t: ListenTimeline) => t.shellMs + t.melodyMs;

/** 押していた時間の合計 elapsed の時点の様子 */
export function listenPhase(t: ListenTimeline, elapsed: number): ListenPhase {
  const e = Math.max(0, Math.floor(elapsed));
  const inMelody = e - t.shellMs;
  let started = 0;
  for (const s of t.noteStarts) if (inMelody >= s) started++;
  // 貝殻の音: 始めの 1/3 で立ち上がり、旋律が始まると swellMs かけて消える
  const rise = Math.max(1, Math.floor(t.shellMs / 3));
  const shellLevel = inMelody < 0 ? Math.min(100, Math.floor((e * 100) / rise)) : Math.max(0, 100 - Math.floor((inMelody * 100) / Math.max(1, t.swellMs)));
  // 旋律の音: 30 から始まり、swellMs かけて 100 へ
  const melodyLevel = inMelody < 0 ? 0 : Math.min(100, 30 + Math.floor((inMelody * 70) / Math.max(1, t.swellMs)));
  return { notesStarted: started, nextNote: started, shellLevel, melodyLevel, done: e >= listenTotal(t) };
}

/** 押した・離したの記録（押した時刻と離した時刻の組）から、押していた時間の合計 */
export function pressedMs(presses: readonly { readonly down: number; readonly up?: number }[], now: number): number {
  let sum = 0;
  for (const p of presses) sum += Math.max(0, (p.up ?? now) - p.down);
  return sum;
}
