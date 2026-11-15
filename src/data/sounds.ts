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

export const MELODIES: Readonly<Record<string, MelodyDefinition>> = {
  /** 試しの場面の節（仕組みを確かめるための短い節） */
  試しの節: { beatSeconds: 0.3, notes: ['C4 1', 'E4 1', 'G4 2', 'E4 1', 'C4 2'] },
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
};

export type SoundEffectId = 'attack' | 'hit' | 'miss' | 'magic' | 'confirm' | 'cancel' | 'select' | 'gate' | 'break' | 'chime' | 'water';

