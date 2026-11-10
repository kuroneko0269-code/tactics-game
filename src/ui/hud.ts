import type { Terrain, Tile } from '../core/map';

/**
 * 画面に重ねて表示する情報とボタン（HUD = ヘッドアップディスプレイ）。
 */
export interface Hud {
  showSelection(tile: Tile | undefined, unitName?: string): void;
}

export interface HudHandlers {
  onRotate(direction: 1 | -1): void;
}

const TERRAIN_LABELS: Record<Terrain, string> = {
  grass: '草地',
  dirt: '土',
  stone: '岩場',
  water: '水辺',
};

export function createHud(root: HTMLElement, mapName: string, handlers: HudHandlers): Hud {
  root.innerHTML = '';

  const top = el('div', 'hud-top');
  const title = el('div', 'panel title');
  title.textContent = mapName;
  const sub = el('small');
  sub.textContent = '動作確認版';
  title.appendChild(sub);

  const selection = el('div', 'panel selection');
  selection.setAttribute('aria-live', 'polite');
  top.append(title, selection);

  const bottom = el('div', 'hud-bottom');
  bottom.append(
    button('⟲', '左に回す', () => handlers.onRotate(-1)),
    button('⟳', '右に回す', () => handlers.onRotate(1)),
  );

  root.append(top, bottom);

  const hud: Hud = {
    showSelection(tile, unitName) {
      if (!tile) {
        selection.textContent = 'マスをタップして選択';
        return;
      }
      selection.innerHTML = '';
      const pos = el('strong');
      pos.textContent = `(${tile.x}, ${tile.z})`;
      selection.append(pos, ` 高さ ${tile.height} ・ ${TERRAIN_LABELS[tile.terrain]}`);
      if (unitName) selection.append(` ・ ${unitName}`);
    },
  };
  hud.showSelection(undefined);
  return hud;
}

function el(tag: string, className?: string): HTMLElement {
  const e = document.createElement(tag);
  if (className) e.className = className;
  return e;
}

function button(icon: string, label: string, onClick: () => void): HTMLButtonElement {
  const b = document.createElement('button');
  b.type = 'button';
  b.className = 'hud-button';
  b.setAttribute('aria-label', label);
  const i = el('span', 'icon');
  i.textContent = icon;
  const l = el('span', 'label');
  l.textContent = label;
  b.append(i, l);
  b.addEventListener('click', onClick);
  return b;
}
