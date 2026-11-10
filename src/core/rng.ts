/**
 * シード値（乱数の種）を指定できる乱数生成器。
 *
 * 同じシード値から作れば、毎回まったく同じ乱数列が出てくる。
 * これによりリプレイ（戦闘の再生）や、オンライン協力プレイで
 * 全員の画面が同じ結果になることを保証する。
 *
 * core の中では Math.random を使わず、必ずこれを使うこと（lint で検査している）。
 *
 * アルゴリズムは mulberry32（32bit の状態を持つ、軽くて十分に均等な生成器）。
 */
export interface Rng {
  /** 0 以上 1 未満の小数を返す */
  next(): number;
  /** min 以上 max 以下の整数を返す */
  nextInt(min: number, max: number): number;
  /** 現在の内部状態。保存しておけば、その時点から乱数列を再開できる */
  getState(): number;
}

export function createRng(seed: number): Rng {
  let state = seed >>> 0;

  const next = (): number => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };

  return {
    next,
    nextInt(min: number, max: number): number {
      if (!Number.isInteger(min) || !Number.isInteger(max) || max < min) {
        throw new RangeError(`nextInt: 範囲が不正です (min=${min}, max=${max})`);
      }
      return min + Math.floor(next() * (max - min + 1));
    },
    getState: () => state,
  };
}

/** 保存しておいた状態から乱数生成器を復元する */
export function restoreRng(state: number): Rng {
  return createRng(state);
}
