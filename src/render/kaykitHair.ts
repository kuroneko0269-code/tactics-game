import * as THREE from 'three';
import type { KayKitLook, KayKitTails } from '../data/story/looks';
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

/**
 * 曲線に沿った、断面が丸い（少し平たい）なめらかな塊。radius(u) で根もと 0 から先 1 までの太さを決める。両端は閉じる。
 * out を渡すと、その向き（頭の面から外への向き）に平たくつぶす（頭の面に寝かせた房）。省くと曲線の曲がりの向きでつぶす
 */
function smoothTube(points: readonly V3[], radius: (u: number) => number, flat = 0.8, samples = 16, K = 14, out?: THREE.Vector3): THREE.BufferGeometry {
  const curve = new THREE.CatmullRomCurve3(points.map((p) => new THREE.Vector3(...p)));
  const frames = curve.computeFrenetFrames(samples, false);
  if (out) {
    for (let i = 0; i <= samples; i++) {
      const t = curve.getTangentAt(i / samples);
      const b = new THREE.Vector3().crossVectors(t, out).normalize();
      frames.normals[i] = new THREE.Vector3().crossVectors(b, t).normalize();
      frames.binormals[i] = b;
    }
  }
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

/** 頭を縮める時の値（src/render/kaykit.ts の scaleHead と同じ。首の付け根の高さと、縮める割合） */
export interface HeadFit {
  readonly pivot: number;
  readonly scale: number;
}

/**
 * 二つ結びのおさげ（ユナ）: 耳の後ろの低い所で結び、肩の上を越えて胸の前へ、肩より下まで垂れる、ふっくらした2本の房。
 * 先は丸くまとめる（ばらばらの毛先にしない）。左右で長さと向きをわずかに変える。結び目は差し色。
 * 結び目の近くは頭の骨、肩から下は胸の骨に付ける（頭を動かしても、肩より下の房が体に食い込まないように）。
 * 形は、頭を縮めた後の体の座標で決め、頭の骨に付く割合に合わせて、縮める前の座標へ戻しておく
 */
function twinTails(fit: HeadFit, tails?: KayKitTails): { hair: THREE.BufferGeometry[]; accent: THREE.BufferGeometry[]; headWeight: (y: number) => number } {
  const hair: THREE.BufferGeometry[] = [];
  const accent: THREE.BufferGeometry[] = [];
  // 縮めた後の座標での、頭の骨に付く割合（結び目 1 → 肩の上 0）。胸の骨に付けない房は、すべて頭の骨
  const chest = tails ? tails.chest === true : true;
  const headWeight = chest ? (y: number) => Math.min(1, Math.max(0, (y - 1.24) / 0.2)) : () => 1;
  const unscale = (g: THREE.BufferGeometry) => {
    const p = g.attributes.position!;
    for (let i = 0; i < p.count; i++) {
      const s = 1 + (fit.scale - 1) * headWeight(p.getY(i));
      p.setXYZ(i, p.getX(i) / s, fit.pivot + (p.getY(i) - fit.pivot) / s, p.getZ(i) / s);
    }
    return g;
  };
  // 結び目の位置（縮める前の頭の座標で、耳の後ろの低い所）を、縮めた後の座標へ
  const tieRaw = new THREE.Vector3(...(tails?.tie ?? [0.5, 1.55, -0.28]));
  const tieAt = new THREE.Vector3(tieRaw.x * fit.scale, fit.pivot + (tieRaw.y - fit.pivot) * fit.scale, tieRaw.z * fit.scale);
  for (const s of [-1, 1]) {
    const longer = s > 0 ? 0 : 0.03;
    if (tails) {
      // 根もとが太く、先へ細くなる房（体から少し離す）。左右でわずかに長さを変える
      const root = tails.root;
      const bulge = tails.bulge ?? 0.2;
      const taper = tails.taper ?? 0.85;
      const pts: V3[] = [
        [s * (tieAt.x - 0.03), tieAt.y + 0.02, tieAt.z + 0.0],
        [s * tieAt.x, tieAt.y, tieAt.z],
        ...tails.path.map(([x, y, z], k): V3 => [s * x, y - (k === tails.path.length - 1 ? longer : 0), z]),
      ];
      hair.push(
        unscale(
          smoothTube(
            pts,
            (u) => root * (1 + bulge * Math.sin(Math.min(1, u * 2.2) * Math.PI * 0.5)) * (1 - taper * Math.pow(u, 1.6)),
            tails.flat ?? 0.9,
            24,
          ),
        ),
      );
      // 結び目: 房を巻くひもの輪と、垂れたひもの端2本
      const dir = new THREE.Vector3(...pts[2]!).sub(new THREE.Vector3(...pts[1]!)).normalize();
      const ring = new THREE.TorusGeometry(root * 1.02, 0.017, 8, 18);
      ring.lookAt(dir);
      const at = new THREE.Vector3(...pts[1]!).addScaledVector(dir, 0.03);
      ring.translate(at.x, at.y, at.z);
      accent.push(unscale(ring));
      const len = tails.strings ?? 0.09;
      if (len > 0)
        for (const k of [-1, 1]) {
          const from = at.clone().add(new THREE.Vector3(s * 0.02 * k, -0.01, root * 0.9));
          accent.push(
            unscale(
              smoothTube(
                [from.toArray() as unknown as V3, [from.x + s * 0.015 * k, from.y - len * 0.5, from.z + 0.02], [from.x + s * 0.025 * k, from.y - len, from.z + 0.01]],
                (u) => 0.013 * (1 - 0.4 * u),
                0.6,
                8,
                8,
              ),
            ),
          );
        }
      continue;
    }
    hair.push(
      unscale(
        smoothTube(
          [
            [s * (tieAt.x - 0.02), tieAt.y + 0.03, tieAt.z - 0.02],
            [s * (tieAt.x + 0.03), tieAt.y - 0.07, tieAt.z + 0.08],
            [s * 0.33, 1.33, 0.25],
            [s * 0.32, 1.12, 0.44],
            [s * 0.32, 0.88 - longer, 0.43],
          ],
          (u) => 0.06 + Math.sin(Math.min(1, u * 1.8) * Math.PI * 0.5) * 0.024 - Math.pow(u, 3) * 0.075,
          0.85,
          24,
        ),
      ),
    );
    const tie = new THREE.TorusGeometry(0.058, 0.022, 8, 16);
    tie.rotateX(Math.PI / 2 - 0.5);
    tie.rotateZ(s * 0.5);
    tie.translate(s * (tieAt.x + 0.01), tieAt.y - 0.01, tieAt.z + 0.01);
    accent.push(unscale(tie));
  }
  return { hair, accent, headWeight };
}

/** 形の点ごとに、頭の骨と胸の骨へ重さを分ける（縮めた後の座標の高さで決める。twinTails の headWeight） */
function splitHeadChest(piece: PartPiece, fit: HeadFit, headWeight: (y: number) => number): PartPiece {
  const p = piece.geometry.attributes.position!;
  const si = piece.geometry.attributes.skinIndex!;
  const sw = piece.geometry.attributes.skinWeight!;
  for (let i = 0; i < p.count; i++) {
    // 縮める前の高さから、縮めた後の高さを探す（頭の重さと高さが互いに決まるので、数回くり返して合わせる）
    let y = p.getY(i);
    for (let k = 0; k < 4; k++) {
      const s = 1 + (fit.scale - 1) * headWeight(y);
      y = fit.pivot + (p.getY(i) - fit.pivot) * s;
    }
    const w = headWeight(y);
    si.setXYZW(i, BONE.head, BONE.chest, 0, 0);
    sw.setXYZW(i, w, 1 - w, 0, 0);
  }
  return piece;
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
 * 垂れた前髪の1房（トウマ）: 生え際から額の前へ下り、立っている時は眉の上で止まる、先の細い房。顔の面から少し浮かせる。
 * 根もと（生え際）を軸に揺れる骨に付け、うつむくと垂れて目元にかかる（src/render/kaykit.ts の forelock の骨）
 */
export const FORELOCK_ROOT: V3 = [0.03, 2.0, 0.4];
function forelock(): THREE.BufferGeometry {
  return smoothTube(
    [
      [0.02, 2.04, 0.34],
      [0.06, 1.93, 0.5],
      [0.11, 1.8, 0.545],
      [0.15, 1.695, 0.52],
    ],
    (u) => 0.085 * (1 - u * 0.75),
    0.5,
    16,
    14,
    new THREE.Vector3(0, 0.25, 1).normalize(),
  );
}

/** 頭の髪を、中心 c・半径 r の楕円の玉と見て、向き（0 が正面、右回り。度）と高さ（度）から、面の上の点と外への向きを出す */
const HAIR_C = new THREE.Vector3(0, 1.86, -0.06);
const HAIR_R = new THREE.Vector3(0.5, 0.42, 0.52);
function onHair(az: number, el: number, k: number): { at: THREE.Vector3; out: THREE.Vector3; down: THREE.Vector3 } {
  const a = THREE.MathUtils.degToRad(az);
  const e = THREE.MathUtils.degToRad(el);
  const dir = new THREE.Vector3(Math.sin(a) * Math.cos(e), Math.sin(e), Math.cos(a) * Math.cos(e));
  const at = new THREE.Vector3(HAIR_C.x + HAIR_R.x * dir.x * k, HAIR_C.y + HAIR_R.y * dir.y * k, HAIR_C.z + HAIR_R.z * dir.z * k);
  // 楕円の面の外への向き（面の法線）と、面に沿って下への向き
  const out = new THREE.Vector3(dir.x / HAIR_R.x, dir.y / HAIR_R.y, dir.z / HAIR_R.z).normalize();
  const down = new THREE.Vector3(0, -1, 0).addScaledVector(out, out.y).normalize();
  return { at, out, down };
}

/**
 * 寝かせた毛先（トウマ）: 耳の後ろと後ろ頭の裾に、頭の面に沿って下へ寝かせた、幅のある平たい房を3つだけ。毛先だけが外へ少し跳ねる
 * （立てた房は元気な主人公に見えるため、寝かせる。2026-11-22 物語の担当の決定）。細い束は重ねない。左右でそろえない（無造作に）
 */
function flicks(): THREE.BufferGeometry[] {
  const out: THREE.BufferGeometry[] = [];
  // 裾は、横と後ろで y 1.52・頭の中心 (0, -0.04) からの半径 0.40〜0.45（rogue の髪を短くした時）。毛先を裾の少し下に出す
  const at = (az: number, y: number, r: number): V3 => {
    const a = THREE.MathUtils.degToRad(az);
    return [Math.sin(a) * r, y, Math.cos(a) * r - 0.04];
  };
  // [向き, 裾での半径, 幅, 跳ね]
  const tufts: readonly [number, number, number, number][] = [
    [104, 0.43, 0.13, 0.05],
    [254, 0.4, 0.12, 0.04],
    [202, 0.41, 0.14, 0.05],
  ];
  for (const [az, r, w, lift] of tufts) {
    const a = THREE.MathUtils.degToRad(az);
    out.push(
      smoothTube(
        [at(az, 1.66, r - 0.06), at(az, 1.57, r + 0.005), at(az, 1.49, r + lift)],
        (u) => w * Math.max(0.05, 1 - Math.pow(u, 2.2)),
        0.32,
        12,
        12,
        new THREE.Vector3(Math.sin(a), 0, Math.cos(a)),
      ),
    );
  }
  return out;
}

/**
 * 跳ねた短い髪（見比べ用に仮で作るジンの頭。ゲームの人物には使っていない）: 頭の上と後ろに、外と上へ跳ねる、幅のある房
 */
function flareUp(): THREE.BufferGeometry[] {
  const out: THREE.BufferGeometry[] = [];
  // [向き, 高さ, 長さ, 幅]: 幅の広い房を、外と上へ跳ねさせる
  const tufts: readonly [number, number, number, number][] = [
    [20, 58, 0.17, 0.2],
    [320, 55, 0.16, 0.19],
    [90, 35, 0.16, 0.19],
    [270, 35, 0.16, 0.19],
    [140, 40, 0.18, 0.21],
    [220, 40, 0.18, 0.21],
    [180, 70, 0.16, 0.2],
  ];
  for (const [az, el, len, w] of tufts) {
    const root = onHair(az, el - 12, 0.86);
    const mid = onHair(az, el, 1.0);
    const tip = mid.at.clone().addScaledVector(mid.out, len).add(new THREE.Vector3(0, len * 0.7, 0));
    out.push(
      smoothTube([root.at.toArray() as unknown as V3, mid.at.toArray() as unknown as V3, tip.toArray() as unknown as V3], (u) => w * Math.max(0.06, 1 - Math.pow(u, 1.4)), 0.5, 10, 10, mid.out),
    );
  }
  return out;
}

/** 面の向き out に合わせて、z 向きに作った形を回して at に置く */
function placeOn(g: THREE.BufferGeometry, at: THREE.Vector3, out: THREE.Vector3, spin = 0): THREE.BufferGeometry {
  g.rotateZ(spin);
  g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 0, 1), out));
  g.translate(at.x, at.y, at.z);
  return g;
}

/** 前髪の横の髪留め（ユナ）: 丸い金具（座金のような輪）と、髪に差した細い棒。金具は2つ目の差し色 */
function hairPin(): THREE.BufferGeometry[] {
  const { at, out } = onHair(38, 22, 1.04);
  const ring = placeOn(new THREE.TorusGeometry(0.065, 0.024, 8, 16), at, out);
  const bar = new THREE.CylinderGeometry(0.012, 0.012, 0.2, 6);
  bar.rotateZ(Math.PI / 2 - 0.5);
  return [ring, placeOn(bar, at.clone().addScaledVector(out, -0.012), out)];
}

/** 頭に上げた作業用の眼鏡（ユナ）: 頭を巻く帯と、額の上の丸い2つの枠とレンズ */
function goggles(): { band: THREE.BufferGeometry[]; frame: THREE.BufferGeometry[]; lens: THREE.BufferGeometry[] } {
  const band = new THREE.TorusGeometry(1, 0.035, 6, 32);
  band.rotateX(Math.PI / 2);
  band.scale(0.47, 1, 0.5);
  band.rotateX(-0.32);
  band.translate(0, 1.88, -0.07);
  const frame: THREE.BufferGeometry[] = [];
  const lens: THREE.BufferGeometry[] = [];
  for (const az of [-24, 24]) {
    const { at, out } = onHair(az, 30, 1.0);
    const cup = new THREE.CylinderGeometry(0.085, 0.095, 0.07, 14);
    cup.rotateX(Math.PI / 2);
    frame.push(placeOn(cup, at, out));
    const glass = new THREE.CylinderGeometry(0.062, 0.062, 0.02, 14);
    glass.rotateX(Math.PI / 2);
    lens.push(placeOn(glass, at.clone().addScaledVector(out, 0.03), out));
  }
  return { band: [band], frame, lens };
}

/** 結び目の小さなリボン（ユナ）: 結び目の外側に、羽2つと結び目の玉（差し色） */
function bows(tails: KayKitTails | undefined): THREE.BufferGeometry[] {
  const [tx, ty, tz] = tails?.tie ?? [0.5, 1.55, -0.28];
  const out: THREE.BufferGeometry[] = [];
  for (const s of [-1, 1]) {
    const c = new THREE.Vector3(s * (tx + 0.04), ty + 0.07, tz - 0.03);
    const dir = new THREE.Vector3(s, 0.1, -0.35).normalize();
    for (const k of [-1, 1]) out.push(placeOn(blob([0, k * 0.1, 0], [0.095, 0.07, 0.035], [0, 0, k * 0.25]), c, dir, Math.PI / 2));
    out.push(placeOn(blob([0, 0, 0.012], [0.042, 0.042, 0.04]), c, dir));
  }
  return out;
}

/** 耳の上の小さな花（ユナ）: 花びら5つ（差し色）と、真ん中（2つ目の差し色） */
function flower(): { petals: THREE.BufferGeometry[]; middle: THREE.BufferGeometry } {
  const { at, out } = onHair(-62, 28, 1.03);
  const petals: THREE.BufferGeometry[] = [];
  for (let k = 0; k < 5; k++) {
    const a = (k / 5) * Math.PI * 2;
    petals.push(placeOn(blob([Math.cos(a) * 0.06, Math.sin(a) * 0.06, 0], [0.052, 0.052, 0.02]), at, out));
  }
  return { petals, middle: placeOn(blob([0, 0, 0.014], [0.032, 0.032, 0.018]), at, out) };
}

/** 後ろのまとめ（母）: mage の髪の後ろの結い目に重ねる、大きな塊1つ */
function bun(): THREE.BufferGeometry {
  return blob([0, 1.42, -0.6], [0.2, 0.17, 0.15]);
}

/** うなじの大きなまとめ髪（母）: 後ろの低い所に、左へ少し寄せた大きな塊と、その上に重ねた小さな塊（巻いた形） */
function bunLarge(): THREE.BufferGeometry[] {
  return [blob([0.1, 1.42, -0.5], [0.26, 0.21, 0.19], [0, 0.3, 0.15]), blob([0.2, 1.5, -0.42], [0.15, 0.13, 0.13], [0, 0.4, -0.2])];
}

/** 額の横のほつれ毛（母）: 右のこめかみから頬の横へ垂れる、小さく細い房1つ */
function strand(): THREE.BufferGeometry {
  return smoothTube(
    [
      [-0.34, 1.94, 0.4],
      [-0.41, 1.82, 0.41],
      [-0.44, 1.7, 0.38],
      [-0.42, 1.61, 0.34],
    ],
    (u) => 0.068 * (1 - u * 0.6),
    0.45,
    14,
    12,
  );
}

/** 人物の髪に足す塊（fit は頭を縮める値。頭と胸にまたがる房の形を合わせるため） */
export function hairParts(look: KayKitLook, fit: HeadFit): PartPiece[] {
  if (look.headwear?.kind === 'hood') return [];
  const out: PartPiece[] = [];
  const extras = look.hair.extras ?? [];
  const head = { a: BONE.head };
  // 頭の中の玉（肌の色）: 頭の形は、作者の髪の区画を外した所が穴になっている。髪を短くした横（耳と頬の間）では、髪がその穴を覆わず、
  // 穴から頭の内側（向こう側の目の裏や輪郭線の黒）が見えていたので、肌の色の玉で内側をふさぐ（顔の面と髪の外へは出ない大きさ。輪郭線は付けない）
  out.push({ ...finish(blob([0, 1.66, -0.01], [0.42, 0.4, 0.38]), 'skin', head, true), noOutline: true });
  if (extras.includes('twinTails')) {
    const t = twinTails(fit, look.hair.tails);
    for (const g of t.hair) out.push(splitHeadChest(finish(g, 'hair', head, true), fit, t.headWeight));
    for (const g of t.accent) out.push(splitHeadChest(finish(g, 'accent', head, true), fit, t.headWeight));
  }
  if (extras.includes('ponytail')) {
    const t = ponytail();
    out.push(finish(t.hair, 'hair', head, true), finish(t.accent, 'accent', head, true));
  }
  if (extras.includes('pin')) for (const g of hairPin()) out.push(finish(g, 'accentB', head, true));
  if (extras.includes('bows')) for (const g of bows(look.hair.tails)) out.push(finish(g, 'accent', head, true));
  if (extras.includes('flower')) {
    const f = flower();
    for (const g of f.petals) out.push(finish(g, 'accent', head, true));
    out.push(finish(f.middle, 'accentB', head, true));
  }
  if (extras.includes('goggles')) {
    const g = goggles();
    for (const x of g.band) out.push(finish(x, 'apron', head, true));
    for (const x of g.frame) out.push(finish(x, 'accentB', head, true));
    for (const x of g.lens) out.push(finish(x, 'metal', head, true));
  }
  if (extras.includes('bun')) out.push(finish(bun(), 'hair', head, true));
  if (extras.includes('bunLarge')) for (const g of bunLarge()) out.push(finish(g, 'hair', head, true));
  if (extras.includes('strand')) out.push(finish(strand(), 'hair', head, true));
  if (extras.includes('forelock')) out.push({ ...finish(forelock(), 'hair', head, true), forelock: true });
  if (extras.includes('flicks')) for (const g of flicks()) out.push(finish(g, 'hair', head, true));
  if (extras.includes('flareUp')) for (const g of flareUp()) out.push(finish(g, 'hair', head, true));
  return out;
}
