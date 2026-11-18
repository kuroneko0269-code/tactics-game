import { describe, expect, it } from 'vitest';
import { listenPhase, listenRestart, listenTotal, pressedMs, type ListenTimeline } from './listen';

const t: ListenTimeline = { shellMs: 3000, noteStarts: [0, 400, 800, 1600], melodyMs: 2800, swellMs: 2000 };

describe('耳に当てて聞く操作の進み具合', () => {
  it('始めは貝殻の音だけ。やがて旋律の音が順に鳴り、旋律の音量は少しずつ大きくなる', () => {
    expect(listenPhase(t, 0)).toMatchObject({ notesStarted: 0, melodyLevel: 0, done: false });
    expect(listenPhase(t, 1000).shellLevel).toBe(100);
    expect(listenPhase(t, 2999).notesStarted).toBe(0);
    expect(listenPhase(t, 3000)).toMatchObject({ notesStarted: 1, melodyLevel: 30 });
    expect(listenPhase(t, 3850).notesStarted).toBe(3);
    expect(listenPhase(t, 5000)).toMatchObject({ melodyLevel: 100, shellLevel: 0 });
  });

  it('最後の音が鳴りきったら終わり', () => {
    expect(listenTotal(t)).toBe(5800);
    expect(listenPhase(t, 5799).done).toBe(false);
    expect(listenPhase(t, 5800)).toMatchObject({ done: true, notesStarted: 4, nextNote: 4 });
  });

  it('押していた時間の合計（貝殻の音の間に離した時は、押し直すと続きから）', () => {
    // 0〜1500 押す、離して 1500〜4000 は止まる、4000 から押し直す
    const presses = [{ down: 0, up: 1500 }, { down: 4000 }];
    expect(pressedMs(presses, 4000)).toBe(1500);
    expect(pressedMs(presses, 6000)).toBe(3500);
    // 押し直した後は、離す前の続き（旋律の1つ目の音から）
    expect(listenPhase(t, pressedMs(presses, 6000)).notesStarted).toBe(2);
    expect(listenPhase(t, pressedMs([{ down: 0, up: 1500 }], 9999)).notesStarted).toBe(0);
  });

  it('旋律が始まった後に離して押し直すと、節の頭（旋律の1つ目の音）から鳴らし直す', () => {
    // 旋律の3つ目の音の途中（3850）で離した → 押し直すと 3000（旋律の頭）から
    expect(listenRestart(t, 3850)).toBe(3000);
    expect(listenPhase(t, listenRestart(t, 3850))).toMatchObject({ notesStarted: 1, nextNote: 1, melodyLevel: 30 });
    // 終わりの音の手前で離しても、頭から（終わりの三つの音まで、途切れずに一度聞かせる）
    expect(listenRestart(t, 5700)).toBe(3000);
    // 貝殻の音の間なら、続きから。旋律の頭ちょうどなら、そのまま
    expect(listenRestart(t, 1200)).toBe(1200);
    expect(listenRestart(t, 3000)).toBe(3000);
    // 聞き終えていれば、そのまま
    expect(listenRestart(t, 5800)).toBe(5800);
  });
});
