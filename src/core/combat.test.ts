import { describe, expect, it } from 'vitest';
import { attackableTargets, canReach, computeDamage, heightDamagePercent, previewAttack } from './combat';
import { flat, makeState, testArcher, testRules } from './testSupport';

const melee = { kind: 'melee', maxHeightDiff: 2 } as const;
const bow = testArcher.attack;

describe('近接攻撃（戦士）', () => {
  it('隣接マスだけ攻撃できる', () => {
    const { map } = makeState({ heights: flat(5, 5), units: [] });
    expect(canReach(map, melee, { x: 2, z: 2 }, { x: 2, z: 3 })).toBe(true);
    expect(canReach(map, melee, { x: 2, z: 2 }, { x: 3, z: 3 })).toBe(false); // 斜め
    expect(canReach(map, melee, { x: 2, z: 2 }, { x: 2, z: 4 })).toBe(false);
  });

  it('高さの差が 2 以内の相手だけ攻撃できる（上からも下からも）', () => {
    const { map } = makeState({ heights: [[0, 2, 5, 3]], units: [] });
    expect(canReach(map, melee, { x: 0, z: 0 }, { x: 1, z: 0 })).toBe(true); // 差 2
    expect(canReach(map, melee, { x: 1, z: 0 }, { x: 2, z: 0 })).toBe(false); // 差 3
    expect(canReach(map, melee, { x: 3, z: 0 }, { x: 2, z: 0 })).toBe(true); // 差 2（下から）
    expect(canReach(map, melee, { x: 2, z: 0 }, { x: 1, z: 0 })).toBe(false); // 差 3（上から）
  });
});

describe('弓の射程', () => {
  it('射程は 3〜5 マス。隣接マスや 2 マス先は撃てない', () => {
    const { map } = makeState({ heights: flat(9, 1), units: [] });
    const from = { x: 0, z: 0 };
    const reach = [1, 2, 3, 4, 5, 6].map((x) => canReach(map, bow, from, { x, z: 0 }));
    expect(reach).toEqual([false, false, true, true, true, false]);
  });

  it('斜めの位置は縦と横の歩数の合計で数える', () => {
    const { map } = makeState({ heights: flat(9, 9), units: [] });
    expect(canReach(map, bow, { x: 0, z: 0 }, { x: 2, z: 3 })).toBe(true); // 5
    expect(canReach(map, bow, { x: 0, z: 0 }, { x: 3, z: 3 })).toBe(false); // 6
  });

  it('相手より高いと、高さの差 2 ごとに射程の上限が 1 伸びる', () => {
    const heights = [[4, 0, 0, 0, 0, 0, 0, 0, 3]];
    const { map } = makeState({ heights, units: [] });
    expect(canReach(map, bow, { x: 0, z: 0 }, { x: 7, z: 0 })).toBe(true); // 差 4 で +2 → 射程 7
    expect(canReach(map, bow, { x: 0, z: 0 }, { x: 8, z: 0 })).toBe(false); // 差 1 → 射程 5 のまま
  });

  it('差が 1 だけ高い時や、相手の方が高い時は伸びない（縮みもしない）', () => {
    const { map } = makeState({ heights: [[1, 0, 0, 0, 0, 0, 5]], units: [] });
    expect(canReach(map, bow, { x: 0, z: 0 }, { x: 6, z: 0 })).toBe(false);
    expect(canReach(map, bow, { x: 6, z: 0 }, { x: 1, z: 0 })).toBe(true); // 上から 5 マス
  });
});

describe('命中率とダメージ', () => {
  it('高低差の補正は 1 段ごとに 5%、上限 +20%、下限 -20%', () => {
    expect(heightDamagePercent(testRules, 3, 1)).toBe(10);
    expect(heightDamagePercent(testRules, 9, 0)).toBe(20);
    expect(heightDamagePercent(testRules, 0, 2)).toBe(-10);
    expect(heightDamagePercent(testRules, 0, 7)).toBe(-20);
    expect(heightDamagePercent(testRules, 2, 2)).toBe(0);
  });

  it('ダメージは 攻撃力 × 向きの倍率 × 高低差の補正 で、端数は切り捨て', () => {
    expect(computeDamage(testRules, 20, 'front', 0)).toBe(20);
    expect(computeDamage(testRules, 20, 'side', 0)).toBe(20);
    expect(computeDamage(testRules, 20, 'back', 0)).toBe(25);
    expect(computeDamage(testRules, 20, 'back', 20)).toBe(30);
    expect(computeDamage(testRules, 13, 'back', 15)).toBe(18); // 13 × 1.25 × 1.15 = 18.68…
    expect(computeDamage(testRules, 13, 'front', -20)).toBe(10); // 10.4
  });

  it('ダメージは最小でも 1', () => {
    expect(computeDamage(testRules, 1, 'front', -20)).toBe(1);
  });

  it('予測: 命中率は向きだけで決まり、高低差は影響しない', () => {
    const heights = [
      [0, 0, 0],
      [0, 0, 0],
      [0, 3, 0],
    ];
    const units = (facing: 'north' | 'south' | 'east') =>
      makeState({
        heights,
        units: [
          { id: 'a', team: 'player', x: 1, z: 0 },
          { id: 't', team: 'enemy', x: 1, z: 1, facing },
          { id: 'b', team: 'player', x: 1, z: 2 },
        ],
      });
    const front = units('north');
    const p = previewAttack(front, front.units[0]!, front.units[1]!);
    expect(p).toMatchObject({ side: 'front', hitPercent: 85, heightPercent: 0, damage: 20, attackerFacing: 'south' });

    const back = units('south');
    expect(previewAttack(back, back.units[0]!, back.units[1]!)).toMatchObject({ side: 'back', hitPercent: 100, damage: 25 });

    const side = units('east');
    expect(previewAttack(side, side.units[0]!, side.units[1]!)).toMatchObject({ side: 'side', hitPercent: 95 });

    // 高さ 3 から見下ろす攻撃: 命中率は向き（南を向いた相手の背面）だけで決まり、ダメージは +15%
    const high = previewAttack(back, back.units[2]!, back.units[1]!);
    expect(high).toMatchObject({ side: 'front', hitPercent: 85, heightPercent: 15, damage: 23 });
  });

  it('攻撃できる相手は、届く範囲にいる生きた敵だけ', () => {
    const state = makeState({
      heights: flat(4, 4),
      units: [
        { id: 'a', team: 'player', x: 1, z: 1 },
        { id: 'ally', team: 'player', x: 1, z: 2 },
        { id: 'e1', team: 'enemy', x: 2, z: 1 },
        { id: 'dead', team: 'enemy', x: 0, z: 1, hp: 0 },
        { id: 'far', team: 'enemy', x: 3, z: 3 },
      ],
    });
    expect(attackableTargets(state, state.units[0]!, state.units[0]!).map((u) => u.id)).toEqual(['e1']);
  });
});
