import { el, screenButton } from './dom';
import { TEXT } from './text';

/**
 * 拠点の画面（仮の見た目）: 「出撃」「編成」「店」（フェーズ2-4）と「はじめから」。所持金も出す。
 * 出撃を押すと、訓練戦（敵の強さの段階を選ぶ）とダンジョン（3連戦に挑む・再開する）のどちらに行くかを選ぶ。
 * ダンジョンをクリアしたことがあれば、拠点の画面にクリアの回数を出す。
 * はじめからは、確認してから部隊を最初の状態に戻す。
 */
export interface BaseScreenHandlers {
  readonly mapId: string;
  /** 敵の強さの段階（やさしい順）。level は敵のレベル */
  readonly tiers: readonly { readonly id: string; readonly level: number }[];
  /** ダンジョン。battles は第1戦から順に、マップの id と勝利条件の短い説明 */
  readonly dungeon: { readonly id: string; readonly battles: readonly { readonly mapId: string; readonly objective: string }[] };
  /** ダンジョンの今の記録（挑戦中なら次の戦闘の番号（0 から）、クリアの回数） */
  dungeonStatus(): { readonly nextBattle: number | null; readonly clears: number };
  /** 所持金（ゴールド） */
  gold(): number;
  onSortie(tierId: string): void;
  /** ダンジョンに挑む。fresh なら第1戦から（挑戦中のものはやめる）、そうでなければ挑戦中の戦闘から再開 */
  onDungeon(fresh: boolean): void;
  onRoster(): void;
  onShop(): void;
  onNewGame(): void;
}

export interface BaseScreen {
  show(): void;
}

export function createBaseScreen(root: HTMLElement, handlers: BaseScreenHandlers): BaseScreen {
  /**
   * 画面全体はスクロールさせない（.two-col: 縦向きは上下、横向きと PC は左右2列）。
   * info に題と説明・一覧、actions にボタンを入れる。
   */
  const render = (view: 'menu' | 'sortie' | 'tiers' | 'dungeon' | 'restart' | 'confirm') => {
    root.innerHTML = '';
    root.hidden = false;
    const box = el('div', 'screen-box two-col base-screen');
    box.dataset.screen = view === 'menu' || view === 'confirm' ? 'base' : view;
    box.dataset.view = view;
    const info = el('div', 'screen-col base-info');
    const actions = el('div', 'screen-col base-actions');
    const status = handlers.dungeonStatus();
    const dungeonName = TEXT.dungeons[handlers.dungeon.id] ?? handlers.dungeon.id;
    const mapName = (id: string) => TEXT.mapNames[id] ?? id;
    if (view === 'sortie') {
      info.append(el('h1', 'screen-title', TEXT.base.sortie), el('p', 'screen-note', TEXT.base.chooseSortie));
      actions.append(
        screenButton(TEXT.base.training, () => render('tiers'), { className: 'big', sub: TEXT.base.trainingHelp(mapName(handlers.mapId)) }),
        screenButton(TEXT.base.dungeon(dungeonName), () => render('dungeon'), { className: 'big', sub: TEXT.base.dungeonHelp }),
        screenButton(TEXT.base.back, () => render('menu'), { className: 'back-wide' }),
      );
    } else if (view === 'dungeon') {
      info.append(el('h1', 'screen-title', dungeonName), el('p', 'screen-note', TEXT.base.dungeonIntro));
      info.append(el('p', 'dungeon-record', TEXT.base.clears(status.clears)));
      const list = el('ol', 'dungeon-battles');
      handlers.dungeon.battles.forEach((b, i) => {
        const li = el('li', status.nextBattle === i ? 'current' : '');
        li.append(el('strong', '', TEXT.base.battleLabel(i + 1, mapName(b.mapId))), el('span', '', TEXT.base.battleHelp(b.objective)));
        list.append(li);
      });
      info.append(list);
      if (status.nextBattle !== null) {
        const b = handlers.dungeon.battles[status.nextBattle]!;
        actions.append(
          screenButton(TEXT.base.resume(status.nextBattle + 1, mapName(b.mapId)), () => handlers.onDungeon(false), {
            className: 'primary big',
            sub: TEXT.base.inProgress(status.nextBattle + 1),
          }),
          screenButton(TEXT.base.restart, () => render('restart')),
        );
      } else {
        actions.append(screenButton(TEXT.base.challenge, () => handlers.onDungeon(true), { className: 'primary big' }));
      }
      actions.append(screenButton(TEXT.base.back, () => render('sortie'), { className: 'back-wide' }));
    } else if (view === 'restart') {
      info.append(el('h1', 'screen-title', dungeonName), el('p', 'screen-warning', TEXT.base.confirmRestart));
      actions.append(
        screenButton(TEXT.base.cancel, () => render('dungeon')),
        screenButton(TEXT.base.confirmRestartYes, () => handlers.onDungeon(true), { className: 'danger' }),
      );
    } else if (view === 'menu') {
      info.append(el('h1', 'screen-title', TEXT.base.title));
      if (status.clears > 0) info.append(el('p', 'dungeon-cleared', TEXT.base.clearedBadge(dungeonName, status.clears)));
      else if (status.nextBattle !== null) info.append(el('p', 'screen-note', `${dungeonName}: ${TEXT.base.inProgress(status.nextBattle + 1)}`));
      const gold = el('p', 'base-gold', TEXT.base.gold(handlers.gold()));
      gold.dataset.gold = String(handlers.gold());
      info.append(gold, el('p', 'screen-note', TEXT.base.saved));
      actions.append(
        screenButton(TEXT.base.sortie, () => render('sortie'), { className: 'primary big' }),
        screenButton(TEXT.base.roster, () => handlers.onRoster(), { className: 'big' }),
        screenButton(TEXT.base.shop, () => handlers.onShop(), { className: 'big' }),
        screenButton(TEXT.base.newGame, () => render('confirm'), { className: 'quiet' }),
      );
    } else if (view === 'tiers') {
      info.append(el('h1', 'screen-title', TEXT.base.sortie), el('p', 'screen-note', TEXT.base.chooseTier(mapName(handlers.mapId))));
      for (const { id, level } of handlers.tiers) {
        const tier = TEXT.tiers[id];
        actions.append(screenButton(tier?.name ?? id, () => handlers.onSortie(id), { className: 'big tier', sub: tier?.help(level) }));
      }
      actions.append(screenButton(TEXT.base.back, () => render('sortie'), { className: 'back-wide' }));
    } else {
      info.append(el('h1', 'screen-title', TEXT.base.newGame), el('p', 'screen-warning', TEXT.base.confirmNewGame));
      actions.append(
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
    }
    box.append(info, actions);
    root.append(box);
  };
  return { show: () => render('menu') };
}
