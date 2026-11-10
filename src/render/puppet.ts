import * as THREE from 'three';

/**
 * 仮の人形。箱と多面体を組み合わせて人の形にしたもの。
 * 将来ローポリの3Dモデルに差し替えるまでの代用品。
 * 全体の高さはおよそ 0.9（マスの一辺が 1）。
 */
export interface Puppet {
  readonly group: THREE.Group;
  /** 向き。0=南(手前) 1=東 2=北(奥) 3=西 */
  setFacing(facing: 0 | 1 | 2 | 3): void;
  update(elapsedSeconds: number): void;
}

export interface PuppetColors {
  readonly body: number;
  readonly accent: number;
}

const SKIN = 0xf1c9a5;
const DARK = 0x3a3330;

export function createPuppet(colors: PuppetColors): Puppet {
  const group = new THREE.Group();
  const body = new THREE.Group();
  group.add(body);

  const mat = (color: number) => new THREE.MeshLambertMaterial({ color, flatShading: true });
  const bodyMat = mat(colors.body);
  const accentMat = mat(colors.accent);
  const skinMat = mat(SKIN);
  const darkMat = mat(DARK);

  const part = (geometry: THREE.BufferGeometry, material: THREE.Material, x: number, y: number, z: number) => {
    const m = new THREE.Mesh(geometry, material);
    m.position.set(x, y, z);
    m.castShadow = true;
    body.add(m);
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
  part(new THREE.ConeGeometry(0.16, 0.18, 6), accentMat, 0, 0.9, 0);
  // 向きが分かるように、顔の正面に目印（目）を付ける
  part(new THREE.BoxGeometry(0.03, 0.04, 0.02), darkMat, -0.05, 0.76, 0.13);
  part(new THREE.BoxGeometry(0.03, 0.04, 0.02), darkMat, 0.05, 0.76, 0.13);

  return {
    group,
    setFacing(facing) {
      // 顔の正面は +z（南）。y 軸まわりに 90 度回すごとに 東(+x) → 北 → 西 を向く
      group.rotation.y = facing * (Math.PI / 2);
    },
    update(elapsed) {
      // 待機中の呼吸のような小さな上下動
      body.position.y = Math.abs(Math.sin(elapsed * 2.4)) * 0.015;
      leftArm.rotation.x = Math.sin(elapsed * 2.4) * 0.08;
      rightArm.rotation.x = -Math.sin(elapsed * 2.4) * 0.08;
    },
  };
}
