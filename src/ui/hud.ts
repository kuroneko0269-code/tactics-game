import type { SpellEffect, SpellElement, Team, UnitState } from '../core/battleTypes';
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
  showSpellPreview(preview: SpellPreviewView | undefined): void;
  showResult(winner: Team | undefined, turns: number, onRetry?: () => void): void;
}

/** 行動順の欄の1つぶん。ユニットの手番か、魔法の発動 */
export type TurnOrderEntry =
  | { readonly kind: 'turn'; readonly id: string; readonly team: Team; readonly jobId: string }
  | {
      readonly kind: 'spell';
      readonly casterId: string;
      readonly casterJobId: string;
      readonly team: Team;
      readonly spellId: string;
      readonly element: SpellElement;
      /** 指定する前の予測（確定前の発動の予定） */
      readonly pending?: boolean;
    };

export interface HudAction {
  /** ボタンの文言（読み上げにも使う） */
  readonly label: string;
  /** ボタンの中に小さく添える補足（例: 消費 MP） */
  readonly detail?: string;
  readonly onClick: () => void;
  readonly primary?: boolean;
  readonly disabled?: boolean;
  /** 目立たせたい注意のボタン（詠唱の中断など） */
  readonly danger?: boolean;
}

export interface SpellPreviewView {
  readonly spellName: string;
  readonly element: SpellElement;
  readonly effect: SpellEffect;
  /** 狙いの説明（ユニットを追いかけるか、マスに撃つか） */
  readonly targetText: string;
  readonly timing: number;
  readonly mpText: string;
  readonly results: readonly { readonly name: string; readonly team: Team; readonly amount: number; readonly hp: number; readonly maxHp: number }[];
  /** 味方を巻き込む（回復なら敵も回復する）時の警告。なければ空 */
  readonly warning: string;
}

export interface AttackPreviewView {
  readonly targetName: string;
  readonly side: RelativeSide;
  readonly hitPercent: number;
  readonly damage: number;
  readonly heightPercent: number;
  /** 相手が詠唱中なら被ダメージの倍率（%）。そうでなければ 100 */
  readonly chargingPercent: number;
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
        if (e.kind === 'turn') {
          const chip = el('span', `chip team-${e.team}${i === 0 ? ' current' : ''}`);
          chip.textContent = TEXT.jobShort[e.jobId] ?? '?';
          chip.title = unitName(e.id, e.jobId);
          order.append(chip);
          return;
        }
        // 魔法の発動の予定。属性の色で塗り、詠唱者の陣営の色の枠を付ける
        const chip = el('span', `chip spell element-${e.element} team-${e.team}${e.pending ? ' pending' : ''}`);
        chip.textContent = TEXT.spellShort[e.spellId] ?? '?';
        chip.title = TEXT.spellTiming(unitName(e.casterId, e.casterJobId), TEXT.spells[e.spellId] ?? e.spellId);
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
      // MP は HP と並べて表示する（MP を持たないジョブは出さない）
      if (unit.stats.maxMp > 0) {
        const mp = el('span', 'info-mp');
        mp.append(`${TEXT.mp} ${unit.mp} / ${unit.stats.maxMp}`, mpBar(unit.mp, unit.stats.maxMp));
        hp.append(mp);
      }
      const stats = el('div', 'info-stats');
      stats.textContent = [
        `${TEXT.stats.attack} ${unit.stats.attack}`,
        ...(unit.stats.magic > 0 ? [`${TEXT.stats.magic} ${unit.stats.magic}`] : []),
        `${TEXT.stats.move} ${unit.stats.move}`,
        `${TEXT.stats.jump} ${unit.stats.jump}`,
        `${TEXT.stats.speed} ${unit.stats.speed}`,
      ].join(' ・ ');
      info.append(name, job, hp, stats);
      if (unit.charging) {
        const spell = unit.spells.find((sp) => sp.id === unit.charging!.spellId);
        const charging = el('div', `info-charging element-${spell?.element ?? 'fire'}`);
        charging.textContent = TEXT.chargingInfo(TEXT.spells[unit.charging.spellId] ?? unit.charging.spellId);
        info.append(charging);
      }
    },
    setHint(text) {
      hint.textContent = text;
      hint.hidden = text === '';
    },
    setActions(list) {
      actions.innerHTML = '';
      for (const a of list) {
        const cls = `hud-button action${a.primary ? ' primary' : ''}${a.danger ? ' danger' : ''}`;
        const b = button('', a.label, a.onClick, cls);
        if (a.detail) {
          const d = el('span', 'detail');
          d.textContent = a.detail;
          b.append(d);
        }
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
      if (p.chargingPercent !== 100) {
        const note = el('dd', 'charging-note');
        note.textContent = TEXT.preview.charging(p.chargingPercent);
        table.append(el('dt'), note);
      }
      row(
        TEXT.preview.height,
        TEXT.preview.heightPercent(p.heightPercent),
        p.heightPercent > 0 ? 'up' : p.heightPercent < 0 ? 'down' : '',
      );
      body.append(table);
      preview.append(title, body);
    },
    showSpellPreview(p) {
      preview.hidden = !p;
      if (!p) return;
      preview.innerHTML = '';
      const title = el('div', `preview-title element-text-${p.element}`);
      title.textContent = TEXT.spellPreview.title(p.spellName);
      const meta = el('div', 'spell-meta');
      meta.textContent = `${p.targetText} ・ ${TEXT.spellPreview.timing(p.timing)} ・ ${p.mpText}`;
      preview.append(title, meta);
      if (p.warning) {
        const warn = el('div', 'spell-warning');
        warn.setAttribute('role', 'alert');
        warn.textContent = p.warning;
        preview.append(warn);
      }
      const list = el('ul', 'spell-results');
      if (p.results.length === 0) {
        const li = el('li', 'nobody');
        li.textContent = TEXT.spellPreview.nobody;
        list.append(li);
      }
      for (const r of p.results) {
        const li = el('li', `team-text-${r.team}`);
        const sign = p.effect === 'heal' ? '+' : '-';
        const before = p.effect === 'heal' ? r.hp - r.amount : r.hp + r.amount;
        li.textContent = `${r.name}: ${p.effect === 'heal' ? TEXT.spellPreview.heal : TEXT.spellPreview.damage} ${sign}${r.amount}（${TEXT.hp} ${before} → ${r.hp}）`;
        list.append(li);
      }
      const note = el('div', 'spell-note');
      note.textContent = TEXT.spellPreview.note;
      preview.append(list, note);
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

export function mpBar(mp: number, maxMp: number): HTMLElement {
  const bar = el('span', 'mp-bar');
  const fill = el('span', 'mp-fill');
  fill.style.width = `${Math.max(0, Math.min(100, (mp / Math.max(1, maxMp)) * 100))}%`;
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
