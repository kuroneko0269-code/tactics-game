/**
 * 場面の時刻の光（序章の改訂の PR で足した。朝・昼・夕方・夜）。台本の `@時刻 夜`、会話用のマップの `time`、戦場の定義の `time` から名前で選ぶ。
 * sky は空の色、hemi は空からの光（上の色・下の色・明るさ）、sun は日の光（月の光）の色と明るさ。見た目は src/render/lighting.ts が当てる。
 * 夜は暗くするが、人物と物が見分けられる明るさは保つ（空からの光を青く、弱めに残す）。灯（光る物）は夜にいちばん映える。
 */
export interface TimeLighting {
  readonly sky: number;
  readonly hemiSky: number;
  readonly hemiGround: number;
  readonly hemiIntensity: number;
  readonly sunColor: number;
  readonly sunIntensity: number;
}

/** 時刻の名前（台本に書く名前）→ 光。省いた時は「昼」 */
export const TIMES_OF_DAY: Readonly<Record<string, TimeLighting>> = {
  /** 朝: 淡い空、少し黄みのやわらかい光 */
  朝: { sky: 0xc4dbee, hemiSky: 0xfff3e0, hemiGround: 0x5a4a3a, hemiIntensity: 1.35, sunColor: 0xffe6c4, sunIntensity: 1.9 },
  /** 昼: 今までの光（澄んだ青空、白い光） */
  昼: { sky: 0x9fc6e8, hemiSky: 0xdfefff, hemiGround: 0x5a4a3a, hemiIntensity: 1.4, sunColor: 0xffffff, sunIntensity: 2.2 },
  /** 夕方: 茜の空、橙の低い光 */
  夕方: { sky: 0xe3a27a, hemiSky: 0xffd6b0, hemiGround: 0x4a3a34, hemiIntensity: 1.15, sunColor: 0xff9f62, sunIntensity: 1.6 },
  /** 夜: 紺の空、青く弱い光（人物と物は見分けられる明るさ）。灯と星が映える */
  夜: { sky: 0x0c1428, hemiSky: 0x7f92c8, hemiGround: 0x23212c, hemiIntensity: 0.85, sunColor: 0xa8bcff, sunIntensity: 0.5 },
};

/** 省いた時の時刻 */
export const DEFAULT_TIME = '昼';
