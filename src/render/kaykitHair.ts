import * as THREE from 'three';
import type { KayKitLook } from '../data/story/looks';
import { BONE, finish, type PartCell, type PartPiece } from './kaykitParts';

/**
 * KayKit の人形の髪（場面4の KayKit の人形の髪の作り直し）。
 *
 * 前の版は、頭に沿った殻を塗り、その上に小さな束を貼っていたので、兜や帽子のように見えた（発注者の判断）。
 * この版では、髪を「頭皮から生えて流れる束」の集まりとして作る:
 * - 束（strand）: 頭の丸み（楕円の面）に沿って根もとから流れ、面を離れると下へ垂れ、毛先で細く尖る。断面は平たい六角
 * - 束ごとに、根もとが明るく毛先が暗い濃淡にする（重なった束の段差が、明るさの段で見える）
 * - 束のすき間から頭が透けないように、束の下に暗い髪の塊（生え際で切った殻）を置く
 * - 前髪・横の髪・えり足・生え際を、人物ごとの髪型（hair.style）で作り分ける
 *
 * 座標は素材の頭の座標（頭を縮める前。src/render/kaykitParts.ts と同じ）。頭の骨に付けるので、頭と一緒に縮み、動く。
 */

type V3 = readonly [number, number, number];

/**
 * 頭皮の楕円。knight の頭（髪を切り取った頭。額の生え際は y 1.97・z 0.45）と、barbarian の頭（はげ頭。てっぺんは y 2.19）で違う。
 * 髪を作る間だけ、作る人物の頭に合わせる（setScalp）
 */
const SCALPS = {
  knight: { c: new THREE.Vector3(0, 1.78, -0.02), r: new THREE.Vector3(0.53, 0.55, 0.5) },
  barbarian: { c: new THREE.Vector3(0, 1.78, 0.0), r: new THREE.Vector3(0.47, 0.42, 0.465) },
} as const;
const C = new THREE.Vector3();
const R = new THREE.Vector3();
function setScalp(head: keyof typeof SCALPS): void {
  C.copy(SCALPS[head].c);
  R.copy(SCALPS[head].r);
}

/** 頭皮の上の点（theta は頭のてっぺんからの角度、phi は正面 0 から +x の向きへの角度、lift は面から浮かせる割合） */
function surf(theta: number, phi: number, lift: number): THREE.Vector3 {
  const s = Math.sin(theta);
  return new THREE.Vector3(R.x * s * Math.sin(phi), R.y * Math.cos(theta), R.z * s * Math.cos(phi)).multiplyScalar(1 + lift).add(C);
}

/** 頭皮の楕円の外向きの向き */
function normalAt(p: THREE.Vector3): THREE.Vector3 {
  const d = p.clone().sub(C);
  return new THREE.Vector3(d.x / (R.x * R.x), d.y / (R.y * R.y), d.z / (R.z * R.z)).normalize();
}

/** 1つの束の作り方 */
interface Strand {
  /** 根もとの向き（正面 0、+x の向きへ）と、てっぺんからの角度 */
  readonly phi: number;
  readonly t0: number;
  /** 頭皮を離れる所のてっぺんからの角度（t0 より小さいと、前から後ろへ流れる） */
  readonly t1: number;
  /** 頭皮に沿って流れる間に、横へずれる角度（前髪を片側へ流す・後ろの結い目へ集める） */
  readonly dphi?: number;
  /** 頭皮を離れてから垂れる長さ */
  readonly hang?: number;
  /** 垂れる所が真下へ向く度合い（0〜1） */
  readonly fall?: number;
  /** 毛先を外へはねる量（負で内へ入れる） */
  readonly flick?: number;
  /** 幅と厚み */
  readonly w: number;
  readonly th?: number;
  /** 頭皮から浮かせる割合（根もと・頭皮を離れる所） */
  readonly lift?: number;
  readonly liftEnd?: number;
  /** 色（hair ふつう・hairLight 明るい束） */
  readonly cell?: PartCell;
}

/** 道筋に沿った束の形（平たい六角の断面を、根もとから毛先へ細くしながらつなぐ） */
function tube(path: readonly THREE.Vector3[], w: number, th: number, outward: (p: THREE.Vector3, i: number) => THREE.Vector3, rootWide = 0.75): THREE.BufferGeometry {
  const K = 6;
  const n = path.length;
  const pos: number[] = [];
  const index: number[] = [];
  const last = n - 1;
  for (let i = 0; i < last; i++) {
    const p = path[i]!;
    const tan = path[Math.min(last, i + 1)]!.clone().sub(path[Math.max(0, i - 1)]!).normalize();
    let nrm = outward(p, i);
    const bin = new THREE.Vector3().crossVectors(tan, nrm);
    if (bin.lengthSq() < 1e-8) bin.set(1, 0, 0);
    bin.normalize();
    nrm = new THREE.Vector3().crossVectors(bin, tan).normalize();
    const u = i / last;
    // 根もとは少し細く、中ほどで一番太く、毛先へ細く尖る
    const width = w * Math.min(1, rootWide + u * 2.2) * Math.pow(1 - u, 0.75);
    const thick = th * (1 - u * 0.55);
    for (let k = 0; k < K; k++) {
      const a = (k / K) * Math.PI * 2;
      const q = p
        .clone()
        .addScaledVector(bin, (Math.cos(a) * width) / 2)
        .addScaledVector(nrm, (Math.sin(a) * thick) / 2);
      pos.push(q.x, q.y, q.z);
    }
  }
  const rings = last;
  for (let i = 0; i < rings - 1; i++)
    for (let k = 0; k < K; k++) {
      const a = i * K + k;
      const b = i * K + ((k + 1) % K);
      const c = a + K;
      const d = b + K;
      index.push(a, c, b, b, c, d);
    }
  // 毛先（尖り）と根もとのふた
  const tip = path[last]!;
  pos.push(tip.x, tip.y, tip.z);
  const tipI = rings * K;
  for (let k = 0; k < K; k++) index.push((rings - 1) * K + k, tipI, (rings - 1) * K + ((k + 1) % K));
  const root = path[0]!.clone().addScaledVector(path[1]!.clone().sub(path[0]!).normalize(), -0.02);
  pos.push(root.x, root.y, root.z);
  const rootI = tipI + 1;
  for (let k = 0; k < K; k++) index.push(k, (k + 1) % K, rootI);
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setIndex(index);
  return g;
}

/** 頭皮に沿って流れ、面を離れて垂れる束 */
function strand(s: Strand): THREE.BufferGeometry {
  const lift0 = s.lift ?? 0.06;
  const lift1 = s.liftEnd ?? lift0;
  const path: THREE.Vector3[] = [];
  const N1 = 7;
  for (let i = 0; i <= N1; i++) {
    const t = i / N1;
    path.push(surf(s.t0 + (s.t1 - s.t0) * t, s.phi + (s.dphi ?? 0) * Math.pow(t, 1.15), lift0 + (lift1 - lift0) * t));
  }
  const hang = s.hang ?? 0;
  if (hang > 0.005) {
    const end = path[path.length - 1]!;
    let dir = end.clone().sub(path[path.length - 2]!).normalize();
    const out = normalAt(end);
    const N2 = 4;
    const down = new THREE.Vector3(0, -1, 0);
    let p = end.clone();
    for (let i = 1; i <= N2; i++) {
      const k = i / N2;
      dir = dir
        .clone()
        .lerp(down, (s.fall ?? 0.6) * k)
        .addScaledVector(out, (s.flick ?? 0) * k * 1.6)
        .normalize();
      p = p.clone().addScaledVector(dir, hang / N2);
      path.push(p);
    }
  }
  return tube(path, s.w, s.th ?? s.w * 0.4, (p) => normalAt(p));
}

/** 決めた点を通る束（結った髪の房・まとめ髪の巻き・リボン） */
function curveStrand(points: readonly V3[], w: number, th: number, center: V3, samples = 9, rootWide = 0.75): THREE.BufferGeometry {
  const curve = new THREE.CatmullRomCurve3(points.map((p) => new THREE.Vector3(...p)));
  const path = curve.getPoints(samples);
  const c = new THREE.Vector3(...center);
  return tube(path, w, th, (p) => p.clone().sub(c).normalize(), rootWide);
}

/** 束を並べる: phi を from から to まで count 本 */
function fan(count: number, from: number, to: number, make: (phi: number, i: number) => Strand | null): Strand[] {
  const out: Strand[] = [];
  for (let i = 0; i < count; i++) {
    const s = make(count === 1 ? from : from + ((to - from) * i) / (count - 1), i);
    if (s) out.push(s);
  }
  return out;
}

const deg = (d: number) => (d * Math.PI) / 180;
/** 束ごとのばらつき（-1〜1。同じ番号なら同じ値。束の長さや毛先のはねをそろえすぎないため） */
const jitter = (i: number, salt = 0) => {
  const x = Math.sin(i * 12.9898 + salt * 78.233) * 43758.5453;
  return (x - Math.floor(x)) * 2 - 1;
};
/** 前（0）から後ろ（π）へ、横で滑らかに変わる値 */
const byAngle = (phi: number, front: number, side: number, back: number) => {
  const a = Math.abs(Math.atan2(Math.sin(phi), Math.cos(phi)));
  return a < Math.PI / 2 ? front + (side - front) * Math.sin(a) ** 2 : back + (side - back) * Math.sin(a) ** 2;
};

/**
 * 髪の塊（束の下の暗い殻）。生え際は、向き phi ごとのてっぺんからの角度 edge(phi) で決める（なめらかな生え際にするため、
 * 球を切り取らず、生え際までの面を直接作る）
 */
function mass(edge: (phi: number) => number, lift = 0.03): THREE.BufferGeometry {
  const W = 28;
  const H = 9;
  const pos: number[] = [];
  const index: number[] = [];
  pos.push(C.x, C.y + R.y * (1 + lift), C.z);
  for (let j = 1; j <= H; j++)
    for (let i = 0; i < W; i++) {
      const phi = (i / W) * Math.PI * 2;
      const p = surf((edge(phi) * j) / H, phi, lift);
      pos.push(p.x, p.y, p.z);
    }
  for (let i = 0; i < W; i++) index.push(0, 1 + i, 1 + ((i + 1) % W));
  for (let j = 1; j < H; j++)
    for (let i = 0; i < W; i++) {
      const a = 1 + (j - 1) * W + i;
      const b = 1 + (j - 1) * W + ((i + 1) % W);
      index.push(a, a + W, b, b, a + W, b + W);
    }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setIndex(index);
  return g;
}

/** 生え際: 額（front）・こめかみ（temple、斜め前 50°）・耳の上（ear、横）・えり足（back）の、てっぺんからの角度をなめらかにつなぐ */
function hairline(front: number, temple: number, ear: number, back: number): (phi: number) => number {
  const keys: [number, number][] = [
    [0, front],
    [deg(50), temple],
    [deg(95), ear],
    [deg(130), (ear + back) / 2],
    [Math.PI, back],
  ];
  return (phi) => {
    const a = Math.abs(Math.atan2(Math.sin(phi), Math.cos(phi)));
    for (let i = 1; i < keys.length; i++) {
      const [a0, v0] = keys[i - 1]!;
      const [a1, v1] = keys[i]!;
      if (a <= a1) {
        const t = (a - a0) / (a1 - a0);
        const k = t * t * (3 - 2 * t);
        return v0 + (v1 - v0) * k;
      }
    }
    return back;
  };
}

interface HairBuild {
  readonly strands: Strand[];
  readonly curves: THREE.BufferGeometry[];
  readonly accents: THREE.BufferGeometry[];
  readonly mass: THREE.BufferGeometry;
  /** 塊の色（省くと暗い髪の色。短く刈った髪は、塊そのものを髪の色にする） */
  readonly massCell?: PartCell;
}

/**
 * 短い髪（トウマ）: 頭のてっぺんの少し後ろのつむじから、束が四方へ流れる。前髪は額にかかり、片側へ流す。
 * 横は耳の上にかかり、えり足は首の後ろで小さく外へはねる。外側の束を短く重ねて段差を出す
 */
function shortHair(): HairBuild {
  const strands: Strand[] = [
    // 下の段（長い）: 横から後ろ。耳の上半分にかかり、えり足は真ん中ほど長く尖る。毛先は外へはねる
    ...fan(14, deg(40), deg(320), (phi, i) => ({
      phi: phi + jitter(i, 1) * deg(5),
      t0: 0.3,
      t1: byAngle(phi, 1.32, 1.48, 1.95) + jitter(i, 2) * 0.08,
      hang: byAngle(phi, 0.06, 0.1, 0.14) * (1 + jitter(i, 3) * 0.4),
      fall: 0.2,
      flick: byAngle(phi, 0.06, 0.16, 0.12) * (i % 2 ? 1 : 0.55),
      w: 0.25,
      th: 0.1,
      lift: 0.035,
      liftEnd: 0.05,
    })),
    // 上の段（短い・外側）: 段差。毛先を外へはねて、輪郭に段を作る
    ...fan(9, deg(58), deg(302), (phi, i) => ({
      phi: phi + deg(10),
      t0: 0.18,
      t1: byAngle(phi, 1.1, 1.3, 1.55) + jitter(i, 4) * 0.06,
      hang: 0.07,
      fall: 0.1,
      flick: 0.13,
      w: 0.28,
      th: 0.1,
      lift: 0.065,
      liftEnd: 0.08,
      cell: i % 3 === 1 ? 'hairLight' : 'hair',
    })),
    // 前髪: つむじの前から額へ。片側（+x）へ流し、長さをそろえない
    ...fan(6, deg(-60), deg(46), (phi, i) => ({
      phi,
      t0: 0.34,
      t1: 1.12,
      dphi: deg(24),
      hang: [0.08, 0.13, 0.17, 0.14, 0.1, 0.07][i]!,
      fall: 0.7,
      flick: 0.02,
      w: 0.26,
      th: 0.09,
      lift: 0.075,
      liftEnd: 0.07,
      cell: i === 3 ? 'hairLight' : 'hair',
    })),
    // つむじのはね（輪郭を少し乱す）
    { phi: deg(165), t0: 0.05, t1: 0.65, hang: 0.08, fall: 0, flick: 0.16, w: 0.2, th: 0.08, lift: 0.1, liftEnd: 0.12 },
    { phi: deg(215), t0: 0.08, t1: 0.6, hang: 0.06, fall: 0, flick: 0.16, w: 0.18, th: 0.08, lift: 0.1, liftEnd: 0.12 },
    { phi: deg(110), t0: 0.15, t1: 0.75, hang: 0.06, fall: 0, flick: 0.14, w: 0.18, th: 0.08, lift: 0.09, liftEnd: 0.11 },
    // 横の上のはね（正面から見た輪郭を、つるりとした丸にしない）
    ...[-1, 1].flatMap((s) => [
      { phi: s * deg(75), t0: 0.35, t1: 1.0, hang: 0.08, fall: 0, flick: 0.18, w: 0.2, th: 0.08, lift: 0.09, liftEnd: 0.11 },
      { phi: s * deg(118), t0: 0.3, t1: 1.15, hang: 0.07, fall: 0, flick: 0.18, w: 0.2, th: 0.08, lift: 0.08, liftEnd: 0.1 },
    ]),
  ];
  return { strands, curves: [], accents: [], mass: mass(hairline(1.22, 1.34, 1.56, 2.04)) };
}

/**
 * 刈り込んだ髪（父）: 額から後ろへなでつけた短い髪。こめかみは少し後退し、横と後ろは短く刈って、えり足をまっすぐ切りそろえる。
 * 後ろ姿で、トウマ（えり足がはねる黒い髪・外套）と見分けるため、首の後ろの肌が見える
 */
function croppedHair(): HairBuild {
  const strands: Strand[] = [
    // 額から頭のてっぺんを越えて後ろへ流れる束（なでつけ）。生え際を高くして額を出し、根もとは頭に沿わせる
    ...fan(7, deg(-52), deg(52), (phi, i) => ({
      phi: phi + jitter(i, 7) * deg(3),
      t0: 0.92 + Math.abs(phi) * 0.15,
      t1: -0.9 + jitter(i, 9) * 0.1,
      dphi: jitter(i, 8) * deg(6),
      w: 0.24,
      th: 0.06,
      lift: 0.015,
      liftEnd: i % 2 ? 0.05 : 0.035,
    })),
    // 横と後ろ: 上から下へ短く刈った束（頭に沿わせる。根もとと長さをそろえず、重なりの段を見せる）
    ...fan(16, deg(60), deg(300), (phi, i) => ({
      phi: phi + jitter(i, 5) * deg(5),
      t0: 0.45 + jitter(i, 10) * 0.2,
      t1: byAngle(phi, 1.4, 1.6, 1.86) + jitter(i, 6) * 0.06,
      hang: 0.02,
      w: 0.22,
      th: 0.06,
      lift: i % 2 ? 0.06 : 0.035,
      liftEnd: 0.015,
      cell: i % 3 === 1 ? 'hairLight' : 'hair',
    })),
    // えり足: 首の後ろで短く尖る毛先（後ろから見て、丸い帽子に見えないように）
    ...fan(7, deg(125), deg(235), (phi, i) => ({ phi, t0: 1.55 + (i % 2) * 0.08, t1: 1.95 + jitter(i, 14) * 0.04, w: 0.15, th: 0.05, lift: 0.045, liftEnd: 0.02 })),
    // つむじから流れる、少し浮いた束（後ろ頭の段）
    ...fan(5, deg(150), deg(210), (phi, i) => ({ phi: phi + deg(8), t0: 0.15, t1: 1.05 + jitter(i, 15) * 0.1, w: 0.24, th: 0.06, lift: 0.07, liftEnd: 0.06, cell: i === 2 ? 'hairLight' : 'hair' })),
    // もみあげ（ひげへつなぐ）
    ...[-1, 1].map((s) => ({ phi: s * deg(80), t0: 1.3, t1: 1.95, w: 0.16, th: 0.05, lift: 0.04, liftEnd: 0.04 })),
  ];
  return { strands, curves: [], accents: [], mass: mass(hairline(0.96, 1.06, 1.6, 1.86), 0.02) };
}

/** まとめ髪（母）: 真ん中で分けた髪を、こめかみから耳の上を通って後ろへなでつけ、後ろ頭の低い所でまとめる。耳の前に後れ毛 */
function bunHair(): HairBuild {
  const bunC: V3 = [0, 1.74, -0.64];
  const strands: Strand[] = [
    // 分け目から横へ、耳の上を通って後ろのまとめへ（頭皮に沿って回り込む）
    ...[-1, 1].flatMap((s) =>
      fan(5, deg(6), deg(62), (phi, i) => ({
        phi: s * phi,
        t0: 0.22 + i * 0.12,
        t1: 1.55 + i * 0.02,
        dphi: s * (deg(172) - phi),
        w: 0.3,
        th: 0.08,
        lift: 0.045,
        liftEnd: 0.07,
        cell: i === 1 ? 'hairLight' : 'hair',
      })),
    ),
    // 額の生え際から、分け目の両側を後ろ上へなでつける束（額の上に、塊の暗い帯を見せない）
    ...[-1, 1].flatMap((s) =>
      fan(3, deg(8), deg(50), (phi, i) => ({
        phi: s * phi,
        t0: 1.26 + i * 0.04,
        t1: 0.55,
        dphi: s * deg(55),
        w: 0.26,
        th: 0.07,
        lift: 0.03,
        liftEnd: 0.06,
        cell: i === 0 ? 'hairLight' : 'hair',
      })),
    ),
    // 頭のてっぺんから後ろへ
    ...fan(5, deg(140), deg(220), (phi) => ({ phi, t0: 0.15, t1: 1.6, dphi: (Math.PI - phi) * 0.8, w: 0.3, th: 0.08, lift: 0.045, liftEnd: 0.07 })),
    // えり足から上へ、まとめへ
    ...fan(5, deg(145), deg(215), (phi) => ({ phi, t0: 2.05, t1: 1.72, dphi: (Math.PI - phi) * 0.85, w: 0.28, th: 0.07, lift: 0.03, liftEnd: 0.08 })),
    // 耳の前の後れ毛（細く、あごの上まで）
    ...[-1, 1].map((s) => ({ phi: s * deg(72), t0: 1.15, t1: 1.62, hang: 0.24, fall: 0.95, flick: -0.02, w: 0.09, th: 0.045, lift: 0.07, liftEnd: 0.08 })),
  ];
  // まとめ（巻いた束を重ねる）
  const curves: THREE.BufferGeometry[] = [];
  for (let k = 0; k < 6; k++) {
    const a0 = (k / 6) * Math.PI * 2;
    const r = 0.16 - (k % 2) * 0.03;
    const pts: V3[] = [];
    for (let j = 0; j <= 6; j++) {
      const a = a0 + (j / 6) * Math.PI * 1.3;
      pts.push([bunC[0] + Math.cos(a) * r, bunC[1] + Math.sin(a) * r * 0.85, bunC[2] - 0.06 - (k % 3) * 0.035 + Math.sin(a * 2) * 0.01]);
    }
    curves.push(curveStrand(pts, 0.15, 0.1, [bunC[0], bunC[1], bunC[2] + 0.2], 9, 0.9));
  }
  const core = new THREE.IcosahedronGeometry(0.16, 1);
  core.scale(1, 0.85, 0.75);
  core.translate(bunC[0], bunC[1], bunC[2] - 0.02);
  curves.push(core);
  return { strands, curves, accents: [], mass: mass(hairline(1.24, 1.38, 1.7, 2.1)), massCell: 'hair' };
}

/**
 * ひとつに結んだ髪（ユナ。設計書「黒髪をひとつに結ぶ」）: 眉にかかるやわらかい前髪、顔の横に垂れる細い髪、
 * 後ろ頭の高い所で結んだ房（肩甲骨のあたりまで）と、結び目のリボン（差し色）
 */
function tiedHair(): HairBuild {
  const tie: V3 = [0, 2.02, -0.55];
  const strands: Strand[] = [
    // 前髪: 眉の上までの、毛先をそろえすぎない前髪（7本。長短を交互に）
    ...fan(7, deg(-56), deg(56), (phi, i) => ({
      phi,
      t0: 0.45,
      t1: 1.14,
      dphi: phi * -0.1,
      hang: (i % 2 ? 0.08 : 0.13) - Math.abs(phi) * 0.04,
      fall: 0.9,
      flick: -0.03,
      w: 0.21,
      th: 0.085,
      lift: 0.07,
      liftEnd: 0.065,
    })),
    // 顔の横の細い髪（耳の前からあごの下まで。毛先を少し内へ）
    ...[-1, 1].flatMap((s) => [
      { phi: s * deg(72), t0: 0.75, t1: 1.42, hang: 0.5, fall: 0.97, flick: -0.015, w: 0.17, th: 0.07, lift: 0.07, liftEnd: 0.09 },
      { phi: s * deg(88), t0: 0.8, t1: 1.55, hang: 0.36, fall: 0.97, flick: 0, w: 0.16, th: 0.07, lift: 0.055, liftEnd: 0.075 },
    ]),
    // 横と上の髪を、後ろの高い結び目へ集める（頭の丸みに沿わせ、ふくらませない）
    ...[-1, 1].flatMap((s) =>
      fan(4, deg(64), deg(140), (phi, i) => ({
        phi: s * phi,
        t0: 1.3 + i * 0.12,
        t1: 1.0,
        dphi: s * (Math.PI - phi) * 0.97,
        w: 0.3,
        th: 0.08,
        lift: 0.035,
        liftEnd: 0.07,
      })),
    ),
    ...fan(5, deg(-40), deg(40), (phi) => ({ phi, t0: 0.5, t1: -0.9, dphi: 0, w: 0.3, th: 0.08, lift: 0.04, liftEnd: 0.07 })),
    // 結び目の下の後ろ頭（えり足から結び目へ）
    ...fan(6, deg(130), deg(230), (phi) => ({ phi, t0: 2.05, t1: 1.0, dphi: (Math.PI - phi) * 0.95, w: 0.28, th: 0.075, lift: 0.03, liftEnd: 0.07 })),
  ];
  // 結んだ房: 結び目から後ろへ少し持ち上がり、背へ垂れる（ゆるい S 字。毛先を少し広げる）
  const curves: THREE.BufferGeometry[] = [];
  const tails: [number, number, number][] = [
    [0, 1.02, 0.4],
    [-0.03, 1.1, 0.32],
    [0.03, 1.1, 0.32],
    [-0.012, 1.2, 0.34],
    [0.015, 1.18, 0.3],
  ];
  for (const [dx, endY, w] of tails) {
    curves.push(
      curveStrand(
        [
          [tie[0] + dx * 0.3, tie[1], tie[2] + 0.02],
          [tie[0] + dx * 0.7, tie[1] + 0.04, tie[2] - 0.2],
          [tie[0] + dx, tie[1] - 0.22, tie[2] - 0.34],
          [tie[0] + dx * 1.2, (tie[1] + endY) / 2 - 0.12, tie[2] - 0.32],
          [tie[0] + dx * 1.6, endY, tie[2] - 0.22],
        ],
        w,
        0.15,
        [0, 1.6, -0.1],
        10,
        0.85,
      ),
    );
  }
  // リボン: 斜め上へ開いた2枚の羽と結び目、短い2本の垂れ
  const accents: THREE.BufferGeometry[] = [];
  for (const s of [-1, 1]) {
    const wing = new THREE.IcosahedronGeometry(1, 1);
    // 羽: 結び目の側を細く、外を広く（三角に近い形）
    const p = wing.attributes.position!;
    for (let i = 0; i < p.count; i++) {
      const x = p.getX(i);
      const k = 0.45 + 0.55 * (x + 1) * 0.5;
      p.setXYZ(i, x, p.getY(i) * k, p.getZ(i));
    }
    wing.scale(0.17, 0.13, 0.05);
    wing.translate(0.14, 0, 0);
    if (s < 0) wing.rotateY(Math.PI);
    wing.rotateZ(s * 0.12);
    wing.translate(tie[0], tie[1], tie[2] - 0.1);
    accents.push(wing);
    accents.push(
      curveStrand(
        [
          [tie[0] + s * 0.02, tie[1] - 0.02, tie[2] - 0.11],
          [tie[0] + s * 0.06, tie[1] - 0.15, tie[2] - 0.17],
          [tie[0] + s * 0.09, tie[1] - 0.3, tie[2] - 0.19],
        ],
        0.1,
        0.03,
        [0, tie[1], 0],
        5,
        1,
      ),
    );
  }
  const knot = new THREE.IcosahedronGeometry(0.08, 1);
  knot.scale(1, 1, 0.8);
  knot.translate(tie[0], tie[1], tie[2] - 0.12);
  accents.push(knot);
  return { strands, curves, accents, mass: mass(hairline(1.2, 1.34, 1.68, 2.1)) };
}

/** 人物の髪の部品（束・塊・頭の中を埋める玉・リボン） */
export function hairParts(look: KayKitLook): PartPiece[] {
  if (look.headwear?.kind === 'hood') return [];
  const style = look.hair.style;
  setScalp(look.head ?? 'knight');
  const build = style === 'short' ? shortHair() : style === 'cropped' ? croppedHair() : style === 'bun' ? bunHair() : tiedHair();
  const out: PartPiece[] = [];
  for (const s of build.strands) out.push(finish(strand(s), s.cell ?? 'hair', { a: BONE.head }, true));
  for (const g of build.curves) out.push(finish(g, 'hair', { a: BONE.head }, true));
  out.push(finish(build.mass, build.massCell ?? 'hairDark', { a: BONE.head }, true));
  // 頭の中を埋める玉（knight の頭は髪を切り取ってあるので、後ろと上の空いた所から、向こう側が透けて見えないように。
  // barbarian の頭は閉じているので要らない。入れると、玉が頭の後ろからはみ出して、丸い帽子のように見える）
  if ((look.head ?? 'knight') === 'knight') {
    const fill = new THREE.SphereGeometry(0.46, 10, 8);
    fill.translate(0, 1.8, -0.06);
    out.push(finish(fill, 'hairDark', { a: BONE.head }, true));
  }
  for (const g of build.accents) out.push(finish(g, 'accent', { a: BONE.head }, true));
  return out;
}
