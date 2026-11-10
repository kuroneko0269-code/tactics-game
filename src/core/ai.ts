/**
 * コンピューターが操作するユニットの思考（敵 AI）。
 *
 * - 詠唱中に手番が来たら、待機して詠唱を続ける。
 * - 癒し手（回復魔法を持つ）: HP が一定の割合以下の味方がいれば回復する。
 * - 魔術師（攻撃魔法を持つ）: 巻き込む敵の数 − 巻き込む味方の数 が最も大きい場所に撃つ（1 以上の時だけ）。
 *   相手の攻撃が届かない位置から撃つことを優先する。同じなら、詠唱中の相手や前の手番で動かなかった相手を多く巻き込む場所を選ぶ。
 * - 通常攻撃できる相手がいれば攻撃する。詠唱中の相手を最優先し、次に 背面 → 側面 → 正面、
 *   同じなら高い位置、それも同じなら反撃を受けにくい位置（届く相手が少ない）、次に移動の少ない位置、
 *   さらに同じなら HP の少ない相手を選ぶ。
 * - 攻撃も魔法もできない手番は、最も近い相手に近づくが、敵の攻撃が届く位置へ単独では踏み込まず、
 *   届かないぎりぎりの位置で止まる（味方と足並みを揃えるため）。近くに味方が十分いれば踏み込む（supportRange）。
 *   ただし、どちらの軍も一定の手番数のあいだ攻撃や魔法を行っていなければ、前進に切り替える（にらみ合いを防ぐ）。
 * - 癒し手は、攻撃が届かない位置を保つ（にらみ合いの時も前に出ない。ただし癒し手しか残っていなければ前進する）。
 * - 攻撃や魔法の後には移動しない。最後は、最も近い相手の方を向いて手番を終える。
 *
 * 味方側のユニットにも同じ思考を使える（テストやバランス確認で AI 同士を戦わせるため）。
 */
import { activeUnit, applyAction } from './battle';
import type {
  ActionResult,
  BattleAction,
  BattleEvent,
  BattleState,
  SpellTarget,
  Team,
  UnitState,
} from './battleTypes';
import { attackableTargets, attackRangeTiles, previewAttack } from './combat';
import { DIRECTION_VECTORS, DIRECTIONS, directionToward, manhattan, type Coord, type Direction, type RelativeSide } from './geometry';
import { chargeArea, hasMpFor, previewSpellAt, spellRangeTiles } from './magic';
import { getTile } from './map';
import { canStep, isAlive, reachableTiles, unitAt } from './movement';

/** AI の設定（数値は src/data に置く） */
export interface AiConfig {
  /** どちらの軍もこの手番数のあいだ攻撃や魔法を行わなければ、前進に切り替える */
  readonly advanceAfterIdleTurns: number;
  /** 癒し手は、HP がこの割合（%）以下の味方がいれば回復する */
  readonly healBelowPercent: number;
  /**
   * 攻撃できない手番に、相手の攻撃が届くマスへ進んでよいかの目安。
   * そのマスから range 歩以内にいる味方（癒し手を除く）の数が、そのマスに攻撃を届かせられる相手の数以上なら、
   * 単独ではないとみなして進む。
   */
  readonly supportRange: number;
  /**
   * 動かし方。通常は 'normal'。バランス確認用に、ほかの動かし方も選べる。
   * - advance: 攻撃できない時は、敵の攻撃が届くかどうかを気にせず近づく（改良前の動き）
   * - hold: 攻撃できない時は、その場から動かない
   */
  readonly stance?: 'normal' | 'advance' | 'hold';
}

/** 陣営ごとの AI の設定 */
export type AiConfigs = Readonly<Record<Team, AiConfig>>;

const SIDE_RANK: Readonly<Record<RelativeSide, number>> = { back: 0, side: 1, front: 2 };

interface Position extends Coord {
  /** 移動の歩数（今の位置なら 0） */
  readonly steps: number;
}

export interface AttackPlan {
  readonly position: Coord;
  readonly targetId: string;
}

export interface SpellPlan {
  readonly position: Coord;
  readonly spellId: string;
  readonly target: SpellTarget;
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

const keyOf = (state: BattleState, c: Coord) => c.z * state.map.width + c.x;

/**
 * 次の手番で、team の相手が通常攻撃を届かせられるマスと、届かせられる相手の数。
 * 相手が今の位置から移動して攻撃できる範囲を数える（魔法は数えない）。
 */
export function threatMap(state: BattleState, team: Team): Map<number, number> {
  const counts = new Map<number, number>();
  for (const o of state.units) {
    if (!isAlive(o) || o.team === team) continue;
    const covered = new Set<number>();
    const positions: Coord[] = [{ x: o.x, z: o.z }, ...reachableTiles(state, o)];
    for (const p of positions) for (const t of attackRangeTiles(state, o, p)) covered.add(keyOf(state, t));
    for (const k of covered) counts.set(k, (counts.get(k) ?? 0) + 1);
  }
  return counts;
}

/** 攻撃する位置と相手を選ぶ。攻撃できる相手がいなければ undefined。safeOnly なら攻撃の届かない位置からだけ */
export function chooseAttack(
  state: BattleState,
  unit: UnitState,
  canMove: boolean,
  safeOnly = false,
): AttackPlan | undefined {
  const threat = threatMap(state, unit.team);
  let best: { plan: AttackPlan; score: number[] } | undefined;
  for (const pos of candidatePositions(state, unit, canMove)) {
    const danger = threat.get(keyOf(state, pos)) ?? 0;
    if (safeOnly && danger > 0) continue;
    for (const target of attackableTargets(state, unit, pos)) {
      const preview = previewAttack(state, unit, target, pos);
      // 小さいほど良い。先頭の項目から順に比べる
      const score = [
        target.charging ? 0 : 1,
        SIDE_RANK[preview.side],
        -heightOf(state, pos),
        danger,
        pos.steps,
        target.hp,
        tieBreak(state, pos.x, pos.z, target.x, target.z),
      ];
      if (!best || compareScores(score, best.score) < 0) {
        best = { plan: { position: { x: pos.x, z: pos.z }, targetId: target.id }, score };
      }
    }
  }
  return best?.plan;
}

/** 中心のマスにいるユニットを狙うか、マスを狙うか。狙いたい陣営のユニットがいれば、そのユニットを追いかける */
function targetFor(state: BattleState, center: Coord, followTeam: Team): SpellTarget {
  const u = unitAt(state, center.x, center.z);
  if (u && u.team === followTeam) return { kind: 'unit', unitId: u.id };
  return { kind: 'tile', x: center.x, z: center.z };
}

/**
 * 攻撃魔法を撃つ位置・魔法・狙い先を選ぶ。
 * 巻き込む敵の数 − 味方の数（詠唱者自身を含む）が 1 以上の場所の中から選ぶ。
 * 相手の攻撃が届かない位置を優先し、その中で「巻き込む敵の数 − 味方の数」が最も大きい場所を選ぶ。
 * 相手の攻撃が届く位置からは、差し引き 2 以上の時だけ撃つ。
 * 同じなら、詠唱中や前の手番で動かなかった敵を多く巻き込む → （1体だけを狙う時は）詠唱の速い魔法
 * → 中心に敵がいる（その敵を追いかけて狙える）→ 敵に与えるダメージの合計が大きい → 消費 MP が少ない
 * → 移動の少ない位置 の順に選ぶ。
 */
export function chooseDamageSpell(state: BattleState, unit: UnitState, canMove: boolean): SpellPlan | undefined {
  const spells = unit.spells.filter((s) => s.effect === 'damage' && hasMpFor(unit, s));
  if (spells.length === 0) return undefined;
  const opponent: Team = unit.team === 'player' ? 'enemy' : 'player';
  const threat = threatMap(state, unit.team);
  let best: { plan: SpellPlan; score: number[] } | undefined;
  for (const pos of candidatePositions(state, unit, canMove)) {
    const self = { ...unit, x: pos.x, z: pos.z };
    const danger = (threat.get(keyOf(state, pos)) ?? 0) > 0 ? 1 : 0;
    for (const spell of spells) {
      for (const center of spellRangeTiles(state.map, spell, pos)) {
        const preview = previewSpellAt(state, unit, spell, center, self);
        let net = 0;
        let priority = 0;
        let damage = 0;
        let enemies = 0;
        for (const r of preview.results) {
          const u = r.unitId === unit.id ? self : state.units.find((x) => x.id === r.unitId)!;
          if (u.team === unit.team) {
            net--;
            damage -= r.amount;
          } else {
            net++;
            enemies++;
            damage += r.amount;
            if (u.charging || !u.movedLastTurn) priority++;
          }
        }
        if (enemies === 0 || net < 1) continue;
        // 相手の攻撃が届く位置からは、2体以上を差し引きで巻き込める時だけ撃つ（魔術師は打たれ弱いため）
        if (danger && net < 2) continue;
        // 1体だけを狙うなら、詠唱の速い魔法の方が逃げられにくい
        const speed = net === 1 ? -spell.castSpeed : 0;
        // 中心に敵がいれば、その敵を追いかける狙い方にできる（発動までに逃げられにくい）
        const target = targetFor(state, center, opponent);
        const follows = target.kind === 'unit' ? 0 : 1;
        const score = [danger, -net, -priority, speed, follows, -damage, spell.mpCost, pos.steps, tieBreak(state, pos.x, pos.z, center.x, center.z)];
        if (!best || compareScores(score, best.score) < 0) {
          best = { plan: { position: { x: pos.x, z: pos.z }, spellId: spell.id, target }, score };
        }
      }
    }
  }
  return best?.plan;
}

/** HP が回復の目安以下か */
function isHurt(unit: UnitState, belowPercent: number): boolean {
  return isAlive(unit) && unit.hp * 100 <= unit.stats.maxHp * belowPercent;
}

/**
 * 回復魔法を撃つ位置・魔法・狙い先を選ぶ。HP が目安以下の味方を1体以上回復できる時だけ。
 * 回復できる「HP が目安以下の味方」の数が多い場所 → 回復してしまう敵が少ない → 攻撃の届かない位置
 * → 中心に味方がいる（その味方を追いかけて狙える）→ 味方の回復量の合計が大きい → 移動の少ない位置 の順に選ぶ。
 * 味方の回復魔法の詠唱がすでに届く予定の味方は、数えない（重ねて回復しないため）。
 */
export function chooseHealSpell(
  state: BattleState,
  unit: UnitState,
  canMove: boolean,
  config: AiConfig,
): SpellPlan | undefined {
  const spells = unit.spells.filter((s) => s.effect === 'heal' && hasMpFor(unit, s));
  if (spells.length === 0) return undefined;
  const covered = new Set<string>();
  for (const caster of state.units) {
    if (caster.team !== unit.team || !caster.charging) continue;
    const spell = caster.spells.find((s) => s.id === caster.charging!.spellId);
    if (spell?.effect !== 'heal') continue;
    const area = chargeArea(state, caster);
    for (const u of state.units) if (area.some((t) => t.x === u.x && t.z === u.z)) covered.add(u.id);
  }
  if (!state.units.some((u) => u.team === unit.team && isHurt(u, config.healBelowPercent) && !covered.has(u.id))) {
    return undefined;
  }
  const threat = threatMap(state, unit.team);
  let best: { plan: SpellPlan; score: number[] } | undefined;
  for (const pos of candidatePositions(state, unit, canMove)) {
    const self = { ...unit, x: pos.x, z: pos.z };
    const danger = (threat.get(keyOf(state, pos)) ?? 0) > 0 ? 1 : 0;
    for (const spell of spells) {
      for (const center of spellRangeTiles(state.map, spell, pos)) {
        const preview = previewSpellAt(state, unit, spell, center, self);
        let hurt = 0;
        let enemies = 0;
        let healed = 0;
        for (const r of preview.results) {
          const u = r.unitId === unit.id ? self : state.units.find((x) => x.id === r.unitId)!;
          if (u.team !== unit.team) {
            enemies++;
          } else {
            healed += r.amount;
            if (isHurt(u, config.healBelowPercent) && !covered.has(u.id)) hurt++;
          }
        }
        if (hurt === 0) continue;
        const target = targetFor(state, center, unit.team);
        const follows = target.kind === 'unit' ? 0 : 1;
        const score = [-hurt, enemies, danger, follows, -healed, pos.steps, tieBreak(state, pos.x, pos.z, center.x, center.z)];
        if (!best || compareScores(score, best.score) < 0) {
          best = { plan: { position: { x: pos.x, z: pos.z }, spellId: spell.id, target }, score };
        }
      }
    }
  }
  return best?.plan;
}

/** にらみ合い（どちらの軍もしばらく攻撃や魔法をしていない）か */
export function isStalemate(state: BattleState, config: AiConfig): boolean {
  return state.turnNumber - state.lastAggressionTurn >= config.advanceAfterIdleTurns;
}

const isHealer = (unit: UnitState) => unit.spells.some((s) => s.effect === 'heal');

/** unit の陣営で、生きているのが癒し手だけか */
const onlyHealersLeft = (state: BattleState, unit: UnitState) =>
  !state.units.some((u) => u.team === unit.team && isAlive(u) && !isHealer(u));

/** pos から range 歩以内にいる、unit 以外の味方（癒し手を除く）の数 */
function supportersNear(state: BattleState, unit: UnitState, pos: Coord, range: number): number {
  return state.units.filter(
    (u) => u.id !== unit.id && u.team === unit.team && isAlive(u) && !isHealer(u) && manhattan(u, pos) <= range,
  ).length;
}

/**
 * 攻撃できない時に、動く先を選ぶ。動かない方が良ければ undefined。
 * 最も近い相手に、崖を避けて実際に歩ける道のりで近づく。ただし前進に切り替える時（にらみ合いなど）以外は、
 * 相手の攻撃が届くマスには単独では入らない（今いるマスが届く範囲なら、届かないマスへ下がる）。
 * 近くの味方の数が、そのマスに届く相手の数以上なら、単独ではないとみなす（癒し手は常に入らない）。
 * すでに届く範囲にいる時は、今より届く相手が増えないマスへは進んでよい（下がって手番を無駄にしないため）。
 */
export function chooseApproach(state: BattleState, unit: UnitState, config: AiConfig): Coord | undefined {
  const stance = config.stance ?? 'normal';
  if (stance === 'hold') return undefined;
  const target = nearestOpponent(state, unit, unit);
  if (!target) return undefined;
  const distances = walkingDistances(state, target, unit.stats.jump);
  const distanceTo = (c: Coord) => distances.get(keyOf(state, c)) ?? 1000 + manhattan(c, target);
  // 癒し手は前に出ない。ただし癒し手しか残っていなければ、にらみ合いの時に前進する
  const healer = isHealer(unit);
  const advance = stance === 'advance' || ((!healer || onlyHealersLeft(state, unit)) && isStalemate(state, config));
  const threat = advance ? undefined : threatMap(state, unit.team);
  const hereReach = threat?.get(keyOf(state, unit)) ?? 0;

  let best: { pos: Position; score: number[] } | undefined;
  for (const pos of candidatePositions(state, unit, true)) {
    // 届く相手の数が、近くにいる味方（癒し手を除く）の数以下なら「単独で踏み込む」ことにはならないとみなす
    const reach = threat?.get(keyOf(state, pos)) ?? 0;
    let danger = reach > 0 && (healer || reach > supportersNear(state, unit, pos, config.supportRange)) ? reach : 0;
    // すでに届く範囲にいるなら、今より届く相手が増えないマスへは進んでよい（下がって手番を無駄にしないため）
    if (!healer && hereReach > 0 && reach <= hereReach) danger = 0;
    const score = [danger, distanceTo(pos), -heightOf(state, pos), pos.steps, tieBreak(state, pos.x, pos.z)];
    if (!best || compareScores(score, best.score) < 0) best = { pos, score };
  }
  if (!best || best.pos.steps === 0) return undefined;
  return { x: best.pos.x, z: best.pos.z };
}

type Plan =
  | { readonly kind: 'attack'; readonly position: Coord; readonly targetId: string }
  | { readonly kind: 'cast'; readonly position: Coord; readonly spellId: string; readonly target: SpellTarget };

/** この手番の行動（攻撃か魔法）と、そのための位置を選ぶ */
function choosePlan(state: BattleState, unit: UnitState, canMove: boolean, config: AiConfig): Plan | undefined {
  if (isHealer(unit)) {
    const heal = chooseHealSpell(state, unit, canMove, config);
    if (heal) return { kind: 'cast', ...heal };
    // 癒し手は、相手の攻撃が届かない位置からだけ殴る（癒し手しか残っていなければ、どこからでも）
    const attack = chooseAttack(state, unit, canMove, !onlyHealersLeft(state, unit));
    return attack && { kind: 'attack', ...attack };
  }
  const spell = chooseDamageSpell(state, unit, canMove);
  if (spell) return { kind: 'cast', ...spell };
  const attack = chooseAttack(state, unit, canMove);
  return attack && { kind: 'attack', ...attack };
}

/** 手番のユニットが次にとる行動を1つ決める。手番を終えるまで繰り返し呼ぶ */
export function decideNextAction(state: BattleState, config: AiConfig): BattleAction {
  const unit = activeUnit(state);
  const turn = state.turn;
  if (!unit || !turn) throw new Error('手番のユニットがいません');
  const endTurn: BattleAction = { type: 'endTurn', facing: defaultFacing(state, unit) };

  // 詠唱中なら、待機して詠唱を続ける
  if (turn.chargingAtStart && unit.charging) return endTurn;

  if (!turn.acted) {
    const plan = choosePlan(state, unit, !turn.moved, config);
    if (plan) {
      if (plan.position.x !== unit.x || plan.position.z !== unit.z) {
        return { type: 'move', x: plan.position.x, z: plan.position.z };
      }
      if (plan.kind === 'attack') return { type: 'attack', targetId: plan.targetId };
      return { type: 'cast', spellId: plan.spellId, target: plan.target };
    }
    // 攻撃や魔法の後には移動しない
    if (!turn.moved) {
      const dest = chooseApproach(state, unit, config);
      if (dest) return { type: 'move', x: dest.x, z: dest.z };
    }
  }
  return endTurn;
}

/**
 * 手番の終わりの向きの初期値: 最も近い敵の方向（縦横の歩数で数え、同じなら HP の少ない敵）。
 * 敵がいなければ今の向き。プレイヤーの向き選びの初期値と、AI の向きの両方に使う。
 */
export function defaultFacing(state: BattleState, unit: UnitState): Direction {
  const nearest = nearestOpponent(state, unit, unit);
  return nearest ? directionToward(unit, nearest, unit.facing) : unit.facing;
}

/** 手番が終わるまで AI の行動を適用し続ける */
export function playAiTurn(state: BattleState, config: AiConfig): ActionResult & { actions: BattleAction[] } {
  const startTurn = state.turnNumber;
  const events: BattleEvent[] = [];
  const actions: BattleAction[] = [];
  let current = state;
  while (current.turn && current.turnNumber === startTurn) {
    const action = decideNextAction(current, config);
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
export function runAutoBattle(
  state: BattleState,
  maxTurns: number,
  configs: AiConfigs,
): { state: BattleState; actions: BattleAction[]; events: BattleEvent[] } {
  let current = state;
  const actions: BattleAction[] = [];
  const events: BattleEvent[] = [];
  while (current.turn && current.turnNumber <= maxTurns) {
    const unit = activeUnit(current)!;
    const result = playAiTurn(current, configs[unit.team]);
    actions.push(...result.actions);
    events.push(...result.events);
    current = result.state;
  }
  return { state: current, actions, events };
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
  const key = (c: Coord) => keyOf(state, c);
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

/**
 * 点数が同じ候補どうしの順番を決めるための数。状態（乱数の状態と手番の数）と候補から決まる整数で、
 * 乱数生成器は進めない（戦闘の結果には影響せず、同じ状態なら必ず同じ値になる）。
 * これがないと、マスを調べる順番（北から順など）のせいで、陣営によって選び方が偏る。
 */
function tieBreak(state: BattleState, ...values: number[]): number {
  let h = (state.rngState ^ Math.imul(state.turnNumber, 0x9e3779b1)) >>> 0;
  for (const v of values) {
    h = Math.imul(h ^ (v + 0x7f4a7c15), 0x85ebca6b) >>> 0;
    h ^= h >>> 13;
  }
  return h >>> 8;
}

function compareScores(a: readonly number[], b: readonly number[]): number {
  for (let i = 0; i < a.length; i++) {
    const d = a[i]! - b[i]!;
    if (d !== 0) return d;
  }
  return 0;
}
