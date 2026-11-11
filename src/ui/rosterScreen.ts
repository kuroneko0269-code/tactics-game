import type { JobAbility, JobDefinition, PassiveSlot, UnitStats } from '../core/battleTypes';
import {
  changeJob,
  expToNext,
  findJob,
  findUnit,
  GROWTH_STATS,
  growthPoints,
  growthRates,
  isGrowthCapped,
  isJobUnlocked,
  jobLevel,
  jobProgress,
  learnAbility,
  learnedAbilities,
  learnRefusal,
  nextJobLevelJp,
  PASSIVE_SLOTS,
  passiveChoices,
  replaceUnit,
  secondaryChoices,
  setPassive,
  setSecondary,
  statsWithGrowth,
  unitStats,
  type GameCatalog,
  type ProgressionRules,
  type Roster,
  type RosterUnit,
} from '../core/progression';
import { el, formatHundredths, screenButton } from './dom';
import { TEXT, unitName } from './text';

/**
 * 編成の画面。部隊の一覧と、ユニットごとの詳しい画面（能力値・成長値・成長率・アビリティ）。
 * ジョブチェンジ（変える前に能力値の変化と成長率の違いを見られる）、アビリティの習得、副コマンドの付け替え、
 * 受動的なアビリティ（リアクション・サポート・ムーブ）の付け替えができる。
 * 習得の一覧は、行動・リアクション・サポート・ムーブに分けて、効果の説明・必要な JP・必要なジョブのレベルを出す。
 * 育成の計算は core（progression.ts）に任せ、ここは表示と、押されたボタンを core の関数に渡すだけ。
 */
export interface RosterScreenDeps {
  readonly catalog: GameCatalog;
  readonly rules: ProgressionRules;
  roster(): Roster;
  /** 部隊を変えた（保存もここで行う） */
  update(roster: Roster): void;
  onBack(): void;
}

export interface RosterScreen {
  show(): void;
}

type View =
  | { kind: 'list' }
  | { kind: 'detail'; unitId: string }
  | { kind: 'jobs'; unitId: string; previewJobId?: string }
  | { kind: 'learn'; unitId: string }
  | { kind: 'sub'; unitId: string }
  | { kind: 'passive'; unitId: string; slot: PassiveSlot };

export function createRosterScreen(root: HTMLElement, deps: RosterScreenDeps): RosterScreen {
  const { catalog, rules } = deps;
  let view: View = { kind: 'list' };
  const jobName = (id: string) => TEXT.jobs[id] ?? id;
  const abilityName = (id: string) => TEXT.abilities[id] ?? id;
  const go = (next: View) => {
    view = next;
    render();
  };
  const edit = (unitId: string, change: (u: RosterUnit) => RosterUnit, next: View) => {
    const roster = deps.roster();
    deps.update(replaceUnit(roster, change(findUnit(roster, unitId))));
    go(next);
  };

  const header = (title: string, onBack: () => void) => {
    const h = el('div', 'screen-header');
    h.append(screenButton(TEXT.roster.back, onBack, { className: 'back' }), el('h1', 'screen-title', title));
    return h;
  };

  /** レベルと次のレベルまでの経験値、ジョブとジョブのレベル、JP */
  const levelLines = (u: RosterUnit) => {
    const box = el('div', 'unit-levels');
    const need = expToNext(u.level, rules) - u.exp;
    box.append(
      el(
        'div',
        'unit-level',
        `${TEXT.roster.level(u.level)} ・ ${u.level >= rules.maxLevel ? TEXT.roster.maxLevel : TEXT.roster.expToNext(need)}`,
      ),
    );
    const p = jobProgress(u, u.jobId);
    const next = nextJobLevelJp(p.jpTotal, rules);
    box.append(
      el(
        'div',
        'unit-job',
        `${TEXT.roster.jobLevel(jobName(u.jobId), jobLevel(u, u.jobId, rules))} ・ ${TEXT.roster.jp(p.jp)} ・ ${
          next === undefined ? TEXT.roster.jobMaxLevel : TEXT.roster.jpToNext(next - p.jpTotal)
        }`,
      ),
    );
    if (isGrowthCapped(u.growth, rules)) box.append(el('div', 'growth-capped', TEXT.roster.growthCapped));
    return box;
  };

  const commandText = (u: RosterUnit, jobId: string | null) => {
    if (jobId === null) return TEXT.roster.none;
    const learned = learnedAbilities(u, findJob(catalog, jobId));
    const names = learned.length > 0 ? learned.map(abilityName).join('・') : TEXT.roster.noneLearned;
    return `${TEXT.commands[jobId] ?? jobId}: ${names}`;
  };

  const renderList = (box: HTMLElement) => {
    box.append(header(TEXT.roster.title, () => deps.onBack()));
    const list = el('div', 'roster-list');
    for (const u of deps.roster().units) {
      const stats = unitStats(u, catalog);
      const card = screenButton(unitName(u.id, u.jobId), () => go({ kind: 'detail', unitId: u.id }), {
        className: 'roster-card',
        sub: `${TEXT.roster.level(u.level)} ・ ${TEXT.roster.jobLevel(jobName(u.jobId), jobLevel(u, u.jobId, rules))} ・ ${TEXT.roster.jp(jobProgress(u, u.jobId).jp)}`,
      });
      card.dataset.unitId = u.id;
      card.append(
        el(
          'span',
          'sub stats-line',
          GROWTH_STATS.map((s) => `${TEXT.statNames[s]} ${stats[s]}`).join(' ・ '),
        ),
      );
      if (isGrowthCapped(u.growth, rules)) card.append(el('span', 'sub growth-capped', TEXT.roster.growthCapped));
      list.append(card);
    }
    box.append(list);
  };

  const renderDetail = (box: HTMLElement, u: RosterUnit) => {
    box.append(header(unitName(u.id, u.jobId), () => go({ kind: 'list' })));
    box.append(levelLines(u));
    const job = findJob(catalog, u.jobId);
    const stats = unitStats(u, catalog);
    const rates = growthRates(job);
    box.append(el('h2', 'screen-subtitle', TEXT.roster.statsTitle));
    const table = el('table', 'stat-table');
    const head = el('tr');
    for (const h of TEXT.roster.statHeaders) head.append(el('th', undefined, h));
    table.append(head);
    for (const s of GROWTH_STATS) {
      const tr = el('tr');
      tr.dataset.stat = s;
      tr.append(
        el('th', undefined, TEXT.statNames[s]),
        el('td', 'stat-value', String(stats[s])),
        el('td', 'stat-growth', `+${formatHundredths(u.growth[s])}`),
        el('td', 'stat-rate', formatHundredths(rates[s])),
      );
      table.append(tr);
    }
    box.append(table);
    box.append(
      el(
        'p',
        'screen-note',
        `${TEXT.roster.moveJump(stats.move, stats.jump)} ・ ${TEXT.roster.weapon(job.weapon ? TEXT.weapons[job.weapon] : '-')}`,
      ),
      el('p', `screen-note growth-total${isGrowthCapped(u.growth, rules) ? ' capped' : ''}`, TEXT.roster.growthTotal(growthPoints(u.growth, rules), rules.growthTotalCap)),
    );
    box.append(el('h2', 'screen-subtitle', TEXT.roster.abilitiesTitle));
    const abilities = el('dl', 'ability-slots');
    abilities.append(
      el('dt', undefined, TEXT.roster.mainCommand),
      el('dd', 'main-command', commandText(u, u.jobId)),
      el('dt', undefined, TEXT.roster.subCommand),
      el('dd', 'sub-command', commandText(u, u.slots.secondary)),
    );
    for (const slot of PASSIVE_SLOTS) {
      const id = u.slots[slot];
      const dd = el('dd', `passive-slot slot-${slot}`, id ? abilityName(id) : TEXT.roster.none);
      if (id) dd.append(el('span', 'sub', TEXT.abilityHelp[id] ?? ''));
      abilities.append(el('dt', undefined, TEXT.passiveSlots[slot]), dd);
    }
    box.append(abilities);
    const menu = el('div', 'screen-menu');
    menu.append(
      screenButton(TEXT.roster.changeJob, () => go({ kind: 'jobs', unitId: u.id })),
      screenButton(TEXT.roster.learn, () => go({ kind: 'learn', unitId: u.id })),
      screenButton(TEXT.roster.changeSub, () => go({ kind: 'sub', unitId: u.id })),
      ...PASSIVE_SLOTS.map((slot) =>
        screenButton(TEXT.roster.changePassive(TEXT.passiveSlots[slot]), () => go({ kind: 'passive', unitId: u.id, slot })),
      ),
    );
    box.append(menu);
  };

  const renderJobs = (box: HTMLElement, u: RosterUnit, previewJobId: string | undefined) => {
    box.append(header(TEXT.roster.jobListTitle, () => go({ kind: 'detail', unitId: u.id })));
    box.append(el('p', 'screen-note', `${unitName(u.id, u.jobId)} ・ ${TEXT.roster.jobListHelp}`));
    const list = el('div', 'screen-menu job-list');
    for (const job of catalog.jobs) {
      const unlocked = isJobUnlocked(u, job, rules);
      const current = job.id === u.jobId;
      const sub = current
        ? TEXT.roster.current
        : !unlocked
          ? (job.unlock ?? []).map((r) => TEXT.roster.unlockNeeds(jobName(r.jobId), r.level)).join('、') || TEXT.roster.locked
          : `${TEXT.roster.jobLevel(jobName(job.id), jobLevel(u, job.id, rules))} ・ ${TEXT.roster.jp(jobProgress(u, job.id).jp)}`;
      const b = screenButton(jobName(job.id), () => go({ kind: 'jobs', unitId: u.id, previewJobId: job.id }), {
        className: 'job-choice',
        sub,
        disabled: !unlocked,
        pressed: previewJobId === job.id,
      });
      b.dataset.jobId = job.id;
      list.append(b);
    }
    box.append(list);
    if (!previewJobId) return;
    // 能力値の変化と成長率の違い
    const next = findJob(catalog, previewJobId);
    const now = findJob(catalog, u.jobId);
    const before = unitStats(u, catalog);
    const after: UnitStats = statsWithGrowth(next.stats, u.growth);
    const compare = el('table', 'stat-table compare-table');
    const head = el('tr');
    for (const h of TEXT.roster.compareHeaders) head.append(el('th', undefined, h));
    compare.append(head);
    for (const s of GROWTH_STATS) {
      const tr = el('tr');
      tr.dataset.stat = s;
      const diff = after[s] - before[s];
      const rateNow = growthRates(now)[s];
      const rateNext = growthRates(next)[s];
      tr.append(
        el('th', undefined, TEXT.statNames[s]),
        el('td', undefined, String(before[s])),
        el('td', diff > 0 ? 'up' : diff < 0 ? 'down' : '', `${after[s]}${diff !== 0 ? `（${diff > 0 ? '+' : ''}${diff}）` : ''}`),
        el(
          'td',
          rateNext > rateNow ? 'up' : rateNext < rateNow ? 'down' : '',
          `${formatHundredths(rateNow)} → ${formatHundredths(rateNext)}`,
        ),
      );
      compare.append(tr);
    }
    const preview = el('div', 'job-preview');
    preview.append(el('h2', 'screen-subtitle', jobName(next.id)), compare);
    preview.append(el('p', 'screen-note', TEXT.roster.moveJump(after.move, after.jump)));
    if (next.id !== u.jobId) {
      preview.append(
        screenButton(
          TEXT.roster.becomeJob(jobName(next.id)),
          () => edit(u.id, (x) => changeJob(x, next.id, catalog, rules), { kind: 'detail', unitId: u.id }),
          { className: 'primary' },
        ),
      );
    }
    box.append(preview);
    // 選んだジョブの比べる表が見えるように寄せる（一覧の下に出るため）
    requestAnimationFrame(() => preview.scrollIntoView({ block: 'nearest' }));
  };

  /** 受動的なアビリティの枠の種類 */
  const slotOf = (id: string): PassiveSlot | undefined => catalog.passives.find((p) => p.id === id)?.slot;

  const renderLearn = (box: HTMLElement, u: RosterUnit) => {
    box.append(header(TEXT.roster.learnTitle, () => go({ kind: 'detail', unitId: u.id })));
    box.append(el('p', 'screen-note', `${unitName(u.id, u.jobId)} ・ ${TEXT.roster.learnHelp}`));
    // 今のジョブを先頭に。解放されていないジョブは出さない
    const jobsInOrder = [findJob(catalog, u.jobId), ...catalog.jobs.filter((j) => j.id !== u.jobId)].filter((j) =>
      isJobUnlocked(u, j, rules),
    );
    // ジョブごとのレベルと JP（どのジョブの JP で覚えるかが分かるように）
    const summary = el('div', 'learn-summary');
    for (const job of jobsInOrder) {
      summary.append(
        el('span', 'learn-jp', `${TEXT.roster.jobLevel(jobName(job.id), jobLevel(u, job.id, rules))} ・ ${TEXT.roster.jp(jobProgress(u, job.id).jp)}`),
      );
    }
    box.append(summary);
    const groups: { id: string; entries: (job: JobDefinition) => readonly JobAbility[] }[] = [
      { id: 'action', entries: (job) => job.abilities ?? [] },
      ...PASSIVE_SLOTS.map((slot) => ({
        id: slot as string,
        entries: (job: JobDefinition) => (job.passives ?? []).filter((a) => slotOf(a.id) === slot),
      })),
    ];
    for (const group of groups) {
      const section = el('section', 'learn-group');
      section.dataset.group = group.id;
      section.append(el('h2', 'screen-subtitle', TEXT.roster.learnGroups[group.id] ?? group.id));
      for (const job of jobsInOrder) {
        for (const a of group.entries(job)) {
          const row = el('div', 'learn-row');
          row.dataset.abilityId = a.id;
          row.dataset.jobId = job.id;
          const refusal = learnRefusal(u, job.id, a.id, catalog, rules);
          const needLevel = a.jobLevel ?? 1;
          const info = el('div', 'learn-info');
          const cost = [
            jobName(job.id),
            ...(a.starter ? [] : [TEXT.roster.jpCost(a.jpCost)]),
            ...(needLevel > 1 ? [TEXT.roster.needJobLevel(jobName(job.id), needLevel)] : []),
          ].join(' ・ ');
          info.append(
            el('strong', undefined, abilityName(a.id)),
            el('span', `sub learn-cost${refusal === 'jobLevelTooLow' ? ' locked' : ''}`, cost),
            el('span', 'sub', TEXT.abilityHelp[a.id] ?? ''),
          );
          row.append(info);
          if (refusal === 'alreadyLearned') {
            row.append(el('span', 'learned', TEXT.roster.learned));
          } else {
            const reason =
              refusal === 'jobLevelTooLow' ? TEXT.roster.needJobLevelShort(needLevel) : refusal ? TEXT.roster.refusal[refusal] : undefined;
            const b = screenButton(
              TEXT.roster.learnButton(a.jpCost),
              () => edit(u.id, (x) => learnAbility(x, job.id, a.id, catalog, rules), { kind: 'learn', unitId: u.id }),
              { className: 'learn-button', disabled: refusal !== null, sub: reason },
            );
            row.append(b);
          }
          section.append(row);
        }
      }
      box.append(section);
    }
  };

  const renderPassive = (box: HTMLElement, u: RosterUnit, slot: PassiveSlot) => {
    const slotName = TEXT.passiveSlots[slot];
    box.append(header(TEXT.roster.passiveTitle(slotName), () => go({ kind: 'detail', unitId: u.id })));
    box.append(el('p', 'screen-note', `${unitName(u.id, u.jobId)} ・ ${TEXT.roster.passiveHelp}`));
    const list = el('div', 'screen-menu');
    const choose = (id: string | null) => edit(u.id, (x) => setPassive(x, slot, id, catalog), { kind: 'detail', unitId: u.id });
    list.append(screenButton(TEXT.roster.passiveNone, () => choose(null), { pressed: u.slots[slot] === null }));
    const choices = passiveChoices(u, slot, catalog);
    for (const id of choices) {
      const b = screenButton(abilityName(id), () => choose(id), { sub: TEXT.abilityHelp[id], pressed: u.slots[slot] === id });
      b.dataset.abilityId = id;
      list.append(b);
    }
    box.append(list);
    if (choices.length === 0) box.append(el('p', 'screen-note', TEXT.roster.noPassiveChoices(slotName)));
  };

  const renderSub = (box: HTMLElement, u: RosterUnit) => {
    box.append(header(TEXT.roster.subTitle, () => go({ kind: 'detail', unitId: u.id })));
    box.append(el('p', 'screen-note', `${unitName(u.id, u.jobId)} ・ ${TEXT.roster.subHelp}`));
    const list = el('div', 'screen-menu');
    const choose = (jobId: string | null) =>
      edit(u.id, (x) => setSecondary(x, jobId, catalog), { kind: 'detail', unitId: u.id });
    list.append(screenButton(TEXT.roster.subNone, () => choose(null), { pressed: u.slots.secondary === null }));
    const choices = secondaryChoices(u, catalog);
    for (const jobId of choices) {
      const b = screenButton(TEXT.commands[jobId] ?? jobId, () => choose(jobId), {
        sub: commandText(u, jobId),
        pressed: u.slots.secondary === jobId,
      });
      b.dataset.jobId = jobId;
      list.append(b);
    }
    box.append(list);
    if (choices.length === 0) box.append(el('p', 'screen-note', TEXT.roster.noSubChoices));
  };

  let lastPlace = '';
  const render = () => {
    root.innerHTML = '';
    root.hidden = false;
    const box = el('div', 'screen-box roster-screen');
    box.dataset.screen = 'roster';
    box.dataset.view = view.kind;
    if (view.kind === 'list') renderList(box);
    else {
      const u = findUnit(deps.roster(), view.unitId);
      box.dataset.unitId = u.id;
      if (view.kind === 'detail') renderDetail(box, u);
      else if (view.kind === 'jobs') renderJobs(box, u, view.previewJobId);
      else if (view.kind === 'learn') renderLearn(box, u);
      else if (view.kind === 'passive') renderPassive(box, u, view.slot);
      else renderSub(box, u);
    }
    root.append(box);
    // 別の画面へ移った時だけ、いちばん上から見せる（習得のボタンを押した後などは、位置をそのままに）
    const place = `${view.kind}:${'unitId' in view ? view.unitId : ''}:${'slot' in view ? view.slot : ''}`;
    if (place !== lastPlace) root.scrollTop = 0;
    lastPlace = place;
  };

  return {
    show() {
      go({ kind: 'list' });
    },
  };
}
