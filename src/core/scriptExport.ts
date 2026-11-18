/**
 * 「画面に出るものだけ」の書き出し（物語の作者が、実装が脚本のとおりかを読んで確かめるため）。
 * 台本から、場所と時の札・字幕・台詞（話者と肩書きつき）・物に書かれた文字・名札・章の題・操作の案内を、出る順に取り出す。
 * 動き・カメラ・音は出さない（画面に文字として出ないため）。ここは台本を読むだけの計算で、画面にも定義データにも依存しない。
 */
import { plainText, type Directive, type Script } from './script';

export type ScreenTextKind = '札' | '字幕' | '台詞' | '物の文字' | '名札' | '章の題' | '操作の案内';

export interface ScreenText {
  readonly kind: ScreenTextKind;
  /** 画面に出る文（台詞は「話者〔肩書き〕「台詞」」の形。字幕の改行は「 / 」） */
  readonly text: string;
}

/** 操作の場面の案内の文（台本に案内の文がない時に画面が出す文。画面の文言は呼び出し側から受け取る） */
export interface ControlLabels {
  readonly walk: string;
  readonly tapDefault: string;
  readonly listenDefault: string;
  readonly holdDefault: string;
}

/** 台本の中で、画面に文字として出るものを、出る順に並べる */
export function screenTextOf(script: Script, labels: ControlLabels): ScreenText[] {
  const out: ScreenText[] = [];
  const directive = (d: Directive) => {
    switch (d.kind) {
      case 'together':
        d.directives.forEach(directive);
        return;
      case 'placard':
        out.push({ kind: '札', text: d.text });
        return;
      case 'nameTag':
        out.push({ kind: '名札', text: `${d.actor}〔${d.title}〕` });
        return;
      case 'chapterTitle':
        out.push({ kind: '章の題', text: `${d.title}「${d.subtitle}」` });
        return;
      case 'walkControl':
        out.push({ kind: '操作の案内', text: labels.walk });
        return;
      case 'tapControl':
        out.push({ kind: '操作の案内', text: d.label || labels.tapDefault });
        return;
      case 'listen':
        out.push({ kind: '操作の案内', text: d.label || labels.listenDefault });
        return;
      case 'hold':
        out.push({ kind: '操作の案内', text: d.label || labels.holdDefault });
        return;
      default:
        return;
    }
  };
  for (const step of script.steps) {
    if (step.kind === 'directive') {
      directive(step.directive);
      continue;
    }
    step.directives.forEach(directive);
    const text = plainText(step.text).replace(/\n/g, ' / ');
    if (step.speaker === null) out.push({ kind: '字幕', text: step.overDark ? `${text}（暗転の上）` : text });
    else if (step.inscription) out.push({ kind: '物の文字', text: `${step.speaker}「${text}」` });
    else out.push({ kind: '台詞', text: `${step.speaker}${step.speakerTitle ? `〔${step.speakerTitle}〕` : ''}「${text}」${step.portrait === false ? '（顔なし）' : ''}` });
  }
  return out;
}

/** 書き出しの1行（例: 「札」のあとを全角の空白でそろえて「今 暦の塔」） */
export const formatScreenText = (t: ScreenText) => `${t.kind.padEnd(6, '\u3000')}${t.text}`;
