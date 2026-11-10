/**
 * 時間をかけて値を変える動き（トゥイーン）をまとめて進める仕組み。
 * play で登録すると、毎フレームの update で進み、終わると Promise が解決する。
 */
export interface Tweens {
  /** seconds 秒かけて onUpdate(0→1) を呼ぶ */
  play(seconds: number, onUpdate: (t: number) => void): Promise<void>;
  /** seconds 秒待つ */
  wait(seconds: number): Promise<void>;
  update(deltaSeconds: number): void;
}

interface Running {
  elapsed: number;
  readonly seconds: number;
  readonly onUpdate: (t: number) => void;
  readonly resolve: () => void;
}

export function createTweens(): Tweens {
  let running: Running[] = [];
  const play = (seconds: number, onUpdate: (t: number) => void) =>
    new Promise<void>((resolve) => {
      onUpdate(0);
      running.push({ elapsed: 0, seconds: Math.max(seconds, 0.001), onUpdate, resolve });
    });
  return {
    play,
    wait: (seconds) => play(seconds, () => {}),
    update(dt) {
      const finished: Running[] = [];
      for (const r of running) {
        r.elapsed += dt;
        const t = Math.min(1, r.elapsed / r.seconds);
        r.onUpdate(t);
        if (t >= 1) finished.push(r);
      }
      if (finished.length > 0) {
        running = running.filter((r) => !finished.includes(r));
        for (const r of finished) r.resolve();
      }
    },
  };
}

export const easeOutCubic = (t: number) => 1 - Math.pow(1 - t, 3);
export const easeInOut = (t: number) => (t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2);
