import type { ScriptRules } from '../../core/scriptRules';

/**
 * 台本の決まり（読む量を増やさないための決まり。docs/SCRIPT_GUIDE.md の「読む量の決まり」）。
 * 検査は src/core/scriptRules.ts。台本のテスト（src/data/story/story.test.ts）で全部の台本を調べる。
 */
export const SCRIPT_RULES: ScriptRules = {
  /** 台詞は、1つの枠に 40 字以内 */
  maxLineChars: 40,
  /**
   * 同じ人物の台詞が続けて何枠まで続いてよいか。序章の演出の直し（実際の画面での初見の検査）で、台詞を意味の切れ目で
   * 分けるために、発注者の指示でこの制限を外した（大きな数にしてある）
   */
  maxSameSpeakerRun: 99,
  /**
   * 1つの場面の字幕は、画面に出る行で 4 行まで（5 行以上あったら知らせる。場所と時の札は数えない）。
   * 序章の演出の直しで、発注者の指示により 2 行（場面1だけ 3 行）から 4 行に緩めた。分かりやすさのために超える場面は narrationLimits に書く
   */
  maxNarrationLines: 4,
  // 場面1の戦闘の前: 物語の作者の直し（2026-11-19）で、1-5 が「…沈む。」「だから今日、崩しておく。」「水は、西の谷へ逃がす。」の三枠になったため
  narrationLimits: { prologueWeirIntro: 5 },
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
