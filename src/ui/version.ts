import { TEXT } from './text';

/** ビルドした日時（ISO 形式）。vite.config.ts の define で、ビルドの時に埋め込まれる */
declare const __BUILD_TIME__: string;

/**
 * 版の表示と、新しい版の確認。
 * - 画面の隅に、ビルドした日時を小さく出す（どの版を見ているかを分かるように）。
 * - 公開ページでは起動時（と、ほかのアプリから戻ってきた時）に、公開中の最新の版（version.json）を確かめ、
 *   表示中のものより新しければ「新しい版があります。更新」のボタンを出す。
 *   押すと、URL に版の印（?v=...）を付けて開き直す。URL が変わるので、ブラウザに残った古いページを使わずに読み込み直される。
 * 開発中（npm run dev）は確かめない。
 */
export function showVersion(root: HTMLElement): void {
  const badge = document.createElement('div');
  badge.className = 'version-badge';
  badge.textContent = import.meta.env.PROD ? TEXT.version.label(formatBuildTime(__BUILD_TIME__)) : TEXT.version.dev;
  root.append(badge);
  if (!import.meta.env.PROD) return;

  let shown = false;
  const check = async () => {
    if (shown) return;
    try {
      const res = await fetch(`${import.meta.env.BASE_URL}version.json?t=${Date.now()}`, { cache: 'no-store' });
      if (!res.ok) return;
      const data = (await res.json()) as { version?: unknown };
      if (typeof data.version !== 'string' || !(data.version > __BUILD_TIME__)) return;
      shown = true;
      root.append(updateButton(data.version));
    } catch {
      // 通信できない時は何もしない（遊ぶのは妨げない）
    }
  };
  void check();
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') void check();
  });
}

function updateButton(version: string): HTMLElement {
  const b = document.createElement('button');
  b.type = 'button';
  b.className = 'hud-button update-button';
  b.textContent = TEXT.version.update;
  b.addEventListener('click', () => {
    const url = new URL(location.href);
    url.searchParams.set('v', version);
    location.replace(url.toString());
  });
  return b;
}

/** ISO 形式の日時を、端末の地域の時刻で「2026/11/10 19:40」の形にする */
export function formatBuildTime(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}/${pad(d.getMonth() + 1)}/${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
