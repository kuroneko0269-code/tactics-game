import * as THREE from 'three';
import { mergeVertices } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { KayKitLook } from '../data/story/looks';

/**
 * KayKit の体に付ける自作の部品（KayKit の人形の試し）: 頭巾・帽子・肩掛け・マント（外套）・前掛け・スカート。髪は src/render/kaykitHair.ts。
 * 形は KayKit の絵柄に合わせる（面の少ない、角を丸めた形。色は1つの部品に1色で、上から下へ少し暗くなる）。
 *
 * 座標は KayKit の体の「骨を付けた時の姿勢」の座標（足もとが 0、正面が +z、背丈がおよそ 2.3。頭の骨は y 1.241）。
 * 頭の部品は、素材の頭と同じ大きさで作り、組み立てる時に頭と一緒に縮める（src/render/kaykit.ts）。
 * 部品は骨に付けて（形の各点に骨の番号と重さを持たせて）、体の形と1つにまとめるので、動きに付いてくる。
 */

/**
 * 部品の色の区画（色の画像の、素材の体が使っていない一番下の段。src/render/kaykit.ts の色の画像と合わせる）。
 * 3つ目に 'l'・'r' がある区画は、区画の左半分・右半分だけを使う（1つの区画に2色を入れる）
 */
export const PART_CELLS = {
  hair: [0, 3, 'l'],
  hairLight: [0, 3, 'r'],
  cloak: [1, 3],
  apron: [2, 3, 'l'],
  // 白目と瞳（顔の面に描く目）
  sclera: [2, 3, 'r'],
  mantle: [3, 3, 'l'],
  // 目の光（ユナの目に入れる小さな白い点）
  shine: [3, 3, 'r'],
  headwear: [4, 3, 'l'],
  blush: [4, 3, 'r'],
  accent: [5, 3],
  cloakInner: [6, 3, 'l'],
  skirt: [6, 3, 'r'],
  hairDark: [7, 3, 'l'],
  iris: [7, 3, 'r'],
  // 素材の頭の目の区画（まつ毛を目と同じ色にする）
  eye: [2, 0],
} as const satisfies Record<string, readonly [number, number] | readonly [number, number, 'l' | 'r']>;
export type PartCell = keyof typeof PART_CELLS;

/** 骨の番号（KayKit の5人で共通の骨の順番） */
export const BONE = { hips: 1, spine: 2, chest: 3, head: 14, upperlegL: 15, upperlegR: 19 } as const;

/** 1つの部品: 形と、付く骨（2つまで。重さは高さで決める） */
export interface PartPiece {
  readonly geometry: THREE.BufferGeometry;
  /** 頭の骨に付く（組み立てる時に頭と一緒に縮める） */
  readonly onHead: boolean;
}

type V3 = readonly [number, number, number];

/**
 * 形に、色の区画の UV と骨を付ける。UV の縦は、形の上ほど区画の上（明るい所）を指す（素材と同じ、上から下へ暗くなる塗り）。
 * bones が2つの時は、y が lowY 以下で2つ目の骨へ重さを移す（長いマントの裾を腰に付けて、歩く時に足と離れすぎないように）
 */
export function finish(
  g: THREE.BufferGeometry,
  cell: PartCell,
  bones: { a: number; b?: number; topY?: number; lowY?: number },
  onHead: boolean,
): PartPiece {
  let geo = g;
  for (const name of Object.keys(geo.attributes)) if (name !== 'position' && name !== 'normal') geo.deleteAttribute(name);
  geo = mergeVertices(geo, 1e-4);
  geo.computeVertexNormals();
  const pos = geo.attributes.position!;
  const n = pos.count;
  geo.computeBoundingBox();
  const box = geo.boundingBox!;
  const ref: readonly (number | string)[] = PART_CELLS[cell];
  const [cx, cy] = ref as readonly [number, number];
  const side = ref[2];
  const u = side === 'l' ? 0.25 : side === 'r' ? 0.75 : 0.45;
  const uv = new Float32Array(n * 2);
  const si = new Uint16Array(n * 4);
  const sw = new Float32Array(n * 4);
  const span = Math.max(1e-6, box.max.y - box.min.y);
  for (let i = 0; i < n; i++) {
    const y = pos.getY(i);
    const t = (box.max.y - y) / span;
    uv[i * 2] = (cx + u) / 8;
    uv[i * 2 + 1] = (cy + 0.12 + t * 0.76) / 4;
    si[i * 4] = bones.a;
    if (bones.b !== undefined && bones.topY !== undefined && bones.lowY !== undefined) {
      const k = Math.min(1, Math.max(0, (bones.topY - y) / (bones.topY - bones.lowY)));
      si[i * 4 + 1] = bones.b;
      sw[i * 4] = 1 - k * 0.6;
      sw[i * 4 + 1] = k * 0.6;
    } else sw[i * 4] = 1;
  }
  geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  geo.setAttribute('skinIndex', new THREE.BufferAttribute(si, 4));
  geo.setAttribute('skinWeight', new THREE.BufferAttribute(sw, 4));
  return { geometry: geo, onHead };
}

/** 開いた形（マント・前掛け）に、裏返した写しを足す（裏から見ても見えるように） */
function bothSides(g: THREE.BufferGeometry, inset = 0.012): THREE.BufferGeometry {
  const src = g.index ? g.toNonIndexed() : g;
  for (const name of Object.keys(src.attributes)) if (name !== 'position') src.deleteAttribute(name);
  src.computeVertexNormals();
  const p = src.attributes.position!;
  const nrm = src.attributes.normal!;
  const n = p.count;
  const out = new Float32Array(n * 6);
  for (let i = 0; i < n; i++) {
    out[i * 3] = p.getX(i);
    out[i * 3 + 1] = p.getY(i);
    out[i * 3 + 2] = p.getZ(i);
  }
  // 裏は、面の向きを逆にして、少し内側へずらす（表と同じ所に重ねると、ちらつくため）
  for (let t = 0; t < n; t += 3) {
    for (let k = 0; k < 3; k++) {
      const s = t + (k === 0 ? 0 : k === 1 ? 2 : 1);
      const d = (n + t + k) * 3;
      out[d] = p.getX(s) - nrm.getX(s) * inset;
      out[d + 1] = p.getY(s) - nrm.getY(s) * inset;
      out[d + 2] = p.getZ(s) - nrm.getZ(s) * inset;
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(out, 3));
  return geo;
}

/** 面を、重心が keep を満たすものだけ残す（髪の生え際・頭巾の顔の開き） */
export function clip(g: THREE.BufferGeometry, keep: (x: number, y: number, z: number) => boolean): THREE.BufferGeometry {
  const src = g.index ? g.toNonIndexed() : g;
  const p = src.attributes.position!;
  const kept: number[] = [];
  for (let t = 0; t < p.count; t += 3) {
    const x = (p.getX(t) + p.getX(t + 1) + p.getX(t + 2)) / 3;
    const y = (p.getY(t) + p.getY(t + 1) + p.getY(t + 2)) / 3;
    const z = (p.getZ(t) + p.getZ(t + 1) + p.getZ(t + 2)) / 3;
    if (!keep(x, y, z)) continue;
    for (let k = 0; k < 3; k++) kept.push(p.getX(t + k), p.getY(t + k), p.getZ(t + k));
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(kept, 3));
  return geo;
}

/** 角を丸めた箱のような殻（球を、指数 e の超楕円体に寄せる。e が小さいほど箱に近い） */
export function roundedShell(center: V3, radii: V3, e = 0.6, ws = 14, hs = 10): THREE.BufferGeometry {
  const g = new THREE.SphereGeometry(1, ws, hs);
  const p = g.attributes.position!;
  const f = (v: number) => Math.sign(v) * Math.pow(Math.abs(v), e);
  for (let i = 0; i < p.count; i++) {
    p.setXYZ(i, center[0] + f(p.getX(i)) * radii[0], center[1] + f(p.getY(i)) * radii[1], center[2] + f(p.getZ(i)) * radii[2]);
  }
  return g;
}

/** 頭巾（かぶる）と帽子 */
export function headwearParts(look: KayKitLook): PartPiece[] {
  const hw = look.headwear;
  if (!hw) return [];
  if (hw.kind === 'hat') {
    // つばの広い帽子（旅人）: つばと、少しすぼまる山
    const brim = new THREE.CylinderGeometry(0.72, 0.74, 0.05, 14);
    brim.translate(0, 2.14, -0.02);
    const crown = new THREE.CylinderGeometry(0.42, 0.5, 0.34, 12);
    crown.translate(0, 2.32, -0.04);
    const band = new THREE.CylinderGeometry(0.505, 0.505, 0.07, 12);
    band.translate(0, 2.19, -0.04);
    return [finish(brim, 'headwear', { a: BONE.head }, true), finish(crown, 'headwear', { a: BONE.head }, true), finish(band, 'accent', { a: BONE.head }, true)];
  }
  // 頭巾: 頭をすっぽり覆う殻に顔の開きを作り、首のまわりへ垂らす
  const shell = roundedShell([0, 1.79, -0.04], [0.65, 0.6, 0.62], 0.66, 16, 12);
  const hood = clip(shell, (x, y, z) => !(z > 0.1 && y < 2.08 && Math.abs(x) < 0.47) && y > 1.25);
  const drape = new THREE.CylinderGeometry(0.5, 0.62, 0.28, 12, 1, true);
  drape.scale(1, 1, 0.85);
  drape.translate(0, 1.18, -0.04);
  return [finish(bothSides(hood), 'headwear', { a: BONE.head }, true), finish(bothSides(drape), 'headwear', { a: BONE.chest }, false)];
}

/** 体の前後の寸法（土台の体ごと）: 胸の前の z、背の z、肩の高さ、裾の y */
const BODY_SIZE = {
  rogue: { front: 0.37, back: -0.33, shoulder: 1.2, hem: 0.42, halfW: 0.4 },
  mage: { front: 0.4, back: -0.38, shoulder: 1.2, hem: 0.36, halfW: 0.43 },
  barbarian: { front: 0.38, back: -0.36, shoulder: 1.22, hem: 0.4, halfW: 0.42 },
} as const;

/** 背のマント・外套と、首の後ろに下ろした頭巾 */
export function cloakParts(look: KayKitLook): PartPiece[] {
  const c = look.cloak;
  if (!c) return [];
  const b = BODY_SIZE[look.base];
  const bottom = c.length === 'long' ? 0.12 : 0.62;
  const h = b.shoulder - bottom;
  // 背の布: 円すい台の後ろ側だけ（すそが広がる）。肩から下へ
  const panel = new THREE.CylinderGeometry(0.44, c.length === 'long' ? 0.68 : 0.52, h, 12, 5, true, Math.PI - 1.45, 2.9);
  panel.scale(1, 1, 0.82);
  panel.translate(0, bottom + h / 2, 0.0);
  // 肩を覆う上の輪（外套が肩に掛かっているように）
  const yoke = new THREE.CylinderGeometry(0.3, 0.5, 0.2, 14, 1, true);
  yoke.scale(1, 1, 0.86);
  yoke.translate(0, b.shoulder + 0.02, -0.01);
  const pieces: PartPiece[] = [
    finish(bothSides(panel), 'cloak', { a: BONE.chest, b: BONE.hips, topY: 0.9, lowY: bottom }, false),
    finish(bothSides(yoke), 'cloak', { a: BONE.chest }, false),
  ];
  // 襟（差し色）
  if (look.accent !== undefined) {
    // 襟は太め（髪と外套が1つの黒い塊に見えないように、境目に差し色を見せる。観客の検査）
    const collar = new THREE.TorusGeometry(0.28, 0.075, 5, 12);
    collar.rotateX(Math.PI / 2);
    collar.scale(1, 1, 0.9);
    collar.translate(0, b.shoulder + 0.1, 0.0);
    pieces.push(finish(collar, 'accent', { a: BONE.chest }, false));
  }
  if (c.hoodDown) {
    // 首の後ろに下ろした頭巾（丸まった布）
    const hood = roundedShell([0, b.shoulder - 0.02, -0.36], [0.3, 0.2, 0.14], 0.7, 10, 8);
    pieces.push(finish(hood, 'cloakInner', { a: BONE.chest }, false));
  }
  return pieces;
}

/** 肩掛け（短い肩のマント） */
export function mantleParts(look: KayKitLook): PartPiece[] {
  if (look.mantle === undefined) return [];
  const b = BODY_SIZE[look.base];
  const g = new THREE.CylinderGeometry(0.3, 0.5, 0.26, 16, 2, true);
  g.scale(1, 1, 0.84);
  // 前を少し下げる（胸の前で布が重なる形）
  const p = g.attributes.position!;
  for (let i = 0; i < p.count; i++) if (p.getZ(i) > 0.1 && p.getY(i) < 0) p.setY(i, p.getY(i) - 0.06 * (p.getZ(i) / 0.5));
  g.translate(0, b.shoulder - 0.04, -0.01);
  return [finish(bothSides(g), 'mantle', { a: BONE.chest }, false)];
}

/**
 * スカート（腰から膝の上まで、裾が広がる）。上の縁は腰の骨に、裾は左右の腿の骨にも付けて、歩く・座る時に脚に付いてくるようにする
 */
export function skirtParts(look: KayKitLook): PartPiece[] {
  if (!look.skirt) return [];
  const b = BODY_SIZE[look.base];
  const top = 0.8;
  const bottom = 0.34;
  const g = new THREE.CylinderGeometry(b.halfW - 0.02, b.halfW + 0.15, top - bottom, 16, 3, true);
  g.scale(1, 1, 0.92);
  // 裾に、ゆるい波（布のひだ）を付ける
  const p = g.attributes.position!;
  for (let i = 0; i < p.count; i++) {
    const y = p.getY(i);
    const k = (0.5 - y / (top - bottom)) * 0.5;
    const a = Math.atan2(p.getX(i), p.getZ(i));
    const r = 1 + Math.sin(a * 8) * 0.035 * k;
    p.setXYZ(i, p.getX(i) * r, y, p.getZ(i) * r);
  }
  g.translate(0, (top + bottom) / 2, (b.front + b.back) / 2);
  const piece = finish(bothSides(g), 'skirt', { a: BONE.hips }, false);
  // 裾ほど腿の骨へ重さを移す（右と左は x の向きで分け、前と後ろの真ん中は両方の腿へ）
  const pos = piece.geometry.attributes.position!;
  const si = piece.geometry.attributes.skinIndex!;
  const sw = piece.geometry.attributes.skinWeight!;
  for (let i = 0; i < pos.count; i++) {
    const down = Math.min(1, Math.max(0, (top - 0.08 - pos.getY(i)) / (top - 0.08 - bottom)));
    const leg = down * 0.75;
    const x = pos.getX(i);
    const l = Math.min(1, Math.max(0, 0.5 + x / 0.3));
    si.setXYZW(i, BONE.hips, BONE.upperlegL, BONE.upperlegR, 0);
    sw.setXYZW(i, 1 - leg, leg * l, leg * (1 - l), 0);
  }
  return [piece];
}

/** 前掛け（bib で胸当てつき）と、腰の紐 */
export function apronParts(look: KayKitLook): PartPiece[] {
  const a = look.apron;
  if (!a) return [];
  const b = BODY_SIZE[look.base];
  // スカートの上に掛ける時は、スカートより外へ、短めに
  const over = look.skirt !== undefined;
  const r = b.front + (over ? 0.08 : 0.06);
  const top = 0.74;
  const bottom = over ? 0.45 : Math.max(0.3, b.hem - 0.04);
  const skirt = new THREE.CylinderGeometry(r, r + (over ? 0.12 : 0.08), top - bottom, 10, 2, true, -0.85, 1.7);
  skirt.translate(0, (top + bottom) / 2, 0.0);
  const pieces: PartPiece[] = [finish(bothSides(skirt), 'apron', { a: BONE.hips }, false)];
  const band = new THREE.CylinderGeometry(r - 0.01, r - 0.01, 0.06, 14, 1, true);
  band.translate(0, top + 0.01, 0);
  pieces.push(finish(bothSides(band), 'apron', { a: BONE.hips }, false));
  if (a.bib) {
    const bib = new THREE.CylinderGeometry(r - 0.03, r - 0.01, 0.28, 8, 1, true, -0.38, 0.76);
    bib.translate(0, top + 0.15, 0);
    pieces.push(finish(bothSides(bib), 'apron', { a: BONE.chest }, false));
  }
  return pieces;
}

/** 首の布（差し色。外套のない人物の差し色を見せる所） */
export function scarfParts(look: KayKitLook): PartPiece[] {
  if (look.accent === undefined || look.cloak || (look.hair.extras?.length ?? 0) > 0) return [];
  const b = BODY_SIZE[look.base];
  const g = new THREE.TorusGeometry(0.25, 0.06, 5, 12);
  g.rotateX(Math.PI / 2);
  g.translate(0, b.shoulder + 0.08, 0.01);
  return [finish(g, 'accent', { a: BONE.chest }, false)];
}

/** 人物の自作の部品をすべて */
export function customParts(look: KayKitLook): PartPiece[] {
  // 髪は src/render/kaykitHair.ts（頭巾をかぶる時は作らない）
  return [...headwearParts(look), ...cloakParts(look), ...mantleParts(look), ...skirtParts(look), ...apronParts(look), ...scarfParts(look)];
}
