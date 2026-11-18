import { describe, expect, it } from 'vitest';
import { MELODIES, SOUND_EFFECTS } from '../data/sounds';
import { prologueBattles } from '../data/battles/prologue';
import { melodyNotes, noteFrequency } from './sound';
import { parseScriptOrThrow } from '../core/script';
import { scriptTexts } from '../data/story/scripts';
import { scriptCatalog } from '../data/story/stageDefs';
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
    for (const site of prologueBattles) for (const step of site.tutorial ?? []) expect(TEXT.tutorial.steps[step.id], step.id).toBeDefined();
    const ids = new Set(Object.values(SOUND_EFFECTS));
    for (const id of Object.keys(TEXT.sound.effectMarks)) expect(ids.has(id as never), id).toBe(true);
  });
});

describe('戦闘の台本の人物', () => {
  it('戦闘中の会話と戦闘の後の台本の人物の名前は、戦場の cast か部隊の人物の名前で引ける', () => {
    for (const site of prologueBattles) {
      const ids = [...(site.events ?? []).flatMap((e) => e.effects.flatMap((x) => (x.kind === 'dialogue' ? [x.scriptId] : []))), ...(site.afterVictory ? [site.afterVictory] : [])];
      const names = new Set([...Object.keys(site.cast ?? {}), ...Object.values(TEXT.unitNames)]);
      for (const id of ids) {
        const script = parseScriptOrThrow(id, scriptTexts[id]!, scriptCatalog);
        for (const step of script.steps) {
          for (const d of step.kind === 'line' ? step.directives : [step.directive]) {
            const actor = 'actor' in d ? d.actor : undefined;
            if (actor && d.kind !== 'light') expect(names.has(actor), `${id} ${step.line}行目 ${actor}`).toBe(true);
            if (d.kind === 'light' && d.actor) expect(names.has(d.actor), `${id} ${step.line}行目 ${d.actor}`).toBe(true);
          }
        }
      }
    }
  });
});

describe('場面を選ぶ（確認用の機能）の場面の札', () => {
  it('本編のすべての章と場面に名前がある。札は「序章 場面4 家・夕食と工房の夜」の形', async () => {
    const { books } = await import('../data/story/books');
    for (const b of books) {
      for (const c of b.chapters) {
        expect(TEXT.story.chapters[c.id], c.id).toBeDefined();
        for (const s of c.scenes) expect(TEXT.story.scenes[s.id], s.id).toBeDefined();
      }
    }
    expect(TEXT.story.sceneLabel('序章', 4, TEXT.story.scenes.home!)).toBe('序章 場面4 家・夕食と工房の夜');
  });
});
