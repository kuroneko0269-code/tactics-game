import * as THREE from 'three';
import type { Puppet } from './puppet';
import { YAW_OF } from './puppet';

/**
 * マップの上に置く小さな物の見た目（物語の土台）。戦闘の対象物（積み石の合わせ目・柱）と、
 * 会話の場面で出し入れする物（椀・灯・石など）の両方に使う。仮の見た目で、箱と多面体を組み合わせただけ。
 * 人形（puppet.ts）と同じ形の部品として返すので、戦闘の見た目（battleView.ts）でユニットと同じように扱える。
 * 種類を足す時は、下の BUILDERS に1つ足す（名前は src/data/story/props.ts の種類と同じ id）。
 */
type Builder = (part: (g: THREE.BufferGeometry, color: number, x: number, y: number, z: number) => THREE.Mesh) => void;

const BUILDERS: Readonly<Record<string, Builder>> = {
  // 戦闘の対象物
  seam: (part) => {
    part(new THREE.BoxGeometry(0.8, 0.5, 0.5), 0x9b8f80, 0, 0.25, 0);
    part(new THREE.BoxGeometry(0.7, 0.35, 0.45), 0x8a7e70, 0.05, 0.67, 0);
    // 合わせ目の割れ目
    part(new THREE.BoxGeometry(0.05, 0.85, 0.52), 0x3a3029, 0, 0.42, 0);
  },
  pillar: (part) => {
    part(new THREE.CylinderGeometry(0.2, 0.26, 1.1, 8), 0xc8c0b4, 0, 0.55, 0);
    part(new THREE.IcosahedronGeometry(0.16, 0), 0x7fd6ff, 0, 1.22, 0);
  },
  crate: (part) => {
    part(new THREE.BoxGeometry(0.55, 0.5, 0.55), 0x9a6a3a, 0, 0.25, 0);
  },
  // 会話の場面の物
  table: (part) => {
    part(new THREE.BoxGeometry(0.9, 0.06, 0.7), 0x8a5a2b, 0, 0.42, 0);
    part(new THREE.BoxGeometry(0.06, 0.4, 0.06), 0x6a4422, -0.38, 0.2, -0.28);
    part(new THREE.BoxGeometry(0.06, 0.4, 0.06), 0x6a4422, 0.38, 0.2, -0.28);
    part(new THREE.BoxGeometry(0.06, 0.4, 0.06), 0x6a4422, -0.38, 0.2, 0.28);
    part(new THREE.BoxGeometry(0.06, 0.4, 0.06), 0x6a4422, 0.38, 0.2, 0.28);
  },
  bowl: (part) => {
    part(new THREE.CylinderGeometry(0.11, 0.06, 0.08, 10), 0xe9e2d0, 0, 0.04, 0);
  },
  lamp: (part) => {
    part(new THREE.CylinderGeometry(0.08, 0.1, 0.2, 8), 0xc9a24a, 0, 0.1, 0);
    part(new THREE.SphereGeometry(0.07, 8, 6), 0x5a4a2a, 0, 0.25, 0);
  },
  lampLit: (part) => {
    part(new THREE.CylinderGeometry(0.08, 0.1, 0.2, 8), 0xc9a24a, 0, 0.1, 0);
    const glow = part(new THREE.SphereGeometry(0.09, 10, 8), 0xffe08a, 0, 0.26, 0);
    (glow.material as THREE.MeshLambertMaterial).emissive.setHex(0xffc84a);
  },
  stone: (part) => {
    part(new THREE.DodecahedronGeometry(0.08), 0xd8dcf0, 0, 0.07, 0);
  },
  box: (part) => {
    part(new THREE.BoxGeometry(0.4, 0.3, 0.3), 0x7a5a3a, 0, 0.15, 0);
  },
  rubble: (part) => {
    part(new THREE.DodecahedronGeometry(0.14), 0x8c7b6a, -0.15, 0.1, 0.05);
    part(new THREE.DodecahedronGeometry(0.1), 0x7d6f60, 0.15, 0.08, -0.1);
  },
};

/** 物の種類があるか（台本の検査で使う） */
export function hasPropModel(kind: string): boolean {
  return kind in BUILDERS;
}

/** 物の見た目を作る。知らない種類なら小さな箱 */
export function createPropModel(kind: string): Puppet {
  const group = new THREE.Group();
  const body = new THREE.Group();
  group.add(body);
  const materials: THREE.MeshLambertMaterial[] = [];
  const part = (g: THREE.BufferGeometry, color: number, x: number, y: number, z: number) => {
    const m = new THREE.MeshLambertMaterial({ color, flatShading: true, transparent: true });
    materials.push(m);
    const mesh = new THREE.Mesh(g, m);
    mesh.position.set(x, y, z);
    mesh.castShadow = true;
    body.add(mesh);
    return mesh;
  };
  (BUILDERS[kind] ?? BUILDERS.box!)(part);
  const base = materials.map((m) => m.emissive.clone());
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
      materials.forEach((m, i) => (amount > 0 ? m.emissive.setRGB(amount * 0.9, amount * 0.1, amount * 0.1) : m.emissive.copy(base[i]!)));
    },
    setOpacity(opacity) {
      for (const m of materials) m.opacity = opacity;
    },
    setGlow(color, amount) {
      materials.forEach((m, i) =>
        amount > 0 ? m.emissive.setRGB(color.r * amount * 0.8, color.g * amount * 0.8, color.b * amount * 0.8) : m.emissive.copy(base[i]!),
      );
    },
    update() {},
  };
}
