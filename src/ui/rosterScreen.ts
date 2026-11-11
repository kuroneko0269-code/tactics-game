import type { GrowthStat, JobAbility, JobDefinition, PassiveSlot } from '../core/battleTypes';
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
import { el, formatHundredths, screenButton, showSheet, tabButton } from './dom';
import { TEXT, unitName } from './text';

/**
 * 編成の画面（フェーズ2-3 で作り直し）。画面全体はスクロールさせず、1画面に収める。
 *
 * - 上に部隊の5人を並べ、タップでユニットを切り替える（選んでいるユニットは枠で目立たせる）。
 * - ユニットごとの内容は4つのタブ: 能力（レベル・経験値・能力値・成長値を棒で）、ジョブ（ジョブチェンジ）、
 *   アビリティ（主コマンド・副コマンド・リアクション・サポート・ムーブの付け替え）、習得（種類ごとの一覧）。
 * - 一覧には名前と数値だけを出し、説明・条件・「習得する」「付ける」などのボタンは、項目を押すと下からせり上がる欄に出す。
 * - ジョブチェンジと付け替えは、ユニットを選んでから2回以内のタップで届く（タブ → 項目）。タブはユニットを切り替えても変わらない。
 * - 習得の一覧（数が増え続ける）だけ、その枠の中でスクロールする。
 *
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

export type RosterTab = 'stats' | 'job' | 'abilities' | 'learn';
const TABS: readonly RosterTab[] = ['stats', 'job', 'abilities', 'learn'];
type LearnGroup = 'action' | PassiveSlot;
const LEARN_GROUPS: readonly LearnGroup[] = ['action', ...PASSIVE_SLOTS];

/** 下からせり上がる欄で見せているもの */
type Sheet =
  | { kind: 'job'; jobId: string }
  | { kind: 'slot'; slot: 'main' | 'secondary' | PassiveSlot }
  | { kind: 'ability'; jobId: string; abilityId: string };

export function createRosterScreen(root: HTMLElement, deps: RosterScreenDeps): RosterScreen {
  const { catalog, rules } = deps;
  let unitId = deps.roster().units[0]!.id;
  let tab: RosterTab = 'stats';
  let learnGroup: LearnGroup = 'action';
  let sheet: Sheet | undefined;
  /** 習得の一覧のスクロール位置（習得した後も、同じ位置に戻す） */
  let learnScroll = 0;

  const jobName = (id: string) => TEXT.jobs[id] ?? id;
  const abilityName = (id: string) => TEXT.abilities[id] ?? id;
  const slotName = (slot: 'main' | 'secondary' | PassiveSlot) =>
    slot === 'main' ? TEXT.roster.mainCommand : slot === 'secondary' ? TEXT.roster.subCommand : TEXT.passiveSlots[slot];
  const slotOf = (id: string): PassiveSlot | undefined => catalog.passives.find((p) => p.id === id)?.slot;

  /** 能力ごとの棒の長さの基準（どのジョブの基本値 + 成長値の上限でも収まる値） */
  const statScale = Object.fromEntries(
    GROWTH_STATS.map((s) => [s, Math.max(1, ...catalog.jobs.map((j) => j.stats[s])) + Math.floor(rules.growthCap[s] / 100)]),
  ) as Record<GrowthStat, number>;

  const set = (patch: () => void) => {
    patch();
    render();
  };
  const edit = (change: (u: RosterUnit) => RosterUnit, after?: () => void) => {
    const roster = deps.roster();
    deps.update(replaceUnit(roster, change(findUnit(roster, unitId))));
    after?.();
    render();
  };

  /** 割合の棒。parts は [長さ（0〜1）, 色のクラス] */
  const bar = (parts: readonly (readonly [number, string])[], thin = false) => {
    const b = el('div', `bar${thin ? ' thin' : ''}`);
    for (const [ratio, cls] of parts) {
      const seg = el('span', cls);
      seg.style.width = `${Math.max(0, Math.min(100, ratio * 100))}%`;
      b.append(seg);
    }
    return b;
  };

  // ---- 能力 ----
  const renderStats = (panel: HTMLElement, u: RosterUnit) => {
    const job = findJob(catalog, u.jobId);
    const stats = unitStats(u, catalog);
    const block = el('div', 'level-block');
    const atMax = u.level >= rules.maxLevel;
    const need = expToNext(u.level, rules);
    block.append(
      el('span', 'level', TEXT.roster.level(u.level)),
      bar([[atMax ? 1 : u.exp / need, 'bar-exp']]),
      el('span', 'level-sub', atMax ? TEXT.roster.maxLevel : TEXT.roster.expToNext(need - u.exp)),
    );
    const legend = el('div', 'stat-legend');
    const swatch = (text: string, color: string) => {
      const s = el('span', undefined, text);
      s.style.setProperty('--swatch', color);
      return s;
    };
    legend.append(swatch(TEXT.roster.legendBase, '#6f8bb3'), swatch(TEXT.roster.legendGrowth, 'var(--accent)'));
    const list = el('div', 'stat-bars');
    for (const s of GROWTH_STATS) {
      const row = el('div', 'stat-bar-row');
      row.dataset.stat = s;
      const base = job.stats[s];
      const grown = stats[s] - base;
      row.title = `${TEXT.statNames[s]} ${base} + ${grown}（${formatHundredths(u.growth[s])}）`;
      row.append(
        el('span', 'name', TEXT.statNames[s]),
        bar([
          [base / statScale[s], 'bar-base'],
          [grown / statScale[s], 'bar-growth'],
        ]),
        el('span', 'value', String(stats[s])),
      );
      list.append(row);
    }
    // 成長値の合計と上限（棒の右端が上限）
    const points = growthPoints(u.growth, rules);
    const total = el('div', `growth-total${isGrowthCapped(u.growth, rules) ? ' capped' : ''}`);
    total.dataset.points = String(points);
    total.dataset.cap = String(rules.growthTotalCap);
    const label = el('div', 'growth-total-label');
    label.append(el('span', undefined, TEXT.roster.growthTotal), el('span', 'value', `${points} / ${rules.growthTotalCap}`));
    total.append(label, bar([[points / rules.growthTotalCap, 'bar-total']], true));
    panel.append(
      block,
      legend,
      list,
      total,
      el(
        'p',
        'screen-note',
        `${TEXT.roster.moveJump(stats.move, stats.jump)} ・ ${TEXT.roster.weapon(job.weapon ? TEXT.weapons[job.weapon] : '-')}`,
      ),
    );
  };

  // ---- ジョブ ----
  const renderJob = (panel: HTMLElement, u: RosterUnit) => {
    const p = jobProgress(u, u.jobId);
    const lv = jobLevel(u, u.jobId, rules);
    const next = nextJobLevelJp(p.jpTotal, rules);
    const prev = lv <= 1 ? 0 : rules.jobLevelJp[lv - 2]!;
    const card = el('div', 'job-current');
    card.dataset.jobId = u.jobId;
    const line = el('div', 'job-line');
    line.append(el('span', undefined, TEXT.roster.jobLevel(lv)), el('span', undefined, TEXT.roster.jp(p.jp)));
    card.append(
      el('span', 'job-name', jobName(u.jobId)),
      line,
      bar([[next === undefined ? 1 : (p.jpTotal - prev) / (next - prev), 'bar-jp']], true),
      el('span', 'screen-note', next === undefined ? TEXT.roster.jobMaxLevel : TEXT.roster.jpToNext(next - p.jpTotal)),
    );
    const grid = el('div', 'job-grid');
    for (const job of catalog.jobs) {
      const unlocked = isJobUnlocked(u, job, rules);
      const current = job.id === u.jobId;
      const sub = current
        ? TEXT.roster.current
        : !unlocked
          ? (job.unlock ?? []).map((r) => TEXT.roster.unlockNeeds(jobName(r.jobId), r.level)).join('、') || TEXT.roster.locked
          : `Lv ${jobLevel(u, job.id, rules)} ・ ${TEXT.roster.jp(jobProgress(u, job.id).jp)}`;
      const b = screenButton(jobName(job.id), () => set(() => (sheet = { kind: 'job', jobId: job.id })), {
        className: 'job-choice',
        sub,
        disabled: !unlocked || current,
        pressed: current,
      });
      b.dataset.jobId = job.id;
      grid.append(b);
    }
    panel.append(card, grid);
  };

  /** ジョブを変える前の比較（選んだジョブについてだけ）と「〇〇になる」 */
  const jobSheet = (u: RosterUnit, jobId: string): HTMLElement[] => {
    const next = findJob(catalog, jobId);
    const now = findJob(catalog, u.jobId);
    const before = unitStats(u, catalog);
    const after = statsWithGrowth(next.stats, u.growth);
    const grid = el('div', 'compare-grid');
    grid.append(el('span', 'head', ''), el('span', 'head', TEXT.roster.compareAfter), el('span', 'head', TEXT.roster.rateTitle));
    for (const s of GROWTH_STATS) {
      const diff = after[s] - before[s];
      const rateNow = growthRates(now)[s];
      const rateNext = growthRates(next)[s];
      const value = el('span', diff > 0 ? 'up' : diff < 0 ? 'down' : '', `${before[s]} → ${after[s]}`);
      value.dataset.stat = s;
      const rate = el(
        'span',
        rateNext > rateNow ? 'up' : rateNext < rateNow ? 'down' : '',
        `${formatHundredths(rateNow)} → ${formatHundredths(rateNext)}`,
      );
      grid.append(el('span', undefined, TEXT.statNames[s]), value, rate);
    }
    return [
      grid,
      el('p', 'screen-note', TEXT.roster.moveJump(after.move, after.jump)),
      screenButton(
        TEXT.roster.becomeJob(jobName(next.id)),
        () => edit((x) => changeJob(x, next.id, catalog, rules), () => (sheet = undefined)),
        { className: 'primary big' },
      ),
    ];
  };

  // ---- アビリティ ----
  const commandText = (u: RosterUnit, jobId: string | null) => {
    if (jobId === null) return TEXT.roster.none;
    const learned = learnedAbilities(u, findJob(catalog, jobId));
    return `${TEXT.commands[jobId] ?? jobId}${learned.length > 0 ? `: ${learned.map(abilityName).join('・')}` : ''}`;
  };
  const renderAbilities = (panel: HTMLElement, u: RosterUnit) => {
    const list = el('div', 'slot-list');
    const row = (slot: 'main' | 'secondary' | PassiveSlot, value: string | null) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'screen-button slot-row';
      b.dataset.slot = slot;
      b.setAttribute('aria-label', slotName(slot));
      b.append(el('span', 'slot-name', slotName(slot)), el('span', `slot-value${value === null ? ' empty' : ''}`, value ?? TEXT.roster.none));
      b.addEventListener('click', () => set(() => (sheet = { kind: 'slot', slot })));
      list.append(b);
    };
    row('main', commandText(u, u.jobId));
    row('secondary', u.slots.secondary === null ? null : commandText(u, u.slots.secondary));
    for (const slot of PASSIVE_SLOTS) row(slot, u.slots[slot] ? abilityName(u.slots[slot]!) : null);
    panel.append(list);
  };

  /** 枠を押した時: 付けられる候補（押すとすぐ付け替える） */
  const slotSheet = (u: RosterUnit, slot: 'main' | 'secondary' | PassiveSlot): HTMLElement[] => {
    const choices = el('div', 'sheet-choices');
    const choose = (fn: (x: RosterUnit) => RosterUnit) => edit(fn, () => (sheet = undefined));
    if (slot === 'main') {
      const learned = learnedAbilities(u, findJob(catalog, u.jobId));
      return [
        el('p', 'sheet-text', learned.length > 0 ? `${TEXT.commands[u.jobId] ?? u.jobId}: ${learned.map(abilityName).join('・')}` : TEXT.roster.noneLearned),
        el('p', 'screen-note', TEXT.roster.mainCommandNote),
        screenButton(TEXT.roster.toJobTab, () => set(() => ((tab = 'job'), (sheet = undefined))), { className: 'big' }),
      ];
    }
    if (slot === 'secondary') {
      const options = secondaryChoices(u, catalog);
      for (const jobId of options) {
        const b = screenButton(TEXT.commands[jobId] ?? jobId, () => choose((x) => setSecondary(x, jobId, catalog)), {
          sub: learnedAbilities(u, findJob(catalog, jobId)).map(abilityName).join('・'),
          pressed: u.slots.secondary === jobId,
        });
        b.dataset.jobId = jobId;
        choices.append(b);
      }
      if (u.slots.secondary !== null) choices.append(screenButton(TEXT.roster.remove, () => choose((x) => setSecondary(x, null, catalog))));
      if (options.length === 0) choices.append(el('p', 'screen-note', TEXT.roster.noChoices));
      return [choices];
    }
    const options = passiveChoices(u, slot, catalog);
    for (const id of options) {
      const b = screenButton(abilityName(id), () => choose((x) => setPassive(x, slot, id, catalog)), { pressed: u.slots[slot] === id });
      b.dataset.abilityId = id;
      choices.append(b);
    }
    if (u.slots[slot] !== null) choices.append(screenButton(TEXT.roster.remove, () => choose((x) => setPassive(x, slot, null, catalog))));
    if (options.length === 0) choices.append(el('p', 'screen-note', TEXT.roster.noChoices));
    return [choices];
  };

  // ---- 習得 ----
  const groupEntries = (job: JobDefinition, group: LearnGroup): readonly JobAbility[] =>
    group === 'action' ? (job.abilities ?? []) : (job.passives ?? []).filter((a) => slotOf(a.id) === group);
  const renderLearn = (panel: HTMLElement, u: RosterUnit) => {
    const filter = el('div', 'learn-filter');
    filter.setAttribute('role', 'tablist');
    for (const g of LEARN_GROUPS) {
      filter.append(tabButton(TEXT.roster.learnGroups[g] ?? g, g === learnGroup, () => set(() => ((learnGroup = g), (learnScroll = 0))), g));
    }
    const list = el('div', 'learn-list scroll-area');
    list.dataset.group = learnGroup;
    // 今のジョブを先頭に。解放されていないジョブは出さない
    const jobsInOrder = [findJob(catalog, u.jobId), ...catalog.jobs.filter((j) => j.id !== u.jobId)].filter((j) => isJobUnlocked(u, j, rules));
    for (const job of jobsInOrder) {
      const entries = groupEntries(job, learnGroup);
      if (entries.length === 0) continue;
      const head = el('div', 'learn-job-head');
      head.append(
        el('span', undefined, TEXT.roster.jobLevelOf(jobName(job.id), jobLevel(u, job.id, rules))),
        el('span', undefined, TEXT.roster.jp(jobProgress(u, job.id).jp)),
      );
      list.append(head);
      for (const a of entries) {
        const refusal = learnRefusal(u, job.id, a.id, catalog, rules);
        const learned = refusal === 'alreadyLearned';
        const b = document.createElement('button');
        b.type = 'button';
        b.className = `screen-button learn-item${learned ? ' learned' : refusal === null ? ' ready' : ''}`;
        b.dataset.abilityId = a.id;
        b.dataset.jobId = job.id;
        b.setAttribute('aria-label', abilityName(a.id));
        const cost = learned ? `✓ ${TEXT.roster.learned}` : a.starter ? TEXT.roster.starterCost : TEXT.roster.jpCost(a.jpCost);
        b.append(el('span', 'label', abilityName(a.id)), el('span', 'cost', cost));
        b.addEventListener('click', () => {
          learnScroll = list.scrollTop;
          set(() => (sheet = { kind: 'ability', jobId: job.id, abilityId: a.id }));
        });
        list.append(b);
      }
    }
    panel.append(filter, list);
    requestAnimationFrame(() => (list.scrollTop = learnScroll));
  };

  /** 習得の一覧の項目を押した時: 説明・条件・「習得する」（受動的なアビリティは「付ける」「外す」も） */
  const abilitySheet = (u: RosterUnit, jobId: string, abilityId: string): HTMLElement[] => {
    const job = findJob(catalog, jobId);
    const entry = (job.abilities ?? []).find((a) => a.id === abilityId) ?? (job.passives ?? []).find((a) => a.id === abilityId)!;
    const refusal = learnRefusal(u, jobId, abilityId, catalog, rules);
    const learned = refusal === 'alreadyLearned';
    const conditions = el('ul', 'sheet-conditions');
    const cond = (text: string, ok: boolean | undefined) => conditions.append(el('li', ok === undefined ? '' : ok ? 'ok' : 'ng', text));
    if (entry.starter) cond(TEXT.roster.condStarter(jobName(jobId)), undefined);
    else {
      cond(TEXT.roster.condJob(jobName(jobId)), undefined);
      if (!learned) {
        const have = jobProgress(u, jobId).jp;
        cond(TEXT.roster.condJp(jobName(jobId), entry.jpCost, have), have >= entry.jpCost);
      }
      const needLevel = entry.jobLevel ?? 1;
      if (needLevel > 1 && !learned) {
        const now = jobLevel(u, jobId, rules);
        cond(TEXT.roster.condJobLevel(jobName(jobId), needLevel, now), now >= needLevel);
      }
    }
    const body: HTMLElement[] = [el('p', 'sheet-text', TEXT.abilityHelp[abilityId] ?? ''), conditions];
    if (!learned && !entry.starter) {
      body.push(
        screenButton(TEXT.roster.learnButton(entry.jpCost), () => edit((x) => learnAbility(x, jobId, abilityId, catalog, rules)), {
          className: `big learn-confirm${refusal === null ? ' primary' : ''}`,
          disabled: refusal !== null,
          sub: refusal === null ? undefined : TEXT.roster.refusal[refusal],
        }),
      );
    } else if (learned) {
      body.push(el('p', 'report-highlight', `✓ ${TEXT.roster.learned}`));
      const slot = slotOf(abilityId);
      if (slot) {
        const on = u.slots[slot] === abilityId;
        body.push(
          screenButton(
            on ? TEXT.roster.unequip : TEXT.roster.equip,
            () => edit((x) => setPassive(x, slot, on ? null : abilityId, catalog), () => (sheet = undefined)),
            { className: on ? 'big equip-toggle' : 'primary big equip-toggle', sub: on ? TEXT.roster.equipped : slotName(slot) },
          ),
        );
      }
    }
    return body;
  };

  /** 最後にせり上がる動きを見せた欄（習得の後など、同じ欄を出し直す時は動かさない） */
  let animatedSheet = '';
  const renderSheet = (u: RosterUnit) => {
    if (!sheet) {
      animatedSheet = '';
      return;
    }
    const close = () => set(() => (sheet = undefined));
    const s = sheet;
    const key = JSON.stringify([unitId, s]);
    const still = key === animatedSheet;
    animatedSheet = key;

    if (s.kind === 'job') {
      showSheet(root, { kind: 'job', title: TEXT.roster.changeJobTitle(jobName(s.jobId)), body: jobSheet(u, s.jobId), closeLabel: TEXT.roster.close, onClose: close });
    } else if (s.kind === 'slot') {
      showSheet(root, {
        kind: `slot-${s.slot}`,
        title: s.slot === 'main' ? TEXT.roster.mainCommand : TEXT.roster.chooseFor(slotName(s.slot)),
        body: slotSheet(u, s.slot),
        closeLabel: TEXT.roster.close,
        onClose: close,
      });
    } else {
      const sh = showSheet(root, {
        kind: 'ability',
        title: abilityName(s.abilityId),
        body: abilitySheet(u, s.jobId, s.abilityId),
        closeLabel: TEXT.roster.close,
        onClose: close,
      });
      sh.dataset.abilityId = s.abilityId;
    }
    if (still) root.querySelector('.sheet')?.classList.add('still');
  };

  const render = () => {
    root.innerHTML = '';
    root.hidden = false;
    const roster = deps.roster();
    const u = findUnit(roster, unitId);
    const box = el('div', 'screen-box roster-screen');
    box.dataset.screen = 'roster';
    box.dataset.unitId = u.id;
    box.dataset.tab = tab;

    const head = el('div', 'roster-head');
    head.append(screenButton(TEXT.roster.back, () => deps.onBack(), { className: 'back' }), el('h1', 'screen-title', TEXT.roster.title));

    const units = el('div', 'roster-units');
    for (const x of roster.units) {
      const b = screenButton(unitName(x.id, x.jobId), () => set(() => ((unitId = x.id), (sheet = undefined), (learnScroll = 0))), {
        className: 'unit-pick',
        sub: `${jobName(x.jobId)} ${TEXT.roster.level(x.level)}`,
        pressed: x.id === u.id,
      });
      b.dataset.unitId = x.id;
      units.append(b);
    }

    const main = el('div', 'roster-main');
    const tabs = el('div', 'roster-tabs');
    tabs.setAttribute('role', 'tablist');
    for (const t of TABS) tabs.append(tabButton(TEXT.roster.tabs[t] ?? t, t === tab, () => set(() => ((tab = t), (sheet = undefined))), t));
    const panel = el('div', 'roster-panel');
    panel.dataset.tab = tab;
    panel.setAttribute('role', 'tabpanel');
    if (tab === 'stats') renderStats(panel, u);
    else if (tab === 'job') renderJob(panel, u);
    else if (tab === 'abilities') renderAbilities(panel, u);
    else renderLearn(panel, u);
    main.append(tabs, panel);

    box.append(head, units, main);
    root.append(box);
    renderSheet(u);
  };

  return {
    show() {
      sheet = undefined;
      if (!deps.roster().units.some((x) => x.id === unitId)) unitId = deps.roster().units[0]!.id;
      render();
    },
  };
}
