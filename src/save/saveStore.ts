/**
 * セーブの出入口。部隊の状態とダンジョンの記録の保存・読み込み・消去は、すべてここを通す。
 *
 * 今は端末の中（ブラウザの localStorage）に保存する。フェーズ6 でサーバーに保存先を切り替える時は、
 * SaveBackend を差し替えるだけで済むようにしている（画面や戦闘の処理は、保存先を知らない）。
 * データの形と、古い版を直す処理は src/core/saveData.ts。
 */
import {
  createSaveData,
  migrateSaveData,
  suspendedBattleFits,
  type GameRecords,
  type LoadFailure,
  type SaveMigrationContext,
  type SuspendedBattle,
} from '../core/saveData';
import { validateRoster, type GameCatalog, type ProgressionRules, type Roster } from '../core/progression';
import type { DungeonState } from '../core/dungeon';
import type { StoryProgress } from '../core/story';

/** 保存先。文字列を1つ読み書きできればよい */
export interface SaveBackend {
  read(): string | null;
  write(text: string): void;
  remove(): void;
}

/**
 * 保存するもの: 部隊の育成の状態（所持金・所持品を含む）と、ダンジョンの進み具合・クリアの記録、訓練戦の記録、
 * 途中の戦闘（フェーズ2-5。行動がひとつ確定するたびに保存する）
 */
export interface GameSave {
  readonly roster: Roster;
  readonly dungeon: DungeonState;
  readonly records: GameRecords;
  readonly battle: SuspendedBattle | null;
  /** 物語の進み具合（本の id ごと。物語の土台）。省くと「まだ始めていない」 */
  readonly story?: Readonly<Record<string, StoryProgress>>;
  /** 出したことのある操作の手引き */
  readonly seenHints?: readonly string[];
}

export interface SaveStore {
  /** 保存してある部隊とダンジョンの記録。なければ（または読めなければ）undefined */
  load(): GameSave | undefined;
  save(save: GameSave): void;
  /** 保存してあるデータを消す（「はじめから」） */
  clear(): void;
}

const STORAGE_KEY = 'tactics-game.save';
const SETTINGS_KEY = 'tactics-game.settings';

/**
 * 端末の中（localStorage）に保存する。使えない環境（プライベートブラウズの一部など）では保存しない。
 * key を省くとセーブデータの置き場所。設定（音量など）は別の置き場所（settingsBackend）に置く
 */
export function localStorageBackend(key: string = STORAGE_KEY): SaveBackend {
  const storage = (() => {
    try {
      return window.localStorage;
    } catch {
      return undefined;
    }
  })();
  return {
    read: () => {
      try {
        return storage?.getItem(key) ?? null;
      } catch {
        return null;
      }
    },
    write: (text) => {
      try {
        storage?.setItem(key, text);
      } catch (e) {
        console.warn('セーブできませんでした', e);
      }
    },
    remove: () => {
      try {
        storage?.removeItem(key);
      } catch {
        // 消せなくても続ける
      }
    },
  };
}

export function createSaveStore(
  backend: SaveBackend,
  catalog: GameCatalog,
  rules: ProgressionRules,
  migration: SaveMigrationContext,
  onLoadFailure: (reason: LoadFailure | 'invalidJson' | 'invalidRoster') => void = () => {},
): SaveStore {
  return {
    load() {
      const text = backend.read();
      if (text === null) return undefined;
      let raw: unknown;
      try {
        raw = JSON.parse(text);
      } catch {
        onLoadFailure('invalidJson');
        return undefined;
      }
      const result = migrateSaveData(raw, migration);
      if (!result.ok) {
        onLoadFailure(result.reason);
        return undefined;
      }
      if (validateRoster(result.data.roster, catalog, rules).length > 0) {
        onLoadFailure('invalidRoster');
        return undefined;
      }
      const { roster, dungeon, records, story } = result.data;
      // 途中の戦闘が部隊・ダンジョン・物語の進み具合と合わなければ、その戦闘だけ捨てる
      const battle = result.data.battle && suspendedBattleFits(result.data.battle, roster, dungeon, story) ? result.data.battle : null;
      return { roster, dungeon, records, battle, story, ...(result.data.seenHints ? { seenHints: result.data.seenHints } : {}) };
    },
    save({ roster, dungeon, records, battle, story, seenHints }) {
      backend.write(JSON.stringify(createSaveData(roster, dungeon, records, battle, story ?? {}, seenHints ?? [])));
    },
    clear() {
      backend.remove();
    },
  };
}

/**
 * 端末ごとの設定（序章に足りない仕組み）: 音量・消音・手ほどき。セーブデータとは別に置き、「はじめから」でも消さない。
 * - volume: 0〜100、muted: 消音
 * - skipSeenTutorials: 一度見た手ほどきは、次から出さない（はじめから遊び直しても）
 * - seenTutorials: 見た手ほどきの戦場の id（物語の「はじめから」で、物語の戦場の分を消す）
 * - checkTools: 確認用の機能（物語の場面を選ぶ・物語の戦闘を勝ったことにする）を使うか。初めは切
 */
export interface GameSettings {
  readonly volume: number;
  readonly muted: boolean;
  readonly skipSeenTutorials: boolean;
  readonly seenTutorials: readonly string[];
  readonly checkTools: boolean;
  /** 物語の画面の書体（見た目の見本の2回目。発注者が1つに決めた後で、残りを外す） */
  readonly storyFont: StoryFont;
  /** 物語の画面の文字の大きさ（中が標準。大は見本の1回目までの大きさ） */
  readonly textSize: TextSize;
  /** 人形の描き方（なめらか・ドット風。確認用の機能が入の時だけ、設定の欄に出す） */
  readonly puppetStyle: PuppetStyle;
}

export const STORY_FONTS = ['zenOldMincho', 'shipporiAntique', 'shipporiMincho'] as const;
export type StoryFont = (typeof STORY_FONTS)[number];
export const TEXT_SIZES = ['small', 'medium', 'large'] as const;
export type TextSize = (typeof TEXT_SIZES)[number];
export const PUPPET_STYLES = ['smooth', 'pixel'] as const;
export type PuppetStyle = (typeof PUPPET_STYLES)[number];

export const DEFAULT_SETTINGS: GameSettings = {
  volume: 70,
  muted: false,
  skipSeenTutorials: true,
  seenTutorials: [],
  checkTools: false,
  storyFont: 'zenOldMincho',
  textSize: 'medium',
  puppetStyle: 'smooth',
};

/** 決まった選び肢のどれかなら、その値。違えば初期値 */
const oneOf = <T extends string>(list: readonly T[], value: unknown, fallback: T): T => (list.includes(value as T) ? (value as T) : fallback);

export interface SettingsStore {
  load(): GameSettings;
  save(settings: GameSettings): void;
}

/** 設定の置き場所（端末の中） */
export const settingsBackend = (): SaveBackend => localStorageBackend(SETTINGS_KEY);

/** 読み込んだ設定を、正しい形にそろえる（読めない値は初期値に） */
export function normalizeSettings(raw: unknown): GameSettings {
  if (typeof raw !== 'object' || raw === null) return DEFAULT_SETTINGS;
  const r = raw as Record<string, unknown>;
  const volume = typeof r.volume === 'number' && Number.isFinite(r.volume) ? Math.max(0, Math.min(100, Math.round(r.volume))) : DEFAULT_SETTINGS.volume;
  return {
    volume,
    muted: typeof r.muted === 'boolean' ? r.muted : DEFAULT_SETTINGS.muted,
    skipSeenTutorials: typeof r.skipSeenTutorials === 'boolean' ? r.skipSeenTutorials : DEFAULT_SETTINGS.skipSeenTutorials,
    seenTutorials: Array.isArray(r.seenTutorials) ? r.seenTutorials.filter((x): x is string => typeof x === 'string') : [],
    checkTools: r.checkTools === true,
    storyFont: oneOf(STORY_FONTS, r.storyFont, DEFAULT_SETTINGS.storyFont),
    textSize: oneOf(TEXT_SIZES, r.textSize, DEFAULT_SETTINGS.textSize),
    puppetStyle: oneOf(PUPPET_STYLES, r.puppetStyle, DEFAULT_SETTINGS.puppetStyle),
  };
}

export function createSettingsStore(backend: SaveBackend): SettingsStore {
  return {
    load() {
      const text = backend.read();
      if (text === null) return DEFAULT_SETTINGS;
      try {
        return normalizeSettings(JSON.parse(text));
      } catch {
        return DEFAULT_SETTINGS;
      }
    },
    save(settings) {
      backend.write(JSON.stringify(normalizeSettings(settings)));
    },
  };
}
