import { advance, applyDirective, applyStep, backlog, isFinished, isStop, lineBeforeControl, nextStop, skipToEnd, walkPath, type StageState } from '../core/dialogue';
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
  /** 物か人物の、今の画面座標（物の名前の札を出す所）。見えなければ undefined */
  screenOf?(name: string): { readonly x: number; readonly y: number } | undefined;
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
  /** 短い画を重ねる（@重ねる。回想の台本を ms の間だけ、今の場面の上に重ねる）。省くと待つだけ */
  readonly overlay?: (scriptId: string, ms: number, fast: boolean) => Promise<void>;
  /** 札・名札を出した時に知らせる（自動テストの記録用） */
  readonly onNotice?: (kind: 'placard' | 'nameTag' | 'objectLabel' | 'inscription', text: string) => void;
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
  /** 鳴っている旋律を、終わりから remaining 個目の音の手前で切る（0 ならすぐ）。切った時に解決する */
  cutMelody?(remaining: number): Promise<void>;
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
  /** 出している場所と時の札（出していなければ空） */
  readonly placard: string;
  /** 出している名札（名前〔肩書き〕。出していなければ空） */
  readonly nameTag: string;
  /** 短い画を重ねているか */
  readonly overlay: boolean;
  /** 出している物の名前の札（出していなければ空） */
  readonly objectLabel: string;
  /** 耳に当てて聞く操作: 押していた時間の合計・全体の長さ・今押しているか */
  readonly listenMs: number;
  readonly listenTotal: number;
  readonly listening: boolean;
  /** 今進めている脚本の行の印（@脚本 場面-行。例 1-5。印がまだなければ空）。画面写真を脚本の行と並べるため */
  readonly cue: string;
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
/** その前に、出ている台詞の枠を閉じる指示（場面の切り替え・人物が消える・光が立つ） */
const CLOSES_LINE: ReadonlySet<Directive['kind']> = new Set(['fadeOut', 'location', 'cut', 'overlay', 'exit', 'light', 'chapterTitle', 'melody', 'walk', 'gesture', 'wait']);
/** 聞く操作で、押されないまま手の絵を目立たせるまでの時間 */
const LISTEN_IDLE_MS = 3500;

/** 押し続ける手の絵（指で押し込んだまま、下に輪が広がる）。文字を出さない場面の聞く操作で使う */
function holdHandIcon(): HTMLElement {
  const wrap = el('span', 'hold-hand');
  wrap.setAttribute('aria-hidden', 'true');
  wrap.innerHTML =
    '<svg viewBox="0 0 64 64" width="56" height="56">' +
    '<ellipse class="hold-hand-ripple" cx="32" cy="54" rx="14" ry="4" fill="none" stroke="currentColor" stroke-width="2"/>' +
    '<ellipse cx="32" cy="54" rx="7" ry="2.2" fill="currentColor" opacity="0.6"/>' +
    '<g class="hold-hand-finger" fill="currentColor">' +
    '<rect x="27" y="14" width="10" height="30" rx="5"/>' +
    '<path d="M20 30 q0-5 5-5 h14 q5 0 5 5 v8 q0 10-12 10 q-12 0-12-10 z"/>' +
    '</g></svg>';
  return wrap;
}

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

/**
 * 物に書かれた文字を組み立てる。終わりが全角の空白で区切られた短い名（測り棒の札の「\u3000ユナ」）なら、署名として右に寄せて出す
 */
export function inscriptionNodes(segments: readonly RubySegment[]): Node[] {
  const last = segments[segments.length - 1];
  const at = last && !last.ruby ? last.text.lastIndexOf('\u3000') : -1;
  if (!last || at < 0 || last.text.length - at > 8) return rubyNodes(segments);
  const body = [...segments.slice(0, -1), { text: last.text.slice(0, at) }];
  const sign = document.createElement('span');
  sign.className = 'inscription-signature';
  sign.textContent = last.text.slice(at + 1);
  return [...rubyNodes(body), sign];
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
  // 場所と時の札（画面の隅に短く出す。「今」「過去」は色の違う印で）
  const placard = el('div', 'dialogue-placard');
  placard.hidden = true;
  const placardEra = el('span', 'dialogue-placard-era');
  const placardText = el('span', 'dialogue-placard-text');
  placard.append(placardEra, placardText);
  placard.setAttribute('aria-live', 'polite');
  // 名札（台詞のない人物の名前と肩書き）
  const nameTag = el('div', 'dialogue-nametag');
  nameTag.hidden = true;
  const nameTagName = el('span', 'dialogue-nametag-name');
  const nameTagTitle = el('span', 'dialogue-nametag-title');
  nameTag.append(nameTagName, nameTagTitle);
  // 物の名前の札（物の上に、名前だけを短く出す）
  const objectLabel = el('div', 'dialogue-objlabel');
  objectLabel.hidden = true;
  root.append(caption, inscription, control, placard, nameTag, objectLabel, box);

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
  /** 聞く操作（@聞く）を始めてから、聞き終えるまで: 聞き終えた時に解決する。旋律の表と、今の聞く進み具合 */
  let listenSession: { done: Promise<void>; readonly timeline?: ListenTimeline; finished: boolean; abort: () => void } | undefined;
  let placardShown = '';
  /** 操作の場面の文字の案内を出すか（@文字の案内 なし で出さない。光る印と手の絵だけで示す） */
  let controlText = true;
  let nameTagShown = '';
  let overlayOn = false;
  let placardTimer: number | undefined;
  let nameTagTimer: number | undefined;
  let objectLabelShown = '';
  let objectLabelTimer: number | undefined;
  let objectLabelFrame: number | undefined;
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
      listenSession?.abort();
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
      deps.onNotice?.('inscription', who);
      // 物の文字: 台詞の枠と字幕を隠し、画面の中ほどに大きく出す（顔の枠と話者の強調はしない。道具のボタンは残す）
      caption.hidden = true;
      box.hidden = false;
      box.classList.add('tools-only');
      box.classList.remove('narration');
      inscriptionLabel.textContent = who;
      inscriptionText.replaceChildren(...inscriptionNodes(step.text));
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
    // 初めて出る人物の肩書き（その台詞だけ）か、@肩書き で付けた肩書き。名の下に出す
    shownTitle = step.speakerTitle ?? stage.titles?.[who] ?? '';
    title.textContent = shownTitle;
    plate.classList.toggle('with-title', shownTitle !== '');
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
    if (!controlText || deps.hintSeen(id)) return;
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
      // 文字の案内を出さない時は、手もとのボタンも出さない（光っている物を押す）
      const button = el('button', 'screen-button tap-button', label || TEXT.dialogue.tapHint);
      button.type = 'button';
      button.setAttribute('aria-label', label || TEXT.dialogue.tapHint);
      if (controlText) control.append(button);
      else control.hidden = true;
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
  const listenStep = (melody: string, timbre: string, label: string, onAbort: (abort: () => void) => void) =>
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
      if (controlText) button.append(el('span', 'label', label || TEXT.dialogue.listenDefault), meter);
      else {
        // 文字を出さず、押し続ける手の絵だけで示す（指が押し込んだまま、輪が広がる）
        button.classList.add('hand-only');
        // 手の絵の意味が分からないと言われたので、手の絵の下に短い字を添える（初見の検査）
        button.append(holdHandIcon(), el('span', 'hold-hand-caption', TEXT.dialogue.listenHandCaption), meter);
      }
      control.append(button);
      // 数秒たっても押されない時は、手の絵を少し目立たせる
      let idleTimer: number | undefined;
      const armIdle = () => {
        window.clearTimeout(idleTimer);
        button.classList.remove('nudge');
        idleTimer = window.setTimeout(() => button.classList.add('nudge'), LISTEN_IDLE_MS);
      };
      armIdle();
      let since: number | undefined;
      let timer: number | undefined;
      const elapsed = () => listenMs + (since === undefined ? 0 : performance.now() - since);
      listenNow = elapsed;
      const finish = (completed: boolean) => {
        window.clearTimeout(idleTimer);
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
        window.clearTimeout(idleTimer);
        button.classList.remove('nudge');
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
        armIdle();
        if (timer !== undefined) window.clearInterval(timer);
        timer = undefined;
        deps.sound?.listenPause?.(false);
      };
      button.addEventListener('pointerdown', down);
      for (const ev of ['pointerup', 'pointerleave', 'pointercancel'] as const) button.addEventListener(ev, up);
      // スキップされた時（聞く操作の間も、ほかの指示が進むので、待つ口とは別に止める口を渡す）
      onAbort(() => finish(false));
    });

  const walkStep = (actor: string, path: readonly Coord[]) =>
    new Promise<void>((resolve) => {
      let at = 0;
      const startPos = stage.actors[actor];
      let current: Coord = startPos ? { x: startPos.x, z: startPos.z } : path[0]!;
      hint('walk', TEXT.dialogue.walkHint);
      // 手引きの文がない時は、空の枠を出さない
      control.hidden = control.childElementCount === 0;
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

  const currentCue = () => {
    for (let i = Math.min(index, script.steps.length - 1); i >= 0; i--) {
      const st = script.steps[i]!;
      if (st.kind === 'directive' && st.directive.kind === 'cue') return st.directive.ref;
      if (st.kind === 'line') {
        const c = st.directives.find((d) => d.kind === 'cue');
        if (c && c.kind === 'cue') return c.ref;
      }
    }
    return '';
  };

  const done = (async () => {
    port.sync(stage);
    for (;;) {
      if (skipped) break;
      if (isFinished(script, index)) break;
      const step = script.steps[index]!;
      waiting = 'busy';
      // 聞く操作の後の、台詞・ほかの操作・章の題の前では、聞き終えるのを待つ
      if (listenSession && (step.kind === 'line' || isStop(step))) await joinListen();
      if (skipped) break;
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
          // 聞く操作は待たずに次へ進む（聞いている間に、@節を待つ で進み具合を待ち、@重ねる で短い画を重ねられる）。
          // 台詞・ほかの操作・台本の終わりの前で、聞き終えるのを待つ
          hideLine(true);
          setFast(false);
          const session: NonNullable<typeof listenSession> = { done: Promise.resolve(), finished: false, abort: () => {}, ...(deps.sound?.listenTimeline?.(d.melody) ? { timeline: deps.sound.listenTimeline(d.melody)! } : {}) };
          session.done = listenStep(d.melody, d.timbre, d.label, (abort) => (session.abort = abort)).then(() => {
            session.finished = true;
          });
          listenSession = session;
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
      // 暗転の上の字幕: 暗くなっていなければ、暗転してから出す
      if (step.overDark && !stage.dark) {
        // 暗くなる前に、前の台詞の枠を閉じる（暗い画に台詞の枠だけが残らないように。初見の検査）
        if (!box.hidden && !box.classList.contains('tools-only')) hideLine(true);
        await deps.setDark(true, fast ? 150 : 600);
        stage = { ...stage, dark: true };
      }
      showLine(step);
      waiting = 'line';
      // 早送りは操作の場面で止まる。操作の直前の台詞（場面9の母の「だれ？」など）は、早送りでもタップを待つ
      if (deps.autoAdvance?.() || (fast && !lineBeforeControl(script, index))) await wait(fast ? FAST_LINE_MS : 30);
      // 秒を決めた物の文字（封蝋の印など）は、その間だけ出して次へ（タップでも進む）
      else if (step.autoMs !== undefined) await wait(step.autoMs);
      else await new Promise<void>((resolve) => (release = resolve));
      // 字幕と物の文字は、読み終えたらすぐ消す（暗転の上の字幕が、明けた画の上に残らないように）。台詞の枠は次の台詞まで残す
      if (step.speaker === null || step.inscription) hideLine(true);
      index = advance(script, nextStop(script, index));
    }
    if (!skipped && listenSession) await joinListen();
    if (skipped) {
      listenSession?.abort();
      listenSession = undefined;
      deps.sound?.stopMelody();
      const r = skipToEnd(script, index, stage);
      stage = r.stage;
      index = r.index;
      port.sync(stage);
      await deps.setDark(stage.dark, 0);
    }
    setSpeakerView(null, null);
    window.clearTimeout(placardTimer);
    window.clearTimeout(nameTagTimer);
    hideObjectLabel();
    waiting = 'none';
    root.innerHTML = '';
    root.hidden = true;
    document.body.classList.remove('in-dialogue');
    return { skipped };
  })();

  /** 場所と時の札を画面の隅に出し、数秒で消す（待たない）。暗転の中なら、明けてから見えるように少し長く残す */
  function showPlacard(textOf: string, era: string | undefined) {
    const body = era ? textOf.slice(era.length).replace(/^[\s\u3000]+/, '') : textOf;
    placardEra.textContent = era ?? '';
    placardEra.hidden = !era;
    placardEra.dataset.era = era === '過去' ? 'past' : era === '今' ? 'now' : '';
    placardText.textContent = body;
    placard.dataset.era = placardEra.dataset.era;
    placard.hidden = false;
    placard.classList.remove('leaving');
    placardShown = textOf;
    deps.onNotice?.('placard', textOf);
    window.clearTimeout(placardTimer);
    const ms = (fast ? 1600 : 3600) + (stage.dark ? 1000 : 0);
    placardTimer = window.setTimeout(() => {
      placard.classList.add('leaving');
      placardTimer = window.setTimeout(() => {
        placard.hidden = true;
        placardShown = '';
      }, 400);
    }, ms);
  }

  /** 名札（台詞のない人物の名前と肩書き）を、画面の上の方に短く出す（待たない） */
  function showNameTag(who: string, titleOf: string) {
    nameTagName.textContent = who;
    nameTagTitle.textContent = titleOf;
    paintPlate(nameTag, who);
    nameTag.hidden = false;
    nameTagShown = `${who}〔${titleOf}〕`;
    deps.onNotice?.('nameTag', nameTagShown);
    window.clearTimeout(nameTagTimer);
    nameTagTimer = window.setTimeout(() => {
      nameTag.hidden = true;
      nameTagShown = '';
    }, fast ? 1500 : 3200);
  }

  /** 物の名前の札を、物（か、それを持つ人物）の上に出し、ms の後に消す（待たない）。物が動いても追う */
  function showObjectLabel(target: string, textOf: string, ms: number) {
    hideObjectLabel();
    objectLabel.textContent = textOf;
    objectLabel.hidden = false;
    objectLabelShown = textOf;
    deps.onNotice?.('objectLabel', textOf);
    const follow = () => {
      const p = port.screenOf?.(target);
      const rootBox = root.getBoundingClientRect();
      // 物が画面の外なら、画面の縁に寄せて出す（カメラが物へ向かう途中は、物のある方の縁に見える）
      if (p) {
        objectLabel.classList.remove('free');
        // 札の幅の半分と余白の分だけ、画面の縁から離す（長い札「測り棒（崖の高さを測る道具）」が縁で切れないように）
        const half = Math.max(80, objectLabel.offsetWidth / 2 + 12);
        objectLabel.style.left = `${Math.round(Math.min(Math.max(p.x - rootBox.left, half), rootBox.width - half))}px`;
        objectLabel.style.top = `${Math.round(Math.min(Math.max(p.y - rootBox.top, 90), rootBox.height - 230))}px`;
      } else objectLabel.classList.add('free');
      objectLabelFrame = window.requestAnimationFrame(follow);
    };
    follow();
    objectLabelTimer = window.setTimeout(hideObjectLabel, fast ? Math.min(ms, 1400) : ms);
  }
  function hideObjectLabel() {
    window.clearTimeout(objectLabelTimer);
    if (objectLabelFrame !== undefined) window.cancelAnimationFrame(objectLabelFrame);
    objectLabelFrame = undefined;
    objectLabel.hidden = true;
    objectLabelShown = '';
  }

  /** 聞き終えるのを待つ（聞く操作を始めた後の、台詞・操作・台本の終わりの前） */
  async function joinListen() {
    const session = listenSession;
    if (!session) return;
    waiting = 'listen';
    await session.done;
    if (listenSession === session) listenSession = undefined;
    waiting = 'busy';
  }

  /** 聞く操作の旋律が、終わりから remaining 個目の音（first なら最初の音）まで進むのを待つ（0 なら聞き終えるまで） */
  async function waitListen(remaining: number, first: boolean) {
    const session = listenSession;
    if (!session) return;
    const t = session.timeline;
    if (!t || (!first && remaining <= 0)) return joinListen();
    const total = t.noteStarts.length;
    const want = first ? 1 : total - remaining + 1;
    const prevWaiting = waiting;
    waiting = 'listen';
    while (!skipped && !session.finished && listenPhase(t, listenNow()).notesStarted < want) {
      await new Promise((r) => window.setTimeout(r, 40));
    }
    waiting = prevWaiting;
  }

  /** 指示を見せる（暗転と間は、ここで扱う）。before は指示の前の舞台（同時の指示の中では、それまでの指示を行った舞台） */
  async function runDirective(d: Directive, before: StageState = stage): Promise<void> {
    // 場面が切り替わる前（暗転・場所を移す・遠景・短い画を重ねる）と、人物が消える時・光が立つ時には、前の台詞の枠を閉じる
    // （台詞の枠が、暗転や場所の切り替え、話した人物が消えた後まで残らないように。早送り・読み返し・スキップのボタンは残す）
    if (CLOSES_LINE.has(d.kind) && !box.hidden && !box.classList.contains('tools-only')) hideLine(true);
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
    if (d.kind === 'placard') return showPlacard(d.text, d.era);
    if (d.kind === 'controlText') {
      controlText = d.on;
      return;
    }
    if (d.kind === 'nameTag') return showNameTag(d.actor, d.title);
    if (d.kind === 'objectLabel') return showObjectLabel(d.target, d.text, d.ms);
    if (d.kind === 'shot') {
      // 映す: 動く時間を含めて、ちょうど ms の間だけ映す（早送りなら短く）
      const total = fast ? Math.min(d.ms, 300) : d.ms;
      const move = Math.min(600, Math.floor(total * 0.4));
      const started = performance.now();
      const { kind: _k, ms: _ms, ...target } = d;
      void _k;
      void _ms;
      await port.run({ kind: 'camera', ...target, ...(move > 0 ? { ms: move } : {}) }, before, fast);
      const rest = total - (performance.now() - started);
      if (rest > 0) await wait(rest);
      return;
    }
    if (d.kind === 'overlay') {
      overlayOn = true;
      try {
        if (deps.overlay) await deps.overlay(d.scriptId, d.ms, fast);
        else await wait(fast ? Math.min(d.ms, 300) : d.ms);
      } finally {
        overlayOn = false;
      }
      return;
    }
    if (d.kind === 'melodyCut') {
      // 鳴っている旋律を、その音の手前で切り、別の音を鳴らす（早送りの時は、すぐに切る）
      if (deps.sound?.cutMelody) {
        const p = deps.sound.cutMelody(fast ? 0 : d.remaining);
        await new Promise<void>((resolve) => {
          const prev = release;
          release = () => {
            resolve();
            prev?.();
          };
          void p.then(resolve);
        });
      } else deps.sound?.stopMelody();
      deps.sound?.effect(d.sound);
      return;
    }
    // 聞く操作の間の 節を待つ: プレイヤーが押して進める旋律を待つ（早送りでも待つ）
    if (d.kind === 'melodyWait' && listenSession) {
      await waitListen(d.remaining, d.first === true);
      return;
    }
    // 旋律と効果音（序章に足りない仕組み）。旋律は待たずに次へ進む（待つ時は 節を待つ）
    if (d.kind === 'melody') return deps.sound?.playMelody(d.melody, d.timbre, d.mark);
    if (d.kind === 'melodyStop') return deps.sound?.stopAll ? deps.sound.stopAll() : deps.sound?.stopMelody();
    if (d.kind === 'sound') return deps.sound?.effect(d.sound);
    if (d.kind === 'melodyWait') {
      // 早送りの時は待たない（節はそのまま鳴り続ける）。旋律の頭は、鳴らした時点で始まっている
      if (fast || !deps.sound || d.first) return;
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
    // 待たないカメラ: 動かしはじめたら次へ進む（字幕を読ませながら、カメラをたどらせる）
    if (d.kind === 'camera' && d.flow) {
      void port.run(d, before, fast);
      return;
    }
    await port.run(d, before, fast);
  }

  return {
    done,
    status: () => ({
      active: waiting !== 'none',
      // 聞く操作の間は、ほかの指示（重ねる など）が進んでいても、聞く操作を待っている
      waiting: listenSession && !listenSession.finished && waiting === 'busy' ? 'listen' : waiting,
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
      placard: placardShown,
      nameTag: nameTagShown,
      overlay: overlayOn,
      objectLabel: objectLabelShown,
      listenMs: Math.floor(listenNow()),
      listenTotal: listenAll,
      listening,
      cue: currentCue(),
    }),
    onTap(candidates) {
      walkTap?.(candidates);
    },
    stage: () => stage,
    abort() {
      skipped = true;
      walkTap = undefined;
      listenSession?.abort();
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
