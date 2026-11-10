import * as THREE from 'three';
import type { Direction } from '../core/geometry';

/**
 * 仮の人形。箱と多面体を組み合わせて人の形にしたもの。
 * 将来ローポリの3Dモデルに差し替えるまでの代用品。
 * 全体の高さはおよそ 0.9（マスの一辺が 1）。
 */
export interface Puppet {
  /** 位置と向きを持つ外側のグループ */
  readonly group: THREE.Group;
  /** 体（攻撃や被弾の動きはこちらを動かす。group からの相対位置） */
  readonly body: THREE.Group;
  setFacing(facing: Direction): void;
  /** 向きを角度（ラジアン）で直接指定する（回転のアニメーション用） */
  setYaw(yaw: number): void;
  readonly yaw: number;
  /** 被弾したときの赤い光り方。0 で通常、1 で最も強く光る */
  setFlash(amount: number): void;
  /** 透明度。1 で不透明 */
  setOpacity(opacity: number): void;
  update(elapsedSeconds: number): void;
}

export type WeaponKind = 'sword' | 'bow';

export interface PuppetLook {
  readonly body: number;
  readonly accent: number;
  readonly weapon: WeaponKind;
}

const SKIN = 0xf1c9a5;
const DARK = 0x3a3330;
const STEEL = 0xd8dde3;
const WOOD = 0x8a5a2b;

/** 顔の正面は +z（南）。y 軸まわりに 90 度回すごとに 東(+x) → 北 → 西 を向く */
export const YAW_OF: Readonly<Record<Direction, number>> = {
  south: 0,
  east: Math.PI / 2,
  north: Math.PI,
  west: (Math.PI * 3) / 2,
};

export function createPuppet(look: PuppetLook): Puppet {
  const group = new THREE.Group();
  const body = new THREE.Group();
  group.add(body);
  const materials: THREE.MeshLambertMaterial[] = [];

  const mat = (color: number) => {
    const m = new THREE.MeshLambertMaterial({ color, flatShading: true, transparent: true });
    materials.push(m);
    return m;
  };
  const bodyMat = mat(look.body);
  const accentMat = mat(look.accent);
  const skinMat = mat(SKIN);
  const darkMat = mat(DARK);

  const part = (
    geometry: THREE.BufferGeometry,
    material: THREE.Material,
    x: number,
    y: number,
    z: number,
    parent: THREE.Object3D = body,
  ) => {
    const m = new THREE.Mesh(geometry, material);
    m.position.set(x, y, z);
    m.castShadow = true;
    parent.add(m);
    return m;
  };

  // 脚
  part(new THREE.BoxGeometry(0.12, 0.3, 0.14), darkMat, -0.08, 0.15, 0);
  part(new THREE.BoxGeometry(0.12, 0.3, 0.14), darkMat, 0.08, 0.15, 0);
  // 胴体と帯
  part(new THREE.BoxGeometry(0.34, 0.3, 0.2), bodyMat, 0, 0.45, 0);
  part(new THREE.BoxGeometry(0.35, 0.05, 0.21), accentMat, 0, 0.33, 0);
  // 腕
  const leftArm = part(new THREE.BoxGeometry(0.09, 0.28, 0.1), bodyMat, -0.22, 0.45, 0);
  const rightArm = part(new THREE.BoxGeometry(0.09, 0.28, 0.1), bodyMat, 0.22, 0.45, 0);
  // 頭と帽子
  part(new THREE.IcosahedronGeometry(0.14, 0), skinMat, 0, 0.74, 0);
  if (look.weapon === 'sword') {
    // 兜のような角ばった帽子
    part(new THREE.BoxGeometry(0.3, 0.1, 0.3), accentMat, 0, 0.86, 0);
  } else {
    // 尖ったフード
    part(new THREE.ConeGeometry(0.16, 0.22, 6), accentMat, 0, 0.92, 0);
  }
  // 向きが分かるように、顔の正面に目印（目）を付ける
  part(new THREE.BoxGeometry(0.03, 0.04, 0.02), darkMat, -0.05, 0.76, 0.13);
  part(new THREE.BoxGeometry(0.03, 0.04, 0.02), darkMat, 0.05, 0.76, 0.13);

  // 武器
  if (look.weapon === 'sword') {
    const blade = part(new THREE.BoxGeometry(0.05, 0.42, 0.03), mat(STEEL), 0, -0.3, 0.06, rightArm);
    blade.rotation.x = Math.PI / 2.4;
  } else {
    const bow = part(
      new THREE.TorusGeometry(0.2, 0.018, 4, 12, Math.PI),
      mat(WOOD),
      0,
      -0.08,
      0.12,
      leftArm,
    );
    bow.rotation.set(0, Math.PI / 2, Math.PI / 2);
  }

  let yaw = 0;
  return {
    group,
    body,
    setFacing(facing) {
      yaw = YAW_OF[facing];
      group.rotation.y = yaw;
    },
    setYaw(value) {
      yaw = value;
      group.rotation.y = value;
    },
    get yaw() {
      return yaw;
    },
    setFlash(amount) {
      for (const m of materials) m.emissive.setRGB(amount * 0.9, amount * 0.1, amount * 0.1);
    },
    setOpacity(opacity) {
      for (const m of materials) m.opacity = opacity;
    },
    update(elapsed) {
      // 待機中の呼吸のような小さな動き
      leftArm.rotation.x = Math.sin(elapsed * 2.4) * 0.08;
      rightArm.rotation.x = -Math.sin(elapsed * 2.4) * 0.08;
    },
  };
}
