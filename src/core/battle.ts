/**
 * 戦闘の進行。「現在の状態 + 行動 → 新しい状態 + 起きた出来事の一覧」という関数で進める。
 *
 * 1回の手番では、移動と攻撃を1回ずつ、好きな順でできる。最後に向きを選んで手番を終える。
 * 攻撃する前なら、移動を取り消して手番開始時の位置に戻れる。
 * 行動は通常攻撃か魔法の指定。魔法はすぐには発動せず、手番と手番の間の時計の進みの中で発動する（magic.ts）。
 * 詠唱中に自分の手番が来たら、待機すれば詠唱を続け、移動か行動をすると詠唱は中断される（MP は戻らない）。
 * 行動には、通常攻撃のほかに行動アビリティ（強打のようにすぐ出る技と、詠唱のある魔法・狙い撃ち）がある。
 * アビリティは、必要な武器の種類が合わなければ使えない。
 * 攻撃・魔法・技を実行するたびに、ユニットの行動の記録（actions。相手のレベルなど）を残す（戦闘の後の経験値と JP に使う）。
 * 勝敗は、戦闘ごとの勝敗条件で決まる（省くと全滅。判定は scenario.ts）。
 *
 * マップ上のイベント・罠・増援（フェーズ2-2）:
 * - 手番の区切り（ある手番が終わり、次の手番が始まる前）で、手番数の勝敗条件 →「手番」のきっかけのイベント
 *   → 予告済みの増援の出現 → 状態で決まるきっかけのイベント の順に処理する。
 * - ユニットが移動か突き飛ばしでマスに入ったら、そのマスの罠 →「マスに入る」のきっかけのイベント の順に処理する。
 * - HP が減った後（攻撃・魔法・罠）に、「HP が一定以下」「撃破」のきっかけを調べる。
 * - 罠やイベントが起きた移動は、取り消せない。自分の移動で倒れたら、その手番はそこで終わる。
 *
 * 状態変化（守り・鈍足・沈黙）は、そのユニットの手番が終わるたびに持続が 1 減り、0 で消える（effects.ts）。
 * 攻撃が当たった後の順番: ダメージ → 突き飛ばし（詠唱の中断、押し出しと落下・追加のダメージ）→ 状態変化 → 瞑想 → 反撃。
 * 反撃で手番のユニットが倒れたら、その手番はそこで終わる。
 */
import type {
  ActionRecord,
  ActionResult,
  BattleAction,
  BattleEvent,
  BattleRules,
  BattleSetup,
  BattleState,
  JobDefinition,
  MapEventState,
  PassiveDefinition,
  PendingReinforcement,
  ScenarioState,
  SpellDefinition,
  SpellTarget,
  StatusId,
  StrikeDefinition,
  Team,
  TrapKind,
  TurnState,
  UnitCommand,
  UnitPlacement,
  UnitState,
  UnitStats,
} from './battleTypes';
import { attackableTargets, canReach, knockbackOutcome, previewAttack, strikeOf, weaponFits } from './combat';
import { addStatus, applyPassiveStats, damageTaken, isSilencedFor, mpCostOf, passiveEffect, passiveIdOf, tickStatuses } from './effects';
import { DIRECTIONS, directionToward, manhattan, type Coord } from './geometry';
import { hasMpFor, isValidSpellTarget, previewSpellAt, spellArea, spellOf, targetCenter } from './magic';
import { statsWithGrowth, ZERO_GROWTH } from './progression';
import { createMap, getTile } from './map';
import { isAlive, reachableTiles, unitAt } from './movement';
import { createRng, restoreRng } from './rng';
import {
  currentLevel,
  DEFAULT_OBJECTIVES,
  enterTriggerDue,
  judgeOutcome,
  judgeTurnOutcome,
  spawnTile,
  stateTriggerDue,
  trapAt,
  turnTriggerDue,
  type Outcome,
} from './scenario';
import { ctAfterTurn, nextTimelineEntry } from './turnOrder';

/**
 * 定義データから戦闘を始める。最初の手番が始まった状態を返す。
 * 能力値は、ジョブの基本値に配置の成長値を足し、受動的なアビリティ（重装・早足・身軽）を反映したもの。
 * 使えるアビリティは配置のコマンドのもの。付けている受動的なアビリティは配置の passives のもの。
 */
export function startBattle(
  setup: BattleSetup,
  jobs: readonly JobDefinition[],
  rules: BattleRules,
  seed: number,
  spells: readonly SpellDefinition[] = [],
  strikes: readonly StrikeDefinition[] = [],
  passives: readonly PassiveDefinition[] = [],
): ActionResult {
  const map = createMap(setup.map);
  const ids = new Set<string>();
  const build = (p: UnitPlacement) => buildUnit(p, jobs, spells, strikes, passives);
  const units: UnitState[] = setup.units.map((p) => {
    if (ids.has(p.id)) throw new Error(`ユニット id ${p.id} が重複しています`);
    ids.add(p.id);
    if (!getTile(map, p.x, p.z)) throw new Error(`ユニット ${p.id}: 配置 (${p.x}, ${p.z}) がマップ外です`);
    return build(p);
  });
  const objectives = setup.objectives ?? DEFAULT_OBJECTIVES;
  const known = (id: string) => ids.has(id);
  const events: MapEventState[] = (setup.events ?? []).map((e) => {
    const effects = e.effects.map((effect) => {
      if (effect.kind !== 'reinforce') return effect;
      if (!Number.isInteger(effect.delay) || effect.delay < 1) throw new Error(`イベント ${e.id}: 増援の delay は 1 以上にしてください`);
      return {
        kind: 'reinforce' as const,
        delay: effect.delay,
        units: effect.units.map((p) => {
          if (!getTile(map, p.x, p.z)) throw new Error(`イベント ${e.id}: 増援 ${p.id} の位置がマップ外です`);
          return build(p);
        }),
      };
    });
    // HP と撃破のきっかけは1回だけ（状態で決まるので、繰り返すと同じ時点で何度も起きてしまう）
    const once = e.trigger.kind === 'hpBelow' || e.trigger.kind === 'unitDefeated';
    const times = once ? 1 : (e.times ?? 1);
    return { id: e.id, trigger: e.trigger, effects, times, fired: 0 };
  });
  for (const c of [...objectives.victory, ...objectives.defeat]) {
    if ((c.kind === 'defeatUnit' || c.kind === 'unitDefeated') && !known(c.unitId)) {
      throw new Error(`勝敗条件のユニット ${c.unitId} がいません`);
    }
  }
  for (const t of setup.traps ?? []) {
    if (!getTile(map, t.x, t.z)) throw new Error(`罠 (${t.x}, ${t.z}) がマップ外です`);
  }
  const scenario: ScenarioState = {
    objectives,
    events,
    traps: (setup.traps ?? []).map((t) => ({ x: t.x, z: t.z, kind: t.kind, revealed: false })),
    reinforcements: [],
  };
  const state: BattleState = {
    map,
    rules,
    units,
    turn: null,
    winner: null,
    rngState: createRng(seed).getState(),
    turnNumber: 0,
    lastAggressionTurn: 0,
    scenario,
  };
  const out: BattleEvent[] = [];
  return { state: beginNextTurn(state, out), events: out };
}

/**
 * 配置の定義から、戦闘中のユニットを組み立てる（戦闘の開始時の味方・敵と、増援）。
 * 能力値は、ジョブの基本値に配置の成長値を足し、受動的なアビリティ（重装・早足・身軽）を反映したもの。
 */
function buildUnit(
  p: UnitPlacement,
  jobs: readonly JobDefinition[],
  spells: readonly SpellDefinition[],
  strikes: readonly StrikeDefinition[],
  passives: readonly PassiveDefinition[],
): UnitState {
  const job = jobs.find((j) => j.id === p.jobId);
  if (!job) throw new Error(`ユニット ${p.id}: ジョブ ${p.jobId} が見つかりません`);
  const commands: readonly UnitCommand[] = p.commands ?? [
    { jobId: job.id, abilityIds: (job.abilities ?? []).map((a) => a.id) },
  ];
  const unitSpells: SpellDefinition[] = [];
  const unitStrikes: StrikeDefinition[] = [];
  for (const id of commands.flatMap((c) => c.abilityIds)) {
    const spell = spells.find((s) => s.id === id);
    const strike = strikes.find((s) => s.id === id);
    if (spell && !unitSpells.includes(spell)) unitSpells.push(spell);
    else if (strike && !unitStrikes.includes(strike)) unitStrikes.push(strike);
    else if (!spell && !strike) throw new Error(`ユニット ${p.id}: アビリティ ${id} が見つかりません`);
  }
  const unitPassives = (p.passives ?? []).map((id) => {
    const def = passives.find((x) => x.id === id);
    if (!def) throw new Error(`ユニット ${p.id}: 受動的なアビリティ ${id} が見つかりません`);
    return def;
  });
  const stats = applyPassiveStats(withBonus(statsWithGrowth(job.stats, p.growth ?? ZERO_GROWTH), p.statBonus), unitPassives);
  return {
    id: p.id,
    team: p.team,
    jobId: p.jobId,
    x: p.x,
    z: p.z,
    facing: p.facing,
    hp: stats.maxHp,
    ct: 0,
    stats,
    attack: job.attack,
    mp: stats.maxMp,
    level: p.level ?? 1,
    levelDrops: 0,
    weapon: job.weapon ?? null,
    commands,
    spells: unitSpells,
    strikes: unitStrikes,
    passives: unitPassives,
    statuses: [],
    actions: [],
    charging: null,
    movedLastTurn: false,
  };
}

/** 能力値に補正を足す（0 より下にはしない） */
function withBonus(stats: UnitStats, bonus: Partial<UnitStats> | undefined): UnitStats {
  if (!bonus) return stats;
  const result: Record<keyof UnitStats, number> = { ...stats };
  for (const key of Object.keys(bonus) as (keyof UnitStats)[]) result[key] = Math.max(0, stats[key] + (bonus[key] ?? 0));
  return result;
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
      events.push({ type: 'castInterrupted', casterId: caster.id, spellId: caster.charging.spellId, reason: 'acted' });
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
      const before = events.length;
      let next: BattleState = { ...updateUnit(state, unit.id, { x: dest.x, z: dest.z, facing }), turn: { ...turn, moved: true } };
      next = arrive(next, unit.id, events);
      next = runStateEvents(next, events);
      // 罠やイベントが起きた移動は、取り消せない
      if (events.length > before && next.turn) next = { ...next, turn: { ...next.turn, moveLocked: true } };
      next = endIfDecided(next, events);
      // 罠で手番のユニットが倒れたら、その手番はそこで終わる
      if (!next.winner && !isAlive(getUnit(next, unit.id))) next = beginNextTurn({ ...next, turn: null }, events);
      return { state: next, events };
    }

    case 'undoMove': {
      if (!turn.moved) throw new Error('取り消す移動がありません');
      if (turn.acted) throw new Error('行動した後は移動を取り消せません');
      if (turn.moveLocked) throw new Error('罠やイベントが起きた移動は取り消せません');
      const { x, z, facing } = turn.origin;
      events.push({ type: 'moveUndone', unitId: unit.id, x, z, facing });
      return {
        state: { ...updateUnit(state, unit.id, { x, z, facing }), turn: { ...turn, moved: false } },
        events,
      };
    }

    case 'attack': {
      const target = getUnit(state, action.targetId);
      const strike = action.abilityId === undefined ? undefined : strikeOf(unit, action.abilityId);
      let next = updateUnit(state, unit.id, { actions: [...unit.actions, { targetLevel: target.level, ally: false }] });
      next = resolveWeaponAttack(next, unit.id, target.id, strike, false, events);
      next = runStateEvents(next, events);
      next = { ...next, turn: { ...turn, acted: true }, lastAggressionTurn: state.turnNumber };
      next = endIfDecided(next, events);
      // 反撃で手番のユニットが倒れたら、その手番はそこで終わる
      if (!next.winner && !isAlive(getUnit(next, unit.id))) next = beginNextTurn({ ...next, turn: null }, events);
      return { state: next, events };
    }

    case 'cast': {
      const spell = spellOf(unit, action.spellId);
      const center = targetCenter(state, action.target)!;
      const casterFacing = directionToward(unit, center, unit.facing);
      const mp = unit.mp - mpCostOf(unit, spell);
      const target = action.target.kind === 'unit'
        ? { kind: 'unit' as const, unitId: action.target.unitId }
        : { kind: 'tile' as const, x: action.target.x, z: action.target.z };
      events.push({ type: 'castStarted', casterId: unit.id, spellId: spell.id, target, mp, casterFacing });
      const next = updateUnit(state, unit.id, {
        mp,
        actions: [...unit.actions, spellReference(state, unit, spell, target)],
        facing: casterFacing,
        charging: { spellId: spell.id, target, progress: 0 },
      });
      return { state: { ...next, turn: { ...turn, acted: true }, lastAggressionTurn: state.turnNumber }, events };
    }

    case 'endTurn': {
      if (!DIRECTIONS.includes(action.facing)) throw new Error(`向き ${String(action.facing)} が不正です`);
      const ct = ctAfterTurn(state.rules, turn.moved, turn.acted);
      events.push({ type: 'turnEnded', unitId: unit.id, facing: action.facing, ct });
      // 状態変化の持続を 1 減らす（0 になったものは消える）
      const ticked = tickStatuses(unit.statuses);
      for (const status of ticked.expired) events.push({ type: 'statusExpired', unitId: unit.id, status });
      const next: BattleState = {
        ...updateUnit(state, unit.id, { facing: action.facing, ct, movedLastTurn: turn.moved, statuses: ticked.statuses }),
        turn: null,
      };
      return { state: beginNextTurn(next, events), events };
    }
  }
}

/** 決着していれば勝った陣営を返す（手番数の条件は除く。scenario.ts の judgeOutcome） */
export function judgeWinner(state: BattleState): Team | null {
  return judgeOutcome(state)?.winner ?? null;
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
    if (action.abilityId !== undefined) {
      const strike = strikeOf(unit, action.abilityId);
      if (!weaponFits(strike.weapons, unit.weapon)) throw new Error(`武器が合いません（${strike.id}）`);
    }
  } else if (action.type === 'cast') {
    if (turn.acted) throw new Error('この手番ではもう行動しています');
    const spell = spellOf(unit, action.spellId);
    if (!weaponFits(spell.weapons, unit.weapon)) throw new Error(`武器が合いません（${spell.id}）`);
    if (isSilencedFor(unit, spell)) throw new Error(`沈黙のため魔法を使えません（${spell.id}）`);
    if (!hasMpFor(unit, spell)) throw new Error(`MP が足りません（${spell.id}）`);
    if (!isValidSpellTarget(state, spell, unit, action.target)) throw new Error(`${spell.id} はそこを狙えません`);
  }
}

/** ユニットを戦闘不能にする。詠唱中だった魔法は不発になり、状態変化は消える */
function defeat(state: BattleState, unitId: string, events: BattleEvent[]): BattleState {
  events.push({ type: 'defeated', unitId });
  const unit = getUnit(state, unitId);
  const next = updateUnit(state, unitId, { statuses: [] });
  if (!unit.charging) return next;
  events.push({ type: 'spellFizzled', casterId: unitId, spellId: unit.charging.spellId, reason: 'casterDefeated' });
  return updateUnit(next, unitId, { charging: null });
}

/** 詠唱を中断させる（詠唱中でなければ何もしない） */
function interruptCharge(
  state: BattleState,
  unitId: string,
  reason: 'silenced' | 'knockedBack',
  events: BattleEvent[],
): BattleState {
  const unit = getUnit(state, unitId);
  if (!unit.charging) return state;
  events.push({ type: 'castInterrupted', casterId: unitId, spellId: unit.charging.spellId, reason });
  return updateUnit(state, unitId, { charging: null });
}

/** 状態変化を付ける（すでに付いていれば持続を付け直す）。沈黙が付いた時に魔法を詠唱中なら、詠唱を中断させる */
function inflict(state: BattleState, unitId: string, status: StatusId, events: BattleEvent[]): BattleState {
  const unit = getUnit(state, unitId);
  const statuses = addStatus(unit.statuses, status, state.rules);
  events.push({ type: 'statusAdded', unitId, status, turns: state.rules.status[status].turns });
  const next = updateUnit(state, unitId, { statuses });
  if (status === 'silence' && unit.charging && spellOf(unit, unit.charging.spellId).kind === 'magic') {
    return interruptCharge(next, unitId, 'silenced', events);
  }
  return next;
}

/** ダメージを受けて生き残ったユニットの「瞑想」（MP を回復する。最大 MP まで） */
function meditate(state: BattleState, unitId: string, events: BattleEvent[]): BattleState {
  const unit = getUnit(state, unitId);
  const effect = passiveEffect(unit, 'meditate');
  if (!effect || !isAlive(unit)) return state;
  const amount = Math.max(0, Math.min(effect.mp, unit.stats.maxMp - unit.mp));
  events.push({ type: 'reaction', unitId, abilityId: passiveIdOf(unit, 'meditate')! });
  if (amount === 0) return state;
  const mp = unit.mp + amount;
  events.push({ type: 'mpRestored', unitId, amount, mp });
  return updateUnit(state, unitId, { mp });
}

/**
 * 武器による攻撃（通常攻撃・技・反撃）を1回行う。命中の判定に乱数を1回使う。
 * 当たった後: ダメージ → 突き飛ばし → 状態変化 → 瞑想 → 反撃（反撃に対する反撃は起きない）。
 * 外れた時、相手の「身かわし」が効いていれば、その名前を出す。
 */
function resolveWeaponAttack(
  state: BattleState,
  attackerId: string,
  targetId: string,
  strike: StrikeDefinition | undefined,
  isCounter: boolean,
  events: BattleEvent[],
): BattleState {
  const attacker = getUnit(state, attackerId);
  const target = getUnit(state, targetId);
  const preview = previewAttack(state, attacker, target, attacker, strike, { counter: isCounter });
  const rng = restoreRng(state.rngState);
  const hit = rng.nextInt(1, 100) <= preview.hitPercent;
  const damage = hit ? Math.min(preview.damage, target.hp) : 0;
  const targetHp = target.hp - damage;
  events.push({
    type: 'attacked',
    attackerId,
    targetId,
    abilityId: strike?.id ?? null,
    attackerFacing: preview.attackerFacing,
    side: preview.side,
    hitPercent: preview.hitPercent,
    heightPercent: preview.heightPercent,
    hit,
    damage,
    targetHp,
    chargingPercent: preview.chargingPercent,
    counter: isCounter,
  });
  let next = updateUnit(state, attackerId, { facing: preview.attackerFacing });
  next = { ...updateUnit(next, targetId, { hp: targetHp }), rngState: rng.getState() };
  if (!hit) {
    if (preview.evadePenalty > 0) events.push({ type: 'reaction', unitId: targetId, abilityId: passiveIdOf(target, 'evade')! });
    return next;
  }
  if (targetHp === 0) return defeat(next, targetId, events);

  // 突き飛ばし: 詠唱を中断させ、1マス押し出す（押し出せなければ、その場で追加のダメージ）
  if (strike?.knockback && manhattan(attacker, target) === 1) {
    next = interruptCharge(next, targetId, 'knockedBack', events);
    const t = getUnit(next, targetId);
    const kb = knockbackOutcome(next, attackerId, attacker, t);
    const kbDamage = Math.min(kb.damage, t.hp);
    const hp = t.hp - kbDamage;
    events.push({ type: 'knockedBack', unitId: targetId, from: { x: t.x, z: t.z }, to: kb.to, damage: kbDamage, hp });
    next = updateUnit(next, targetId, kb.to ? { x: kb.to.x, z: kb.to.z, hp } : { hp });
    if (hp === 0) return defeat(next, targetId, events);
    // 押し出された先の罠と「マスに入る」のイベント
    if (kb.to) {
      next = arrive(next, targetId, events);
      if (!isAlive(getUnit(next, targetId))) return next;
    }
  }
  if (strike?.inflicts) next = inflict(next, targetId, strike.inflicts, events);
  next = meditate(next, targetId, events);

  // 反撃: 隣接するマスからの近接攻撃を受けて生き残り、まだ隣にいて、通常攻撃が届くなら
  if (!isCounter) {
    const counterer = getUnit(next, targetId);
    const self = getUnit(next, attackerId);
    const counterId = passiveIdOf(counterer, 'counter');
    const adjacentBefore = manhattan(attacker, target) === 1;
    if (
      counterId &&
      adjacentBefore &&
      isAlive(counterer) &&
      isAlive(self) &&
      manhattan(counterer, self) === 1 &&
      canReach(next.map, counterer.attack, counterer, self)
    ) {
      events.push({ type: 'reaction', unitId: targetId, abilityId: counterId });
      next = resolveWeaponAttack(next, targetId, attackerId, undefined, true, events);
    }
  }
  return next;
}

/**
 * 魔法を指定した時の、経験値の計算に使う記録。相手（味方に使ったなら、その味方）のレベルを残す。
 * - ユニットを狙えば、そのユニット。マスを狙えば、そのマスにいるユニット。
 * - どちらでもなければ、範囲にいるユニット（詠唱者を除く）のうち、回復・守りなら味方、それ以外なら相手を優先して、レベルの高い方。
 * - 誰もいなければ、詠唱者自身のレベル。
 */
function spellReference(state: BattleState, caster: UnitState, spell: SpellDefinition, target: SpellTarget): ActionRecord {
  const supportive = spell.effect === 'heal' || (spell.effect === 'status' && !state.rules.status[spell.inflicts!].harmful);
  const record = (u: UnitState): ActionRecord => ({ targetLevel: u.level, ally: u.team === caster.team });
  if (target.kind === 'unit') return record(getUnit(state, target.unitId));
  const center = targetCenter(state, target)!;
  const onCenter = state.units.find((u) => isAlive(u) && u.x === center.x && u.z === center.z);
  if (onCenter) return record(onCenter);
  const area = spellArea(state.map, spell, center);
  const inArea = state.units.filter(
    (u) => isAlive(u) && u.id !== caster.id && area.some((t) => t.x === u.x && t.z === u.z),
  );
  const preferred = inArea.filter((u) => (u.team === caster.team) === supportive);
  const pool = preferred.length > 0 ? preferred : inArea;
  if (pool.length === 0) return { targetLevel: caster.level, ally: supportive };
  return record(pool.reduce((a, b) => (b.level > a.level ? b : a)));
}

/** 決着していれば、勝敗を記録して手番をなくす */
function endIfDecided(state: BattleState, events: BattleEvent[]): BattleState {
  if (state.winner) return state;
  return decide(state, judgeOutcome(state), events);
}

function decide(state: BattleState, outcome: Outcome | null, events: BattleEvent[]): BattleState {
  if (!outcome) return state;
  events.push({ type: 'battleEnded', winner: outcome.winner, reason: outcome.reason });
  return { ...state, winner: outcome.winner, turn: null };
}

// ---- マップ上のイベント・罠・増援 ----

/** ユニットがマスに入った（移動か突き飛ばし）: そのマスの罠 →「マスに入る」のきっかけのイベント */
function arrive(state: BattleState, unitId: string, events: BattleEvent[]): BattleState {
  let next = state;
  const unit = getUnit(next, unitId);
  const trap = trapAt(next, unit);
  if (trap) {
    const revealed = !trap.revealed;
    if (revealed) {
      next = {
        ...next,
        scenario: {
          ...next.scenario,
          traps: next.scenario.traps.map((t) => (t === trap ? { ...t, revealed: true } : t)),
        },
      };
    }
    next = springTrap(next, unitId, trap.kind, unit, revealed, events);
  }
  const mover = getUnit(next, unitId);
  const at = { x: unit.x, z: unit.z };
  for (let i = 0; i < next.scenario.events.length; i++) {
    if (enterTriggerDue(next.scenario.events[i]!, mover, at)) next = fireEvent(next, i, events);
  }
  return next;
}

/**
 * 罠の効果を与える。unitId のユニットが c にいる（イベントの罠でマスに誰もいなければ null）。
 * 落石はダメージ、ぬかるみは鈍足、脱力の罠はレベルが 1 下がる（1 より下にはならない）。
 */
function springTrap(
  state: BattleState,
  unitId: string | null,
  kind: TrapKind,
  c: Coord,
  revealed: boolean,
  events: BattleEvent[],
): BattleState {
  const base = { type: 'trapTriggered' as const, trap: kind, x: c.x, z: c.z, revealed };
  if (unitId === null) {
    events.push({ ...base, unitId: null, damage: 0, hp: 0 });
    return state;
  }
  const unit = getUnit(state, unitId);
  if (kind === 'rockfall') {
    const raw = Math.floor((unit.stats.maxHp * state.rules.trap.rockfallDamagePercent) / 100);
    const damage = Math.min(unit.hp, damageTaken(state.rules, unit, raw, { ignoreCharging: true }));
    const hp = unit.hp - damage;
    events.push({ ...base, unitId, damage, hp });
    const next = updateUnit(state, unitId, { hp });
    return hp === 0 ? defeat(next, unitId, events) : next;
  }
  if (kind === 'mud') {
    events.push({ ...base, unitId, damage: 0, hp: unit.hp });
    return inflict(state, unitId, 'slow', events);
  }
  const from = currentLevel(unit);
  const drops = from > 1 ? unit.levelDrops + 1 : unit.levelDrops;
  events.push({ ...base, unitId, damage: 0, hp: unit.hp, level: { from, to: unit.level - drops } });
  return updateUnit(state, unitId, { levelDrops: drops });
}

/** イベントを起こす（起きた回数を数え、起きることを順に処理する） */
function fireEvent(state: BattleState, index: number, events: BattleEvent[]): BattleState {
  const event = state.scenario.events[index]!;
  const fired = event.fired + 1;
  let next: BattleState = {
    ...state,
    scenario: { ...state.scenario, events: state.scenario.events.map((e, i) => (i === index ? { ...e, fired } : e)) },
  };
  events.push({ type: 'eventFired', eventId: event.id });
  for (const effect of event.effects) {
    if (effect.kind === 'message') {
      events.push({ type: 'message', messageId: effect.messageId });
    } else if (effect.kind === 'trap') {
      for (const t of effect.tiles) {
        const occupant = unitAt(next, t.x, t.z);
        next = springTrap(next, occupant?.id ?? null, effect.trap, t, false, events);
      }
    } else {
      // 増援: delay 手番後に現れる。繰り返すイベントでは、id に何回目かを付ける
      const suffix = event.times > 1 ? `-${fired}` : '';
      const pending: PendingReinforcement = {
        eventId: event.id,
        appearAfterTurn: next.turnNumber + effect.delay,
        units: effect.units.map((u) => ({ ...u, id: `${u.id}${suffix}` })),
      };
      events.push({
        type: 'reinforcementWarned',
        eventId: event.id,
        appearAfterTurn: pending.appearAfterTurn,
        tiles: pending.units.map((u) => ({ x: u.x, z: u.z })),
      });
      next = { ...next, scenario: { ...next.scenario, reinforcements: [...next.scenario.reinforcements, pending] } };
    }
  }
  return next;
}

/** 状態で決まるきっかけ（HP が一定以下・撃破）のイベントを、起きなくなるまで起こす */
function runStateEvents(state: BattleState, events: BattleEvent[]): BattleState {
  let next = state;
  for (let guard = 0; guard < 100; guard++) {
    const index = next.scenario.events.findIndex((e) => stateTriggerDue(e, next));
    if (index < 0) return next;
    next = fireEvent(next, index, events);
  }
  return next;
}

/**
 * 手番の区切り（state.turnNumber 回の手番が終わった時点）の処理:
 * 手番数の勝敗条件 →「手番」のきっかけのイベント → 予告済みの増援の出現 → 状態で決まるきっかけ → 勝敗。
 */
function turnBoundary(state: BattleState, events: BattleEvent[]): BattleState {
  const finished = state.turnNumber;
  let next = decide(state, judgeTurnOutcome(state.scenario.objectives, finished), events);
  if (next.winner) return next;
  for (let i = 0; i < next.scenario.events.length; i++) {
    if (turnTriggerDue(next.scenario.events[i]!, finished)) next = fireEvent(next, i, events);
  }
  const due = next.scenario.reinforcements.filter((r) => r.appearAfterTurn <= finished);
  if (due.length > 0) {
    next = { ...next, scenario: { ...next.scenario, reinforcements: next.scenario.reinforcements.filter((r) => !due.includes(r)) } };
    for (const r of due) next = spawn(next, r, events);
  }
  next = runStateEvents(next, events);
  return endIfDecided(next, events);
}

/** 増援を出す。予定のマスにユニットがいれば、近くの空いたマスに出す（空いたマスがなければ出さない） */
function spawn(state: BattleState, reinforcement: PendingReinforcement, events: BattleEvent[]): BattleState {
  let next = state;
  for (const template of reinforcement.units) {
    if (next.units.some((u) => u.id === template.id)) throw new Error(`増援の id ${template.id} が重複しています`);
    const tile = spawnTile(next, template);
    if (!tile) continue;
    const unit: UnitState = { ...template, x: tile.x, z: tile.z, ct: 0 };
    next = { ...next, units: [...next.units, unit] };
    events.push({ type: 'unitAppeared', unit });
  }
  return next;
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
  if (spell.effect === 'status') {
    for (const r of preview.results) next = inflict(next, r.unitId, spell.inflicts!, events);
    return next;
  }
  for (const r of preview.results) next = updateUnit(next, r.unitId, { hp: r.hp });
  for (const r of preview.results) {
    const u = getUnit(next, r.unitId);
    if (spell.effect !== 'damage') continue;
    // 魔力の殻で軽くなった時は、その名前を出す
    const shell = spell.kind === 'magic' ? passiveIdOf(u, 'magicShell') : undefined;
    if (shell) events.push({ type: 'reaction', unitId: u.id, abilityId: shell });
    if (r.hp === 0) next = defeat(next, r.unitId, events);
    else if (r.amount > 0) next = meditate(next, r.unitId, events);
  }
  return next;
}

/** 時計を進め、途中で発動する魔法を発動しながら、次の手番を始める。途中で決着したらそこで止める */
function beginNextTurn(state: BattleState, events: BattleEvent[]): BattleState {
  let current = turnBoundary(state, events);
  if (current.winner) return current;
  for (;;) {
    const { units, entry } = nextTimelineEntry(current.units, current.rules);
    current = { ...current, units };
    if (entry.kind === 'spell') {
      current = endIfDecided(runStateEvents(resolveCharge(current, entry.casterId, events), events), events);
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
