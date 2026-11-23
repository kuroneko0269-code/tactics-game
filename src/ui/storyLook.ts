import type { StoryFont, TextSize } from '../save/saveStore';

/**
 * 物語の画面の書体と文字の大きさ（見た目の見本の2回目）。
 * - 書体は4種を同梱し、選ばれている書体だけを読み込む（npm の @fontsource から。外部へは読みに行かない）。
 *   ヒラギノ明朝・ヒラギノ丸ゴは同梱せず、端末に入っている書体を指定する（iPhone・iPad・Mac。無い端末では、
 *   明朝は Zen Old Mincho、丸ゴは Zen Maru Gothic で出る）。Zen Maru Gothic は、その選び肢を選んだ時と、ヒラギノ丸ゴが無い時だけ読み込む。
 *   発注者が1つに決めた後で、残りを外す
 * - 文字の大きさは、ページの根もとの印（data-text-size）で style.css の大きさの変数を切り替える
 */
/** Zen Maru Gothic の2つの太さ（台詞などの 500、名前などの 700。style.css で使う太さと合わせる） */
const loadZenMaruGothic = () => Promise.all([import('@fontsource/zen-maru-gothic/500.css'), import('@fontsource/zen-maru-gothic/700.css')]);

const LOADERS: Readonly<Record<StoryFont, () => Promise<unknown>>> = {
  zenOldMincho: () => Promise.all([import('@fontsource/zen-old-mincho/500.css'), import('@fontsource/zen-old-mincho/700.css')]),
  // Shippori Antique は太さが1種だけ（太字の所も同じ太さで出す。style.css）
  shipporiAntique: () => import('@fontsource/shippori-antique/400.css'),
  shipporiMincho: () => Promise.all([import('@fontsource/shippori-mincho/500.css'), import('@fontsource/shippori-mincho/700.css')]),
  // ヒラギノ明朝は同梱しない（端末に入っている書体を使う）。無い端末のために、代わりの Zen Old Mincho を読み込む
  hiraginoMincho: () => Promise.all([import('@fontsource/zen-old-mincho/500.css'), import('@fontsource/zen-old-mincho/700.css')]),
  // ヒラギノ丸ゴも同梱しない。端末に無い時だけ、代わりの Zen Maru Gothic を読み込む
  hiraginoMaru: () => (deviceHasFont('hiraginoMaru') ? Promise.resolve() : loadZenMaruGothic()),
  // Zen Maru Gothic は、ヒラギノ丸ゴがある端末でも必ずこれで出す（style.css の指定にヒラギノを入れない）
  zenMaruGothic: loadZenMaruGothic,
};

const loaded = new Set<StoryFont>();

/** 端末に入っている書体を使うものの、書体の名前（CSS の font-family。style.css の --kr-mincho と合わせる） */
const DEVICE_FONTS: Readonly<Partial<Record<StoryFont, readonly string[]>>> = {
  hiraginoMincho: ['Hiragino Mincho ProN', 'Hiragino Mincho Pro'],
  hiraginoMaru: ['Hiragino Maru Gothic ProN', 'Hiragino Maru Gothic Pro'],
};
const found = new Map<StoryFont, boolean>();

/**
 * 端末に書体が入っているか（文字の幅を測って調べる）: 書体を指定した文字列と、代わりの書体だけの文字列の幅を比べ、
 * どの代わりの書体とも幅が同じなら、その書体は無い（指定が効かず、代わりで出ている）。同梱の書体は、いつも true
 */
export function deviceHasFont(font: StoryFont): boolean {
  const names = DEVICE_FONTS[font];
  if (!names) return true;
  const cached = found.get(font);
  if (cached !== undefined) return cached;
  let ok = false;
  try {
    const g = document.createElement('canvas').getContext('2d');
    if (g) {
      const sample = '消された暦の夜、灯を手渡す。ABCabc123';
      const width = (family: string) => {
        g.font = `40px ${family}`;
        return g.measureText(sample).width;
      };
      ok = names.some((name) => ['monospace', 'sans-serif', 'serif'].some((fallback) => Math.abs(width(`'${name}', ${fallback}`) - width(fallback)) > 0.5));
    }
  } catch {
    ok = false;
  }
  found.set(font, ok);
  return ok;
}

export function applyStoryLook(font: StoryFont, size: TextSize): void {
  const root = document.documentElement;
  root.dataset.storyFont = font;
  root.dataset.textSize = size;
  if (!loaded.has(font)) {
    loaded.add(font);
    // 読み込む前は、端末の明朝体（丸ゴシックの選び肢では、端末のゴシック体）で出る
    LOADERS[font]().catch(() => loaded.delete(font));
  }
}
