/**
 * 連戦のダンジョンの進み具合（フェーズ2-2b）。
 *
 * - ダンジョンは、決まった順番の戦闘（BattleSite）の並び。第1戦から順に戦い、最後の戦闘に勝つとクリア。
 * - 戦闘の間で、HP と MP は全回復し、倒れたユニットも復帰する（戦闘は毎回、部隊の状態から組み立て直すため、何もしなくてもそうなる）。
 * - 勝てば次の戦闘へ進む。負けたら、同じ戦闘をやり直すか、撤退して拠点へ戻るかを選ぶ（どちらでも、得た経験値と JP は持ち帰れる）。
 * - 進み具合（次に戦う戦闘）は、戦闘の間で保存する。戦闘の途中の状態は保存しない（ページを閉じたら、その戦闘の最初から）。
 * - クリアすると、全員の今のジョブに報酬の JP を配り（初めてのクリアと2回目以降で量が違う）、クリアの回数を記録する。
 *   クリア後も何度でも挑める。
 *
 * ここの状態（DungeonState）は、セーブデータにそのまま入る JSON の単純なデータ。
 */
import { gainJp, replaceUnit, type Roster } from './progression';
import type { BattleSite } from './sortie';

/** ダンジョンの定義（src/data に置く） */
export interface DungeonDefinition {
  readonly id: string;
  /** 第1戦から順に並べた戦闘。どれも敵の段階は1つ（id は main） */
  readonly battles: readonly BattleSite[];
  /** 初めてクリアした時に、全員の今のジョブに配る JP */
  readonly clearRewardJp: number;
  /** 2回目以降のクリアで配る JP */
  readonly repeatClearRewardJp: number;
  /** 初めてクリアした時に必ず手に入る装備の id（最後の戦闘のボスから。店では買えない物。フェーズ2-4） */
  readonly firstClearItemId?: string;
}

/** 挑戦中のダンジョン。battle は次に戦う戦闘の番号（0 が第1戦） */
export interface DungeonRun {
  readonly dungeonId: string;
  readonly battle: number;
}

/** ダンジョンの記録（セーブデータに入る） */
export interface DungeonState {
  /** 挑戦中のダンジョン（なければ null） */
  readonly run: DungeonRun | null;
  /** ダンジョンごとのクリアの回数（一度もクリアしていなければ項目がない） */
  readonly clears: Readonly<Record<string, number>>;
}

export const EMPTY_DUNGEON_STATE: DungeonState = { run: null, clears: {} };

/** 1戦が終わった後の進み方 */
export type RunOutcome =
  /** 勝って、次の戦闘（battle 番）へ進む */
  | { readonly kind: 'next'; readonly battle: number }
  /** 負けた。同じ戦闘をやり直すか、撤退するかを選ぶ（進み具合はそのまま） */
  | { readonly kind: 'defeat'; readonly battle: number }
  /** 最後の戦闘に勝って、クリアした。firstClear は初めてのクリアか */
  | { readonly kind: 'cleared'; readonly firstClear: boolean };

/** ダンジョンに第1戦から挑む（挑戦中のものがあれば、最初からやり直す） */
export function startRun(state: DungeonState, dungeonId: string): DungeonState {
  return { ...state, run: { dungeonId, battle: 0 } };
}

/** 撤退する（挑戦をやめる。クリアの記録はそのまま） */
export function retreat(state: DungeonState): DungeonState {
  return { ...state, run: null };
}

/** クリアした回数 */
export function clearCount(state: DungeonState, dungeonId: string): number {
  return state.clears[dungeonId] ?? 0;
}

/**
 * 挑戦中の戦闘が終わった時の進み具合。勝てば次の戦闘へ（最後の戦闘ならクリアして、挑戦を終える）。
 * 負けたら進み具合は変えない（やり直すか撤退するかは、その後に選ぶ）。
 */
export function finishRunBattle(
  state: DungeonState,
  dungeon: DungeonDefinition,
  victory: boolean,
): { state: DungeonState; outcome: RunOutcome } {
  const run = state.run;
  if (!run || run.dungeonId !== dungeon.id) throw new Error(`ダンジョン ${dungeon.id} に挑戦していません`);
  if (!victory) return { state, outcome: { kind: 'defeat', battle: run.battle } };
  const next = run.battle + 1;
  if (next < dungeon.battles.length) return { state: { ...state, run: { ...run, battle: next } }, outcome: { kind: 'next', battle: next } };
  const before = clearCount(state, dungeon.id);
  return {
    state: { run: null, clears: { ...state.clears, [dungeon.id]: before + 1 } },
    outcome: { kind: 'cleared', firstClear: before === 0 },
  };
}

/** クリアの報酬の JP（初めてのクリアなら clearRewardJp、2回目以降は repeatClearRewardJp） */
export function clearRewardJp(dungeon: DungeonDefinition, firstClear: boolean): number {
  return firstClear ? dungeon.clearRewardJp : dungeon.repeatClearRewardJp;
}

/** クリアの報酬: 全員の今のジョブに JP を配る */
export function grantClearReward(roster: Roster, dungeon: DungeonDefinition, firstClear: boolean): Roster {
  const jp = clearRewardJp(dungeon, firstClear);
  let next = roster;
  for (const u of roster.units) next = replaceUnit(next, gainJp(u, u.jobId, jp));
  return next;
}

/** 初めてのクリアで手に入る装備（初めてでなければ、なし） */
export function clearRewardItems(dungeon: DungeonDefinition, firstClear: boolean): string[] {
  return firstClear && dungeon.firstClearItemId ? [dungeon.firstClearItemId] : [];
}

/**
 * 読み込んだ記録を、今あるダンジョンの定義に合わせて直す（知らないダンジョンや、範囲の外の戦闘の挑戦は取り消す）。
 * ダンジョンを作り直した時に、古いセーブデータで先へ進めなくならないようにするため。
 */
export function normalizeDungeonState(state: DungeonState, dungeons: readonly DungeonDefinition[]): DungeonState {
  const run = state.run;
  if (!run) return state;
  const def = dungeons.find((d) => d.id === run.dungeonId);
  const ok = def && Number.isInteger(run.battle) && run.battle >= 0 && run.battle < def.battles.length;
  return ok ? state : { ...state, run: null };
}
