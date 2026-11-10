import { describe, expect, it } from 'vitest';
import { directionToward, manhattan, relativeSide } from './geometry';

describe('relativeSide（攻撃対象から見た攻撃側の位置）', () => {
  const target = { x: 5, z: 5 };
  it('南を向いた相手に対して、南は正面、北は背面、東西は側面', () => {
    expect(relativeSide({ x: 5, z: 6 }, target, 'south')).toBe('front');
    expect(relativeSide({ x: 5, z: 4 }, target, 'south')).toBe('back');
    expect(relativeSide({ x: 6, z: 5 }, target, 'south')).toBe('side');
    expect(relativeSide({ x: 4, z: 5 }, target, 'south')).toBe('side');
  });

  it('東を向いた相手に対して、東は正面、西は背面', () => {
    expect(relativeSide({ x: 8, z: 5 }, target, 'east')).toBe('front');
    expect(relativeSide({ x: 2, z: 5 }, target, 'east')).toBe('back');
    expect(relativeSide({ x: 5, z: 2 }, target, 'east')).toBe('side');
  });

  it('離れた位置は、向いている方向の成分が横の成分より大きいかで決まり、斜め45度ちょうどは側面', () => {
    expect(relativeSide({ x: 6, z: 8 }, target, 'south')).toBe('front'); // 前に3、横に1
    expect(relativeSide({ x: 7, z: 7 }, target, 'south')).toBe('side'); // 前に2、横に2
    expect(relativeSide({ x: 4, z: 1 }, target, 'south')).toBe('back'); // 後ろに4、横に1
  });
});

describe('directionToward', () => {
  it('差の大きい軸の方向を向き、同じなら東西を選ぶ', () => {
    expect(directionToward({ x: 0, z: 0 }, { x: 3, z: 1 }, 'north')).toBe('east');
    expect(directionToward({ x: 0, z: 0 }, { x: 1, z: -3 }, 'east')).toBe('north');
    expect(directionToward({ x: 0, z: 0 }, { x: -2, z: 2 }, 'north')).toBe('west');
    expect(directionToward({ x: 1, z: 1 }, { x: 1, z: 1 }, 'south')).toBe('south');
  });
});

it('manhattan は縦と横の差の合計', () => {
  expect(manhattan({ x: 1, z: 2 }, { x: 4, z: 0 })).toBe(5);
});
