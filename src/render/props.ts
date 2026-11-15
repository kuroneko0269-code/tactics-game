import * as THREE from 'three';
import { MODELS, type ShapePart } from '../data/story/models';
import type { Puppet } from './puppet';
import { YAW_OF } from './puppet';

/**
 * マップの上に置く小さな物の見た目（物語の土台）。戦闘の対象物（積み石の合わせ目・柱）と、
 * 会話の場面で出し入れする物（椀・灯・石など）、人物の持ち物に使う。仮の見た目で、形は src/data/story/models.ts のデータ。
 * 人形（puppet.ts）と同じ形の部品として返すので、戦闘の見た目（battleView.ts）でユニットと同じように扱える。
 */

/** 形の1つぶんの3D の形 */
function geometryOf(p: ShapePart): THREE.BufferGeometry {
  const [a = 0.1, b = 0.1, c = 0.1] = p.size;
  switch (p.shape) {
    case 'box':
      return new THREE.BoxGeometry(a, b, c);
    case 'cyl':
      return new THREE.CylinderGeometry(a, c, b, 10);
    case 'cone':
      return new THREE.ConeGeometry(a, b, 8);
    case 'ball':
      return new THREE.SphereGeometry(a, 10, 8);
    case 'ring':
      return new THREE.TorusGeometry(a, b, 6, 24);
    case 'gem':
      return new THREE.DodecahedronGeometry(a);
  }
}

/** 物の形のデータから、3D の部品の組を作る（材質の一覧も返す。光らせたり透かしたりするため） */
export function buildModel(kind: string, parent: THREE.Object3D): THREE.MeshLambertMaterial[] {
  const parts = MODELS[kind] ?? MODELS.box!;
  const materials: THREE.MeshLambertMaterial[] = [];
  for (const p of parts) {
    const m = new THREE.MeshLambertMaterial({ color: p.color, flatShading: true, transparent: true, opacity: p.opacity ?? 1 });
    if (p.glow !== undefined) m.emissive.setHex(p.glow);
    materials.push(m);
    const mesh = new THREE.Mesh(geometryOf(p), m);
    mesh.position.set(p.at[0], p.at[1], p.at[2]);
    if (p.rot) mesh.rotation.set(p.rot[0], p.rot[1], p.rot[2]);
    mesh.castShadow = true;
    parent.add(mesh);
  }
  return materials;
}

/** 物の種類があるか（台本の検査で使う） */
export function hasPropModel(kind: string): boolean {
  return kind in MODELS;
}

/** 物の見た目を作る。知らない種類なら小さな箱 */
export function createPropModel(kind: string): Puppet {
  const group = new THREE.Group();
  const body = new THREE.Group();
  group.add(body);
  const materials = buildModel(kind, body);
  const base = materials.map((m) => m.emissive.clone());
  const baseOpacity = materials.map((m) => m.opacity);
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
      materials.forEach((m, i) => (m.opacity = opacity * baseOpacity[i]!));
    },
    setGlow(color, amount) {
      materials.forEach((m, i) =>
        amount > 0 ? m.emissive.setRGB(color.r * amount * 0.8, color.g * amount * 0.8, color.b * amount * 0.8) : m.emissive.copy(base[i]!),
      );
    },
    update() {},
  };
}
