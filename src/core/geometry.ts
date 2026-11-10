/**
 * マス目上の位置・向きの計算。
 * 座標は x（東が +）と z（南が +）。向きは東西南北の4方向で持つ。
 * プレイヤーへの表示では方角名を使わず、「正面・側面・背面」と矢印で示す（その変換は ui の役割）。
 */

export interface Coord {
  readonly x: number;
  readonly z: number;
}

export type Direction = 'north' | 'east' | 'south' | 'west';

export const DIRECTIONS: readonly Direction[] = ['north', 'east', 'south', 'west'];

/** 各向きに1マス進んだときの座標の変化 */
export const DIRECTION_VECTORS: Readonly<Record<Direction, Coord>> = {
  north: { x: 0, z: -1 },
  east: { x: 1, z: 0 },
  south: { x: 0, z: 1 },
  west: { x: -1, z: 0 },
};

/** 攻撃対象から見て、攻撃してきた側がどちらにいるか */
export type RelativeSide = 'front' | 'side' | 'back';

/** 2マスの間の歩数（斜めは数えない、縦と横の差の合計） */
export function manhattan(a: Coord, b: Coord): number {
  return Math.abs(a.x - b.x) + Math.abs(a.z - b.z);
}

export function sameCoord(a: Coord, b: Coord): boolean {
  return a.x === b.x && a.z === b.z;
}

/**
 * from から to を向くときの向き。差の大きい軸を優先し、同じなら東西を選ぶ。
 * 同じマスなら fallback を返す。
 */
export function directionToward(from: Coord, to: Coord, fallback: Direction): Direction {
  const dx = to.x - from.x;
  const dz = to.z - from.z;
  if (dx === 0 && dz === 0) return fallback;
  if (Math.abs(dx) >= Math.abs(dz)) return dx > 0 ? 'east' : 'west';
  return dz > 0 ? 'south' : 'north';
}

/**
 * target が facing を向いているとき、attacker の位置が target から見て正面・側面・背面のどれか。
 * 向いている方向の成分が横方向の成分より大きければ正面、逆向きに大きければ背面、それ以外（斜め45度ちょうどを含む）は側面。
 */
export function relativeSide(attacker: Coord, target: Coord, facing: Direction): RelativeSide {
  const f = DIRECTION_VECTORS[facing];
  const dx = attacker.x - target.x;
  const dz = attacker.z - target.z;
  const forward = dx * f.x + dz * f.z;
  const lateral = Math.abs(dx * f.z - dz * f.x);
  if (forward > lateral) return 'front';
  if (-forward > lateral) return 'back';
  return 'side';
}
