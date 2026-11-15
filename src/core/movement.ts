/**
 * 移動できる範囲の計算。
 *
 * - 移動力の歩数まで、上下左右の隣のマスへ進める。
 * - 隣のマスとの高さの差がジャンプ力以下なら進める（上りも下りも同じ）。
 * - 味方のいるマスは通過できるが、止まれない。
 * - 敵のいるマスは通過もできない。
 * - 戦闘不能のユニット（敵味方とも）がいるマスは、通過できるが止まれない（フェーズ2-5）。退場したユニットは邪魔にならない。
 * - 鈍足が付いていると、移動力が下がる（effects.ts）。
 */
import type { BattleState, UnitState } from './battleTypes';
import { DIRECTION_VECTORS, DIRECTIONS, manhattan, type Coord } from './geometry';
import { effectiveMove } from './effects';
import { getTile } from './map';

export interface ReachableTile extends Coord {
  /** 出発地点からこのマスまでの道順（出発地点を含む） */
  readonly path: readonly Coord[];
}

/** 立っている（行動できる）か */
export function isAlive(unit: UnitState): boolean {
  return unit.hp > 0;
}

/** 戦闘不能で、まだマスに残っている（退場していない。蘇生できる）か */
export function isKnockedOut(unit: UnitState): boolean {
  return unit.hp <= 0 && !unit.retired;
}

/** マップの上にいるか（立っているか、戦闘不能でマスに残っている） */
export function isOnMap(unit: UnitState): boolean {
  return !unit.retired;
}

/** マスに立っているユニット（戦闘不能のユニットは含まない） */
export function unitAt(state: BattleState, x: number, z: number): UnitState | undefined {
  return state.units.find((u) => isAlive(u) && u.x === x && u.z === z);
}

/** マスにいるユニット（立っているか、戦闘不能でマスに残っている）。そのマスには止まれない */
export function occupantAt(state: BattleState, x: number, z: number): UnitState | undefined {
  return unitAt(state, x, z) ?? state.units.find((u) => isKnockedOut(u) && u.x === x && u.z === z);
}

/** 隣り合う2マスの間を、ジャンプ力 jump のユニットが行き来できるか（地形の高さだけで判断） */
export function canStep(state: BattleState, from: Coord, to: Coord, jump: number): boolean {
  const a = getTile(state.map, from.x, from.z);
  const b = getTile(state.map, to.x, to.z);
  if (!a || !b) return false;
  return Math.abs(a.height - b.height) <= jump;
}

/**
 * unit が移動で止まれるマスの一覧（今いるマスは含まない）。
 * 道順は最短歩数のもの。歩数が同じ道が複数あるときは、北・東・南・西の順に調べて先に見つかった方。
 */
export function reachableTiles(state: BattleState, unit: UnitState): ReachableTile[] {
  const { width } = state.map;
  const key = (c: Coord) => c.z * width + c.x;
  const start: Coord = { x: unit.x, z: unit.z };
  const paths = new Map<number, Coord[]>([[key(start), [start]]]);
  let frontier: Coord[] = [start];

  const move = effectiveMove(unit, state.rules);
  // 瞬間移動（フェーズ2-6）: 段差とほかのユニットを無視して、移動力の歩数以内の空いたマスへ
  if (unit.passives.some((p) => p.effect.kind === 'teleport')) {
    return state.map.tiles
      .filter((t) => manhattan(start, t) >= 1 && manhattan(start, t) <= move && !occupantAt(state, t.x, t.z))
      .map((t) => ({ x: t.x, z: t.z, path: [start, { x: t.x, z: t.z }] }));
  }
  for (let step = 0; step < move; step++) {
    const next: Coord[] = [];
    for (const from of frontier) {
      for (const dir of DIRECTIONS) {
        const v = DIRECTION_VECTORS[dir];
        const to: Coord = { x: from.x + v.x, z: from.z + v.z };
        if (paths.has(key(to))) continue;
        if (!canStep(state, from, to, unit.stats.jump)) continue;
        const occupant = unitAt(state, to.x, to.z);
        if (occupant && occupant.team !== unit.team) continue;
        paths.set(key(to), [...paths.get(key(from))!, to]);
        next.push(to);
      }
    }
    frontier = next;
  }

  const result: ReachableTile[] = [];
  for (const path of paths.values()) {
    const end = path[path.length - 1]!;
    if (path.length === 1) continue;
    if (occupantAt(state, end.x, end.z)) continue;
    result.push({ x: end.x, z: end.z, path });
  }
  return result;
}
