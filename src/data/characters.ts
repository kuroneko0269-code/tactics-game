/**
 * 人物（フェーズ2-6）。人物には、名前とは別に、変わらない id を持たせる。部隊のユニットの id が、その人物の id。
 * 画面に出す名前は src/ui/text.ts に id で引く（物語の確定で名前が変わっても、id は変えない）。
 * 専用ジョブ（jobs.ts の eligibility）は、この id で就ける人物を指定する。
 * 後のフェーズで、物語の仲間が 9 人加わる。
 */

/** 最初の5人の id（主人公・戦士・弓使い・魔道士・治癒師） */
export const characterIds = {
  touma: 'touma',
  gord: 'gord',
  kiri: 'kiri',
  fen: 'fen',
  nono: 'nono',
} as const;

/**
 * セーブデータの版 4 までのユニットの id（hero-1〜5）から、人物の id への対応。古いセーブデータを直す時に使う
 */
export const legacyUnitIds: Readonly<Record<string, string>> = {
  'hero-1': characterIds.touma,
  'hero-2': characterIds.gord,
  'hero-3': characterIds.kiri,
  'hero-4': characterIds.fen,
  'hero-5': characterIds.nono,
};
