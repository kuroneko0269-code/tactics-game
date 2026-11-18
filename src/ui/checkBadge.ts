import { el, screenButton, showSheet } from './dom';
import { TEXT } from './text';

/**
 * 確認用の機能（発注者と物語の作者が、場面を手早く確かめるための機能）の印と、物語の戦闘の「勝ったことにする」。
 * 入の間は、画面の隅に小さく「確認用の機能: 入」と出す。物語の戦闘の間（出撃前の配置・戦闘前の演出と手ほどき・戦闘中）だけ、
 * 「勝ったことにする」のボタンを出す。押すと確認の欄を出し、「勝ったことにして進む」で onWin を呼ぶ。
 * 会話の枠や章の題より手前に出す（戦闘の前の演出の途中でも押せるように）。
 */
export interface CheckBadge {
  /** 確認用の機能が入か */
  setEnabled(on: boolean): void;
  /** 「勝ったことにする」を出す（null で隠す） */
  setWin(onWin: (() => void) | null): void;
}

export function createCheckBadge(app: HTMLElement): CheckBadge {
  const layer = el('div', 'check-layer');
  const badge = el('div', 'check-badge', TEXT.check.badge);
  badge.setAttribute('role', 'status');
  let win: (() => void) | null = null;
  let enabled = false;
  const ref: { sheet?: HTMLElement } = {};
  const closeSheet = () => {
    const backdrop = ref.sheet?.previousElementSibling;
    if (backdrop?.classList.contains('sheet-backdrop')) backdrop.remove();
    ref.sheet?.remove();
    ref.sheet = undefined;
  };
  const button = screenButton(TEXT.check.winBattle, () => {
    if (!win || ref.sheet) return;
    const go = win;
    const yes = screenButton(
      TEXT.check.winYes,
      () => {
        closeSheet();
        go();
      },
      { className: 'danger check-win-yes' },
    );
    ref.sheet = showSheet(layer, { kind: 'check-win', title: TEXT.check.winTitle, body: [el('p', 'screen-note', TEXT.check.winNote), yes], closeLabel: TEXT.check.winNo, onClose: closeSheet });
  }, { className: 'check-win' });
  layer.append(badge, button);
  app.append(layer);
  /**
   * 置き場所: 戦闘のカメラ操作のボタンのまとまりの、すぐ上（画面の向きや大きさで位置が変わるので、そのつど測る）。
   * まとまりが見えていなければ、画面の右上
   */
  const place = () => {
    if (button.hidden) return;
    const cam = document.querySelector<HTMLElement>('#hud:not([hidden]) .camera-buttons');
    const r = cam?.getBoundingClientRect();
    const box = app.getBoundingClientRect();
    if (r && r.width > 0) {
      button.classList.remove('corner');
      button.style.left = `${Math.round(r.left - box.left)}px`;
      button.style.top = `${Math.round(r.top - box.top - button.offsetHeight - 8)}px`;
    } else {
      button.classList.add('corner');
      button.style.left = '';
      button.style.top = '';
    }
  };
  let timer: number | undefined;
  const update = () => {
    badge.hidden = !enabled;
    button.hidden = !(enabled && win);
    if (button.hidden) closeSheet();
    if (!button.hidden && timer === undefined) timer = window.setInterval(place, 400);
    if (button.hidden && timer !== undefined) {
      window.clearInterval(timer);
      timer = undefined;
    }
    place();
  };
  update();
  return {
    setEnabled(on) {
      enabled = on;
      update();
    },
    setWin(onWin) {
      win = onWin;
      update();
    },
  };
}
