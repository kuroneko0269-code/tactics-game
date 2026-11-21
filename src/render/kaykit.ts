import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { Direction } from '../core/geometry';
import type { KayKitBase, KayKitLook, LookDefinition, LookItemSlot } from '../data/story/looks';
import { GESTURES } from '../data/story/stageDefs';
import { hairParts } from './kaykitHair';
import { BONE, customParts, finish, PART_CELLS, type PartCell, type PartPiece } from './kaykitParts';
import { buildModel } from './props';
import { YAW_OF, type Puppet, type PuppetPose } from './puppet';

/**
 * KayKit の人形（KayKit の人形の試し）: 無料の3D素材「KayKit Character Pack : Adventurers」（CC0。docs/CREDITS.md）の
 * 体・骨・動きを土台にし、髪・かぶり物・マント・肩掛け・前掛け・色だけを自作する（src/render/kaykitParts.ts）。
 *
 * - 体: 素材の5人は骨が共通なので、体（rogue・mage・barbarian）と頭（knight・barbarian）を組み替えられる。
 *   knight の頭は、髪の色の区画の面を切り取って使う（自作の髪をかぶせる）。素材の兜・帽子・マント・持ち物は外す
 * - 頭: 素材は約2頭身。大人の物語に合わせて、頭を首の付け根から縮める（HEAD_SCALE）。素材の目は外し、顔の面に白目と瞳を描く。鼻はならして消す
 * - 色: 素材の色の画像は、8×4 の区画に1色ずつの縦の濃淡が並んだもの。人物ごとに、区画を役目（肌・服・革…）で塗った小さな画像を作る
 * - 描き方: 体・頭・自作の部品を1つの形（SkinnedMesh）にまとめ、1体を1回で描く（輪郭線を付ける時は +1 回）
 * - 動き: 素材の動き（立つ・歩く・座る・拾う…）を混ぜてつなぎ、仕草の姿勢（うなずく・顔を上げる…）は骨の回転で上に重ねる
 *
 * 素材は、物語の場面に入る時に読み込む（loadKayKit）。読み込み終えるまでは、今の人形を使う。
 */

/** 頭を縮める割合（首の付け根から。素材の約2頭身を、約2.9頭身にする。0.74 と比べて、落ち着いて見える方を採った） */
const HEAD_SCALE = 0.66;
/** 素材の体の高さ（頭を縮めた後の、髪のてっぺんまで）を、マスの上の人形の高さ（今の人形と同じ約 0.9）にする */
const MODEL_HEIGHT = 1.98;
const WORLD_HEIGHT = 0.9;

/**
 * 見え方: plain 素材そのままのなめらかな陰影・toon 3段の陰と細い輪郭線（PR #40 の人形の描き方）。比べて toon を採った
 * （夜の灯の場面で、なめらかな陰では服の色が夜の青に沈み、人物が暗い部屋に溶けるため。docs/KAYKIT.md）
 */
export type KayKitShading = 'plain' | 'toon';
const shading: { value: KayKitShading } = { value: 'toon' };
/** 見え方を切り替える（比べる写真を撮るため。次に作る人形から効く） */
export function setKayKitShading(value: KayKitShading): void {
  shading.value = value;
}

/** 素材の動きの名前（scripts/kaykit-prepare.mjs で取り込んだもの） */
type Clip = 'Idle' | 'Unarmed_Idle' | 'Walking_A' | 'Walking_C' | 'Sit_Chair_Idle' | 'Sit_Floor_Idle' | 'PickUp' | 'Interact' | 'Use_Item';

/**
 * 仕草と素材の動きの結び付け（docs/KAYKIT.md の「仕草と動き」）。ここにない仕草は、立つ動きの上に骨の姿勢を重ねて作る。
 * clip の動きを seconds の間に1回流す（速さは、仕草の長さに合わせて遅くする。速くはしない）
 */
const GESTURE_CLIPS: Readonly<Record<string, { clip: Clip; from?: number; to?: number }>> = {
  拾う: { clip: 'PickUp' },
  物を置く: { clip: 'Interact' },
  手渡す: { clip: 'Interact' },
  戸を開ける: { clip: 'Interact' },
};
/** 平たい物（暦盤・帳面）を手に持つ時の、面の起こし方（物の見た目の id → ラジアン。負で、面を持つ人の顔の方へ起こす。自分で見ている持ち方） */
const HELD_TILT: Readonly<Record<string, number>> = { calendarSmall: -0.85, ledger: -0.85, scroll: -0.6 };
const GESTURE_NAME = new Map<object, string>(Object.entries(GESTURES).map(([name, g]) => [g, name]));

interface Assets {
  readonly bodies: Readonly<Record<KayKitBase, THREE.Object3D>>;
  readonly heads: Readonly<Record<'knight' | 'barbarian', THREE.SkinnedMesh>>;
  readonly clips: ReadonlyMap<string, THREE.AnimationClip>;
  /** 骨の名前（共通の順番）と、骨を付けた時の逆行列 */
  readonly boneNames: readonly string[];
  readonly boneInverses: readonly THREE.Matrix4[];
}

let loading: Promise<boolean> | undefined;
let assets: Assets | undefined;

/** 読み込み済みか */
export function kaykitReady(): boolean {
  return assets !== undefined;
}

/** 素材を読み込む（2回目からはすぐ終わる）。失敗したら false（今の人形のままにする） */
export function loadKayKit(): Promise<boolean> {
  loading ??= (async () => {
    try {
      const { GLTFLoader } = await import('three/examples/jsm/loaders/GLTFLoader.js');
      const loader = new GLTFLoader();
      const base = `${import.meta.env.BASE_URL}models/kaykit/`;
      const [rogue, mage, barbarian, heads, motions] = await Promise.all(
        ['rogue', 'mage', 'barbarian', 'heads', 'motions'].map((n) => loader.loadAsync(`${base}${n}.glb`)),
      );
      const firstSkinned = (o: THREE.Object3D) => {
        let found: THREE.SkinnedMesh | undefined;
        o.traverse((x) => {
          if (!found && (x as THREE.SkinnedMesh).isSkinnedMesh) found = x as THREE.SkinnedMesh;
        });
        if (!found) throw new Error('KayKit の体が見つかりません');
        return found;
      };
      const ref = firstSkinned(rogue!.scene);
      const headOf = (name: string) => {
        const m = heads!.scene.getObjectByName(name) as THREE.SkinnedMesh | undefined;
        if (!m) throw new Error(`KayKit の頭 ${name} が見つかりません`);
        return m;
      };
      assets = {
        bodies: { rogue: rogue!.scene, mage: mage!.scene, barbarian: barbarian!.scene },
        heads: { knight: headOf('Knight_Head'), barbarian: headOf('Barbarian_Head') },
        clips: new Map(motions!.animations.map((a) => [a.name, a])),
        boneNames: ref.skeleton.bones.map((b) => b.name),
        boneInverses: ref.skeleton.boneInverses,
      };
      return true;
    } catch (e) {
      console.warn('KayKit の素材を読み込めませんでした', e);
      loading = undefined;
      return false;
    }
  })();
  return loading;
}

// ---- 色 ----

/** 色の区画の役目（素材の体ごとに、どの区画が何に使われているか。docs/KAYKIT.md の「色の付け方」） */
type Role = 'skin' | 'hair' | 'eye' | 'cloth' | 'cloth2' | 'trim' | 'leather' | 'leatherDark' | 'metal' | 'pants' | 'boots' | 'accent2';
const ROLE_MAP: Readonly<Record<KayKitBase | 'head', Readonly<Record<string, Role>>>> = {
  head: { '0,0': 'skin', '1,0': 'hair', '2,0': 'eye' },
  rogue: { '0,0': 'skin', '0,1': 'cloth', '1,1': 'cloth2', '5,0': 'leather', '6,0': 'leatherDark', '3,0': 'metal', '7,1': 'pants', '5,2': 'leather', '3,2': 'boots' },
  mage: { '0,1': 'cloth', '1,1': 'cloth', '3,0': 'metal', '4,0': 'metal', '5,0': 'leather', '7,1': 'pants', '2,2': 'leatherDark', '0,2': 'trim', '7,2': 'skin', '3,2': 'boots' },
  barbarian: { '0,1': 'cloth', '1,1': 'cloth', '6,0': 'leatherDark', '2,1': 'trim', '7,1': 'pants', '3,0': 'metal', '7,0': 'leather', '7,2': 'cloth2', '3,2': 'boots' },
};

/** 彩度を落として少し暗くする（どの人物も、くすんだ土の色の範囲に収める。今の人形の muted と同じ考え） */
function muted(hex: number, saturation = 0.7, lightness = 0.96): THREE.Color {
  const c = new THREE.Color(hex);
  const hsl = { h: 0, s: 0, l: 0 };
  c.getHSL(hsl);
  return c.setHSL(hsl.h, hsl.s * saturation, hsl.l * lightness);
}

function roleColors(look: KayKitLook): Record<Role, number> {
  const darker = (hex: number, k: number) => new THREE.Color(hex).multiplyScalar(k).getHex();
  return {
    skin: look.skin,
    hair: look.hair.color,
    eye: 0x17110d,
    cloth: look.cloth,
    cloth2: look.cloth2 ?? darker(look.cloth, 0.82),
    trim: look.trim ?? 0xb8ab8c,
    leather: look.leather ?? 0x5e4430,
    leatherDark: darker(look.leather ?? 0x5e4430, 0.7),
    metal: 0x6f7272,
    pants: look.pants ?? 0x3e342c,
    boots: look.boots ?? 0x3a2a20,
    accent2: look.accent ?? look.cloth,
  };
}

/** 明るい束の色: 髪の色を明るくする（黒い髪は、少し暖かい灰へ） */
function hairLightOf(hex: number): number {
  const c = new THREE.Color(hex);
  const hsl = { h: 0, s: 0, l: 0 };
  c.getHSL(hsl);
  return c.setHSL(hsl.h, hsl.s, Math.min(0.6, hsl.l * 1.3 + 0.035)).getHex();
}

/** 人物の色の画像（64×128。区画は横 8・縦 32 画素）。区画ごとに、上が明るく下が暗い縦の濃淡で塗る */
function paletteTexture(look: KayKitLook): THREE.Texture {
  const canvas = document.createElement('canvas');
  canvas.width = 64;
  canvas.height = 128;
  const g = canvas.getContext('2d')!;
  const roles = roleColors(look);
  const map = { ...ROLE_MAP[look.base], ...ROLE_MAP.head };
  const partColor: Record<PartCell, number> = {
    hair: look.hair.color,
    cloak: look.cloak?.color ?? look.cloth,
    apron: look.apron?.color ?? look.cloth,
    mantle: look.mantle ?? look.cloth,
    headwear: look.headwear?.color ?? look.cloth,
    accent: look.accent ?? look.cloth,
    // 下ろした頭巾は外套より明るく（外套と髪の境目を見せる）
    cloakInner: new THREE.Color(look.cloak?.color ?? look.cloth).multiplyScalar(1.45).getHex(),
    hairDark: new THREE.Color(look.hair.color).multiplyScalar(0.62).getHex(),
    // 明るい束（髪の色を明るくし、少し暖かく。黒い髪でも束の段差が見えるように）
    hairLight: hairLightOf(look.hair.color),
    // 頬の赤み（肌にごく薄く赤を混ぜる）
    blush: new THREE.Color(look.skin).lerp(new THREE.Color(0xd77a6e), 0.3).getHex(),
    skirt: look.skirt?.color ?? look.cloth,
    eye: 0x17110d,
    shine: 0xf4eee2,
    sclera: 0xe6ddcc,
    iris: look.face?.iris ?? 0x4a3226,
  };
  const fill = (cx: number, cy: number, hex: number, side?: string, strong = false) => {
    // 画像には sRGB の値で塗る（three.js の色は、内部では直線の値で持っている）
    const c = muted(hex).convertLinearToSRGB();
    const grad = g.createLinearGradient(0, cy * 32, 0, cy * 32 + 32);
    // 暗い色でも濃淡が見えるように、明るくする時は少し足す
    const at = (k: number) => {
      const add = k > 1 ? (k - 1) * 0.12 : 0;
      return `rgb(${Math.round(Math.min(1, c.r * k + add) * 255)},${Math.round(Math.min(1, c.g * k + add) * 255)},${Math.round(Math.min(1, c.b * k + add) * 255)})`;
    };
    // 素材の濃淡に合わせる（上 1.1 倍 → 下 0.78 倍）。髪の束は濃淡を強く（根もと 1.35 倍 → 毛先 0.7 倍。重なった束の段差が見えるように）
    grad.addColorStop(0, at(strong ? 1.35 : 1.1));
    grad.addColorStop(1, at(strong ? 0.7 : 0.78));
    g.fillStyle = grad;
    g.fillRect(cx * 8 + (side === 'r' ? 4 : 0), cy * 32, side ? 4 : 8, 32);
  };
  for (let cy = 0; cy < 4; cy++)
    for (let cx = 0; cx < 8; cx++) {
      const role = map[`${cx},${cy}`];
      fill(cx, cy, role ? roles[role] : look.cloth);
    }
  for (const [part, ref] of Object.entries(PART_CELLS) as [PartCell, readonly (number | string)[]][]) fill(ref[0] as number, ref[1] as number, partColor[part], ref[2] as string | undefined, part === 'hair' || part === 'hairLight');
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.flipY = false;
  tex.magFilter = THREE.NearestFilter;
  tex.minFilter = THREE.LinearFilter;
  tex.generateMipmaps = false;
  return tex;
}

// ---- 形 ----

/** 形の点の属性を、まとめられる形（すべて小数）にそろえる。骨の番号は、共通の順番に付け直す */
function normalized(src: THREE.BufferGeometry, boneMap: readonly number[] | null): THREE.BufferGeometry {
  const out = new THREE.BufferGeometry();
  const n = src.attributes.position!.count;
  const copy = (name: string, size: number) => {
    const a = src.getAttribute(name);
    const arr = new Float32Array(n * size);
    if (a) for (let i = 0; i < n; i++) for (let k = 0; k < size; k++) arr[i * size + k] = a.getComponent(i, k);
    return arr;
  };
  out.setAttribute('position', new THREE.BufferAttribute(copy('position', 3), 3));
  out.setAttribute('normal', new THREE.BufferAttribute(copy('normal', 3), 3));
  out.setAttribute('uv', new THREE.BufferAttribute(copy('uv', 2), 2));
  const si = copy('skinIndex', 4);
  const idx = new Uint16Array(n * 4);
  for (let i = 0; i < si.length; i++) idx[i] = boneMap ? (boneMap[si[i]!] ?? 0) : si[i]!;
  out.setAttribute('skinIndex', new THREE.BufferAttribute(idx, 4));
  out.setAttribute('skinWeight', new THREE.BufferAttribute(copy('skinWeight', 4), 4));
  if (src.index) out.setIndex(Array.from(src.index.array));
  else out.setIndex([...Array(n).keys()]);
  return out;
}

const cellOf = (u: number, v: number) => `${Math.min(7, Math.floor(u * 8))},${Math.min(3, Math.floor(v * 4))}`;

/** 色の区画が cells の面を取り除く（knight の頭の髪） */
function dropCells(g: THREE.BufferGeometry, cells: readonly string[]): void {
  const uv = g.attributes.uv!;
  const idx = g.index!.array;
  const keep: number[] = [];
  for (let t = 0; t < idx.length; t += 3) {
    const a = idx[t]!;
    if (!cells.includes(cellOf(uv.getX(a), uv.getY(a)))) keep.push(idx[t]!, idx[t + 1]!, idx[t + 2]!);
  }
  g.setIndex(keep);
}

/**
 * 鼻を消す: 顔の真ん中の出っ張り（鼻の点）を、まわりの顔の面の高さへならす。
 * 素材の knight・barbarian の頭は、鼻が y 1.45〜1.53・|x| 0.14 以内で、顔の面（z 0.44 前後）から 0.09 ほど出ている
 */
function flattenNose(g: THREE.BufferGeometry): void {
  const p = g.attributes.position!;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i);
    const y = p.getY(i);
    if (Math.abs(x) > 0.145 || y < 1.436 || y > 1.535 || p.getZ(i) < 0.2) continue;
    // 鼻のない顔の面: 真ん中が一番前で横へ丸く下がり、下（口の上）へ少し引っ込む。鼻の表も裏も、この面に置き直す（くぼみや段を残さない）
    p.setZ(i, 0.446 - 1.25 * x * x - Math.max(0, 1.53 - y) * 0.35);
  }
}

/**
 * 素材の目（顔に埋めた暗い円柱）を、顔の面と同じ高さの平らな円につぶし、肌の色にする（穴に見えないように。外すと、顔の面に穴が残る）。
 * その上に、顔の面に描いた目（eyeParts）を重ねる
 */
function flattenEyes(g: THREE.BufferGeometry): void {
  const uv = g.attributes.uv!;
  const p = g.attributes.position!;
  // 円柱の前の面の高さ（素材の値。目の中心から外へ、顔の丸みに沿って下がる）
  const cap: [number, number][] = [
    [0.15, 0.428],
    [0.17, 0.444],
    [0.195, 0.446],
    [0.227, 0.432],
    [0.25, 0.4],
  ];
  const capZ = (ax: number) => {
    if (ax <= cap[0]![0]) return cap[0]![1];
    for (let k = 1; k < cap.length; k++) {
      const [x0, z0] = cap[k - 1]!;
      const [x1, z1] = cap[k]!;
      if (ax <= x1) return z0 + ((z1 - z0) * (ax - x0)) / (x1 - x0);
    }
    return cap[cap.length - 1]![1];
  };
  for (let i = 0; i < p.count; i++) {
    if (cellOf(uv.getX(i), uv.getY(i)) !== '2,0') continue;
    p.setZ(i, capZ(Math.abs(p.getX(i))));
    // 肌の色の区画へ
    uv.setX(i, 0.06);
  }
}

/**
 * 鼻と目をならした所で、裏を向いた面（鼻の裏・目の円柱の横の面。表の面と重なって黒い点や線になる）を取り除く。
 * 顔の前（|x| 0.3 以内・y 1.36〜1.72・前向きの所）だけを見る
 */
function dropHiddenFaces(g: THREE.BufferGeometry): void {
  const p = g.attributes.position!;
  const idx = g.index!.array;
  const keep: number[] = [];
  const a = new THREE.Vector3();
  const b = new THREE.Vector3();
  const c = new THREE.Vector3();
  for (let t = 0; t < idx.length; t += 3) {
    a.fromBufferAttribute(p, idx[t]!);
    b.fromBufferAttribute(p, idx[t + 1]!);
    c.fromBufferAttribute(p, idx[t + 2]!);
    const cx = (a.x + b.x + c.x) / 3;
    const cy = (a.y + b.y + c.y) / 3;
    const cz = (a.z + b.z + c.z) / 3;
    if (Math.abs(cx) < 0.3 && cy > 1.36 && cy < 1.72 && cz > 0.3) {
      const n = new THREE.Vector3().crossVectors(b.clone().sub(a), c.clone().sub(a));
      // 面積のない面と、前から見て裏を向いた面を外す
      if (n.length() < 1e-7 || n.z / n.length() < 0.15) continue;
      // 鼻の付け根から頭の奥へつながる細い面（顔の面の奥。輪郭線が顔に線として透ける）
      if (Math.abs(cx) < 0.12 && cy > 1.45 && Math.min(a.z, b.z, c.z) < 0.36) continue;
    }
    keep.push(idx[t]!, idx[t + 1]!, idx[t + 2]!);
  }
  g.setIndex(keep);
}

/** 陰の向きを計り直し、同じ位置にある点（色の区画の境目で分かれた点）の向きを平均してそろえる */
function smoothNormals(g: THREE.BufferGeometry): void {
  g.computeVertexNormals();
  const p = g.attributes.position!;
  const n = g.attributes.normal!;
  const key = (i: number) => `${Math.round(p.getX(i) * 1e4)},${Math.round(p.getY(i) * 1e4)},${Math.round(p.getZ(i) * 1e4)}`;
  const sum = new Map<string, THREE.Vector3>();
  for (let i = 0; i < p.count; i++) {
    const k = key(i);
    const v = sum.get(k) ?? new THREE.Vector3();
    v.x += n.getX(i);
    v.y += n.getY(i);
    v.z += n.getZ(i);
    sum.set(k, v);
  }
  for (let i = 0; i < p.count; i++) {
    const v = sum.get(key(i))!.clone().normalize();
    n.setXYZ(i, v.x, v.y, v.z);
  }
}

/** 顔の面の上の点と向き（前から当てた線と、頭の形の交わる所） */
function faceHit(g: THREE.BufferGeometry, x: number, y: number): { point: THREE.Vector3; normal: THREE.Vector3 } | undefined {
  const p = g.attributes.position!;
  const idx = g.index!.array;
  const va = new THREE.Vector3();
  const vb = new THREE.Vector3();
  const vc = new THREE.Vector3();
  const hit = new THREE.Vector3();
  const ray = new THREE.Ray(new THREE.Vector3(x, y, 2), new THREE.Vector3(0, 0, -1));
  let best: { point: THREE.Vector3; normal: THREE.Vector3 } | undefined;
  for (let t = 0; t < idx.length; t += 3) {
    va.fromBufferAttribute(p, idx[t]!);
    vb.fromBufferAttribute(p, idx[t + 1]!);
    vc.fromBufferAttribute(p, idx[t + 2]!);
    if (!ray.intersectTriangle(va, vb, vc, false, hit)) continue;
    if (best && hit.z <= best.point.z) continue;
    const normal = new THREE.Vector3().crossVectors(vb.clone().sub(va), vc.clone().sub(va)).normalize();
    if (normal.z < 0) normal.negate();
    best = { point: hit.clone(), normal };
  }
  return best;
}

/** 顔の面に貼る平たい楕円（輪郭線が付かない片面の形）。lift は面から浮かせる量（重ねる順に大きく） */
function decal(at: { point: THREE.Vector3; normal: THREE.Vector3 }, dx: number, dy: number, rx: number, ry: number, lift: number, segments = 14): THREE.BufferGeometry {
  const g = new THREE.CircleGeometry(1, segments);
  g.scale(rx, ry, 1);
  g.translate(dx, dy, 0);
  // 顔の面の向きへ（前向きの円を、面の向きに合わせて回す）
  g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 0, 1), at.normal));
  g.translate(at.point.x + at.normal.x * lift, at.point.y + at.normal.y * lift, at.point.z + at.normal.z * lift);
  return g;
}

/** 目の見た目（ふつうの人物と、ユナのように少し大きくまつ毛のある目） */
const EYE_STYLE = {
  adult: { w: 0.062, h: 0.05, iris: 0.034, pupil: 0.016, shine: 0.0095 },
  large: { w: 0.072, h: 0.066, iris: 0.044, pupil: 0.02, shine: 0.013 },
} as const;
/** 目の中心（素材の目の位置。左右は x の符号） */
const EYE_AT = { x: 0.2, y: 1.6 };

/**
 * 目: 素材の目（顔に埋めた暗い円柱。穴に見えた）を外し、顔の面に、白目・瞳・瞳孔・光の点を重ねて貼る。
 * 上のまぶたの線（細い帯）で、目の形を落ち着かせる。large でユナの大きめの目とまつ毛
 */
function eyeParts(g: THREE.BufferGeometry, large: boolean): PartPiece[] {
  const st = large ? EYE_STYLE.large : EYE_STYLE.adult;
  const out: PartPiece[] = [];
  for (const sign of [1, -1]) {
    const at = faceHit(g, sign * EYE_AT.x, EYE_AT.y);
    if (!at) continue;
    const look = sign * -0.004;
    out.push(finish(decal(at, 0, 0, st.w, st.h, 0.006, 18), 'sclera', { a: BONE.head }, true));
    out.push(finish(decal(at, look, -0.004, st.iris * 0.9, st.iris, 0.011, 16), 'iris', { a: BONE.head }, true));
    out.push(finish(decal(at, look, -0.004, st.pupil * 0.9, st.pupil, 0.015, 12), 'eye', { a: BONE.head }, true));
    out.push(finish(decal(at, look + sign * st.iris * 0.32, st.iris * 0.38, st.shine, st.shine, 0.019, 8), 'shine', { a: BONE.head }, true));
    // 上のまぶたの線（目頭から目尻へ。ユナは目尻で上へはねるまつ毛）
    const lid: THREE.Vector3[] = [];
    const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 0, 1), at.normal);
    const outer = large ? [[1.32, 1.2]] : [];
    for (const [u, v] of [...outer, [1.02, 0.45], [0.75, 0.82], [0.35, 1.0], [-0.1, 1.0], [-0.55, 0.86], [-0.95, 0.5]] as [number, number][]) {
      const d = new THREE.Vector3(sign * u * st.w, v * st.h, 0).applyQuaternion(q);
      lid.push(at.point.clone().add(d).addScaledVector(at.normal, 0.021));
    }
    out.push(finish(flatRibbon(lid, large ? 0.026 : 0.016), 'eye', { a: BONE.head }, true));
  }
  return out;
}

/** 眉（knight の頭は、髪と一緒に眉の区画も外しているので、細い帯で足す。髪の色） */
function browParts(g: THREE.BufferGeometry, large: boolean): PartPiece[] {
  const out: PartPiece[] = [];
  for (const sign of [1, -1]) {
    const at = faceHit(g, sign * 0.2, 1.7);
    if (!at) continue;
    const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 0, 1), at.normal);
    const pts = ([[1.0, -0.006], [0.45, 0.006], [-0.1, 0.008], [-0.7, 0.0]] as [number, number][]).map(([u, v]) =>
      at.point.clone().add(new THREE.Vector3(sign * u * 0.075, v + (large ? 0.012 : 0), 0).applyQuaternion(q)).addScaledVector(at.normal, 0.008),
    );
    out.push(finish(flatRibbon(pts, large ? 0.016 : 0.022), 'hairDark', { a: BONE.head }, true));
  }
  return out;
}

/** 顔の輪郭を丸くする: 目より下の点を、下ほど内へ寄せる（あごの角を落とす） */
function roundFace(g: THREE.BufferGeometry): void {
  const p = g.attributes.position!;
  for (let i = 0; i < p.count; i++) {
    const y = p.getY(i);
    const k = Math.min(1, Math.max(0, (1.66 - y) / 0.42));
    if (k <= 0) continue;
    const s = k * k;
    p.setXYZ(i, p.getX(i) * (1 - 0.12 * s), y + 0.03 * s, p.getZ(i) * (1 - (p.getZ(i) > 0 ? 0.03 : 0.06) * s));
  }
}

/**
 * 平たい帯（まつ毛）: 点の列に沿って、顔の面の上に幅 width の帯を貼る（目尻の側が太く、目頭へ細く）。
 * 輪郭線を付けないように、厚みのない片面の形にする（輪郭線は裏面を膨らませて描くので、前を向いた片面の形には出ない）
 */
function flatRibbon(points: readonly THREE.Vector3[], width: number): THREE.BufferGeometry {
  const pos: number[] = [];
  const index: number[] = [];
  const n = points.length;
  for (let i = 0; i < n; i++) {
    const a = points[Math.max(0, i - 1)]!;
    const b = points[Math.min(n - 1, i + 1)]!;
    const tan = b.clone().sub(a).normalize();
    const side = new THREE.Vector3(-tan.y, tan.x, 0).normalize();
    const w = (width * (1 - i / (n - 1)) ** 0.8) / 2 + 0.002;
    const p = points[i]!;
    pos.push(p.x + side.x * w, p.y + side.y * w, p.z, p.x - side.x * w, p.y - side.y * w, p.z);
  }
  for (let i = 0; i < n - 1; i++) {
    const k = i * 2;
    index.push(k, k + 1, k + 2, k + 2, k + 1, k + 3);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setIndex(index);
  // 前（+z）を向いた面にそろえる
  g.computeVertexNormals();
  if (g.attributes.normal!.getZ(0) < 0) {
    const arr = g.index!.array as Uint16Array | Uint32Array;
    for (let t = 0; t < arr.length; t += 3) [arr[t + 1], arr[t + 2]] = [arr[t + 2]!, arr[t + 1]!];
  }
  return g;
}

/** 頬の赤み: 頬の面に、薄い楕円を貼る */
function blushParts(g: THREE.BufferGeometry): PartPiece[] {
  const out: PartPiece[] = [];
  for (const sign of [1, -1]) {
    const at = faceHit(g, sign * 0.3, 1.49);
    if (at) out.push(finish(decal(at, 0, 0, 0.09, 0.05, 0.007, 12), 'blush', { a: BONE.head }, true));
  }
  return out;
}

/** 頭の骨に付く点を、首の付け根（頭の骨）から縮める */
function scaleHead(g: THREE.BufferGeometry, pivotY: number): void {
  const p = g.attributes.position!;
  const si = g.attributes.skinIndex!;
  const sw = g.attributes.skinWeight!;
  for (let i = 0; i < p.count; i++) {
    let w = 0;
    for (let k = 0; k < 4; k++) if (si.getComponent(i, k) === BONE.head) w += sw.getComponent(i, k);
    if (w <= 0) continue;
    const s = 1 + (HEAD_SCALE - 1) * w;
    p.setXYZ(i, p.getX(i) * s, pivotY + (p.getY(i) - pivotY) * s, p.getZ(i) * s);
  }
}

/** 3段の陰（toon の見え方） */
let toonRamp: THREE.DataTexture | undefined;
function toonGradient(): THREE.DataTexture {
  if (!toonRamp) {
    toonRamp = new THREE.DataTexture(new Uint8Array([110, 180, 255]), 3, 1, THREE.RedFormat);
    toonRamp.minFilter = THREE.NearestFilter;
    toonRamp.magFilter = THREE.NearestFilter;
    toonRamp.generateMipmaps = false;
    toonRamp.needsUpdate = true;
  }
  return toonRamp;
}

/** 輪郭線（toon の見え方）: 体を法線の向きに少し膨らませ、裏面だけを暗く塗る */
function outlineMaterial(): THREE.MeshBasicMaterial {
  const m = new THREE.MeshBasicMaterial({ color: 0x140e0a, side: THREE.BackSide });
  m.onBeforeCompile = (shader) => {
    shader.vertexShader = shader.vertexShader.replace('#include <skinning_vertex>', '#include <skinning_vertex>\ntransformed += normalize( objectNormal ) * 0.022;');
  };
  m.customProgramCacheKey = () => 'kaykit-outline';
  return m;
}

const BLOB_OPACITY = 0.34;
let blobShape: THREE.BufferGeometry | undefined;

/** KayKit の人形を作る。素材を読み込み済みで、見た目に kaykit がある時だけ使う */
export function createKayKitPuppet(look: LookDefinition): Puppet {
  if (!assets || !look.kaykit) throw new Error('KayKit の素材が読み込まれていないか、見た目に kaykit がありません');
  const A = assets;
  const k = look.kaykit;

  // ---- 骨: 土台の体の骨を写す（骨だけ。形は下で作り直す） ----
  const src = A.bodies[k.base];
  const rig = cloneBones(src);
  const bones = A.boneNames.map((name) => {
    const b = rig.getObjectByName(name) as THREE.Bone | undefined;
    if (!b) throw new Error(`KayKit の骨 ${name} が見つかりません`);
    return b;
  });
  const skeleton = new THREE.Skeleton(
    bones,
    A.boneInverses.map((m) => m.clone()),
  );
  const boneMapOf = (mesh: THREE.SkinnedMesh) => mesh.skeleton.bones.map((b) => A.boneNames.indexOf(b.name));

  // ---- 形: 体の部品 + 頭 + 自作の部品を1つにまとめる ----
  const pieces: THREE.BufferGeometry[] = [];
  src.traverse((o) => {
    const m = o as THREE.SkinnedMesh;
    if (m.isSkinnedMesh) pieces.push(normalized(m.geometry, boneMapOf(m)));
  });
  const headMesh = A.heads[k.head ?? 'knight'];
  const head = normalized(headMesh.geometry, boneMapOf(headMesh));
  const knight = (k.head ?? 'knight') === 'knight';
  // knight の頭は髪と眉を外す。どちらの頭も、素材の目（顔に埋めた暗い円柱）を外して、顔の面に描いた目に替える
  if (knight) dropCells(head, ['1,0']);
  const face = k.face ?? {};
  flattenNose(head);
  flattenEyes(head);
  dropHiddenFaces(head);
  if (face.round) roundFace(head);
  // 形を動かしたので、陰の向きを計り直す（鼻の跡に陰の線を残さない。同じ位置の点は向きをそろえ、輪郭線にすき間を作らない）
  smoothNormals(head);
  pieces.push(head);
  const large = face.eyes === 'large';
  const faceParts = [...eyeParts(head, large), ...(knight ? browParts(head, large) : []), ...(face.blush ? blushParts(head) : [])];
  for (const f of faceParts) pieces.push(normalized(f.geometry, null));
  for (const p of [...hairParts(k), ...customParts(k)]) pieces.push(normalized(p.geometry, null));
  const merged = mergeGeometries(pieces)!;
  for (const p of pieces) p.dispose();
  // 頭（頭の骨に付く点）を、首の付け根から縮める
  const headPivot = new THREE.Vector3().setFromMatrixPosition(A.boneInverses[BONE.head]!.clone().invert()).y;
  scaleHead(merged, headPivot);

  const map = paletteTexture(k);
  const material =
    shading.value === 'toon'
      ? new THREE.MeshToonMaterial({ map, gradientMap: toonGradient() })
      : new THREE.MeshLambertMaterial({ map });
  const mesh = new THREE.SkinnedMesh(merged, material);
  mesh.frustumCulled = false;
  mesh.castShadow = false;
  rig.add(mesh);
  mesh.bind(skeleton, new THREE.Matrix4());
  const materials: (THREE.MeshLambertMaterial | THREE.MeshToonMaterial)[] = [material];
  let lineMat: THREE.MeshBasicMaterial | undefined;
  if (shading.value === 'toon') {
    lineMat = outlineMaterial();
    const line = new THREE.SkinnedMesh(merged, lineMat);
    line.frustumCulled = false;
    line.raycast = () => {};
    rig.add(line);
    line.bind(skeleton, new THREE.Matrix4());
  }

  // ---- 外側のグループ（位置と向き）と、足もとの丸い影 ----
  const group = new THREE.Group();
  const body = new THREE.Group();
  group.add(body);
  group.userData.puppet = true;
  const height = k.height ?? 1;
  const scale = (WORLD_HEIGHT / MODEL_HEIGHT) * height;
  rig.scale.set(scale * (k.width ?? 1), scale, scale * (k.width ?? 1));
  body.add(rig);
  blobShape ??= new THREE.CircleGeometry(0.2, 16);
  const shadowMat = new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: BLOB_OPACITY, depthWrite: false });
  const blob = new THREE.Mesh(blobShape, shadowMat);
  blob.rotation.x = -Math.PI / 2;
  blob.position.y = 0.006;
  blob.scale.setScalar(height * Math.min(1.3, k.width ?? 1));
  blob.raycast = () => {};
  blob.renderOrder = -1;
  group.add(blob);

  // ---- 持ち物（手・左手・腰・背）。持ち物の大きさは今の人形と同じにする（体の縮みを打ち消す） ----
  const boneByName = (name: string) => bones[A.boneNames.indexOf(name)]!;
  const anchorOn = (bone: THREE.Object3D, x: number, y: number, z: number) => {
    const g = new THREE.Group();
    g.position.set(x, y, z);
    g.scale.setScalar(1 / scale);
    bone.add(g);
    return g;
  };
  const handR = boneByName(sanitized('handslot.r'));
  const handL = boneByName(sanitized('handslot.l'));
  const anchors: Record<LookItemSlot, THREE.Group> = {
    hand: anchorOn(handR, 0, 0, 0),
    handL: anchorOn(handL, 0, 0, 0),
    waist: anchorOn(boneByName('hips'), 0.36, 0.25, 0.18),
    back: anchorOn(boneByName('chest'), 0.05, 0.2, -0.42),
  };
  const defaults: Partial<Record<LookItemSlot, string>> = {};
  for (const item of look.items ?? []) defaults[item.slot] = item.model;
  let itemMaterials: THREE.MeshLambertMaterial[] = [];
  let opacity = 1;
  /** 手に物を持っているか（持っている手は、前へ少し上げて体の横へ出す。素材の立つ動きは手が体の前に寄り、持ち物が隠れるため） */
  const holding = { hand: 0, handL: 0 };
  const setItems = (items: Readonly<Partial<Record<LookItemSlot, string>>>) => {
    itemMaterials = [];
    for (const slot of Object.keys(anchors) as LookItemSlot[]) {
      const a = anchors[slot];
      a.clear();
      const model = slot in items ? items[slot] : defaults[slot];
      if (model) {
        // 平たい物（暦盤）は、体の横の前で、面を自分の顔へ向けて持つ（自分で見ている持ち方）。立てて持つ物（灯）はそのまま
        const holder = new THREE.Group();
        const flat = (slot === 'hand' || slot === 'handL') && HELD_TILT[model] !== undefined;
        holder.rotation.x = flat ? HELD_TILT[model]! : 0;
        // 平たい物は少し大きく持つ（KayKit の体は今の人形より幅があり、同じ大きさでは体の陰に隠れるため。暦盤）
        if (flat) holder.scale.setScalar(1.4);
        a.add(holder);
        itemMaterials.push(...buildModel(model, holder));
      }
      a.traverse((o) => (o.castShadow = false));
      // 持つ手の上げ方: 平たい物（見せる物）は胸の高さまで、ほかは少し
      if (slot === 'hand' || slot === 'handL') holding[slot] = !model ? 0 : HELD_TILT[model] !== undefined ? 1.5 : 0.75;
    }
    for (const m of itemMaterials) {
      m.opacity = opacity;
      m.transparent = opacity < 1;
    }
  };
  setItems({});

  // ---- 動き ----
  const mixer = new THREE.AnimationMixer(rig);
  const action = (name: Clip, copy = false) => {
    const clip = A.clips.get(name);
    if (!clip) throw new Error(`KayKit の動き ${name} が見つかりません`);
    // 同じ動きを別の役目にも使う時は写しを作る（three.js は、同じ動きには同じ再生を返すため。しゃがむ姿勢と、一回だけの拾う動き）
    const a = mixer.clipAction(copy ? clip.clone() : clip);
    a.enabled = true;
    a.setEffectiveWeight(0);
    a.play();
    return a;
  };
  // 立つ: 素材の Idle は肩の上下が大きいので、ゆっくり流す。歩く: 落ち着いた Walking_A を少し遅く
  const idle = action('Idle');
  idle.timeScale = 0.55;
  const walk = action('Walking_A');
  walk.timeScale = 0.85;
  const sit = action('Sit_Chair_Idle');
  sit.timeScale = 0.5;
  // しゃがむ: 拾う動きの、いちばん低い所で止めた姿勢
  const crouch = action('PickUp', true);
  crouch.paused = true;
  crouch.time = crouch.getClip().duration * 0.45;
  const weights = new Map<THREE.AnimationAction, number>([
    [idle, 1],
    [walk, 0],
    [sit, 0],
    [crouch, 0],
  ]);
  idle.setEffectiveWeight(1);
  /** 一回だけ流す仕草の動き（拾う・物を置く など） */
  let oneShot: { action: THREE.AnimationAction; start: number; seconds: number } | undefined;

  let yaw = 0;
  let pose: PuppetPose = {};
  /** 仕草の動きを流している間の、続く姿勢（座っているなど）。仕草の骨の姿勢は重ねない */
  let gestureBase: PuppetPose | undefined;
  let moving = false;
  let stride = 0;
  let talking = 0;
  let talkUntil = 0;
  let talkRequest = -1;
  let lastElapsed = 0;
  let started = false;

  const tmpQ = new THREE.Quaternion();
  const relQ = new THREE.Quaternion();
  const AX = new THREE.Vector3(1, 0, 0);
  const AY = new THREE.Vector3(0, 1, 0);
  const AZ = new THREE.Vector3(0, 0, 1);
  /** 骨の親までの回転（体の外側のグループから見た回転） */
  const parentRotation = (bone: THREE.Object3D) => {
    relQ.identity();
    for (let o = bone.parent; o && o !== rig; o = o.parent) relQ.premultiply(o.quaternion);
    return relQ;
  };
  /** 骨を、体の向きで決めた軸のまわりに回す（骨ごとの向きの違いを気にせず、「前へ倒す」などを書けるように） */
  const rotateBone = (bone: THREE.Object3D, axis: THREE.Vector3, angle: number) => {
    if (Math.abs(angle) < 1e-4) return;
    const p = parentRotation(bone);
    tmpQ.setFromAxisAngle(axis, angle);
    // local' = p⁻¹ · R · p · local
    const inv = p.clone().invert();
    bone.quaternion.premultiply(inv.multiply(tmpQ).multiply(p));
  };
  const B = {
    hips: boneByName('hips'),
    spine: boneByName('spine'),
    chest: boneByName('chest'),
    head: boneByName('head'),
    armL: boneByName(sanitized('upperarm.l')),
    armR: boneByName(sanitized('upperarm.r')),
    foreL: boneByName(sanitized('lowerarm.l')),
    foreR: boneByName(sanitized('lowerarm.r')),
  };
  const root = boneByName('root');
  /** 姿勢を重ねる骨の、元の回転（素材の動きが毎フレーム上書きするが、念のため重ねる前に戻す） */
  const overlayBones = Object.values(B);
  const rest = overlayBones.map((b) => b.quaternion.clone());

  /** 動きの重さを、目標へなめらかに寄せる（動きの切り替わりを急にしない）。合計は 1 にそろえる */
  const blend = (dt: number) => {
    const p = gestureBase ?? pose;
    const sitW = Math.min(1, Math.max(0, p.sit ?? 0));
    const dropW = Math.min(1, Math.max(0, (p.drop ?? 0) / 0.24));
    const walkW = stride * (1 - sitW);
    const target = new Map<THREE.AnimationAction, number>([
      [walk, walkW],
      [sit, sitW],
      [crouch, dropW * (1 - sitW) * (1 - walkW)],
    ]);
    const rest = 1 - [...target.values()].reduce((a, b) => a + b, 0);
    target.set(idle, Math.max(0, rest));
    const rate = Math.min(1, dt * 6);
    let sum = 0;
    for (const [a, w] of weights) {
      const next = w + ((target.get(a) ?? 0) - w) * rate;
      weights.set(a, next);
      sum += next;
    }
    let shot = 0;
    if (oneShot) {
      const t = (lastElapsed - oneShot.start) / oneShot.seconds;
      shot = Math.min(1, Math.min(t, 1 - t) * 5);
      if (t >= 1) {
        oneShot.action.stop();
        oneShot = undefined;
        shot = 0;
      } else {
        oneShot.action.time = Math.min(1, Math.max(0, t)) * oneShot.action.getClip().duration;
        oneShot.action.setEffectiveWeight(Math.max(0, shot));
      }
    }
    for (const [a, w] of weights) a.setEffectiveWeight(sum > 0 ? (w / sum) * (1 - Math.max(0, shot)) : 0);
  };

  /** 仕草の姿勢を、骨の回転で上に重ねる（値の意味は src/data/story/stageDefs.ts の GesturePose） */
  const overlay = (elapsed: number) => {
    const p = gestureBase ? addBase(gestureBase) : pose;
    const tk = talking;
    const talkNod = tk * (Math.sin(elapsed * 3.4) * 0.03 + Math.sin(elapsed * 5.7 + 1) * 0.012);
    const talkTurn = tk * Math.sin(elapsed * 1.9 + 0.4) * 0.035;
    // 座る・しゃがむ姿勢は素材の動きが作るので、ここでは上体・頭・腕だけ
    rotateBone(B.spine, AX, (p.bow ?? 0) * 0.5);
    rotateBone(B.chest, AX, (p.bow ?? 0) * 0.5);
    rotateBone(B.head, AX, (p.head ?? 0) + talkNod);
    rotateBone(B.head, AY, (p.headTurn ?? 0) + talkTurn);
    rotateBone(B.head, AZ, -(p.tilt ?? 0));
    // 腕: 前へ上げる（x の負の向き）・横へ開く。肘は、上げるほど少し曲げる
    const sitW = Math.min(1, Math.max(0, p.sit ?? 0));
    const armL = (p.armL ?? 0) * (1 - sitW * 0.7) + (!p.armL ? holding.handL : 0);
    const armR = (p.armR ?? 0) * (1 - sitW * 0.7) + (!p.armR ? holding.hand : 0);
    rotateBone(B.armL, AX, -armL);
    rotateBone(B.armR, AX, -armR);
    rotateBone(B.armL, AZ, (p.spreadL ?? 0) + (holding.handL >= 1 ? 0.5 : holding.handL ? 0.18 : 0));
    rotateBone(B.armR, AZ, -(p.spreadR ?? 0) - (holding.hand >= 1 ? 0.5 : holding.hand ? 0.18 : 0));
    rotateBone(B.foreL, AX, -Math.min(0.5, Math.max(0, armL) * 0.3));
    rotateBone(B.foreR, AX, -Math.min(0.5, Math.max(0, armR) * 0.3));
    // 体ごと: 浮く・後ろへずらす（マスの一辺が 1 の座標で）
    body.position.set(0, p.lift ?? 0, -(p.back ?? 0));
  };
  const addBase = (base: PuppetPose) => base;

  /** 頭の上の位置（話者の印）を、骨の位置から見積もる（形の全部の点を動かして測ると重いため） */
  const box = new THREE.Box3();
  const tmpV = new THREE.Vector3();
  const headTopOffset = (2.32 - headPivot) * HEAD_SCALE;
  const updateBounds = () => {
    rig.updateMatrixWorld(true);
    const inv = mesh.matrixWorld.clone().invert();
    box.makeEmpty();
    for (const b of [B.hips, B.chest, B.head, root]) box.expandByPoint(tmpV.setFromMatrixPosition(b.matrixWorld).applyMatrix4(inv));
    tmpV.setFromMatrixPosition(B.head.matrixWorld).applyMatrix4(inv);
    box.expandByPoint(tmpV.clone().setY(tmpV.y + headTopOffset));
    box.min.x -= 0.5;
    box.max.x += 0.5;
    box.min.z -= 0.45;
    box.max.z += 0.45;
    box.min.y = 0;
    mesh.boundingBox = box.clone();
  };

  /**
   * 手の持ち物は、手の向きに関わらず立てる（素材の手の骨は横を向いているため。灯が横に倒れないように）。
   * 向きは体から外へ 60 度ひねる（平たい物（暦盤）の面が、横から映すカメラに見えるように。体の正面に向けると、横からは縁しか見えない）
   */
  const outward = { hand: new THREE.Quaternion().setFromAxisAngle(AY, -1.05), handL: new THREE.Quaternion().setFromAxisAngle(AY, 1.05) };
  const uprightItems = () => {
    for (const slot of ['hand', 'handL'] as const) anchors[slot].quaternion.copy(parentRotation(anchors[slot])).invert().multiply(outward[slot]);
  };
  const apply = (elapsed: number, dt: number) => {
    overlayBones.forEach((b, i) => b.quaternion.copy(rest[i]!));
    blend(dt);
    mixer.update(dt);
    overlay(elapsed);
    uprightItems();
    updateBounds();
  };

  const puppet: Puppet = {
    group,
    body,
    setFacing(facing: Direction) {
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
      const clear = value < 1;
      for (const m of [...materials, ...(lineMat ? [lineMat] : [])]) {
        m.opacity = value;
        m.transparent = clear;
      }
      for (const m of itemMaterials) {
        m.opacity = value;
        m.transparent = clear;
      }
      shadowMat.opacity = BLOB_OPACITY * value;
    },
    setGlow(color, amount) {
      for (const m of materials) m.emissive.setRGB(color.r * amount * 0.8, color.g * amount * 0.8, color.b * amount * 0.8);
    },
    setPose(next) {
      pose = next;
      // 姿勢が大きく変わる時（座る・立つ）も、動きの重さは update でなめらかに寄せる
      if (!started) {
        // 最初の姿勢は、すぐにそろえる（場面の始めに、立った姿から座る所を見せないように）
        const sitW = Math.min(1, Math.max(0, next.sit ?? 0));
        weights.set(sit, sitW);
        weights.set(idle, 1 - sitW);
        apply(lastElapsed, 0);
      }
    },
    setItems,
    itemPoint: (slot) => anchors[slot].getWorldPosition(new THREE.Vector3()),
    setMoving(on) {
      moving = on;
    },
    talk(seconds) {
      talkRequest = seconds;
    },
    beginGesture(motion: object, base: PuppetPose, seconds: number) {
      const name = GESTURE_NAME.get(motion);
      const m = name ? GESTURE_CLIPS[name] : undefined;
      if (!m) return false;
      const clip = A.clips.get(m.clip);
      if (!clip) return false;
      oneShot?.action.stop();
      const a = mixer.clipAction(clip);
      a.reset();
      a.paused = true;
      a.enabled = true;
      a.play();
      oneShot = { action: a, start: lastElapsed, seconds };
      gestureBase = base;
      return true;
    },
    endGesture() {
      gestureBase = undefined;
    },
    update(elapsed) {
      const dt = started ? Math.min(0.1, Math.max(0, elapsed - lastElapsed)) : 0;
      started = true;
      lastElapsed = elapsed;
      stride += ((moving ? 1 : 0) - stride) * Math.min(1, dt * 8);
      if (talkRequest >= 0) {
        talkUntil = talkRequest > 0 ? elapsed + talkRequest : 0;
        talkRequest = -1;
      }
      talking += ((elapsed < talkUntil ? 1 : 0) - talking) * Math.min(1, dt * 4);
      apply(elapsed, dt);
    },
  };
  // 最初の姿勢（素材の動きは、少しでも時間を進めないと当たらない）
  apply(0, 1 / 60);
  return puppet;
}

/** three.js の glTF の読み込みは、骨の名前の「.」を取り除く（upperarm.l → upperarml） */
function sanitized(name: string): string {
  return THREE.PropertyBinding.sanitizeNodeName(name);
}

/** 体の骨の木だけを写す（形は写さない） */
function cloneBones(src: THREE.Object3D): THREE.Object3D {
  const copy = (o: THREE.Object3D): THREE.Object3D | null => {
    if ((o as THREE.Mesh).isMesh) return null;
    const c = (o as THREE.Bone).isBone ? new THREE.Bone() : new THREE.Object3D();
    c.name = o.name;
    c.position.copy(o.position);
    c.quaternion.copy(o.quaternion);
    c.scale.copy(o.scale);
    for (const child of o.children) {
      const cc = copy(child);
      if (cc) c.add(cc);
    }
    return c;
  };
  return copy(src)!;
}
