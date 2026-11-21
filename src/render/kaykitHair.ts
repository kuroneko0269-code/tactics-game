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
  return out;
}
