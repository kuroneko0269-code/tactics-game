/**
 * セーブデータの形と、古い版のデータを新しい形に直す処理。
 *
 * - セーブデータには版の番号（version）を持たせる。データの形を変えた時は SAVE_VERSION を 1 上げ、
 *   「1つ前の版 → 新しい版」に直す関数を SAVE_MIGRATIONS に足す（ここが直す処理の置き場所）。
 *   読み込む時は、古い版から順に直して、今の版の形にする。
 * - 保存先（端末の中か、将来のサーバーか）は扱わない。保存と読み込みの出入口は src/save/saveStore.ts。
 *   ここはブラウザの機能を使わない計算だけなので、将来サーバーでもそのまま使える。
 * - 戦闘の途中の状態も保存する（フェーズ2-5。以前の「保存しない」方針は取り下げた）。戦闘の状態（BattleState）は
 *   JSON にそのまま変換できるので、乱数の状態も含めてそのまま入れる（閉じて開き直しても、当たり外れを引き直せない）。
 *
 * 版の歴史:
 * - 版 1（フェーズ2-1a）: 部隊（roster）だけ。
 * - 版 2（フェーズ2-2b）: ダンジョンの記録（dungeon。挑戦中のダンジョンと次の戦闘、クリアの回数）を追加。
 *   版 1 のデータは「挑戦中なし、クリアなし」として直す（部隊はそのまま）。
 * - 版 3（フェーズ2-4）: 部隊に所持金（gold）・所持品（items）・次の個体の番号（nextItemSeq）、ユニットに装備の枠（equipment）、
 *   進み具合の記録（records。訓練戦の段階ごとの勝利の回数）を追加。
 *   版 2 のデータは、育てた状態をそのまま残し、各ユニットに「今のジョブの最初の装備」を配って付け、最初の所持金を持たせる。
 * - 版 4（フェーズ2-5）: 途中の戦闘（battle。どこの戦闘か（訓練戦の段階か、ダンジョンの何戦目か）と、戦闘の状態）を追加。
 *   版 3 のデータは「途中の戦闘なし」として直す。
 * - 版 5（フェーズ2-6）: ユニットの id を、人物の変わらない id（例: hero-1 → touma）にした。
 *   版 4 のデータは、部隊と途中の戦闘の中のユニットの id を付け替え、途中の戦闘のユニットに新しい項目
 *   （最後に手番が始まった時の HP、「踏みとどまる」を使ったか）を足す。育てた状態（今のジョブを含む）はそのまま残る。
 * - 版 6（物語の土台）: 物語の進み具合（story。本ごとの章と場面の番号）と、途中の戦闘の出どころ「物語の戦闘」を追加。
 *   マップ上のイベントの「短いメッセージ」を「会話」に置き換えたので、途中の戦闘の中のイベントも直す（文の id がそのまま台本の id）。
 *   版 5 のデータは「物語はまだ始めていない」として直す。
 * - 版 7（戦闘で人は死なない決まり）: 途中の戦闘のユニットに種類（kind。人・影・獣・物）を足した。
 *   序章の場面の並びを変えた（話を聞く部屋を別の場面に分けた）ので、本編の序章の場面の番号を付け替える。
 *   途中の戦闘が物語の戦闘なら捨てる（堰の番兵の決まりが変わったため。その戦闘の始めからやり直す）。
 */
import type { BattleState, EquipmentDefinition } from './battleTypes';
import type { DungeonState } from './dungeon';
import type { Roster } from './progression';
import type { StoryProgress } from './story';

/** 今のセーブデータの版 */
export const SAVE_VERSION = 7;

/** 途中の戦闘が、どこの戦闘か（訓練戦の段階か、ダンジョンの何戦目か） */
export type BattleOrigin =
  | { readonly kind: 'training'; readonly tierId: string }
  | { readonly kind: 'dungeon'; readonly dungeonId: string; readonly battle: number }
  /** 物語の戦闘（本・章・場面の番号。物語の土台） */
  | { readonly kind: 'story'; readonly bookId: string; readonly chapter: number; readonly scene: number };

/**
 * 途中の戦闘（フェーズ2-5）。行動がひとつ確定するたびに保存し直す。決着したら消す。
 * 戦闘中に得た経験値と JP は state のユニットに入っているので、途中で閉じても失われない（再開か撤退で部隊に書き戻す）。
 */
export interface SuspendedBattle {
  readonly origin: BattleOrigin;
  readonly state: BattleState;
  /** 戦闘中の会話を出している途中で閉じた時の、その会話の台本の id（再開した時に、もう一度出す。物語の土台） */
  readonly dialogue?: string;
}

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
  /** 途中の戦闘（なければ null） */
  readonly battle: SuspendedBattle | null;
  /** 物語の進み具合（本の id ごと。始めていない本は持たない） */
  readonly story: Readonly<Record<string, StoryProgress>>;
  /** 出したことのある操作の手引き（初めての時だけ出すため）。省いた時は、まだ1つも出していない */
  readonly seenHints?: readonly string[];
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
  /** 版 4 までのユニットの id から、人物の id への対応（版 5） */
  readonly legacyUnitIds: Readonly<Record<string, string>>;
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
  /** 版 3 → 4: 途中の戦闘を足す（なし） */
  3: (old) => ({ ...old, version: 4, battle: null }),
  /** 版 4 → 5: ユニットの id を人物の id に付け替える。途中の戦闘のユニットに新しい項目を足す */
  4: (old, context) => {
    const rename = (id: unknown) => (typeof id === 'string' ? (context.legacyUnitIds[id] ?? id) : id);
    const roster = (old.roster ?? {}) as { units?: unknown };
    const units = Array.isArray(roster.units)
      ? roster.units.map((raw: unknown) => {
          const u = raw as Record<string, unknown>;
          return typeof u === 'object' && u !== null ? { ...u, id: rename(u.id) } : u;
        })
      : roster.units;
    let battle = old.battle as unknown;
    if (typeof battle === 'object' && battle !== null) {
      // 戦闘の状態の中では、ユニットの id は文字列としてだけ現れる（ユニット・手番・狙い先・勝敗条件など）ので、
      // 古い id の文字列をそのまま付け替える
      let text = JSON.stringify(battle);
      for (const [from, to] of Object.entries(context.legacyUnitIds)) text = text.split(JSON.stringify(from)).join(JSON.stringify(to));
      const b = JSON.parse(text) as { state?: { units?: unknown } };
      if (b.state && Array.isArray(b.state.units)) {
        b.state.units = b.state.units.map((raw: unknown) => {
          const u = raw as Record<string, unknown>;
          if (typeof u !== 'object' || u === null) return u;
          return { turnStartHp: u.hp, endureUsed: false, ...u };
        });
      }
      battle = b;
    }
    return { ...old, version: 5, roster: { ...roster, units }, battle };
  },
  /** 版 5 → 6: 物語の進み具合を足す（まだ始めていない）。途中の戦闘のイベントの「メッセージ」を「会話」に直す */
  5: (old) => {
    let battle = old.battle as unknown;
    if (typeof battle === 'object' && battle !== null) {
      const b = JSON.parse(JSON.stringify(battle)) as { state?: { scenario?: { events?: { effects?: Record<string, unknown>[] }[] } } };
      for (const e of b.state?.scenario?.events ?? []) {
        if (!Array.isArray(e.effects)) continue;
        e.effects = e.effects.map((x) => (x.kind === 'message' ? { kind: 'dialogue', scriptId: x.messageId } : x));
      }
      battle = b;
    }
    return { ...old, version: 6, battle, story: {} };
  },
  /**
   * 版 6 → 7: 途中の戦闘のユニットに種類を足す（対象物は物、ほかは人）。物語の途中の戦闘は捨てる。
   * 本編の序章の場面の番号を、新しい並びに付け替える
   */
  6: (old) => {
    let battle = old.battle as unknown;
    if (typeof battle === 'object' && battle !== null) {
      const b = JSON.parse(JSON.stringify(battle)) as { origin?: { kind?: string }; state?: { units?: unknown } };
      if (b.origin?.kind === 'story') battle = null;
      else {
        if (b.state && Array.isArray(b.state.units)) {
          b.state.units = b.state.units.map((raw: unknown) => {
            const u = raw as Record<string, unknown>;
            if (typeof u !== 'object' || u === null) return u;
            return { ...u, kind: u.object ? 'object' : 'human' };
          });
        }
        battle = b;
      }
    }
    let story = old.story as unknown;
    if (typeof story === 'object' && story !== null) {
      const main = (story as Record<string, unknown>).main as Record<string, unknown> | undefined;
      if (main && typeof main === 'object' && main.chapter === 0 && Number.isInteger(main.scene)) {
        const scene = PROLOGUE_SCENES_V6_TO_V7[main.scene as number];
        story = { ...(story as Record<string, unknown>), main: { ...main, scene: scene ?? 0 } };
      }
    }
    return { ...old, version: 7, battle, story };
  },
};

/**
 * 版 6 の序章の場面の番号 → 版 7 の番号。版 6 は 12 の場面（冒頭・堰の会話・堰の戦闘・塔・家・都・門・丘の会話・丘の戦闘・帰還・道・物置）。
 * 版 7 で、塔を「門の脇・話を聞く部屋・広間」に、帰還を「門の脇・話を聞く部屋」に分けた
 */
const PROLOGUE_SCENES_V6_TO_V7: readonly number[] = [0, 1, 2, 3, 6, 7, 8, 9, 10, 11, 13, 14];

export function createSaveData(
  roster: Roster,
  dungeon: DungeonState,
  records: GameRecords,
  battle: SuspendedBattle | null = null,
  story: Readonly<Record<string, StoryProgress>> = {},
  seenHints: readonly string[] = [],
): SaveData {
  return { version: SAVE_VERSION, roster, dungeon, records, battle, story, ...(seenHints.length > 0 ? { seenHints } : {}) };
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
  // 途中の戦闘は、形が崩れていたら捨てる（部隊などはそのまま使う）
  const battle = looksLikeSuspendedBattle(data.battle) ? data.battle : null;
  // 物語の進み具合は、形の崩れた本だけを捨てる
  const story = looksLikeStory(data.story);
  return {
    ok: true,
    data: {
      version: currentVersion,
      roster: data.roster,
      dungeon: data.dungeon,
      records: data.records,
      battle,
      story,
      ...(Array.isArray(data.seenHints) && data.seenHints.length > 0 ? { seenHints: data.seenHints.filter((h): h is string => typeof h === 'string') } : {}),
    },
    migratedFrom: from,
  };
}

/** 途中の戦闘として最低限の形をしているか（中身が部隊と合うかは、読み込む側で確かめる） */
function looksLikeSuspendedBattle(value: unknown): value is SuspendedBattle {
  if (typeof value !== 'object' || value === null) return false;
  const v = value as Record<string, unknown>;
  const o = v.origin as Record<string, unknown> | null | undefined;
  const originOk =
    typeof o === 'object' &&
    o !== null &&
    ((o.kind === 'training' && typeof o.tierId === 'string') ||
      (o.kind === 'dungeon' && typeof o.dungeonId === 'string' && Number.isInteger(o.battle)) ||
      (o.kind === 'story' && typeof o.bookId === 'string' && Number.isInteger(o.chapter) && Number.isInteger(o.scene)));
  const s = v.state as Record<string, unknown> | null | undefined;
  const stateOk =
    typeof s === 'object' &&
    s !== null &&
    Array.isArray(s.units) &&
    typeof s.map === 'object' &&
    typeof s.rules === 'object' &&
    typeof s.scenario === 'object' &&
    Number.isInteger(s.rngState) &&
    Number.isInteger(s.turnNumber) &&
    s.winner === null &&
    typeof s.turn === 'object' &&
    s.turn !== null;
  return originOk && stateOk;
}

/**
 * 途中の戦闘が、今の部隊とダンジョンの進み具合に合っているか（合わなければ捨てる）。
 * - 味方のユニット（経験値と JP を持つもの）は、すべて部隊にいて、ジョブが同じであること
 * - ダンジョンの戦闘なら、挑戦中のダンジョンの、その戦闘であること
 */
export function suspendedBattleFits(
  battle: SuspendedBattle,
  roster: Roster,
  dungeon: DungeonState,
  story: Readonly<Record<string, StoryProgress>> = {},
): boolean {
  const players = battle.state.units.filter((u) => u.team === 'player' && u.progress);
  // 物語の章のために決めた部隊で戦う戦闘（序章など）は、育てた部隊と関係がない（味方は経験値と JP を得ない）
  const fixedParty = battle.origin.kind === 'story' && players.length === 0 && battle.state.units.some((u) => u.team === 'player');
  if (players.length === 0 && !fixedParty) return false;
  const fits = players.every((u) => roster.units.some((r) => r.id === u.id && r.jobId === u.jobId));
  if (!fits) return false;
  // 物語の戦闘なら、物語の今の場面の戦闘であること
  if (battle.origin.kind === 'story') {
    const p = story[battle.origin.bookId];
    return p !== undefined && !p.finished && p.chapter === battle.origin.chapter && p.scene === battle.origin.scene;
  }
  if (battle.origin.kind === 'dungeon') {
    const run = dungeon.run;
    return run !== null && run.dungeonId === battle.origin.dungeonId && run.battle === battle.origin.battle;
  }
  return true;
}

/** 物語の進み具合（本ごと）のうち、形の正しいものだけを残す */
function looksLikeStory(value: unknown): Record<string, StoryProgress> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return {};
  const out: Record<string, StoryProgress> = {};
  for (const [id, raw] of Object.entries(value as Record<string, unknown>)) {
    const p = raw as Record<string, unknown> | null;
    if (typeof p === 'object' && p !== null && Number.isInteger(p.chapter) && Number.isInteger(p.scene) && typeof p.finished === 'boolean') {
      out[id] = { chapter: p.chapter as number, scene: p.scene as number, finished: p.finished };
    }
  }
  return out;
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
