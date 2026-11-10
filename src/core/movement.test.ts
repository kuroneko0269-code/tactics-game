import { describe, expect, it } from 'vitest';
import { reachableTiles } from './movement';
import { flat, makeState } from './testSupport';

const coords = (tiles: { x: number; z: number }[]) =>
  tiles.map((t) => `${t.x},${t.z}`).sort();

describe('reachableTiles（移動できる範囲）', () => {
  it('平らなマップでは、移動力の歩数以内のマスに止まれる（今いるマスは含まない）', () => {
    const state = makeState({ heights: flat(7, 7), units: [{ id: 'a', team: 'player', x: 3, z: 3 }] });
    const tiles = reachableTiles(state, state.units[0]!);
    // 移動力 3 のひし形: 1 + 4 + 8 + 12 = 25 マスから自分の 1 マスを引く
    expect(tiles).toHaveLength(24);
    expect(tiles.every((t) => Math.abs(t.x - 3) + Math.abs(t.z - 3) <= 3)).toBe(true);
  });

  it('隣のマスとの高さの差がジャンプ力（2）を超えると進めない。上りも下りも同じ', () => {
    const heights = [
      [0, 2, 5, 0],
      [0, 0, 0, 0],
    ];
    const state = makeState({ heights, units: [{ id: 'a', team: 'player', x: 0, z: 0 }] });
    const result = coords(reachableTiles(state, state.units[0]!));
    expect(result).toContain('1,0'); // 差 2 は登れる
    expect(result).not.toContain('2,0'); // 差 3 と 5 は登れない
    expect(result).toContain('2,1'); // 平地は回り込める

    const fromTop = makeState({ heights, units: [{ id: 'a', team: 'player', x: 2, z: 0 }] });
    expect(reachableTiles(fromTop, fromTop.units[0]!)).toHaveLength(0); // 高さ 5 からは降りられない
  });

  it('味方のいるマスは通過できるが止まれない', () => {
    // 幅1の通路。味方を越えた先には行ける
    const state = makeState({
      heights: flat(5, 1),
      units: [
        { id: 'a', team: 'player', x: 0, z: 0 },
        { id: 'b', team: 'player', x: 1, z: 0 },
      ],
    });
    expect(coords(reachableTiles(state, state.units[0]!))).toEqual(['2,0', '3,0']);
  });

  it('敵のいるマスは通過もできない', () => {
    const state = makeState({
      heights: flat(5, 1),
      units: [
        { id: 'a', team: 'player', x: 0, z: 0 },
        { id: 'e', team: 'enemy', x: 2, z: 0 },
      ],
    });
    expect(coords(reachableTiles(state, state.units[0]!))).toEqual(['1,0']);
  });

  it('戦闘不能のユニットは邪魔にならない', () => {
    const state = makeState({
      heights: flat(5, 1),
      units: [
        { id: 'a', team: 'player', x: 0, z: 0 },
        { id: 'e', team: 'enemy', x: 1, z: 0, hp: 0 },
      ],
    });
    expect(coords(reachableTiles(state, state.units[0]!))).toEqual(['1,0', '2,0', '3,0']);
  });

  it('道順は出発地点から1歩ずつ並び、最後が目的地', () => {
    const state = makeState({ heights: flat(4, 4), units: [{ id: 'a', team: 'player', x: 0, z: 0 }] });
    const tile = reachableTiles(state, state.units[0]!).find((t) => t.x === 2 && t.z === 1)!;
    expect(tile.path[0]).toEqual({ x: 0, z: 0 });
    expect(tile.path[tile.path.length - 1]).toEqual({ x: 2, z: 1 });
    expect(tile.path).toHaveLength(4);
  });
});
