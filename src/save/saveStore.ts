/**
 * セーブの出入口。部隊の状態とダンジョンの記録の保存・読み込み・消去は、すべてここを通す。
 *
 * 今は端末の中（ブラウザの localStorage）に保存する。フェーズ6 でサーバーに保存先を切り替える時は、
 * SaveBackend を差し替えるだけで済むようにしている（画面や戦闘の処理は、保存先を知らない）。
 * データの形と、古い版を直す処理は src/core/saveData.ts。
 */
import { createSaveData, migrateSaveData, type GameRecords, type LoadFailure, type SaveMigrationContext } from '../core/saveData';
import { validateRoster, type GameCatalog, type ProgressionRules, type Roster } from '../core/progression';
import type { DungeonState } from '../core/dungeon';

/** 保存先。文字列を1つ読み書きできればよい */
export interface SaveBackend {
  read(): string | null;
  write(text: string): void;
  remove(): void;
}

/** 保存するもの: 部隊の育成の状態（所持金・所持品を含む）と、ダンジョンの進み具合・クリアの記録、訓練戦の記録 */
export interface GameSave {
  readonly roster: Roster;
  readonly dungeon: DungeonState;
  readonly records: GameRecords;
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
      return { roster: result.data.roster, dungeon: result.data.dungeon, records: result.data.records };
    },
    save({ roster, dungeon, records }) {
      backend.write(JSON.stringify(createSaveData(roster, dungeon, records)));
    },
    clear() {
      backend.remove();
    },
  };
}
