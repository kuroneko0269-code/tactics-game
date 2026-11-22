import * as THREE from 'three';
import type { KayKitLook } from '../data/story/looks';
import { BONE, finish, type PartPiece } from './kaykitParts';

/**
 * KayKit の人形の髪に、自作で足す塊（場面4の KayKit の人形の髪の作り直し）。
 *
 * 髪そのものは、作者が頭と一体で作った髪（knight 短い・rogue 中くらいの長さ・mage 長い）を使う（src/render/kaykit.ts）。
 * ここでは、作者の髪に無い形（ユナの二つ結びのおさげ、母の後ろのまとめ、試作の1つに結んだ房）だけを、
 * 細い束や小さな突起ではなく、数個の大きくなめらかな塊で作る（輪郭線が髪の中に細かく出ないように）。
 *
 * 座標は素材の頭の座標（頭を縮める前。足もとが 0、正面が +z、頭の骨は y 1.241、顔の高さは y 1.2〜2.0）。頭の骨に付ける。
 */

type V3 = readonly [number, number, number];

/** 曲線に沿った、断面が丸い（少し平たい）なめらかな塊。radius(u) で根もと 0 から先 1 までの太さを決める。両端は閉じる */
function smoothTube(points: readonly V3[], radius: (u: number) => number, flat = 0.8, samples = 16, K = 14): THREE.BufferGeometry {
  const curve = new THREE.CatmullRomCurve3(points.map((p) => new THREE.Vector3(...p)));
  const frames = curve.computeFrenetFrames(samples, false);
  const pos: number[] = [];
  const index: number[] = [];
  for (let i = 0; i <= samples; i++) {
    const u = i / samples;
    const c = curve.getPointAt(u);
    const r = Math.max(0.004, radius(u));
    const n = frames.normals[i]!;
    const b = frames.binormals[i]!;
    for (let k = 0; k < K; k++) {
      const a = (k / K) * Math.PI * 2;
      const q = c
        .clone()
        .addScaledVector(n, Math.cos(a) * r * flat)
        .addScaledVector(b, Math.sin(a) * r);
      pos.push(q.x, q.y, q.z);
    }
  }
  for (let i = 0; i < samples; i++)
    for (let k = 0; k < K; k++) {
      const a = i * K + k;
      const b = i * K + ((k + 1) % K);
      index.push(a, b, a + K, b, b + K, a + K);
    }
  const startC = curve.getPointAt(0);
  const endC = curve.getPointAt(1);
  pos.push(startC.x, startC.y, startC.z, endC.x, endC.y, endC.z);
  const s0 = (samples + 1) * K;
  for (let k = 0; k < K; k++) {
    index.push(s0, (k + 1) % K, k);
    index.push(s0 + 1, samples * K + k, samples * K + ((k + 1) % K));
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setIndex(index);
  return g;
}

/** なめらかな楕円の玉（リボンの羽・結び目・まとめ髪） */
function blob(center: V3, size: V3, rot: V3 = [0, 0, 0]): THREE.BufferGeometry {
  const g = new THREE.SphereGeometry(1, 18, 12);
  g.scale(size[0], size[1], size[2]);
  g.rotateX(rot[0]);
  g.rotateY(rot[1]);
  g.rotateZ(rot[2]);
  g.translate(center[0], center[1], center[2]);
  return g;
}

/**
 * 二つ結びのおさげ（ユナ）: 耳の後ろの低い所で結び、胸の上まで垂れる、ふっくらした2本の房。
 * 先は丸くまとめる（ばらばらの毛先にしない）。左右で長さと向きをわずかに変える。結び目は差し色
 */
function twinTails(): { hair: THREE.BufferGeometry[]; accent: THREE.BufferGeometry[] } {
  const hair: THREE.BufferGeometry[] = [];
  const accent: THREE.BufferGeometry[] = [];
  for (const s of [-1, 1]) {
    const lean = s > 0 ? 1 : 0.92;
    hair.push(
      smoothTube(
        [
          [s * 0.44, 1.62, -0.28],
          [s * 0.56, 1.46, -0.27],
          [s * 0.64 * lean, 1.2, -0.18],
          [s * 0.62 * lean, 0.9 + (s > 0 ? 0 : 0.04), -0.06],
        ],
        (u) => 0.11 + Math.sin(Math.min(1, u * 1.6) * Math.PI * 0.5) * 0.05 - Math.pow(u, 3) * 0.145,
        0.82,
      ),
    );
    const tie = new THREE.TorusGeometry(0.095, 0.035, 8, 16);
    tie.rotateX(Math.PI / 2);
    tie.rotateZ(s * 0.5);
    tie.translate(s * 0.5, 1.55, -0.28);
    accent.push(tie);
  }
  return { hair, accent };
}

/**
 * 後ろで1つに結んだ房（髪型を増やす試作。ゲームの人物にはまだ使っていない）: 後ろ頭の低い所で結び、背の上まで垂れる、ふっくらした1本の房。
 * 先は丸くまとめる。結び目は差し色
 */
function ponytail(): { hair: THREE.BufferGeometry; accent: THREE.BufferGeometry } {
  const hair = smoothTube(
    [
      [0, 1.66, -0.5],
      [0, 1.5, -0.6],
      [0.02, 1.2, -0.6],
      [0.04, 0.95, -0.52],
    ],
    (u) => 0.12 + Math.sin(Math.min(1, u * 1.6) * Math.PI * 0.5) * 0.045 - Math.pow(u, 3) * 0.15,
    0.85,
  );
  const tie = new THREE.TorusGeometry(0.1, 0.036, 8, 16);
  tie.rotateX(Math.PI / 2 - 0.5);
  tie.translate(0, 1.6, -0.54);
  return { hair, accent: tie };
}

/**
 * 垂れた前髪の1房（トウマ）: 生え際から額の前へ下り、眉の上で止まる、先の細い房。顔の面から少し浮かせる
 */
function forelock(): THREE.BufferGeometry {
  return smoothTube(
    [
      [0.02, 2.02, 0.36],
      [0.06, 1.92, 0.5],
      [0.1, 1.8, 0.53],
      [0.13, 1.71, 0.5],
    ],
    (u) => 0.068 * (1 - u * 0.8),
    0.55,
  );
}

/**
 * ギザギザ頭（トウマ）: 頭の横と後ろの輪郭に、先のとがった太い房を数個並べる。細い束を重ねるのではなく、
 * 根もとの太い、なめらかな円すいの塊（作者の髪の面から生えて、外と下へ少し反る）。 額の上の房は、眉より上で止める
 */
function spikes(): THREE.BufferGeometry[] {
  const out: THREE.BufferGeometry[] = [];
  // 頭の髪を、中心 (0, 1.86, -0.06)・半径 (0.5, 0.42, 0.52) の楕円の玉と見て、その面から生やす
  const c = new THREE.Vector3(0, 1.86, -0.06);
  const r = new THREE.Vector3(0.5, 0.42, 0.52);
  // [向き（0 が正面、右回り。度）, 高さ（度）, 長さ, 太さ]
  const tufts: readonly [number, number, number, number][] = [
    // 後ろ
    [125, 22, 0.26, 0.12],
    [155, 8, 0.24, 0.12],
    [180, 34, 0.28, 0.125],
    [205, 8, 0.24, 0.12],
    [235, 22, 0.26, 0.12],
    [160, 58, 0.22, 0.11],
    [200, 58, 0.22, 0.11],
    // 横（耳の上）
    [85, 28, 0.22, 0.115],
    [275, 28, 0.22, 0.115],
    [60, 45, 0.2, 0.11],
    [300, 45, 0.2, 0.11],
    // てっぺん
    [110, 72, 0.22, 0.115],
    [250, 72, 0.22, 0.115],
    [0, 78, 0.2, 0.11],
    // 前（額の上。前へ出て、眉より上で止まる）
    [35, 50, 0.22, 0.11],
    [325, 50, 0.22, 0.11],
  ];
  for (const [az, el, len, th] of tufts) {
    const a = THREE.MathUtils.degToRad(az);
    const e = THREE.MathUtils.degToRad(el);
    const dir = new THREE.Vector3(Math.sin(a) * Math.cos(e), Math.sin(e), Math.cos(a) * Math.cos(e));
    const onSurface = (k: number) => new THREE.Vector3(c.x + r.x * dir.x * k, c.y + r.y * dir.y * k, c.z + r.z * dir.z * k);
    // 根もとは髪の奥に沈め、まっすぐ外へ（少し下へ）伸びて、先がとがる。断面は丸い
    // 後ろから見て丸い玉に見えないように、頭の面に沿って下へ流し、毛先だけ外へ出す（後ろからは下向きの三角に見える）
    const base = onSurface(0.72);
    const mid = onSurface(1.0 + len * 0.25);
    // 上の房ほど垂らさない（てっぺんの房が垂れると、髪の上に乗ったこぶに見えた）
    const droop = 1 - Math.min(1, el / 90) * 0.75;
    mid.y -= len * 0.35 * droop;
    const tip = onSurface(1.0 + len * (1.0 + 0.3 * (1 - droop)));
    tip.y -= len * 0.8 * droop;
    out.push(
      smoothTube(
        [base.toArray() as unknown as V3, mid.toArray() as unknown as V3, tip.toArray() as unknown as V3],
        (u) => th * Math.max(0.03, 1 - u),
        0.85,
        10,
        10,
      ),
    );
  }
  return out;
}

/** 後ろのまとめ（母）: mage の髪の後ろの結い目に重ねる、大きな塊1つ */
function bun(): THREE.BufferGeometry {
  return blob([0, 1.42, -0.6], [0.2, 0.17, 0.15]);
}

/** 人物の髪に足す塊 */
export function hairParts(look: KayKitLook): PartPiece[] {
  if (look.headwear?.kind === 'hood') return [];
  const out: PartPiece[] = [];
  const extras = look.hair.extras ?? [];
  const head = { a: BONE.head };
  if (extras.includes('twinTails')) {
    const t = twinTails();
    for (const g of t.hair) out.push(finish(g, 'hair', head, true));
    for (const g of t.accent) out.push(finish(g, 'accent', head, true));
  }
  if (extras.includes('ponytail')) {
    const t = ponytail();
    out.push(finish(t.hair, 'hair', head, true), finish(t.accent, 'accent', head, true));
  }
  if (extras.includes('bun')) out.push(finish(bun(), 'hair', head, true));
  if (extras.includes('forelock')) out.push(finish(forelock(), 'hair', head, true));
  if (extras.includes('spikes')) for (const g of spikes()) out.push(finish(g, 'hair', head, true));
  return out;
}
