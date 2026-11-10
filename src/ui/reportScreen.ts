import type { BattleReport } from '../core/progression';
import { el, screenButton } from './dom';
import { TEXT, unitName } from './text';

/**
 * 戦闘の結果の画面: 勝敗、各ユニットが得た経験値と JP、レベルやジョブのレベルが上がったユニット。
 * 「拠点へ戻る」で拠点の画面へ。
 */
export function showReportScreen(
  root: HTMLElement,
  report: BattleReport,
  jobOf: (unitId: string) => string,
  canLearnSomething: (unitId: string) => boolean,
  onBack: () => void,
): void {
  root.innerHTML = '';
  root.hidden = false;
  const box = el('div', 'screen-box report-screen');
  box.dataset.screen = 'result';
  const title = el('h1', `screen-title result-title ${report.victory ? 'result-win' : 'result-lose'}`);
  title.textContent = report.victory ? TEXT.result.player : TEXT.result.enemy;
  box.append(title);
  if (!report.victory) box.append(el('p', 'screen-note', TEXT.report.keep));
  const list = el('ul', 'report-list');
  for (const u of report.units) {
    const li = el('li', 'report-unit');
    li.dataset.unitId = u.unitId;
    const job = TEXT.jobs[u.jobId] ?? u.jobId;
    li.append(el('strong', 'report-name', unitName(u.unitId, jobOf(u.unitId))));
    li.append(el('span', 'report-gain', `${TEXT.report.exp(u.exp)} ・ ${TEXT.report.jp(job, u.jp)}`));
    if (u.levelAfter > u.levelBefore) li.append(el('span', 'report-up', TEXT.report.levelUp(u.levelBefore, u.levelAfter)));
    if (u.jobLevelAfter > u.jobLevelBefore) {
      li.append(el('span', 'report-up', TEXT.report.jobLevelUp(job, u.jobLevelBefore, u.jobLevelAfter)));
    }
    if (canLearnSomething(u.unitId)) li.append(el('span', 'report-learn', TEXT.report.canLearn));
    list.append(li);
  }
  box.append(list, screenButton(TEXT.report.toBase, onBack, { className: 'primary big' }));
  root.append(box);
}
