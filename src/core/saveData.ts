/**
 * セーブデータの形と、古い版のデータを新しい形に直す処理。
 *
 * - セーブデータには版の番号（version）を持たせる。データの形を変えた時は SAVE_VERSION を 1 上げ、
 *   「1つ前の版 → 新しい版」に直す関数を SAVE_MIGRATIONS に足す（ここが直す処理の置き場所）。
 *   読み込む時は、古い版から順に直して、今の版の形にする。
 * - 保存先（端末の中か、将来のサーバーか）は扱わない。保存と読み込みの出入口は src/save/saveStore.ts。
 *   ここはブラウザの機能を使わない計算だけなので、将来サーバーでもそのまま使える。
 * - 戦闘の途中の状態は保存しない（部隊の育成の状態と、ダンジョンの進み具合・クリアの記録だけ）。
 *
 * 版の歴史:
 * - 版 1（フェーズ2-1a）: 部隊（roster）だけ。
 * - 版 2（フェーズ2-2b）: ダンジョンの記録（dungeon。挑戦中のダンジョンと次の戦闘、クリアの回数）を追加。
 *   版 1 のデータは「挑戦中なし、クリアなし」として直す（部隊はそのまま）。
 */
import type { DungeonState } from './dungeon';
import type { Roster } from './progression';

/** 今のセーブデータの版 */
export const SAVE_VERSION = 2;

/** セーブデータ（今の版の形） */
export interface SaveData {
  readonly version: number;
  readonly roster: Roster;
  readonly dungeon: DungeonState;
}

/**
 * 古い版を直す関数の一覧。キーは「直す前の版」。値は、その版のデータを受け取り、1つ新しい版のデータを返す。
 * 例: 版 2 を作ったら { 1: (old) => ({ ...old, version: 2, 新しい項目: 初期値 }) } を足す。
 */
export type SaveMigrations = Readonly<Record<number, (old: Record<string, unknown>) => Record<string, unknown>>>;

export const SAVE_MIGRATIONS: SaveMigrations = {
  /** 版 1 → 2: ダンジョンの記録を足す（挑戦中なし、クリアなし） */
  1: (old) => ({ ...old, version: 2, dungeon: { run: null, clears: {} } }),
};

export function createSaveData(roster: Roster, dungeon: DungeonState): SaveData {
  return { version: SAVE_VERSION, roster, dungeon };
}

/** 読み込みに失敗した理由（画面ではなく、開発者向けの記録に使う） */
export type LoadFailure = 'notObject' | 'noVersion' | 'newerVersion' | 'noMigration' | 'badShape';

/**
 * 読み込んだデータを、今の版の形に直す。直せなければ失敗の理由を返す。
 * migrations と currentVersion は、テストで仕組みを確かめるために差し替えられる。
 */
export function migrateSaveData(
  raw: unknown,
  migrations: SaveMigrations = SAVE_MIGRATIONS,
  currentVersion: number = SAVE_VERSION,
): { ok: true; data: SaveData; migratedFrom: number } | { ok: false; reason: LoadFailure } {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) return { ok: false, reason: 'notObject' };
  let data = raw as Record<string, unknown>;
  const from = data.version;
  if (typeof from !== 'number' || !Number.isInteger(from) || from < 1) return { ok: false, reason: 'noVersion' };
  if (from > currentVersion) return { ok: false, reason: 'newerVersion' };
  for (let v = from; v < currentVersion; v++) {
    const step = migrations[v];
    if (!step) return { ok: false, reason: 'noMigration' };
    data = step(data);
  }
  if (!looksLikeRoster(data.roster)) return { ok: false, reason: 'badShape' };
  if (!looksLikeDungeon(data.dungeon)) return { ok: false, reason: 'badShape' };
  return { ok: true, data: { version: currentVersion, roster: data.roster, dungeon: data.dungeon }, migratedFrom: from };
}

/** ダンジョンの記録として最低限の形をしているか */
function looksLikeDungeon(value: unknown): value is DungeonState {
  if (typeof value !== 'object' || value === null) return false;
  const v = value as Record<string, unknown>;
  const run = v.run;
  const runOk =
    run === null ||
    (typeof run === 'object' &&
      typeof (run as Record<string, unknown>).dungeonId === 'string' &&
      Number.isInteger((run as Record<string, unknown>).battle));
  const clears = v.clears;
  const clearsOk =
    typeof clears === 'object' &&
    clears !== null &&
    !Array.isArray(clears) &&
    Object.values(clears).every((n) => Number.isInteger(n) && (n as number) >= 0);
  return runOk && clearsOk;
}

/** 部隊のデータとして最低限の形をしているか（中身がルールどおりかは progression.ts の validateRoster で確かめる） */
function looksLikeRoster(value: unknown): value is Roster {
  if (typeof value !== 'object' || value === null) return false;
  const units = (value as { units?: unknown }).units;
  if (!Array.isArray(units) || units.length === 0) return false;
  return units.every((u: unknown) => {
    if (typeof u !== 'object' || u === null) return false;
    const r = u as Record<string, unknown>;
    return (
      typeof r.id === 'string' &&
      typeof r.jobId === 'string' &&
      typeof r.level === 'number' &&
      typeof r.exp === 'number' &&
      typeof r.growth === 'object' &&
      r.growth !== null &&
      typeof r.jobs === 'object' &&
      r.jobs !== null &&
      typeof r.slots === 'object' &&
      r.slots !== null
    );
  });
}
