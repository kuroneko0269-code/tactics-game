import type { StoryFont, TextSize } from '../save/saveStore';

/**
 * 物語の画面の書体と文字の大きさ（見た目の見本の2回目）。
 * - 書体は3種を同梱し、選ばれている書体だけを読み込む（npm の @fontsource から。外部へは読みに行かない）。
 *   ヒラギノ明朝は同梱せず、端末に入っている書体を指定する（iPhone・iPad・Mac。無い端末では Zen Old Mincho で出る）。
 *   発注者が1つに決めた後で、残りを外す
 * - 文字の大きさは、ページの根もとの印（data-text-size）で style.css の大きさの変数を切り替える
 */
const LOADERS: Readonly<Record<StoryFont, () => Promise<unknown>>> = {
  zenOldMincho: () => Promise.all([import('@fontsource/zen-old-mincho/500.css'), import('@fontsource/zen-old-mincho/700.css')]),
  // Shippori Antique は太さが1種だけ（太字の所も同じ太さで出す。style.css）
  shipporiAntique: () => import('@fontsource/shippori-antique/400.css'),
  shipporiMincho: () => Promise.all([import('@fontsource/shippori-mincho/500.css'), import('@fontsource/shippori-mincho/700.css')]),
  // ヒラギノ明朝は同梱しない（端末に入っている書体を使う）。無い端末のために、代わりの Zen Old Mincho を読み込む
  hiraginoMincho: () => Promise.all([import('@fontsource/zen-old-mincho/500.css'), import('@fontsource/zen-old-mincho/700.css')]),
};

const loaded = new Set<StoryFont>();

export function applyStoryLook(font: StoryFont, size: TextSize): void {
  const root = document.documentElement;
  root.dataset.storyFont = font;
  root.dataset.textSize = size;
  if (!loaded.has(font)) {
    loaded.add(font);
    // 読み込む前は、端末の明朝体で出る
    LOADERS[font]().catch(() => loaded.delete(font));
  }
}
