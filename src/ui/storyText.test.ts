import { describe, expect, it } from 'vitest';
import { MELODIES, SOUND_EFFECTS } from '../data/sounds';
import { trialWeirBattle } from '../data/battles/trialWeir';
import { melodyNotes, noteFrequency } from './sound';
import { TEXT } from './text';

/** 序章に足りない仕組み（PR A）: 旋律の読み方と、画面に出す文の対応 */
describe('音と手ほどきの文', () => {
  it('音の高さを周波数に（A4 = 440Hz、半音・休み）。読めない高さはエラー', () => {
    expect(noteFrequency('A4')).toBeCloseTo(440);
    expect(noteFrequency('C4')).toBeCloseTo(261.63, 1);
    expect(noteFrequency('F#4')).toBeCloseTo(369.99, 1);
    expect(noteFrequency('-')).toBeNull();
    expect(() => noteFrequency('H4')).toThrow();
  });

  it('旋律は、すべての音を読める。開始時刻は前の音の長さの合計', () => {
    for (const [name, m] of Object.entries(MELODIES)) {
      const notes = melodyNotes(m);
      expect(notes.length, name).toBeGreaterThan(0);
      notes.forEach((n, i) => {
        expect(n.length, name).toBeGreaterThan(0);
        if (i > 0) expect(n.start).toBeCloseTo(notes[i - 1]!.start + notes[i - 1]!.length);
      });
    }
  });

  it('手ほどきの段には、すべて文がある。画面にも出す効果音の印は、ある効果音', () => {
    for (const site of [trialWeirBattle]) for (const step of site.tutorial ?? []) expect(TEXT.tutorial.steps[step.id], step.id).toBeDefined();
    const ids = new Set(Object.values(SOUND_EFFECTS));
    for (const id of Object.keys(TEXT.sound.effectMarks)) expect(ids.has(id as never), id).toBe(true);
  });
});
