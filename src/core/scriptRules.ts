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
  /** 1つの場面（1つの台本）で語りに使ってよい行の数（これを超えると知らせる） */
  readonly maxNarrationLines: number;
}

export type ScriptRuleKind = 'length' | 'sameSpeaker' | 'narration';

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
  const narration: number[] = [];
  for (const step of script.steps) {
    if (step.kind !== 'line') continue;
    const text = plainText(step.text);
    if (step.speaker === null) {
      narration.push(step.line);
      runSpeaker = null;
      runLength = 0;
      continue;
    }
    const n = charCount(text);
    if (n > rules.maxLineChars) warn(step.line, 'length', `台詞が ${n} 字あります（1つの枠に ${rules.maxLineChars} 字まで）: ${step.speaker}「${text}」`);
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
  if (narration.length > rules.maxNarrationLines) {
    warn(
      narration[rules.maxNarrationLines]!,
      'narration',
      `語りが ${narration.length} 行あります（1つの場面に ${rules.maxNarrationLines} 行まで。語りの行: ${narration.join('・')}行目）`,
    );
  }
  return out.sort((a, b) => a.line - b.line);
}

/** 知らせの一覧を、人が読む文にする（台本の名前と行の番号つき） */
export const formatRuleWarning = (w: ScriptRuleWarning) => `台本 ${w.scriptId}: ${w.line}行目: ${w.message}`;
