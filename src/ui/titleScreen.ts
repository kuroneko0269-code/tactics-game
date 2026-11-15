import { el, screenButton } from './dom';
import { TEXT } from './text';

/**
 * 題名の画面（物語の土台）。「物語」「訓練と遺跡」（今までの遊び）と、仕組みを確かめる「試しの場面」を選ぶ。
 * 部隊と育てた状態は、どれを選んでも共通。
 */
export interface TitleHandlers {
  /** 物語の本編を始められるか（序章ができるまでは false）と、続きがあるか */
  story(): { readonly available: boolean; readonly inProgress: boolean };
  /** 試しの場面の進み具合（途中なら続きから・最初から を出す） */
  trial(): { readonly inProgress: boolean };
  onStory(): void;
  onPlay(): void;
  onTrial(fresh: boolean): void;
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
    screenButton(story.inProgress ? TEXT.title.storyContinue : TEXT.title.story, () => handlers.onStory(), {
      className: 'primary big title-story',
      ...(story.available ? {} : { sub: TEXT.title.storyHelp, disabled: true }),
    }),
    screenButton(TEXT.title.play, () => handlers.onPlay(), { className: 'big title-play', sub: TEXT.title.playHelp }),
  );
  if (handlers.trial().inProgress) {
    actions.append(
      screenButton(TEXT.title.trialContinue, () => handlers.onTrial(false), { className: 'big title-trial' }),
      screenButton(TEXT.title.trialRestart, () => handlers.onTrial(true), { className: 'quiet title-trial-restart' }),
    );
  } else {
    actions.append(screenButton(TEXT.title.trial, () => handlers.onTrial(true), { className: 'big title-trial', sub: TEXT.title.trialHelp }));
  }
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

/** 物語の本を最後まで見た */
export function showStoryEndScreen(root: HTMLElement, title: string, onTitle: () => void): void {
  root.innerHTML = '';
  root.hidden = false;
  const box = el('div', 'screen-box two-col story-end-screen');
  box.dataset.screen = 'story-end';
  const info = el('div', 'screen-col');
  info.append(el('h1', 'screen-title', TEXT.story.finished(title)));
  const actions = el('div', 'screen-col');
  actions.append(screenButton(TEXT.title.toTitle, onTitle, { className: 'primary big' }));
  box.append(info, actions);
  root.append(box);
}
