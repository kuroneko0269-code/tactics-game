import type { TextSize } from '../save/saveStore';

/**
 * ゲーム全体の書体と、物語の画面の文字の大きさ。
 * - 書体は1つ（発注者が決定）: ヒラギノ丸ゴ（Hiragino Maru Gothic ProN → Pro）。無い端末では Zen Maru Gothic で出す（style.css の --kr-font）。
 *   ヒラギノ丸ゴは同梱せず、端末に入っている書体を使う（iPhone・iPad・Mac）。Zen Maru Gothic は同梱し（npm の @fontsource から。外部へは読みに行かない）、
 *   ヒラギノ丸ゴが無い端末でだけ読み込む
 * - 文字の大きさは、ページの根もとの印（data-text-size）で style.css の大きさの変数を切り替える
 */

/** 端末の書体の名前（CSS の font-family。style.css の --kr-font の先頭と合わせる） */
export const DEVICE_FONT_NAMES = ['Hiragino Maru Gothic ProN', 'Hiragino Maru Gothic Pro'] as const;

let deviceFont: boolean | undefined;

/**
 * 端末にヒラギノ丸ゴが入っているか（文字の幅を測って調べる）: 書体を指定した文字列と、代わりの書体だけの文字列の幅を比べ、
 * どの代わりの書体とも幅が同じなら、その書体は無い（指定が効かず、代わりで出ている）
 */
export function deviceHasMaruGothic(): boolean {
  if (deviceFont !== undefined) return deviceFont;
  let ok = false;
  try {
    const g = document.createElement('canvas').getContext('2d');
    if (g) {
      const sample = '消された暦の夜、灯を手渡す。ABCabc123';
      const width = (family: string) => {
        g.font = `40px ${family}`;
        return g.measureText(sample).width;
      };
      ok = DEVICE_FONT_NAMES.some((name) => ['monospace', 'sans-serif', 'serif'].some((fallback) => Math.abs(width(`'${name}', ${fallback}`) - width(fallback)) > 0.5));
    }
  } catch {
    ok = false;
  }
  deviceFont = ok;
  return ok;
}

let fontRequested = false;

/** 書体を用意する（ヒラギノ丸ゴが無い端末でだけ、Zen Maru Gothic の2つの太さを読み込む。本文の 500 と、名前や見出しの 700） */
function prepareFont(): void {
  if (fontRequested) return;
  fontRequested = true;
  const root = document.documentElement;
  if (deviceHasMaruGothic()) {
    root.dataset.font = 'device';
    return;
  }
  root.dataset.font = 'bundled';
  Promise.all([import('@fontsource/zen-maru-gothic/500.css'), import('@fontsource/zen-maru-gothic/700.css')]).catch(() => {
    fontRequested = false;
  });
}

export function applyStoryLook(size: TextSize): void {
  prepareFont();
  document.documentElement.dataset.textSize = size;
}
