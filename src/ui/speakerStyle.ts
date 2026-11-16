/**
 * 名前の札の色（会話の枠）。人物の服の主な色を札の地の色にし、文字の色は地の明るさで白か濃い色に決める（読みやすさのため）。
 * 縁の色は帯の色。画面にもブラウザにも依存しない計算だけ（テストしやすいように分けた）。
 */
export interface PlateStyle {
  readonly background: string;
  readonly color: string;
  readonly border: string;
}

export const hexColor = (c: number) => `#${(c & 0xffffff).toString(16).padStart(6, '0')}`;

/** 色の明るさ（0〜1。人の目の感じ方に合わせた相対輝度） */
export function luminance(c: number): number {
  const ch = (v: number) => {
    const s = v / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * ch((c >> 16) & 0xff) + 0.7152 * ch((c >> 8) & 0xff) + 0.0722 * ch(c & 0xff);
}

/** 文字の色と地の色のコントラスト比（1〜21。4.5 以上なら読みやすい） */
export function contrast(a: number, b: number): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x) as [number, number];
  return (hi + 0.05) / (lo + 0.05);
}

const LIGHT_TEXT = 0xffffff;
const DARK_TEXT = 0x141a26;

/** 2つの色を混ぜる（t が 0 で a、1 で b） */
function mix(a: number, b: number, t: number): number {
  const ch = (shift: number) => Math.round(((a >> shift) & 0xff) * (1 - t) + ((b >> shift) & 0xff) * t);
  return (ch(16) << 16) | (ch(8) << 8) | ch(0);
}

/** 読みやすいとするコントラスト比 */
const READABLE = 4.5;

/**
 * 服の色（body）と帯の色（accent）から、名前の札の色を決める。
 * 中くらいの明るさの服で文字が読みにくい時は、地の色を文字と反対の側へ少しずつ寄せる（色合いは保つ）
 */
export function plateStyle(body: number, accent: number): PlateStyle {
  const text = contrast(body, LIGHT_TEXT) >= contrast(body, DARK_TEXT) ? LIGHT_TEXT : DARK_TEXT;
  const away = text === LIGHT_TEXT ? 0x000000 : 0xffffff;
  let bg = body;
  for (let t = 0.05; contrast(bg, text) < READABLE && t <= 1; t += 0.05) bg = mix(body, away, t);
  return { background: hexColor(bg), color: hexColor(text), border: hexColor(accent) };
}
