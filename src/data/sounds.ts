/**
 * 音の定義（序章に足りない仕組み）。音声のファイルは使わず、ブラウザの機能（Web Audio）で合成する。
 * 合成のしかたは src/ui/sound.ts。ここには、台本で呼ぶ名前と、旋律（単音の列）をデータで書く。
 *
 * 旋律の書き方: notes は「音の高さ 長さ」の列。高さは C4（ド）・D4・E4・F4・G4・A4・B4・C5 … と # のついた半音（F#4 など）、
 * 休みは「-」。長さは拍の数（1 が1拍）。beatSeconds は1拍の秒数。
 */
export interface MelodyDefinition {
  readonly beatSeconds: number;
  readonly notes: readonly string[];
}

/**
 * 物語の旋律（序章の PR B。音は仮）。ハ長調の五音（ド・レ・ミ・ソ・ラ）だけの、ゆっくりした短い旋律。
 * 同じ旋律から、3つの節を作る（設計書の世界の規則 9。呼び方は物語の作者の確認による）。
 * - ユナの鼻歌: 終わりの三つの音まで、すべて
 * - 氏族の月を呼ぶ節（丘の歌）: 終わりの三つの音を欠いた形
 * - 送りの節: 旋律の最初の句だけ（丘の歌より短い、別の形。第5章で使う。今は定義だけで、どこでも鳴らさない）
 */
/** 旋律の最初の句（ミ ソ ラー ソ ミ レー）。レで止まる */
const FIRST_PHRASE = ['E4 1', 'G4 1', 'A4 2', 'G4 1', 'E4 1', 'D4 2'];
/** 二つ目の句（ミ ソ ド↑ ラ ソーー）。ソで宙に浮いたまま止まる */
const SECOND_PHRASE = ['E4 1', 'G4 1', 'C5 1', 'A4 1', 'G4 3'];
/** 終わりの三つの音（ミ レ ドーー）。静かに落ち着く */
const LAST_THREE = ['E4 1', 'D4 1', 'C4 3'];

export const MELODIES: Readonly<Record<string, MelodyDefinition>> = {
  /** ユナの鼻歌（終わりの三つの音まで、すべて）。物置の石も、この節を鳴らす */
  ユナの鼻歌: { beatSeconds: 0.42, notes: [...FIRST_PHRASE, ...SECOND_PHRASE, ...LAST_THREE] },
  /** 氏族の月を呼ぶ節（丘の歌）。ユナの鼻歌と同じ旋律で、終わりの三つの音を欠いた形 */
  月を呼ぶ節: { beatSeconds: 0.42, notes: [...FIRST_PHRASE, ...SECOND_PHRASE] },
  /** 送りの節（名を持たない人々が死者を月へ送る節。第5章で使う）。旋律の最初の句だけ */
  送りの節: { beatSeconds: 0.42, notes: FIRST_PHRASE },
};

/** 音色（台本に書く名前 → 合成のしかたの id） */
export const TIMBRES: Readonly<Record<string, 'hum' | 'stone' | 'choir'>> = {
  /** 鼻歌のような柔らかい音 */
  鼻歌: 'hum',
  /** 石が鳴るような澄んだ音 */
  石: 'stone',
  /** 大勢の歌声（鼻歌の音色を重ねたもの） */
  歌声: 'choir',
};

/**
 * 効果音（台本に書く名前 → 合成のしかたの id）。戦闘と画面の操作では、id で直接鳴らす
 */
export const SOUND_EFFECTS: Readonly<Record<string, SoundEffectId>> = {
  攻撃: 'attack',
  命中: 'hit',
  ミス: 'miss',
  魔法: 'magic',
  決定: 'confirm',
  取り消し: 'cancel',
  門: 'gate',
  折れる: 'break',
  石の音: 'chime',
  水: 'water',
  // ゲーム脚本の序章で足した音
  /** 積み石の合わせ目が割れる音 */
  石の割れる音: 'crack',
  /** 堰が崩れる音 */
  崩れる: 'collapse',
  /** 水の音（弱い・中くらい。合わせ目が割れるたびに少しずつ強まる。強いのは「水」） */
  '水・弱': 'waterSoft',
  '水・中': 'waterMid',
  /** 灯のねじを巻く音 */
  ねじ: 'windUp',
  /** 誓いの剣に当たった時の、鐘のような音 */
  鐘: 'bell',
};

export type SoundEffectId =
  | 'attack'
  | 'hit'
  | 'miss'
  | 'magic'
  | 'confirm'
  | 'cancel'
  | 'select'
  | 'gate'
  | 'break'
  | 'chime'
  | 'water'
  | 'crack'
  | 'collapse'
  | 'waterSoft'
  | 'waterMid'
  | 'windUp'
  | 'bell'
  /** 言葉にしない声（叫び・呼び込み・笑い）。台本の @声 で鳴らす */
  | 'voiceShout'
  | 'voiceCall'
  | 'voiceLaugh';


/** 旋律の各音の始まりの時刻（ミリ秒）と、全体の長さ。見込みの時間と、耳に当てて聞く操作で使う */
export function melodyTimes(name: string): { readonly totalMs: number; readonly noteStarts: readonly number[] } {
  const def = MELODIES[name];
  if (!def) return { totalMs: 0, noteStarts: [] };
  const starts: number[] = [];
  let t = 0;
  for (const n of def.notes) {
    starts.push(Math.round(t * 1000));
    t += Number(n.trim().split(/\s+/)[1] ?? '1') * def.beatSeconds;
  }
  return { totalMs: Math.round(t * 1000), noteStarts: starts };
}

/**
 * 耳に当てて聞く操作（序章の場面9の石）。始めの shellMs の間は貝殻のようなかすかな音だけで、その後に旋律が始まる。
 * 旋律は swellMs かけて、小さな音から大きくなる（計算は src/core/listen.ts）
 */
export const LISTEN = { shellMs: 3000, swellMs: 3500 } as const;
