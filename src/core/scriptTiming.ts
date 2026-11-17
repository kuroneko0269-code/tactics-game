/**
 * 台本の見込みの時間（ゲーム脚本の「見込みの時間」と比べるため）。台本の手順ごとの時間を足し合わせる。
 * 台詞と字幕は、読む速さ（1字あたりの時間 + 1枠あたりの時間）で見込む。動きの時間は定義データ（仕草の秒・歩く速さ・旋律の長さ）から受け取る。
 * 操作の場面は、操作に慣れた人の時間で見込む（歩かせる1マス・タップ・聞く操作の長さ）。時間はすべてミリ秒の整数。
 */
import { walkPath, applyStep, EMPTY_STAGE, type StageState } from './dialogue';
import { plainText, type Directive, type Script } from './script';

export interface ScriptTiming {
  /** 台詞・字幕・物の文字の、1字あたりの読む時間 */
  readonly msPerChar: number;
  /** 1枠あたりの時間（タップするまでの間） */
  readonly msPerLine: number;
  /** 仕草の名前 → 時間 */
  readonly gestureMs: Readonly<Record<string, number>>;
  /** ふつうの速さで1マス歩く時間 */
  readonly walkStepMs: number;
  /** 旋律の名前 → 全体の長さと、音ごとの始まりの時刻 */
  readonly melodies: Readonly<Record<string, { readonly totalMs: number; readonly noteStarts: readonly number[] }>>;
  /** 登場・退場・物の出し入れ・姿勢・光の時間 */
  readonly shortMs: number;
  /** 歩かせる操作の1マス・物をタップする操作の時間 */
  readonly walkControlStepMs: number;
  readonly tapMs: number;
  /** 聞く操作の全体の長さ（貝殻の音 + 旋律） */
  readonly listenMs: number;
  /** 押し続ける操作の1段 */
  readonly holdStepMs: number;
  /** 章の題 */
  readonly chapterTitleMs: number;
}

/** 台本の見込みの時間 */
export function estimateScriptMs(script: Script, timing: ScriptTiming, initial: StageState = EMPTY_STAGE): number {
  let total = 0;
  let stage = initial;
  /** 鳴っている旋律と、鳴りはじめた時刻（節を待つ のため） */
  let melody: { name: string; at: number } | undefined;
  const one = (d: Directive, st: StageState): number => {
    switch (d.kind) {
      case 'together':
        return d.directives.reduce((max, x) => Math.max(max, one(x, st)), 0);
      case 'gesture':
        return timing.gestureMs[d.gesture] ?? 1000;
      case 'walk': {
        const a = st.actors[d.actor];
        const steps = a ? walkPath(a, d).length - 1 : 0;
        return Math.round((steps * timing.walkStepMs * 100) / (d.speed ?? 100));
      }
      case 'camera':
        return d.ms ?? 300;
      case 'fadeOut':
      case 'fadeIn':
      case 'wait':
        return d.ms;
      case 'cut':
        return d.ms + 600;
      case 'melody':
        melody = { name: d.melody, at: total };
        return 0;
      case 'melodyWait': {
        const m = melody ? timing.melodies[melody.name] : undefined;
        if (!m || !melody) return 0;
        const starts = m.noteStarts;
        const target = d.remaining <= 0 ? m.totalMs : (starts[starts.length - d.remaining] ?? m.totalMs);
        return Math.max(0, melody.at + target - total);
      }
      case 'walkControl':
        return d.path.length * timing.walkControlStepMs;
      case 'tapControl':
        return timing.tapMs;
      case 'listen':
        return timing.listenMs;
      case 'hold':
        return d.steps * timing.holdStepMs;
      case 'chapterTitle':
        return timing.chapterTitleMs;
      case 'enter':
      case 'exit':
      case 'propPut':
      case 'propRemove':
      case 'propChange':
      case 'posture':
      case 'light':
      case 'lightOff':
      case 'face':
      case 'give':
      case 'location':
        return timing.shortMs;
      case 'propMove':
        return d.ms;
      case 'strike':
      case 'pushBack':
        return 600;
      default:
        return 0;
    }
  };
  for (const step of script.steps) {
    const ds = step.kind === 'line' ? step.directives : [step.directive];
    for (const d of ds) {
      total += one(d, stage);
      stage = applyStep(stage, { kind: 'directive', line: step.line, directive: d });
    }
    if (step.kind === 'line') total += timing.msPerLine + [...plainText(step.text)].length * timing.msPerChar;
  }
  return total;
}
