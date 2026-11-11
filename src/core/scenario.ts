/**
 * 戦闘の筋書き: 勝敗条件の判定、マップ上のイベントのきっかけ、罠、増援の出現するマス。
 * ここは状態を読むだけの計算。状態を変える処理（イベントを起こす、罠を発動する）は battle.ts。
 *
 * 勝敗条件（フェーズ2-2）:
 * - 勝利条件・敗北条件は、戦闘ごとにデータで指定する。どれか1つを満たせば、その結果になる。
 * - 敵の全滅は常に勝利、味方の全滅は常に敗北（書いていなくても）。
 * - 勝利と敗北が同時に満たされた時は、勝利を優先する（例: 範囲の魔法で最後の味方とボスが同時に倒れた）。
 * - 手番数の条件は、手番の区切り（ある手番が終わり、次の手番が始まる前）で判定する。
 *   「規定の手番数を耐える」は turns 回の手番が終わった時点で勝利、「規定の手番数を超える」は同じ時点で勝っていなければ敗北。
 *   手番数は、敵味方すべてのユニットの手番を数える（画面の「手番 12」と同じ数）。
 */
import type {
  BattleObjectives,
  BattleState,
  DefeatCondition,
  MapEventState,
  Team,
  TrapState,
  UnitState,
  VictoryCondition,
} from './battleTypes';
import { manhattan, type Coord } from './geometry';
import { getTile } from './map';
import { isAlive, unitAt } from './movement';

/** 勝敗条件を省いた時の決まり（今までの訓練戦と同じ） */
export const DEFAULT_OBJECTIVES: BattleObjectives = {
  victory: [{ kind: 'defeatAll' }],
  defeat: [{ kind: 'allDefeated' }],
};

export type OutcomeReason = VictoryCondition['kind'] | DefeatCondition['kind'];

export interface Outcome {
  readonly winner: Team;
  readonly reason: OutcomeReason;
}

const onTiles = (tiles: readonly Coord[], c: Coord) => tiles.some((t) => t.x === c.x && t.z === c.z);

/**
 * 状態だけで決まる勝敗（手番数の条件は除く）。決着していなければ null。勝利を優先する。
 */
export function judgeOutcome(state: BattleState): Outcome | null {
  const { victory, defeat } = state.scenario.objectives;
  const alive = (team: Team) => state.units.some((u) => u.team === team && isAlive(u));
  const isDown = (id: string) => {
    const u = state.units.find((x) => x.id === id);
    return u !== undefined && !isAlive(u);
  };
  // 勝利（敵の全滅は、書いていなくても勝利）
  if (!alive('enemy')) return { winner: 'player', reason: 'defeatAll' };
  for (const c of victory) {
    if (c.kind === 'defeatUnit' && isDown(c.unitId)) return { winner: 'player', reason: c.kind };
    if (c.kind === 'reachTile' && state.units.some((u) => u.team === 'player' && isAlive(u) && onTiles(c.tiles, u))) {
      return { winner: 'player', reason: c.kind };
    }
  }
  // 敗北（味方の全滅は、書いていなくても敗北）
  if (!alive('player')) return { winner: 'enemy', reason: 'allDefeated' };
  for (const c of defeat) {
    if (c.kind === 'unitDefeated' && isDown(c.unitId)) return { winner: 'enemy', reason: c.kind };
  }
  return null;
}

/**
 * 手番の区切りでの勝敗（finishedTurns 回の手番が終わった時点）。手番数の条件だけを見る。勝利を優先する。
 */
export function judgeTurnOutcome(objectives: BattleObjectives, finishedTurns: number): Outcome | null {
  for (const c of objectives.victory) {
    if (c.kind === 'surviveTurns' && finishedTurns >= c.turns) return { winner: 'player', reason: c.kind };
  }
  for (const c of objectives.defeat) {
    if (c.kind === 'turnLimit' && finishedTurns >= c.turns) return { winner: 'enemy', reason: c.kind };
  }
  return null;
}

/**
 * 手番数の条件の残り（今の手番を含めて、あと何回の手番の中で決まるか）。手番数の条件がなければ undefined。
 * 勝利と敗北の両方にあれば、早く来る方。
 */
export function turnsRemaining(state: BattleState): { readonly kind: 'surviveTurns' | 'turnLimit'; readonly turns: number } | undefined {
  let best: { kind: 'surviveTurns' | 'turnLimit'; turns: number } | undefined;
  const conditions = [...state.scenario.objectives.victory, ...state.scenario.objectives.defeat];
  for (const c of conditions) {
    if (c.kind !== 'surviveTurns' && c.kind !== 'turnLimit') continue;
    const turns = Math.max(0, c.turns - state.turnNumber + 1);
    if (!best || turns < best.turns) best = { kind: c.kind, turns };
  }
  return best;
}

/** 到達するマス（勝利条件の reachTile のマスすべて） */
export function goalTiles(objectives: BattleObjectives): Coord[] {
  return objectives.victory.flatMap((c) => (c.kind === 'reachTile' ? c.tiles.map((t) => ({ x: t.x, z: t.z })) : []));
}

/** 撃破の対象になっている敵の id */
export function targetUnitIds(objectives: BattleObjectives): string[] {
  return objectives.victory.flatMap((c) => (c.kind === 'defeatUnit' ? [c.unitId] : []));
}

/** 倒れると負けになる味方の id */
export function protectedUnitIds(objectives: BattleObjectives): string[] {
  return objectives.defeat.flatMap((c) => (c.kind === 'unitDefeated' ? [c.unitId] : []));
}

/** マスにある罠（見えているかどうかを問わない） */
export function trapAt(state: BattleState, c: Coord): TrapState | undefined {
  return state.scenario.traps.find((t) => t.x === c.x && t.z === c.z);
}

/** 見えている罠のマスか（AI は見えていない罠を知らないものとして動く） */
export function isKnownTrap(state: BattleState, c: Coord): boolean {
  return trapAt(state, c)?.revealed ?? false;
}

/** その手番数の区切りで起きる「手番」のきっかけか */
export function turnTriggerDue(event: MapEventState, finishedTurns: number): boolean {
  const t = event.trigger;
  if (t.kind !== 'turn' || event.fired >= event.times) return false;
  if (finishedTurns === t.turn) return true;
  return t.every !== undefined && t.every > 0 && finishedTurns > t.turn && (finishedTurns - t.turn) % t.every === 0;
}

/** unit が c に入った時に起きる「マスに入る」のきっかけか */
export function enterTriggerDue(event: MapEventState, unit: UnitState, c: Coord): boolean {
  const t = event.trigger;
  if (t.kind !== 'enterTile' || event.fired >= event.times) return false;
  return (t.team === undefined || t.team === unit.team) && onTiles(t.tiles, c);
}

/** 状態で決まるきっかけ（HP が一定以下・撃破）が満たされているか */
export function stateTriggerDue(event: MapEventState, state: BattleState): boolean {
  const t = event.trigger;
  if (event.fired >= event.times) return false;
  if (t.kind !== 'hpBelow' && t.kind !== 'unitDefeated') return false;
  const unit = state.units.find((u) => u.id === t.unitId);
  if (!unit) return false;
  if (t.kind === 'unitDefeated') return !isAlive(unit);
  return unit.hp * 100 <= unit.stats.maxHp * t.percent;
}

/**
 * 増援を出すマス。予定のマスが空いていればそこ、ユニットがいれば近くの空いたマス。
 * 近い順（縦横の歩数）→ 予定のマスとの高さの差が小さい → 奥（z が小さい）→ 西（x が小さい）の順に選ぶ。
 * taken は、同時に出す増援がすでに使ったマス。空いたマスがなければ undefined。
 */
export function spawnTile(state: BattleState, wanted: Coord, taken: readonly Coord[] = []): Coord | undefined {
  const free = (c: Coord) => !unitAt(state, c.x, c.z) && !onTiles(taken, c);
  if (getTile(state.map, wanted.x, wanted.z) && free(wanted)) return { x: wanted.x, z: wanted.z };
  const base = getTile(state.map, wanted.x, wanted.z)?.height ?? 0;
  let best: { c: Coord; score: number[] } | undefined;
  for (const t of state.map.tiles) {
    if (!free(t)) continue;
    const score = [manhattan(t, wanted), Math.abs(t.height - base), t.z, t.x];
    if (!best || compare(score, best.score) < 0) best = { c: { x: t.x, z: t.z }, score };
  }
  return best?.c;
}

function compare(a: readonly number[], b: readonly number[]): number {
  for (let i = 0; i < a.length; i++) {
    const d = a[i]! - b[i]!;
    if (d !== 0) return d;
  }
  return 0;
}
