import * as THREE from 'three';
import type { Direction } from '../core/geometry';
import type { LookDefinition, LookItemSlot } from '../data/story/looks';
import { buildModel } from './props';

/**
 * 仮の人形。箱と多面体を組み合わせて人の形にしたもの。
 * 将来ローポリの3Dモデルに差し替えるまでの代用品。
 * 全体の高さはおよそ 0.9（マスの一辺が 1）。人物ごとの体の大きさ・服の色・髪・持ち物は、見た目のデータ（src/data/story/looks.ts）で変える。
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
}

/** 人形の見た目（見た目のデータと同じ形） */
export type PuppetLook = LookDefinition;

const SKIN = 0xf1c9a5;
const DARK = 0x3a3330;
const STEEL = 0xd8dde3;
const WOOD = 0x8a5a2b;

/** 顔の正面は +z（南）。y 軸まわりに 90 度回すごとに 東(+x) → 北 → 西 を向く */
export const YAW_OF: Readonly<Record<Direction, number>> = {
  south: 0,
  east: Math.PI / 2,
  north: Math.PI,
  west: (Math.PI * 3) / 2,
};

export function createPuppet(look: PuppetLook): Puppet {
  const group = new THREE.Group();
  const body = new THREE.Group();
  group.add(body);
  // 体の大きさ（背の高さ）は、体全体の倍率で変える
  const figure = new THREE.Group();
  figure.scale.setScalar(look.scale ?? 1);
  body.add(figure);
  const w = look.width ?? 1;
  const materials: THREE.MeshLambertMaterial[] = [];

  const mat = (color: number) => {
    const m = new THREE.MeshLambertMaterial({ color, flatShading: true, transparent: true });
    materials.push(m);
    return m;
  };
  const bodyMat = mat(look.body);
  const accentMat = mat(look.accent);
  const skinMat = mat(SKIN);
  const darkMat = mat(DARK);
  const legMat = look.legs !== undefined ? mat(look.legs) : darkMat;

  const part = (geometry: THREE.BufferGeometry, material: THREE.Material, x: number, y: number, z: number, parent: THREE.Object3D = figure) => {
    const m = new THREE.Mesh(geometry, material);
    m.position.set(x, y, z);
    m.castShadow = true;
    parent.add(m);
    return m;
  };

  // 脚（体の幅に合わせて離す）
  const legW = 0.12 * Math.min(1.25, w);
  part(new THREE.BoxGeometry(legW, 0.3, 0.14), legMat, -0.08 * w, 0.15, 0);
  part(new THREE.BoxGeometry(legW, 0.3, 0.14), legMat, 0.08 * w, 0.15, 0);
  // 胴体と帯。外套・長衣は腰から下も覆う
  const torsoW = 0.34 * w;
  const torsoD = 0.2 * (0.7 + 0.3 * w);
  part(new THREE.BoxGeometry(torsoW, 0.3, torsoD), bodyMat, 0, 0.45, 0);
  part(new THREE.BoxGeometry(torsoW + 0.01, 0.05, torsoD + 0.01), accentMat, 0, 0.33, 0);
  if (look.robe) part(new THREE.BoxGeometry(torsoW + 0.02, 0.2, torsoD + 0.02), bodyMat, 0, 0.21, 0);
  // 襟（帯と同じ色）
  part(new THREE.BoxGeometry(torsoW * 0.6, 0.04, torsoD + 0.012), accentMat, 0, 0.59, 0);
  // 腕（肩を軸に回せるように、肩の位置のグループに入れる）
  const shoulder = (x: number) => {
    const g = new THREE.Group();
    g.position.set(x, 0.58, 0);
    figure.add(g);
    return g;
  };
  const shoulderX = torsoW / 2 + 0.05;
  const leftShoulder = shoulder(-shoulderX);
  const rightShoulder = shoulder(shoulderX);
  const armW = 0.09 * Math.min(1.3, w);
  const leftArm = part(new THREE.BoxGeometry(armW, 0.28, 0.1), bodyMat, 0, -0.13, 0, leftShoulder);
  const rightArm = part(new THREE.BoxGeometry(armW, 0.28, 0.1), bodyMat, 0, -0.13, 0, rightShoulder);
  // 手
  part(new THREE.BoxGeometry(0.07, 0.06, 0.07), skinMat, 0, -0.17, 0, leftArm);
  part(new THREE.BoxGeometry(0.07, 0.06, 0.07), skinMat, 0, -0.17, 0, rightArm);
  // 頭（首を軸に回せるように、首の位置のグループに入れる）
  const head = new THREE.Group();
  head.position.set(0, 0.62, 0);
  figure.add(head);
  part(new THREE.IcosahedronGeometry(0.14, 0), skinMat, 0, 0.12, 0, head);
  if (look.hair !== undefined) addHair(look, mat(look.hair), part, head);
  if (look.hat) addHat(look.hat, accentMat, part, head);
  else if (look.hair === undefined) part(new THREE.BoxGeometry(0.3, 0.1, 0.3), accentMat, 0, 0.24, 0, head);
  if (look.beard !== undefined) part(new THREE.BoxGeometry(0.16, 0.08, 0.06), mat(look.beard), 0, 0.03, 0.11, head);
  // 向きが分かるように、顔の正面に目印（目）を付ける
  part(new THREE.BoxGeometry(0.03, 0.04, 0.02), darkMat, -0.05, 0.14, 0.13, head);
  part(new THREE.BoxGeometry(0.03, 0.04, 0.02), darkMat, 0.05, 0.14, 0.13, head);

  // 武器
  if (look.weapon === 'sword') {
    const blade = part(new THREE.BoxGeometry(0.05, 0.42, 0.03), mat(STEEL), 0, -0.3, 0.06, rightArm);
    blade.rotation.x = Math.PI / 2.4;
  } else if (look.weapon === 'staff') {
    // 杖。先に小さな玉
    const staff = part(new THREE.CylinderGeometry(0.018, 0.018, 0.62, 5), mat(WOOD), 0, -0.05, 0.06, rightArm);
    part(new THREE.IcosahedronGeometry(0.05, 0), accentMat, 0, 0.33, 0, staff);
  } else if (look.weapon === 'spear') {
    const shaft = part(new THREE.CylinderGeometry(0.016, 0.016, 0.9, 5), mat(WOOD), 0, 0.05, 0.06, rightArm);
    part(new THREE.ConeGeometry(0.035, 0.12, 5), mat(STEEL), 0, 0.5, 0, shaft);
  } else if (look.weapon === 'bow') {
    const bow = part(new THREE.TorusGeometry(0.2, 0.018, 4, 12, Math.PI), mat(WOOD), 0, -0.08, 0.12, leftArm);
    bow.rotation.set(0, Math.PI / 2, Math.PI / 2);
  }

  // 持ち物の付ける所
  const anchors: Record<LookItemSlot, THREE.Group> = {
    hand: anchor(rightArm, 0, -0.2, 0.05),
    handL: anchor(leftArm, 0, -0.2, 0.05),
    waist: anchor(figure, torsoW / 2 - 0.02, 0.27, torsoD / 2),
    back: anchor(figure, 0.04, 0.26, -torsoD / 2 - 0.03),
  };
  anchors.back.rotation.z = -0.35;
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
    for (const m of itemMaterials) m.opacity = opacity;
  };
  setItems({});

  let yaw = 0;
  let pose: PuppetPose = {};
  const all = () => [...materials, ...itemMaterials];
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
    },
    setGlow(color, amount) {
      for (const m of materials) m.emissive.setRGB(color.r * amount * 0.8, color.g * amount * 0.8, color.b * amount * 0.8);
    },
    setPose(next) {
      pose = next;
      head.rotation.set(next.head ?? 0, next.headTurn ?? 0, next.tilt ?? 0);
      figure.rotation.x = next.bow ?? 0;
      figure.position.y = (next.lift ?? 0) - (next.drop ?? 0);
      figure.position.z = -(next.back ?? 0);
      leftShoulder.rotation.z = -(next.spreadL ?? 0);
      rightShoulder.rotation.z = next.spreadR ?? 0;
    },
    setItems,
    update(elapsed) {
      // 待機中の呼吸のような小さな動き（仕草の腕の姿勢に重ねる。前に上げるのは x の負の向き）
      leftShoulder.rotation.x = Math.sin(elapsed * 2.4) * 0.08 - (pose.armL ?? 0);
      rightShoulder.rotation.x = -Math.sin(elapsed * 2.4) * 0.08 - (pose.armR ?? 0);
    },
  };
}

function anchor(parent: THREE.Object3D, x: number, y: number, z: number): THREE.Group {
  const g = new THREE.Group();
  g.position.set(x, y, z);
  parent.add(g);
  return g;
}

type PartFn = (g: THREE.BufferGeometry, m: THREE.Material, x: number, y: number, z: number, parent?: THREE.Object3D) => THREE.Mesh;

/** 髪の形 */
function addHair(look: PuppetLook, hairMat: THREE.Material, part: PartFn, head: THREE.Group): void {
  const style = look.hairStyle ?? 'short';
  if (style === 'cropped') {
    part(new THREE.BoxGeometry(0.26, 0.06, 0.26), hairMat, 0, 0.23, -0.01, head);
    part(new THREE.BoxGeometry(0.26, 0.12, 0.06), hairMat, 0, 0.15, -0.12, head);
    return;
  }
  // 頭の上と後ろ頭（どの髪形にも）
  part(new THREE.BoxGeometry(0.28, 0.1, 0.28), hairMat, 0, 0.22, -0.01, head);
  part(new THREE.BoxGeometry(0.28, 0.2, 0.08), hairMat, 0, 0.12, -0.12, head);
  if (style === 'tied') {
    // 後ろでひとつに束ねた髪
    const tail = part(new THREE.BoxGeometry(0.07, 0.18, 0.07), hairMat, 0, 0.06, -0.19, head);
    tail.rotation.x = 0.35;
  } else if (style === 'long') {
    // 肩まで・背中まで流れる髪
    part(new THREE.BoxGeometry(0.3, 0.3, 0.07), hairMat, 0, -0.02, -0.13, head);
    part(new THREE.BoxGeometry(0.06, 0.2, 0.18), hairMat, -0.14, 0.05, -0.03, head);
    part(new THREE.BoxGeometry(0.06, 0.2, 0.18), hairMat, 0.14, 0.05, -0.03, head);
  } else if (style === 'bun') {
    part(new THREE.SphereGeometry(0.07, 8, 6), hairMat, 0, 0.27, -0.12, head);
  } else if (style === 'curly') {
    for (const [x, y, z] of [
      [-0.14, 0.18, 0.02],
      [0.14, 0.18, 0.02],
      [-0.12, 0.08, -0.1],
      [0.12, 0.08, -0.1],
      [0, 0.27, -0.04],
    ] as const) {
      part(new THREE.SphereGeometry(0.06, 6, 5), hairMat, x, y, z, head);
    }
  } else if (style === 'messy') {
    for (const [x, rot] of [
      [-0.08, 0.4],
      [0.06, -0.3],
      [0.0, 0.1],
    ] as const) {
      const tuft = part(new THREE.BoxGeometry(0.06, 0.08, 0.06), hairMat, x, 0.29, 0.04, head);
      tuft.rotation.z = rot;
    }
  } else if (style === 'braid') {
    part(new THREE.BoxGeometry(0.06, 0.3, 0.06), hairMat, 0.1, -0.05, -0.14, head);
  }
}

/** 帽子 */
function addHat(hat: NonNullable<PuppetLook['hat']>, accentMat: THREE.Material, part: PartFn, head: THREE.Group): void {
  if (hat === 'helm') {
    // 兜のような角ばった帽子
    part(new THREE.BoxGeometry(0.31, 0.11, 0.31), accentMat, 0, 0.24, 0, head);
  } else if (hat === 'wizard') {
    // つばのある、先の高いとんがり帽子
    part(new THREE.CylinderGeometry(0.22, 0.22, 0.03, 8), accentMat, 0, 0.23, 0, head);
    part(new THREE.ConeGeometry(0.13, 0.3, 6), accentMat, 0, 0.38, 0, head);
  } else if (hat === 'hood') {
    // 尖ったフード
    part(new THREE.ConeGeometry(0.16, 0.22, 6), accentMat, 0, 0.3, 0, head);
  } else {
    // 平たい帽子
    part(new THREE.CylinderGeometry(0.16, 0.17, 0.07, 8), accentMat, 0, 0.25, 0, head);
  }
}
