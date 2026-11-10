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
 * 勝敗は全滅で決まる（敵が全滅で味方の勝ち、味方が全滅で敵の勝ち）。
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
  PassiveDefinition,
  SpellDefinition,
  SpellTarget,
  StatusId,
  StrikeDefinition,
  Team,
  TurnState,
  UnitCommand,
  UnitState,
  UnitStats,
} from './battleTypes';
import { attackableTargets, canReach, knockbackOutcome, previewAttack, strikeOf, weaponFits } from './combat';
import { addStatus, applyPassiveStats, isSilencedFor, mpCostOf, passiveEffect, passiveIdOf, tickStatuses } from './effects';
import { DIRECTIONS, directionToward, manhattan } from './geometry';
import { hasMpFor, isValidSpellTarget, previewSpellAt, spellArea, spellOf, targetCenter } from './magic';
import { statsWithGrowth, ZERO_GROWTH } from './progression';
import { createMap, getTile } from './map';
import { isAlive, reachableTiles } from './movement';
import { createRng, restoreRng } from './rng';
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
  const units: UnitState[] = setup.units.map((p) => {
    const job = jobs.find((j) => j.id === p.jobId);
    if (!job) throw new Error(`ユニット ${p.id}: ジョブ ${p.jobId} が見つかりません`);
    if (ids.has(p.id)) throw new Error(`ユニット id ${p.id} が重複しています`);
    ids.add(p.id);
    if (!getTile(map, p.x, p.z)) throw new Error(`ユニット ${p.id}: 配置 (${p.x}, ${p.z}) がマップ外です`);
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
      const strike = action.abilityId === undefined ? undefined : strikeOf(unit, action.abilityId);
      let next = updateUnit(state, unit.id, { actions: [...unit.actions, { targetLevel: target.level, ally: false }] });
      next = resolveWeaponAttack(next, unit.id, target.id, strike, false, events);
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
