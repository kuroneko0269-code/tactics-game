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
 * - 版 3（フェーズ2-4）: 部隊に所持金（gold）・所持品（items）・次の個体の番号（nextItemSeq）、ユニットに装備の枠（equipment）、
 *   進み具合の記録（records。訓練戦の段階ごとの勝利の回数）を追加。
 *   版 2 のデータは、育てた状態をそのまま残し、各ユニットに「今のジョブの最初の装備」を配って付け、最初の所持金を持たせる。
 */
import type { EquipmentDefinition } from './battleTypes';
import type { DungeonState } from './dungeon';
import type { Roster } from './progression';

/** 今のセーブデータの版 */
export const SAVE_VERSION = 3;

/** 進み具合の記録（ダンジョンのクリアは dungeon にある） */
export interface GameRecords {
  /** 訓練戦の段階ごとの勝利の回数（店の品ぞろえの条件に使う） */
  readonly trainingWins: Readonly<Record<string, number>>;
}

export const EMPTY_RECORDS: GameRecords = { trainingWins: {} };

/** セーブデータ（今の版の形） */
export interface SaveData {
  readonly version: number;
  readonly roster: Roster;
  readonly dungeon: DungeonState;
  readonly records: GameRecords;
}

/**
 * 古い版を直す時に使う定義データ（core は src/data を読まないので、呼ぶ側から渡す）。
 * - starterEquipment: ジョブごとの最初の装備（装備の id）。版 3 で、各ユニットの今のジョブの物を配って付ける
 * - startingGold: 最初の所持金
 * - equipment: 装備の定義（配った物をどの枠に付けるかを引く）
 */
export interface SaveMigrationContext {
  readonly starterEquipment: Readonly<Record<string, readonly string[]>>;
  readonly startingGold: number;
  readonly equipment: readonly Pick<EquipmentDefinition, 'id' | 'slot'>[];
}

/**
 * 古い版を直す関数の一覧。キーは「直す前の版」。値は、その版のデータ（と定義データ）を受け取り、1つ新しい版のデータを返す。
 * 例: 版 4 を作ったら { 3: (old) => ({ ...old, version: 4, 新しい項目: 初期値 }) } を足す。
 */
export type SaveMigrations = Readonly<
  Record<number, (old: Record<string, unknown>, context: SaveMigrationContext) => Record<string, unknown>>
>;

export const SAVE_MIGRATIONS: SaveMigrations = {
  /** 版 1 → 2: ダンジョンの記録を足す（挑戦中なし、クリアなし） */
  1: (old) => ({ ...old, version: 2, dungeon: { run: null, clears: {} } }),
  /** 版 2 → 3: 所持金・所持品・装備の枠・記録を足す。各ユニットに今のジョブの最初の装備を配って付ける */
  2: (old, context) => {
    const roster = (old.roster ?? {}) as { units?: unknown };
    if (!Array.isArray(roster.units)) return { ...old, version: 3 };
    let seq = 1;
    const items: { uid: string; itemId: string }[] = [];
    const units = roster.units.map((raw: unknown) => {
      const u = raw as Record<string, unknown>;
      const equipment: Record<string, string | null> = { weapon: null, armor: null, accessory: null };
      for (const itemId of context.starterEquipment[String(u.jobId)] ?? []) {
        const slot = context.equipment.find((e) => e.id === itemId)?.slot;
        if (!slot || equipment[slot] !== null) continue;
        const uid = `i${seq++}`;
        items.push({ uid, itemId });
        equipment[slot] = uid;
      }
      return { ...u, equipment };
    });
    return {
      ...old,
      version: 3,
      roster: { ...roster, units, gold: context.startingGold, items, nextItemSeq: seq },
      records: { trainingWins: {} },
    };
  },
};

export function createSaveData(roster: Roster, dungeon: DungeonState, records: GameRecords): SaveData {
  return { version: SAVE_VERSION, roster, dungeon, records };
}

/** 読み込みに失敗した理由（画面ではなく、開発者向けの記録に使う） */
export type LoadFailure = 'notObject' | 'noVersion' | 'newerVersion' | 'noMigration' | 'badShape';

/**
 * 読み込んだデータを、今の版の形に直す。直せなければ失敗の理由を返す。
 * migrations と currentVersion は、テストで仕組みを確かめるために差し替えられる。
 */
export function migrateSaveData(
  raw: unknown,
  context: SaveMigrationContext,
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
    data = step(data, context);
  }
  if (!looksLikeRoster(data.roster)) return { ok: false, reason: 'badShape' };
  if (!looksLikeDungeon(data.dungeon)) return { ok: false, reason: 'badShape' };
  if (!looksLikeRecords(data.records)) return { ok: false, reason: 'badShape' };
  return {
    ok: true,
    data: { version: currentVersion, roster: data.roster, dungeon: data.dungeon, records: data.records },
    migratedFrom: from,
  };
}

/** 記録として最低限の形をしているか */
function looksLikeRecords(value: unknown): value is GameRecords {
  if (typeof value !== 'object' || value === null) return false;
  const wins = (value as Record<string, unknown>).trainingWins;
  return (
    typeof wins === 'object' &&
    wins !== null &&
    !Array.isArray(wins) &&
    Object.values(wins).every((n) => Number.isInteger(n) && (n as number) >= 0)
  );
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
  const v = value as { units?: unknown; gold?: unknown; items?: unknown; nextItemSeq?: unknown };
  const units = v.units;
  if (!Array.isArray(units) || units.length === 0) return false;
  if (typeof v.gold !== 'number' || typeof v.nextItemSeq !== 'number' || !Array.isArray(v.items)) return false;
  const itemsOk = v.items.every((i: unknown) => {
    if (typeof i !== 'object' || i === null) return false;
    const r = i as Record<string, unknown>;
    return typeof r.uid === 'string' && typeof r.itemId === 'string';
  });
  if (!itemsOk) return false;
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
      r.slots !== null &&
      typeof r.equipment === 'object' &&
      r.equipment !== null
    );
  });
}
