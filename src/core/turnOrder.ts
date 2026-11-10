/**
 * 行動順（CT 方式）。
 *
 * 全ユニットの CT（チャージタイム）に素早さを足し続け、しきい値に達したユニットが行動する。
 * 同時に達したら、CT の大きい方 → 素早さの高い方 → 配置順（units の並び）の早い方を先にする。
 */
import type { BattleRules, BattleState, UnitState } from './battleTypes';
import { isAlive } from './movement';

/** CT を進めて、次に行動するユニットを決める。戦闘不能のユニットは数えない */
export function advanceToNextTurn(
  units: readonly UnitState[],
  rules: BattleRules,
): { units: UnitState[]; unitId: string } {
  let current = [...units];
  if (!current.some(isAlive)) throw new Error('行動できるユニットがいません');
  for (;;) {
    const ready = pickReady(current, rules);
    if (ready) return { units: current, unitId: ready.id };
    current = current.map((u) => (isAlive(u) ? { ...u, ct: u.ct + u.stats.speed } : u));
  }
}

function pickReady(units: readonly UnitState[], rules: BattleRules): UnitState | undefined {
  let best: UnitState | undefined;
  for (const u of units) {
    if (!isAlive(u) || u.ct < rules.ctThreshold) continue;
    if (!best || u.ct > best.ct || (u.ct === best.ct && u.stats.speed > best.stats.speed)) best = u;
  }
  return best;
}

/** 手番の後の CT */
export function ctAfterTurn(rules: BattleRules, moved: boolean, acted: boolean): number {
  if (moved && acted) return rules.ctAfterMoveAndAct;
  if (moved || acted) return rules.ctAfterMoveOrAct;
  return rules.ctAfterWait;
}

/**
 * この先の行動順の予測（ユニット id の列。先頭は今の手番のユニット）。
 * 今の手番のユニットは、ここまでにした移動・行動から決まる CT に戻るものとし、
 * それ以降の手番は、どのユニットも移動と行動の両方をするものとして数える。
 */
export function predictTurnOrder(state: BattleState, count: number): string[] {
  if (!state.turn || count <= 0) return [];
  const { rules, turn } = state;
  const result = [turn.unitId];
  let units = state.units.map((u) =>
    u.id === turn.unitId ? { ...u, ct: ctAfterTurn(rules, turn.moved, turn.acted) } : u,
  );
  while (result.length < count) {
    const next = advanceToNextTurn(units, rules);
    result.push(next.unitId);
    units = next.units.map((u) => (u.id === next.unitId ? { ...u, ct: rules.ctAfterMoveAndAct } : u));
  }
  return result;
}
