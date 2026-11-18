/**
 * 台本の決まりの検査（読む量を増やさないための決まり）。台本（script.ts で読んだもの）を調べ、決まりに合わない所を、
 * 何行目かを付けて一覧で返す。数値（字数など）は定義データ（src/data/story/scriptRules.ts）から受け取る。
 * 決まりの説明は docs/SCRIPT_GUIDE.md の「読む量の決まり」。
 */
import { plainText, type Script } from './script';

export interface ScriptRules {
  /** 台詞1つの枠の字数の上限（ルビの読みは数えない） */
  readonly maxLineChars: number;
  /** 同じ人物が続けて話してよい枠の数（これを超えると知らせる） */
  readonly maxSameSpeakerRun: number;
  /**
   * 1つの場面（1つの台本）で字幕（語り）に使ってよい行の数（これを超えると知らせる）。画面に出る行で数える（／ で改行した字幕は2行）。
   * 場所と時の札・物の文字は数えない
   */
  readonly maxNarrationLines: number;
  /** 台本ごとの字幕の行数の上限の例外（台本の名前 → 行数。序章の場面1は前提の字幕のため 3 行） */
  readonly narrationLimits?: Readonly<Record<string, number>>;
  /** 字幕（語り）の画面の1行の字数の上限（省くと調べない。／ で改行した行ごとに数える） */
  readonly maxCaptionLineChars?: number;
  /** 字数の上限を超えてよい字幕の行（ゲーム脚本の字幕を優先した例外。ルビを除いた1行の文） */
  readonly captionExceptions?: readonly string[];
}

export type ScriptRuleKind = 'length' | 'sameSpeaker' | 'narration' | 'caption';

export interface ScriptRuleWarning {
  readonly scriptId: string;
  /** 何行目か（1 から数える） */
  readonly line: number;
  readonly kind: ScriptRuleKind;
  readonly message: string;
}

/** 字数（ルビの読みを除いた本文の文字の数。サロゲートペアも1字） */
export const charCount = (text: string) => [...text].length;

/** 台本の決まりを調べる。合わない所の一覧（合っていれば空） */
export function checkScriptRules(script: Script, rules: ScriptRules): ScriptRuleWarning[] {
  const out: ScriptRuleWarning[] = [];
  const warn = (line: number, kind: ScriptRuleKind, message: string) => out.push({ scriptId: script.id, line, kind, message });
  let runSpeaker: string | null = null;
  let runLength = 0;
  /** 字幕の画面の行（台本の行の番号を、出る行の数だけ並べる） */
  const narration: number[] = [];
  for (const step of script.steps) {
    if (step.kind !== 'line') continue;
    const text = plainText(step.text);
    if (step.speaker === null) {
      narration.push(...text.split('\n').map(() => step.line));
      runSpeaker = null;
      runLength = 0;
      const max = rules.maxCaptionLineChars;
      if (max !== undefined) {
        for (const row of text.split('\n')) {
          const n = charCount(row);
          if (n > max && !(rules.captionExceptions ?? []).includes(row)) warn(step.line, 'caption', `字幕の1行が ${n} 字あります（1行に ${max} 字まで）: ${row}`);
        }
      }
      continue;
    }
    const n = charCount(text);
    if (n > rules.maxLineChars) warn(step.line, 'length', `${step.inscription ? '物の文字' : '台詞'}が ${n} 字あります（1つの枠に ${rules.maxLineChars} 字まで）: ${step.speaker}「${text}」`);
    // 物の文字は、人物の台詞の続きに数えない
    if (step.inscription) {
      runSpeaker = null;
      runLength = 0;
      continue;
    }
    if (step.speaker === runSpeaker) runLength++;
    else {
      runSpeaker = step.speaker;
      runLength = 1;
    }
    // 上限を超えた最初の枠で1回だけ知らせる
    if (runLength === rules.maxSameSpeakerRun + 1) {
      warn(step.line, 'sameSpeaker', `${step.speaker}の台詞が ${rules.maxSameSpeakerRun + 1} 枠続いています（続けて ${rules.maxSameSpeakerRun} 枠まで）`);
    }
  }
  const limit = rules.narrationLimits?.[script.id] ?? rules.maxNarrationLines;
  if (narration.length > limit) {
    warn(
      narration[limit]!,
      'narration',
      `字幕が ${narration.length} 行あります（この場面は ${limit} 行まで。字幕の台本の行: ${[...new Set(narration)].join('・')}行目）`,
    );
  }
  return out.sort((a, b) => a.line - b.line);
}

/** 知らせの一覧を、人が読む文にする（台本の名前と行の番号つき） */
export const formatRuleWarning = (w: ScriptRuleWarning) => `台本 ${w.scriptId}: ${w.line}行目: ${w.message}`;
