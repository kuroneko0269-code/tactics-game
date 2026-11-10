/**
 * 戦闘の進行。「現在の状態 + 行動 → 新しい状態 + 起きた出来事の一覧」という関数で進める。
 *
 * 1回の手番では、移動と攻撃を1回ずつ、好きな順でできる。最後に向きを選んで手番を終える。
 * 攻撃する前なら、移動を取り消して手番開始時の位置に戻れる。
 * 行動は通常攻撃か魔法の指定。魔法はすぐには発動せず、手番と手番の間の時計の進みの中で発動する（magic.ts）。
 * 詠唱中に自分の手番が来たら、待機すれば詠唱を続け、移動か行動をすると詠唱は中断される（MP は戻らない）。
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
  SpellDefinition,
  Team,
  TurnState,
  UnitState,
} from './battleTypes';
import { attackableTargets, previewAttack } from './combat';
import { DIRECTIONS, directionToward } from './geometry';
import { hasMpFor, isValidSpellTarget, previewSpellAt, spellOf, targetCenter } from './magic';
import { createMap, getTile } from './map';
import { isAlive, reachableTiles } from './movement';
import { createRng, restoreRng } from './rng';
import { ctAfterTurn, nextTimelineEntry } from './turnOrder';

/** 定義データから戦闘を始める。最初の手番が始まった状態を返す */
export function startBattle(
  setup: BattleSetup,
  jobs: readonly JobDefinition[],
  rules: BattleRules,
  seed: number,
  spells: readonly SpellDefinition[] = [],
): ActionResult {
  const map = createMap(setup.map);
  const ids = new Set<string>();
  const units: UnitState[] = setup.units.map((p) => {
    const job = jobs.find((j) => j.id === p.jobId);
    if (!job) throw new Error(`ユニット ${p.id}: ジョブ ${p.jobId} が見つかりません`);
    if (ids.has(p.id)) throw new Error(`ユニット id ${p.id} が重複しています`);
    ids.add(p.id);
    if (!getTile(map, p.x, p.z)) throw new Error(`ユニット ${p.id}: 配置 (${p.x}, ${p.z}) がマップ外です`);
    const unitSpells = (job.spellIds ?? []).map((id) => {
      const spell = spells.find((s) => s.id === id);
      if (!spell) throw new Error(`ジョブ ${job.id}: 魔法 ${id} が見つかりません`);
      return spell;
    });
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
      mp: job.stats.maxMp,
      spells: unitSpells,
      charging: null,
      movedLastTurn: false,
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
    lastAggressionTurn: 0,
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
  if (!state.turn || state.winner) throw new Error('戦闘は終わっています');
  const events: BattleEvent[] = [];
  const original = state;
  const turn0 = state.turn;

  // 手番開始時から詠唱中なら、移動・行動の前に詠唱を中断する（MP は戻らない）
  const interrupts = action.type === 'move' || action.type === 'attack' || action.type === 'cast';
  if (interrupts) validateBeforeInterrupt(state, action);
  if (interrupts && turn0.chargingAtStart) {
    const caster = getUnit(state, turn0.unitId);
    if (caster.charging) {
      events.push({ type: 'castInterrupted', casterId: caster.id, spellId: caster.charging.spellId });
      state = updateUnit(state, caster.id, { charging: null });
    }
    state = { ...state, turn: { ...turn0, chargingAtStart: false } };
  }
  const turn = state.turn!;
  const unit = getUnit(state, turn.unitId);

  switch (action.type) {
    case 'move': {
      const dest = reachableTiles(original, unit).find((t) => t.x === action.x && t.z === action.z)!;
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
      const target = getUnit(state, action.targetId);
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
        chargingPercent: preview.chargingPercent,
      });
      let next = updateUnit(state, unit.id, { facing: preview.attackerFacing });
      next = updateUnit(next, target.id, { hp: targetHp });
      next = { ...next, rngState: rng.getState(), turn: { ...turn, acted: true }, lastAggressionTurn: state.turnNumber };
      if (targetHp === 0) next = defeat(next, target.id, events);
      return { state: endIfDecided(next, events), events };
    }

    case 'cast': {
      const spell = spellOf(unit, action.spellId);
      const center = targetCenter(state, action.target)!;
      const casterFacing = directionToward(unit, center, unit.facing);
      const mp = unit.mp - spell.mpCost;
      const target = action.target.kind === 'unit'
        ? { kind: 'unit' as const, unitId: action.target.unitId }
        : { kind: 'tile' as const, x: action.target.x, z: action.target.z };
      events.push({ type: 'castStarted', casterId: unit.id, spellId: spell.id, target, mp, casterFacing });
      const next = updateUnit(state, unit.id, {
        mp,
        facing: casterFacing,
        charging: { spellId: spell.id, target, progress: 0 },
      });
      return { state: { ...next, turn: { ...turn, acted: true }, lastAggressionTurn: state.turnNumber }, events };
    }

    case 'endTurn': {
      if (!DIRECTIONS.includes(action.facing)) throw new Error(`向き ${String(action.facing)} が不正です`);
      const ct = ctAfterTurn(state.rules, turn.moved, turn.acted);
      events.push({ type: 'turnEnded', unitId: unit.id, facing: action.facing, ct });
      const next: BattleState = {
        ...updateUnit(state, unit.id, { facing: action.facing, ct, movedLastTurn: turn.moved }),
        turn: null,
      };
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

/** 移動・攻撃・魔法の指定が、ルール上できるかを確かめる（詠唱の中断より前に確かめる） */
function validateBeforeInterrupt(state: BattleState, action: BattleAction): void {
  const turn = state.turn!;
  const unit = getUnit(state, turn.unitId);
  if (action.type === 'move') {
    if (turn.moved) throw new Error('この手番ではもう移動しています');
    if (!reachableTiles(state, unit).some((t) => t.x === action.x && t.z === action.z)) {
      throw new Error(`(${action.x}, ${action.z}) へは移動できません`);
    }
  } else if (action.type === 'attack') {
    if (turn.acted) throw new Error('この手番ではもう行動しています');
    if (!attackableTargets(state, unit, unit).some((u) => u.id === action.targetId)) {
      throw new Error(`${action.targetId} は攻撃できません`);
    }
  } else if (action.type === 'cast') {
    if (turn.acted) throw new Error('この手番ではもう行動しています');
    const spell = spellOf(unit, action.spellId);
    if (!hasMpFor(unit, spell)) throw new Error(`MP が足りません（${spell.id}）`);
    if (!isValidSpellTarget(state, spell, unit, action.target)) throw new Error(`${spell.id} はそこを狙えません`);
  }
}

/** ユニットを戦闘不能にする。詠唱中だった魔法は不発になる */
function defeat(state: BattleState, unitId: string, events: BattleEvent[]): BattleState {
  events.push({ type: 'defeated', unitId });
  const unit = getUnit(state, unitId);
  if (!unit.charging) return state;
  events.push({ type: 'spellFizzled', casterId: unitId, spellId: unit.charging.spellId, reason: 'casterDefeated' });
  return updateUnit(state, unitId, { charging: null });
}

/** 決着していれば、勝敗を記録して手番をなくす */
function endIfDecided(state: BattleState, events: BattleEvent[]): BattleState {
  const winner = judgeWinner(state);
  if (!winner) return state;
  events.push({ type: 'battleEnded', winner });
  return { ...state, winner, turn: null };
}

/** 詠唱が満ちた魔法を発動する */
function resolveCharge(state: BattleState, casterId: string, events: BattleEvent[]): BattleState {
  const caster = getUnit(state, casterId);
  const charge = caster.charging!;
  const spell = spellOf(caster, charge.spellId);
  // 詠唱は終わったので、発動の計算では詠唱者を詠唱中として扱わない
  let next = updateUnit(state, casterId, { charging: null });
  const center = targetCenter(next, charge.target);
  // 狙ったユニットが倒れていても、倒れたマスを中心に発動する（不発にはしない）
  if (!center) throw new Error(`魔法の狙い先がありません（${spell.id}）`);
  const preview = previewSpellAt(next, getUnit(next, casterId), spell, center);
  events.push({
    type: 'spellResolved',
    casterId,
    spellId: spell.id,
    element: spell.element,
    effect: spell.effect,
    center,
    tiles: preview.tiles,
    results: preview.results,
  });
  for (const r of preview.results) next = updateUnit(next, r.unitId, { hp: r.hp });
  for (const r of preview.results) if (r.hp === 0) next = defeat(next, r.unitId, events);
  return next;
}

/** 時計を進め、途中で発動する魔法を発動しながら、次の手番を始める。途中で決着したらそこで止める */
function beginNextTurn(state: BattleState, events: BattleEvent[]): BattleState {
  let current = state;
  for (;;) {
    const { units, entry } = nextTimelineEntry(current.units, current.rules);
    current = { ...current, units };
    if (entry.kind === 'spell') {
      current = endIfDecided(resolveCharge(current, entry.casterId, events), events);
      if (current.winner) return current;
      continue;
    }
    const unit = getUnit(current, entry.unitId);
    const turn: TurnState = {
      unitId: unit.id,
      moved: false,
      acted: false,
      origin: { x: unit.x, z: unit.z, facing: unit.facing },
      chargingAtStart: unit.charging !== null,
    };
    const turnNumber = current.turnNumber + 1;
    events.push({ type: 'turnStarted', unitId: unit.id, turnNumber });
    return { ...current, turn, turnNumber };
  }
}

function updateUnit(state: BattleState, id: string, patch: Partial<UnitState>): BattleState {
  return { ...state, units: state.units.map((u) => (u.id === id ? { ...u, ...patch } : u)) };
}
