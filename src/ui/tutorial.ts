import type { TutorialStep } from '../core/sortie';
import type { Coord } from '../core/geometry';
import type { TutorialModeInfo } from './battleController';
import { el } from './dom';
import { TEXT } from './text';

/**
 * 戦闘の手ほどき（序章に足りない仕組み）。戦場の定義の tutorial（段の列）を順に出す。
 * - 味方の手番で、操作の段階（移動を選ぶ・攻撃の相手を選ぶ・確定・向き など）が段の mode になったら、
 *   指し示す印（マス・ユニット・ボタン）と短い説明を出し、その操作が済む（段階が変わる）と次の段へ進む。
 * - 人物を決めた段（unitId）・高さを決めた段（minHeight）・回数を決めた段（tally）は、その条件が合う時に出す。条件の合わない段は飛ばして、
 *   先の段を出してよい（人物ごとの手番の順は戦闘ごとに違うため）。人物を決めていない段は、順に出す。
 * - 「手ほどきを飛ばす」で、残りをすべて出さない。最後まで進むか飛ばすと onFinished を呼ぶ（見たことを設定に残す）。
 * - 印と説明はタップを横取りしない（飛ばすボタンだけ押せる）。
 */
export interface TutorialScreen {
  /** 操作の段階が変わった時に呼ぶ。modeKey は TutorialStep の mode と同じ名前か 'busy' など。reachable は移動できるマス */
  onMode(modeKey: string, info: TutorialModeInfo): void;
  /** 毎フレーム呼ぶ（印を、カメラの動きに合わせて置き直す） */
  update(): void;
  /** 今出している段（自動テスト用） */
  status(): { readonly step: string | null; readonly index: number; readonly done: boolean };
  dispose(): void;
}

export interface TutorialPorts {
  readonly tileScreen: (x: number, z: number) => { x: number; y: number };
  readonly unitScreen: (id: string) => { x: number; y: number } | undefined;
  readonly onFinished: () => void;
}

export function createTutorial(root: HTMLElement, steps: readonly TutorialStep[], ports: TutorialPorts): TutorialScreen {
  const layer = el('div', 'tutorial-layer');
  const pointer = el('div', 'tutorial-pointer');
  pointer.append(el('span', 'tutorial-ring'), el('span', 'tutorial-arrow', '▼'));
  const bubble = el('div', 'tutorial-bubble');
  const label = el('div', 'tutorial-label', TEXT.tutorial.label);
  const text = el('div', 'tutorial-text');
  const skip = document.createElement('button');
  skip.type = 'button';
  skip.className = 'screen-button quiet tutorial-skip';
  skip.textContent = TEXT.tutorial.skip;
  skip.setAttribute('aria-label', TEXT.tutorial.skip);
  bubble.append(label, text, skip);
  layer.append(pointer, bubble);
  layer.hidden = true;
  root.append(layer);

  let index = 0;
  /** 出し終えた段 */
  const shown = new Set<number>();
  let showing: TutorialStep | undefined;
  let showingIndex = -1;
  let target: (() => { x: number; y: number } | undefined) | undefined;
  let done = false;

  const finish = () => {
    if (done) return;
    done = true;
    showing = undefined;
    layer.hidden = true;
    ports.onFinished();
  };
  skip.addEventListener('click', (e) => {
    e.stopPropagation();
    finish();
  });

  const pointFor = (step: TutorialStep, reachable: readonly Coord[]): (() => { x: number; y: number } | undefined) | undefined => {
    const p = step.point;
    if (!p) return undefined;
    switch (p.kind) {
      case 'tile':
        return () => ports.tileScreen(p.x, p.z);
      case 'unit':
        return () => ports.unitScreen(p.unitId);
      case 'button':
        return () => {
          const b = document.querySelector<HTMLElement>(`#hud [data-key="${p.button}"]`);
          if (!b || b.offsetParent === null) return undefined;
          const r = b.getBoundingClientRect();
          return { x: r.left + r.width / 2, y: r.top };
        };
      case 'reachToward': {
        // 移動できるマスのうち、目標にいちばん近いマス
        let best: Coord | undefined;
        for (const c of reachable) {
          const d = Math.abs(c.x - p.x) + Math.abs(c.z - p.z);
          if (!best || d < Math.abs(best.x - p.x) + Math.abs(best.z - p.z)) best = c;
        }
        return best ? () => ports.tileScreen(best.x, best.z) : undefined;
      }
    }
  };

  const show = (step: TutorialStep, reachable: readonly Coord[]) => {
    showing = step;
    text.textContent = TEXT.tutorial.steps[step.id] ?? step.id;
    target = pointFor(step, reachable);
    layer.hidden = false;
    layer.dataset.step = step.id;
    place();
  };

  const place = () => {
    const at = target?.();
    pointer.hidden = !at;
    if (at) {
      pointer.style.left = `${Math.round(at.x)}px`;
      pointer.style.top = `${Math.round(at.y)}px`;
    }
    // 説明は、指し示す所と重ならない側（画面の上か下）に出す
    const upper = at ? at.y > window.innerHeight * 0.45 : false;
    bubble.classList.toggle('upper', upper);
  };

  return {
    onMode(modeKey, info) {
      if (done) return;
      // 出している段の操作が済んだ（段階が変わった）: 次の段へ
      if (showing && showing.mode !== modeKey) {
        showing = undefined;
        shown.add(showingIndex);
        index = shown.size;
        layer.hidden = true;
        if (shown.size >= steps.length) return finish();
      }
      if (showing) return;
      const matches = (st: TutorialStep) =>
        st.mode === modeKey &&
        info.playerTurn >= (st.turn ?? 1) &&
        (st.unitId === undefined || st.unitId === info.unitId) &&
        (st.minHeight === undefined || (info.height ?? 0) >= st.minHeight) &&
        (st.tally === undefined || (info.tallies?.[st.tally.id] ?? 0) >= st.tally.atLeast);
      for (let i = 0; i < steps.length; i++) {
        if (shown.has(i)) continue;
        const st = steps[i]!;
        if (matches(st)) {
          showingIndex = i;
          return show(st, info.reachable);
        }
        // 条件を決めていない段は順に出す（その段が出るまで、後の段は待つ）
        if (st.unitId === undefined && st.tally === undefined) return;
      }
    },
    update() {
      if (showing) place();
    },
    status: () => ({ step: showing?.id ?? null, index, done }),
    dispose() {
      layer.remove();
    },
  };
}
