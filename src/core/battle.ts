/**
 * 戦闘の進行。「現在の状態 + 行動 → 新しい状態 + 起きた出来事の一覧」という関数で進める。
 *
 * 1回の手番では、移動と攻撃を1回ずつ、好きな順でできる。最後に向きを選んで手番を終える。
 * 攻撃する前なら、移動を取り消して手番開始時の位置に戻れる。
 * 勝敗は全滅で決まる（敵が全滅で味方の勝ち、味方が全滅で敵の勝ち）。
 */
import type {
  ActionResult,
  BattleAction,
  BattleEvent,
  BattleRules,
  BattleSetup,
  BattleState,
  JobDefinition,
  Team,
  TurnState,
  UnitState,
} from './battleTypes';
import { attackableTargets, previewAttack } from './combat';
import { DIRECTIONS, directionToward } from './geometry';
import { createMap, getTile } from './map';
import { isAlive, reachableTiles } from './movement';
import { createRng, restoreRng } from './rng';
import { advanceToNextTurn, ctAfterTurn } from './turnOrder';

/** 定義データから戦闘を始める。最初の手番が始まった状態を返す */
export function startBattle(
  setup: BattleSetup,
  jobs: readonly JobDefinition[],
  rules: BattleRules,
  seed: number,
): ActionResult {
  const map = createMap(setup.map);
  const ids = new Set<string>();
  const units: UnitState[] = setup.units.map((p) => {
    const job = jobs.find((j) => j.id === p.jobId);
    if (!job) throw new Error(`ユニット ${p.id}: ジョブ ${p.jobId} が見つかりません`);
    if (ids.has(p.id)) throw new Error(`ユニット id ${p.id} が重複しています`);
    ids.add(p.id);
    if (!getTile(map, p.x, p.z)) throw new Error(`ユニット ${p.id}: 配置 (${p.x}, ${p.z}) がマップ外です`);
    return {
      id: p.id,
      team: p.team,
      jobId: p.jobId,
      x: p.x,
      z: p.z,
      facing: p.facing,
      hp: job.stats.maxHp,
      ct: 0,
      stats: job.stats,
      attack: job.attack,
    };
  });
  const state: BattleState = {
    map,
    rules,
    units,
    turn: null,
    winner: null,
    rngState: createRng(seed).getState(),
    turnNumber: 0,
  };
  const events: BattleEvent[] = [];
  return { state: beginNextTurn(state, events), events };
}

export function getUnit(state: BattleState, id: string): UnitState {
  const unit = state.units.find((u) => u.id === id);
  if (!unit) throw new Error(`ユニット ${id} が見つかりません`);
  return unit;
}

/** 手番を持っているユニット（決着後は undefined） */
export function activeUnit(state: BattleState): UnitState | undefined {
  return state.turn ? getUnit(state, state.turn.unitId) : undefined;
}

/** 行動を1つ適用する。ルール上できない行動ならエラーにする */
export function applyAction(state: BattleState, action: BattleAction): ActionResult {
  const turn = state.turn;
  if (!turn || state.winner) throw new Error('戦闘は終わっています');
  const unit = getUnit(state, turn.unitId);
  const events: BattleEvent[] = [];

  switch (action.type) {
    case 'move': {
      if (turn.moved) throw new Error('この手番ではもう移動しています');
      const dest = reachableTiles(state, unit).find((t) => t.x === action.x && t.z === action.z);
      if (!dest) throw new Error(`(${action.x}, ${action.z}) へは移動できません`);
      const last = dest.path[dest.path.length - 1]!;
      const prev = dest.path[dest.path.length - 2]!;
      // 移動後は、最後に進んだ方向を向く
      const facing = directionToward(prev, last, unit.facing);
      events.push({ type: 'moved', unitId: unit.id, path: dest.path });
      return {
        state: {
          ...updateUnit(state, unit.id, { x: dest.x, z: dest.z, facing }),
          turn: { ...turn, moved: true },
        },
        events,
      };
    }

    case 'undoMove': {
      if (!turn.moved) throw new Error('取り消す移動がありません');
      if (turn.acted) throw new Error('行動した後は移動を取り消せません');
      const { x, z, facing } = turn.origin;
      events.push({ type: 'moveUndone', unitId: unit.id, x, z, facing });
      return {
        state: { ...updateUnit(state, unit.id, { x, z, facing }), turn: { ...turn, moved: false } },
        events,
      };
    }

    case 'attack': {
      if (turn.acted) throw new Error('この手番ではもう行動しています');
      const target = attackableTargets(state, unit, unit).find((u) => u.id === action.targetId);
      if (!target) throw new Error(`${action.targetId} は攻撃できません`);
      const preview = previewAttack(state, unit, target);
      const rng = restoreRng(state.rngState);
      const hit = rng.nextInt(1, 100) <= preview.hitPercent;
      const damage = hit ? Math.min(preview.damage, target.hp) : 0;
      const targetHp = target.hp - damage;
      events.push({
        type: 'attacked',
        attackerId: unit.id,
        targetId: target.id,
        attackerFacing: preview.attackerFacing,
        side: preview.side,
        hitPercent: preview.hitPercent,
        heightPercent: preview.heightPercent,
        hit,
        damage,
        targetHp,
      });
      let next = updateUnit(state, unit.id, { facing: preview.attackerFacing });
      next = updateUnit(next, target.id, { hp: targetHp });
      next = { ...next, rngState: rng.getState(), turn: { ...turn, acted: true } };
      if (targetHp === 0) events.push({ type: 'defeated', unitId: target.id });

      const winner = judgeWinner(next);
      if (winner) {
        events.push({ type: 'battleEnded', winner });
        next = { ...next, winner, turn: null };
      }
      return { state: next, events };
    }

    case 'endTurn': {
      if (!DIRECTIONS.includes(action.facing)) throw new Error(`向き ${String(action.facing)} が不正です`);
      const ct = ctAfterTurn(state.rules, turn.moved, turn.acted);
      events.push({ type: 'turnEnded', unitId: unit.id, facing: action.facing, ct });
      const next: BattleState = { ...updateUnit(state, unit.id, { facing: action.facing, ct }), turn: null };
      return { state: beginNextTurn(next, events), events };
    }
  }
}

/** 決着していれば勝った陣営を返す */
export function judgeWinner(state: BattleState): Team | null {
  const alive = (team: Team) => state.units.some((u) => u.team === team && isAlive(u));
  if (!alive('enemy')) return 'player';
  if (!alive('player')) return 'enemy';
  return null;
}

function beginNextTurn(state: BattleState, events: BattleEvent[]): BattleState {
  const { units, unitId } = advanceToNextTurn(state.units, state.rules);
  const unit = units.find((u) => u.id === unitId)!;
  const turn: TurnState = {
    unitId,
    moved: false,
    acted: false,
    origin: { x: unit.x, z: unit.z, facing: unit.facing },
  };
  const turnNumber = state.turnNumber + 1;
  events.push({ type: 'turnStarted', unitId, turnNumber });
  return { ...state, units, turn, turnNumber };
}

function updateUnit(state: BattleState, id: string, patch: Partial<UnitState>): BattleState {
  return { ...state, units: state.units.map((u) => (u.id === id ? { ...u, ...patch } : u)) };
}
