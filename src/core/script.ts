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
  /** 退場する。fall なら、光にさらわれて白の中へ落ちていく（序章の丘のガレス。@退場 名前 落ちる） */
  | { readonly kind: 'exit'; readonly actor: string; readonly fall?: true }
  /** 人物をそのマスへ置き直す（動きなし） */
  | { readonly kind: 'place'; readonly actor: string; readonly x: number; readonly z: number }
  /** 人物がそのマスへ歩く（縦、横の順に、まっすぐ）。speed は歩く速さの百分率（100 がふつう。省くと 100） */
  | { readonly kind: 'walk'; readonly actor: string; readonly x: number; readonly z: number; readonly speed?: number }
  /** 人物の向き（方角か、ほかの人物・物の方） */
  | { readonly kind: 'face'; readonly actor: string; readonly facing?: Direction; readonly toward?: string }
  /** 仕草（名前で呼び出す短い動き。src/data/story/stageDefs.ts） */
  | { readonly kind: 'gesture'; readonly actor: string; readonly gesture: string; readonly turnAway?: boolean }
  /**
   * カメラを、マスか人物・物に向ける（actor は人物か物の名前）。ms があれば、その時間をかけてゆっくり動かす
   */
  /** カメラを向ける。flow なら、動き終わるのを待たずに次へ進む（字幕を読ませながら、堰から下流の村へカメラをたどらせる。@カメラ … 待たない） */
  | { readonly kind: 'camera'; readonly x?: number; readonly z?: number; readonly actor?: string; readonly hands?: true; readonly zoom?: CameraZoom; readonly ms?: number; readonly flow?: true }
  /** 暗転（画面を暗くする）と明転（戻す） */
  | { readonly kind: 'fadeOut'; readonly ms: number }
  | { readonly kind: 'fadeIn'; readonly ms: number }
  /** 間（ま） */
  | { readonly kind: 'wait'; readonly ms: number }
  /** 物を置く・消す・別の種類に変える（椀の数が変わる、灯がともる、など） */
  | { readonly kind: 'propPut'; readonly name: string; readonly prop: string; readonly x: number; readonly z: number }
  /**
   * 物を消す・片付ける。name の終わりが * なら、その前の文字で始まる名前の物をすべて（`椀*` で椀をすべて、`*` で全部）。
   * actor があれば、その人物が物の方を向いて拾う仕草をしてから消える（片付ける）
   */
  | { readonly kind: 'propRemove'; readonly name: string; readonly actor?: string }
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
  /** 歌っている人の頭上に音符の印を ms の間出す（だれの鼻歌・歌かが分かるように。@音の印 人物 秒）。待たずに次へ */
  | { readonly kind: 'humMark'; readonly actor: string; readonly ms: number }
  /**
   * 鳴っている旋律が、残り remaining 個の音になるまで待つ（0 なら終わるまで。鳴っていなければ待たない）。first なら、旋律の最初の音が鳴りはじめるまで。
   * 耳に当てて聞く操作の間は、プレイヤーが押して進める旋律を待つ（早送りでも待つ）
   */
  | { readonly kind: 'melodyWait'; readonly remaining: number; readonly first?: true }
  | { readonly kind: 'melodyStop' }
  /** 効果音を鳴らす */
  | { readonly kind: 'sound'; readonly sound: string }
  /** 章の題を画面いっぱいに出す（タップか、少し待つと次へ） */
  | { readonly kind: 'chapterTitle'; readonly title: string; readonly subtitle: string }
  /** 人物に持ち物を持たせる（slot は 手・左手・腰・背）・外す */
  | { readonly kind: 'carry'; readonly actor: string; readonly item: string; readonly slot: ItemSlot }
  | { readonly kind: 'release'; readonly actor: string; readonly slot: ItemSlot }
  /** 物を渡す: actor の右手の物を外し、to の slot に付ける（item は渡す物の種類） */
  | { readonly kind: 'give'; readonly actor: string; readonly to: string; readonly item: string; readonly slot: ItemSlot }
  /** 話者の名前の札に添える肩書き（「八の席」など）。空の文字で外す。この台本の終わりまで続く */
  | { readonly kind: 'title'; readonly actor: string; readonly title: string }
  /** 複数の動きを同時に起こす（すべて終わるまで待つ） */
  | { readonly kind: 'together'; readonly directives: readonly Directive[] }
  /** 続く姿勢（座る・膝をついたまま、など）。「立つ」で元に戻す */
  | { readonly kind: 'posture'; readonly actor: string; readonly posture: string }
  /**
   * 戦闘中の台本で、攻撃の動きを見せる（見た目だけ。戦闘の結果は変えない。序章の丘の始めの演出）。
   * outcome は 当たる（hit）・外れる（miss）・払う（parry: 受ける側が武器で払う）。会話の場面では何もしない
   */
  | { readonly kind: 'strike'; readonly actor: string; readonly target: string; readonly outcome: 'hit' | 'miss' | 'parry' }
  /** 戦闘中の台本で、人物を押し返す（見た目だけ。滑るように下がって、戦闘の状態の位置へ戻る）。会話の場面では何もしない */
  | { readonly kind: 'pushBack'; readonly actor: string }
  /**
   * 脚本の行の印（ゲーム脚本の「場面-行」。例 2-5）。舞台は変えない。次の印までの手順が、その行を作る。
   * ref が「外」なら、脚本の行ではなく、ゲームとして足した演出（発注者の指定・章の題）
   */
  | { readonly kind: 'cue'; readonly ref: string }
  /** 言葉にしない声（叫び・呼び込み・笑い）。短い合成音と、人物の頭上の小さな印で表す（文字にはしない） */
  | { readonly kind: 'voice'; readonly actor: string; readonly voice: string }
  /** 離れた場所を映す短いカット（会話用の小さなマップを ms の間だけ見せて、元の場所へ戻る）。舞台は変えない */
  | { readonly kind: 'cut'; readonly stageId: string; readonly ms: number }
  /** 場所を移す（会話用のマップを切り替える）。人物は全員いなくなり、物は新しいマップに置いておく物になる */
  | { readonly kind: 'location'; readonly stageId: string; readonly props: readonly LocationProp[] }
  /** 物を、そのマスへ ms の時間をかけて動かす（遠くの人々が後ずさる・丘を下りる） */
  | { readonly kind: 'propMove'; readonly name: string; readonly x: number; readonly z: number; readonly ms: number }
  /** 操作の場面: 物をタップする（戸を開ける・石を拾う）。label は物の近くに出す短い案内 */
  | { readonly kind: 'tapControl'; readonly target: string; readonly label: string }
  /**
   * 操作の場面: 押し続けて聞く（石を耳に当てる）。押している間だけ鳴り、離すと止まり、押し直すと続きから鳴る。
   * 初めは貝殻のようなかすかな音で、やがて旋律になる。旋律を鳴りきると次へ
   */
  | { readonly kind: 'listen'; readonly melody: string; readonly timbre: string; readonly label: string }
  /**
   * 場所と時の札（改訂の決まり）。場面が変わった時に、画面の隅に短く出して数秒で消える（待たずに次へ進む）。字幕の行数には数えない。
   * era は札の始めの「今」「過去」（時をまたぐ物語なので、一目で分かる色で出す）。text は札の文のまま（era を含む）
   */
  | { readonly kind: 'placard'; readonly text: string; readonly era?: string }
  /** 名札: 台詞のない人物の名前と肩書きを、短く画面に出す（序章の丘のガレス〔アスタルの若き王〕）。待たずに次へ進む */
  | { readonly kind: 'nameTag'; readonly actor: string; readonly title: string }
  /**
   * 物の名前の札: 大事な物を映す時に、その物（か、それを持つ人物）の上に、物の名前だけを短く出す（「蜜菓子の包み」「測り棒」）。
   * 働きや意味は書かない（伏せる事柄に触れないため）。待たずに次へ進み、ms の後に消える
   */
  | { readonly kind: 'objectLabel'; readonly target: string; readonly text: string; readonly ms: number }
  /**
   * 映す: カメラをマスか人物・物に向け、ちょうど ms の間（動く時間を含む）映してから次へ移る（意味ありげなカットを長く止めない）
   */
  | { readonly kind: 'shot'; readonly x?: number; readonly z?: number; readonly actor?: string; readonly hands?: true; readonly zoom?: CameraZoom; readonly ms: number }
  /**
   * 重ねる: 今の場面の上に、別の短い画（回想の台本 scriptId が作る舞台）を ms の間だけ重ねて見せる（序章の場面9: ユナの指）
   */
  | { readonly kind: 'overlay'; readonly scriptId: string; readonly ms: number }
  /**
   * 音を、別の音で途中から切る: 鳴っている旋律を、終わりから remaining 個目の音の手前で切り、効果音 sound を鳴らす
   * （remaining が 0 なら、すぐに切る。序章の場面4: 鼻歌が戸の開く音に切られる）
   */
  | { readonly kind: 'melodyCut'; readonly sound: string; readonly remaining: number }
  /** 場面の時刻の光（朝・昼・夕方・夜）。空の色・光の色と明るさが変わる。場所を移すと、移った先のマップの時刻に戻る */
  | { readonly kind: 'timeOfDay'; readonly time: string }
  /**
   * 操作の場面の文字の案内を出すか（台本の終わりまで続く）。なし にすると、操作のしかたの手引き・タップのボタンの文・聞く操作の文を出さず、
   * 押す所を光る印（揺れる矢印と明滅）と手の絵だけで示す（序章の場面9: ユナのいない家を進む場面の静けさ）
   */
  | { readonly kind: 'controlText'; readonly on: boolean };

/** 場所を移した時に、新しいマップに置いておく物 */
export interface LocationProp {
  readonly name: string;
  readonly prop: string;
  readonly x: number;
  readonly z: number;
}

/** 持ち物を付ける所（右手・左手・腰・背） */
export type ItemSlot = 'hand' | 'handL' | 'waist' | 'back';
export const ITEM_SLOTS_JA: Readonly<Record<string, ItemSlot>> = { 手: 'hand', 右手: 'hand', 左手: 'handL', 腰: 'waist', 背: 'back' };

/** 操作の場面の指示か（プレイヤーの操作を待つ） */
export const isInteractive = (d: Directive) => d.kind === 'hold' || d.kind === 'walkControl' || d.kind === 'tapControl' || d.kind === 'listen';
/** 台詞の後ろには書けない指示か（操作の場面と章の題。1行に分けて書く） */
const isStandalone = (d: Directive) => isInteractive(d) || d.kind === 'chapterTitle' || d.kind === 'cut' || d.kind === 'location' || d.kind === 'overlay';

/** 歩く速さの言葉（百分率） */
export const WALK_SPEEDS_JA: Readonly<Record<string, number>> = { ゆっくり: 50, ふつう: 100, 速く: 170, 走る: 250 };

/** 台本の手順 */
export type ScriptStep =
  /**
   * 台詞（speaker あり）か語り（speaker が null）。directives は、出す前に行う指示。
   * portrait が false なら顔の枠を出さない（@顔なし）。highlight が false なら、マップ上の話者を強調しない（@強調なし）
   */
  | {
      readonly kind: 'line';
      readonly line: number;
      readonly speaker: string | null;
      readonly text: readonly RubySegment[];
      readonly directives: readonly Directive[];
      readonly portrait?: false;
      readonly highlight?: false;
      /** 物に書かれた文字（@文字）。speaker は物の呼び名（測り棒の札など）。物を大きく映した上に、読める大きさで出す */
      readonly inscription?: true;
      /** 初めて出る人物の肩書き（話者〔肩書き〕「台詞」）。この台詞の時だけ、顔の枠の名の下に出す */
      readonly speakerTitle?: string;
      /** 暗転の上に出す字幕（@暗転の上）。暗くなっていなければ暗転してから、画面の中央に出す */
      readonly overDark?: true;
      /** 物の文字を、この時間（ミリ秒）だけ出して次へ進む（@文字 1.5秒。タップでも進む） */
      readonly autoMs?: number;
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
  /** 言葉にしない声の種類の名前（叫び・呼び込み・笑い） */
  readonly voices?: readonly string[];
  /** 場面の時刻の名前（朝・昼・夕方・夜。@時刻 で使える） */
  readonly times?: readonly string[];
  /** 会話用のマップの id → 置いておく物（@場所・@遠景 で使える場所） */
  readonly locations?: Readonly<Record<string, readonly LocationProp[]>>;
}

export type ParseResult = { readonly ok: true; readonly script: Script } | { readonly ok: false; readonly errors: readonly ScriptError[] };

const DIRECTIONS_JA: Readonly<Record<string, Direction>> = { 北: 'north', 東: 'east', 南: 'south', 西: 'west' };
const ZOOMS_JA: Readonly<Record<string, CameraZoom>> = { 遠: 'far', 中: 'mid', 近: 'near' };

/** 指示の名前（日本語）と、受け取る引数の説明（書き間違いの知らせに使う） */
export const DIRECTIVE_USAGE: Readonly<Record<string, string>> = {
  登場: '@登場 名前 x,z 向き（向きは 北・東・南・西）',
  退場: '@退場 名前',
  位置: '@位置 名前 x,z',
  歩く: '@歩く 名前 x,z [ゆっくり・ふつう・速く・走る]',
  向き: '@向き 名前 向き（北・東・南・西）か、相手の人物・物の名前',
  仕草: '@仕草 名前 仕草の名前',
  カメラ: '@カメラ x,z [遠・中・近] [秒] か @カメラ 人物か物の名前 [遠・中・近] [秒]（秒を書くと、その時間をかけてゆっくり動く。「待たない」を添えると、動き終わるのを待たずに次の字幕や台詞へ進む）',
  暗転: '@暗転 [秒]',
  明転: '@明転 [秒]',
  間: '@間 秒',
  置く: '@置く 物の名前 種類 x,z',
  消す: '@消す 物の名前（椀* で椀で始まる物をすべて、* で全部）',
  片付ける: '@片付ける 物の名前 [人物の名前]（人物が拾う仕草をして片付ける。椀* も使える）',
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
  渡す: '@渡す 名前 相手の名前 物の種類 [相手の持つ所: 手・左手・腰・背]',
  肩書き: '@肩書き 名前 肩書き（なし で外す）',
  同時: '@同時 @指示 … @指示 …（同じ行の指示を同時に起こす）',
  顔なし: '台詞の後ろに @顔なし（この台詞では顔の枠を出さない）',
  強調なし: '台詞の後ろに @強調なし（この台詞では、マップ上の話者に印を出さず、カメラも寄せない）',
  姿勢: '@姿勢 名前 姿勢の名前（立つ で元に戻す）',
  攻撃: '@攻撃 名前 相手の名前 [当たる・外れる・払う]（戦闘中の台本だけ。見た目だけ）',
  押し返す: '@押し返す 名前（戦闘中の台本だけ。戦闘の中の位置へ滑るように戻る）',
  脚本: '@脚本 場面-行（ゲーム脚本の行の印。例 @脚本 2-5。ゲームとして足した演出は @脚本 外）',
  文字: '台詞の形で 物の呼び名「書かれた文」 @文字 [秒]（物に書かれた文字を、読める大きさで出す。秒を書くと、その間だけ出して次へ）',
  声: '@声 名前 声の種類（叫び・呼び込み・笑い。言葉にしない声）',
  遠景: '@遠景 会話のマップの id 秒（離れた場所を短く映して戻る）',
  場所: '@場所 会話のマップの id（場所を移す。人物はいなくなる）',
  動かす: '@動かす 物の名前 x,z [秒]（物をそのマスへ動かす）',
  タップ: '@タップ 物の名前 [案内の文]（操作の場面: 物をタップする）',
  聞く: '@聞く 旋律の名前 音色 [案内の文]（操作の場面: 押している間だけ鳴る。待たずに次の行へ進み、@節を待つ で聞く進み具合を待つ）',
  札: '@札 今　暦の塔（場所と時の札。画面の隅に短く出す）',
  名札: '@名札 名前 肩書き（台詞のない人物の名前と肩書きを短く出す）',
  音の印: '@音の印 人物 [秒]（歌っている人の頭上に音符の印を出す。省くと 6 秒。待たない）',
  物の札: '@物の札 物か人物かマス(x,z) 名前 [秒]（物の上に、物の名前だけを短く出す。省くと 2.5 秒。待たずに次へ）',
  映す: '@映す x,z か 人物・物の名前（人物の名前の後に「の手もと」で手の高さ） [遠・中・近] 秒（その秒の間だけ映して次へ）',
  重ねる: '@重ねる 回想の台本の名前 秒（今の場面の上に、別の短い画を重ねる）',
  節を切る: '@節を切る 効果音の名前 [残りの音の数]（鳴っている旋律を、その音の手前で切って効果音を鳴らす）',
  暗転の上: '字幕の後ろに @暗転の上（暗転してから、画面の中央に出す）',
  時刻: '@時刻 朝・昼・夕方・夜（場面の時刻の光。空の色・光の色と明るさ）',
  文字の案内: '@文字の案内 なし か あり（操作の場面の文字の案内を出すか。なし なら光る印と手の絵だけ）',
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
      const parts = splitDirectives(trimmed);
      // @同時 @a … @b …: 同じ行の指示を同時に起こす
      if (parts[0] === '同時') {
        const inner: Directive[] = [];
        for (const part of parts.slice(1)) {
          const d = parseDirective(part, catalog);
          if (typeof d === 'string') fail(d);
          else if (isStandalone(d) || d.kind === 'together') fail('操作の場面・章題・遠景・場所・同時は、@同時 の中に書けません');
          else inner.push(d);
        }
        if (parts.length < 3) fail(`@同時 の後ろに、同時に起こす指示を2つ以上書きます（書き方: ${DIRECTIVE_USAGE['同時']}）`);
        else if (inner.length === parts.length - 1) steps.push({ kind: 'directive', line, directive: { kind: 'together', directives: inner } });
        return;
      }
      for (const part of parts) {
        if (LINE_MODIFIERS.includes(part)) {
          fail(`@${part} は台詞か字幕の後ろに書きます（書き方: ${DIRECTIVE_USAGE[part]}）`);
          continue;
        }
        const d = parseDirective(part, catalog);
        if (typeof d === 'string') fail(d);
        else steps.push({ kind: 'directive', line, directive: d });
      }
      return;
    }
    // 台詞か語り。後ろの指示を切り分ける（「 」の外にある最初の @ から後ろ）
    const { body, rest } = splitTrailing(trimmed);
    const directives: Directive[] = [];
    const modifiers = new Set<string>();
    /** @文字 1.5秒: 物の文字を、その秒だけ出して次へ（意味ありげなカットを長く止めない） */
    let autoMs: number | undefined;
    for (const part of rest) {
      if (LINE_MODIFIERS.includes(part)) {
        modifiers.add(part);
        continue;
      }
      const timed = /^文字[\s\u3000]+([\d.]+)秒?$/.exec(part);
      if (timed) {
        const v = Number(timed[1]);
        if (!(v > 0 && v <= 30)) {
          fail(`@文字 の秒「${timed[1]}」は 0 より大きく 30 までの数で書きます`);
          continue;
        }
        modifiers.add('文字');
        autoMs = Math.round(v * 1000);
        continue;
      }
      const d = parseDirective(part, catalog);
      if (typeof d === 'string') fail(d);
      else if (isStandalone(d)) fail('操作の場面（押し続ける・歩かせる・タップ・聞く）と章題・遠景・場所は、台詞の後ろではなく1行に分けて書いてください');
      else if (d.kind === 'together') fail('@同時 は、台詞の後ろではなく1行に分けて書いてください');
      else directives.push(d);
    }
    const speech = /^([^\s「」@＠{}|〔〕]+)(?:〔([^〔〕]+)〕)?「(.*)」$/.exec(body);
    const speaker = speech ? speech[1]! : null;
    const speakerTitle = speech?.[2];
    const content = speech ? speech[3]! : body;
    const ruby = parseRuby(content);
    if (typeof ruby === 'string') return fail(ruby);
    // 話者「… のまま 」 で閉じていない（書き忘れ）
    if (speaker === null && /^[^\s「」]+「[^」]*$/.test(body)) {
      return fail('台詞の 」 がありません（話者「台詞」 の形で、行の終わり（指示の前）を 」 にします）');
    }
    if (speaker === null && modifiers.has('文字')) return fail(`@文字 は 物の呼び名「書かれた文」 の形の行に書きます（書き方: ${DIRECTIVE_USAGE['文字']}）`);
    if (speaker !== null && modifiers.has('暗転の上')) return fail('@暗転の上 は字幕（語り）の後ろに書きます');
    steps.push({
      kind: 'line',
      line,
      speaker,
      text: ruby,
      directives,
      ...(modifiers.has('顔なし') ? { portrait: false as const } : {}),
      ...(modifiers.has('強調なし') ? { highlight: false as const } : {}),
      ...(modifiers.has('文字') ? { inscription: true as const } : {}),
      ...(speakerTitle ? { speakerTitle } : {}),
      ...(modifiers.has('暗転の上') ? { overDark: true as const } : {}),
      ...(autoMs !== undefined ? { autoMs } : {}),
    });
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

/** 台詞の後ろに書く、その台詞だけの見せ方の指定 */
const LINE_MODIFIERS: readonly string[] = ['顔なし', '強調なし', '文字', '暗転の上'];

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
      // ／ は改行（2行の字幕）
      plain += c === '／' ? '\n' : c;
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
      if (args[1] !== undefined && args[1] !== '落ちる') return bad(`退場のしかた「${args[1]}」は 落ちる だけです`);
      return need(1) ?? { kind: 'exit', actor: args[0]!, ...(args[1] === '落ちる' ? { fall: true as const } : {}) };
    case '位置':
    case '歩く': {
      const e = need(2);
      if (e) return e;
      const c = coord(args[1]!);
      if (!c) return bad(`位置「${args[1]}」は x,z の形で書きます`);
      if (name === '位置') return { kind: 'place', actor: args[0]!, ...c };
      if (args[2] === undefined) return { kind: 'walk', actor: args[0]!, ...c };
      const speed = WALK_SPEEDS_JA[args[2]];
      if (speed === undefined) return bad(`速さ「${args[2]}」は ${Object.keys(WALK_SPEEDS_JA).join('・')} のどれかです`);
      return { kind: 'walk', actor: args[0]!, ...c, ...(speed !== 100 ? { speed } : {}) };
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
      let zoom: CameraZoom | undefined;
      let ms: number | undefined;
      let flow = false;
      for (const w of args.slice(1)) {
        if (w === '待たない') {
          flow = true;
          continue;
        }
        if (ZOOMS_JA[w]) {
          if (zoom) return bad('寄りが2つ書かれています');
          zoom = ZOOMS_JA[w];
          continue;
        }
        if (/^[\d.]+秒?$/.test(w) && ms === undefined) {
          const v = seconds(w, 0);
          if (typeof v === 'string') return v;
          ms = v;
          continue;
        }
        return bad(`「${w}」は、寄り（遠・中・近）か秒（例: 2秒）か「待たない」で書きます`);
      }
      const extra = { ...(zoom ? { zoom } : {}), ...(ms ? { ms } : {}), ...(flow ? { flow: true as const } : {}) };
      const c = coord(args[0]!);
      return c ? { kind: 'camera', ...c, ...extra } : { kind: 'camera', actor: args[0]!, ...extra };
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
    case '片付ける':
      return need(1) ?? { kind: 'propRemove', name: args[0]!, ...(args[1] ? { actor: args[1] } : {}) };
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
    case '音の印': {
      const e = need(1);
      if (e) return e;
      const ms = seconds(args[1], 6000);
      if (typeof ms === 'string') return ms;
      return { kind: 'humMark', actor: args[0]!, ms };
    }
    case '節を待つ': {
      if (args[0] === '頭') return { kind: 'melodyWait', remaining: 0, first: true };
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
    case '渡す': {
      const e = need(3);
      if (e) return e;
      if (!catalog.props.includes(args[2]!)) return bad(`物の種類「${args[2]}」はありません（使える種類: ${catalog.props.join('・')}）`);
      const slot = ITEM_SLOTS_JA[args[3] ?? '手'];
      if (!slot) return bad(`持つ所「${args[3]}」は 手・左手・腰・背 のどれかです`);
      return { kind: 'give', actor: args[0]!, to: args[1]!, item: args[2]!, slot };
    }
    case '肩書き': {
      const e = need(2);
      if (e) return e;
      const title = args.slice(1).join('　');
      return { kind: 'title', actor: args[0]!, title: title === 'なし' ? '' : title };
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
    case '脚本': {
      const e = need(1);
      if (e) return e;
      if (args[0] !== '外' && !/^\d+-\d+$/.test(args[0]!)) return bad(`印「${args[0]}」は 場面-行（例 2-5）か 外 で書きます`);
      return { kind: 'cue', ref: args[0]! };
    }
    case '声': {
      const e = need(2);
      if (e) return e;
      if (!(catalog.voices ?? []).includes(args[1]!)) return bad(`声の種類「${args[1]}」はありません（使える種類: ${(catalog.voices ?? []).join('・')}）`);
      return { kind: 'voice', actor: args[0]!, voice: args[1]! };
    }
    case '遠景':
    case '場所': {
      const e = need(name === '遠景' ? 2 : 1);
      if (e) return e;
      const props = catalog.locations?.[args[0]!];
      if (!props) return bad(`会話のマップ「${args[0]}」はありません（使えるマップ: ${Object.keys(catalog.locations ?? {}).join('・')}）`);
      if (name === '場所') return { kind: 'location', stageId: args[0]!, props };
      const ms = seconds(args[1], 0);
      if (typeof ms === 'string') return ms;
      return { kind: 'cut', stageId: args[0]!, ms };
    }
    case '動かす': {
      const e = need(2);
      if (e) return e;
      const c = coord(args[1]!);
      if (!c) return bad(`位置「${args[1]}」は x,z の形で書きます`);
      const ms = seconds(args[2], 1000);
      if (typeof ms === 'string') return ms;
      return { kind: 'propMove', name: args[0]!, ...c, ms };
    }
    case 'タップ':
      return need(1) ?? { kind: 'tapControl', target: args[0]!, label: args.slice(1).join(' ') };
    case '聞く': {
      const e = need(2);
      if (e) return e;
      if (!(catalog.melodies ?? []).includes(args[0]!)) return bad(`旋律「${args[0]}」はありません（使える旋律: ${(catalog.melodies ?? []).join('・')}）`);
      if (!(catalog.timbres ?? []).includes(args[1]!)) return bad(`音色「${args[1]}」はありません（使える音色: ${(catalog.timbres ?? []).join('・')}）`);
      return { kind: 'listen', melody: args[0]!, timbre: args[1]!, label: args.slice(2).join(' ') };
    }
    case '札': {
      const e = need(1);
      if (e) return e;
      const text = args.join('　');
      return { kind: 'placard', text, ...(args[0] === '今' || args[0] === '過去' ? { era: args[0] } : {}) };
    }
    case '名札': {
      const e = need(2);
      if (e) return e;
      return { kind: 'nameTag', actor: args[0]!, title: args.slice(1).join('　') };
    }
    case '物の札': {
      const e = need(2);
      if (e) return e;
      const rest = args.slice(1);
      let ms = 2500;
      const last = rest[rest.length - 1]!;
      if (rest.length > 1 && /^[\d.]+秒?$/.test(last)) {
        const v = seconds(last, 0);
        if (typeof v === 'string') return v;
        ms = v;
        rest.pop();
      }
      return { kind: 'objectLabel', target: args[0]!, text: rest.join('　'), ms };
    }
    case '映す': {
      const e = need(2);
      if (e) return e;
      let zoom: CameraZoom | undefined;
      let ms: number | undefined;
      for (const w of args.slice(1)) {
        if (ZOOMS_JA[w] && !zoom) {
          zoom = ZOOMS_JA[w];
          continue;
        }
        if (/^[\d.]+秒?$/.test(w) && ms === undefined) {
          const v = seconds(w, 0);
          if (typeof v === 'string') return v;
          ms = v;
          continue;
        }
        return bad(`「${w}」は、寄り（遠・中・近）か秒（例: 1.5秒）で書きます`);
      }
      if (!ms) return bad('映す秒を書きます');
      const c = coord(args[0]!);
      if (c) return { kind: 'shot', ...c, ...(zoom ? { zoom } : {}), ms };
      // 人物の名前の後に「の手もと」と書くと、その人物の手の高さを映す（守り袋を握らせる手もと）
      const hands = args[0]!.endsWith('の手もと');
      return { kind: 'shot', actor: hands ? args[0]!.slice(0, -'の手もと'.length) : args[0]!, ...(hands ? { hands: true as const } : {}), ...(zoom ? { zoom } : {}), ms };
    }
    case '重ねる': {
      const e = need(2);
      if (e) return e;
      const ms = seconds(args[1], 0);
      if (typeof ms === 'string') return ms;
      if (ms <= 0) return bad('重ねる秒は 0 より大きい数で書きます');
      return { kind: 'overlay', scriptId: args[0]!, ms };
    }
    case '節を切る': {
      const e = need(1);
      if (e) return e;
      if (!(catalog.sounds ?? []).includes(args[0]!)) return bad(`効果音「${args[0]}」はありません（使える効果音: ${(catalog.sounds ?? []).join('・')}）`);
      const n = args[1] === undefined ? 0 : Number(args[1]);
      if (!Number.isInteger(n) || n < 0 || n > 50) return bad(`残りの音の数「${args[1]}」は 0〜50 の整数で書きます`);
      return { kind: 'melodyCut', sound: args[0]!, remaining: n };
    }
    case '時刻': {
      const e = need(1);
      if (e) return e;
      if (!(catalog.times ?? []).includes(args[0]!)) return bad(`時刻「${args[0]}」はありません（使える時刻: ${(catalog.times ?? []).join('・')}）`);
      return { kind: 'timeOfDay', time: args[0]! };
    }
    case '文字の案内': {
      const e = need(1);
      if (e) return e;
      if (args[0] !== 'なし' && args[0] !== 'あり') return bad(`「${args[0]}」は なし か あり で書きます`);
      return { kind: 'controlText', on: args[0] === 'あり' };
    }
    case '暗転の上':
      return bad('@暗転の上 は字幕の後ろに書きます');
    case '文字':
      return bad('@文字 は台詞の形の行の後ろに書きます');
    case '同時':
      return bad('@同時 は行の始めに書き、同じ行に同時に起こす指示を続けます');
    case '顔なし':
    case '強調なし':
      return bad(`@${name} は台詞の後ろに書きます`);
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
  const m = /^(-?\d+),(-?\d+)$/.exec(normalized.replace(/－/g, '-'));
  return m ? { x: Number(m[1]), z: Number(m[2]) } : undefined;
}
