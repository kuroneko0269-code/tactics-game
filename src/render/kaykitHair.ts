import * as THREE from 'three';
import type { KayKitLook } from '../data/story/looks';
import { BONE, finish, type PartPiece } from './kaykitParts';

/**
 * KayKit の人形の髪に、自作で足す塊（場面4の KayKit の人形の髪の作り直し）。
 *
 * 髪そのものは、作者が頭と一体で作った髪（knight 短い・rogue 中くらいの長さ・mage 長い）を使う（src/render/kaykit.ts）。
 * ここでは、作者の髪に無い形（ユナの二つ結びのおさげ・肩までの髪・リボン、母の後ろのまとめ）だけを、
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
 * 二つ結びのおさげ（ユナの案 A）: 耳の後ろの低い所で結び、胸の上まで垂れる、ふっくらした2本の房。
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
 * 肩までの髪（ユナの案 B）: rogue の髪の裾から続けて、後ろと横を肩の上まで伸ばす1枚の厚い塊。
 * 裾は内へゆるく巻き込む。前は耳の前で止め、顔の横を見せる
 */
function bob(): THREE.BufferGeometry {
  const W = 22;
  const H = 8;
  const from = Math.PI * 0.32;
  const to = Math.PI * 1.68;
  const top = 1.62;
  const bottom = 1.16;
  const pos: number[] = [];
  const index: number[] = [];
  const surface = (inner: boolean) => {
    for (let j = 0; j <= H; j++) {
      const t = j / H;
      const y = top + (bottom - top) * t;
      // 下へ少し広がり、最後に内へ巻き込む
      const flare = 0.47 + 0.035 * t - (t > 0.85 ? (t - 0.85) * 0.3 : 0);
      for (let i = 0; i <= W; i++) {
        const a = from + ((to - from) * i) / W;
        // 前の端（耳の前）は少し短く（左右でわずかに違う）
        const edge = Math.min(1, Math.min(i, W - i) / 3);
        const r = (flare - (inner ? 0.05 : 0)) * (0.94 + 0.06 * edge);
        const yy = y + (1 - edge) * t * 0.08 * (i < W / 2 ? 1 : 0.7);
        pos.push(Math.sin(a) * r, yy, Math.cos(a) * r * 0.96 - 0.04);
      }
    }
  };
  surface(false);
  surface(true);
  const row = W + 1;
  const half = (H + 1) * row;
  for (let j = 0; j < H; j++)
    for (let i = 0; i < W; i++) {
      const a = j * row + i;
      index.push(a, a + row, a + 1, a + 1, a + row, a + row + 1);
      index.push(half + a, half + a + 1, half + a + row, half + a + 1, half + a + row + 1, half + a + row);
    }
  for (let i = 0; i < W; i++) {
    const a = H * row + i;
    index.push(a, half + a, a + 1, a + 1, half + a, half + a + 1);
  }
  for (const i of [0, W])
    for (let j = 0; j < H; j++) {
      const a = j * row + i;
      if (i === 0) index.push(a, half + a, a + row, a + row, half + a, half + a + row);
      else index.push(a, a + row, half + a, a + row, half + a + row, half + a);
    }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setIndex(index);
  return g;
}

/** リボン（ユナの案 B）: 頭の左上に、ふっくらした2枚の羽と結び目、短い2本の垂れ（差し色） */
function ribbon(): THREE.BufferGeometry[] {
  const c: V3 = [-0.36, 2.04, -0.02];
  const tilt = 0.55;
  const tail = (dz: number, len: number) =>
    smoothTube(
      [
        [c[0] - 0.01, c[1] - 0.02, c[2] + dz * 0.3],
        [c[0] - 0.05, c[1] - len * 0.5, c[2] + dz * 0.8],
        [c[0] - 0.08, c[1] - len, c[2] + dz],
      ],
      (u) => 0.035 - u * 0.012,
      0.45,
      6,
      8,
    );
  return [
    blob([c[0] - 0.02, c[1] + 0.07, c[2] + 0.11], [0.055, 0.11, 0.08], [0.5, 0, tilt]),
    blob([c[0] - 0.02, c[1] + 0.07, c[2] - 0.13], [0.055, 0.11, 0.08], [-0.5, 0, tilt]),
    blob([c[0], c[1], c[2]], [0.06, 0.06, 0.06]),
    tail(0.1, 0.22),
    tail(-0.12, 0.19),
  ];
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
  if (extras.includes('bob')) out.push(finish(bob(), 'hair', head, true));
  if (extras.includes('ribbon')) for (const g of ribbon()) out.push(finish(g, 'accent', head, true));
  if (extras.includes('bun')) out.push(finish(bun(), 'hair', head, true));
  return out;
}
