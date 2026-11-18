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
  /** 1つの場面の字幕は、画面に出る行で 2 行まで（3 行以上あったら知らせる。場所と時の札は数えない） */
  maxNarrationLines: 2,
  /** ゲーム脚本の改訂の決まり: 場面1（堰の戦闘の前）だけは、前提の字幕のため 3 行まで */
  narrationLimits: { prologueWeirIntro: 3 },
  /** 字幕の画面の1行は、台詞と同じ 40 字以内を目安にする */
  maxCaptionLineChars: 40,
  /**
   * 40 字を超えてよい字幕の行（ゲーム脚本の字幕を優先した例外の記録）。今の序章には、40 字を超える字幕の行はない。
   * 足す時は、ルビを除いた1行の文をそのまま書き、どの場面かを書き添える
   */
  captionExceptions: [],
};

/**
 * 決まりに合わない所があった時に、テスト（npm test）を失敗にするか。
 * 序章の台本を「ゲーム脚本」に差し替えたので、失敗として扱う（true）。
 */
export const ENFORCE_SCRIPT_RULES = true;
