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

/** 端末の中（localStorage）に保存する。使えない環境（プライベートブラウズの一部など）では保存しない */
export function localStorageBackend(): SaveBackend {
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
        return storage?.getItem(STORAGE_KEY) ?? null;
      } catch {
        return null;
      }
    },
    write: (text) => {
      try {
        storage?.setItem(STORAGE_KEY, text);
      } catch (e) {
        console.warn('セーブできませんでした', e);
      }
    },
    remove: () => {
      try {
        storage?.removeItem(STORAGE_KEY);
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
