import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { Direction } from '../core/geometry';
import type { KayKitBase, KayKitHairShape, KayKitHead, KayKitLook, LookDefinition, LookItemSlot } from '../data/story/looks';
import { GESTURES } from '../data/story/stageDefs';
import { FORELOCK_ROOT, hairParts } from './kaykitHair';
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
/**
 * 武器と背負う物の大きさと傾き（KayKit の体は今の人形より頭が大きく背が低いので、長い物は小さめにし、背の物は斜めに負う）。
 * scale 倍率・tilt 体の左右への傾き（ラジアン）・y 上下へずらす量
 */
const ITEM_POSE: Readonly<Record<string, { scale: number; tilt?: number; y?: number }>> = {
  sword: { scale: 0.72 },
  spear: { scale: 0.85 },
  staff: { scale: 0.8 },
  staffRing: { scale: 0.8 },
  bow: { scale: 0.8 },
  measuringRod: { scale: 0.7, tilt: 0.55, y: -0.32 },
  quiver: { scale: 0.75, tilt: -0.2, y: -0.25 },
};
const GESTURE_NAME = new Map<object, string>(Object.entries(GESTURES).map(([name, g]) => [g, name]));

interface Assets {
  readonly bodies: Readonly<Record<KayKitBase, THREE.Object3D>>;
  readonly heads: Readonly<Record<KayKitHead, THREE.SkinnedMesh>>;
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
        heads: { knight: headOf('Knight_Head'), barbarian: headOf('Barbarian_Head'), rogue: headOf('Rogue_Head'), mage: headOf('Mage_Head') },
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

/** 色の画像の1区画の画素（横 CELL_W・縦 CELL_H。油染みを描けるように、区画を細かくする） */
const CELL_W = 32;
const CELL_H = 128;

/** 人物の色の画像（256×512。区画は横 8・縦 4）。区画ごとに、上が明るく下が暗い縦の濃淡で塗る */
function paletteTexture(look: KayKitLook): THREE.Texture {
  const canvas = document.createElement('canvas');
  canvas.width = CELL_W * 8;
  canvas.height = CELL_H * 4;
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
    accentB: look.accentB ?? 0xd8d4c8,
    // 下ろした頭巾は外套より明るく（外套と髪の境目を見せる）
    cloakInner: new THREE.Color(look.cloak?.color ?? look.cloth).multiplyScalar(1.45).getHex(),
    hairDark: new THREE.Color(look.hair.color).multiplyScalar(0.62).getHex(),
    // 明るい束（髪の色を明るくし、少し暖かく。黒い髪でも束の段差が見えるように）
    hairLight: hairLightOf(look.hair.color),
    // 頬の赤み（肌にごく薄く赤を混ぜる）
    blush: new THREE.Color(look.skin).lerp(new THREE.Color(0xd77a6e), 0.3).getHex(),
    skirt: look.skirt?.color ?? look.cloth,
    eye: 0x17110d,
    skin: look.skin,
    // 素手（省いた時は革の手袋の色）・油染み（服を暗くした色）・工具の木の柄と鉄
    hands: look.hands ?? look.leather ?? 0x5e4430,
    // 油染みの色（染みのない人物で革の肩当ての時は、この区画を革の色に使う）
    stain: look.pauldrons === 'leather' && !look.stains ? (look.leather ?? 0x5e4430) : new THREE.Color(look.cloth).lerp(new THREE.Color(0x3a3028), 0.32).getHex(),
    wood: 0x7a5a3a,
    metal: 0x6f7272,
    shine: 0xf4eee2,
    // 白目は真っ白にしない（夜の灯の場面で、白目だけが光って浮かないように。肌の明るさに近い生成り）
    sclera: 0xcfc4ae,
    iris: look.face?.iris ?? 0x4a3226,
  };
  const fill = (cx: number, cy: number, hex: number, side?: string, strong = false) => {
    // 画像には sRGB の値で塗る（three.js の色は、内部では直線の値で持っている）
    const c = muted(hex).convertLinearToSRGB();
    const grad = g.createLinearGradient(0, cy * CELL_H, 0, cy * CELL_H + CELL_H);
    // 暗い色でも濃淡が見えるように、明るくする時は少し足す
    const at = (k: number) => {
      const add = k > 1 ? (k - 1) * 0.12 : 0;
      return `rgb(${Math.round(Math.min(1, c.r * k + add) * 255)},${Math.round(Math.min(1, c.g * k + add) * 255)},${Math.round(Math.min(1, c.b * k + add) * 255)})`;
    };
    // 素材の濃淡に合わせる（上 1.1 倍 → 下 0.78 倍）。髪の束は濃淡を強く（根もと 1.35 倍 → 毛先 0.7 倍。重なった束の段差が見えるように）
    grad.addColorStop(0, at(strong ? 1.35 : 1.1));
    grad.addColorStop(1, at(strong ? 0.7 : 0.78));
    g.fillStyle = grad;
    g.fillRect(cx * CELL_W + (side === 'r' ? CELL_W / 2 : 0), cy * CELL_H, side ? CELL_W / 2 : CELL_W, CELL_H);
  };
  /** 油染み: 区画の中の決まった所に、暗い楕円をいくつか描く（区画の中の位置が、服の形のどこに当たるかは素材の作り次第なので、染みはまばらに置く） */
  const stains = (cx: number, cy: number, hex: number, spots: readonly (readonly [number, number, number, number])[]) => {
    const c = muted(hex).convertLinearToSRGB();
    g.fillStyle = `rgb(${Math.round(c.r * 255)},${Math.round(c.g * 255)},${Math.round(c.b * 255)})`;
    for (const [u, v, rw, rh] of spots) {
      g.beginPath();
      g.ellipse(cx * CELL_W + u * CELL_W, cy * CELL_H + v * CELL_H, rw * CELL_W, rh * CELL_H, 0.4, 0, Math.PI * 2);
      g.fill();
    }
  };
  for (let cy = 0; cy < 4; cy++)
    for (let cx = 0; cx < 8; cx++) {
      const role = map[`${cx},${cy}`];
      fill(cx, cy, role ? roles[role] : look.cloth);
    }
  for (const [part, ref] of Object.entries(PART_CELLS) as [PartCell, readonly (number | string)[]][]) fill(ref[0] as number, ref[1] as number, partColor[part], ref[2] as string | undefined, part === 'hair' || part === 'hairLight');
  if (look.stains) {
    // 服（rogue の 0,1）・ズボン（7,1）・素手。[区画の中の横, 縦, 横の半径, 縦の半径]（区画の大きさに対する割合）
    stains(0, 1, partColor.stain, [
      [0.2, 0.62, 0.05, 0.016],
      [0.58, 0.4, 0.045, 0.014],
      [0.66, 0.66, 0.04, 0.02],
    ]);
    stains(7, 1, new THREE.Color(look.pants ?? 0x3e342c).lerp(new THREE.Color(0x3a3028), 0.32).getHex(), [
      [0.3, 0.6, 0.08, 0.04],
      [0.55, 0.8, 0.06, 0.03],
    ]);
    const [hx, hy] = PART_CELLS.hands;
    stains(hx, hy, new THREE.Color(partColor.hands).lerp(new THREE.Color(0x3a3028), 0.4).getHex(), [
      [0.3, 0.55, 0.16, 0.06],
      [0.7, 0.8, 0.14, 0.07],
    ]);
  }
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
  // 輪郭線の膨らませ方（1 がふつう。顔の前は 0 にして、輪郭線を顔の表へ出さない。smoothFaceShading）
  out.setAttribute('outline', new THREE.BufferAttribute(new Float32Array(n).fill(1), 1));
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
 * 鼻を消す: 顔の真ん中の出っ張り（鼻の点）を、鼻の無い顔の面へ置き直す。
 * 素材の4つの頭は、どれも鼻が y 1.44〜1.53・|x| 0.14 以内で、顔の面（z 0.44 前後）から 0.08〜0.09 出ている。
 * 加えて、眉の間の鼻の付け根（barbarian は前へ 0.03 出た段、rogue・mage は小さな切れ込み）も、同じ面へならす
 */
function flattenNose(g: THREE.BufferGeometry): void {
  const p = g.attributes.position!;
  const uv = g.attributes.uv!;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i);
    const y = p.getY(i);
    if (p.getZ(i) < 0.2) continue;
    if (Math.abs(x) <= 0.145 && y >= 1.436 && y <= 1.535) {
      // 鼻のない顔の面: 真ん中が一番前で横へ丸く下がり、下（口の上）へ少し引っ込む。鼻の表も裏も、この面に置き直す（くぼみや段を残さない）
      p.setZ(i, 0.446 - 1.25 * x * x - Math.max(0, 1.53 - y) * 0.35);
    } else if (Math.abs(x) < 0.1 && y > 1.535 && y < 1.665 && cellOf(uv.getX(i), uv.getY(i)) === '0,0') {
      // 鼻の付け根（眉の間）
      p.setZ(i, 0.452 - 1.25 * x * x);
    }
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
  const uvs = g.attributes.uv!;
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
    const cell = cellOf(uvs.getX(idx[t]!), uvs.getY(idx[t]!));
    if ((cell === '0,0' || cell === '2,0') && Math.abs(cx) < 0.3 && cy > 1.36 && cy < 1.72 && cz > 0.3) {
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

/**
 * 顔の前の陰の向きを、なめらかな丸い面の向きに置き換える（場面4の顔の直し）。
 * 素材の顔は面が少なく、鼻をならした跡の細長い面や、目の円柱をつぶした跡の面の向きがばらばらなので、
 * 3段の陰では、その境目が「鼻」や「しわ」の線に見えた。顔の前だけ、頭を楕円の玉と見た時の向きにし、まわりへなめらかにつなぐ
 */
function smoothFaceShading(g: THREE.BufferGeometry): void {
  const p = g.attributes.position!;
  const n = g.attributes.normal!;
  const uv = g.attributes.uv!;
  const line = g.attributes.outline!;
  const v = new THREE.Vector3();
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i);
    const y = p.getY(i);
    const z = p.getZ(i);
    const cell = cellOf(uv.getX(i), uv.getY(i));
    if ((cell !== '0,0' && cell !== '2,0') || z < 0.25) continue;
    // 顔の前の真ん中ほど 1、縁（耳・あご・額の上）へ 0
    const wx = 1 - Math.min(1, Math.max(0, (Math.abs(x) - 0.24) / 0.1));
    const wy = Math.min(1, Math.max(0, (y - 1.34) / 0.06)) * (1 - Math.min(1, Math.max(0, (y - 1.72) / 0.08)));
    const w = wx * wy;
    if (w <= 0) continue;
    // 頭を、横 0.42・縦 0.7・前後 0.46 の楕円の玉と見た時の向き（中心の高さは 1.56）
    v.set(x / (0.42 * 0.42), (y - 1.56) / (0.7 * 0.7), z / (0.46 * 0.46)).normalize();
    v.multiplyScalar(w).add(new THREE.Vector3(n.getX(i), n.getY(i), n.getZ(i)).multiplyScalar(1 - w)).normalize();
    n.setXYZ(i, v.x, v.y, v.z);
    // 色も1色にそろえる: 色の画像の区画は上が明るく下が暗い濃淡で、素材の鼻の面は区画の下（暗い所）を指していた。
    // 形をならしても、その色の違いで鼻が描かれて見えたので、顔の前の肌は、まわりの顔と同じ高さ（明るさ）を指すようにする
    uv.setY(i, uv.getY(i) + (FACE_V - uv.getY(i)) * w);
    // 輪郭線は、顔の前では膨らませない（輪郭線は体を法線の向きに膨らませた暗い殻の裏側なので、
    // 顔の面の向きが少しでもばらつく所では、殻が顔の表へ出て、眉や目のまわりの細い線・ぎざぎざに見えた）
    line.setX(i, 1 - w);
  }
}

/** 顔の前の肌が指す、色の区画の中の高さ（素材の頬・額と同じ明るさ） */
const FACE_V = 0.12;

/**
 * 素材の太い眉（顔から出っ張った小さな塊）を外す。眉は髪と同じ色の区画（1,0）にある、髪から離れた小さな塊なので、
 * つながった面のまとまりごとに大きさを見て、小さく顔の前にあるものだけを外す（前髪やひげは残す）。
 * 出っ張った眉には、まわりに輪郭線（裏面を膨らませた暗い殻）が顔の面から透けて出て、眉を囲む細い線に見えていた
 */
function dropBrowBlocks(g: THREE.BufferGeometry): void {
  const p = g.attributes.position!;
  const uv = g.attributes.uv!;
  const idx = g.index!.array;
  const key = (i: number) => `${Math.round(p.getX(i) * 1e4)},${Math.round(p.getY(i) * 1e4)},${Math.round(p.getZ(i) * 1e4)}`;
  const parent = new Map<string, string>();
  const find = (k: string): string => {
    let r = k;
    while (parent.get(r) !== r) r = parent.get(r)!;
    parent.set(k, r);
    return r;
  };
  const tris: number[] = [];
  for (let t = 0; t < idx.length; t += 3) {
    if (cellOf(uv.getX(idx[t]!), uv.getY(idx[t]!)) !== '1,0') continue;
    tris.push(t);
    const ks = [key(idx[t]!), key(idx[t + 1]!), key(idx[t + 2]!)];
    for (const k of ks) if (!parent.has(k)) parent.set(k, k);
    parent.set(find(ks[1]!), find(ks[0]!));
    parent.set(find(ks[2]!), find(ks[0]!));
  }
  const box = new Map<string, THREE.Box3>();
  const v = new THREE.Vector3();
  for (const t of tris)
    for (let j = 0; j < 3; j++) {
      const r = find(key(idx[t + j]!));
      const b = box.get(r) ?? new THREE.Box3();
      b.expandByPoint(v.fromBufferAttribute(p, idx[t + j]!));
      box.set(r, b);
    }
  const isBrow = (b: THREE.Box3) => b.max.x - b.min.x < 0.3 && b.min.z > 0.22 && b.min.y > 1.55 && b.max.y < 1.87;
  const keep: number[] = [];
  for (let t = 0; t < idx.length; t += 3) {
    if (cellOf(uv.getX(idx[t]!), uv.getY(idx[t]!)) === '1,0' && isBrow(box.get(find(key(idx[t]!)))!)) continue;
    keep.push(idx[t]!, idx[t + 1]!, idx[t + 2]!);
  }
  g.setIndex(keep);
}

/** Mage の頭の後ろの結い目（色の区画 1,1）を、髪の区画へ移す（体の区画 1,1 は服の色なので、そのままでは服の色になる） */
function hairTieAsHair(g: THREE.BufferGeometry): void {
  const uv = g.attributes.uv!;
  for (let i = 0; i < uv.count; i++) if (cellOf(uv.getX(i), uv.getY(i)) === '1,1') uv.setY(i, uv.getY(i) - 0.25);
}

/** 向きごとの長さ（[向き, 長さ] の組を、ぐるりとなめらかに補う） */
function hemAt(hem: readonly (readonly [number, number])[], az: number): number {
  const pts = [...hem].sort((a, b) => a[0] - b[0]);
  for (let i = 0; i < pts.length; i++) {
    const a = pts[i]!;
    const b = pts[(i + 1) % pts.length]!;
    const span = (b[0] - a[0] + 360) % 360 || 360;
    const d = (az - a[0] + 360) % 360;
    if (d <= span) {
      const t = d / span;
      const s = t * t * (3 - 2 * t);
      return a[1] + (b[1] - a[1]) * s;
    }
  }
  return pts[0]![1];
}

/** 頭の髪の中心（溝と段差の向きを測る） */
const SCULPT_C = new THREE.Vector3(0, 1.7, -0.04);
const dirOf = (az: number, el: number) => {
  const a = THREE.MathUtils.degToRad(az);
  const e = THREE.MathUtils.degToRad(el);
  return new THREE.Vector3(Math.sin(a) * Math.cos(e), Math.sin(e), Math.cos(a) * Math.cos(e));
};

/**
 * 髪の面に、浅い溝（生え際から毛先へ）と、大きな塊の段差を刻む。点を頭の中心へ向けて少し下げるだけ（面のつながりは変えない）。
 * 細い束を重ねずに、流れと塊の分かれ目を見せるため
 */
function sculptHair(g: THREE.BufferGeometry, shape: KayKitHairShape): void {
  const p = g.attributes.position!;
  const grooves = (shape.grooves ?? []).map((gr) => ({ ...gr, pts: gr.path.map(([a, e]) => dirOf(a, e)) }));
  const steps = (shape.steps ?? []).map((s) => ({ ...s, n: dirOf(s.az, s.el) }));
  const v = new THREE.Vector3();
  const seg = new THREE.Line3();
  const closest = new THREE.Vector3();
  for (let i = 0; i < p.count; i++) {
    v.set(p.getX(i), p.getY(i), p.getZ(i)).sub(SCULPT_C);
    const r = v.length();
    const dir = v.clone().divideScalar(r);
    let push = 0;
    for (const gr of grooves) {
      // 溝の線までの角度（度）と、線に沿った位置（0 が生え際、1 が毛先）
      let best = Infinity;
      let along = 0;
      let total = 0;
      const lens = gr.pts.slice(1).map((q, k) => q.distanceTo(gr.pts[k]!));
      const sum = lens.reduce((a, b) => a + b, 0);
      for (let k = 0; k + 1 < gr.pts.length; k++) {
        seg.set(gr.pts[k]!, gr.pts[k + 1]!);
        const t = seg.closestPointToPointParameter(dir, true);
        seg.at(t, closest);
        const d = closest.distanceTo(dir);
        if (d < best) {
          best = d;
          along = (total + t * lens[k]!) / sum;
        }
        total += lens[k]!;
      }
      const w = THREE.MathUtils.degToRad(gr.width);
      if (best < w) {
        const prof = (1 - (best / w) ** 2) ** 2;
        const fade = Math.min(1, along / 0.12) * (1 - 0.55 * along) * Math.min(1, (1 - along) / 0.08);
        push = Math.max(push, gr.depth * prof * fade);
      }
    }
    for (const s of steps) {
      const az = Math.atan2(dir.x, dir.z);
      const wave = s.wave ? THREE.MathUtils.degToRad(s.wave[0]) * Math.sin(az * s.wave[1]) : 0;
      const side = dir.dot(s.n) - s.offset + wave;
      // 下の側（side < 0）を下げる。境目はやや急に（段に見えるように）
      if (side < 0) push += s.step * THREE.MathUtils.smoothstep(-side, 0, 0.05);
    }
    if (push > 0) {
      v.multiplyScalar((r - push) / r).add(SCULPT_C);
      p.setXYZ(i, v.x, v.y, v.z);
    }
  }
}

/** 形を細かくする（三角形を4つに分ける。点の属性は辺の両端の平均。骨の番号は片方の端の物） */
function subdivided(g: THREE.BufferGeometry): THREE.BufferGeometry {
  const idx = Array.from(g.index!.array);
  const names = Object.keys(g.attributes);
  const data: Record<string, number[]> = {};
  for (const n of names) data[n] = Array.from((g.attributes[n] as THREE.BufferAttribute).array);
  let count = g.attributes.position!.count;
  const mid = new Map<string, number>();
  const midOf = (a: number, b: number) => {
    const key = a < b ? `${a},${b}` : `${b},${a}`;
    const got = mid.get(key);
    if (got !== undefined) return got;
    for (const n of names) {
      const size = (g.attributes[n] as THREE.BufferAttribute).itemSize;
      const arr = data[n]!;
      for (let k = 0; k < size; k++) arr.push(n === 'skinIndex' ? arr[a * size + k]! : (arr[a * size + k]! + arr[b * size + k]!) / 2);
    }
    mid.set(key, count);
    return count++;
  };
  const out: number[] = [];
  for (let t = 0; t < idx.length; t += 3) {
    const [a, b, c] = [idx[t]!, idx[t + 1]!, idx[t + 2]!];
    const ab = midOf(a, b);
    const bc = midOf(b, c);
    const ca = midOf(c, a);
    out.push(a, ab, ca, ab, b, bc, ca, bc, c, ab, bc, ca);
  }
  const r = new THREE.BufferGeometry();
  for (const n of names) {
    const src = g.attributes[n] as THREE.BufferAttribute;
    const Arr = src.array.constructor as new (a: number[]) => THREE.TypedArray;
    r.setAttribute(n, new THREE.BufferAttribute(new Arr(data[n]!), src.itemSize));
  }
  r.setIndex(count > 65535 ? new THREE.Uint32BufferAttribute(out, 1) : out);
  return r;
}

/** 髪を変形する（点を動かすだけ。面のつながりは変えないので、閉じた塊のまま） */
function reshapeHair(g: THREE.BufferGeometry, shape: KayKitHairShape): void {
  const p = g.attributes.position!;
  const cut = 1.62;
  for (let i = 0; i < p.count; i++) {
    let x = p.getX(i);
    let y = p.getY(i);
    let z = p.getZ(i);
    if (shape.mirror) x = -x;
    // 長さ: 耳の上（cut）より下だけを縮める・伸ばす（前髪は耳より上なので変わらない）。縮めた分、裾は頭へ少し寄せる（裾が浮いて鉢に見えないように）。
    // hem で向きごとに長さを変える（縁の高さを不ぞろいに）
    const length = shape.hem ? hemAt(shape.hem, (THREE.MathUtils.radToDeg(Math.atan2(x, z + 0.04)) + 360) % 360) : shape.length;
    if (length !== undefined && y < cut) {
      const ny = cut - (cut - y) * length;
      if (length < 1) {
        const k = Math.min(1, (ny - y) / 0.3) * 0.06;
        x *= 1 - k;
        z = (z + 0.04) * (1 - k) - 0.04;
      }
      y = ny;
    }
    if (shape.fringe !== undefined && z > 0.2 && y < 1.95) {
      // 前髪: 額の上（1.95）から下へ伸ばす・縮める。顔の面へ寄せすぎないように、伸ばした分だけ少し前へ
      const f = Math.min(1, Math.max(0, (z - 0.2) / 0.15));
      const ny = 1.95 - (1.95 - y) * (1 + (shape.fringe - 1) * f);
      z += Math.max(0, y - ny) * 0.12 * f;
      y = ny;
    }
    if (shape.lift) y += shape.lift * Math.max(0, Math.min(1, (y - 1.9) / 0.25));
    if (shape.volume !== undefined) {
      const k = shape.volume;
      x *= k;
      z = (z + 0.04) * k - 0.04;
      if (y > 1.6) y = 1.6 + (y - 1.6) * (1 + (k - 1) * 0.8);
    }
    p.setXYZ(i, x, y, z);
  }
  if (shape.grooves || shape.steps) sculptHair(g, shape);
  if (shape.mirror) {
    // 左右を反対にしたので、面の向きを戻す
    const arr = g.index!.array as Uint16Array | Uint32Array;
    for (let t = 0; t < arr.length; t += 3) [arr[t + 1], arr[t + 2]] = [arr[t + 2]!, arr[t + 1]!];
  }
}

/**
 * 頭の形から、髪（色の区画 1,0 と 1,1）だけを取り出す。眉の塊は外す。
 * fit で、barbarian の頭に合わせて縮める（barbarian の頭は knight の頭より頭頂が低く小さいため）
 */
function hairShell(src: THREE.BufferGeometry, fit: boolean, shape: KayKitHairShape | undefined): THREE.BufferGeometry {
  let g = src;
  const uv = g.attributes.uv!;
  const idx = g.index!.array;
  const keep: number[] = [];
  for (let t = 0; t < idx.length; t += 3) {
    const cell = cellOf(uv.getX(idx[t]!), uv.getY(idx[t]!));
    if (cell === '1,0' || cell === '1,1') keep.push(idx[t]!, idx[t + 1]!, idx[t + 2]!);
  }
  g.setIndex(keep);
  dropBrowBlocks(g);
  if (fit) {
    // 浮いて箱に見えないように
    const p2 = g.attributes.position!;
    for (let i = 0; i < p2.count; i++) {
      const y = p2.getY(i);
      p2.setXYZ(i, p2.getX(i) * 1.02, y > 1.8 ? 1.8 + (y - 1.8) * 0.82 : y, p2.getZ(i) * 1.02 + 0.01);
    }
  }
  for (let k = 0; k < (shape?.subdivide ?? 0); k++) g = subdivided(g);
  if (shape) reshapeHair(g, shape);
  smoothNormals(g);
  return g;
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

/** 顔の前の面（目・眉を沿わせる当たり判定。前向きの面だけを集めておく。毎回すべての面を見ると重いため） */
type FaceSurface = readonly (readonly [THREE.Vector3, THREE.Vector3, THREE.Vector3])[];
function faceSurface(g: THREE.BufferGeometry): FaceSurface {
  const p = g.attributes.position!;
  const idx = g.index!.array;
  const out: [THREE.Vector3, THREE.Vector3, THREE.Vector3][] = [];
  for (let t = 0; t < idx.length; t += 3) {
    const a = new THREE.Vector3().fromBufferAttribute(p, idx[t]!);
    const b = new THREE.Vector3().fromBufferAttribute(p, idx[t + 1]!);
    const c = new THREE.Vector3().fromBufferAttribute(p, idx[t + 2]!);
    if (Math.max(a.z, b.z, c.z) < 0.2 || Math.min(a.y, b.y, c.y) > 1.95 || Math.max(a.y, b.y, c.y) < 1.3) continue;
    out.push([a, b, c]);
  }
  return out;
}

/** 顔の面の上の点（前から当てた線と、顔の面の交わる所。一番前の面） */
function surfaceZ(surf: FaceSurface, x: number, y: number): number | undefined {
  const ray = new THREE.Ray(new THREE.Vector3(x, y, 2), new THREE.Vector3(0, 0, -1));
  const hit = new THREE.Vector3();
  let best: number | undefined;
  for (const [a, b, c] of surf) {
    if (!ray.intersectTriangle(a, b, c, false, hit)) continue;
    if (best === undefined || hit.z > best) best = hit.z;
  }
  return best;
}

/**
 * 顔の面に沿わせた平たい形: 前から見た平面（x, y）で作った形の点を、1つずつ顔の面の上へ置く（lift だけ浮かせる）。
 * 平らな板を顔に当てると、丸い顔から縁が浮き、横から見て目が飛び出して見えたため。片面で厚みがないので、輪郭線は付かない
 */
function conform(g: THREE.BufferGeometry, surf: FaceSurface, lift: number): THREE.BufferGeometry {
  const p = g.attributes.position!;
  for (let i = 0; i < p.count; i++) {
    let x = p.getX(i);
    const y = p.getY(i);
    let z = surfaceZ(surf, x, y);
    // 顔の面から外れた点（頬の縁の外）は、顔の真ん中の方へ寄せて、顔の縁に留める（宙に浮いた角にしない）
    for (let k = 0; z === undefined && k < 12; k++) {
      x *= 0.97;
      z = surfaceZ(surf, x, y);
    }
    p.setXYZ(i, x, y, (z ?? 0.4) + lift);
  }
  return g;
}

/** 前から見た平面の楕円（中心 cx, cy・半径 rx, ry）。clamp で、別の楕円（白目）からはみ出す点を、その縁へ寄せる */
function flatDisc(cx: number, cy: number, rx: number, ry: number, clampTo?: { cx: number; cy: number; rx: number; ry: number }): THREE.BufferGeometry {
  const g = new THREE.RingGeometry(0.0001, 1, 24, 4);
  const p = g.attributes.position!;
  for (let i = 0; i < p.count; i++) {
    let x = cx + p.getX(i) * rx;
    let y = cy + p.getY(i) * ry;
    if (clampTo) {
      const dx = (x - clampTo.cx) / clampTo.rx;
      const dy = (y - clampTo.cy) / clampTo.ry;
      const d = Math.hypot(dx, dy);
      if (d > 1) {
        x = clampTo.cx + (dx / d) * clampTo.rx;
        y = clampTo.cy + (dy / d) * clampTo.ry;
      }
    }
    p.setXYZ(i, x, y, 0);
  }
  return g;
}

/** 前から見た平面の帯（点の列に沿って、幅 width。始めが太く、終わりへ細くなる）。点は細かく取り直す（顔の丸みに沿わせるため） */
function flatStroke(points: readonly [number, number][], width: number, taper = 0.8): THREE.BufferGeometry {
  const curve = new THREE.CatmullRomCurve3(points.map(([x, y]) => new THREE.Vector3(x, y, 0)));
  return flatRibbon(curve.getPoints(16), width, taper);
}

/** 目の見た目（ふつうの人物と、ユナのように少し大きくまつ毛のある目）。白目は横長で小さく、瞳はやや大きく、上はまぶたの線で隠す */
const EYE_STYLE = {
  adult: { w: 0.054, h: 0.034, iris: 0.029, pupil: 0.013, shine: 0.0075, lid: 0.014 },
  large: { w: 0.063, h: 0.045, iris: 0.036, pupil: 0.016, shine: 0.011, lid: 0.015 },
  // 切れ長（トウマ。少し細く、まぶたの線を太く）
  narrow: { w: 0.056, h: 0.03, iris: 0.027, pupil: 0.012, shine: 0.0065, lid: 0.015 },
} as const;
/** 目の中心（素材の目の位置。左右は x の符号） */
const EYE_AT = { x: 0.2, y: 1.6 };

/**
 * 目: 顔の面に沿わせて、白目・瞳・瞳孔・光の点・上のまぶたの線を重ねて貼る（場面4の顔の直し）。
 * - 白目は横長で小さく、上のまぶたの線で上の縁を隠す。瞳は白目の中でやや大きく、上をまぶたの下へ入れる（白目が瞳の上に見える「驚いた目」にしない）
 * - 瞳ははみ出さないように、白目の縁で切る
 * large でユナの少し大きい目とまつ毛（目尻で上へはねる）
 */
function eyeParts(surf: FaceSurface, kind: 'adult' | 'large' | 'narrow'): PartPiece[] {
  const large = kind === 'large';
  const st = EYE_STYLE[kind];
  const out: PartPiece[] = [];
  const piece = (g: THREE.BufferGeometry, lift: number, cell: PartCell) => out.push(finish(conform(g, surf, lift), cell, { a: BONE.head }, true));
  for (const sign of [1, -1]) {
    const cx = sign * EYE_AT.x;
    const cy = EYE_AT.y;
    const white = { cx, cy, rx: st.w, ry: st.h };
    const inner = { cx, cy, rx: st.w * 0.97, ry: st.h * 0.97 };
    const ix = cx - sign * 0.003;
    // 瞳は白目の真ん中より少しだけ上（上の縁はまぶたの線に少し隠れる。隠しすぎると半目・眠そうに見えた。観客の検査）
    const iy = cy + st.h * 0.04;
    piece(flatDisc(cx, cy, st.w, st.h), 0.003, 'sclera');
    piece(flatDisc(ix, iy, st.iris * 0.92, st.iris, inner), 0.005, 'iris');
    piece(flatDisc(ix, iy, st.pupil * 0.92, st.pupil, inner), 0.007, 'eye');
    piece(flatDisc(ix + sign * st.iris * 0.3, iy + st.iris * 0.3, st.shine, st.shine, inner), 0.009, 'shine');
    // 上のまぶたの線: 白目の上の縁に沿い、目尻（始め）が太く、目頭へ細く。白目の上の縁を少し覆う
    const lid: [number, number][] = [];
    // まつ毛は目尻で少しだけ外へ（上へはね上げると、つり目・しかめっ面に見えた。観客の検査）
    if (large) lid.push([cx + sign * st.w * 1.22, cy + st.h * 0.55]);
    for (const a of [0.08, 0.3, 0.55, 0.8, 1.05, 1.3, 1.55, 1.8, 2.05, 2.3, 2.6, 2.9]) {
      // 目尻（a 0）から目頭（a π）へ。上の縁より少し下（白目の上を覆う）
      lid.push([cx + sign * Math.cos(a) * white.rx * 1.02, cy + Math.sin(a) * white.ry * 0.95 + st.lid * 0.3]);
    }
    piece(flatStroke(lid, st.lid, large ? 0.9 : 0.7), 0.011, 'eye');
  }
  return out;
}

/** 眉の太さ（thin 細い・normal ふつう・thick 太い） */
const BROW_WIDTH = { thin: 0.013, normal: 0.018, thick: 0.026 } as const;

/**
 * 眉: 顔の面に沿った1本の細い帯（素材の出っ張った眉の塊は外している）。眉頭（内側・始め）が太く、眉尻へ細くなる。
 * 眉頭を下げない（怒った角度にしない）。髪の暗い色
 */
function browParts(surf: FaceSurface, width: keyof typeof BROW_WIDTH, large: boolean, lift = 0): PartPiece[] {
  const out: PartPiece[] = [];
  // 大きな目の人物（ユナ）は眉を目から離す（近いと、しかめっ面に見えた。観客の検査）
  const y = 1.692 + (large ? 0.02 : 0) + lift;
  for (const sign of [1, -1]) {
    const pts: [number, number][] = [
      [sign * 0.13, y + 0.001],
      [sign * 0.18, y + 0.009],
      [sign * 0.23, y + 0.008],
      [sign * 0.27, y - 0.004],
    ];
    out.push(finish(conform(flatStroke(pts, BROW_WIDTH[width], 0.6), surf, 0.012), 'hairDark', { a: BONE.head }, true));
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

/** 顔の輪郭を細くする: 目より下を、下ほど横へ細く、あごを小さく（トウマを青年らしく） */
function slimFace(g: THREE.BufferGeometry, amount: number): void {
  const p = g.attributes.position!;
  for (let i = 0; i < p.count; i++) {
    const y = p.getY(i);
    const k = Math.min(1, Math.max(0, (1.62 - y) / 0.36));
    if (k <= 0) continue;
    const s = k * k;
    const z = p.getZ(i);
    // あごの先（前の下）を少し引っ込めて上げる
    p.setXYZ(i, p.getX(i) * (1 - amount * s), y + amount * 0.25 * s, z - (z > 0.2 ? amount * 0.25 * s : 0));
  }
}

/**
 * 平たい帯（まつ毛・まぶた・眉）: 点の列に沿って、幅 width の帯を作る（始めが太く、終わりへ細く）。
 * 輪郭線を付けないように、厚みのない片面の形にする（輪郭線は裏面を膨らませて描くので、前を向いた片面の形には出ない）
 */
function flatRibbon(points: readonly THREE.Vector3[], width: number, taper = 0.8): THREE.BufferGeometry {
  const pos: number[] = [];
  const index: number[] = [];
  const n = points.length;
  for (let i = 0; i < n; i++) {
    const a = points[Math.max(0, i - 1)]!;
    const b = points[Math.min(n - 1, i + 1)]!;
    const tan = b.clone().sub(a).normalize();
    const side = new THREE.Vector3(-tan.y, tan.x, 0).normalize();
    const w = (width * (1 - i / (n - 1)) ** taper) / 2 + 0.002;
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

/** 頬の赤み: 頬の面に沿わせた薄い楕円 */
function blushParts(surf: FaceSurface): PartPiece[] {
  return [1, -1].map((sign) => finish(conform(flatDisc(sign * 0.27, 1.5, 0.062, 0.038), surf, 0.004), 'blush', { a: BONE.head }, true));
}

/** 頭の骨に付く点を、首の付け根（頭の骨）から縮める */
function scaleHead(g: THREE.BufferGeometry, pivotY: number, forelockBone: number, headScale: number, flat = 1): void {
  const p = g.attributes.position!;
  const si = g.attributes.skinIndex!;
  const sw = g.attributes.skinWeight!;
  for (let i = 0; i < p.count; i++) {
    let w = 0;
    for (let k = 0; k < 4; k++) {
      const b = si.getComponent(i, k);
      if (b === BONE.head || b === forelockBone) w += sw.getComponent(i, k);
    }
    if (w <= 0) continue;
    const s = 1 + (headScale - 1) * w;
    // flat: 横と前後だけに掛ける倍率（肩幅を体だけに掛ける時、頭の横幅を元に戻す）
    const sh = s * (1 + (flat - 1) * w);
    p.setXYZ(i, p.getX(i) * sh, pivotY + (p.getY(i) - pivotY) * s, p.getZ(i) * sh);
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
    // outline（形の点ごとの値）で膨らませ方を変える（顔の前は 0。smoothFaceShading）
    shader.vertexShader =
      'attribute float outline;\n' +
      shader.vertexShader.replace('#include <skinning_vertex>', '#include <skinning_vertex>\ntransformed += normalize( objectNormal ) * 0.022 * outline;');
  };
  m.customProgramCacheKey = () => 'kaykit-outline';
  return m;
}

/** 区画の UV を、区画の中の位置を保ったまま、別の区画へ移す */
function moveToCell(u: number, v: number, cell: readonly [number, number] | readonly [number, number, string]): [number, number] {
  const fu = u * 8 - Math.min(7, Math.floor(u * 8));
  const fv = v * 4 - Math.min(3, Math.floor(v * 4));
  return [(cell[0] + fu) / 8, (cell[1] + fv) / 4];
}

/**
 * rogue の腕の塗り分けを変える（袖をまくる・素手）。腕の形は、肩から手首までが服の区画（0,1）、袖口が 1,1、手が革の 5,2。
 * 骨を付けた時の姿勢（腕を横へ伸ばした形）で、肩からの距離（|x|）で分ける。面ごとに分けるので、面の点を面ごとに別にする（色がにじまないように）
 */
function recolorArms(g: THREE.BufferGeometry, rolled: boolean, hands: boolean): THREE.BufferGeometry {
  const src = g.index!.array;
  const n = src.length;
  const out = new THREE.BufferGeometry();
  for (const [name, attr] of Object.entries(g.attributes)) {
    const a = attr as THREE.BufferAttribute;
    const arr = new (a.array.constructor as new (len: number) => THREE.TypedArray)(n * a.itemSize);
    for (let i = 0; i < n; i++) for (let k = 0; k < a.itemSize; k++) arr[i * a.itemSize + k] = a.getComponent(src[i]!, k);
    out.setAttribute(name, new THREE.BufferAttribute(arr, a.itemSize, a.normalized));
  }
  out.setIndex([...Array(n).keys()]);
  const p = out.attributes.position!;
  const uv = out.attributes.uv!;
  for (let t = 0; t < n; t += 3) {
    const x = Math.abs(p.getX(t) + p.getX(t + 1) + p.getX(t + 2)) / 3;
    const y = (p.getY(t) + p.getY(t + 1) + p.getY(t + 2)) / 3;
    if (y < 0.93 || y > 1.28 || x < 0.38) continue;
    const cell = cellOf((uv.getX(t) + uv.getX(t + 1) + uv.getX(t + 2)) / 3, (uv.getY(t) + uv.getY(t + 1) + uv.getY(t + 2)) / 3);
    let to: readonly [number, number] | undefined;
    if (rolled && cell === '0,1') to = x >= 0.47 ? [0, 0] : x >= 0.4 ? [1, 1] : undefined;
    else if (rolled && cell === '1,1' && x > 0.58) to = [0, 0];
    else if (hands && cell === '5,2') to = PART_CELLS.hands;
    if (!to) continue;
    for (let k = 0; k < 3; k++) {
      const [nu, nv] = moveToCell(uv.getX(t + k), uv.getY(t + k), to);
      uv.setXY(t + k, nu, nv);
    }
  }
  return out;
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
  const inverses = A.boneInverses.map((m) => m.clone());
  // 頭を縮める割合（人物ごとの倍率を掛ける。ユナは、頭と体の比を大人に少し近づける）
  // 体だけを大きく・小さくする人物（bodyOnly）は、背丈と肩幅の倍率を頭に掛けない（頭はどの人物も同じ大きさ × headScale）
  const headScale = HEAD_SCALE * (k.headScale ?? 1) / (k.bodyOnly ? (k.height ?? 1) : 1);
  const headFlat = k.bodyOnly ? 1 / (k.width ?? 1) : 1;
  const headPivot = new THREE.Vector3().setFromMatrixPosition(A.boneInverses[BONE.head]!.clone().invert()).y;
  const hairPieces = hairParts(k, { pivot: headPivot, scale: headScale });
  // 前髪の1房の骨（頭の骨の子。生え際を軸に揺れて、うつむくと垂れる）。骨を付けた時の位置は、頭を縮めた後の生え際
  const FORELOCK_BONE = bones.length;
  let forelockBone: THREE.Bone | undefined;
  if (hairPieces.some((p) => p.forelock)) {
    const headBind = A.boneInverses[BONE.head]!.clone().invert();
    const headBindQ = new THREE.Quaternion().setFromRotationMatrix(headBind);
    const [rx, ry, rz] = FORELOCK_ROOT;
    const at = new THREE.Vector3(rx * headScale * headFlat, headPivot + (ry - headPivot) * headScale, rz * headScale * headFlat);
    const bind = new THREE.Matrix4().compose(at, headBindQ, new THREE.Vector3(1, 1, 1));
    const local = headBind.clone().invert().multiply(bind);
    forelockBone = new THREE.Bone();
    forelockBone.name = 'forelock';
    local.decompose(forelockBone.position, forelockBone.quaternion, forelockBone.scale);
    bones[BONE.head]!.add(forelockBone);
    bones.push(forelockBone);
    inverses.push(bind.clone().invert());
  }
  const skeleton = new THREE.Skeleton(bones, inverses);
  const boneMapOf = (mesh: THREE.SkinnedMesh) => mesh.skeleton.bones.map((b) => A.boneNames.indexOf(b.name));

  // ---- 形: 体の部品 + 頭 + 自作の部品を1つにまとめる ----
  const pieces: THREE.BufferGeometry[] = [];
  const recolor = k.base === 'rogue' && (k.sleeves === 'rolled' || k.hands !== undefined);
  src.traverse((o) => {
    const m = o as THREE.SkinnedMesh;
    if (!m.isSkinnedMesh) return;
    const g = normalized(m.geometry, boneMapOf(m));
    pieces.push(recolor ? recolorArms(g, k.sleeves === 'rolled', k.hands !== undefined) : g);
  });
  const headName = k.head ?? 'knight';
  const head = normalized(A.heads[headName].geometry, boneMapOf(A.heads[headName]));
  // 髪: 作者が頭と一体で作った髪（色の区画 1,0）を、kit の頭から取り出して使う（顔の頭の髪は外す。形を変える時は hair.shape）。
  // Rogue の頭の耳飾り（3,0）は外す。Mage の頭の後ろの結い目（1,1）は髪の色にする。barbarian の頭はひげ（1,0）を残し、眉の塊だけを外す
  dropCells(head, ['3,0']);
  if (headName === 'barbarian') dropBrowBlocks(head);
  else dropCells(head, ['1,0', '1,1']);
  const shell = normalized(A.heads[k.hair.kit].geometry, boneMapOf(A.heads[k.hair.kit]));
  hairTieAsHair(shell);
  pieces.push(hairShell(shell, headName === 'barbarian', k.hair.shape));
  const face = k.face ?? {};
  flattenNose(head);
  flattenEyes(head);
  dropHiddenFaces(head);
  if (face.round) roundFace(head);
  if (face.slim) slimFace(head, face.slim);
  // 形を動かしたので、陰の向きを計り直す（同じ位置の点は向きをそろえ、輪郭線にすき間を作らない）。顔の前は、なめらかな丸い面の向きにする
  smoothNormals(head);
  smoothFaceShading(head);
  pieces.push(head);
  const surf = faceSurface(head);
  const large = face.eyes === 'large';
  const faceParts = [...eyeParts(surf, face.eyes ?? 'adult'), ...browParts(surf, face.brows ?? 'normal', large, face.browLift), ...(face.blush ? blushParts(surf) : [])];
  for (const f of faceParts) {
    const g = normalized(f.geometry, null);
    // 顔に描いた目と眉にも、輪郭線を付けない
    (g.attributes.outline as THREE.BufferAttribute).array.fill(0);
    pieces.push(g);
  }
  for (const p of [...hairPieces, ...customParts(k)]) {
    const g = normalized(p.geometry, null);
    if (p.noOutline) (g.attributes.outline as THREE.BufferAttribute).array.fill(0);
    if (p.forelock && forelockBone) {
      const si = g.attributes.skinIndex as THREE.BufferAttribute;
      for (let i = 0; i < si.count; i++) si.setX(i, FORELOCK_BONE);
    }
    pieces.push(g);
  }
  const merged = mergeGeometries(pieces)!;
  for (const p of pieces) p.dispose();
  // 頭（頭の骨と前髪の骨に付く点）を、首の付け根から縮める
  scaleHead(merged, headPivot, FORELOCK_BONE, headScale, headFlat);

  const map = paletteTexture(k);
  // 裏も描く（髪と頬のすき間から、髪の内側の代わりに輪郭線の黒が見えて、頬の横に黒い帯が出ていたため。トウマの短くした横の髪）
  const material =
    shading.value === 'toon'
      ? new THREE.MeshToonMaterial({ map, gradientMap: toonGradient(), side: THREE.DoubleSide })
      : new THREE.MeshLambertMaterial({ map, side: THREE.DoubleSide });
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
        const pose = ITEM_POSE[model];
        if (pose) {
          holder.scale.setScalar(pose.scale);
          holder.rotation.z = pose.tilt ?? 0;
          holder.position.y = pose.y ?? 0;
        }
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
  const headTopOffset = (2.32 - headPivot) * headScale;
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
  /**
   * うつむく時は、首を少し前へ出す（あごが外套の襟に沈まないように。頭の骨の回転だけでうつむくと、首の付け根を軸に、あごが襟の中へ入るため）。
   * 前髪の1房は、頭の前への傾きの一部を打ち消して、生え際から垂れる（うつむくと目元にかかる）。急に動かず、少し遅れて付いてくる
   */
  const headRestPos = B.head.position.clone();
  const headBindQ = new THREE.Quaternion().setFromRotationMatrix(A.boneInverses[BONE.head]!.clone().invert()).invert();
  const forelockRestQ = forelockBone?.quaternion.clone();
  const upV = new THREE.Vector3();
  const fwdV = new THREE.Vector3();
  let forelockAngle = 0;
  /** 頭の前への傾き（ラジアン。前へ倒すと正）。骨を付けた時の姿勢からの回り方で測る */
  const headPitch = () => {
    const q = parentRotation(forelockBone ?? B.head).clone();
    if (!forelockBone) q.multiply(B.head.quaternion);
    q.multiply(headBindQ);
    upV.set(0, 1, 0).applyQuaternion(q);
    return Math.atan2(upV.z, upV.y);
  };
  const neckAndForelock = (dt: number) => {
    const pitch = headPitch();
    const bowAmount = Math.min(1, Math.max(0, pitch / 0.7));
    if (bowAmount > 0) {
      // 体の前の向きを、頭の骨の親から見た向きに直して、首を前へ（素材の頭の座標で最大 0.15）
      fwdV.set(0, -0.35, 1).normalize().applyQuaternion(parentRotation(B.head).clone().invert());
      B.head.position.addScaledVector(fwdV, 0.15 * bowAmount);
    }
    if (forelockBone && forelockRestQ) {
      // 前へ倒した分の 0.45 だけ打ち消す（後ろへ反らした時は打ち消さない。生え際から額へ食い込むため）
      const target = -0.45 * Math.max(0, headPitch());
      forelockAngle += (target - forelockAngle) * Math.min(1, dt * 7);
      forelockBone.quaternion.copy(forelockRestQ);
      rotateBone(forelockBone, AX, forelockAngle);
    }
  };
  const apply = (elapsed: number, dt: number) => {
    overlayBones.forEach((b, i) => b.quaternion.copy(rest[i]!));
    B.head.position.copy(headRestPos);
    blend(dt);
    mixer.update(dt);
    overlay(elapsed);
    neckAndForelock(dt);
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
