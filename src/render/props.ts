import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { BACKDROP_MODELS, MODEL_LIGHTS, MODELS, type ShapePart } from '../data/story/models';
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

/**
 * 物の形のデータから、3D の部品の組を作る（材質の一覧も返す。光らせたり透かしたりするため）。
 * 光らない・透けない・揺れない部品は、部品ごとの色を頂点の色に焼き込んで1つの形にまとめる
 * （家の殻のように部品の多い物でも、描く回数を1回にする。見た目の見本の2回目で、描画を軽くするため）
 */
export function buildModel(kind: string, parent: THREE.Object3D, swaying?: { mesh: THREE.Mesh; x: number; amount: number }[]): THREE.MeshLambertMaterial[] {
  const parts = MODELS[kind] ?? MODELS.box!;
  const materials: THREE.MeshLambertMaterial[] = [];
  const plain = parts.filter((p) => p.glow === undefined && (p.opacity ?? 1) >= 1 && !p.sway);
  if (plain.length > 1) {
    const color = new THREE.Color();
    const pieces = plain.map((p) => {
      const g = geometryOf(p);
      const m = new THREE.Matrix4().compose(
        new THREE.Vector3(p.at[0], p.at[1], p.at[2]),
        new THREE.Quaternion().setFromEuler(new THREE.Euler(...(p.rot ?? [0, 0, 0]))),
        new THREE.Vector3(1, 1, 1),
      );
      const flat = (g.index ? g.toNonIndexed() : g).applyMatrix4(m);
      if (flat !== g) g.dispose();
      for (const name of Object.keys(flat.attributes)) if (name !== 'position' && name !== 'normal') flat.deleteAttribute(name);
      color.setHex(p.color);
      const n = flat.attributes.position!.count;
      const col = new Float32Array(n * 3);
      for (let i = 0; i < n; i++) col.set([color.r, color.g, color.b], i * 3);
      flat.setAttribute('color', new THREE.BufferAttribute(col, 3));
      return flat;
    });
    const merged = mergeGeometries(pieces);
    for (const g of pieces) g.dispose();
    if (merged) {
      const m = new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true, transparent: true });
      materials.push(m);
      const mesh = new THREE.Mesh(merged, m);
      mesh.castShadow = true;
      parent.add(mesh);
    }
  }
  for (const p of plain.length > 1 ? parts.filter((x) => !plain.includes(x)) : parts) {
    const m = new THREE.MeshLambertMaterial({ color: p.color, flatShading: true, transparent: true, opacity: p.opacity ?? 1 });
    if (p.glow !== undefined) m.emissive.setHex(p.glow);
    materials.push(m);
    const mesh = new THREE.Mesh(geometryOf(p), m);
    mesh.position.set(p.at[0], p.at[1], p.at[2]);
    if (p.rot) mesh.rotation.set(p.rot[0], p.rot[1], p.rot[2]);
    mesh.castShadow = true;
    if (p.sway) swaying?.push({ mesh, x: p.at[0], amount: p.sway });
    parent.add(mesh);
  }
  return materials;
}

/** 物の灯の影を描き直す（物を置いた・消した・動かした後に呼ぶ） */
export function refreshPropShadows(scene: THREE.Object3D): void {
  scene.traverse((o) => {
    const l = o as THREE.SpotLight;
    if (l.isLight && l.castShadow && l.shadow && !l.shadow.autoUpdate) l.shadow.needsUpdate = true;
  });
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
  const swaying: { mesh: THREE.Mesh; x: number; amount: number }[] = [];
  const materials = buildModel(kind, body, swaying);
  // 背景の大きな物は、タップの判定から外す
  if (BACKDROP_MODELS.includes(kind)) body.traverse((o) => (o.raycast = () => {}));
  // 物が放つ光（ともった灯）。人物と机に暖かい光を当て、影を落とす
  const lightDef = MODEL_LIGHTS[kind];
  let light: THREE.PointLight | THREE.SpotLight | undefined;
  if (lightDef) {
    if (lightDef.shadow) {
      // 影を落とす灯は、下へ広く照らすスポットの光にする（点の光の影は6方向を描くので重い。スポットなら1方向で、スマホでも軽い）
      const spot = new THREE.SpotLight(lightDef.color, lightDef.intensity * 2.2, lightDef.distance, 1.5, 0.75, 1.5);
      spot.position.set(lightDef.at[0], lightDef.at[1], lightDef.at[2]);
      spot.target.position.set(lightDef.at[0], lightDef.at[1] - 1, lightDef.at[2]);
      body.add(spot.target);
      spot.castShadow = true;
      // 影は、物が動いた時だけ描き直す（人形は影の計算に入れないので、置いた物が変わらない間は同じ影のまま。refreshPropShadows）
      spot.shadow.autoUpdate = false;
      spot.shadow.needsUpdate = true;
      spot.shadow.mapSize.set(512, 512);
      spot.shadow.bias = -0.002;
      spot.shadow.radius = 3;
      spot.shadow.camera.near = 0.05;
      spot.shadow.camera.far = lightDef.distance;
      light = spot;
    } else {
      light = new THREE.PointLight(lightDef.color, lightDef.intensity, lightDef.distance, 1.6);
      light.position.set(lightDef.at[0], lightDef.at[1], lightDef.at[2]);
    }
    body.add(light);
  }
  const baseIntensity = light?.intensity ?? 0;
  /** 光の強さの割合（現れる・消える時に、形と一緒に明るさも変える） */
  let lightLevel = 1;
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
      lightLevel = opacity;
      if (light) light.intensity = baseIntensity * opacity;
    },
    setGlow(color, amount) {
      materials.forEach((m, i) =>
        amount > 0 ? m.emissive.setRGB(color.r * amount * 0.8, color.g * amount * 0.8, color.b * amount * 0.8) : m.emissive.copy(base[i]!),
      );
    },
    update(elapsed) {
      // 揺れる部品（軒の灯など）
      swaying.forEach((s, i) => (s.mesh.position.x = s.x + Math.sin(elapsed * 2.4 + i * 1.3) * s.amount));
      // 炎のように、明るさがわずかに揺らぐ
      if (light && lightDef?.flicker) {
        const f = Math.sin(elapsed * 9.1) * 0.5 + Math.sin(elapsed * 23.7 + 1.3) * 0.3 + Math.sin(elapsed * 4.3) * 0.2;
        light.intensity = baseIntensity * lightLevel * (1 + f * lightDef.flicker);
      }
    },
  };
}
