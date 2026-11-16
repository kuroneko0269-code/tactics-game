import type { ScriptRules } from '../../core/scriptRules';

/**
 * 台本の決まり（読む量を増やさないための決まり。docs/SCRIPT_GUIDE.md の「読む量の決まり」）。
 * 検査は src/core/scriptRules.ts。台本のテスト（src/data/story/story.test.ts）で全部の台本を調べる。
 */
export const SCRIPT_RULES: ScriptRules = {
  /** 台詞は、1つの枠に 40 字以内 */
  maxLineChars: 40,
  /** 同じ人物の台詞は、続けて 3 枠まで（4 枠以上続いたら知らせる） */
  maxSameSpeakerRun: 3,
  /** 1つの場面の語りは 2 行まで（3 行以上あったら知らせる） */
  maxNarrationLines: 2,
};

/**
 * 決まりに合わない所があった時に、テスト（npm test）を失敗にするか。
 * 今の序章の台本は決まりに合っていないので、台本を「ゲーム脚本」に差し替えるまでは知らせるだけにする（false）。
 * 差し替えた後に true にする。
 */
export const ENFORCE_SCRIPT_RULES = false;
