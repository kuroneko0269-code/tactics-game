/**
 * コンピューターが操作するユニットの思考（敵 AI）。
 *
 * - 攻撃できる相手がいれば攻撃する。攻撃する位置と相手を選べる時は、
 *   背面 → 側面 → 正面 の順に優先し、同じなら高い位置、それも同じなら移動の少ない位置、
 *   さらに同じなら HP の少ない相手を選ぶ。
 * - 攻撃できる相手がいなければ、最も近い相手に近づく。
 * - 最後は、最も近い相手の方を向いて手番を終える。
 *
 * 味方側のユニットにも同じ思考を使える（テストで AI 同士を戦わせるため）。
 */
import { activeUnit, applyAction } from './battle';
import type { ActionResult, BattleAction, BattleEvent, BattleState, UnitState } from './battleTypes';
import { attackableTargets, previewAttack } from './combat';
import { DIRECTION_VECTORS, DIRECTIONS, directionToward, manhattan, type Coord, type RelativeSide } from './geometry';
import { getTile } from './map';
import { canStep, isAlive, reachableTiles } from './movement';

const SIDE_RANK: Readonly<Record<RelativeSide, number>> = { back: 0, side: 1, front: 2 };

interface Position extends Coord {
  /** 移動の歩数（今の位置なら 0） */
  readonly steps: number;
}

export interface AttackPlan {
  readonly position: Coord;
  readonly targetId: string;
}

/** 移動先（今の位置を含む）の候補 */
function candidatePositions(state: BattleState, unit: UnitState, canMove: boolean): Position[] {
  const here: Position = { x: unit.x, z: unit.z, steps: 0 };
  if (!canMove) return [here];
  return [here, ...reachableTiles(state, unit).map((t) => ({ x: t.x, z: t.z, steps: t.path.length - 1 }))];
}

function heightOf(state: BattleState, c: Coord): number {
  return getTile(state.map, c.x, c.z)?.height ?? 0;
}

/** 攻撃する位置と相手を選ぶ。攻撃できる相手がいなければ undefined */
export function chooseAttack(state: BattleState, unit: UnitState, canMove: boolean): AttackPlan | undefined {
  let best: { plan: AttackPlan; score: number[] } | undefined;
  for (const pos of candidatePositions(state, unit, canMove)) {
    for (const target of attackableTargets(state, unit, pos)) {
      const preview = previewAttack(state, unit, target, pos);
      // 小さいほど良い。先頭の項目から順に比べる
      const score = [SIDE_RANK[preview.side], -heightOf(state, pos), pos.steps, target.hp];
      if (!best || compareScores(score, best.score) < 0) {
        best = { plan: { position: { x: pos.x, z: pos.z }, targetId: target.id }, score };
      }
    }
  }
  return best?.plan;
}

/** 攻撃できない時に、近づく先を選ぶ。動かない方が良ければ undefined */
export function chooseApproach(state: BattleState, unit: UnitState): Coord | undefined {
  const target = nearestOpponent(state, unit, unit);
  if (!target) return undefined;
  const distances = walkingDistances(state, target, unit.stats.jump);
  const distanceTo = (c: Coord) => distances.get(c.z * state.map.width + c.x) ?? 1000 + manhattan(c, target);

  let best: { pos: Position; score: number[] } | undefined;
  for (const pos of candidatePositions(state, unit, true)) {
    const score = [distanceTo(pos), -heightOf(state, pos), pos.steps];
    if (!best || compareScores(score, best.score) < 0) best = { pos, score };
  }
  if (!best || best.pos.steps === 0) return undefined;
  return { x: best.pos.x, z: best.pos.z };
}

/** 手番のユニットが次にとる行動を1つ決める。手番を終えるまで繰り返し呼ぶ */
export function decideNextAction(state: BattleState): BattleAction {
  const unit = activeUnit(state);
  const turn = state.turn;
  if (!unit || !turn) throw new Error('手番のユニットがいません');

  if (!turn.acted) {
    const plan = chooseAttack(state, unit, !turn.moved);
    if (plan) {
      if (plan.position.x !== unit.x || plan.position.z !== unit.z) {
        return { type: 'move', x: plan.position.x, z: plan.position.z };
      }
      return { type: 'attack', targetId: plan.targetId };
    }
    if (!turn.moved) {
      const dest = chooseApproach(state, unit);
      if (dest) return { type: 'move', x: dest.x, z: dest.z };
    }
  }
  const nearest = nearestOpponent(state, unit, unit);
  return { type: 'endTurn', facing: nearest ? directionToward(unit, nearest, unit.facing) : unit.facing };
}

/** 手番が終わるまで AI の行動を適用し続ける */
export function playAiTurn(state: BattleState): ActionResult & { actions: BattleAction[] } {
  const startTurn = state.turnNumber;
  const events: BattleEvent[] = [];
  const actions: BattleAction[] = [];
  let current = state;
  while (current.turn && current.turnNumber === startTurn) {
    const action = decideNextAction(current);
    const result = applyAction(current, action);
    actions.push(action);
    events.push(...result.events);
    current = result.state;
  }
  return { state: current, events, actions };
}

/**
 * 両陣営とも AI で、決着まで戦闘を進める（テストやバランス確認用）。
 * maxTurns 回の手番を過ぎても決着しなければ、そこで止める。
 */
export function runAutoBattle(state: BattleState, maxTurns: number): { state: BattleState; actions: BattleAction[] } {
  let current = state;
  const actions: BattleAction[] = [];
  while (current.turn && current.turnNumber <= maxTurns) {
    const result = playAiTurn(current);
    actions.push(...result.actions);
    current = result.state;
  }
  return { state: current, actions };
}

function nearestOpponent(state: BattleState, unit: UnitState, from: Coord): UnitState | undefined {
  let best: UnitState | undefined;
  for (const u of state.units) {
    if (!isAlive(u) || u.team === unit.team) continue;
    if (!best) {
      best = u;
      continue;
    }
    const d = manhattan(from, u) - manhattan(from, best);
    if (d < 0 || (d === 0 && u.hp < best.hp)) best = u;
  }
  return best;
}

/** goal から各マスまでの歩数（地形の高さだけを考え、ユニットは無視する） */
function walkingDistances(state: BattleState, goal: Coord, jump: number): Map<number, number> {
  const { width } = state.map;
  const key = (c: Coord) => c.z * width + c.x;
  const result = new Map<number, number>([[key(goal), 0]]);
  let frontier: Coord[] = [goal];
  for (let d = 1; frontier.length > 0; d++) {
    const next: Coord[] = [];
    for (const from of frontier) {
      for (const dir of DIRECTIONS) {
        const v = DIRECTION_VECTORS[dir];
        const to = { x: from.x + v.x, z: from.z + v.z };
        if (result.has(key(to)) || !canStep(state, from, to, jump)) continue;
        result.set(key(to), d);
        next.push(to);
      }
    }
    frontier = next;
  }
  return result;
}

function compareScores(a: readonly number[], b: readonly number[]): number {
  for (let i = 0; i < a.length; i++) {
    const d = a[i]! - b[i]!;
    if (d !== 0) return d;
  }
  return 0;
}
