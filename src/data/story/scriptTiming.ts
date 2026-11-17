import type { ScriptTiming } from '../../core/scriptTiming';
import { LISTEN, MELODIES, melodyTimes } from '../sounds';
import { GESTURES } from './stageDefs';

/**
 * 台本の見込みの時間を出すための数値（ゲーム脚本の「見込みの時間」と比べる。計算は src/core/scriptTiming.ts）。
 * 読む速さは、1字 0.12 秒（1秒に約8字）+ 1枠 0.9 秒。操作の場面は、操作に慣れた人の時間で見込む。
 */
export const SCRIPT_TIMING: ScriptTiming = {
  msPerChar: 120,
  msPerLine: 900,
  gestureMs: Object.fromEntries(Object.entries(GESTURES).map(([k, g]) => [k, Math.round(g.seconds * 1000)])),
  walkStepMs: 280,
  melodies: Object.fromEntries(Object.keys(MELODIES).map((k) => [k, melodyTimes(k)])),
  shortMs: 350,
  walkControlStepMs: 700,
  tapMs: 1500,
  listenMs: LISTEN.shellMs + melodyTimes('ユナの鼻歌').totalMs,
  holdStepMs: 110,
  chapterTitleMs: 4200,
};
