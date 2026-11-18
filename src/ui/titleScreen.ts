import { el, screenButton, tabButton } from './dom';
import { TEXT } from './text';

/**
 * 題名の画面（物語の土台）。「物語」と「訓練と遺跡」（今までの遊び）を選ぶ。「設定」で音量など。
 * 部隊と育てた状態は、どれを選んでも共通。
 */
export interface TitleHandlers {
  /** 物語の本編を始められるか（序章ができるまでは false） */
  story(): { readonly available: boolean };
  onStory(): void;
  onPlay(): void;
  /** 設定の欄を開く（序章に足りない仕組み） */
  onSettings?(): void;
}

export function showTitleScreen(root: HTMLElement, handlers: TitleHandlers): void {
  root.innerHTML = '';
  root.hidden = false;
  const box = el('div', 'screen-box two-col title-screen');
  box.dataset.screen = 'title';
  const info = el('div', 'screen-col title-info');
  info.append(el('h1', 'game-title', TEXT.title.name), el('p', 'game-sub', TEXT.title.sub));
  const actions = el('div', 'screen-col title-actions');
  const story = handlers.story();
  actions.append(
    screenButton(TEXT.title.story, () => handlers.onStory(), {
      className: 'primary big title-story',
      ...(story.available ? {} : { sub: TEXT.title.storyHelp, disabled: true }),
    }),
    screenButton(TEXT.title.play, () => handlers.onPlay(), { className: 'big title-play', sub: TEXT.title.playHelp }),
  );
  if (handlers.onSettings) actions.append(screenButton(TEXT.settings.open, () => handlers.onSettings!(), { className: 'quiet title-settings' }));
  box.append(info, actions);
  root.append(box);
}

/** 「これまで」（再開した時に出す。3行以内）。「続ける」で onContinue */
export function showRecapScreen(root: HTMLElement, lines: readonly string[], onContinue: () => void): void {
  root.innerHTML = '';
  root.hidden = false;
  const box = el('div', 'screen-box two-col recap-screen');
  box.dataset.screen = 'recap';
  const info = el('div', 'screen-col');
  info.append(el('h1', 'screen-title', TEXT.story.recapTitle));
  for (const line of lines) info.append(el('p', 'recap-line', line));
  const actions = el('div', 'screen-col');
  actions.append(screenButton(TEXT.story.recapContinue, onContinue, { className: 'primary big recap-continue' }));
  box.append(info, actions);
  root.append(box);
}

/** 物語の本を最後まで見た（序章の後は「第1章は準備中です」） */
export function showStoryEndScreen(root: HTMLElement, title: string, onTitle: () => void): void {
  root.innerHTML = '';
  root.hidden = false;
  const box = el('div', 'screen-box two-col story-end-screen');
  box.dataset.screen = 'story-end';
  const info = el('div', 'screen-col');
  void title;
  info.append(el('h1', 'screen-title', TEXT.story.nextChapterSoon), el('p', 'screen-note', TEXT.story.nextChapterNote));
  const actions = el('div', 'screen-col');
  actions.append(screenButton(TEXT.title.toTitle, onTitle, { className: 'primary big' }));
  box.append(info, actions);
  root.append(box);
}

/** 章のために決めた部隊で戦った物語の戦闘に負けた（序章に足りない仕組み）。「やり直す」か「タイトルへ」 */
export function showStoryBattleLost(root: HTMLElement, onRetry: () => void, onTitle: () => void): void {
  root.innerHTML = '';
  root.hidden = false;
  const box = el('div', 'screen-box two-col story-lost-screen');
  box.dataset.screen = 'story-lost';
  const info = el('div', 'screen-col');
  info.append(el('h1', 'screen-title', TEXT.story.battleLost), el('p', 'screen-note', TEXT.story.lostNote));
  const actions = el('div', 'screen-col');
  actions.append(
    screenButton(TEXT.story.retry, onRetry, { className: 'primary big story-retry' }),
    screenButton(TEXT.title.toTitle, onTitle, { className: 'big' }),
  );
  box.append(info, actions);
  root.append(box);
}

/** 物語を選んだ後の画面（進み具合がある時と、確認用の機能が入の時）。つづきから・はじめから（確認つき）・場面を選ぶ */
export interface StoryMenuHandlers {
  /** 進み具合があるか（あれば「つづきから」を出し、「はじめから」は確認を取る） */
  readonly hasProgress: boolean;
  /** 「つづきから」に添える、今の場面（終えていれば「第1章は準備中です」など） */
  readonly continueSub?: string;
  /** 確認用の機能が入か（入なら「場面を選ぶ」を出す） */
  readonly checkTools: boolean;
  onContinue(): void;
  onRestart(): void;
  onSceneSelect(): void;
  onBack(): void;
}

export function showStoryMenu(root: HTMLElement, h: StoryMenuHandlers): void {
  const render = (view: 'menu' | 'confirm') => {
    root.innerHTML = '';
    root.hidden = false;
    const box = el('div', 'screen-box two-col story-menu-screen');
    box.dataset.screen = view === 'menu' ? 'story-menu' : 'story-restart';
    const info = el('div', 'screen-col');
    const actions = el('div', 'screen-col');
    if (view === 'confirm') {
      info.append(el('h1', 'screen-title', TEXT.title.restart), el('p', 'screen-warning', TEXT.title.confirmRestart));
      actions.append(
        screenButton(TEXT.title.confirmRestartYes, () => h.onRestart(), { className: 'danger big story-restart-yes' }),
        screenButton(TEXT.title.back, () => render('menu'), { className: 'quiet' }),
      );
    } else {
      info.append(el('h1', 'screen-title', TEXT.title.storyMenuTitle), el('p', 'game-sub', TEXT.title.storyHelp));
      if (h.hasProgress) {
        actions.append(
          screenButton(TEXT.title.continue, () => h.onContinue(), { className: 'primary big story-continue', ...(h.continueSub ? { sub: h.continueSub } : {}) }),
        );
      }
      actions.append(
        screenButton(TEXT.title.restart, () => (h.hasProgress ? render('confirm') : h.onRestart()), {
          className: `${h.hasProgress ? '' : 'primary '}big story-restart`,
          ...(h.hasProgress ? { sub: TEXT.title.restartHelp } : {}),
        }),
      );
      if (h.checkTools) actions.append(screenButton(TEXT.check.sceneSelect, () => h.onSceneSelect(), { className: 'story-scene-select', sub: TEXT.check.sceneSelectHelp }));
      actions.append(screenButton(TEXT.title.back, () => h.onBack(), { className: 'quiet' }));
    }
    box.append(info, actions);
    root.append(box);
  };
  render('menu');
}

/** 場面を選ぶ画面（確認用の機能）。章ごとのタブと、場面の一覧（一覧の枠の中だけがスクロールする） */
export interface SceneSelectChapter {
  readonly id: string;
  readonly label: string;
  readonly scenes: readonly { readonly label: string; readonly onSelect: () => void }[];
}

export function showSceneSelect(root: HTMLElement, chapters: readonly SceneSelectChapter[], onBack: () => void, initialChapter = 0): void {
  let current = Math.min(Math.max(0, initialChapter), chapters.length - 1);
  const render = () => {
    root.innerHTML = '';
    root.hidden = false;
    const box = el('div', 'screen-box scene-select-screen');
    box.dataset.screen = 'scene-select';
    const head = el('div', 'scene-select-head');
    head.append(el('h1', 'screen-title', TEXT.check.sceneSelectTitle), el('p', 'screen-note', TEXT.check.sceneSelectNote));
    const tabs = el('div', 'scene-select-tabs');
    tabs.setAttribute('role', 'tablist');
    chapters.forEach((c, i) =>
      tabs.append(
        tabButton(c.label, i === current, () => {
          current = i;
          render();
        }, c.id),
      ),
    );
    const list = el('div', 'scroll-area scene-select-list');
    for (const sc of chapters[current]?.scenes ?? []) list.append(screenButton(sc.label, sc.onSelect, { className: 'scene-select-item' }));
    box.append(head, tabs, list, screenButton(TEXT.title.back, onBack, { className: 'quiet scene-select-back' }));
    root.append(box);
  };
  render();
}
