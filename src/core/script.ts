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
  | { readonly kind: 'walkControl'; readonly actor: string; readonly path: readonly Coord[] }
  /** 光を立てる（帰りの門の光など）。マスか人物に立てる。name は台本の中の呼び名（消す時に使う）。color は色の名前 */
  | { readonly kind: 'light'; readonly name: string; readonly x?: number; readonly z?: number; readonly actor?: string; readonly color: string }
  | { readonly kind: 'lightOff'; readonly name: string }
  /** 旋律を鳴らす（待たずに次へ進む）。melody は旋律の名前、timbre は音色の名前。mark は鳴っている間の印に添える文（省くと音色の名前） */
  | { readonly kind: 'melody'; readonly melody: string; readonly timbre: string; readonly mark?: string }
  /** 鳴っている旋律が、残り remaining 個の音になるまで待つ（0 なら終わるまで。鳴っていなければ待たない） */
  | { readonly kind: 'melodyWait'; readonly remaining: number }
  | { readonly kind: 'melodyStop' }
  /** 効果音を鳴らす */
  | { readonly kind: 'sound'; readonly sound: string }
  /** 章の題を画面いっぱいに出す（タップか、少し待つと次へ） */
  | { readonly kind: 'chapterTitle'; readonly title: string; readonly subtitle: string }
  /** 人物に持ち物を持たせる（slot は 手・左手・腰・背）・外す */
  | { readonly kind: 'carry'; readonly actor: string; readonly item: string; readonly slot: ItemSlot }
  | { readonly kind: 'release'; readonly actor: string; readonly slot: ItemSlot }
  /** 続く姿勢（座る・膝をついたまま、など）。「立つ」で元に戻す */
  | { readonly kind: 'posture'; readonly actor: string; readonly posture: string }
  /**
   * 戦闘中の台本で、攻撃の動きを見せる（見た目だけ。戦闘の結果は変えない。序章の丘の始めの演出）。
   * outcome は 当たる（hit）・外れる（miss）・払う（parry: 受ける側が武器で払う）。会話の場面では何もしない
   */
  | { readonly kind: 'strike'; readonly actor: string; readonly target: string; readonly outcome: 'hit' | 'miss' | 'parry' }
  /** 戦闘中の台本で、人物を押し返す（見た目だけ。滑るように下がって、戦闘の状態の位置へ戻る）。会話の場面では何もしない */
  | { readonly kind: 'pushBack'; readonly actor: string };

/** 持ち物を付ける所（右手・左手・腰・背） */
export type ItemSlot = 'hand' | 'handL' | 'waist' | 'back';
export const ITEM_SLOTS_JA: Readonly<Record<string, ItemSlot>> = { 手: 'hand', 右手: 'hand', 左手: 'handL', 腰: 'waist', 背: 'back' };

/** 操作の場面の指示か（プレイヤーの操作を待つ） */
export const isInteractive = (d: Directive) => d.kind === 'hold' || d.kind === 'walkControl';
/** 台詞の後ろには書けない指示か（操作の場面と章の題。1行に分けて書く） */
const isStandalone = (d: Directive) => isInteractive(d) || d.kind === 'chapterTitle';

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
  /** 旋律の名前・音色の名前・効果音の名前・光の色の名前（序章に足りない仕組み。省くと、その指示は使えない） */
  readonly melodies?: readonly string[];
  readonly timbres?: readonly string[];
  readonly sounds?: readonly string[];
  readonly lightColors?: readonly string[];
  /** 続く姿勢の名前（「立つ」は元の姿勢） */
  readonly postures?: readonly string[];
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
  光: '@光 呼び名 x,z [色] か @光 呼び名 人物の名前 [色]',
  光を消す: '@光を消す 呼び名',
  節: '@節 旋律の名前 音色 [印に添える文]',
  節を待つ: '@節を待つ [残りの音の数]',
  節を止める: '@節を止める',
  音: '@音 効果音の名前',
  章題: '@章題 題 副題',
  持つ: '@持つ 名前 物の種類 [手・左手・腰・背]',
  離す: '@離す 名前 [手・左手・腰・背]',
  姿勢: '@姿勢 名前 姿勢の名前（立つ で元に戻す）',
  攻撃: '@攻撃 名前 相手の名前 [当たる・外れる・払う]（戦闘中の台本だけ。見た目だけ）',
  押し返す: '@押し返す 名前（戦闘中の台本だけ。戦闘の中の位置へ滑るように戻る）',
};

const STRIKE_OUTCOMES: Readonly<Record<string, 'hit' | 'miss' | 'parry'>> = { 当たる: 'hit', 外れる: 'miss', 払う: 'parry' };

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
      else if (isStandalone(d)) fail('操作の場面（押し続ける・歩かせる）と章題は、台詞の後ろではなく1行に分けて書いてください');
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
    case '光': {
      const e = need(2);
      if (e) return e;
      const color = args[2] ?? '白';
      if (catalog.lightColors && !catalog.lightColors.includes(color)) return bad(`光の色「${color}」はありません（使える色: ${catalog.lightColors.join('・')}）`);
      const c = coord(args[1]!);
      return c ? { kind: 'light', name: args[0]!, ...c, color } : { kind: 'light', name: args[0]!, actor: args[1]!, color };
    }
    case '光を消す':
      return need(1) ?? { kind: 'lightOff', name: args[0]! };
    case '節': {
      const e = need(2);
      if (e) return e;
      if (!(catalog.melodies ?? []).includes(args[0]!)) return bad(`旋律「${args[0]}」はありません（使える旋律: ${(catalog.melodies ?? []).join('・')}）`);
      if (!(catalog.timbres ?? []).includes(args[1]!)) return bad(`音色「${args[1]}」はありません（使える音色: ${(catalog.timbres ?? []).join('・')}）`);
      const mark = args.slice(2).join(' ');
      return { kind: 'melody', melody: args[0]!, timbre: args[1]!, ...(mark ? { mark } : {}) };
    }
    case '節を待つ': {
      const n = args[0] === undefined ? 0 : Number(args[0]);
      if (!Number.isInteger(n) || n < 0 || n > 50) return bad(`残りの音の数「${args[0]}」は 0〜50 の整数で書きます`);
      return { kind: 'melodyWait', remaining: n };
    }
    case '節を止める':
      return { kind: 'melodyStop' };
    case '音': {
      const e = need(1);
      if (e) return e;
      if (!(catalog.sounds ?? []).includes(args[0]!)) return bad(`効果音「${args[0]}」はありません（使える効果音: ${(catalog.sounds ?? []).join('・')}）`);
      return { kind: 'sound', sound: args[0]! };
    }
    case '章題': {
      const e = need(2);
      if (e) return e;
      return { kind: 'chapterTitle', title: args[0]!, subtitle: args.slice(1).join(' ') };
    }
    case '持つ': {
      const e = need(2);
      if (e) return e;
      if (!catalog.props.includes(args[1]!)) return bad(`物の種類「${args[1]}」はありません（使える種類: ${catalog.props.join('・')}）`);
      const slot = ITEM_SLOTS_JA[args[2] ?? '手'];
      if (!slot) return bad(`持つ所「${args[2]}」は 手・左手・腰・背 のどれかです`);
      return { kind: 'carry', actor: args[0]!, item: args[1]!, slot };
    }
    case '離す': {
      const e = need(1);
      if (e) return e;
      const slot = ITEM_SLOTS_JA[args[1] ?? '手'];
      if (!slot) return bad(`持つ所「${args[1]}」は 手・左手・腰・背 のどれかです`);
      return { kind: 'release', actor: args[0]!, slot };
    }
    case '姿勢': {
      const e = need(2);
      if (e) return e;
      if (args[1] !== '立つ' && !(catalog.postures ?? []).includes(args[1]!)) {
        return bad(`姿勢「${args[1]}」はありません（使える姿勢: ${['立つ', ...(catalog.postures ?? [])].join('・')}）`);
      }
      return { kind: 'posture', actor: args[0]!, posture: args[1]! };
    }
    case '攻撃': {
      const e = need(2);
      if (e) return e;
      const outcome = STRIKE_OUTCOMES[args[2] ?? '当たる'];
      if (!outcome) return bad(`結果「${args[2]}」は 当たる・外れる・払う のどれかです`);
      return { kind: 'strike', actor: args[0]!, target: args[1]!, outcome };
    }
    case '押し返す':
      return need(1) ?? { kind: 'pushBack', actor: args[0]! };
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
