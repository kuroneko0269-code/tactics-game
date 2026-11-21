import * as THREE from 'three';
import type { Direction } from '../core/geometry';
import type { LookDefinition, LookItemSlot } from '../data/story/looks';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { buildModel } from './props';

/**
 * 人形（部品を組み合わせた人形）。序章の場面4の見本の PR で箱の人形から作り直し、その次の見本の PR で絵柄を作り替えた
 * （「可愛すぎる」という判断を受けて、落ち着いた大人の体つき・小さな目だけの顔・土の色・はっきりした陰と細い輪郭線に）。
 *
 * - 体つき: 約 3.4 頭身。頭は小さめ、肩幅と胸の厚みがあり、手と足はやや大きい。足を少し開いた、重さのある立ち方
 * - 顔: 小さい縦長の暗い目だけ（鼻・口・眉・頬の赤みはない）。まばたきをする。台詞の間は、口ではなく頭と肩がわずかに動く（talk）
 * - 衣装: 外套・マント・肩当て・頭巾・帽子・ベルト・袋・長靴・手袋を、見た目のデータ（src/data/story/looks.ts）で組み合わせる
 * - 髪: 束のある形（細長い房を頭の形に沿って並べる）
 * - 陰影: 3段のはっきりした陰（トゥーン。なめらかな陰にしない）と、細い暗い輪郭線（体を少し膨らませた裏面を暗く塗る）
 *
 * 描き方: 部品は、骨（Bone）ごとに形を1つにまとめ、1体を1つの形（SkinnedMesh）として描く。部品ごとの色は頂点の色に焼き込む。
 * 骨は今までの「動かす部品のグループ」と同じ位置と回転の仕組みなので、仕草の姿勢（setPose）・歩く・まばたきはそのまま動く。
 * 1体を描く回数は、体1回と輪郭線1回（影を落とす光ごとに +1）。持ち物と手の武器だけは、付け外しのために別の形にする。
 * 全体の高さはおよそ 0.9（マスの一辺が 1）。会話の場面・顔の枠・戦闘の駒の、すべてで同じ人形を使う。
 */
export interface Puppet {
  /** 位置と向きを持つ外側のグループ */
  readonly group: THREE.Group;
  /** 体（攻撃や被弾の動きはこちらを動かす。group からの相対位置） */
  readonly body: THREE.Group;
  setFacing(facing: Direction): void;
  /** 向きを角度（ラジアン）で直接指定する（回転のアニメーション用） */
  setYaw(yaw: number): void;
  readonly yaw: number;
  /** 被弾したときの赤い光り方。0 で通常、1 で最も強く光る */
  setFlash(amount: number): void;
  /** 透明度。1 で不透明 */
  setOpacity(opacity: number): void;
  /** 指定した色での光り方（魔法の演出用）。amount が 0 で通常 */
  setGlow(color: THREE.Color, amount: number): void;
  /** 仕草の姿勢（会話の場面。物語の土台）。省いた値は 0（元の姿勢）。物の見た目では何もしない */
  setPose?(pose: PuppetPose): void;
  /** 持ち物を付け替える（付ける所 → 物の見た目の id。空の文字なら何も持たない。省いた所は見た目の決まりのまま） */
  setItems?(items: Readonly<Partial<Record<LookItemSlot, string>>>): void;
  /** 持ち物の付く所（手・左手・腰・背）の、3D の世界の位置（物の名前の札を、持っている物のそばに出すため） */
  itemPoint?(slot: LookItemSlot): THREE.Vector3;
  /** 歩いている間（足と腕を振る）。物の見た目では何もしない */
  setMoving?(moving: boolean): void;
  /** 台詞の間（seconds 秒）、頭と肩をわずかに動かす。0 で止める */
  talk?(seconds: number): void;
  update(elapsedSeconds: number): void;
}

/** 仕草の姿勢（角度はラジアン）。値の意味は src/data/story/stageDefs.ts の GesturePose と同じ */
export interface PuppetPose {
  readonly bow?: number;
  readonly head?: number;
  readonly headTurn?: number;
  readonly tilt?: number;
  readonly armL?: number;
  readonly armR?: number;
  readonly spreadL?: number;
  readonly spreadR?: number;
  readonly drop?: number;
  readonly lift?: number;
  readonly back?: number;
  /** 腰掛ける（0〜1。脚を前に出して腰を落とす） */
  readonly sit?: number;
}

/** 人形の見た目（見た目のデータと同じ形） */
export type PuppetLook = LookDefinition;

/** 人形の作り方の選び方。low は戦闘の駒（形の分割を粗くし、小さな部品を省く） */
export interface PuppetOptions {
  readonly detail?: 'high' | 'low';
}

// ---- 色（彩度を落とした土の色。布・革・くすんだ金属） ----
const SKIN = 0xc2a28c;
const EYE = 0x17110d;
const LEATHER = 0x5e4430;
const LEATHER_DARK = 0x35271d;
const IRON = 0x6f7272;
const BRASS = 0x8f7a4c;
const WOOD = 0x6a4a2c;
/** 輪郭線の色（真っ黒にせず、焦げ茶にする） */
const OUTLINE = 0x140e0a;

/** 体の寸法（scale 1 の時）。約 3.4 頭身 */
const SOLE = 0.03;
const SHIN = 0.165;
const THIGH = 0.165;
const HIP_Y = SOLE + SHIN + THIGH;
const TORSO_H = 0.262;
const NECK_Y = HIP_Y + TORSO_H;
const SHOULDER_Y = NECK_Y - 0.03;
const HEAD_R = 0.108;
const HEAD_Y = NECK_Y + 0.03 + HEAD_R;
const UPPER_ARM = 0.15;
const FOREARM = 0.13;

/** 顔の正面は +z（南）。y 軸まわりに 90 度回すごとに 東(+x) → 北 → 西 を向く */
export const YAW_OF: Readonly<Record<Direction, number>> = {
  south: 0,
  east: Math.PI / 2,
  north: Math.PI,
  west: (Math.PI * 3) / 2,
};

/** 足もとの丸い影の濃さ */
const BLOB_OPACITY = 0.34;
let blobShape: THREE.BufferGeometry | undefined;
/** 足もとの丸い影の形（どの人形も同じ形を使う） */
function blobGeometry(): THREE.BufferGeometry {
  blobShape ??= new THREE.CircleGeometry(0.2, 16);
  return blobShape;
}

/** 3段の陰（暗い・中間・明るい）。どの人形も同じものを使う */
let toonRamp: THREE.DataTexture | undefined;
function toonGradient(): THREE.DataTexture {
  if (!toonRamp) {
    toonRamp = new THREE.DataTexture(new Uint8Array([92, 168, 255]), 3, 1, THREE.RedFormat);
    toonRamp.minFilter = THREE.NearestFilter;
    toonRamp.magFilter = THREE.NearestFilter;
    toonRamp.generateMipmaps = false;
    toonRamp.needsUpdate = true;
  }
  return toonRamp;
}

/**
 * 彩度を落として少し暗くする（どの人物の色も、くすんだ土の色の範囲に収める。人物の見た目で鮮やかな色を書いても、
 * 画面では落ち着いた色になる）
 */
function muted(hex: number, saturation = 0.62, lightness = 0.94): THREE.Color {
  const c = new THREE.Color(hex);
  const hsl = { h: 0, s: 0, l: 0 };
  c.getHSL(hsl);
  c.setHSL(hsl.h, hsl.s * saturation, hsl.l * lightness);
  return c;
}

type V3 = readonly [number, number, number];

/** 部品の1つ: 形・色・付く骨・骨からの位置と向き・輪郭線を付けるか */
interface PartSpec {
  readonly geometry: THREE.BufferGeometry;
  readonly color: THREE.Color;
  readonly bone: number;
  readonly matrix: THREE.Matrix4;
  readonly outline: number;
}

/** 名前から決まる小さな数（まばたきの間を人形ごとにずらす。乱数は使わない） */
function phaseOf(look: PuppetLook): number {
  const n = (look.body * 7 + (look.hair ?? 3) * 13 + (look.accent ?? 5)) % 997;
  return (n / 997) * 3;
}

/** 輪郭線の太さの割合（すべての人形で共通。ドット風の描き方では、小さな画で線が途切れないように太くする） */
const outlineScale = { value: 1 };
export function setOutlineScale(scale: number): void {
  outlineScale.value = scale;
}

/** 輪郭線の材質: 体を法線の向きに少し膨らませ、裏面だけを暗く塗る。頂点ごとの outlineW（0 なら線なし）で太さを変える */
function outlineMaterial(): THREE.MeshBasicMaterial {
  const m = new THREE.MeshBasicMaterial({ color: OUTLINE, side: THREE.BackSide });
  m.onBeforeCompile = (shader) => {
    shader.uniforms.outlineScale = outlineScale;
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nattribute float outlineW;\nuniform float outlineScale;')
      .replace('#include <skinning_vertex>', '#include <skinning_vertex>\ntransformed += normalize( objectNormal ) * outlineW * outlineScale;');
  };
  m.customProgramCacheKey = () => 'puppet-outline';
  return m;
}

export function createPuppet(look: PuppetLook, options: PuppetOptions = {}): Puppet {
  return buildPuppet(look, options.detail === 'low');
}

function buildPuppet(look: PuppetLook, low: boolean): Puppet {
  const group = new THREE.Group();
  const body = new THREE.Group();
  group.add(body);
  // 画面の切り替え（ドット風の描き方）で、人物だけを選び出すための印
  group.userData.puppet = true;
  const w = look.width ?? 1;
  const outfit = look.outfit ?? (look.robe ? 'robe' : 'tunic');
  // 形の分割の細かさ（陰が3段なので、細かく分けても見た目は変わらない。描く量を抑える）
  const detail = low ? 0.5 : 0.75;
  const seg = (n: number, min: number) => Math.max(min, Math.round(n * detail));

  // ---- 骨（動かす部品のグループ。今までのグループと同じ位置に置く） ----
  const bones: THREE.Bone[] = [];
  const bone = (parent: THREE.Object3D | null, x: number, y: number, z: number) => {
    const b = new THREE.Bone();
    b.position.set(x, y, z);
    parent?.add(b);
    bones.push(b);
    return b;
  };
  const root = bone(null, 0, 0, 0);
  root.scale.setScalar(look.scale ?? 1);
  const hipX = 0.058 * Math.min(1.2, w);
  const hipL = bone(root, -hipX, HIP_Y, 0);
  const kneeL = bone(hipL, 0, -THIGH, 0);
  const hipR = bone(root, hipX, HIP_Y, 0);
  const kneeR = bone(hipR, 0, -THIGH, 0);
  const upper = bone(root, 0, HIP_Y, 0);
  const torsoW = 0.122 * w;
  const torsoD = 0.74;
  const shoulderX = torsoW + 0.028;
  const shoulderL = bone(upper, -shoulderX, SHOULDER_Y - HIP_Y, 0);
  const elbowL = bone(shoulderL, 0, -UPPER_ARM, 0);
  const shoulderR = bone(upper, shoulderX, SHOULDER_Y - HIP_Y, 0);
  const elbowR = bone(shoulderR, 0, -UPPER_ARM, 0);
  const head = bone(upper, 0, NECK_Y - HIP_Y, 0);
  const eyeX = 0.034;
  const eyeY = HEAD_Y - NECK_Y - 0.006;
  const eyeZ = Math.sqrt(HEAD_R * HEAD_R - eyeX * eyeX) * 0.955;
  const eyeL = bone(head, -eyeX, eyeY, eyeZ);
  const eyeR = bone(head, eyeX, eyeY, eyeZ);
  root.updateMatrixWorld(true);

  // ---- 部品を集める ----
  const parts: PartSpec[] = [];
  const shared = new Map<string, THREE.BufferGeometry>();
  const geo = (key: string, make: () => THREE.BufferGeometry) => {
    let g = shared.get(key);
    if (!g) {
      g = make();
      shared.set(key, g);
    }
    return g;
  };
  const sphere = (r: number, ws = 12, hs = 9) => geo(`s${r}-${ws}-${hs}`, () => new THREE.SphereGeometry(r, seg(ws, 6), seg(hs, 4)));
  const capsule = (r: number, len: number) => geo(`c${r}-${len}`, () => new THREE.CapsuleGeometry(r, len, seg(2, 1), seg(8, 6)));
  const cylinder = (rt: number, rb: number, h: number, n = 12) => geo(`y${rt}-${rb}-${h}-${n}`, () => new THREE.CylinderGeometry(rt, rb, h, seg(n, 6)));
  const box = (x: number, y: number, z: number) => geo(`b${x}-${y}-${z}`, () => new THREE.BoxGeometry(x, y, z));
  const cone = (r: number, h: number, n = 5) => geo(`k${r}-${h}-${n}`, () => new THREE.ConeGeometry(r, h, n));
  /** 球の上の部分（頭巾・兜・髪の土台） */
  const dome = (r: number, theta: number, phiStart = 0, phiLength = Math.PI * 2) =>
    geo(`d${r}-${theta}-${phiStart}-${phiLength}`, () => new THREE.SphereGeometry(r, seg(14, 8), seg(8, 4), phiStart, phiLength, 0, theta));
  /** 背中側の半分の筒（マント。裏も見えるように両面） */
  const halfTube = (rt: number, rb: number, h: number) => geo(`t${rt}-${rb}-${h}`, () => bothSides(new THREE.CylinderGeometry(rt, rb, h, seg(10, 6), 1, true, Math.PI * 0.5, Math.PI)));
  /** 体の前を包む布（前掛け。両面） */
  const frontWrap = (rt: number, rb: number, h: number) =>
    geo(`w${rt}-${rb}-${h}`, () => bothSides(new THREE.CylinderGeometry(rt, rb, h, seg(8, 5), 1, true, -Math.PI * 0.3, Math.PI * 0.6)));
  /** 顔の前を開けた頭巾（裏も見えるように両面） */
  const hoodShell = (r: number) => geo(`hood${r}`, () => bothSides(new THREE.SphereGeometry(r, seg(14, 8), seg(8, 4), Math.PI * 0.5 + 0.95, Math.PI * 2 - 1.9, 0, Math.PI * 0.64)));

  const boneIndex = new Map(bones.map((b, i) => [b, i]));
  const tmpQ = new THREE.Quaternion();
  const add = (
    geometry: THREE.BufferGeometry,
    color: number | THREE.Color,
    b: THREE.Bone,
    at: V3,
    o: { rot?: V3; scale?: V3; quat?: THREE.Quaternion; outline?: number } = {},
  ) => {
    const q = o.quat ?? (o.rot ? tmpQ.setFromEuler(new THREE.Euler(o.rot[0], o.rot[1], o.rot[2])) : tmpQ.identity());
    const matrix = new THREE.Matrix4().compose(new THREE.Vector3(...at), q.clone(), new THREE.Vector3(...(o.scale ?? [1, 1, 1])));
    parts.push({ geometry, color: color instanceof THREE.Color ? color : muted(color), bone: boneIndex.get(b)!, matrix, outline: o.outline ?? 1 });
  };

  // 人物の色（くすませる）。差し色（accent）は人物ごとに1色まで
  const bodyC = muted(look.body);
  const accentC = muted(look.accent, 0.7, 0.92);
  const skinC = muted(look.skin ?? SKIN, 0.62, 0.97);
  const legsC = muted(look.legs ?? 0x4a3e32);
  const bootC = muted(look.boots ?? look.shoes ?? LEATHER_DARK);
  const gloveC = look.gloves !== undefined ? muted(look.gloves) : undefined;
  const beltC = muted(look.belt ?? LEATHER_DARK);
  const hairC = look.hair !== undefined ? muted(look.hair, 0.7, 0.96) : undefined;

  // ---- 脚（股・膝で曲がる。腰掛ける・しゃがむ・歩く） ----
  const legR = 0.046 * Math.min(1.2, w);
  for (const [hip, knee, side] of [
    [hipL, kneeL, -1],
    [hipR, kneeR, 1],
  ] as const) {
    add(capsule(legR, THIGH - legR * 0.6), legsC, hip, [0, -THIGH / 2, 0]);
    add(capsule(legR * 0.9, SHIN - legR * 0.6), legsC, knee, [0, -SHIN / 2, 0]);
    // 長靴（脛の半ばまで）と、大きめの足
    add(cylinder(legR * 1.08, legR * 1.12, SHIN * 0.62, 10), bootC, knee, [0, -SHIN * 0.66, 0]);
    add(box(0.088 * Math.min(1.15, w), 0.06, 0.15), bootC, knee, [side * 0.004, -SHIN - SOLE + 0.03, 0.028]);
    if (!low) add(box(0.09 * Math.min(1.15, w), 0.014, 0.152), LEATHER_DARK, knee, [side * 0.004, -SHIN - SOLE + 0.004, 0.028], { outline: 0 });
  }

  // ---- 胴（胸は厚く、腰へ細くなる） ----
  // 腰回り（脚の付け根をつなぐ）
  add(cylinder(torsoW * 0.86, torsoW * 0.9, 0.08, 12), legsC, upper, [0, -0.02, 0], { scale: [1, 1, torsoD] });
  add(cylinder(torsoW * 1.0, torsoW * 0.84, TORSO_H, 12), bodyC, upper, [0, TORSO_H / 2, 0], { scale: [1, 1, torsoD] });
  // 胸の厚み（前へ少し張り出す）
  add(sphere(torsoW * 0.86, 12, 8), bodyC, upper, [0, TORSO_H * 0.66, torsoW * 0.12], { scale: [1.08, 0.72, torsoD] });
  // 肩（幅を見せる）
  add(sphere(torsoW * 1.0, 14, 8), bodyC, upper, [0, TORSO_H - 0.018, 0], { scale: [1.22, 0.4, torsoD] });
  // 襟（差し色）
  add(cylinder(0.046, 0.06, 0.03, 10), look.scarf !== undefined ? muted(look.scarf) : accentC, upper, [0, TORSO_H + 0.004, 0], { scale: [1, 1, 0.9] });
  // 首
  add(cylinder(0.034, 0.038, 0.06, 8), skinC, head, [0, 0.012, 0], { outline: 0.5 });

  // 裾（服の形）
  if (outfit === 'robe' || outfit === 'coat') {
    // 腰から下の長い裾（長衣は足もとまで、外套は膝下まで）
    const len = outfit === 'robe' ? HIP_Y - 0.035 : HIP_Y * 0.62;
    add(cylinder(torsoW * 0.98, torsoW * 1.36, len, 14), bodyC, upper, [0, -len / 2 + 0.02, 0], { scale: [1, 1, torsoD + 0.06] });
    if (outfit === 'coat') {
      // 前の合わせ（暗い線）
      add(box(0.016, TORSO_H + len * 0.9, 0.012), LEATHER_DARK, upper, [0, TORSO_H / 2 - len * 0.45, torsoW * torsoD + 0.008], { outline: 0 });
    }
  } else if (outfit === 'dress') {
    const len = HIP_Y * 0.9;
    add(cylinder(torsoW * 0.96, torsoW * 1.5, len, 14), bodyC, upper, [0, -len / 2 + 0.02, 0], { scale: [1, 1, torsoD + 0.1] });
  } else {
    // 短い上着の裾（腿の上まで）
    add(cylinder(torsoW * 0.9, torsoW * 1.12, 0.1, 14), bodyC, upper, [0, -0.04, 0], { scale: [1, 1, torsoD + 0.05] });
  }
  if (outfit === 'apron' || look.apron !== undefined) {
    // 前掛け（革か厚布。胸から膝の上まで）
    // 体の前を包む布（筒の前の一部を両面で。板に見えないように、腰から下は少し広がる）
    const apronC = muted(look.apron ?? LEATHER);
    const apronH = TORSO_H * 0.62 + 0.15;
    add(frontWrap(torsoW * 1.04, torsoW * 1.16, apronH), apronC, upper, [0, TORSO_H * 0.62 - apronH / 2, 0.004], { scale: [1, 1, torsoD + 0.12] });
  }
  // ベルトと留め金、袋
  add(cylinder(torsoW * 0.9, torsoW * 0.9, 0.032, 12), beltC, upper, [0, 0.04, 0], { scale: [1.04, 1, torsoD + 0.08] });
  if (!low) add(box(0.03, 0.026, 0.01), BRASS, upper, [0, 0.04, torsoW * torsoD * 0.97 + 0.012], { outline: 0 });
  if (look.pouch && !low) add(box(0.05, 0.058, 0.034), LEATHER, upper, [torsoW * 0.72, 0.0, torsoW * torsoD * 0.55], { rot: [0, 0.5, 0] });

  // マント（背中側。肩から膝まで、または足もとまで）
  if (look.cloak !== undefined) {
    const cloakC = muted(look.cloak);
    const len = look.cloakLength === 'short' ? 0.22 : look.cloakLength === 'long' ? SHOULDER_Y - 0.05 : SHOULDER_Y - 0.2;
    add(halfTube(torsoW * 1.12, torsoW * 1.5, len), cloakC, upper, [0, TORSO_H - len / 2 + 0.01, -0.012], { scale: [1.04, 1, torsoD + 0.22] });
  }
  // 肩掛け（短い肩のマント）
  if (look.mantle !== undefined) {
    add(cylinder(0.065, torsoW * 1.42, 0.15, 12), muted(look.mantle), upper, [0, TORSO_H - 0.055, 0], { scale: [1.1, 1, torsoD + 0.14] });
  }
  // 頭巾（下ろしたもの: 首の後ろのたまり）
  if (look.hood === 'down' && !low) {
    add(sphere(0.07, 10, 7), muted(look.cloak ?? look.mantle ?? look.body), upper, [0, TORSO_H + 0.03, -0.075], { scale: [1.4, 0.7, 0.9] });
  }

  // ---- 腕（肩で回る。肘は少しだけ曲がる） ----
  const armR = 0.036 * Math.min(1.25, w);
  const rolled = look.sleeves === 'rolled';
  for (const [shoulder, elbow, side] of [
    [shoulderL, elbowL, -1],
    [shoulderR, elbowR, 1],
  ] as const) {
    add(capsule(armR, UPPER_ARM - armR * 0.6), bodyC, shoulder, [0, -UPPER_ARM / 2, 0]);
    // 前腕（袖をまくると肌）
    add(capsule(armR * 0.88, FOREARM - armR * 0.6), rolled ? skinC : bodyC, elbow, [0, -FOREARM / 2, 0]);
    if (rolled) add(cylinder(armR * 1.12, armR * 1.12, 0.03, 8), bodyC, elbow, [0, -0.012, 0]);
    // 手袋の口か袖口
    add(cylinder(armR * 1.02, armR * 1.12, 0.03, 8), gloveC ?? (rolled ? skinC : bodyC), elbow, [0, -FOREARM + 0.01, 0]);
    // 大きめの手
    add(box(0.05, 0.072, 0.036), gloveC ?? skinC, elbow, [0, -FOREARM - 0.034, 0.004]);
    add(box(0.016, 0.04, 0.022), gloveC ?? skinC, elbow, [side * -0.022, -FOREARM - 0.02, 0.016], { rot: [0, 0, side * 0.3] });
    // 肩当て
    if (look.pauldrons !== undefined) add(dome(0.058, Math.PI * 0.5), muted(look.pauldrons), shoulder, [side * 0.006, 0.006, 0], { scale: [1.1, 0.6, 1.05], rot: [0, 0, side * -0.25] });
  }

  // ---- 頭（首を軸に回る） ----
  const headC = HEAD_Y - NECK_Y;
  add(sphere(HEAD_R, 14, 11), skinC, head, [0, headC, 0], { scale: [0.88, 1.08, 0.96] });
  // 顎（少し角ばらせて、丸顔に見せない）
  add(box(0.1, 0.05, 0.1), skinC, head, [0, headC - 0.07, 0.02], { scale: [0.82, 1, 0.8], outline: 0.4 });
  // 目（小さい縦長の暗い目だけ）。まばたきは目の骨を縦に縮める
  for (const eye of [eyeL, eyeR]) add(sphere(0.0105, 8, 6), EYE, eye, [0, 0, 0], { scale: [0.6, 1.35, 0.4], outline: 0 });
  if (look.beard !== undefined) add(sphere(0.074, 10, 8), muted(look.beard), head, [0, headC - 0.064, 0.05], { scale: [1.05, 0.68, 0.72] });
  if (hairC) addHair(look, hairC, accentC, head, headC, add, { sphere, cone, dome, cylinder, hoodShell });
  if (look.hat) addHat(look.hat, look, accentC, head, headC, add, { cylinder, cone, dome, sphere, hoodShell });
  else if (!hairC) addHat('cap', look, accentC, head, headC, add, { cylinder, cone, dome, sphere, hoodShell });
  if (look.hood === 'up') {
    // かぶった頭巾（顔の前は開ける）
    const hoodC = muted(look.cloak ?? look.mantle ?? look.accent);
    add(hoodShell(HEAD_R + 0.03), hoodC, head, [0, headC + 0.008, -0.004], { rot: [-0.18, 0, 0] });
  }
  // 腰の剣（鞘に収めた剣。会話の場面。戦闘の駒は手に持つ）
  if (look.weapon === 'sword' && !low) {
    add(box(0.026, 0.3, 0.02), LEATHER_DARK, upper, [-torsoW * 0.98, -0.12, -0.02], { rot: [0.32, 0, 0.12] });
    add(box(0.07, 0.016, 0.026), IRON, upper, [-torsoW * 0.95, 0.03, 0.03], { rot: [0.32, 0, 0.12] });
    add(cylinder(0.012, 0.012, 0.07, 6), LEATHER, upper, [-torsoW * 0.93, 0.07, 0.045], { rot: [0.32, 0, 0.12] });
  }

  // ---- 1つの形にまとめる ----
  const pieces = parts.map((p) => {
    const b = bones[p.bone]!;
    const g = p.geometry.clone().applyMatrix4(new THREE.Matrix4().multiplyMatrices(b.matrixWorld, p.matrix));
    for (const name of Object.keys(g.attributes)) if (name !== 'position' && name !== 'normal') g.deleteAttribute(name);
    const n = g.attributes.position!.count;
    // 索引のない形（多面体）にも索引を付ける（まとめる形は、すべて索引つきにそろえる）
    if (!g.index) g.setIndex(Array.from({ length: n }, (_, i) => i));
    const color = new Float32Array(n * 3);
    const skinIndex = new Uint16Array(n * 4);
    const skinWeight = new Float32Array(n * 4);
    const outlineW = new Float32Array(n);
    // 輪郭線の太さ（戦闘の駒は遠くから見るので少し太く）
    const width = (low ? 0.0075 : 0.0048) * p.outline;
    for (let i = 0; i < n; i++) {
      color[i * 3] = p.color.r;
      color[i * 3 + 1] = p.color.g;
      color[i * 3 + 2] = p.color.b;
      skinIndex[i * 4] = p.bone;
      skinWeight[i * 4] = 1;
      outlineW[i] = width;
    }
    g.setAttribute('color', new THREE.BufferAttribute(color, 3));
    g.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(skinIndex, 4));
    g.setAttribute('skinWeight', new THREE.BufferAttribute(skinWeight, 4));
    g.setAttribute('outlineW', new THREE.BufferAttribute(outlineW, 1));
    return g;
  });
  const merged = mergeGeometries(pieces)!;
  for (const p of pieces) p.dispose();
  for (const g of shared.values()) g.dispose();
  const material = new THREE.MeshToonMaterial({ vertexColors: true, gradientMap: toonGradient() });
  const lineMat = outlineMaterial();
  const mesh = new THREE.SkinnedMesh(merged, material);
  // 人形は影を落とす計算に入れず、足もとの丸い影で地面に置く（動く人形の影を毎こま計算すると重いため。見た目の見本の2回目）
  mesh.add(root);
  const skeleton = new THREE.Skeleton(bones);
  mesh.bind(skeleton);
  const outline = new THREE.SkinnedMesh(merged, lineMat);
  outline.bind(skeleton, mesh.bindMatrix);
  // 輪郭線はタップの判定に使わない
  outline.raycast = () => {};
  body.add(mesh, outline);
  // 足もとの丸い影（体が跳ねても地面に残るよう、外側のグループに付ける）
  const shadowMat = new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: BLOB_OPACITY, depthWrite: false });
  const blob = new THREE.Mesh(blobGeometry(), shadowMat);
  blob.rotation.x = -Math.PI / 2;
  blob.position.y = 0.006;
  blob.scale.setScalar((look.scale ?? 1) * Math.min(1.3, w));
  blob.raycast = () => {};
  blob.renderOrder = -1;
  group.add(blob);

  // ---- 手の武器（付け外しできるように、別の形にする） ----
  const weaponMat = new THREE.MeshToonMaterial({ vertexColors: true, gradientMap: toonGradient() });
  const handR = new THREE.Group();
  handR.position.set(0, -FOREARM - 0.035, 0);
  elbowR.add(handR);
  const handL = new THREE.Group();
  handL.position.set(0, -FOREARM - 0.035, 0);
  elbowL.add(handL);
  let rightWeapon: THREE.Object3D | undefined;
  const simple = (list: { g: THREE.BufferGeometry; c: number; at: V3; rot?: V3 }[], parent: THREE.Object3D) => {
    const gs = list.map((p) => {
      const g = p.g.clone();
      g.applyMatrix4(
        new THREE.Matrix4().compose(new THREE.Vector3(...p.at), new THREE.Quaternion().setFromEuler(new THREE.Euler(...(p.rot ?? [0, 0, 0]))), new THREE.Vector3(1, 1, 1)),
      );
      for (const name of Object.keys(g.attributes)) if (name !== 'position' && name !== 'normal') g.deleteAttribute(name);
      const c = muted(p.c);
      const n = g.attributes.position!.count;
      if (!g.index) g.setIndex(Array.from({ length: n }, (_, i) => i));
      const col = new Float32Array(n * 3);
      for (let i = 0; i < n; i++) col.set([c.r, c.g, c.b], i * 3);
      g.setAttribute('color', new THREE.BufferAttribute(col, 3));
      return g;
    });
    const m = new THREE.Mesh(mergeGeometries(gs)!, weaponMat);
    for (const g of gs) g.dispose();
    parent.add(m);
    return m;
  };
  if (look.weapon === 'sword' && low) {
    const g = new THREE.Group();
    g.position.set(0, 0, 0.02);
    g.rotation.x = 0.25;
    handR.add(g);
    simple(
      [
        { g: new THREE.BoxGeometry(0.034, 0.36, 0.012), c: 0xb8bcbf, at: [0, -0.2, 0] },
        { g: new THREE.BoxGeometry(0.09, 0.02, 0.03), c: BRASS, at: [0, -0.02, 0] },
      ],
      g,
    );
    rightWeapon = g;
  } else if (look.weapon === 'staff') {
    rightWeapon = simple(
      [
        { g: new THREE.CylinderGeometry(0.014, 0.016, 0.66, 6), c: WOOD, at: [0, 0.12, 0.03] },
        { g: new THREE.DodecahedronGeometry(0.036), c: look.accent, at: [0, 0.46, 0.03] },
      ],
      handR,
    );
  } else if (look.weapon === 'spear') {
    rightWeapon = simple(
      [
        { g: new THREE.CylinderGeometry(0.013, 0.013, 0.92, 6), c: WOOD, at: [0, 0.2, 0.03] },
        { g: new THREE.ConeGeometry(0.03, 0.12, 5), c: IRON, at: [0, 0.71, 0.03] },
      ],
      handR,
    );
  } else if (look.weapon === 'bow') {
    simple([{ g: new THREE.TorusGeometry(0.2, 0.013, 5, 14, Math.PI), c: WOOD, at: [0, 0.02, 0.05], rot: [0, Math.PI / 2, Math.PI / 2] }], handL);
  }

  // ---- 持ち物の付ける所 ----
  const anchors: Record<LookItemSlot, THREE.Group> = {
    hand: anchor(handR, 0, -0.02, 0.03),
    handL: anchor(handL, 0, -0.02, 0.03),
    waist: anchor(upper, torsoW * 0.9, 0.04, torsoW * torsoD * 0.6),
    back: anchor(upper, 0.03, 0.04, -torsoW * torsoD - 0.05),
  };
  anchors.back.rotation.z = -0.35;
  const defaults: Partial<Record<LookItemSlot, string>> = {};
  for (const item of look.items ?? []) defaults[item.slot] = item.model;
  /** 付けている持ち物の材質（透明度と光り方を体と合わせるため） */
  let itemMaterials: THREE.MeshLambertMaterial[] = [];
  let opacity = 1;
  const bodyMaterials = [material, weaponMat];
  const setItems = (items: Readonly<Partial<Record<LookItemSlot, string>>>) => {
    itemMaterials = [];
    for (const slot of Object.keys(anchors) as LookItemSlot[]) {
      const a = anchors[slot];
      a.clear();
      const model = slot in items ? items[slot] : defaults[slot];
      if (model) itemMaterials.push(...buildModel(model, a));
      // 持ち物も影の計算に入れない（人形と一緒に動くため）
      a.traverse((o) => (o.castShadow = false));
    }
    if (rightWeapon) rightWeapon.visible = !('hand' in items ? items.hand : defaults.hand);
    for (const m of itemMaterials) m.opacity = opacity;
  };
  setItems({});

  let yaw = 0;
  let pose: PuppetPose = {};
  let moving = false;
  /** 歩く動きの強さ（なめらかに始めて止める） */
  let stride = 0;
  /** 台詞の間の動きの強さ（なめらかに始めて止める） */
  let talking = 0;
  let lastElapsed = 0;
  let talkUntil = 0;
  let talkRequest = -1;
  const phase = phaseOf(look);

  /** 姿勢と、歩く・呼吸・台詞の動きを合わせて当てる */
  const apply = (elapsed: number) => {
    const p = pose;
    // しゃがむ（drop）: 股と膝を曲げて腰を落とす。足は地面に残す
    const drop = Math.max(0, p.drop ?? 0);
    const crouch = Math.acos(Math.max(-0.2, 1 - drop / (THIGH + SHIN)));
    const sit = p.sit ?? 0;
    // 歩く: 足の振りは小さく、上下の揺れはほとんど付けない（弾んで見えないように）
    const swing = Math.sin(elapsed * 8.5) * 0.42 * stride;
    const breathe = Math.sin(elapsed * 1.5 + phase) * 0.007;
    // 足を少し開いて立つ（股を外へ少し開き、膝をわずかに曲げる）
    const stance = 0.055 * (1 - sit) * (1 - stride * 0.6);
    hipL.rotation.set(-crouch - sit * 1.45 + swing - 0.03, 0, -stance);
    hipR.rotation.set(-crouch - sit * 1.45 - swing - 0.03, 0, stance);
    kneeL.rotation.x = crouch * 2 + sit * 1.45 + Math.max(0, -swing) * 0.5 + 0.06;
    kneeR.rotation.x = crouch * 2 + sit * 1.45 + Math.max(0, swing) * 0.5 + 0.06;
    const bob = Math.abs(Math.sin(elapsed * 8.5)) * 0.004 * stride;
    root.position.y = (p.lift ?? 0) - drop - sit * (THIGH * 0.95) + bob - 0.004;
    root.position.z = -(p.back ?? 0);
    // 台詞の間: 頭と肩がわずかに動く（口は動かさない）
    const tk = talking;
    const talkNod = tk * (Math.sin(elapsed * 3.6) * 0.03 + Math.sin(elapsed * 6.1 + 1) * 0.012);
    const talkTurn = tk * Math.sin(elapsed * 1.9 + 0.4) * 0.035;
    upper.rotation.set((p.bow ?? 0) + breathe * 0.4 + 0.02, tk * Math.sin(elapsed * 1.9) * 0.02, tk * Math.sin(elapsed * 2.4 + 0.7) * 0.012);
    upper.scale.y = 1 + breathe * 0.2;
    head.rotation.set((p.head ?? 0) - breathe * 0.4 + talkNod, (p.headTurn ?? 0) + talkTurn, p.tilt ?? 0);
    // 腕: 前へ上げるのは x の負の向き。歩く間は足と逆に振る
    armPose(shoulderL, elbowL, p.armL ?? 0, p.spreadL ?? 0, swing * 0.55 - breathe, -1);
    armPose(shoulderR, elbowR, p.armR ?? 0, p.spreadR ?? 0, -swing * 0.55 + breathe, 1);
  };
  const armPose = (shoulder: THREE.Bone, elbow: THREE.Bone, raise: number, spread: number, swingV: number, side: number) => {
    shoulder.rotation.x = -raise - swingV;
    // 肩幅がある分、腕は体から少し離して下ろす
    shoulder.rotation.z = side * (0.13 + spread);
    // 腕を前に上げている時は、肘を少し曲げる（手もとで作業する形）
    elbow.rotation.x = -0.16 - Math.min(0.5, Math.max(0, raise) * 0.35);
  };

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
      for (const m of bodyMaterials) m.emissive.setRGB(amount * 0.9, amount * 0.1, amount * 0.1);
    },
    setOpacity(value) {
      opacity = value;
      const clear = value < 1;
      for (const m of [...bodyMaterials, lineMat]) {
        m.opacity = value;
        m.transparent = clear;
      }
      for (const m of itemMaterials) m.opacity = value;
      shadowMat.opacity = BLOB_OPACITY * value;
    },
    setGlow(color, amount) {
      for (const m of bodyMaterials) m.emissive.setRGB(color.r * amount * 0.8, color.g * amount * 0.8, color.b * amount * 0.8);
    },
    setPose(next) {
      pose = next;
      apply(lastElapsed);
      // 頭の上の位置（話者の印）を、姿勢に合わせて測り直す
      (mesh as { boundingBox: THREE.Box3 | null }).boundingBox = null;
    },
    setItems,
    itemPoint: (slot) => anchors[slot].getWorldPosition(new THREE.Vector3()),
    setMoving(on) {
      moving = on;
    },
    talk(seconds) {
      talkRequest = seconds;
    },
    update(elapsed) {
      const dt = Math.min(0.1, Math.max(0, elapsed - lastElapsed));
      lastElapsed = elapsed;
      stride += ((moving ? 1 : 0) - stride) * Math.min(1, dt * 10);
      if (talkRequest >= 0) {
        talkUntil = talkRequest > 0 ? elapsed + talkRequest : 0;
        talkRequest = -1;
      }
      talking += ((elapsed < talkUntil ? 1 : 0) - talking) * Math.min(1, dt * 4);
      apply(elapsed);
      // まばたき: 人形ごとにずらした間（約 3.6 秒ごと）に、0.14 秒だけ目を閉じる
      // （elapsed が 0 の時は閉じない: 顔の枠は 0 で1度だけ描くため）
      const cycle = (elapsed + phase) % 3.6;
      const blink = elapsed > 0 && cycle < 0.14 ? 1 - Math.sin((cycle / 0.14) * Math.PI) * 0.9 : 1;
      eyeL.scale.y = blink;
      eyeR.scale.y = blink;
    },
  };
}

/** 開いた形（マント・頭巾）に、向きを裏返した写しを足して、裏から見ても見えるようにする（材質を両面にすると描く量が倍になるため） */
function bothSides(g: THREE.BufferGeometry): THREE.BufferGeometry {
  const back = g.clone();
  const index = back.index!;
  for (let i = 0; i < index.count; i += 3) {
    const a = index.getX(i + 1);
    index.setX(i + 1, index.getX(i + 2));
    index.setX(i + 2, a);
  }
  const n = back.attributes.normal!;
  for (let i = 0; i < n.count; i++) n.setXYZ(i, -n.getX(i), -n.getY(i), -n.getZ(i));
  for (const name of Object.keys(g.attributes)) if (name !== 'position' && name !== 'normal') {
    g.deleteAttribute(name);
    back.deleteAttribute(name);
  }
  const merged = mergeGeometries([g, back])!;
  g.dispose();
  back.dispose();
  return merged;
}

function anchor(parent: THREE.Object3D, x: number, y: number, z: number): THREE.Group {
  const g = new THREE.Group();
  g.position.set(x, y, z);
  parent.add(g);
  return g;
}

type AddFn = (
  geometry: THREE.BufferGeometry,
  color: number | THREE.Color,
  b: THREE.Bone,
  at: V3,
  o?: { rot?: V3; scale?: V3; quat?: THREE.Quaternion; outline?: number },
) => void;
interface Shapes {
  sphere(r: number, ws?: number, hs?: number): THREE.BufferGeometry;
  cone(r: number, h: number, n?: number): THREE.BufferGeometry;
  dome(r: number, theta: number, phiStart?: number, phiLength?: number): THREE.BufferGeometry;
  cylinder(rt: number, rb: number, h: number, n?: number): THREE.BufferGeometry;
  hoodShell(r: number): THREE.BufferGeometry;
}

const UP = new THREE.Vector3(0, 1, 0);

/**
 * 髪（束のある形）: 頭の上と後ろを覆う土台に、細長い房（円すい）を頭の形に沿って並べる。
 * 房の根もとを頭の面に置き、先を dir の向きへ伸ばす。cy は頭の中心の高さ（頭の骨から）
 */
function addHair(look: PuppetLook, hairC: THREE.Color, accentC: THREE.Color, head: THREE.Bone, cy: number, add: AddFn, s: Shapes): void {
  const style = look.hairStyle ?? 'short';
  const R = HEAD_R;
  const lock = (base: V3, dir: V3, len: number, r: number) => {
    const d = new THREE.Vector3(...dir).normalize();
    const q = new THREE.Quaternion().setFromUnitVectors(UP, d);
    add(s.cone(r, len), hairC, head, [base[0] + (d.x * len) / 2, cy + base[1] + (d.y * len) / 2, base[2] + (d.z * len) / 2], { quat: q });
  };
  // 土台（額を少し見せ、後ろ頭を深く覆う）
  add(s.dome(R * 1.08, style === 'cropped' ? Math.PI * 0.44 : Math.PI * 0.56), hairC, head, [0, cy + 0.004, -0.006], { rot: [-0.42, 0, 0], scale: [1.0, 1.04, 1.04] });
  add(s.sphere(R * 1.02, 12, 9), hairC, head, [0, cy + 0.006, -0.024], { scale: [0.98, 1.0, 0.92] });
  if (style === 'cropped') {
    // 刈り込んだ髪: 額の上の短い房だけ
    for (const x of [-0.05, 0, 0.05]) lock([x, R * 0.8, R * 0.52], [x * 2, 0.5, 1], 0.04, 0.022);
    return;
  }
  // 前髪（額にかかる房。斜めに流す）
  const bangs: readonly V3[] =
    style === 'messy'
      ? [
          [-0.06, R * 0.86, R * 0.48],
          [-0.015, R * 0.92, R * 0.46],
          [0.035, R * 0.9, R * 0.48],
          [0.075, R * 0.8, R * 0.5],
        ]
      : [
          [-0.055, R * 0.88, R * 0.46],
          [0.0, R * 0.92, R * 0.46],
          [0.05, R * 0.86, R * 0.48],
        ];
  // 前髪は目にかからない長さにする（上から映すカメラでも目が見えるように）
  bangs.forEach((b, i) => lock(b, [style === 'messy' ? (i % 2 ? 0.35 : -0.15) : 0.45, -1, 0.5], style === 'messy' ? 0.066 : 0.056, 0.026));
  // 耳の前に垂れる房
  const sideLen = style === 'long' ? 0.2 : style === 'tied' || style === 'braid' ? 0.1 : 0.075;
  for (const sx of [-1, 1]) lock([sx * R * 0.9, R * 0.35, R * 0.12], [sx * 0.15, -1, 0.05], sideLen, 0.028);
  if (style === 'messy' || style === 'short') {
    // 頭頂から後ろへ流れる房（ばらつかせる）
    const crown: readonly [V3, V3][] = [
      [
        [-0.05, R * 0.98, -0.01],
        [-0.5, 0.05, -1],
      ],
      [
        [0.03, R * 1.02, 0.0],
        [0.4, 0.1, -1],
      ],
      [
        [-0.08, R * 0.7, -0.06],
        [-1, -0.2, -0.7],
      ],
      [
        [0.08, R * 0.7, -0.06],
        [1, -0.1, -0.7],
      ],
      [
        [0.0, R * 0.6, -0.09],
        [0.1, -0.6, -1],
      ],
    ];
    for (const [b, d] of crown) lock(b, d, style === 'messy' ? 0.07 : 0.06, 0.034);
    // 襟足
    for (const x of [-0.04, 0.03]) lock([x, -0.02, -R * 0.85], [x * 3, -1, -0.35], 0.06, 0.03);
  }
  if (style === 'tied' || style === 'braid') {
    // 後ろでひとつに束ねた髪（結い紐は差し色）
    add(s.cylinder(0.022, 0.022, 0.02, 8), accentC, head, [0, cy - 0.02, -R - 0.012], { rot: [Math.PI / 2 - 0.3, 0, 0] });
    if (style === 'tied') {
      lock([0, -0.03, -R - 0.02], [0, -1, -0.35], 0.16, 0.034);
      lock([0.012, -0.04, -R - 0.025], [0.25, -1, -0.2], 0.12, 0.024);
    } else for (let i = 0; i < 4; i++) add(s.sphere(0.026 - i * 0.002, 8, 6), hairC, head, [0, cy - 0.06 - i * 0.045, -R - 0.03 + i * 0.008]);
  } else if (style === 'long') {
    for (const x of [-0.06, 0, 0.06]) lock([x, R * 0.2, -R * 0.82], [x * 1.5, -1, -0.15], 0.26, 0.042);
  } else if (style === 'bun') {
    // まとめ髪: 後ろ頭の上に丸いまとめ
    add(new THREE.DodecahedronGeometry(0.05), hairC, head, [0, cy + 0.06, -R * 0.95]);
  } else if (style === 'curly') {
    for (const [x, y, z] of [
      [-0.11, 0.06, 0.0],
      [0.11, 0.06, 0.0],
      [-0.09, -0.03, -0.07],
      [0.09, -0.03, -0.07],
      [0, 0.11, -0.05],
      [-0.06, 0.1, 0.04],
      [0.06, 0.1, 0.04],
    ] as const) {
      add(new THREE.DodecahedronGeometry(0.042), hairC, head, [x, cy + y, z]);
    }
  }
}

/** 帽子（頭の骨に付ける。cy は頭の中心の高さ） */
function addHat(hat: NonNullable<PuppetLook['hat']>, look: PuppetLook, accentC: THREE.Color, head: THREE.Bone, cy: number, add: AddFn, s: Shapes): void {
  const r = HEAD_R + 0.02;
  if (hat === 'helm') {
    // 鉄の兜（丸い鉢と、ふち）
    add(s.dome(r, Math.PI * 0.52), IRON, head, [0, cy, 0], { rot: [-0.25, 0, 0] });
    add(s.cylinder(r * 1.02, r * 1.06, 0.02, 14), IRON, head, [0, cy + 0.02, -0.01], { rot: [-0.25, 0, 0] });
  } else if (hat === 'wizard') {
    add(s.cylinder(0.2, 0.2, 0.016, 16), look.hatColor ?? look.body, head, [0, cy + 0.085, 0]);
    add(s.cone(0.11, 0.26, 10), look.hatColor ?? look.body, head, [0, cy + 0.22, -0.02], { rot: [-0.15, 0, 0] });
  } else if (hat === 'hood') {
    const c = look.hatColor ?? look.cloak ?? look.body;
    add(s.hoodShell(r + 0.01), c, head, [0, cy, -0.005], { rot: [-0.2, 0, 0] });
  } else if (hat === 'brim') {
    // つばの広い帽子（旅人）
    const c = look.hatColor ?? LEATHER;
    add(s.cylinder(0.205, 0.205, 0.012, 16), c, head, [0, cy + 0.07, 0], { rot: [-0.08, 0, 0] });
    add(s.cylinder(0.1, 0.12, 0.09, 12), c, head, [0, cy + 0.115, -0.006], { rot: [-0.08, 0, 0] });
  } else {
    // 平たい布の帽子
    const c = look.hatColor ?? accentC;
    add(s.cylinder(0.125, 0.135, 0.055, 14), c, head, [0, cy + 0.1, -0.01]);
    add(s.cylinder(0.16, 0.16, 0.01, 14), c, head, [0, cy + 0.078, 0.01]);
  }
}
