import { el, screenButton } from './dom';
import { TEXT } from './text';

/**
 * 拠点の画面（仮の見た目）: 「出撃」「編成」と「はじめから」。
 * 出撃を押すと、敵の強さの段階を選ぶ。はじめからは、確認してから部隊を最初の状態に戻す。
 */
export interface BaseScreenHandlers {
  readonly mapId: string;
  /** 敵の強さの段階（やさしい順）。level は敵のレベル */
  readonly tiers: readonly { readonly id: string; readonly level: number }[];
  onSortie(tierId: string): void;
  onRoster(): void;
  onNewGame(): void;
}

export interface BaseScreen {
  show(): void;
}

export function createBaseScreen(root: HTMLElement, handlers: BaseScreenHandlers): BaseScreen {
  const render = (view: 'menu' | 'tiers' | 'confirm') => {
    root.innerHTML = '';
    root.hidden = false;
    const box = el('div', 'screen-box base-screen');
    box.dataset.screen = view === 'tiers' ? 'sortie' : 'base';
    if (view === 'menu') {
      box.append(el('h1', 'screen-title', TEXT.base.title));
      const menu = el('div', 'screen-menu');
      menu.append(
        screenButton(TEXT.base.sortie, () => render('tiers'), { className: 'primary big' }),
        screenButton(TEXT.base.roster, () => handlers.onRoster(), { className: 'big' }),
      );
      box.append(menu, el('p', 'screen-note', TEXT.base.saved));
      box.append(screenButton(TEXT.base.newGame, () => render('confirm'), { className: 'quiet' }));
    } else if (view === 'tiers') {
      box.append(el('h1', 'screen-title', TEXT.base.sortie));
      box.append(el('p', 'screen-note', TEXT.base.chooseTier(TEXT.mapNames[handlers.mapId] ?? handlers.mapId)));
      const menu = el('div', 'screen-menu');
      for (const { id, level } of handlers.tiers) {
        const tier = TEXT.tiers[id];
        menu.append(screenButton(tier?.name ?? id, () => handlers.onSortie(id), { className: 'big tier', sub: tier?.help(level) }));
      }
      box.append(menu, screenButton(TEXT.base.back, () => render('menu')));
    } else {
      box.append(el('h1', 'screen-title', TEXT.base.newGame));
      box.append(el('p', 'screen-warning', TEXT.base.confirmNewGame));
      const menu = el('div', 'screen-menu');
      menu.append(
        screenButton(TEXT.base.cancel, () => render('menu')),
        screenButton(
          TEXT.base.confirmNewGameYes,
          () => {
            handlers.onNewGame();
            render('menu');
          },
          { className: 'danger' },
        ),
      );
      box.append(menu);
    }
    root.append(box);
  };
  return { show: () => render('menu') };
}
