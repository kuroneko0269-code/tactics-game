/**
 * 「画面に出るものだけ」の書き出し（物語の作者が、実装が脚本のとおりかを読んで確かめるため）。
 * 台本から、場所と時の札・字幕・台詞（話者と肩書きつき）・物に書かれた文字・名札・章の題・操作の案内を、出る順に取り出す。
 * あわせて、物語の作者が脚本と突き合わせるために、伏線のカットの秒数（映す・秒を決めた物の文字・重ねる画・遠景）と、場面の光（時刻）も出す。
 * 「すべて」の指定（all）では、動き・物・カメラ・画面（暗転）・間・音・操作と、ゲーム脚本の行の印も、台本の指示の順に種類つきで出す
 * （文字以外の演出も確かめるため。第1章以降でも使う）。ここは台本を読むだけの計算で、画面にも定義データにも依存しない。
 */
import { plainText, type Directive, type Script } from './script';

export type ScreenTextKind =
  | '札'
  | '字幕'
  | '台詞'
  | '物の文字'
  | '物の札'
  | '名札'
  | '章の題'
  | '操作の案内'
  | 'カット'
  | '光'
  // 以下は「すべて」の指定の時だけ
  | '脚本'
  | '動き'
  | '物'
  | 'カメラ'
  | '画面'
  | '間'
  | '音'
  | '場所'
  | '操作'
  | '肩書き';

export interface ScreenText {
  readonly kind: ScreenTextKind;
  /** 画面に出る文（台詞は「話者〔肩書き〕「台詞」」の形。字幕の改行は「 / 」）。動きなどは、その説明 */
  readonly text: string;
}

/** 操作の場面の案内の文（台本に案内の文がない時に画面が出す文。画面の文言は呼び出し側から受け取る） */
export interface ControlLabels {
  readonly walk: string;
  readonly tapDefault: string;
  readonly listenDefault: string;
  readonly holdDefault: string;
}

/** 場面の光を出すための情報（会話用のマップの時刻。省くと光は出さない） */
export interface LightInfo {
  /** 台本の始めの会話用マップの id */
  readonly startStage: string;
  /** 会話用のマップの id → そのマップの時刻（なければ undefined） */
  readonly timeOf: (stageId: string) => string | undefined;
  /** 時刻を決めていない時の時刻（昼） */
  readonly defaultTime: string;
}

export interface ExportOptions {
  /** 動き・カメラ・音なども出す */
  readonly all?: boolean;
  /** 会話用のマップの id → 読める名前（省くと id のまま） */
  readonly stageName?: (stageId: string) => string;
}

const ZOOM_JA: Readonly<Record<string, string>> = { far: '遠', mid: '中', near: '近' };
const DIR_JA: Readonly<Record<string, string>> = { north: '北', east: '東', south: '南', west: '西' };
const SLOT_JA: Readonly<Record<string, string>> = { hand: '右手', handL: '左手', waist: '腰', back: '背' };
const SPEED_JA: Readonly<Record<number, string>> = { 50: 'ゆっくり', 170: '速く', 250: '走る' };
const seconds = (ms: number) => `${Math.round(ms / 100) / 10}秒`;

/** 台本の中で、画面に文字として出るもの（all なら台本の指示すべて）を、出る順に並べる */
export function screenTextOf(script: Script, labels: ControlLabels, light?: LightInfo, options: ExportOptions = {}): ScreenText[] {
  const out: ScreenText[] = [];
  const all = options.all === true;
  const nameOf = (id: string) => options.stageName?.(id) ?? id;
  // 場面の光: 今の時刻が変わったら、次に何かが出る前に1行出す
  let stage = light?.startStage;
  let setTime: string | undefined;
  let lastLight: string | undefined;
  /** 操作の場面の文字の案内を出すか（@文字の案内 なし で出さない） */
  let controlText = true;
  const push = (t: ScreenText) => {
    // 脚本の行の印と、場所を移す行では、光を出さない（場所を移した直後は暗転の中で、続く @時刻 で光が決まるため）
    if (light && stage !== undefined && t.kind !== '脚本' && t.kind !== '場所') {
      const now = setTime ?? light.timeOf(stage) ?? light.defaultTime;
      if (now !== lastLight) {
        lastLight = now;
        out.push({ kind: '光', text: now });
      }
    }
    out.push(t);
  };
  /** 「すべて」の時だけ出す行 */
  const extra = (kind: ScreenTextKind, text: string) => {
    if (all) push({ kind, text });
  };
  /** 操作の場面: 文字の案内があれば、その文。なければ、操作の説明（光る印・手の絵） */
  const control = (label: string, quietText: string) => {
    if (controlText) push({ kind: '操作の案内', text: label });
    else push({ kind: '操作', text: `${quietText}（文字の案内なし）` });
  };
  const target = (d: { actor?: string; hands?: true; x?: number; z?: number }) => (d.actor ? `${d.actor}${d.hands ? 'の手もと' : ''}` : `${d.x},${d.z}のマス`);
  const directive = (d: Directive, together = false) => {
    const pre = together ? '（同時に）' : '';
    switch (d.kind) {
      case 'cue':
        if (all) out.push({ kind: '脚本', text: d.ref === '外' ? 'ゲームとして足した演出（脚本の行ではない）' : `脚本 ${d.ref}` });
        return;
      case 'location':
        stage = d.stageId;
        setTime = undefined;
        extra('場所', `${nameOf(d.stageId)}へ移る`);
        return;
      case 'timeOfDay':
        setTime = d.time;
        return;
      case 'controlText':
        controlText = d.on;
        extra('操作', `文字の案内: ${d.on ? 'あり' : 'なし（押す所は光る印、耳に当てた石は手の絵だけ）'}`);
        return;
      case 'shot':
        push({ kind: 'カット', text: `${pre}${target(d)}を映す（${d.zoom ? `${ZOOM_JA[d.zoom]}・` : ''}${seconds(d.ms)}で次へ）` });
        return;
      case 'overlay':
        push({ kind: 'カット', text: `短い画を重ねる（${seconds(d.ms)}。回想の台本 ${d.scriptId}）` });
        return;
      case 'cut':
        push({ kind: 'カット', text: `遠景 ${d.stageId}（${seconds(d.ms)}）` });
        return;
      case 'together':
        d.directives.forEach((x) => directive(x, true));
        return;
      case 'placard':
        push({ kind: '札', text: d.text });
        return;
      case 'nameTag':
        push({ kind: '名札', text: `${d.actor}〔${d.title}〕` });
        return;
      case 'humMark':
        extra('音', `${pre}${d.actor}の頭上に音符の印（${seconds(d.ms)}）`);
        return;
      case 'objectLabel':
        push({ kind: '物の札', text: `${d.text}（${d.target}の上に${seconds(d.ms)}）` });
        return;
      case 'chapterTitle':
        push({ kind: '章の題', text: `${d.title}「${d.subtitle}」` });
        return;
      case 'walkControl':
        control(labels.walk, `${d.actor}を歩かせる（${d.path.map((c) => `${c.x},${c.z}`).join(' → ')}。次のマスに光る印）`);
        return;
      case 'tapControl':
        control(d.label || labels.tapDefault, `${d.target}を押す（${d.target}が光り、上に揺れる矢印）`);
        return;
      case 'listen':
        control(d.label || labels.listenDefault, `石を耳に当てて、押し続けて聞く（押し続ける手の絵。押されないまま数秒たつと、手の絵が目立つ）`);
        return;
      case 'hold':
        control(d.label || labels.holdDefault, '押し続ける');
        return;
      // ---- ここから「すべて」の時だけ ----
      case 'enter':
        extra('動き', `${pre}${d.actor}が登場（${d.x},${d.z}・${DIR_JA[d.facing]}向き）`);
        return;
      case 'exit':
        extra('動き', `${pre}${d.actor}が${d.fall ? '光にさらわれ、白く光りながら足もとの下へ落ちて消える' : '消える'}`);
        return;
      case 'place':
        extra('動き', `${pre}${d.actor}を${d.x},${d.z}に置き直す`);
        return;
      case 'walk':
        extra('動き', `${pre}${d.actor}が${d.x},${d.z}へ歩く${d.speed && SPEED_JA[d.speed] ? `（${SPEED_JA[d.speed]}）` : ''}`);
        return;
      case 'face':
        extra('動き', `${pre}${d.actor}が${d.facing ? `${DIR_JA[d.facing]}` : `${d.toward}の方`}を向く`);
        return;
      case 'gesture':
        extra('動き', `${pre}${d.actor}: ${d.gesture}`);
        return;
      case 'posture':
        extra('動き', `${pre}${d.actor}の姿勢: ${d.posture}`);
        return;
      case 'strike':
        extra('動き', `${pre}${d.actor}が${d.target}に攻撃（${{ hit: '当たる', miss: '外れる', parry: '払われる' }[d.outcome]}）`);
        return;
      case 'pushBack':
        extra('動き', `${pre}${d.actor}が押し返される`);
        return;
      case 'wrap':
        extra('動き', `${pre}門の光が帯のように伸びて、${d.actor}に巻きつく`);
        return;
      case 'light':
        extra('動き', `${pre}光の柱「${d.name}」（${d.color}）を${d.actor ?? `${d.x},${d.z}のマス`}に立てる`);
        return;
      case 'lightOff':
        extra('動き', `${pre}光の柱「${d.name}」を消す`);
        return;
      case 'carry':
        extra('物', `${pre}${d.actor}が${d.item}を${SLOT_JA[d.slot]}に持つ`);
        return;
      case 'release':
        extra('物', `${pre}${d.actor}が${SLOT_JA[d.slot]}の物を離す`);
        return;
      case 'give':
        extra('物', `${pre}${d.actor}が${d.to}に${d.item}を渡す`);
        return;
      case 'propPut':
        extra('物', `${pre}${d.prop}（${d.name}）を${d.x},${d.z}に置く`);
        return;
      case 'propRemove':
        {
          // 「椀*」は「椀をすべて消す」、「*」だけは「物をすべて消す」（「をすべてを消す」と重ならないように）
          const all = d.name.endsWith('*');
          const what = all ? `${d.name.slice(0, -1) || '物'}をすべて` : `${d.name}を`;
          extra('物', `${pre}${d.actor ? `${d.actor}が` : ''}${what}${d.actor ? '片付ける' : '消す'}`);
        }
        return;
      case 'propChange':
        extra('物', `${pre}${d.name}を「${d.prop}」に変える`);
        return;
      case 'propMove':
        extra('物', `${pre}${d.name}を${d.x},${d.z}へ動かす（${seconds(d.ms)}）`);
        return;
      case 'camera':
        extra('カメラ', `${pre}${target(d)}へ${d.zoom ? `（${ZOOM_JA[d.zoom]}）` : ''}${d.ms ? `${seconds(d.ms)}かけて` : ''}${d.flow ? '（動き終わるのを待たずに次へ）' : ''}`);
        return;
      case 'fadeOut':
        extra('画面', `${pre}暗転（${seconds(d.ms)}）`);
        return;
      case 'fadeIn':
        extra('画面', `${pre}明転（${seconds(d.ms)}）`);
        return;
      case 'wait':
        extra('間', `${pre}${seconds(d.ms)}`);
        return;
      case 'melody':
        extra('音', `${pre}節「${d.melody}」（${d.timbre}）`);
        return;
      case 'melodyWait':
        extra('音', `${pre}${d.first ? '節の最初の音まで待つ' : d.remaining > 0 ? `節の、終わりから${d.remaining}つ目の音まで待つ` : '節の終わりまで待つ'}`);
        return;
      case 'melodyStop':
        extra('音', `${pre}節を止める`);
        return;
      case 'melodyCut':
        extra('音', `${pre}節を${d.remaining > 0 ? `、終わりから${d.remaining}つ目の音の手前で` : 'すぐに'}切り、「${d.sound}」`);
        return;
      case 'sound':
        extra('音', `${pre}効果音「${d.sound}」`);
        return;
      case 'voice':
        extra('音', `${pre}${d.actor}の声（${d.voice}。文字にしない）`);
        return;
      case 'title':
        extra('肩書き', `${pre}${d.actor}: ${d.title || '（外す）'}`);
        return;
    }
  };
  // 「すべて」の時: 最初の脚本の行の印より前の指示は、場面の準備（人物の立ち位置・置く物など）
  const first = script.steps[0];
  if (all && first && !(first.kind === 'directive' && first.directive.kind === 'cue')) out.push({ kind: '脚本', text: '場面の準備（脚本の行の前）' });
  for (const step of script.steps) {
    if (step.kind === 'directive') {
      directive(step.directive);
      continue;
    }
    step.directives.forEach((d) => directive(d));
    const text = plainText(step.text).replace(/\n/g, ' / ');
    if (step.speaker === null) push({ kind: '字幕', text: step.overDark ? `${text}（暗転の上）` : text });
    else if (step.inscription) push({ kind: '物の文字', text: `${step.speaker}「${text}」${step.autoMs !== undefined ? `（${seconds(step.autoMs)}で次へ）` : ''}` });
    else push({ kind: '台詞', text: `${step.speaker}${step.speakerTitle ? `〔${step.speakerTitle}〕` : ''}「${text}」${step.portrait === false ? '（顔なし）' : ''}` });
  }
  return out;
}

/** 書き出しの1行（例: 「札」のあとを全角の空白でそろえて「今 暦の塔」）。脚本の行の印は、区切りの行にする */
export const formatScreenText = (t: ScreenText) => (t.kind === '脚本' ? `―― ${t.text} ――` : `${t.kind.padEnd(6, '　')}${t.text}`);
