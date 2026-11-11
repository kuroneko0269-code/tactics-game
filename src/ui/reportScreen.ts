import type { BattleReport, UnitBattleReport } from '../core/progression';
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

/** 勝利のボーナスを数え上げる時間（ミリ秒） */
const BONUS_DELAY_MS = 500;
const BONUS_COUNT_MS = 700;

/**
 * 戦闘の結果の画面（フェーズ2-3 で作り直し）。経験値と JP は戦闘中にその場で見せているので、ここはまとめにする。
 * - 「この戦闘で得た合計」: ユニットごとの経験値と JP。勝った時は、戦闘中の分から始めて、勝利のボーナスを数え上げて見せる。
 * - 「レベルが上がったユニット」: キャラクターのレベル（勝利のボーナスで上がった分は、数え上げの後に足す）。
 *   ジョブのレベルが上がったことは、合計の行の名前の横に控えめに添える。
 * - 下のボタン（actions）: 訓練戦なら「拠点へ戻る」、ダンジョンなら「次へ進む」「編成を変える」など。
 * 画面全体はスクロールさせない（横向きと PC は左右2列）。数え上げが終わると、画面の箱に data-done="true" が付く（自動プレイ用）。
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
  const box = el('div', 'screen-box two-col report-screen');
  box.dataset.screen = 'result';
  const info = el('div', 'screen-col report-info');
  if (extras.heading) info.append(el('p', 'report-heading', extras.heading));
  const title = el('h1', `screen-title result-title ${report.victory ? 'result-win' : 'result-lose'}`);
  title.textContent = extras.title ?? (report.victory ? TEXT.result.player : TEXT.result.enemy);
  info.append(title);
  for (const h of extras.highlights ?? []) info.append(el('p', 'report-highlight', h));
  for (const n of extras.notes ?? []) info.append(el('p', 'screen-note', n));
  if (!report.victory && !extras.notes) info.append(el('p', 'screen-note', TEXT.report.keep));

  const name = (u: UnitBattleReport) => unitName(u.unitId, jobOf(u.unitId));
  // この戦闘で得た合計
  info.append(el('h2', 'report-section-title', TEXT.report.totalsTitle));
  const table = el('div', 'report-table');
  const rows = report.units.map((u) => {
    const row = el('div', 'report-row report-unit');
    row.dataset.unitId = u.unitId;
    const nameCell = el('span', 'report-name', name(u));
    // ジョブのレベルが上がった時は、控えめに名前の横に添える
    const jobTag = el('span', 'tag job report-job-up');
    jobTag.hidden = true;
    nameCell.append(jobTag);
    if (canLearnSomething(u.unitId)) nameCell.append(el('span', 'tag report-learn', TEXT.report.canLearnTag));
    const exp = el('span', 'report-exp');
    const jp = el('span', 'report-jp');
    row.append(nameCell, exp, jp);
    table.append(row);
    return { u, row, exp, jp, jobTag };
  });
  const setGains = (t: number) => {
    for (const r of rows) {
      const e = r.u.battleExp + Math.round(r.u.bonusExp * t);
      const j = r.u.battleJp + Math.round(r.u.bonusJp * t);
      r.exp.textContent = TEXT.report.exp(e);
      r.jp.textContent = TEXT.report.jp(j);
      r.row.dataset.exp = String(e);
      r.row.dataset.jp = String(j);
    }
  };
  setGains(0);
  info.append(table);
  const bonusJp = Math.max(0, ...report.units.map((u) => u.bonusJp));
  const bonus = el('p', 'report-bonus', bonusJp > 0 ? TEXT.report.bonus(bonusJp) : '');
  if (bonusJp > 0) info.append(bonus);

  // レベルが上がったユニット
  const upsTitle = el('h2', 'report-section-title', TEXT.report.levelUpsTitle);
  const ups = el('div', 'report-ups');
  const showUps = (afterBonus: boolean) => {
    const before = new Set([...ups.children].map((c) => (c as HTMLElement).dataset.key));
    ups.innerHTML = '';
    for (const r of rows) {
      const u = r.u;
      const level = afterBonus ? u.levelAfter : u.levelAfterBattle;
      const jobLevel = afterBonus ? u.jobLevelAfter : u.jobLevelAfterBattle;
      const chips: { key: string; text: string; cls: string }[] = [];
      if (u.levelDrops > 0) chips.push({ key: `${u.unitId}:down`, text: TEXT.report.levelDown(name(u), u.levelDrops), cls: 'down' });
      if (level > u.levelBefore) chips.push({ key: `${u.unitId}:lv${level}`, text: TEXT.report.levelChip(name(u), u.levelBefore, level), cls: '' });
      for (const c of chips) {
        const chip = el('span', `report-chip ${c.cls}${afterBonus && !before.has(c.key) ? ' pop' : ''}`, c.text);
        chip.dataset.key = c.key;
        chip.dataset.unitId = u.unitId;
        ups.append(chip);
      }
      r.jobTag.hidden = jobLevel <= u.jobLevelBefore;
      r.jobTag.textContent = TEXT.report.jobLevelTag(TEXT.jobs[u.jobId] ?? u.jobId, jobLevel);
    }
    const any = ups.children.length > 0;
    upsTitle.hidden = !any;
    ups.hidden = !any;
  };
  showUps(false);

  // 横向きと PC では、レベルが上がったユニットをボタンと同じ右の列に置く（縦の長さを分ける）
  const menu = el('div', 'screen-col report-actions');
  menu.append(upsTitle, ups);
  const [first, ...rest] = actions;
  if (first) menu.append(screenButton(first.label, first.onClick, { className: first.primary ? 'primary big' : first.danger ? 'danger big' : 'big' }));
  if (rest.length > 0) {
    const row = el('div', 'button-row');
    for (const a of rest) row.append(screenButton(a.label, a.onClick, { className: a.danger ? 'danger' : a.primary ? 'primary' : '' }));
    menu.append(row);
  }
  box.append(info, menu);
  root.append(box);

  // 勝利のボーナスを数え上げる（戦闘中に得た分 → ボーナスを足した合計）
  const finish = () => {
    setGains(1);
    showUps(true);
    box.dataset.done = 'true';
  };
  if (!report.units.some((u) => u.bonusExp > 0 || u.bonusJp > 0)) return finish();
  window.setTimeout(() => {
    if (!box.isConnected) return;
    bonus.classList.add('show');
    const start = performance.now();
    const step = (now: number) => {
      if (!box.isConnected) return;
      const t = Math.min(1, (now - start) / BONUS_COUNT_MS);
      setGains(t);
      if (t < 1) requestAnimationFrame(step);
      else finish();
    };
    requestAnimationFrame(step);
  }, BONUS_DELAY_MS);
}
