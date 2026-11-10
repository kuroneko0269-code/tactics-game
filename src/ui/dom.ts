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
