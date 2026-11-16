import { describe, expect, it } from 'vitest';
import { LOOKS } from '../data/story/looks';
import { contrast, hexColor, plateStyle } from './speakerStyle';

describe('名前の札の色', () => {
  it('地の色は服の主な色、縁は帯の色。文字は地の明るさで白か濃い色', () => {
    expect(plateStyle(0x1f2a4a, 0x5fd0e0)).toEqual({ background: '#1f2a4a', color: '#ffffff', border: '#5fd0e0' });
    expect(plateStyle(0xe4e4e8, 0x8a8a96).color).toBe('#141a26');
    expect(hexColor(0x00ff)).toBe('#0000ff');
  });

  it('中くらいの明るさの服は、地の色を少し寄せて読みやすくする', () => {
    const s = plateStyle(0x9a7a4a, 0);
    expect(s.background).not.toBe('#9a7a4a');
    expect(contrast(Number.parseInt(s.background.slice(1), 16), Number.parseInt(s.color.slice(1), 16))).toBeGreaterThanOrEqual(4.5);
  });

  it('物語の人物の見た目のすべてで、名前の文字が読みやすい（コントラスト比 4.5 以上）', () => {
    for (const [id, look] of Object.entries(LOOKS)) {
      const s = plateStyle(look.body, look.accent);
      const text = Number.parseInt(s.color.slice(1), 16);
      expect(contrast(Number.parseInt(s.background.slice(1), 16), text), id).toBeGreaterThanOrEqual(4.5);
    }
  });
});
