/** 画面（HTML）を組み立てる小さな道具 */

export function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  className?: string,
  text?: string,
): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  if (className) e.className = className;
  if (text !== undefined) e.textContent = text;
  return e;
}

/**
 * ボタン。label は読み上げと、自動プレイがボタンを探す時の名前にも使う。
 * sub を渡すと、ボタンの中に小さく補足を添える（読み上げの名前には含めない）
 */
export function screenButton(
  label: string,
  onClick: () => void,
  options: { className?: string; sub?: string; disabled?: boolean; pressed?: boolean } = {},
): HTMLButtonElement {
  const b = document.createElement('button');
  b.type = 'button';
  b.className = `screen-button${options.className ? ` ${options.className}` : ''}`;
  b.setAttribute('aria-label', label);
  b.append(el('span', 'label', label));
  if (options.sub) b.append(el('span', 'sub', options.sub));
  if (options.disabled) b.disabled = true;
  if (options.pressed !== undefined) b.setAttribute('aria-pressed', String(options.pressed));
  b.addEventListener('click', onClick);
  return b;
}

/** 成長値・成長率（能力値の 1/100 単位の整数）を「9」「1.2」「0.12」のように表す */
export function formatHundredths(value: number): string {
  const sign = value < 0 ? '-' : '';
  const abs = Math.abs(value);
  const whole = Math.floor(abs / 100);
  const frac = abs % 100;
  if (frac === 0) return `${sign}${whole}`;
  const digits = String(frac).padStart(2, '0').replace(/0$/, '');
  return `${sign}${whole}.${digits}`;
}

/** タブのボタン（押されている時は aria-selected が true） */
export function tabButton(label: string, selected: boolean, onClick: () => void, key: string): HTMLButtonElement {
  const b = document.createElement('button');
  b.type = 'button';
  b.className = 'tab-button';
  b.setAttribute('role', 'tab');
  b.setAttribute('aria-selected', String(selected));
  b.dataset.tab = key;
  b.textContent = label;
  b.addEventListener('click', onClick);
  return b;
}

/** 下からせり上がる欄の中身 */
export interface SheetContent {
  /** 自動プレイが欄の種類を見分けるための名前 */
  readonly kind: string;
  readonly title: string;
  readonly body: readonly HTMLElement[];
  /** 閉じるボタンの文言 */
  readonly closeLabel: string;
  readonly onClose: () => void;
}

/**
 * 下からせり上がる欄（説明・条件・「習得する」などのボタン）を root に出す。後ろを押すと閉じる。
 * 一覧には説明文を出さず、項目を押した時にここで見せる（画面の文字を減らすため）。
 */
export function showSheet(root: HTMLElement, content: SheetContent): HTMLElement {
  const backdrop = el('div', 'sheet-backdrop');
  backdrop.addEventListener('click', content.onClose);
  const sheet = el('div', 'sheet');
  sheet.setAttribute('role', 'dialog');
  sheet.setAttribute('aria-label', content.title);
  sheet.dataset.sheet = content.kind;
  // 閉じるボタンは題の横に置く（欄の高さを抑え、横向きの低い画面でも押せる位置に出すため）
  const head = el('div', 'sheet-head');
  head.append(el('h2', 'sheet-title', content.title), screenButton(content.closeLabel, content.onClose, { className: 'quiet sheet-close' }));
  sheet.append(head, ...content.body);
  root.append(backdrop, sheet);
  return sheet;
}
