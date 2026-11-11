import type { EquipmentDefinition } from '../core/battleTypes';
import { equippedDefinitions, equippedStats, wearerOf } from '../core/equipment';
import { addEquipmentStats, canEquip, findEquipment } from '../core/items';
import { findJob, findUnit, unitStats, type GameCatalog, type Roster } from '../core/progression';
import { buyItem, buyRefusal, sellItem, sellPrice, sellRefusal, type ShopDefinition } from '../core/shop';
import { el, screenButton, showSheet, tabButton } from './dom';
import { itemEffectText, itemKind, itemName, statChanges } from './equipmentText';
import { TEXT, unitName } from './text';

/**
 * 店の画面（フェーズ2-4）。拠点の「店」から開く。画面全体はスクロールさせない（品物の一覧の枠の中だけスクロールする）。
 *
 * - 「買う」「売る」の2つのタブ。上に所持金。
 * - 一覧には名前・種類・値段だけを出し、項目を押すと下からせり上がる欄に、説明・効果・部隊のだれが装備できるか
 *   （付け替えた時の能力値の変化）・「買う」を出す（ゴールドが足りない時は押せず、理由を出す）。
 * - 売る: 持っている個体を1つずつ出す。装備中の物は売れない（欄に理由を出す）。売値は買値の半分。
 * - 品ぞろえは進み具合で増える（core の shop.ts。並べる物は stock() で受け取る）。
 *
 * 計算は core（shop.ts・equipment.ts）に任せ、ここは表示と、押されたボタンを core の関数に渡すだけ。
 */
export interface ShopScreenDeps {
  readonly catalog: GameCatalog;
  readonly shop: ShopDefinition;
  /** 今の品ぞろえ（装備の id） */
  stock(): readonly string[];
  roster(): Roster;
  /** 部隊を変えた（保存もここで行う） */
  update(roster: Roster): void;
  onBack(): void;
}

export interface ShopScreen {
  show(): void;
}

type ShopTab = 'buy' | 'sell';
type Sheet = { kind: 'buy'; itemId: string; message?: string } | { kind: 'sell'; uid: string };

export function createShopScreen(root: HTMLElement, deps: ShopScreenDeps): ShopScreen {
  const { catalog } = deps;
  let tab: ShopTab = 'buy';
  let sheet: Sheet | undefined;
  /** 売った後などの短い知らせ（次の操作で消える） */
  let message: string | undefined;
  let listScroll = 0;
  /** 最後にせり上がる動きを見せた欄（買った後など、同じ欄を出し直す時は動かさない） */
  let animatedSheet = '';

  const set = (patch: () => void) => {
    message = undefined;
    patch();
    render();
  };

  /** その装備を付けた時の、ユニットの能力値（同じ枠の物と取り替える） */
  const statsWithDef = (roster: Roster, unitId: string, def: EquipmentDefinition) => {
    const u = findUnit(roster, unitId);
    const others = equippedDefinitions(u, roster, catalog).filter((d) => d.slot !== def.slot);
    return addEquipmentStats(unitStats(u, catalog), [...others, def]);
  };

  /** 部隊のだれが装備できるか（付け替えた時の能力値の変化） */
  const whoCanEquip = (roster: Roster, def: EquipmentDefinition): HTMLElement => {
    const box = el('div', 'shop-fit');
    box.append(el('p', 'shop-fit-title', TEXT.shop.whoCanEquip));
    for (const u of roster.units) {
      const row = el('div', 'shop-fit-row');
      row.dataset.unitId = u.id;
      row.append(el('span', 'shop-fit-name', unitName(u.id, u.jobId)));
      const detail = el('span', 'shop-fit-detail');
      if (!canEquip(findJob(catalog, u.jobId), def)) {
        row.classList.add('no');
        detail.textContent = TEXT.shop.cannotEquip;
      } else {
        const changes = statChanges(equippedStats(u, roster, catalog), statsWithDef(roster, u.id, def));
        if (changes.length === 0) detail.textContent = TEXT.shop.sameAsNow;
        for (const ch of changes) detail.append(el('span', ch.up ? 'up' : 'down', ch.text));
      }
      row.append(detail);
      box.append(row);
    }
    return box;
  };

  const buySheet = (roster: Roster, itemId: string, note?: string): HTMLElement[] => {
    const def = findEquipment(catalog, itemId);
    const refusal = buyRefusal(roster, itemId, deps.stock(), catalog);
    const owned = roster.items.filter((i) => i.itemId === itemId).length;
    return [
      ...(note ? [el('p', 'report-highlight shop-done', note)] : []),
      el('p', 'sheet-text', `${itemKind(def)} ・ ${itemEffectText(def)}`),
      el('p', 'screen-note', `${TEXT.equipment[itemId]?.help ?? ''}${owned > 0 ? ` ・ ${TEXT.shop.owned(owned)}` : ''}`),
      whoCanEquip(roster, def),
      screenButton(
        TEXT.shop.buy(def.price),
        () => {
          const next = buyItem(deps.roster(), itemId, deps.stock(), catalog).roster;
          deps.update(next);
          sheet = { kind: 'buy', itemId, message: TEXT.shop.bought(itemName(itemId)) };
          render();
        },
        {
          className: `big shop-confirm${refusal === null ? ' primary' : ''}`,
          disabled: refusal !== null,
          sub: refusal === null ? undefined : TEXT.shop.buyRefusal[refusal],
        },
      ),
    ];
  };

  const sellSheet = (roster: Roster, uid: string): HTMLElement[] => {
    const item = roster.items.find((i) => i.uid === uid)!;
    const def = findEquipment(catalog, item.itemId);
    const refusal = sellRefusal(roster, uid);
    const price = sellPrice(def, deps.shop);
    const wearer = wearerOf(roster, uid);
    return [
      el('p', 'sheet-text', `${itemKind(def)} ・ ${itemEffectText(def)}`),
      el('p', 'screen-note', TEXT.equipment[def.id]?.help ?? ''),
      ...(wearer ? [el('p', 'screen-note', TEXT.shop.wornBy(unitName(wearer.id, wearer.jobId)))] : []),
      screenButton(
        TEXT.shop.sell(price),
        () => {
          deps.update(sellItem(deps.roster(), uid, catalog, deps.shop));
          sheet = undefined;
          message = TEXT.shop.sold(itemName(def.id), price);
          render();
        },
        {
          className: `big shop-confirm${refusal === null ? ' primary' : ''}`,
          disabled: refusal !== null,
          sub: refusal === null ? undefined : TEXT.shop.sellRefusal[refusal],
        },
      ),
    ];
  };

  const itemButton = (def: EquipmentDefinition, right: string, extra: string, onClick: () => void, cls = '') => {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = `screen-button shop-item${cls}`;
    b.setAttribute('aria-label', itemName(def.id));
    const main = el('span', 'shop-item-main');
    main.append(el('span', 'label', itemName(def.id)), el('span', 'shop-item-sub', [itemKind(def), extra].filter((x) => x).join(' ・ ')));
    b.append(main, el('span', 'shop-price', right));
    b.addEventListener('click', onClick);
    return b;
  };

  const render = () => {
    root.innerHTML = '';
    root.hidden = false;
    const roster = deps.roster();
    const box = el('div', 'screen-box shop-screen');
    box.dataset.screen = 'shop';
    box.dataset.tab = tab;

    const head = el('div', 'roster-head shop-head');
    const gold = el('span', 'shop-gold', TEXT.base.gold(roster.gold));
    gold.dataset.gold = String(roster.gold);
    head.append(screenButton(TEXT.shop.back, () => deps.onBack(), { className: 'back' }), el('h1', 'screen-title', TEXT.shop.title), gold);

    const tabs = el('div', 'shop-tabs');
    tabs.setAttribute('role', 'tablist');
    for (const t of ['buy', 'sell'] as const) {
      tabs.append(tabButton(TEXT.shop.tabs[t] ?? t, t === tab, () => set(() => ((tab = t), (sheet = undefined), (listScroll = 0))), t));
    }
    const side = el('div', 'shop-side');
    side.append(head, tabs);
    if (message) side.append(el('p', 'report-highlight shop-message', message));
    if (tab === 'buy') side.append(el('p', 'screen-note shop-note', TEXT.shop.newStock));

    const list = el('div', 'shop-list scroll-area');
    list.dataset.tab = tab;
    const open = (next: Sheet) => {
      listScroll = list.scrollTop;
      set(() => (sheet = next));
    };
    if (tab === 'buy') {
      for (const itemId of deps.stock()) {
        const def = findEquipment(catalog, itemId);
        const b = itemButton(def, TEXT.shop.price(def.price), itemEffectText(def), () => open({ kind: 'buy', itemId }), roster.gold < def.price ? ' short' : '');
        b.dataset.itemId = itemId;
        list.append(b);
      }
    } else {
      // 装備していない物を先に、装備中の物を後に（どちらも手に入れた順）
      const items = [...roster.items].sort((a, b) => Number(Boolean(wearerOf(roster, a.uid))) - Number(Boolean(wearerOf(roster, b.uid))));
      for (const item of items) {
        const def = findEquipment(catalog, item.itemId);
        const wearer = wearerOf(roster, item.uid);
        const b = itemButton(
          def,
          TEXT.shop.sellPrice(sellPrice(def, deps.shop)),
          wearer ? TEXT.shop.wornBy(unitName(wearer.id, wearer.jobId)) : itemEffectText(def),
          () => open({ kind: 'sell', uid: item.uid }),
          wearer ? ' worn' : '',
        );
        b.dataset.uid = item.uid;
        b.dataset.itemId = item.itemId;
        list.append(b);
      }
      if (items.length === 0) list.append(el('p', 'screen-note', TEXT.shop.empty));
    }
    box.append(side, list);
    root.append(box);
    requestAnimationFrame(() => (list.scrollTop = listScroll));

    if (!sheet) {
      animatedSheet = '';
      return;
    }
    const s = sheet;
    const key = JSON.stringify(s.kind === 'buy' ? [s.kind, s.itemId] : [s.kind, s.uid]);
    const still = key === animatedSheet;
    animatedSheet = key;
    const close = () => set(() => (sheet = undefined));
    const title = itemName(s.kind === 'buy' ? s.itemId : roster.items.find((i) => i.uid === s.uid)!.itemId);
    const body = s.kind === 'buy' ? buySheet(roster, s.itemId, s.message) : sellSheet(roster, s.uid);
    const sh = showSheet(root, { kind: `shop-${s.kind}`, title, body, closeLabel: TEXT.shop.close, onClose: close });
    if (s.kind === 'buy') sh.dataset.itemId = s.itemId;
    if (still) sh.classList.add('still');
  };

  return {
    show() {
      sheet = undefined;
      message = undefined;
      tab = 'buy';
      listScroll = 0;
      render();
    },
  };
}
