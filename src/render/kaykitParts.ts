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
  accent: [5, 3, 'l'],
  // 2つ目の差し色（外套の縁・胸の印・髪飾りの金具）
  accentB: [5, 3, 'r'],
  cloakInner: [6, 3, 'l'],
  skirt: [6, 3, 'r'],
  hairDark: [7, 3, 'l'],
  iris: [7, 3, 'r'],
  // 素材の頭の目の区画（まつ毛を目と同じ色にする）
  eye: [2, 0],
  // 素材の頭の肌の区画（頭の中の玉）
  skin: [0, 0],
  // 素材の体が使っていない区画（どの体・頭も使っていないことを確かめた）: 素手・油染み・工具の木の柄・工具の鉄
  hands: [4, 1],
  stain: [5, 1, 'l'],
  // 鞘（革の暗い色）
  sheath: [5, 1, 'r'],
  wood: [6, 1, 'l'],
  // 脚の筒（長靴・巻き布）
  shin: [6, 1, 'r'],
  metal: [1, 2, 'l'],
  // 真鍮（剣の柄・帯の金具）
  brass: [1, 2, 'r'],
} as const satisfies Record<string, readonly [number, number] | readonly [number, number, 'l' | 'r']>;
export type PartCell = keyof typeof PART_CELLS;

/** 骨の番号（KayKit の5人で共通の骨の順番） */
export const BONE = { hips: 1, spine: 2, chest: 3, upperarmL: 4, upperarmR: 9, head: 14, upperlegL: 15, lowerlegL: 16, upperlegR: 19, lowerlegR: 20 } as const;

/** 1つの部品: 形と、付く骨（2つまで。重さは高さで決める） */
export interface PartPiece {
  readonly geometry: THREE.BufferGeometry;
  /** 頭の骨に付く（組み立てる時に頭と一緒に縮める） */
  readonly onHead: boolean;
  /** 前髪の1房（生え際を軸に揺れる骨に付け直す。src/render/kaykit.ts） */
  readonly forelock?: boolean;
  /** 輪郭線を付けない（頭の中の玉。穴から見えた時に、輪郭線の黒が出ないように） */
  readonly noOutline?: boolean;
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
  const bottom = c.length === 'long' ? 0.12 : c.length === 'knee' ? 0.3 : 0.62;
  const h = b.shoulder - bottom;
  const rBottom = c.length === 'long' ? 0.68 : c.length === 'knee' ? 0.62 : 0.52;
  // 背の布: 円すい台の後ろ側だけ（すそが広がる）。肩から下へ
  const panel = new THREE.CylinderGeometry(0.44, rBottom, h, 12, 5, true, Math.PI - 1.45, 2.9);
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
  if (c.front) {
    // 前の身頃（左右。真ん中は開けて、上着と帯を見せる）。体の前へ食い込まないように、前は少し外へ
    for (const [start, len] of [
      [0.3, 0.85],
      [Math.PI * 2 - 1.15, 0.85],
    ] as const) {
      const f = new THREE.CylinderGeometry(0.4, rBottom + 0.02, h, 6, 5, true, start, len);
      f.scale(1, 1, 0.98);
      f.translate(0, bottom + h / 2, 0);
      pieces.push(finish(bothSides(f), 'cloak', { a: BONE.chest, b: BONE.hips, topY: 0.9, lowY: bottom }, false));
      if (c.edge) {
        // 前の開きの縦の縁と、前の裾の縁
        const at = start < Math.PI ? start : start + len - 0.07;
        const v = new THREE.CylinderGeometry(0.408, rBottom + 0.028, h, 2, 5, true, at, 0.07);
        v.scale(1, 1, 0.98);
        v.translate(0, bottom + h / 2, 0);
        pieces.push(finish(bothSides(v), 'accentB', { a: BONE.chest, b: BONE.hips, topY: 0.9, lowY: bottom }, false));
        const t = 0.045;
        const fh = new THREE.CylinderGeometry(rBottom + 0.03, rBottom + 0.03, t, 6, 1, true, start, len);
        fh.scale(1, 1, 0.98);
        fh.translate(0, bottom + t / 2, 0);
        pieces.push(finish(bothSides(fh), 'accentB', { a: BONE.chest, b: BONE.hips, topY: 0.9, lowY: bottom }, false));
      }
    }
  }
  if (c.edge) {
    // 裾の細い縁（暗い場面でも外套の輪郭が残るように）
    const t = 0.045;
    const hem = new THREE.CylinderGeometry(rBottom - ((rBottom - 0.44) * t) / h + 0.012, rBottom + 0.012, t, 12, 1, true, Math.PI - 1.47, 2.94);
    hem.scale(1, 1, 0.82);
    hem.translate(0, bottom + t / 2, 0);
    pieces.push(finish(bothSides(hem), 'accentB', { a: BONE.chest, b: BONE.hips, topY: 0.9, lowY: bottom }, false));
  }
  // 襟（差し色）
  if (look.accent !== undefined) {
    // 襟は太め（髪と外套が1つの黒い塊に見えないように、境目に差し色を見せる。観客の検査）
    // 口元にかからない高さ（場面4の顔の直しの観客の検査: 口元の青緑の襟が、顔の下半分の緑の肌やひげの影に見えたため下げた）
    const collar = new THREE.TorusGeometry(0.28, 0.062, 5, 12);
    collar.rotateX(Math.PI / 2);
    collar.scale(1, 1, 0.9);
    collar.translate(0, b.shoulder + 0.075, 0.0);
    pieces.push(finish(collar, 'accent', { a: BONE.chest }, false));
    if (c.edge) {
      // 襟の上の細い縁
      const line = new THREE.TorusGeometry(0.285, 0.016, 5, 16);
      line.rotateX(Math.PI / 2);
      line.scale(1, 1, 0.9);
      line.translate(0, b.shoulder + 0.13, 0.0);
      pieces.push(finish(line, 'accentB', { a: BONE.chest }, false));
    }
  }
  if (c.hoodDown) {
    // 首の後ろに下ろした頭巾（丸まった布）
    const hood = roundedShell([0, b.shoulder - 0.02, -0.36], [0.3, 0.2, 0.14], 0.7, 10, 8);
    pieces.push(finish(hood, 'cloakInner', { a: BONE.chest }, false));
  }
  return pieces;
}

/** 胸か肩の丸い印（門の輪をかたどった、輪と中の小さな円） */
export function emblemParts(look: KayKitLook): PartPiece[] {
  if (!look.emblem) return [];
  const b = BODY_SIZE[look.base];
  const ring = new THREE.TorusGeometry(0.045, 0.011, 6, 18);
  const dot = new THREE.CylinderGeometry(0.014, 0.014, 0.01, 12);
  dot.rotateX(Math.PI / 2);
  const g = [ring, dot];
  if (look.emblem === 'chest') {
    // 肩の短い外套がある時は、その上（左胸）に
    if (look.capelet) {
      const yy = b.shoulder - 0.16;
      // 外套の面（上の半径 0.3・下の半径 0.64・高さ 0.44・前後 0.9 倍）の上の、左前 0.5 ラジアンの所
      const r = 0.3 + (0.64 - 0.3) * ((b.shoulder + 0.1 - yy) / 0.44) + 0.012;
      const a = 0.5;
      for (const x of g) {
        x.rotateX(-0.62);
        x.rotateY(a * 0.85);
        x.translate(Math.sin(a) * r, yy, Math.cos(a) * r * 0.9 - 0.01);
      }
      return g.map((x) => finish(x, 'accentB', { a: BONE.chest }, false));
    }
    // 外套の前の身頃がある時は、その上（左胸）に
    const onCoat = look.cloak?.front === true;
    for (const x of g) {
      x.rotateX(-0.12);
      if (onCoat) x.rotateY(0.5);
      x.translate(onCoat ? 0.21 : 0.16, b.shoulder - (onCoat ? 0.18 : 0.2), onCoat ? 0.405 : b.front + 0.035);
    }
  } else {
    for (const x of g) {
      x.rotateY(Math.PI / 2 - 0.35);
      x.rotateZ(-0.3);
      x.translate(0.43, b.shoulder - 0.03, 0.08);
    }
  }
  return g.map((x) => finish(x, 'accentB', { a: BONE.chest }, false));
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

/** スカートの裾の広がり（腰の幅からの増え） */
function skirtFlare(look: KayKitLook): number {
  return look.skirt?.length === 'ankle' ? 0.2 : 0.15;
}

/**
 * スカート（腰から膝の上まで、裾が広がる）。上の縁は腰の骨に、裾は左右の腿の骨にも付けて、歩く・座る時に脚に付いてくるようにする
 */
export function skirtParts(look: KayKitLook): PartPiece[] {
  if (!look.skirt) return [];
  const b = BODY_SIZE[look.base];
  const top = 0.8;
  const bottom = look.skirt.length === 'ankle' ? 0.07 : 0.34;
  const g = new THREE.CylinderGeometry(b.halfW - 0.02, b.halfW + skirtFlare(look), top - bottom, 16, look.skirt.length === 'ankle' ? 6 : 3, true);
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

/** 前掛け（bib で胸当てつき）と、腰の紐。丈（length）・胸当ての肩紐（straps）・前の結び目（tie） */
export function apronParts(look: KayKitLook): PartPiece[] {
  const a = look.apron;
  if (!a) return [];
  const b = BODY_SIZE[look.base];
  // スカートの上に掛ける時は、スカートより外へ
  const over = look.skirt !== undefined;
  const r = b.front + (over ? 0.08 : 0.06);
  const top = 0.74;
  const bottom = a.length === 'ankle' ? 0.1 : a.length === 'knee' ? 0.22 : over ? 0.45 : Math.max(0.3, b.hem - 0.04);
  // 裾の広がり: スカートの上では、スカートの裾より外へ出す（スカートの真ん中は体の前後の真ん中）
  const flare = over ? Math.max(0.12, (skirtFlare(look) + b.halfW - r) * ((top - bottom) / (0.8 - (look.skirt?.length === 'ankle' ? 0.07 : 0.34))) + 0.05) : a.length ? 0.12 : 0.08;
  const skirt = new THREE.CylinderGeometry(r, r + flare, top - bottom, 16, a.length ? 4 : 2, true, -0.85, 1.7);
  skirt.translate(0, (top + bottom) / 2, over ? (b.front + b.back) / 2 * 0.5 : 0.0);
  const legs = a.length !== undefined;
  const pieces: PartPiece[] = [];
  const front = finish(bothSides(skirt), 'apron', { a: BONE.hips }, false);
  if (legs) {
    // 膝の下まである前掛けは、裾ほど左右の腿の骨へ重さを移す（歩く時に脚に付いてくる）
    const pos = front.geometry.attributes.position!;
    const si = front.geometry.attributes.skinIndex!;
    const sw = front.geometry.attributes.skinWeight!;
    for (let i = 0; i < pos.count; i++) {
      const down = Math.min(1, Math.max(0, (top - 0.1 - pos.getY(i)) / (top - 0.1 - bottom)));
      const leg = down * 0.7;
      const l = Math.min(1, Math.max(0, 0.5 + pos.getX(i) / 0.3));
      si.setXYZW(i, BONE.hips, BONE.upperlegL, BONE.upperlegR, 0);
      sw.setXYZW(i, 1 - leg, leg * l, leg * (1 - l), 0);
    }
  }
  pieces.push(front);
  const band = new THREE.CylinderGeometry(r - 0.01, r - 0.01, 0.06, 14, 1, true);
  band.translate(0, top + 0.01, 0);
  pieces.push(finish(bothSides(band), 'apron', { a: BONE.hips }, false));
  if (a.bib) {
    const bh = a.straps ? 0.36 : 0.28;
    const bib = new THREE.CylinderGeometry(r - 0.03, r - 0.01, bh, 8, 1, true, -0.38, 0.76);
    bib.translate(0, top + bh / 2 + 0.01, 0);
    pieces.push(finish(bothSides(bib), 'apron', { a: BONE.chest }, false));
    if (a.straps) {
      // 胸当ての上の角から、肩を越えて背へ回る細い紐
      for (const sx of [-1, 1]) {
        const pts = [
          new THREE.Vector3(sx * 0.13, top + bh, r - 0.02),
          new THREE.Vector3(sx * 0.16, b.shoulder - 0.04, b.front - 0.04),
          new THREE.Vector3(sx * 0.19, b.shoulder + 0.0, 0),
          new THREE.Vector3(sx * 0.15, b.shoulder - 0.08, b.back + 0.02),
          new THREE.Vector3(sx * 0.08, top + 0.12, b.back - 0.01),
        ];
        pieces.push(finish(tubeAlong(pts, 0.018, 0.5), 'apron', { a: BONE.chest }, false));
      }
    }
  }
  if (a.tie) {
    // 前の結び目と、膝の上まで垂れた2本の端（腰の紐と同じ布）
    const knot = roundedShell([0.03, top + 0.01, r + 0.02], [0.07, 0.045, 0.035], 0.6, 10, 8);
    pieces.push(finish(knot, 'apron', { a: BONE.hips }, false));
    for (const [dx, len, tilt] of [
      [-0.02, 0.34, 0.08],
      [0.07, 0.28, -0.1],
    ] as const) {
      const tail = new THREE.BoxGeometry(0.06, len, 0.012);
      tail.translate(0, -len / 2, 0);
      tail.rotateZ(tilt);
      tail.translate(0.03 + dx, top - 0.02, r + 0.035);
      pieces.push(finish(tail, 'apron', { a: BONE.hips }, false));
    }
  }
  return pieces;
}

/** 点の列に沿った、断面の丸い細い管（紐・帯） */
function tubeAlong(points: readonly THREE.Vector3[], radius: number, flat = 1): THREE.BufferGeometry {
  const curve = new THREE.CatmullRomCurve3([...points]);
  const g = new THREE.TubeGeometry(curve, Math.max(8, points.length * 5), radius, 6, false);
  if (flat !== 1) {
    // 断面を平たくする（帯のように）。曲線の向きに関わらず、体の外向き（前後）を薄くする
    const p = g.attributes.position!;
    const c = new THREE.Vector3();
    for (let i = 0; i < p.count; i++) {
      const t = Math.min(1, Math.floor(i / 7) / Math.max(1, Math.max(8, points.length * 5)));
      curve.getPoint(t, c);
      const dz = p.getZ(i) - c.z;
      p.setZ(i, c.z + dz * flat);
    }
  }
  return g;
}

/** 首の布（差し色。外套のない人物の差し色を見せる所） */
export function scarfParts(look: KayKitLook): PartPiece[] {
  if (look.neckerchief) {
    const b = BODY_SIZE[look.base];
    const ring = new THREE.TorusGeometry(0.24, 0.042, 5, 14);
    ring.rotateX(Math.PI / 2);
    ring.translate(0, b.shoulder + 0.01, 0.01);
    // 前の結び目と、胸へ垂れる小さな三角
    const knot = new THREE.SphereGeometry(0.05, 10, 8);
    knot.translate(0.05, b.shoulder - 0.02, b.front - 0.08);
    const tip = new THREE.ConeGeometry(0.075, 0.13, 3);
    tip.rotateX(Math.PI);
    tip.scale(1, 1, 0.4);
    tip.translate(0.03, b.shoulder - 0.11, b.front - 0.08);
    return [ring, knot, tip].map((g) => finish(g, 'accent', { a: BONE.chest }, false));
  }
  if (look.accent === undefined || look.cloak || look.sash !== undefined || (look.hair.extras?.length ?? 0) > 0) return [];
  const b = BODY_SIZE[look.base];
  const g = new THREE.TorusGeometry(0.25, 0.06, 5, 12);
  g.rotateX(Math.PI / 2);
  g.translate(0, b.shoulder + 0.08, 0.01);
  return [finish(g, 'accent', { a: BONE.chest }, false)];
}

/**
 * 腰の工具（ユナ）: 右の腰に、帯から下げた革の袋と、袋から出た金槌の柄と頭、ねじ回し。腰の骨に付ける（歩く時に体と一緒に動く）
 */
export function toolParts(look: KayKitLook): PartPiece[] {
  if (!look.tools) return [];
  const b = BODY_SIZE[look.base];
  const hip = { a: BONE.hips };
  const side = b.halfW + 0.02;
  const pouch = roundedShell([side, 0.6, 0.1], [0.08, 0.12, 0.11], 0.55, 10, 8);
  const flap = roundedShell([side + 0.005, 0.7, 0.1], [0.085, 0.035, 0.115], 0.6, 10, 6);
  // 金槌: 袋から上へ出た柄と、横向きの頭
  const handle = new THREE.CylinderGeometry(0.022, 0.026, 0.26, 8);
  handle.rotateZ(-0.12);
  handle.translate(side + 0.02, 0.78, 0.13);
  const head = new THREE.CylinderGeometry(0.035, 0.035, 0.15, 8);
  head.rotateX(Math.PI / 2);
  head.translate(side + 0.035, 0.91, 0.13);
  // ねじ回し: 袋の後ろから出た細い軸と柄
  const shaft = new THREE.CylinderGeometry(0.012, 0.012, 0.12, 6);
  shaft.rotateZ(0.2);
  shaft.translate(side - 0.01, 0.76, 0.03);
  const grip = new THREE.CylinderGeometry(0.026, 0.022, 0.08, 8);
  grip.rotateZ(0.2);
  grip.translate(side - 0.025, 0.84, 0.03);
  return [
    finish(pouch, 'apron', hip, false),
    finish(flap, 'apron', hip, false),
    finish(handle, 'wood', hip, false),
    finish(head, 'metal', hip, false),
    finish(shaft, 'metal', hip, false),
    finish(grip, 'wood', hip, false),
  ];
}

/** 肩当て（戦う人）: 左右の肩に、丸くなめらかな大きな板を1枚ずつ。胸の骨に付ける */
export function pauldronParts(look: KayKitLook): PartPiece[] {
  if (!look.pauldrons) return [];
  const b = BODY_SIZE[look.base];
  const cell: PartCell = look.pauldrons === 'iron' ? 'metal' : 'stain';
  return [-1, 1].map((sx) => {
    // 腕の付け根の上にかぶせる丸い殻（骨を付けた時の姿勢は腕を横に広げた形なので、上腕の骨に付けて腕と一緒に下ろす）
    const shell = roundedShell([sx * (b.halfW + 0.02), b.shoulder + 0.01, 0], [0.17, 0.13, 0.2], 0.6, 12, 8);
    const g = clip(shell, (_x, y) => y > b.shoulder - 0.07);
    return finish(bothSides(g), cell, { a: sx > 0 ? BONE.upperarmL : BONE.upperarmR }, false);
  });
}


/** 肩の短い外套（肘まで。前の開いたケープ）と、裾と前の開きの細い縁 */
export function capeletParts(look: KayKitLook): PartPiece[] {
  const c = look.capelet;
  if (!c) return [];
  const b = BODY_SIZE[look.base];
  const topY = b.shoulder + 0.1;
  const h = 0.44;
  const rTop = 0.3;
  const rBottom = 0.64;
  // 前の真ん中を開ける（gap ラジアン）
  const gap = 0.26;
  const shape = (r0: number, r1: number, hh: number, start: number, len: number, segs = 20) => {
    const g = new THREE.CylinderGeometry(r0, r1, hh, segs, 3, true, start, len);
    g.scale(1, 1, 0.9);
    return g;
  };
  const cape = shape(rTop, rBottom, h, gap / 2, Math.PI * 2 - gap);
  cape.translate(0, topY - h / 2, -0.01);
  const pieces = [finish(bothSides(cape), 'mantle', { a: BONE.chest }, false)];
  if (c.edge) {
    // 裾の縁（外套の裾の外側に沿う細い帯）と、前の開きの縦の縁
    const t = 0.045;
    const k = t / h;
    const hem = shape(rBottom - (rBottom - rTop) * k + 0.008, rBottom + 0.008, t, gap / 2, Math.PI * 2 - gap);
    hem.translate(0, topY - h + t / 2, -0.01);
    pieces.push(finish(bothSides(hem), 'accentB', { a: BONE.chest }, false));
    for (const at of [gap / 2, Math.PI * 2 - gap / 2 - 0.07]) {
      const v = shape(rTop + 0.008, rBottom + 0.008, h, at, 0.07, 2);
      v.translate(0, topY - h / 2, -0.01);
      pieces.push(finish(bothSides(v), 'accentB', { a: BONE.chest }, false));
    }
  }
  return pieces;
}

/** 右の肩から左の腰へ斜めに掛けた革帯と、胸の金具 */
export function baldricParts(look: KayKitLook): PartPiece[] {
  if (!look.baldric) return [];
  const b = BODY_SIZE[look.base];
  const pts = [
    new THREE.Vector3(-0.2, b.shoulder + 0.08, 0.05),
    new THREE.Vector3(-0.16, b.shoulder - 0.02, b.front - 0.02),
    new THREE.Vector3(0.0, b.shoulder - 0.24, b.front + 0.025),
    new THREE.Vector3(0.2, 0.86, b.front + 0.015),
    new THREE.Vector3(0.32, 0.74, b.front - 0.06),
  ];
  const strap = tubeAlong(pts, 0.036, 0.35);
  const piece = finish(strap, 'sheath', { a: BONE.chest, b: BONE.hips, topY: 1.0, lowY: 0.74 }, false);
  // 胸の金具（四角い輪）
  const buckle = new THREE.TorusGeometry(0.03, 0.009, 4, 4);
  buckle.rotateZ(Math.PI / 4);
  buckle.rotateZ(0.65);
  buckle.translate(-0.07, b.shoulder - 0.16, b.front + 0.045);
  return [piece, finish(buckle, 'brass', { a: BONE.chest }, false)];
}

/** 左の腰に下げた、鞘に入った剣（柄は前上へ、鞘の先は後ろ下へ） */
export function scabbardParts(look: KayKitLook): PartPiece[] {
  if (!look.scabbard) return [];
  const b = BODY_SIZE[look.base];
  const hip = { a: BONE.hips };
  const x = b.halfW + 0.03;
  const top = new THREE.Vector3(x - 0.02, 0.76, 0.16);
  const tip = new THREE.Vector3(x + 0.06, 0.34, -0.2);
  const dir = tip.clone().sub(top);
  const len = dir.length();
  const along = (g: THREE.BufferGeometry, from: THREE.Vector3, d: THREE.Vector3) => {
    g.translate(0, -0.5 * 1, 0);
    g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, -1, 0), d.clone().normalize()));
    g.translate(from.x, from.y, from.z);
    return g;
  };
  const sheath = new THREE.CylinderGeometry(0.034, 0.026, 1, 8);
  sheath.scale(1, len, 0.7);
  sheath.translate(0, 0, 0);
  const sh = along(sheath, top, dir);
  const tipCap = new THREE.SphereGeometry(0.03, 8, 6);
  tipCap.translate(tip.x, tip.y, tip.z);
  // 柄: 鞘の口から前上へ
  const up = dir.clone().normalize().multiplyScalar(-1);
  const grip = new THREE.CylinderGeometry(0.02, 0.02, 1, 8);
  grip.scale(1, 0.17, 1);
  const gStart = top.clone().add(up.clone().multiplyScalar(0.03));
  const gr = new THREE.CylinderGeometry(0.02, 0.02, 0.17, 8);
  gr.translate(0, 0.085, 0);
  gr.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), up));
  gr.translate(gStart.x, gStart.y, gStart.z);
  const guard = new THREE.BoxGeometry(0.17, 0.028, 0.04);
  guard.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), up));
  guard.translate(gStart.x, gStart.y, gStart.z);
  const pommelAt = gStart.clone().add(up.clone().multiplyScalar(0.19));
  const pommel = new THREE.SphereGeometry(0.032, 10, 8);
  pommel.translate(pommelAt.x, pommelAt.y, pommelAt.z);
  return [finish(sh, 'sheath', hip, false), finish(tipCap, 'brass', hip, false), finish(gr, 'sheath', hip, false), finish(guard, 'brass', hip, false), finish(pommel, 'brass', hip, false)];
}

/** 脚の1本（骨を付けた時の姿勢での、膝と足首の位置） */
export interface LegAxis {
  readonly bone: number;
  readonly knee: THREE.Vector3;
  readonly ankle: THREE.Vector3;
}

/** 脚の筒（膝の下から足首まで）。長靴の筒（上を折り返す）か、帯を重ねた巻き布 */
export function shinParts(look: KayKitLook, legs: readonly LegAxis[]): PartPiece[] {
  const s = look.shins;
  if (!s) return [];
  const pieces: PartPiece[] = [];
  for (const leg of legs) {
    const y0 = leg.ankle.y + 0.07;
    const y1 = leg.knee.y - (s.kind === 'boots' ? 0.02 : 0.05);
    const h = y1 - y0;
    const r = s.kind === 'boots' ? 0.13 : 0.125;
    const tube = new THREE.CylinderGeometry(r + (s.kind === 'boots' ? 0.012 : 0), r - 0.01, h, 12, 2, true);
    tube.translate(leg.ankle.x, y0 + h / 2, leg.ankle.z + 0.005);
    pieces.push(finish(bothSides(tube, 0.008), 'shin', { a: leg.bone }, false));
    if (s.kind === 'boots' && s.cuff) {
      const cuff = new THREE.CylinderGeometry(r + 0.04, r + 0.03, 0.08, 12, 1, true);
      cuff.translate(leg.ankle.x, y1 - 0.03, leg.ankle.z + 0.005);
      pieces.push(finish(bothSides(cuff, 0.008), 'shin', { a: leg.bone }, false));
    }
    if (s.kind === 'wraps') {
      // 巻き布の帯（少し斜めの輪を重ねる）
      for (let i = 0; i < 4; i++) {
        const ring = new THREE.TorusGeometry(r + 0.006, 0.016, 4, 14);
        ring.rotateX(Math.PI / 2 + (i % 2 ? 0.22 : -0.22));
        ring.translate(leg.ankle.x, y0 + 0.04 + (h - 0.06) * (i / 3), leg.ankle.z + 0.005);
        pieces.push(finish(ring, 'shin', { a: leg.bone }, false));
      }
    }
  }
  return pieces;
}

/** 袖のない胴着（前の開いた、腰までの上着。背と左右の前身頃。脇は腕を通す所として開ける） */
export function vestParts(look: KayKitLook): PartPiece[] {
  if (look.vest === undefined) return [];
  const b = BODY_SIZE[look.base];
  const top = b.shoulder + 0.03;
  const bottom = 0.5;
  const h = top - bottom;
  const pieces: PartPiece[] = [];
  for (const [start, len] of [
    [Math.PI - 1.3, 2.6],
    [0.42, 0.85],
    [Math.PI * 2 - 1.27, 0.85],
  ] as const) {
    const g = new THREE.CylinderGeometry(b.halfW - 0.04, b.halfW + 0.05, h, 10, 4, true, start, len);
    g.scale(1, 1, 0.94);
    g.translate(0, bottom + h / 2, (b.front + b.back) / 2);
    pieces.push(finish(bothSides(g), 'cloak', { a: BONE.chest, b: BONE.hips, topY: 0.95, lowY: bottom }, false));
  }
  return pieces;
}

/** 腰に巻いた布の帯（前で結んで、端を垂らす） */
export function sashParts(look: KayKitLook): PartPiece[] {
  if (look.sash === undefined) return [];
  const b = BODY_SIZE[look.base];
  const y = 0.76;
  const band = new THREE.CylinderGeometry(b.halfW + 0.035, b.halfW + 0.045, 0.14, 16, 1, true);
  band.scale(1, 1, 0.95);
  band.translate(0, y, (b.front + b.back) / 2);
  const hip = { a: BONE.hips };
  const knot = roundedShell([-0.1, y, b.front + 0.05], [0.08, 0.06, 0.05], 0.6, 10, 8);
  const pieces = [finish(bothSides(band), 'accent', hip, false), finish(knot, 'accent', hip, false)];
  for (const [dx, len, tilt] of [
    [-0.14, 0.4, 0.12],
    [-0.04, 0.32, -0.06],
  ] as const) {
    const tail = new THREE.BoxGeometry(0.085, len, 0.016);
    tail.translate(0, -len / 2, 0);
    tail.rotateZ(tilt);
    tail.translate(dx, y - 0.03, b.front + 0.06);
    pieces.push(finish(tail, 'accent', hip, false));
  }
  return pieces;
}

/** 人物の自作の部品をすべて */
export function customParts(look: KayKitLook): PartPiece[] {
  // 髪は src/render/kaykitHair.ts（頭巾をかぶる時は作らない）
  return [
    ...headwearParts(look),
    ...cloakParts(look),
    ...capeletParts(look),
    ...emblemParts(look),
    ...mantleParts(look),
    ...vestParts(look),
    ...skirtParts(look),
    ...apronParts(look),
    ...sashParts(look),
    ...baldricParts(look),
    ...scabbardParts(look),
    ...scarfParts(look),
    ...toolParts(look),
    ...pauldronParts(look),
  ];
}
