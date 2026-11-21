import * as THREE from 'three';
import type { Direction } from '../core/geometry';
import type { LookDefinition, LookItemSlot } from '../data/story/looks';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { buildModel } from './props';

/**
 * 人形（人形劇の水準の、部品を組み合わせた人形。序章の場面4の見本の PR で、箱の人形から作り直した）。
 * 頭が大きめの約 2.8 頭身。体・頭・髪・服・腕・手・足を別の部品にし、髪の形と色・肌の色・服の形と色・持ち物を
 * 見た目のデータ（src/data/story/looks.ts）で組み合わせる。陰影はなめらかに塗り、輪郭の線は付けない。
 * 顔には目と口があり、まばたきをする。口は台詞の間だけ小さく動く（talk）。歩く間は足と腕を振る（setMoving）。
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
  /** 口を seconds 秒だけ小さく動かす（台詞の間）。0 で止める */
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

const SKIN = 0xf1c9a5;
const DARK = 0x2a2220;
const STEEL = 0xd8dde3;
const WOOD = 0x8a5a2b;
const SHOE = 0x3a2a20;

/** 体の寸法（scale 1 の時） */
const HIP_Y = 0.24;
const THIGH = 0.115;
const SHIN = 0.115;
const TORSO_H = 0.27;
const SHOULDER_Y = HIP_Y + TORSO_H - 0.035;
const NECK_Y = HIP_Y + TORSO_H;
const HEAD_R = 0.152;
const HEAD_Y = NECK_Y + HEAD_R * 0.92;
const ARM = 0.19;

/** 顔の正面は +z（南）。y 軸まわりに 90 度回すごとに 東(+x) → 北 → 西 を向く */
export const YAW_OF: Readonly<Record<Direction, number>> = {
  south: 0,
  east: Math.PI / 2,
  north: Math.PI,
  west: (Math.PI * 3) / 2,
};

/** 形を共有する（同じ形の部品を人形ごとに作り直さない。スマホで重くしないため） */
const geometries = new Map<string, THREE.BufferGeometry>();
const shared = (key: string, make: () => THREE.BufferGeometry) => {
  let g = geometries.get(key);
  if (!g) {
    g = make();
    geometries.set(key, g);
  }
  return g;
};
/**
 * 形の細かさ（1 がふつう。戦闘の駒は 0.5 で、球や円柱の分割を粗くする。駒が十体以上並ぶ戦闘でも軽くするため）。
 * createPuppet の中で一時的に切り替える
 */
let detail = 1;
const seg = (n: number, min: number) => Math.max(min, Math.round(n * detail));
const sphere = (r: number, w = 16, h = 12) => {
  const [sw, sh] = [seg(w, 6), seg(h, 4)];
  return shared(`s${r}-${sw}-${sh}`, () => new THREE.SphereGeometry(r, sw, sh));
};
const capsule = (r: number, len: number) => {
  const [c, rs] = [seg(3, 2), seg(8, 5)];
  return shared(`c${r}-${len}-${c}-${rs}`, () => new THREE.CapsuleGeometry(r, len, c, rs));
};
const cylinder = (rt: number, rb: number, h: number, n = 16) => {
  const sn = seg(n, 6);
  return shared(`y${rt}-${rb}-${h}-${sn}`, () => new THREE.CylinderGeometry(rt, rb, h, sn));
};
const cone = (r: number, h: number, n = 12) => {
  const sn = seg(n, 5);
  return shared(`k${r}-${h}-${sn}`, () => new THREE.ConeGeometry(r, h, sn));
};
/** 頭の上と後ろを覆う髪の帽子（球の上の部分） */
const hairCap = (r: number, theta: number) => {
  const [sw, sh] = [seg(18, 8), seg(12, 5)];
  return shared(`h${r}-${theta}-${sw}-${sh}`, () => new THREE.SphereGeometry(r, sw, sh, 0, Math.PI * 2, 0, theta));
};
const roundBox = (w: number, h: number, d: number) => {
  const [c, rs] = [seg(3, 2), seg(8, 5)];
  return shared(`b${w}-${h}-${d}-${c}-${rs}`, () => new THREE.CapsuleGeometry(Math.min(w, d) / 2, Math.max(0.001, h - Math.min(w, d)), c, rs));
};

/** 名前から決まる小さな数（まばたきの間を人形ごとにずらす。乱数は使わない） */
function phaseOf(look: PuppetLook): number {
  const n = (look.body * 7 + (look.hair ?? 3) * 13 + (look.accent ?? 5)) % 997;
  return (n / 997) * 3;
}

/** 人形の作り方の選び方。low は戦闘の駒（形の分割を粗くし、頬の赤みと眉を省く） */
export interface PuppetOptions {
  readonly detail?: 'high' | 'low';
}

export function createPuppet(look: PuppetLook, options: PuppetOptions = {}): Puppet {
  const low = options.detail === 'low';
  detail = low ? 0.5 : 1;
  try {
    return buildPuppet(look, low);
  } finally {
    detail = 1;
  }
}

function buildPuppet(look: PuppetLook, low: boolean): Puppet {
  const group = new THREE.Group();
  const body = new THREE.Group();
  group.add(body);
  // 体の大きさ（背の高さ）は、体全体の倍率で変える
  const figure = new THREE.Group();
  figure.scale.setScalar(look.scale ?? 1);
  body.add(figure);
  const w = look.width ?? 1;
  const materials: THREE.MeshLambertMaterial[] = [];
  const outfit = look.outfit ?? (look.robe ? 'robe' : 'tunic');

  const mat = (color: number) => {
    const m = new THREE.MeshLambertMaterial({ color, transparent: true });
    materials.push(m);
    return m;
  };
  const bodyMat = mat(look.body);
  const accentMat = mat(look.accent);
  const skinMat = mat(look.skin ?? SKIN);
  const darkMat = mat(DARK);
  const legMat = mat(look.legs ?? 0x4a3a30);
  const shoeMat = mat(look.shoes ?? SHOE);
  const hairMat = look.hair !== undefined ? mat(look.hair) : undefined;

  const part = (geometry: THREE.BufferGeometry, material: THREE.Material, x: number, y: number, z: number, parent: THREE.Object3D) => {
    const m = new THREE.Mesh(geometry, material);
    m.position.set(x, y, z);
    m.castShadow = true;
    parent.add(m);
    return m;
  };
  const pivot = (parent: THREE.Object3D, x: number, y: number, z: number) => {
    const g = new THREE.Group();
    g.position.set(x, y, z);
    parent.add(g);
    return g;
  };

  // ---- 脚（股・膝で曲がる。腰掛ける・しゃがむ・歩く） ----
  const hipX = 0.055 * Math.min(1.25, w);
  const legR = 0.042 * Math.min(1.2, w);
  const makeLeg = (x: number) => {
    const hip = pivot(figure, x, HIP_Y, 0);
    part(capsule(legR, THIGH - legR), legMat, 0, -THIGH / 2, 0, hip);
    const knee = pivot(hip, 0, -THIGH, 0);
    part(capsule(legR * 0.92, SHIN - legR), legMat, 0, -SHIN / 2, 0, knee);
    const shoe = part(roundBox(0.075, 0.05, 0.11), shoeMat, 0, -SHIN + 0.012, 0.018, knee);
    shoe.rotation.x = Math.PI / 2;
    return { hip, knee };
  };
  const legL = makeLeg(-hipX);
  const legR_ = makeLeg(hipX);

  // ---- 上半身（腰を軸に前へ倒す） ----
  const upper = pivot(figure, 0, HIP_Y, 0);
  const torsoW = 0.115 * w;
  const torsoD = 0.82;
  // 胴（服の形で変える）。少し平たい円柱
  const torso = part(cylinder(torsoW * 0.92, torsoW * 1.08, TORSO_H, 14), bodyMat, 0, TORSO_H / 2, 0, upper);
  torso.scale.z = torsoD;
  // 肩の丸み
  const shoulders = part(sphere(torsoW * 0.98, 18, 10), bodyMat, 0, TORSO_H - 0.01, 0, upper);
  shoulders.scale.set(1, 0.42, torsoD);
  // 帯
  const belt = part(cylinder(torsoW * 1.06, torsoW * 1.07, 0.035, 14), accentMat, 0, 0.06, 0, upper);
  belt.scale.z = torsoD + 0.02;
  // 襟（帯と同じ色の細い輪）
  const collar = part(cylinder(0.05, 0.068, 0.03, 14), accentMat, 0, TORSO_H + 0.005, 0, upper);
  collar.scale.z = 0.9;
  // 裾（服の形）
  if (outfit === 'robe' || outfit === 'coat') {
    // 腰から足もとまでの長い裾（外套・長衣）。coat は前が開いて、脚が見える
    const len = outfit === 'robe' ? HIP_Y - 0.03 : HIP_Y * 0.7;
    const skirt = part(cylinder(torsoW * 1.06, torsoW * 1.42, len, 18), bodyMat, 0, -len / 2 + 0.02, 0, upper);
    skirt.scale.z = torsoD + 0.04;
    if (outfit === 'coat') {
      // 前の合わせ（帯の色の細い線）
      part(roundBox(0.018, TORSO_H * 0.9, 0.018), accentMat, 0, TORSO_H * 0.5, torsoW * torsoD + 0.004, upper);
    }
  } else if (outfit === 'dress') {
    const len = HIP_Y * 0.8;
    const skirt = part(cylinder(torsoW * 1.04, torsoW * 1.6, len, 18), bodyMat, 0, -len / 2 + 0.02, 0, upper);
    skirt.scale.z = torsoD + 0.08;
  } else {
    // 短い上着の裾
    const hem = part(cylinder(torsoW * 1.08, torsoW * 1.22, 0.07, 18), bodyMat, 0, -0.01, 0, upper);
    hem.scale.z = torsoD + 0.03;
  }
  if (outfit === 'apron' || look.apron !== undefined) {
    // 前掛け（作業着。ユナ）
    const apronMat = mat(look.apron ?? look.accent);
    const ap = part(new THREE.BoxGeometry(torsoW * 1.25, TORSO_H * 0.62 + 0.07, 0.012), apronMat, 0, TORSO_H * 0.24, torsoW * torsoD + 0.008, upper);
    ap.rotation.x = -0.06;
  }

  // ---- 腕（肩で回る。肘は少しだけ曲がる） ----
  const shoulderX = torsoW + 0.03;
  const armR = 0.036 * Math.min(1.3, w);
  const makeArm = (x: number) => {
    const shoulder = pivot(upper, x, SHOULDER_Y - HIP_Y, 0);
    part(capsule(armR, ARM * 0.5), bodyMat, 0, -ARM * 0.3, 0, shoulder);
    const elbow = pivot(shoulder, 0, -ARM * 0.55, 0);
    part(capsule(armR * 0.9, ARM * 0.36), bodyMat, 0, -ARM * 0.2, 0, elbow);
    // 袖口（帯の色）と手
    part(cylinder(armR * 1.05, armR * 1.1, 0.02, 10), accentMat, 0, -ARM * 0.4, 0, elbow);
    const hand = part(sphere(0.036, 10, 8), skinMat, 0, -ARM * 0.47, 0, elbow);
    hand.scale.set(0.9, 1.05, 0.85);
    return { shoulder, elbow };
  };
  const armL = makeArm(-shoulderX);
  const armRt = makeArm(shoulderX);
  // 腕は体の横に少し離して下ろす
  armL.shoulder.rotation.z = -0.1;
  armRt.shoulder.rotation.z = 0.1;
  armL.elbow.rotation.x = -0.12;
  armRt.elbow.rotation.x = -0.12;

  // ---- 頭（首を軸に回る） ----
  const head = pivot(upper, 0, NECK_Y - HIP_Y, 0);
  part(cylinder(0.035, 0.04, 0.05, 10), skinMat, 0, 0.01, 0, head);
  const skull = part(sphere(HEAD_R, 18, 13), skinMat, 0, HEAD_Y - NECK_Y, 0, head);
  skull.scale.set(1.04, 0.98, 0.98);
  const face = pivot(head, 0, HEAD_Y - NECK_Y, 0);
  // 目（黒目の楕円と、小さな光）。まばたきは目のグループを縦に縮める
  const eyeY = -0.018;
  const eyeX = 0.056;
  const eyeMat = mat(look.eyes ?? 0x2a1c18);
  const shineMat = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true });
  const eyes: THREE.Group[] = [];
  for (const sx of [-1, 1]) {
    const g = pivot(face, sx * eyeX, eyeY, 0);
    // 顔の球の面に沿わせる
    const zOn = Math.sqrt(HEAD_R * HEAD_R - eyeX * eyeX - eyeY * eyeY) * 0.98 - 0.004;
    g.position.z = zOn;
    g.rotation.y = sx * Math.asin(eyeX / HEAD_R);
    const eye = part(sphere(0.026, 10, 8), eyeMat, 0, 0, 0, g);
    eye.scale.set(0.82, 1.15, 0.42);
    eye.castShadow = false;
    const shine = new THREE.Mesh(sphere(0.008, 8, 6), shineMat);
    shine.position.set(0.006 * sx, 0.01, 0.009);
    g.add(shine);
    eyes.push(g);
    // 眉（髪の色の細い線。戦闘の駒では省く）
    if (low) continue;
    const brow = part(roundBox(0.036, 0.009, 0.009), hairMat ?? darkMat, sx * 0.002, 0.042, -0.004, g);
    brow.rotation.z = Math.PI / 2 + sx * 0.12;
    brow.castShadow = false;
  }
  // 頬の赤み（ごく淡く）
  const blushMat = new THREE.MeshBasicMaterial({ color: 0xf08a7a, transparent: true, opacity: 0.22, depthWrite: false });
  for (const sx of low ? [] : [-1, 1]) {
    const b = new THREE.Mesh(sphere(0.022, 10, 8), blushMat);
    b.position.set(sx * 0.085, -0.055, Math.sqrt(HEAD_R ** 2 - 0.085 ** 2 - 0.055 ** 2) - 0.006);
    b.scale.set(1.2, 0.6, 0.3);
    face.add(b);
  }
  // 口（小さな横長の楕円。台詞の間だけ縦に開く）
  const mouthMat = mat(0x8a3a32);
  const mouth = part(sphere(0.016, 10, 8), mouthMat, 0, -0.072, Math.sqrt(HEAD_R ** 2 - 0.072 ** 2) - 0.008, face);
  mouth.castShadow = false;
  mouth.userData.keep = true;
  const mouthClosed = { x: 1.15, y: 0.28 };
  mouth.scale.set(mouthClosed.x, mouthClosed.y, 0.4);

  if (hairMat) addHair(look, hairMat, accentMat, part, face);
  if (look.hat) addHat(look.hat, accentMat, part, face);
  else if (!hairMat) addHat('cap', accentMat, part, face);
  if (look.beard !== undefined) {
    const beard = part(sphere(0.09, 14, 10), mat(look.beard), 0, -0.08, 0.07, face);
    beard.scale.set(1, 0.9, 0.7);
  }

  // ---- 武器（右手の武器は、右手に物を持つ間は隠す） ----
  let rightWeapon: THREE.Object3D | undefined;
  const handR = pivot(armRt.elbow, 0, -ARM * 0.5, 0.0);
  const handL = pivot(armL.elbow, 0, -ARM * 0.5, 0.0);
  if (look.weapon === 'sword') {
    const g = pivot(handR, 0, 0, 0.02);
    part(new THREE.BoxGeometry(0.035, 0.36, 0.012), mat(STEEL), 0, -0.2, 0, g);
    part(new THREE.BoxGeometry(0.09, 0.02, 0.03), accentMat, 0, -0.02, 0, g);
    // 剣先を下へ、脚に沿わせて提げる（前へ突き出すと、ほうきや棒に見えるため。初見の検査）
    g.rotation.x = 0.25;
    rightWeapon = g;
  } else if (look.weapon === 'staff') {
    const staff = part(cylinder(0.014, 0.016, 0.62, 6), mat(WOOD), 0, 0.12, 0.03, handR);
    part(sphere(0.042, 10, 8), accentMat, 0, 0.33, 0, staff);
    rightWeapon = staff;
  } else if (look.weapon === 'spear') {
    const shaft = part(cylinder(0.013, 0.013, 0.9, 6), mat(WOOD), 0, 0.2, 0.03, handR);
    part(cone(0.032, 0.12, 6), mat(STEEL), 0, 0.5, 0, shaft);
    rightWeapon = shaft;
  } else if (look.weapon === 'bow') {
    const bow = part(new THREE.TorusGeometry(0.2, 0.014, 6, 16, Math.PI), mat(WOOD), 0, 0.02, 0.05, handL);
    bow.rotation.set(0, Math.PI / 2, Math.PI / 2);
  }

  // ---- 持ち物の付ける所 ----
  const anchors: Record<LookItemSlot, THREE.Group> = {
    hand: anchor(handR, 0, -0.02, 0.03),
    handL: anchor(handL, 0, -0.02, 0.03),
    waist: anchor(upper, torsoW * 0.9, 0.04, torsoW * torsoD * 0.6),
    back: anchor(upper, 0.03, 0.04, -torsoW * torsoD - 0.03),
  };
  anchors.back.rotation.z = -0.35;
  // 同じグループの中の、同じ材質の部品を1つの形にまとめる（描く回数を減らして、戦闘で駒が多い時やスマホでも軽くするため）
  mergeParts(figure);
  const defaults: Partial<Record<LookItemSlot, string>> = {};
  for (const item of look.items ?? []) defaults[item.slot] = item.model;
  /** 付けている持ち物の材質（透明度と光り方を体と合わせるため） */
  let itemMaterials: THREE.MeshLambertMaterial[] = [];
  let opacity = 1;
  const setItems = (items: Readonly<Partial<Record<LookItemSlot, string>>>) => {
    itemMaterials = [];
    for (const slot of Object.keys(anchors) as LookItemSlot[]) {
      const a = anchors[slot];
      a.clear();
      const model = slot in items ? items[slot] : defaults[slot];
      if (model) itemMaterials.push(...buildModel(model, a));
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
  let lastElapsed = 0;
  let talkUntil = 0;
  let talkRequest = -1;
  const phase = phaseOf(look);
  const all = () => [...materials, ...itemMaterials];

  /** 姿勢と、歩く・呼吸の動きを合わせて当てる */
  const apply = (elapsed: number) => {
    const p = pose;
    // しゃがむ（drop）: 股と膝を曲げて腰を落とす。足は地面に残す
    const drop = Math.max(0, p.drop ?? 0);
    const crouch = Math.acos(Math.max(-0.2, 1 - drop / (THIGH + SHIN)));
    const sit = p.sit ?? 0;
    const swing = Math.sin(elapsed * 11) * 0.55 * stride;
    const breathe = Math.sin(elapsed * 1.9 + phase) * 0.012;
    legL.hip.rotation.x = -crouch - sit * 1.45 + swing;
    legR_.hip.rotation.x = -crouch - sit * 1.45 - swing;
    legL.knee.rotation.x = crouch * 2 + sit * 1.45 + Math.max(0, -swing) * 0.6;
    legR_.knee.rotation.x = crouch * 2 + sit * 1.45 + Math.max(0, swing) * 0.6;
    const bob = Math.abs(Math.sin(elapsed * 11)) * 0.012 * stride;
    figure.position.y = (p.lift ?? 0) - drop - sit * (THIGH * 0.95) + bob;
    figure.position.z = -(p.back ?? 0);
    upper.rotation.x = (p.bow ?? 0) + breathe * 0.4;
    upper.scale.y = 1 + breathe * 0.25;
    head.rotation.set((p.head ?? 0) - breathe * 0.5, p.headTurn ?? 0, p.tilt ?? 0);
    // 腕: 前へ上げるのは x の負の向き。歩く間は足と逆に振る
    armL.shoulder.rotation.x = -(p.armL ?? 0) - swing * 0.7 + breathe;
    armRt.shoulder.rotation.x = -(p.armR ?? 0) + swing * 0.7 - breathe;
    armL.shoulder.rotation.z = -0.1 - (p.spreadL ?? 0);
    armRt.shoulder.rotation.z = 0.1 + (p.spreadR ?? 0);
    // 腕を前に上げている時は、肘を少し曲げる（手もとで作業する形）
    armL.elbow.rotation.x = -0.12 - Math.min(0.5, Math.max(0, p.armL ?? 0) * 0.35);
    armRt.elbow.rotation.x = -0.12 - Math.min(0.5, Math.max(0, p.armR ?? 0) * 0.35);
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
      for (const m of materials) m.emissive.setRGB(amount * 0.9, amount * 0.1, amount * 0.1);
    },
    setOpacity(value) {
      opacity = value;
      for (const m of all()) m.opacity = value;
      shineMat.opacity = value;
      blushMat.opacity = 0.22 * value;
    },
    setGlow(color, amount) {
      for (const m of materials) m.emissive.setRGB(color.r * amount * 0.8, color.g * amount * 0.8, color.b * amount * 0.8);
    },
    setPose(next) {
      pose = next;
      apply(lastElapsed);
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
      stride += ((moving ? 1 : 0) - stride) * Math.min(1, dt * 12);
      // 台詞の口の動き（talk で頼まれた秒を、今の時刻から数える）
      if (talkRequest >= 0) {
        talkUntil = talkRequest > 0 ? elapsed + talkRequest : 0;
        talkRequest = -1;
      }
      apply(elapsed);
      // まばたき: 人形ごとにずらした間（約 3.4 秒ごと）に、0.13 秒だけ目を閉じる
      // （elapsed が 0 の時は閉じない: 顔の枠は 0 で1度だけ描くため）
      const cycle = (elapsed + phase) % 3.4;
      const blink = elapsed > 0 && cycle < 0.13 ? 1 - Math.sin((cycle / 0.13) * Math.PI) * 0.92 : 1;
      for (const e of eyes) e.scale.y = blink;
      // 口: 台詞の間だけ、小さく開け閉めする
      if (elapsed < talkUntil) {
        const open = (Math.sin(elapsed * 17) * 0.5 + 0.5) * (0.6 + 0.4 * Math.sin(elapsed * 5.3));
        mouth.scale.set(mouthClosed.x * (1 - open * 0.25), mouthClosed.y + open * 0.75, 0.4);
      } else mouth.scale.set(mouthClosed.x, mouthClosed.y, 0.4);
    },
  };
}

/**
 * グループごとに、子を持たない部品のうち同じ材質のものを、形を合わせて1つの部品にする（動かす部品と口は残す）。
 * 合わせる前の部品の位置・向き・大きさは、形に焼き込む
 */
function mergeParts(root: THREE.Object3D): void {
  const groups: THREE.Object3D[] = [];
  root.traverse((o) => {
    if (!(o instanceof THREE.Mesh)) groups.push(o);
  });
  for (const g of groups) {
    const byMaterial = new Map<THREE.Material, THREE.Mesh[]>();
    for (const c of g.children) {
      if (!(c instanceof THREE.Mesh) || c.children.length > 0 || c.userData.keep || Array.isArray(c.material)) continue;
      const list = byMaterial.get(c.material) ?? [];
      list.push(c);
      byMaterial.set(c.material, list);
    }
    for (const [material, meshes] of byMaterial) {
      if (meshes.length < 2) continue;
      const parts = meshes.map((m) => {
        m.updateMatrix();
        const geo = (m.geometry.index ? m.geometry.toNonIndexed() : m.geometry.clone()).applyMatrix4(m.matrix);
        for (const name of Object.keys(geo.attributes)) if (name !== 'position' && name !== 'normal') geo.deleteAttribute(name);
        return geo;
      });
      const merged = mergeGeometries(parts);
      for (const p of parts) p.dispose();
      if (!merged) continue;
      const mesh = new THREE.Mesh(merged, material);
      mesh.castShadow = meshes.some((m) => m.castShadow);
      for (const m of meshes) g.remove(m);
      g.add(mesh);
    }
  }
}

function anchor(parent: THREE.Object3D, x: number, y: number, z: number): THREE.Group {
  const g = new THREE.Group();
  g.position.set(x, y, z);
  parent.add(g);
  return g;
}

type PartFn = (g: THREE.BufferGeometry, m: THREE.Material, x: number, y: number, z: number, parent: THREE.Object3D) => THREE.Mesh;

/** 髪の形（face は頭の中心に置いたグループ） */
function addHair(look: PuppetLook, hairMat: THREE.Material, accentMat: THREE.Material, part: PartFn, face: THREE.Group): void {
  const style = look.hairStyle ?? 'short';
  const r = HEAD_R + 0.012;
  // 頭の上と後ろを覆う帽子（前を少し上げ、後ろを深くする）
  const cap = part(hairCap(r, style === 'cropped' ? Math.PI * 0.42 : Math.PI * 0.55), hairMat, 0, 0, 0, face);
  cap.rotation.x = -0.42;
  cap.scale.set(1.05, 1, 1.02);
  // 後ろ頭
  const backHead = part(sphere(r * 0.96, 16, 12), hairMat, 0, 0.0, -0.03, face);
  backHead.scale.set(1.02, 0.96, 0.9);
  if (style !== 'cropped') {
    // 前髪（額にかかる房）
    const tufts: readonly (readonly [number, number, number])[] =
      style === 'messy'
        ? [
            [-0.07, 0.07, 0.35],
            [0.0, 0.085, -0.1],
            [0.07, 0.07, -0.4],
          ]
        : [
            [-0.075, 0.065, 0.25],
            [-0.02, 0.08, 0.05],
            [0.04, 0.078, -0.1],
            [0.09, 0.06, -0.3],
          ];
    for (const [x, y, rot] of tufts) {
      const z = Math.sqrt(Math.max(0, r * r - x * x - y * y)) - 0.008;
      const t = part(sphere(0.042, 10, 8), hairMat, x, y, z, face);
      t.scale.set(0.95, 1.25, 0.45);
      t.rotation.z = rot;
    }
    // 耳の前に垂れる髪（顔の横）
    for (const sx of [-1, 1]) {
      const side = part(sphere(0.045, 10, 8), hairMat, sx * (r - 0.02), -0.02, 0.02, face);
      side.scale.set(0.45, style === 'long' ? 1.9 : 1.2, 0.8);
    }
  }
  if (style === 'tied') {
    // 後ろでひとつに束ねた髪（結い紐は帯の色）
    part(cylinder(0.026, 0.026, 0.02, 10), accentMat, 0, 0.02, -r - 0.005, face).rotation.x = Math.PI / 2;
    const tail = part(capsule(0.032, 0.13), hairMat, 0, -0.06, -r - 0.03, face);
    tail.rotation.x = 0.3;
  } else if (style === 'long') {
    const back = part(capsule(0.1, 0.12), hairMat, 0, -0.1, -0.07, face);
    back.scale.set(1.25, 1, 0.5);
  } else if (style === 'bun') {
    part(sphere(0.06, 14, 10), hairMat, 0, 0.1, -0.12, face);
  } else if (style === 'curly') {
    for (const [x, y, z] of [
      [-0.13, 0.08, 0.0],
      [0.13, 0.08, 0.0],
      [-0.11, -0.02, -0.08],
      [0.11, -0.02, -0.08],
      [0, 0.14, -0.04],
      [-0.07, 0.13, 0.04],
      [0.07, 0.13, 0.04],
    ] as const) {
      part(sphere(0.05, 10, 8), hairMat, x, y, z, face);
    }
  } else if (style === 'messy') {
    for (const [x, rot] of [
      [-0.07, 0.5],
      [0.05, -0.4],
      [0.0, 0.1],
    ] as const) {
      const tuft = part(cone(0.035, 0.08, 8), hairMat, x, r + 0.01, 0.02, face);
      tuft.rotation.z = rot;
    }
  } else if (style === 'braid') {
    for (let i = 0; i < 4; i++) part(sphere(0.03 - i * 0.002, 10, 8), hairMat, 0.06, -0.08 - i * 0.05, -0.1 + i * 0.01, face);
  }
}

/** 帽子（face は頭の中心に置いたグループ） */
function addHat(hat: NonNullable<PuppetLook['hat']>, accentMat: THREE.Material, part: PartFn, face: THREE.Group): void {
  const r = HEAD_R + 0.018;
  if (hat === 'helm') {
    // 兜（丸い鉢と、ふち）
    const bowl = part(hairCap(r, Math.PI * 0.52), accentMat, 0, 0, 0, face);
    bowl.rotation.x = -0.25;
    part(cylinder(r * 1.02, r * 1.05, 0.02, 18), accentMat, 0, 0.02, -0.01, face).rotation.x = -0.25;
  } else if (hat === 'wizard') {
    part(cylinder(0.24, 0.24, 0.02, 20), accentMat, 0, 0.1, 0, face);
    const c = part(cone(0.13, 0.3, 14), accentMat, 0, 0.26, -0.02, face);
    c.rotation.x = -0.15;
  } else if (hat === 'hood') {
    const hood = part(hairCap(r + 0.01, Math.PI * 0.62), accentMat, 0, 0, -0.01, face);
    hood.rotation.x = -0.55;
    part(cone(0.06, 0.1, 10), accentMat, 0, 0.12, -0.13, face).rotation.x = -1.0;
  } else {
    // 平たい帽子
    part(cylinder(0.15, 0.16, 0.06, 18), accentMat, 0, 0.12, -0.01, face);
    part(cylinder(0.19, 0.19, 0.012, 18), accentMat, 0, 0.095, 0.01, face);
  }
}
