import { el, screenButton } from './dom';
import { TEXT } from './text';

/**
 * 拠点の画面（仮の見た目）: 「出撃」「編成」と「はじめから」。
 * 出撃を押すと、訓練戦（敵の強さの段階を選ぶ）とダンジョン（戦闘を選ぶ）のどちらに行くかを選ぶ。
 * はじめからは、確認してから部隊を最初の状態に戻す。
 */
export interface BaseScreenHandlers {
  readonly mapId: string;
  /** 敵の強さの段階（やさしい順）。level は敵のレベル */
  readonly tiers: readonly { readonly id: string; readonly level: number }[];
  /** ダンジョン。battles は第1戦から順に、マップの id と勝利条件の短い説明 */
  readonly dungeon: { readonly id: string; readonly battles: readonly { readonly mapId: string; readonly objective: string }[] };
  onSortie(tierId: string): void;
  /** ダンジョンの index 番目（0 から）の戦闘に出撃する */
  onDungeonBattle(index: number): void;
  onRoster(): void;
  onNewGame(): void;
}

export interface BaseScreen {
  show(): void;
}

export function createBaseScreen(root: HTMLElement, handlers: BaseScreenHandlers): BaseScreen {
  const render = (view: 'menu' | 'sortie' | 'tiers' | 'dungeon' | 'confirm') => {
    root.innerHTML = '';
    root.hidden = false;
    const box = el('div', 'screen-box base-screen');
    box.dataset.screen = view === 'menu' || view === 'confirm' ? 'base' : view === 'sortie' ? 'sortie' : view;
    const dungeonName = TEXT.dungeons[handlers.dungeon.id] ?? handlers.dungeon.id;
    if (view === 'sortie') {
      box.append(el('h1', 'screen-title', TEXT.base.sortie));
      box.append(el('p', 'screen-note', TEXT.base.chooseSortie));
      const menu = el('div', 'screen-menu');
      menu.append(
        screenButton(TEXT.base.training, () => render('tiers'), {
          className: 'big',
          sub: TEXT.base.trainingHelp(TEXT.mapNames[handlers.mapId] ?? handlers.mapId),
        }),
        screenButton(TEXT.base.dungeon(dungeonName), () => render('dungeon'), { className: 'big', sub: TEXT.base.dungeonHelp }),
      );
      box.append(menu, screenButton(TEXT.base.back, () => render('menu')));
    } else if (view === 'dungeon') {
      box.append(el('h1', 'screen-title', dungeonName));
      box.append(el('p', 'screen-note', TEXT.base.chooseBattle(dungeonName)));
      const menu = el('div', 'screen-menu');
      handlers.dungeon.battles.forEach((b, i) => {
        menu.append(
          screenButton(TEXT.base.battleLabel(i + 1, TEXT.mapNames[b.mapId] ?? b.mapId), () => handlers.onDungeonBattle(i), {
            className: 'big tier',
            sub: TEXT.base.battleHelp(b.objective),
          }),
        );
      });
      box.append(menu, screenButton(TEXT.base.back, () => render('sortie')));
    } else if (view === 'menu') {
      box.append(el('h1', 'screen-title', TEXT.base.title));
      const menu = el('div', 'screen-menu');
      menu.append(
        screenButton(TEXT.base.sortie, () => render('sortie'), { className: 'primary big' }),
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
      box.append(menu, screenButton(TEXT.base.back, () => render('sortie')));
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
