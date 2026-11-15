/**
 * 会話の台本（物語の土台）の読み込み。人が読み書きしやすいテキストを、場面で順に進める手順の一覧にする。
 * 書き方の手引きは docs/SCRIPT_GUIDE.md。ここは文字列を読むだけの計算で、画面にもブラウザにも依存しない。
 *
 * 1行が1つの手順。
 * - 空の行と、`#` で始まる行（注釈）は読み飛ばす。
 * - `話者「台詞」` は台詞。話者は空白を含まない名前。行末が 」 で終わること（その後ろに指示を続けてよい）。
 * - `@指示 引数…` だけの行は指示（全角の ＠ も使える）。台詞と語りの後ろに ` @指示 …` を続けると、その行を出す前に指示を行う。
 * - それ以外の行は語り（地の文）。`「だれ？」と母が言った。` のように 「 で始まる行も語り。
 * - ルビ（読み仮名）は `{漢字|かんじ}`。台詞と語りのどちらにも書ける。
 * 読み込めない行があれば、何行目がどう悪いかを一覧で返す（1つでもあれば台本として使わない）。
 */
import type { Coord, Direction } from './geometry';

/** ルビつきの文の1つぶん（ruby があれば、text の上に小さく読みを出す） */
export interface RubySegment {
  readonly text: string;
  readonly ruby?: string;
}

/** カメラの寄り（遠い・ふつう・近い） */
export type CameraZoom = 'far' | 'mid' | 'near';

/** 指示。秒は 1000 倍した整数（ミリ秒）で持つ */
export type Directive =
  /** 人物が現れる（立つ位置と向き） */
  | { readonly kind: 'enter'; readonly actor: string; readonly x: number; readonly z: number; readonly facing: Direction }
  /** 人物が去る */
  | { readonly kind: 'exit'; readonly actor: string }
  /** 人物をそのマスへ置き直す（動きなし） */
  | { readonly kind: 'place'; readonly actor: string; readonly x: number; readonly z: number }
  /** 人物がそのマスへ歩く（縦、横の順に、まっすぐ） */
  | { readonly kind: 'walk'; readonly actor: string; readonly x: number; readonly z: number }
  /** 人物の向き（方角か、ほかの人物の方） */
  | { readonly kind: 'face'; readonly actor: string; readonly facing?: Direction; readonly toward?: string }
  /** 仕草（名前で呼び出す短い動き。src/data/story/stageDefs.ts） */
  | { readonly kind: 'gesture'; readonly actor: string; readonly gesture: string; readonly turnAway?: boolean }
  /** カメラを、マスか人物に向ける */
  | { readonly kind: 'camera'; readonly x?: number; readonly z?: number; readonly actor?: string; readonly zoom?: CameraZoom }
  /** 暗転（画面を暗くする）と明転（戻す） */
  | { readonly kind: 'fadeOut'; readonly ms: number }
  | { readonly kind: 'fadeIn'; readonly ms: number }
  /** 間（ま） */
  | { readonly kind: 'wait'; readonly ms: number }
  /** 物を置く・消す・別の種類に変える（椀の数が変わる、灯がともる、など） */
  | { readonly kind: 'propPut'; readonly name: string; readonly prop: string; readonly x: number; readonly z: number }
  | { readonly kind: 'propRemove'; readonly name: string }
  | { readonly kind: 'propChange'; readonly name: string; readonly prop: string }
  /** 操作の場面: 押し続ける（steps 段まで進むと次へ。labelId は手の近くに出す文の id） */
  | { readonly kind: 'hold'; readonly steps: number; readonly label: string }
  /** 操作の場面: 人物を1マスずつ歩かせる（path の順に進める。最後のマスが行き先） */
  | { readonly kind: 'walkControl'; readonly actor: string; readonly path: readonly Coord[] };

/** 操作の場面の指示か（プレイヤーの操作を待つ） */
export const isInteractive = (d: Directive) => d.kind === 'hold' || d.kind === 'walkControl';

/** 台本の手順 */
export type ScriptStep =
  /** 台詞（speaker あり）か語り（speaker が null）。directives は、出す前に行う指示 */
  | {
      readonly kind: 'line';
      readonly line: number;
      readonly speaker: string | null;
      readonly text: readonly RubySegment[];
      readonly directives: readonly Directive[];
    }
  | { readonly kind: 'directive'; readonly line: number; readonly directive: Directive };

export interface Script {
  readonly id: string;
  readonly steps: readonly ScriptStep[];
}

export interface ScriptError {
  /** 何行目か（1 から数える） */
  readonly line: number;
  readonly message: string;
}

/** 台本で使える名前（仕草と物の種類。定義データから渡す） */
export interface ScriptCatalog {
  /** 仕草の名前（台本に書く名前） */
  readonly gestures: readonly string[];
  /** 物の種類の名前（台本に書く名前） */
  readonly props: readonly string[];
  /** 仕草のうち、終えた後も向きが反対に変わったままになるもの（背を向ける） */
  readonly turnAway?: readonly string[];
}

export type ParseResult = { readonly ok: true; readonly script: Script } | { readonly ok: false; readonly errors: readonly ScriptError[] };

const DIRECTIONS_JA: Readonly<Record<string, Direction>> = { 北: 'north', 東: 'east', 南: 'south', 西: 'west' };
const ZOOMS_JA: Readonly<Record<string, CameraZoom>> = { 遠: 'far', 中: 'mid', 近: 'near' };

/** 指示の名前（日本語）と、受け取る引数の説明（書き間違いの知らせに使う） */
export const DIRECTIVE_USAGE: Readonly<Record<string, string>> = {
  登場: '@登場 名前 x,z 向き（向きは 北・東・南・西）',
  退場: '@退場 名前',
  位置: '@位置 名前 x,z',
  歩く: '@歩く 名前 x,z',
  向き: '@向き 名前 向き（北・東・南・西）か、相手の名前',
  仕草: '@仕草 名前 仕草の名前',
  カメラ: '@カメラ x,z [遠・中・近] か @カメラ 名前 [遠・中・近]',
  暗転: '@暗転 [秒]',
  明転: '@明転 [秒]',
  間: '@間 秒',
  置く: '@置く 物の名前 種類 x,z',
  消す: '@消す 物の名前',
  変える: '@変える 物の名前 種類',
  押し続ける: '@押し続ける 段数 [手の近くに出す文]',
  歩かせる: '@歩かせる 名前 x,z x,z …（進める順。最後が行き先）',
};

/** 台本のテキストを読む。id は台本の名前（エラーの知らせと、場面からの参照に使う） */
export function parseScript(id: string, text: string, catalog: ScriptCatalog): ParseResult {
  const steps: ScriptStep[] = [];
  const errors: ScriptError[] = [];
  const lines = text.split(/\r?\n/);
  lines.forEach((raw, i) => {
    const line = i + 1;
    const trimmed = raw.trim();
    if (trimmed === '' || trimmed.startsWith('#') || trimmed.startsWith('＃')) return;
    const fail = (message: string) => errors.push({ line, message });
    // 指示だけの行
    if (isAt(trimmed[0]!)) {
      for (const part of splitDirectives(trimmed)) {
        const d = parseDirective(part, catalog);
        if (typeof d === 'string') fail(d);
        else steps.push({ kind: 'directive', line, directive: d });
      }
      return;
    }
    // 台詞か語り。後ろの指示を切り分ける（「 」の外にある最初の @ から後ろ）
    const { body, rest } = splitTrailing(trimmed);
    const directives: Directive[] = [];
    for (const part of rest) {
      const d = parseDirective(part, catalog);
      if (typeof d === 'string') fail(d);
      else if (isInteractive(d)) fail('操作の場面（押し続ける・歩かせる）は、台詞の後ろではなく1行に分けて書いてください');
      else directives.push(d);
    }
    const speech = /^([^\s「」@＠{}|]+)「(.*)」$/.exec(body);
    const speaker = speech ? speech[1]! : null;
    const content = speech ? speech[2]! : body;
    const ruby = parseRuby(content);
    if (typeof ruby === 'string') return fail(ruby);
    // 話者「… のまま 」 で閉じていない（書き忘れ）
    if (speaker === null && /^[^\s「」]+「[^」]*$/.test(body)) {
      return fail('台詞の 」 がありません（話者「台詞」 の形で、行の終わり（指示の前）を 」 にします）');
    }
    steps.push({ kind: 'line', line, speaker, text: ruby, directives });
  });
  return errors.length > 0 ? { ok: false, errors } : { ok: true, script: { id, steps } };
}

/** 読めなければ例外にする（定義データの台本を読み込む時。エラーには台本の名前と行の番号を入れる） */
export function parseScriptOrThrow(id: string, text: string, catalog: ScriptCatalog): Script {
  const r = parseScript(id, text, catalog);
  if (!r.ok) throw new Error(`台本 ${id}: ${r.errors.map((e) => `${e.line}行目: ${e.message}`).join(' / ')}`);
  return r.script;
}

const isAt = (c: string) => c === '@' || c === '＠';

/** 「@a … @b …」を指示ごとに分ける */
function splitDirectives(text: string): string[] {
  return text
    .split(/[@＠]/)
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}

/** 台詞・語りの本文と、後ろに続く指示を分ける。「 」の中の @ は本文として扱う */
function splitTrailing(text: string): { body: string; rest: string[] } {
  let depth = 0;
  for (let i = 0; i < text.length; i++) {
    const c = text[i]!;
    if (c === '「') depth++;
    else if (c === '」') depth = Math.max(0, depth - 1);
    else if (depth === 0 && isAt(c)) return { body: text.slice(0, i).trim(), rest: splitDirectives(text.slice(i)) };
  }
  return { body: text, rest: [] };
}

/** ルビの書き方 {漢字|かんじ} を読む。閉じていなければエラーの文 */
export function parseRuby(text: string): RubySegment[] | string {
  const out: RubySegment[] = [];
  let plain = '';
  for (let i = 0; i < text.length; i++) {
    const c = text[i]!;
    if (c !== '{') {
      if (c === '}') return 'ルビの } に対応する { がありません';
      plain += c;
      continue;
    }
    const end = text.indexOf('}', i);
    if (end < 0) return 'ルビの { が閉じていません（{漢字|かんじ} の形で書きます）';
    const inner = text.slice(i + 1, end);
    const bar = inner.indexOf('|');
    if (bar <= 0 || bar === inner.length - 1) return `ルビ「${inner}」は {漢字|かんじ} の形で書きます`;
    if (plain) out.push({ text: plain });
    plain = '';
    out.push({ text: inner.slice(0, bar), ruby: inner.slice(bar + 1) });
    i = end;
  }
  if (plain || out.length === 0) out.push({ text: plain });
  return out;
}

/** ルビを除いた文（読み返しの一覧の検索や、テストで使う） */
export const plainText = (segments: readonly RubySegment[]) => segments.map((s) => s.text).join('');

/** 指示を1つ読む。読めなければエラーの文 */
function parseDirective(text: string, catalog: ScriptCatalog): Directive | string {
  const words = text.split(/[\s\u3000]+/).filter((w) => w.length > 0);
  const name = words[0] ?? '';
  const args = words.slice(1);
  const usage = DIRECTIVE_USAGE[name];
  if (!usage) return `指示「${name}」はありません（使える指示: ${Object.keys(DIRECTIVE_USAGE).join('・')}）`;
  const bad = (why: string) => `${why}（書き方: ${usage}）`;
  const need = (n: number) => (args.length < n ? bad(`指示「${name}」の引数が足りません`) : undefined);
  const seconds = (w: string | undefined, fallback: number): number | string => {
    if (w === undefined) return fallback;
    const v = Number(w.replace('秒', ''));
    return Number.isFinite(v) && v >= 0 && v <= 30 ? Math.round(v * 1000) : bad(`秒「${w}」は 0〜30 の数で書きます`);
  };
  switch (name) {
    case '登場': {
      const e = need(3);
      if (e) return e;
      const c = coord(args[1]!);
      const f = DIRECTIONS_JA[args[2]!];
      if (!c) return bad(`位置「${args[1]}」は x,z の形で書きます`);
      if (!f) return bad(`向き「${args[2]}」は 北・東・南・西 のどれかです`);
      return { kind: 'enter', actor: args[0]!, ...c, facing: f };
    }
    case '退場':
      return need(1) ?? { kind: 'exit', actor: args[0]! };
    case '位置':
    case '歩く': {
      const e = need(2);
      if (e) return e;
      const c = coord(args[1]!);
      if (!c) return bad(`位置「${args[1]}」は x,z の形で書きます`);
      return { kind: name === '位置' ? 'place' : 'walk', actor: args[0]!, ...c };
    }
    case '向き': {
      const e = need(2);
      if (e) return e;
      const f = DIRECTIONS_JA[args[1]!];
      return f ? { kind: 'face', actor: args[0]!, facing: f } : { kind: 'face', actor: args[0]!, toward: args[1]! };
    }
    case '仕草': {
      const e = need(2);
      if (e) return e;
      if (!catalog.gestures.includes(args[1]!)) return bad(`仕草「${args[1]}」はありません（使える仕草: ${catalog.gestures.join('・')}）`);
      return { kind: 'gesture', actor: args[0]!, gesture: args[1]!, ...(catalog.turnAway?.includes(args[1]!) ? { turnAway: true } : {}) };
    }
    case 'カメラ': {
      const e = need(1);
      if (e) return e;
      const zoomWord = args[1];
      const zoom = zoomWord === undefined ? undefined : ZOOMS_JA[zoomWord];
      if (zoomWord !== undefined && !zoom) return bad(`寄り「${zoomWord}」は 遠・中・近 のどれかです`);
      const c = coord(args[0]!);
      return c ? { kind: 'camera', ...c, ...(zoom ? { zoom } : {}) } : { kind: 'camera', actor: args[0]!, ...(zoom ? { zoom } : {}) };
    }
    case '暗転':
    case '明転':
    case '間': {
      if (name === '間') {
        const e = need(1);
        if (e) return e;
      }
      const ms = seconds(args[0], 600);
      if (typeof ms === 'string') return ms;
      return { kind: name === '暗転' ? 'fadeOut' : name === '明転' ? 'fadeIn' : 'wait', ms };
    }
    case '置く': {
      const e = need(3);
      if (e) return e;
      if (!catalog.props.includes(args[1]!)) return bad(`物の種類「${args[1]}」はありません（使える種類: ${catalog.props.join('・')}）`);
      const c = coord(args[2]!);
      if (!c) return bad(`位置「${args[2]}」は x,z の形で書きます`);
      return { kind: 'propPut', name: args[0]!, prop: args[1]!, ...c };
    }
    case '消す':
      return need(1) ?? { kind: 'propRemove', name: args[0]! };
    case '変える': {
      const e = need(2);
      if (e) return e;
      if (!catalog.props.includes(args[1]!)) return bad(`物の種類「${args[1]}」はありません（使える種類: ${catalog.props.join('・')}）`);
      return { kind: 'propChange', name: args[0]!, prop: args[1]! };
    }
    case '押し続ける': {
      const e = need(1);
      if (e) return e;
      const steps = Number(args[0]);
      if (!Number.isInteger(steps) || steps < 1 || steps > 100) return bad(`段数「${args[0]}」は 1〜100 の整数で書きます`);
      return { kind: 'hold', steps, label: args.slice(1).join(' ') };
    }
    case '歩かせる': {
      const e = need(2);
      if (e) return e;
      const path: Coord[] = [];
      for (const w of args.slice(1)) {
        const c = coord(w);
        if (!c) return bad(`位置「${w}」は x,z の形で書きます`);
        const prev = path[path.length - 1];
        if (prev && Math.abs(prev.x - c.x) + Math.abs(prev.z - c.z) !== 1) return bad(`「${w}」は1つ前のマスの隣ではありません（1マスずつ順に書きます）`);
        path.push(c);
      }
      return { kind: 'walkControl', actor: args[0]!, path };
    }
  }
  return bad(`指示「${name}」を読めません`);
}

/** x,z（全角の数字と読点も使える）を読む */
function coord(word: string): Coord | undefined {
  const normalized = word.replace(/[０-９]/g, (d) => String.fromCharCode(d.charCodeAt(0) - 0xfee0)).replace(/[，、]/g, ',');
  const m = /^(\d+),(\d+)$/.exec(normalized);
  return m ? { x: Number(m[1]), z: Number(m[2]) } : undefined;
}
