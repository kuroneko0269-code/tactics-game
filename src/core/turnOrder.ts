/**
 * 行動順（CT 方式）と、詠唱中の魔法の発動の順番。
 *
 * 全ユニットの CT（チャージタイム）に素早さを足し続け、しきい値に達したユニットが行動する。
 * 詠唱中の魔法も同じ時計で進み、毎回「詠唱の速さ」（「早口」で速くなる）だけ溜まって、しきい値に達した時点で発動する。
 * - 同じ時点で魔法の発動とユニットの手番が重なったら、魔法の発動が先。
 * - 魔法どうしが重なったら、進み具合の大きい方 → 配置順（units の並び）の早い方。
 * - 手番どうしが重なったら、CT の大きい方 → 素早さの高い方 → 配置順の早い方。
 * - 戦闘不能のユニット（フェーズ2-5）も CT が溜まり、手番が来るはずだった時に「カウントが減る」番が来る
 *   （行動はできない。手番と同じ決まりで順番が決まる）。退場したユニットは数えない。
 */
import type { BattleRules, BattleState, UnitState } from './battleTypes';
import { castSpeedOf } from './effects';
import { spellOf } from './magic';
import { isAlive, isKnockedOut } from './movement';

/** 行動順の1つぶん。ユニットの手番か、魔法の発動か、戦闘不能のユニットのカウントが減る番 */
export type TimelineEntry =
  | { readonly kind: 'turn'; readonly unitId: string }
  | { readonly kind: 'spell'; readonly casterId: string; readonly spellId: string }
  | { readonly kind: 'knockout'; readonly unitId: string };

/** 行動順の予測に出るもの（ユニットの手番と魔法の発動。カウントが減る番は含まない） */
export type PredictedEntry = Exclude<TimelineEntry, { readonly kind: 'knockout' }>;

/**
 * 時計を進めて、次に起きること（魔法の発動か、ユニットの手番）を決める。戦闘不能のユニットは数えない。
 * 返す units は時計を進めた後のもの（発動する魔法も、まだ詠唱中のまま残っている）。
 */
export function nextTimelineEntry(
  units: readonly UnitState[],
  rules: BattleRules,
): { units: UnitState[]; entry: TimelineEntry } {
  let current = [...units];
  if (!current.some(isAlive)) throw new Error('行動できるユニットがいません');
  for (;;) {
    const charge = pickReadyCharge(current, rules);
    if (charge) {
      return { units: current, entry: { kind: 'spell', casterId: charge.id, spellId: charge.charging!.spellId } };
    }
    const ready = pickReady(current, rules);
    if (ready) {
      const entry: TimelineEntry = isAlive(ready) ? { kind: 'turn', unitId: ready.id } : { kind: 'knockout', unitId: ready.id };
      return { units: current, entry };
    }
    current = current.map((u) => {
      if (isKnockedOut(u)) return { ...u, ct: u.ct + u.stats.speed };
      if (!isAlive(u)) return u;
      const charging = u.charging
        ? { ...u.charging, progress: u.charging.progress + castSpeedOf(u, spellOf(u, u.charging.spellId)) }
        : null;
      return { ...u, ct: u.ct + u.stats.speed, charging };
    });
  }
}

function pickReadyCharge(units: readonly UnitState[], rules: BattleRules): UnitState | undefined {
  let best: UnitState | undefined;
  for (const u of units) {
    if (!isAlive(u) || !u.charging || u.charging.progress < rules.ctThreshold) continue;
    if (!best || u.charging.progress > best.charging!.progress) best = u;
  }
  return best;
}

function pickReady(units: readonly UnitState[], rules: BattleRules): UnitState | undefined {
  let best: UnitState | undefined;
  for (const u of units) {
    if ((!isAlive(u) && !isKnockedOut(u)) || u.ct < rules.ctThreshold) continue;
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
 * この先の行動順の予測（先頭は今の手番のユニット）。
 * - 今の手番のユニットは、ここまでにした移動・行動から決まる CT に戻るものとする。
 * - pendingSpellId を渡すと、今の手番のユニットがその魔法を指定した（行動した）ものとして数える
 *   （指定する前に「発動が何番目になるか」を見せるため）。
 * - それ以降の手番は、どのユニットも移動と行動の両方をするものとして数える。
 *   ただし詠唱中のユニットは、待機して詠唱を続けるものとして数える。
 * - 誰かが倒れる、魔法が不発になる、といったことは考えない。戦闘不能のユニットのカウントが減る番は、結果に含めない。
 */
export function predictTimeline(
  state: BattleState,
  count: number,
  options: { pendingSpellId?: string } = {},
): PredictedEntry[] {
  if (!state.turn || count <= 0) return [];
  const { rules, turn } = state;
  const result: PredictedEntry[] = [{ kind: 'turn', unitId: turn.unitId }];
  const pending = options.pendingSpellId;
  let units = state.units.map((u) => {
    if (u.id !== turn.unitId) return u;
    const ct = ctAfterTurn(rules, turn.moved, turn.acted || pending !== undefined);
    if (pending === undefined) return { ...u, ct };
    return { ...u, ct, charging: { spellId: pending, target: { kind: 'unit' as const, unitId: u.id }, progress: 0 } };
  });
  while (result.length < count) {
    const next = nextTimelineEntry(units, rules);
    const entry = next.entry;
    if (entry.kind === 'knockout') {
      units = next.units.map((u) => (u.id === entry.unitId ? { ...u, ct: rules.knockout.ctAfterTick } : u));
      continue;
    }
    result.push(entry);
    units = next.units.map((u) => {
      if (entry.kind === 'spell') return u.id === entry.casterId ? { ...u, charging: null } : u;
      if (u.id !== entry.unitId) return u;
      return { ...u, ct: u.charging ? rules.ctAfterWait : rules.ctAfterMoveAndAct };
    });
  }
  return result;
}

/** この先の手番の順番（ユニット id の列。魔法の発動は含まない） */
export function predictTurnOrder(state: BattleState, count: number): string[] {
  const ids: string[] = [];
  // 魔法の発動の分だけ多めに予測して、手番だけを取り出す
  for (const e of predictTimeline(state, count * 2)) {
    if (e.kind === 'turn') ids.push(e.unitId);
    if (ids.length >= count) break;
  }
  return ids;
}
