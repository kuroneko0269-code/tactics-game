import { advance, applyDirective, applyStep, backlog, isFinished, lineBeforeControl, nextStop, skipToEnd, walkPath, type StageState } from '../core/dialogue';
import type { Coord, Direction } from '../core/geometry';
import { listenPhase, listenRestart, listenTotal, type ListenTimeline } from '../core/listen';
import type { Directive, RubySegment, Script } from '../core/script';
import { el, showSheet } from './dom';
import { plateStyle } from './speakerStyle';
import { TEXT } from './text';

/**
 * 会話の枠と進行（物語の土台）。台本（core/script.ts）を1手順ずつ進め、画面の下の枠に顔の枠・名前の札・台詞を出す。
 * 語り（地の文）は枠に入れず、時と場所の字幕として画面の上（暗転中は中央）に出す。
 * 台詞の間は、マップ上の話者に印を出し、カメラを少しだけ寄せる（StagePort の highlight）。
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
  /** 話者の強調: マップ上のその人物の頭上に印を出し、カメラを少しだけ寄せる。null で印を消し、カメラを戻す */
  highlight?(speaker: string | null): void;
  /** 物をタップする操作: その物を光らせる（null で消す）。物のあるマス */
  setTapTarget?(name: string | null): Coord | undefined;
}

/** 顔の枠（話者の人形を別のカメラで写した canvas と、写す人物の切り替え） */
export interface PortraitPort {
  readonly canvas: HTMLCanvasElement;
  show(name: string | null): void;
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
  /** 顔の枠。省くと出さない */
  readonly portrait?: PortraitPort;
  /** 人物の服の主な色と帯の色（名前の札の色）。省くと決まった色 */
  readonly speakerColors?: (name: string) => { readonly body: number; readonly accent: number } | undefined;
}

/** 会話から使う音の口 */
export interface DialogueSound {
  playMelody(melody: string, timbre: string, mark?: string): void;
  stopMelody(): void;
  waitMelody(remaining: number): Promise<void>;
  /** 台本の効果音（台本に書く名前） */
  effect(name: string): void;
  /** 戦闘中に遠くで鳴らしている旋律も含めて、すべての旋律を止める（台本の @節を止める） */
  stopAll?(): void;
  /**
   * 耳に当てて聞く操作: 押していた時間の合計 elapsedMs の所から鳴らしはじめる（貝殻の音と旋律）。listenPause で止める。
   * timeline は鳴らす時刻の表（src/core/listen.ts）
   */
  listenFrom?(melody: string, timbre: string, timeline: ListenTimeline, elapsedMs: number): void;
  /** 聞く操作を止める（finished なら、鳴っている音の余韻は切らない） */
  listenPause?(finished: boolean): void;
  /** 旋律の各音の始まりの時刻（聞く操作の表を作るため） */
  listenTimeline?(melody: string): ListenTimeline | undefined;
}

/** 自動プレイが読む、今の会話の様子 */
export interface DialogueStatus {
  readonly active: boolean;
  readonly waiting: 'line' | 'hold' | 'walk' | 'tap' | 'listen' | 'title' | 'busy' | 'none';
  readonly index: number;
  readonly speaker: string | null;
  readonly text: string;
  readonly fast: boolean;
  readonly holdProgress: number;
  readonly holdSteps: number;
  /** 歩かせる時の次のマス */
  readonly walkNext?: Coord;
  /** 顔の枠に写している人物（出していなければ null） */
  readonly face: string | null;
  /** マップ上で強調している話者（していなければ null） */
  readonly highlighted: string | null;
  /** 名前の札に添えた肩書き（なければ空） */
  readonly title: string;
  /** 語りを字幕として出しているか */
  readonly caption: boolean;
  /** 物の文字を出しているか */
  readonly inscription: boolean;
  /** 物をタップする操作の、物のあるマス */
  readonly tapTarget?: Coord;
  /** 耳に当てて聞く操作: 押していた時間の合計・全体の長さ・今押しているか */
  readonly listenMs: number;
  readonly listenTotal: number;
  readonly listening: boolean;
}

export interface DialogueRun {
  /** 会話が終わった（読み終えたか、スキップした）時に解決する */
  readonly done: Promise<{ readonly skipped: boolean }>;
  readonly status: () => DialogueStatus;
  /** 歩かせる時に、マップのマスがタップされた（候補を優先する順に） */
  onTap(candidates: readonly Coord[]): void;
  /** 画面（マップ）がタップされた: 台詞・語りを読んでいる時は次へ進める。進めたら true */
  advance(): boolean;
  /** 今の舞台の様子（自動テスト用） */
  stage(): StageState;
  /** 会話を打ち切る（スキップと同じく、会話の終わりの様子にそろえて終える。確認用の機能の「勝ったことにする」で使う） */
  abort(): void;
}

const FAST_LINE_MS = 280;

/** ルビつきの文を、ruby 要素で組み立てる */
export function rubyNodes(segments: readonly RubySegment[]): Node[] {
  return segments.flatMap((s): Node[] => {
    // 字幕の改行（台本の ／）
    if (!s.ruby && s.text.includes('\n')) return s.text.split('\n').flatMap((t, i) => (i === 0 ? [document.createTextNode(t)] : [document.createElement('br'), document.createTextNode(t)]));
    if (!s.ruby) return [document.createTextNode(s.text)];
    const r = document.createElement('ruby');
    r.append(s.text);
    const rt = document.createElement('rt');
    rt.textContent = s.ruby;
    r.append(rt);
    return [r];
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
  // 顔の枠（話者の人形を写す）・名前の札（名前と肩書き）・台詞
  const face = el('div', 'dialogue-face');
  face.hidden = true;
  if (deps.portrait) face.append(deps.portrait.canvas);
  const plate = el('div', 'dialogue-plate');
  const name = el('span', 'dialogue-name');
  const title = el('span', 'dialogue-title');
  plate.append(name, title);
  const text = el('div', 'dialogue-text');
  const next = el('div', 'dialogue-next', '▼');
  const body = el('div', 'dialogue-body');
  body.append(face, plate, text, next);
  box.append(tools, body);
  // 最初の台詞が出るまで（動きだけの間）は、台詞の枠を出さず、道具のボタンだけを出す
  box.classList.add('tools-only');
  // 語りの字幕（枠なし。時と場所を短く）
  const caption = el('div', 'dialogue-caption');
  caption.hidden = true;
  const captionText = el('div', 'dialogue-caption-text');
  caption.append(captionText, el('div', 'dialogue-caption-next', '▼'));
  // 物に書かれた文字（測り棒の札・封蝋の印）。物を大きく映した上に、読める大きさで出す
  const inscription = el('div', 'dialogue-inscription');
  inscription.hidden = true;
  const inscriptionLabel = el('div', 'dialogue-inscription-label');
  const inscriptionText = el('div', 'dialogue-inscription-text');
  inscription.append(inscriptionLabel, inscriptionText, el('div', 'dialogue-caption-next', '▼'));
  // 操作の場面の部品（押し続けるボタンと、手引きの文）
  const control = el('div', 'dialogue-control');
  control.hidden = true;
  root.append(caption, inscription, control, box);

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
  let faceName: string | null = null;
  let highlighted: string | null = null;
  let shownTitle = '';
  let tapTarget: Coord | undefined;
  let listenMs = 0;
  let listenAll = 0;
  let listening = false;
  /** 聞く操作で、押していた時間の合計（押している間も進む） */
  let listenNow = () => listenMs;
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

  const setFast = (on: boolean) => {
    fast = on;
    fastButton.setAttribute('aria-pressed', String(fast));
  };
  fastButton.addEventListener('click', (e) => {
    e.stopPropagation();
    setFast(!fast);
    // 操作の直前の台詞は、早送りでも待つ（読む前に操作へ進まないように）
    if (fast && waiting === 'line' && !lineBeforeControl(script, index)) wake();
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
  caption.addEventListener('click', () => {
    if (sheetOpen) return;
    if (waiting === 'line') wake();
  });
  inscription.addEventListener('click', () => {
    if (sheetOpen) return;
    if (waiting === 'line') wake();
  });

  const openBacklog = () => {
    sheetOpen = true;
    const list = el('div', 'scroll-area backlog-list');
    for (const entry of backlog(script, index)) {
      const row = el('div', `backlog-row${entry.speaker ? '' : ' narration'}`);
      if (entry.speaker) {
        const n = el('span', 'backlog-name', entry.speaker);
        paintPlate(n, entry.speaker);
        row.append(n);
      }
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

  /** 名前の札の色（人物の服の主な色。縁は帯の色） */
  const paintPlate = (node: HTMLElement, who: string) => {
    const c = deps.speakerColors?.(who);
    if (!c) {
      node.removeAttribute('style');
      return;
    }
    const st = plateStyle(c.body, c.accent);
    node.style.background = st.background;
    node.style.color = st.color;
    node.style.borderColor = st.border;
  };

  /** 顔の枠と話者の強調を切り替える（null で消す） */
  const setSpeakerView = (faceOf: string | null, highlight: string | null) => {
    faceName = deps.portrait ? faceOf : null;
    deps.portrait?.show(faceName);
    face.hidden = faceName === null;
    body.classList.toggle('no-face', faceName === null);
    // 同じ話者でも毎回呼ぶ（間にカメラの指示があった時に、新しい視点から寄せ直すため。同じなら動かない）
    if (highlight !== null || highlighted !== null) port.highlight?.(highlight);
    highlighted = highlight;
  };

  const showLine = (step: Extract<Script['steps'][number], { kind: 'line' }>) => {
    const who = step.speaker;
    speaker = who;
    shown = plain(step.text);
    inscription.hidden = true;
    if (step.inscription && who !== null) {
      // 物の文字: 台詞の枠と字幕を隠し、画面の中ほどに大きく出す（顔の枠と話者の強調はしない。道具のボタンは残す）
      caption.hidden = true;
      box.hidden = false;
      box.classList.add('tools-only');
      box.classList.remove('narration');
      inscriptionLabel.textContent = who;
      inscriptionText.replaceChildren(...rubyNodes(step.text));
      inscription.hidden = false;
      shownTitle = '';
      setSpeakerView(null, null);
      return;
    }
    if (who === null) {
      // 語り: 枠には入れず、字幕として出す（暗転中は画面の中央）
      captionText.replaceChildren(...rubyNodes(step.text));
      caption.classList.toggle('centered', stage.dark);
      caption.hidden = false;
      box.classList.add('narration');
      box.classList.remove('tools-only');
      shownTitle = '';
      setSpeakerView(null, null);
      box.hidden = false;
      return;
    }
    caption.hidden = true;
    box.classList.remove('narration', 'tools-only');
    name.textContent = who;
    paintPlate(plate, who);
    shownTitle = stage.titles?.[who] ?? '';
    title.textContent = shownTitle;
    title.hidden = shownTitle === '';
    text.replaceChildren(...rubyNodes(step.text));
    setSpeakerView(step.portrait === false ? null : who, step.highlight === false ? null : who);
    box.hidden = false;
  };
  /**
   * 台詞・語りを隠す（操作の場面・章の題の間）。操作の場面では、早送り・読み返し・スキップのボタンだけを残す
   * （操作の場面もスキップで飛ばせるように。台詞の枠は隠して、光るマスや物を覆わない）
   */
  const hideLine = (keepTools = false) => {
    box.hidden = !keepTools;
    box.classList.toggle('tools-only', keepTools);
    caption.hidden = true;
    inscription.hidden = true;
    setSpeakerView(null, null);
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

  /** 物をタップする操作（戸を開ける・石を拾う）。物を光らせ、そのマスか物を押すと次へ。手もとのボタンでも進める */
  const tapStep = (target: string, label: string) =>
    new Promise<void>((resolve) => {
      control.hidden = false;
      control.innerHTML = '';
      hint('tap', TEXT.dialogue.tapHint);
      tapTarget = port.setTapTarget?.(target) ?? (stage.props[target] ? { x: stage.props[target]!.x, z: stage.props[target]!.z } : undefined);
      const button = el('button', 'screen-button tap-button', label || TEXT.dialogue.tapHint);
      button.type = 'button';
      button.setAttribute('aria-label', label || TEXT.dialogue.tapHint);
      control.append(button);
      const finish = () => {
        walkTap = undefined;
        tapTarget = undefined;
        port.setTapTarget?.(null);
        control.hidden = true;
        control.innerHTML = '';
        release = undefined;
        resolve();
      };
      button.addEventListener('click', (e) => {
        e.stopPropagation();
        finish();
      });
      walkTap = (candidates) => {
        const t = tapTarget;
        if (t && candidates.some((c) => c.x === t.x && c.z === t.z)) finish();
      };
      release = finish;
    });

  /**
   * 耳に当てて聞く操作。押している間だけ時間が進み、貝殻の音から旋律へ移る。離すと止まり、押し直すと節の頭から（貝殻の音の間なら続きから）。
   * 旋律を鳴りきると次へ（余韻は切らない）
   */
  const listenStep = (melody: string, timbre: string, label: string) =>
    new Promise<void>((resolve) => {
      const timeline = deps.sound?.listenTimeline?.(melody);
      listenMs = 0;
      listenAll = timeline ? listenTotal(timeline) : 0;
      control.hidden = false;
      control.innerHTML = '';
      hint('listen', TEXT.dialogue.listenHint);
      const button = el('button', 'hold-button listen-button');
      button.type = 'button';
      button.setAttribute('aria-label', label || TEXT.dialogue.listenDefault);
      const meter = el('span', 'hold-meter');
      const fill = el('span', 'hold-fill');
      meter.append(fill);
      button.append(el('span', 'label', label || TEXT.dialogue.listenDefault), meter);
      control.append(button);
      let since: number | undefined;
      let timer: number | undefined;
      const elapsed = () => listenMs + (since === undefined ? 0 : performance.now() - since);
      listenNow = elapsed;
      const finish = (completed: boolean) => {
        if (timer !== undefined) window.clearInterval(timer);
        timer = undefined;
        since = undefined;
        listening = false;
        deps.sound?.listenPause?.(completed);
        control.hidden = true;
        control.innerHTML = '';
        release = undefined;
        resolve();
      };
      const tick = () => {
        const e = elapsed();
        fill.style.width = `${listenAll ? Math.min(100, Math.floor((e * 100) / listenAll)) : 100}%`;
        if (!timeline || listenPhase(timeline, e).done) {
          listenMs = listenAll;
          finish(true);
        }
      };
      const down = (e: Event) => {
        e.preventDefault();
        if (since !== undefined) return;
        // 押し直した時は、旋律がもう始まっていれば節の頭から鳴らし直す（終わりの三つの音まで、途切れずに一度聞かせるため）
        if (timeline) listenMs = listenRestart(timeline, listenMs);
        since = performance.now();
        listening = true;
        button.classList.add('holding');
        if (timeline) deps.sound?.listenFrom?.(melody, timbre, timeline, Math.floor(listenMs));
        timer = window.setInterval(tick, 50);
        tick();
      };
      const up = () => {
        if (since === undefined) return;
        listenMs = Math.floor(elapsed());
        since = undefined;
        listening = false;
        button.classList.remove('holding');
        if (timer !== undefined) window.clearInterval(timer);
        timer = undefined;
        deps.sound?.listenPause?.(false);
      };
      button.addEventListener('pointerdown', down);
      for (const ev of ['pointerup', 'pointerleave', 'pointercancel'] as const) button.addEventListener(ev, up);
      // スキップされた時
      release = () => finish(false);
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
          hideLine(true);
          setFast(false);
          waiting = 'hold';
          await holdStep(d.steps, d.label);
        } else if (d.kind === 'chapterTitle') {
          hideLine();
          waiting = 'title';
          await chapterTitle(d.title, d.subtitle);
        } else if (d.kind === 'tapControl') {
          hideLine(true);
          setFast(false);
          waiting = 'tap';
          await tapStep(d.target, d.label);
        } else if (d.kind === 'listen') {
          hideLine(true);
          setFast(false);
          waiting = 'listen';
          await listenStep(d.melody, d.timbre, d.label);
        } else if (d.kind === 'walkControl') {
          // 歩かせる間は台詞の枠を隠す（横向きの低い画面で、枠が光るマスを覆わないように）。スキップのボタンは残す
          hideLine(true);
          setFast(false);
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
      showLine(step);
      waiting = 'line';
      // 早送りは操作の場面で止まる。操作の直前の台詞（場面9の母の「だれ？」など）は、早送りでもタップを待つ
      if (deps.autoAdvance?.() || (fast && !lineBeforeControl(script, index))) await wait(fast ? FAST_LINE_MS : 30);
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
    setSpeakerView(null, null);
    waiting = 'none';
    root.innerHTML = '';
    root.hidden = true;
    document.body.classList.remove('in-dialogue');
    return { skipped };
  })();

  /** 指示を見せる（暗転と間は、ここで扱う）。before は指示の前の舞台（同時の指示の中では、それまでの指示を行った舞台） */
  async function runDirective(d: Directive, before: StageState = stage): Promise<void> {
    // 同時: 中の指示を一斉に始め、すべて終わるまで待つ
    if (d.kind === 'together') {
      let st = before;
      const all: Promise<void>[] = [];
      for (const x of d.directives) {
        all.push(runDirective(x, st));
        st = applyDirective(st, x);
      }
      await Promise.all(all);
      return;
    }
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
    if (d.kind === 'melodyStop') return deps.sound?.stopAll ? deps.sound.stopAll() : deps.sound?.stopMelody();
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
    await port.run(d, before, fast);
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
      face: faceName,
      highlighted,
      title: shownTitle,
      caption: !caption.hidden,
      inscription: !inscription.hidden,
      ...(tapTarget ? { tapTarget } : {}),
      listenMs: Math.floor(listenNow()),
      listenTotal: listenAll,
      listening,
    }),
    onTap(candidates) {
      walkTap?.(candidates);
    },
    stage: () => stage,
    abort() {
      skipped = true;
      walkTap = undefined;
      wake();
    },
    advance() {
      if (sheetOpen || waiting !== 'line') return false;
      wake();
      return true;
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
