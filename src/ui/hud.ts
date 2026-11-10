import type { Team, UnitState } from '../core/battleTypes';
import type { RelativeSide } from '../core/geometry';
import { TEXT, unitName } from './text';

/**
 * 戦闘中に画面に重ねて表示する情報とボタン（HUD = ヘッドアップディスプレイ）。
 * 表示するだけで、戦闘の結果は計算しない。
 */
export interface BattleHud {
  setTurnOrder(entries: readonly TurnOrderEntry[]): void;
  /** 手番のユニットや、タップしたユニットの情報 */
  setUnitInfo(unit: UnitState | undefined, turnNumber: number): void;
  setHint(text: string): void;
  setActions(actions: readonly HudAction[]): void;
  showPreview(preview: AttackPreviewView | undefined): void;
  showResult(winner: Team | undefined, turns: number, onRetry?: () => void): void;
}

export interface TurnOrderEntry {
  readonly id: string;
  readonly team: Team;
  readonly jobId: string;
}

export interface HudAction {
  readonly label: string;
  readonly onClick: () => void;
  readonly primary?: boolean;
  readonly disabled?: boolean;
}

export interface AttackPreviewView {
  readonly targetName: string;
  readonly side: RelativeSide;
  readonly hitPercent: number;
  readonly damage: number;
  readonly heightPercent: number;
  readonly targetHp: number;
  readonly targetMaxHp: number;
}

export interface HudHandlers {
  onRotate(direction: 1 | -1): void;
  /** 1 で拡大、-1 で縮小 */
  onZoom(steps: 1 | -1): void;
  /** カメラの高さを次の段階へ。新しい段階（0: 低い 〜 2: 高い）を返す */
  onCycleHeight(): number;
  onResetView(): void;
  /** 最初のカメラの高さの段階 */
  readonly initialHeight: number;
}

export function createHud(root: HTMLElement, mapId: string, handlers: HudHandlers): BattleHud {
  root.innerHTML = '';

  const top = el('div', 'hud-top');
  const order = el('div', 'panel turn-order');
  order.setAttribute('aria-label', TEXT.turnOrder);
  const info = el('div', 'panel unit-info');
  info.setAttribute('aria-live', 'polite');
  top.append(order, info);

  const preview = el('div', 'panel preview');
  preview.hidden = true;

  const bottom = el('div', 'hud-bottom');
  // カメラの操作ボタン（拡大・縮小、回転、高さ、視点を戻す）をひとまとめにする
  const camera = el('div', 'camera-buttons');
  camera.setAttribute('role', 'group');
  const heightButton = button(TEXT.buttons.cameraHeightShort, TEXT.buttons.cameraHeight, () => {
    showHeight(handlers.onCycleHeight());
  }, 'hud-button small camera-height');
  const showHeight = (level: number) => {
    const name = TEXT.cameraHeights[level] ?? '';
    heightButton.querySelector('.label')!.textContent = name;
    heightButton.setAttribute('aria-label', `${TEXT.buttons.cameraHeight}: ${name}`);
    heightButton.dataset.level = String(level);
  };
  camera.append(
    button('＋', TEXT.buttons.zoomIn, () => handlers.onZoom(1), 'hud-button small camera-zoom-in'),
    button('－', TEXT.buttons.zoomOut, () => handlers.onZoom(-1), 'hud-button small camera-zoom-out'),
    button('⟲', TEXT.buttons.rotateLeft, () => handlers.onRotate(-1), 'hud-button small camera-rotate-left'),
    button('⟳', TEXT.buttons.rotateRight, () => handlers.onRotate(1), 'hud-button small camera-rotate-right'),
    heightButton,
    button('◎', TEXT.buttons.resetView, () => handlers.onResetView(), 'hud-button small camera-reset', TEXT.buttons.resetViewShort),
  );
  showHeight(handlers.initialHeight);
  const hint = el('div', 'hint');
  const actions = el('div', 'actions');
  const actionArea = el('div', 'action-area');
  actionArea.append(hint, actions);
  bottom.append(camera, actionArea);

  const result = el('div', 'result');
  result.hidden = true;

  root.append(top, preview, bottom, result);

  let infoState = { name: '', mapName: TEXT.mapNames[mapId] ?? mapId };

  return {
    setTurnOrder(entries) {
      order.innerHTML = '';
      const label = el('span', 'turn-order-label');
      label.textContent = TEXT.turnOrder;
      order.append(label);
      entries.forEach((e, i) => {
        const chip = el('span', `chip team-${e.team}${i === 0 ? ' current' : ''}`);
        chip.textContent = TEXT.jobShort[e.jobId] ?? '?';
        chip.title = unitName(e.id, e.jobId);
        order.append(chip);
      });
    },
    setUnitInfo(unit, turnNumber) {
      info.innerHTML = '';
      const head = el('div', 'info-head');
      const turn = el('small');
      turn.textContent = `${infoState.mapName} ・ ${TEXT.turnNumber(turnNumber)}`;
      head.append(turn);
      info.append(head);
      if (!unit) return;
      infoState = { ...infoState, name: unitName(unit.id, unit.jobId) };
      const name = el('strong', `team-text-${unit.team}`);
      name.textContent = `${infoState.name}`;
      const job = el('span', 'job');
      job.textContent = ` ${TEXT.teams[unit.team]}・${TEXT.jobs[unit.jobId] ?? unit.jobId}`;
      const hp = el('div', 'info-hp');
      hp.append(`${TEXT.hp} ${unit.hp} / ${unit.stats.maxHp}`, hpBar(unit.hp, unit.stats.maxHp, unit.team));
      const stats = el('div', 'info-stats');
      stats.textContent = [
        `${TEXT.stats.attack} ${unit.stats.attack}`,
        `${TEXT.stats.move} ${unit.stats.move}`,
        `${TEXT.stats.jump} ${unit.stats.jump}`,
        `${TEXT.stats.speed} ${unit.stats.speed}`,
      ].join(' ・ ');
      info.append(name, job, hp, stats);
    },
    setHint(text) {
      hint.textContent = text;
      hint.hidden = text === '';
    },
    setActions(list) {
      actions.innerHTML = '';
      for (const a of list) {
        const b = button('', a.label, a.onClick, `hud-button action${a.primary ? ' primary' : ''}`);
        b.disabled = a.disabled ?? false;
        actions.append(b);
      }
    },
    showPreview(p) {
      preview.hidden = !p;
      if (!p) return;
      preview.innerHTML = '';
      const title = el('div', 'preview-title');
      title.textContent = `${TEXT.preview.title}: ${p.targetName}`;
      const body = el('div', 'preview-body');
      body.append(sideDiagram(p.side));
      const table = el('dl', 'preview-table');
      const row = (label: string, value: string, cls = '') => {
        const dt = el('dt');
        dt.textContent = label;
        const dd = el('dd', cls);
        dd.textContent = value;
        table.append(dt, dd);
      };
      row(TEXT.preview.direction, TEXT.sides[p.side], `side-${p.side}`);
      row(TEXT.preview.hit, `${p.hitPercent}%`);
      row(TEXT.preview.damage, `${p.damage}（${TEXT.hp} ${p.targetHp} → ${Math.max(0, p.targetHp - p.damage)}）`);
      row(
        TEXT.preview.height,
        TEXT.preview.heightPercent(p.heightPercent),
        p.heightPercent > 0 ? 'up' : p.heightPercent < 0 ? 'down' : '',
      );
      body.append(table);
      preview.append(title, body);
    },
    showResult(winner, turns, onRetry) {
      result.hidden = !winner;
      if (!winner) return;
      result.innerHTML = '';
      const box = el('div', `result-box result-${winner}`);
      const heading = el('div', 'result-title');
      heading.textContent = TEXT.result[winner];
      const detail = el('div', 'result-detail');
      detail.textContent = TEXT.resultDetail(turns);
      box.append(heading, detail);
      if (onRetry) box.append(button('', TEXT.buttons.retry, onRetry, 'hud-button action primary'));
      result.append(box);
    },
  };
}

/**
 * 攻撃対象から見て、どちらから攻撃するかの図。
 * 対象（●）は常に上を向いている（▲）ものとして描き、攻撃の矢印を正面（上）・側面（横）・背面（下）に置く。
 */
function sideDiagram(side: RelativeSide): HTMLElement {
  const box = el('div', `side-diagram side-${side}`);
  box.setAttribute('aria-hidden', 'true');
  const target = el('div', 'diagram-target');
  target.textContent = '▲';
  const arrow = el('div', 'diagram-arrow');
  arrow.textContent = side === 'front' ? '⬇' : side === 'back' ? '⬆' : '➡';
  box.append(target, arrow);
  return box;
}

export function hpBar(hp: number, maxHp: number, team: Team): HTMLElement {
  const bar = el('span', `hp-bar team-${team}`);
  const fill = el('span', 'hp-fill');
  fill.style.width = `${Math.max(0, Math.min(100, (hp / maxHp) * 100))}%`;
  bar.append(fill);
  return bar;
}

function el(tag: string, className?: string): HTMLElement {
  const e = document.createElement(tag);
  if (className) e.className = className;
  return e;
}

function button(
  icon: string,
  label: string,
  onClick: () => void,
  className: string,
  visibleLabel = label,
): HTMLButtonElement {
  const b = document.createElement('button');
  b.type = 'button';
  b.className = className;
  b.setAttribute('aria-label', label);
  if (icon) {
    const i = el('span', 'icon');
    i.textContent = icon;
    b.append(i);
  }
  const l = el('span', 'label');
  l.textContent = visibleLabel;
  b.append(l);
  b.addEventListener('click', onClick);
  return b;
}
