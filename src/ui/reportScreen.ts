import type { BattleReport } from '../core/progression';
import { el, screenButton } from './dom';
import { TEXT, unitName } from './text';

/** 結果の画面の下に並べるボタン */
export interface ReportAction {
  readonly label: string;
  readonly onClick: () => void;
  readonly primary?: boolean;
  readonly danger?: boolean;
}

/** 結果の画面の飾り（ダンジョンの戦闘の間・クリアの画面） */
export interface ReportExtras {
  /** 勝敗の上に出す題（例: 「第2戦「崩れた回廊」」） */
  readonly heading?: string;
  /** 勝敗の代わりに出す大きな題（クリアの画面） */
  readonly title?: string;
  /** 勝敗の下に出す短い文 */
  readonly notes?: readonly string[];
  /** 目立たせる短い文（初めてのクリアなど） */
  readonly highlights?: readonly string[];
}

/**
 * 戦闘の結果の画面: 勝敗、各ユニットが得た経験値と JP、レベルやジョブのレベルが上がったユニット。
 * 下のボタン（actions）は、訓練戦なら「拠点へ戻る」、ダンジョンなら「次へ進む」「やり直す」「撤退」など。
 */
export function showReportScreen(
  root: HTMLElement,
  report: BattleReport,
  jobOf: (unitId: string) => string,
  canLearnSomething: (unitId: string) => boolean,
  actions: readonly ReportAction[],
  extras: ReportExtras = {},
): void {
  root.innerHTML = '';
  root.hidden = false;
  const box = el('div', 'screen-box report-screen');
  box.dataset.screen = 'result';
  if (extras.heading) box.append(el('p', 'report-heading', extras.heading));
  const title = el('h1', `screen-title result-title ${report.victory ? 'result-win' : 'result-lose'}`);
  title.textContent = extras.title ?? (report.victory ? TEXT.result.player : TEXT.result.enemy);
  box.append(title);
  for (const h of extras.highlights ?? []) box.append(el('p', 'report-highlight', h));
  for (const n of extras.notes ?? []) box.append(el('p', 'screen-note', n));
  if (!report.victory && !extras.notes) box.append(el('p', 'screen-note', TEXT.report.keep));
  const list = el('ul', 'report-list');
  for (const u of report.units) {
    const li = el('li', 'report-unit');
    li.dataset.unitId = u.unitId;
    const job = TEXT.jobs[u.jobId] ?? u.jobId;
    li.append(el('strong', 'report-name', unitName(u.unitId, jobOf(u.unitId))));
    li.append(el('span', 'report-gain', `${TEXT.report.exp(u.exp)} ・ ${TEXT.report.jp(job, u.jp)}`));
    // 脱力の罠で下がったレベル（成長値の仕組みは説明しない）
    if (u.levelDrops > 0) li.append(el('span', 'report-down', TEXT.report.levelDown(u.levelBefore, u.levelBefore - u.levelDrops)));
    const from = u.levelBefore - u.levelDrops;
    if (u.levelAfter > from) li.append(el('span', 'report-up', TEXT.report.levelUp(from, u.levelAfter)));
    if (u.jobLevelAfter > u.jobLevelBefore) {
      li.append(el('span', 'report-up', TEXT.report.jobLevelUp(job, u.jobLevelBefore, u.jobLevelAfter)));
    }
    if (canLearnSomething(u.unitId)) li.append(el('span', 'report-learn', TEXT.report.canLearn));
    list.append(li);
  }
  box.append(list);
  const menu = el('div', 'screen-menu');
  for (const a of actions) {
    menu.append(screenButton(a.label, a.onClick, { className: a.primary ? 'primary big' : a.danger ? 'danger' : 'big' }));
  }
  box.append(menu);
  root.append(box);
}
