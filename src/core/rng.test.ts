import { describe, expect, it } from 'vitest';
import { createRng, restoreRng } from './rng';

const take = (rng: { next(): number }, n: number) => Array.from({ length: n }, () => rng.next());

describe('createRng', () => {
  it('同じシード値なら同じ乱数列になる', () => {
    expect(take(createRng(12345), 100)).toEqual(take(createRng(12345), 100));
  });

  it('違うシード値なら違う乱数列になる', () => {
    expect(take(createRng(1), 10)).not.toEqual(take(createRng(2), 10));
  });

  it('next は 0 以上 1 未満を返す', () => {
    for (const v of take(createRng(42), 10_000)) {
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
    }
  });

  it('nextInt は指定範囲の整数を返し、すべての値が出る', () => {
    const rng = createRng(7);
    const seen = new Set<number>();
    for (let i = 0; i < 1000; i++) {
      const v = rng.nextInt(1, 6);
      expect(Number.isInteger(v)).toBe(true);
      expect(v).toBeGreaterThanOrEqual(1);
      expect(v).toBeLessThanOrEqual(6);
      seen.add(v);
    }
    expect([...seen].sort()).toEqual([1, 2, 3, 4, 5, 6]);
  });

  it('nextInt は不正な範囲でエラーになる', () => {
    expect(() => createRng(1).nextInt(5, 1)).toThrow(RangeError);
  });

  it('途中の状態を保存して、そこから同じ続きを再現できる', () => {
    const rng = createRng(999);
    take(rng, 37);
    const saved = rng.getState();
    const expected = take(rng, 20);
    expect(take(restoreRng(saved), 20)).toEqual(expected);
  });
});
