import { describe, expect, it } from 'vitest';
import { decideNextAction } from '../core/ai';
import { applyAction, startBattle } from '../core/battle';
import type { BattleAction, BattleState } from '../core/battleTypes';
import { startRun, EMPTY_DUNGEON_STATE, type DungeonState } from '../core/dungeon';
import { applyBattleResult, findUnit, replaceUnit, type Roster } from '../core/progression';
import { EMPTY_RECORDS, type BattleOrigin } from '../core/saveData';
import { buildSortie, type BattleSite } from '../core/sortie';
import { spells, strikes } from '../data/abilities';
import { aiConfig } from '../data/aiConfig';
import { battleRules } from '../data/battleRules';
import { ruinsDungeon } from '../data/battles/ruins';
import { twinHillsBattle } from '../data/battles/twinHillsBattle';
import { equipment, saveMigrationContext } from '../data/equipment';
import { jobs } from '../data/jobs';
import { passives } from '../data/passives';
import { progressionRules } from '../data/progression';
import { initialRoster } from '../data/roster';
import { createSaveStore, type SaveBackend } from './saveStore';

/**
 * 戦闘の途中保存（フェーズ2-5）: 途中で保存して読み込み直し、続きを進めた結果が、中断しなかった場合と完全に一致すること。
 * 味方も敵と同じ AI で動かす（同じ状態からは必ず同じ行動になる）。
 */
const catalog = { jobs, spells, strikes, passives, equipment };
const configs = { player: aiConfig, enemy: aiConfig };

const memory = (): SaveBackend => {
  let text: string | null = null;
  return { read: () => text, write: (t) => void (text = t), remove: () => void (text = null) };
};

const begin = (site: BattleSite, tierId: string, seed: number, roster: Roster = initialRoster) =>
  startBattle(buildSortie(site, tierId, roster, catalog, progressionRules), jobs, battleRules, seed, spells, strikes, passives).state;

/** 決着するまで、1つずつ行動を適用する。stop が true を返した時点で止めて、その時点の状態を返す */
function play(state: BattleState, stop: (s: BattleState, last: BattleAction | undefined) => boolean = () => false, limit = 5000) {
  let current = state;
  let last: BattleAction | undefined;
  for (let i = 0; i < limit && current.turn && !current.winner; i++) {
    if (stop(current, last)) return { state: current, stopped: true };
    const unit = current.units.find((u) => u.id === current.turn!.unitId)!;
    last = decideNextAction(current, configs[unit.team]);
    current = applyAction(current, last).state;
  }
  return { state: current, stopped: false };
}

/** 端末に保存して読み込み直す（セーブの出入口を通す。JSON に直して戻すことになる） */
function saveAndLoad(roster: Roster, dungeon: DungeonState, origin: BattleOrigin, state: BattleState) {
  const store = createSaveStore(memory(), catalog, progressionRules, saveMigrationContext);
  store.save({ roster, dungeon, records: EMPTY_RECORDS, battle: { origin, state } });
  const loaded = store.load()!;
  expect(loaded.battle).not.toBeNull();
  return loaded;
}

/** 途中（stop の時点）で保存・再開しても、最後まで進めた結果が中断しなかった場合と同じ */
function expectSameAfterResume(
  start: BattleState,
  stop: (s: BattleState, last: BattleAction | undefined) => boolean,
  origin: BattleOrigin = { kind: 'training', tierId: 'easy' },
  dungeon: DungeonState = EMPTY_DUNGEON_STATE,
) {
  const reference = play(start).state;
  const half = play(start, stop);
  expect(half.stopped).toBe(true);
  const loaded = saveAndLoad(initialRoster, dungeon, origin, half.state);
  expect(loaded.battle!.state).toEqual(half.state);
  const resumed = play(loaded.battle!.state).state;
  expect(resumed).toEqual(reference);
  // 部隊へ書き戻した結果（戦闘中に得た経験値と JP を含む）も同じ
  expect(applyBattleResult(initialRoster, resumed, catalog, progressionRules)).toEqual(
    applyBattleResult(initialRoster, reference, catalog, progressionRules),
  );
  return { reference, half: half.state };
}

describe('戦闘の途中保存と再開（フェーズ2-5）', () => {
  const start = begin(twinHillsBattle, 'easy', 4242);
  const isPlayerTurn = (s: BattleState) => s.units.find((u) => u.id === s.turn!.unitId)!.team === 'player';

  it('味方が移動しただけの時点で保存して再開しても、結果は中断しなかった場合と同じ（乱数の状態も残る）', () => {
    const { half } = expectSameAfterResume(start, (s, last) => isPlayerTurn(s) && last?.type === 'move' && !s.turn!.acted);
    expect(half.turn!.moved).toBe(true);
  });

  it('行動（攻撃）の後に保存して再開しても、同じ', () => {
    expectSameAfterResume(start, (s, last) => last?.type === 'attack' && s.turnNumber > 6);
  });

  it('敵の手番の途中（移動した後）で保存して再開すると、続きの敵の行動を同じように進める', () => {
    const { half } = expectSameAfterResume(start, (s) => !isPlayerTurn(s) && s.turn!.moved && !s.turn!.acted);
    expect(isPlayerTurn(half)).toBe(false);
  });

  it('詠唱が残っている状態で保存して再開しても、同じ', () => {
    const { half } = expectSameAfterResume(start, (s) => s.units.some((u) => u.charging) && s.turnNumber > 3);
    expect(half.units.some((u) => u.charging)).toBe(true);
  });

  it('戦闘中に得た経験値と JP は、保存した状態に残る（途中で閉じても失われない）', () => {
    const half = play(start, (s) => s.units.some((u) => (u.progress?.gainedExp ?? 0) > 0)).state;
    const loaded = saveAndLoad(initialRoster, EMPTY_DUNGEON_STATE, { kind: 'training', tierId: 'easy' }, half);
    const gained = loaded.battle!.state.units.filter((u) => (u.progress?.gainedExp ?? 0) > 0);
    expect(gained.length).toBeGreaterThan(0);
    // 撤退した（負けとして書き戻す）時も、それまでの分は持ち帰れる
    const lost = applyBattleResult(initialRoster, { ...loaded.battle!.state, winner: 'enemy', turn: null }, catalog, progressionRules);
    expect(lost.report.units.some((u) => u.exp > 0 && u.bonusExp === 0)).toBe(true);
  });

  it('ダンジョンの連戦の途中（第2戦）で保存して再開しても、同じ。進み具合もそのまま', () => {
    const dungeon = { ...startRun(EMPTY_DUNGEON_STATE, ruinsDungeon.id), run: { dungeonId: ruinsDungeon.id, battle: 1 } };
    const corridor = begin(ruinsDungeon.battles[1]!, 'main', 99);
    expectSameAfterResume(corridor, (s) => s.turnNumber >= 15, { kind: 'dungeon', dungeonId: ruinsDungeon.id, battle: 1 }, dungeon);
    const loaded = saveAndLoad(initialRoster, dungeon, { kind: 'dungeon', dungeonId: ruinsDungeon.id, battle: 1 }, play(corridor, (s) => s.turnNumber >= 15).state);
    expect(loaded.dungeon).toEqual(dungeon);
  });

  it('同じシード値からは同じ結果になる', () => {
    expect(play(begin(twinHillsBattle, 'normal', 7)).state).toEqual(play(begin(twinHillsBattle, 'normal', 7)).state);
  });

  it('部隊やダンジョンの進み具合と合わない途中の戦闘は、読み込む時に捨てる（部隊はそのまま）', () => {
    const half = play(start, (s) => s.turnNumber > 3).state;
    // 部隊のユニットのジョブが、戦闘の中と違う
    const changed = replaceUnit(initialRoster, { ...findUnit(initialRoster, 'hero-1'), jobId: 'archer', equipment: { weapon: null, armor: null, accessory: null } });
    const store = createSaveStore(memory(), catalog, progressionRules, saveMigrationContext);
    store.save({ roster: changed, dungeon: EMPTY_DUNGEON_STATE, records: EMPTY_RECORDS, battle: { origin: { kind: 'training', tierId: 'easy' }, state: half } });
    expect(store.load()).toMatchObject({ roster: changed, battle: null });
    // ダンジョンの戦闘なのに、挑戦中でない
    store.save({ roster: initialRoster, dungeon: EMPTY_DUNGEON_STATE, records: EMPTY_RECORDS, battle: { origin: { kind: 'dungeon', dungeonId: 'ruins', battle: 0 }, state: half } });
    expect(store.load()!.battle).toBeNull();
    // 形が崩れている
    const backend = memory();
    backend.write(JSON.stringify({ version: 4, roster: initialRoster, dungeon: EMPTY_DUNGEON_STATE, records: EMPTY_RECORDS, battle: { origin: { kind: 'training' }, state: {} } }));
    expect(createSaveStore(backend, catalog, progressionRules, saveMigrationContext).load()).toMatchObject({ roster: initialRoster, battle: null });
  });

  it('保存した戦闘の状態の大きさは、端末の保存の上限（5MB 程度）に比べて十分に小さい', () => {
    expect(JSON.stringify(play(start, (s) => s.turnNumber > 20).state).length).toBeLessThan(200_000);
  });
});
