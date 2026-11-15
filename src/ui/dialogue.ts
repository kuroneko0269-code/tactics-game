import { advance, applyDirective, applyStep, backlog, isFinished, nextStop, skipToEnd, walkPath, type StageState } from '../core/dialogue';
import type { Coord, Direction } from '../core/geometry';
import type { Directive, RubySegment, Script } from '../core/script';
import { el, showSheet } from './dom';
import { TEXT } from './text';

/**
 * 会話の枠と進行（物語の土台）。台本（core/script.ts）を1手順ずつ進め、画面の下の枠に名前と台詞を出す。
 * 舞台（人形・物・カメラ）は StagePort を通して動かす（会話の場面では舞台の見た目、戦闘中は戦闘の見た目）。
 * - タップで次へ。早送り（台詞を待たずに進む。操作の場面では止まる）、スキップ（確認つき。操作の場面も飛ばす）、読み返し。
 * - 操作の場面: 押し続ける（ねじを巻く）、歩かせる（光るマスを押すと1マスずつ）。初めての時に短く操作のしかたを出す。
 */

/** 舞台を動かす口（会話の場面と、戦闘中の会話で中身が違う） */
export interface StagePort {
  /** 舞台の様子に即座にそろえる */
  sync(stage: StageState): void;
  /** 指示を1つ見せる（before は指示の前の舞台）。fast なら短く */
  run(directive: Directive, before: StageState, fast: boolean): Promise<void>;
  /** 歩かせる: 光らせるマス（空で消す） */
  setWalkTargets?(tiles: readonly Coord[], goal?: Coord): void;
  /** 歩かせる: 1マス歩く */
  step?(actor: string, from: Coord, to: Coord): Promise<void>;
}

export interface DialogueDeps {
  readonly root: HTMLElement;
  readonly port: StagePort;
  /** 初めての時の操作の手引きを出したか・出したことにする */
  readonly hintSeen: (id: string) => boolean;
  readonly markHint: (id: string) => void;
  /** 画面を暗くする（暗転）・戻す */
  readonly setDark: (dark: boolean, ms: number) => Promise<void>;
  /** 舞台の最初の様子（省くと空） */
  readonly initial?: StageState;
  /** 開発中の自動テスト用: true なら台詞をタップを待たずに進める（今までの確認で、戦闘中の会話に止められないように） */
  readonly autoAdvance?: () => boolean;
  /** 旋律と効果音（序章に足りない仕組み）。省くと鳴らさない */
  readonly sound?: DialogueSound;
}

/** 会話から使う音の口 */
export interface DialogueSound {
  playMelody(melody: string, timbre: string, mark?: string): void;
  stopMelody(): void;
  waitMelody(remaining: number): Promise<void>;
  /** 台本の効果音（台本に書く名前） */
  effect(name: string): void;
}

/** 自動プレイが読む、今の会話の様子 */
export interface DialogueStatus {
  readonly active: boolean;
  readonly waiting: 'line' | 'hold' | 'walk' | 'title' | 'busy' | 'none';
  readonly index: number;
  readonly speaker: string | null;
  readonly text: string;
  readonly fast: boolean;
  readonly holdProgress: number;
  readonly holdSteps: number;
  /** 歩かせる時の次のマス */
  readonly walkNext?: Coord;
}

export interface DialogueRun {
  /** 会話が終わった（読み終えたか、スキップした）時に解決する */
  readonly done: Promise<{ readonly skipped: boolean }>;
  readonly status: () => DialogueStatus;
  /** 歩かせる時に、マップのマスがタップされた（候補を優先する順に） */
  onTap(candidates: readonly Coord[]): void;
}

const FAST_LINE_MS = 280;

/** ルビつきの文を、ruby 要素で組み立てる */
export function rubyNodes(segments: readonly RubySegment[]): Node[] {
  return segments.map((s) => {
    if (!s.ruby) return document.createTextNode(s.text);
    const r = document.createElement('ruby');
    r.append(s.text);
    const rt = document.createElement('rt');
    rt.textContent = s.ruby;
    r.append(rt);
    return r;
  });
}

const plain = (segments: readonly RubySegment[]) => segments.map((s) => s.text).join('');

export function runDialogue(script: Script, deps: DialogueDeps): DialogueRun {
  const { root, port } = deps;
  root.innerHTML = '';
  root.hidden = false;
  document.body.classList.add('in-dialogue');

  // ---- 枠 ----
  const box = el('div', 'dialogue-box');
  box.setAttribute('role', 'dialog');
  const tools = el('div', 'dialogue-tools');
  const fastButton = toolButton(TEXT.dialogue.fast, 'fast');
  const logButton = toolButton(TEXT.dialogue.backlog, 'backlog');
  const skipButton = toolButton(TEXT.dialogue.skip, 'skip');
  tools.append(fastButton, logButton, skipButton);
  const name = el('div', 'dialogue-name');
  const text = el('div', 'dialogue-text');
  const next = el('div', 'dialogue-next', '▼');
  const body = el('div', 'dialogue-body');
  body.append(name, text, next);
  box.append(tools, body);
  // 操作の場面の部品（押し続けるボタンと、手引きの文）
  const control = el('div', 'dialogue-control');
  control.hidden = true;
  root.append(control, box);

  let index = 0;
  let stage: StageState = deps.initial ?? { actors: {}, props: {}, dark: false };
  let fast = false;
  let skipped = false;
  let waiting: DialogueStatus['waiting'] = 'busy';
  let speaker: string | null = null;
  let shown = '';
  let holdProgress = 0;
  let holdSteps = 0;
  let walkNext: Coord | undefined;
  /** 今待っているもの（タップ・操作）を解決する関数 */
  let release: (() => void) | undefined;
  let walkTap: ((c: readonly Coord[]) => void) | undefined;
  let sheetOpen = false;

  const wake = () => {
    const r = release;
    release = undefined;
    r?.();
  };
  const wait = (ms: number) =>
    new Promise<void>((resolve) => {
      const t = window.setTimeout(resolve, ms);
      const prev = release;
      release = () => {
        window.clearTimeout(t);
        resolve();
        prev?.();
      };
    });

  fastButton.addEventListener('click', (e) => {
    e.stopPropagation();
    fast = !fast;
    fastButton.setAttribute('aria-pressed', String(fast));
    if (fast && waiting === 'line') wake();
  });
  logButton.addEventListener('click', (e) => {
    e.stopPropagation();
    openBacklog();
  });
  skipButton.addEventListener('click', (e) => {
    e.stopPropagation();
    confirmSkip();
  });
  box.addEventListener('click', () => {
    if (sheetOpen) return;
    if (waiting === 'line') wake();
  });

  const openBacklog = () => {
    sheetOpen = true;
    const list = el('div', 'scroll-area backlog-list');
    for (const entry of backlog(script, index)) {
      const row = el('div', `backlog-row${entry.speaker ? '' : ' narration'}`);
      if (entry.speaker) row.append(el('span', 'backlog-name', entry.speaker));
      const t = el('span', 'backlog-text');
      t.append(...rubyNodes(entry.text));
      row.append(t);
      list.append(row);
    }
    const ref: { sheet?: HTMLElement } = {};
    const close = () => {
      closeSheet(ref.sheet);
      sheetOpen = false;
    };
    ref.sheet = showSheet(root, { kind: 'backlog', title: TEXT.dialogue.backlogTitle, body: [list], closeLabel: TEXT.dialogue.close, onClose: close });
    // いちばん新しい行を見せる
    list.scrollTop = list.scrollHeight;
  };

  const confirmSkip = () => {
    sheetOpen = true;
    const ref: { sheet?: HTMLElement } = {};
    const close = () => {
      closeSheet(ref.sheet);
      sheetOpen = false;
    };
    const yes = el('button', 'screen-button danger dialogue-skip-yes', TEXT.dialogue.skipYes);
    yes.type = 'button';
    yes.setAttribute('aria-label', TEXT.dialogue.skipYes);
    yes.addEventListener('click', () => {
      close();
      skipped = true;
      walkTap = undefined;
      wake();
    });
    ref.sheet = showSheet(root, {
      kind: 'skip',
      title: TEXT.dialogue.skipTitle,
      body: [el('p', 'screen-note', TEXT.dialogue.skipNote), yes],
      closeLabel: TEXT.dialogue.skipNo,
      onClose: close,
    });
  };

  const showLine = (who: string | null, segments: readonly RubySegment[]) => {
    speaker = who;
    shown = plain(segments);
    name.textContent = who ?? '';
    name.hidden = who === null;
    text.className = `dialogue-text${who === null ? ' narration' : ''}`;
    text.replaceChildren(...rubyNodes(segments));
    box.classList.toggle('narration', who === null);
    box.hidden = false;
  };

  /** 操作のしかたを初めての時だけ出す */
  const hint = (id: string, message: string) => {
    if (deps.hintSeen(id)) return;
    deps.markHint(id);
    const h = el('div', 'dialogue-hint', message);
    control.prepend(h);
  };

  const holdStep = (steps: number, label: string) =>
    new Promise<void>((resolve) => {
      holdProgress = 0;
      holdSteps = steps;
      control.hidden = false;
      control.innerHTML = '';
      hint('hold', TEXT.dialogue.holdHint);
      const button = el('button', 'hold-button');
      button.type = 'button';
      button.setAttribute('aria-label', label || TEXT.dialogue.holdDefault);
      const meter = el('span', 'hold-meter');
      const fill = el('span', 'hold-fill');
      meter.append(fill);
      button.append(el('span', 'label', label || TEXT.dialogue.holdDefault), meter);
      control.append(button);
      let timer: number | undefined;
      const stop = () => {
        if (timer !== undefined) window.clearInterval(timer);
        timer = undefined;
        button.classList.remove('holding');
      };
      const finish = () => {
        stop();
        control.hidden = true;
        control.innerHTML = '';
        release = undefined;
        resolve();
      };
      const tick = () => {
        holdProgress = Math.min(steps, holdProgress + 1);
        fill.style.width = `${Math.floor((holdProgress * 100) / steps)}%`;
        button.dataset.progress = String(holdProgress);
        if (holdProgress >= steps) finish();
      };
      button.addEventListener('pointerdown', (e) => {
        e.preventDefault();
        if (timer !== undefined) return;
        button.classList.add('holding');
        tick();
        timer = window.setInterval(tick, 110);
      });
      for (const ev of ['pointerup', 'pointerleave', 'pointercancel'] as const) button.addEventListener(ev, stop);
      // スキップされた時
      release = finish;
    });

  /** 章の題を画面いっぱいに出す（タップか、少し待つと次へ。早送りなら短く） */
  const chapterTitle = (title: string, subtitle: string) =>
    new Promise<void>((resolve) => {
      const card = el('div', 'chapter-title-card');
      card.dataset.screen = 'chapter-title';
      card.append(el('div', 'chapter-title-main', title), el('div', 'chapter-title-sub', subtitle), el('div', 'chapter-title-next', TEXT.dialogue.titleNext));
      document.body.append(card);
      let closed = false;
      const close = () => {
        if (closed) return;
        closed = true;
        window.clearTimeout(timer);
        card.classList.add('closing');
        window.setTimeout(() => card.remove(), 300);
        release = undefined;
        resolve();
      };
      // 文字が出そろうまでの間は、タップで閉じない（誤って飛ばさないように）
      let ready = false;
      window.setTimeout(() => (ready = true), fast ? 0 : 700);
      card.addEventListener('click', () => {
        if (ready) close();
      });
      const timer = window.setTimeout(close, fast || deps.autoAdvance?.() ? 500 : 4200);
      release = close;
    });

  const walkStep = (actor: string, path: readonly Coord[]) =>
    new Promise<void>((resolve) => {
      let at = 0;
      const startPos = stage.actors[actor];
      let current: Coord = startPos ? { x: startPos.x, z: startPos.z } : path[0]!;
      hint('walk', TEXT.dialogue.walkHint);
      control.hidden = false;
      const show = () => {
        walkNext = path[at];
        port.setWalkTargets?.(walkNext ? [walkNext] : [], path[path.length - 1]);
      };
      const finish = () => {
        walkTap = undefined;
        walkNext = undefined;
        port.setWalkTargets?.([]);
        control.hidden = true;
        control.innerHTML = '';
        release = undefined;
        resolve();
      };
      show();
      let moving = false;
      walkTap = (candidates) => {
        const target = path[at];
        if (moving || !target || !candidates.some((c) => c.x === target.x && c.z === target.z)) return;
        moving = true;
        void (port.step?.(actor, current, target) ?? Promise.resolve()).then(() => {
          moving = false;
          current = target;
          at++;
          if (at >= path.length) finish();
          else show();
        });
      };
      release = finish;
    });

  const done = (async () => {
    port.sync(stage);
    for (;;) {
      if (skipped) break;
      if (isFinished(script, index)) break;
      const step = script.steps[index]!;
      waiting = 'busy';
      if (step.kind === 'directive') {
        const d = step.directive;
        if (d.kind === 'hold') {
          box.hidden = true;
          waiting = 'hold';
          await holdStep(d.steps, d.label);
        } else if (d.kind === 'chapterTitle') {
          box.hidden = true;
          waiting = 'title';
          await chapterTitle(d.title, d.subtitle);
        } else if (d.kind === 'walkControl') {
          waiting = 'walk';
          await walkStep(d.actor, d.path);
          if (!skipped) port.sync(applyDirective(stage, d));
        } else {
          await runDirective(d);
        }
        if (skipped) break;
        stage = applyStep(stage, step);
        index = advance(script, index);
        continue;
      }
      for (const d of step.directives) {
        await runDirective(d);
        stage = applyDirective(stage, d);
        if (skipped) break;
      }
      if (skipped) break;
      showLine(step.speaker, step.text);
      waiting = 'line';
      if (fast || deps.autoAdvance?.()) await wait(fast ? FAST_LINE_MS : 30);
      else await new Promise<void>((resolve) => (release = resolve));
      index = advance(script, nextStop(script, index));
    }
    if (skipped) {
      deps.sound?.stopMelody();
      const r = skipToEnd(script, index, stage);
      stage = r.stage;
      index = r.index;
      port.sync(stage);
      await deps.setDark(stage.dark, 0);
    }
    waiting = 'none';
    root.innerHTML = '';
    root.hidden = true;
    document.body.classList.remove('in-dialogue');
    return { skipped };
  })();

  /** 指示を見せる（暗転と間は、ここで扱う） */
  async function runDirective(d: Directive): Promise<void> {
    if (d.kind === 'fadeOut' || d.kind === 'fadeIn') {
      await deps.setDark(d.kind === 'fadeOut', fast ? Math.min(d.ms, 150) : d.ms);
      return;
    }
    if (d.kind === 'wait') {
      await wait(fast ? Math.min(d.ms, 120) : d.ms);
      return;
    }
    // 旋律と効果音（序章に足りない仕組み）。旋律は待たずに次へ進む（待つ時は 節を待つ）
    if (d.kind === 'melody') return deps.sound?.playMelody(d.melody, d.timbre, d.mark);
    if (d.kind === 'melodyStop') return deps.sound?.stopMelody();
    if (d.kind === 'sound') return deps.sound?.effect(d.sound);
    if (d.kind === 'melodyWait') {
      // 早送りの時は待たない（節はそのまま鳴り続ける）
      if (fast || !deps.sound) return;
      const p = deps.sound.waitMelody(d.remaining);
      // スキップされたら、待つのをやめる
      await new Promise<void>((resolve) => {
        const prev = release;
        release = () => {
          resolve();
          prev?.();
        };
        void p.then(resolve);
      });
      return;
    }
    await port.run(d, stage, fast);
  }

  return {
    done,
    status: () => ({
      active: waiting !== 'none',
      waiting,
      index,
      speaker,
      text: shown,
      fast,
      holdProgress,
      holdSteps,
      ...(walkNext ? { walkNext } : {}),
    }),
    onTap(candidates) {
      walkTap?.(candidates);
    },
  };
}

/** 下からせり上がる欄と、その後ろの暗い幕を消す */
function closeSheet(sheet: HTMLElement | undefined): void {
  const backdrop = sheet?.previousElementSibling;
  if (backdrop?.classList.contains('sheet-backdrop')) backdrop.remove();
  sheet?.remove();
}

function toolButton(label: string, key: string): HTMLButtonElement {
  const b = document.createElement('button');
  b.type = 'button';
  b.className = `dialogue-tool tool-${key}`;
  b.textContent = label;
  b.setAttribute('aria-label', label);
  if (key === 'fast') b.setAttribute('aria-pressed', 'false');
  return b;
}

/** 歩く指示の道順（舞台にいない人物なら行き先だけ） */
export function directiveWalkPath(stage: StageState, actor: string, to: Coord): Coord[] {
  const a = stage.actors[actor];
  return a ? walkPath(a, to) : [to];
}

/** 2つのマスの向き（相手の方を向く時） */
export function facingToward(from: Coord, to: Coord, fallback: Direction): Direction {
  const dx = to.x - from.x;
  const dz = to.z - from.z;
  if (dx === 0 && dz === 0) return fallback;
  if (Math.abs(dx) >= Math.abs(dz)) return dx > 0 ? 'east' : 'west';
  return dz > 0 ? 'south' : 'north';
}
