import * as THREE from 'three';
import type { Puppet, PuppetPose } from './puppet';
import { easeInOut, type Tweens } from './tweens';

/**
 * 会話の場面と戦闘で共通に使う動き（序章に足りない仕組み）: 仕草の再生と、光の柱。
 */

export interface GestureMotion {
  readonly seconds: number;
  readonly frames: readonly (PuppetPose & { readonly t: number; readonly turn?: number })[];
}

const POSE_KEYS = ['bow', 'head', 'headTurn', 'tilt', 'armL', 'armR', 'spreadL', 'spreadR', 'drop', 'lift', 'back'] as const;

/** 2つの姿勢を足し合わせる（続く姿勢の上に、仕草の動きを重ねる） */
export function addPoses(a: PuppetPose, b: PuppetPose): PuppetPose {
  const out: Record<string, number> = {};
  for (const k of POSE_KEYS) {
    const v = (a[k] ?? 0) + (b[k] ?? 0);
    if (v !== 0) out[k] = v;
  }
  return out;
}

/** 仕草を人形に再生する。base は続く姿勢（座っているなど）。終わると base の姿勢に戻す */
export async function playGesture(tweens: Tweens, puppet: Puppet, motion: GestureMotion, base: PuppetPose, speed = 1): Promise<void> {
  const frames = motion.frames;
  const baseYaw = puppet.yaw;
  const value = (key: (typeof POSE_KEYS)[number] | 'turn', t: number) => {
    let prev = frames[0]!;
    for (const f of frames) {
      if (f.t <= t) prev = f;
      else {
        const span = f.t - prev.t || 1;
        const k = easeInOut((t - prev.t) / span);
        return (prev[key] ?? 0) + ((f[key] ?? 0) - (prev[key] ?? 0)) * k;
      }
    }
    return prev[key] ?? 0;
  };
  await tweens.play(motion.seconds / Math.max(0.1, speed), (t) => {
    const pose: Record<string, number> = {};
    for (const k of POSE_KEYS) pose[k] = value(k, t);
    puppet.setPose?.(addPoses(base, pose));
    puppet.setYaw(baseYaw + value('turn', t));
  });
  puppet.setPose?.(base);
}

/** 光の柱（帰りの門の光など）。足もとの輪と、上へ伸びる柱 */
export interface LightPillar {
  readonly group: THREE.Group;
  setOpacity(opacity: number): void;
  update(elapsed: number): void;
  dispose(): void;
}

export function createLightPillar(color: number): LightPillar {
  const group = new THREE.Group();
  const materials: THREE.MeshBasicMaterial[] = [];
  const make = (geometry: THREE.BufferGeometry, opacity: number) => {
    const m = new THREE.MeshBasicMaterial({
      color,
      transparent: true,
      opacity,
      depthWrite: false,
      side: THREE.DoubleSide,
      blending: THREE.AdditiveBlending,
    });
    materials.push(m);
    const mesh = new THREE.Mesh(geometry, m);
    mesh.renderOrder = 5;
    // 光は見せるだけ。タップの判定から外す
    mesh.raycast = () => {};
    group.add(mesh);
    return mesh;
  };
  const column = make(new THREE.CylinderGeometry(0.42, 0.5, 2.6, 16, 1, true), 0.32);
  column.position.y = 1.3;
  const inner = make(new THREE.CylinderGeometry(0.2, 0.26, 2.4, 12, 1, true), 0.4);
  inner.position.y = 1.2;
  const ring = make(new THREE.RingGeometry(0.3, 0.55, 24).rotateX(-Math.PI / 2), 0.55);
  ring.position.y = 0.03;
  const bases = materials.map((m) => m.opacity);
  let opacity = 1;
  return {
    group,
    setOpacity(value) {
      opacity = value;
      materials.forEach((m, i) => (m.opacity = bases[i]! * value));
    },
    update(elapsed) {
      // ゆっくり脈打つ
      const pulse = 0.85 + Math.sin(elapsed * 2.2) * 0.15;
      materials.forEach((m, i) => (m.opacity = bases[i]! * opacity * pulse));
      ring.rotation.y = elapsed * 0.6;
    },
    dispose() {
      group.removeFromParent();
      for (const m of materials) m.dispose();
    },
  };
}
