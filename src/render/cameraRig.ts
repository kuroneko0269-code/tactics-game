import * as THREE from 'three';

/**
 * 斜め上からマップを見下ろすカメラ。
 * 平行投影（遠近感のない投影。タクティクスRPGでよく使われる見え方）で、次の操作ができる。
 * - 90度ずつの回転
 * - 拡大・縮小（上限と下限あり）
 * - 視点の平行移動（注視点がマップの外に出ないように制限）
 * - カメラの高さの3段階切り替え（高いほど真上に近い見下ろし）
 * - 指定した場所が画面の外にある時に、そこへ滑らかに寄せる
 *
 * 指で直接動かす操作（ドラッグ・ピンチ・ホイール）はすぐに反映し、
 * ボタンや自動で寄せる動きは、短い時間をかけて滑らかに動かす。
 */
export interface CameraRig {
  readonly camera: THREE.OrthographicCamera;
  /** 1 で時計回り、-1 で反時計回りに 90 度回す */
  rotate(direction: 1 | -1): void;
  /** 現在の向き（0〜3） */
  readonly quarter: number;
  /** ボタン用。画面の中央を中心に、steps 段だけ拡大（負なら縮小）する */
  zoomStep(steps: number): void;
  /** 指・ホイール用。画面上の点（NDC: 左下 -1,-1 〜 右上 1,1）を中心に scale 倍に拡大する */
  zoomAt(scale: number, ndc: THREE.Vector2): void;
  /** 指・マウス用。画面上の点 from にあった地面が to に来るように平行移動する（NDC） */
  pan(from: THREE.Vector2, to: THREE.Vector2): void;
  /** カメラの高さを次の段階へ（低い → 標準 → 高い → 低い）。新しい段階を返す */
  cycleHeight(): HeightLevel;
  readonly heightLevel: HeightLevel;
  /** 拡大率（1 でマップ全体が収まる大きさ） */
  readonly zoom: number;
  /** 拡大・平行移動・高さを最初の状態に戻す（回転はそのまま） */
  reset(): void;
  /**
   * 指定した点がすべて画面の見やすい範囲に入っていなければ、それらの中心へ滑らかに寄せる。
   * カメラが止まったら解決する Promise を返す（動かす必要がなければすぐに解決する）。
   */
  focusOn(points: readonly THREE.Vector3[]): Promise<void>;
  /** カメラが動いていないか */
  readonly idle: boolean;
  /** 毎フレーム呼ぶ。経過秒を渡す */
  update(deltaSeconds: number): void;
  resize(width: number, height: number): void;
}

export type HeightLevel = 0 | 1 | 2;

export interface CameraRigOptions {
  /** マップの中心 */
  target: THREE.Vector3;
  /** マップ全体が収まるための水平方向の半径 */
  radius: number;
  /** マップの高低差（ワールド座標での高さ） */
  heightRange: number;
  /** 注視点を動かせる範囲（マップの中心からの、横と奥行きの半分の長さ） */
  halfExtent: { x: number; z: number };
}

/** カメラの高さ（見下ろす角度）。低い・標準・高い */
export const HEIGHT_ANGLES_DEG: readonly [number, number, number] = [22, 32, 56];
const DEFAULT_HEIGHT: HeightLevel = 1;
/** 拡大率の下限と上限（1 でマップ全体が収まる） */
export const ZOOM_MIN = 0.8;
export const ZOOM_MAX = 4;
/** ボタン1回ぶんの拡大率 */
const ZOOM_STEP = 1.35;
/** 縦長の画面（スマホ縦向き）の初期の拡大率。マップ全体は入らないが、マスが大きく見える */
export const PORTRAIT_ZOOM = 1.8;
const DISTANCE = 40;
const ROTATE_SECONDS = 0.35;
/** 滑らかに寄せる速さ（大きいほど速い） */
const SMOOTHING = 9;
/**
 * 「見やすい範囲」（NDC）。画面の上下にある情報欄やボタンに隠れにくい範囲。
 * この外にある時だけ、自動でカメラを寄せる。
 */
const SAFE_BOX = { left: -0.72, right: 0.72, bottom: -0.45, top: 0.42 };

export function createCameraRig(options: CameraRigOptions): CameraRig {
  const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 100);
  const raycaster = new THREE.Raycaster();
  const ground = new THREE.Plane(new THREE.Vector3(0, 1, 0), -options.target.y);
  let aspect = 1;
  let portrait = false;
  let sized = false;

  let quarter = 0;
  let azimuth = azimuthOf(quarter);
  let fromAzimuth = azimuth;
  let toAzimuth = azimuth;
  let rotateT = 1;

  let heightLevel: HeightLevel = DEFAULT_HEIGHT;
  let elevation = degToRad(HEIGHT_ANGLES_DEG[heightLevel]);
  let goalElevation = elevation;

  const initialZoom = () => (portrait ? PORTRAIT_ZOOM : 1);
  let zoom = 1;
  let goalZoom = 1;
  /** 注視点の、マップの中心からのずれ（x, z） */
  const pan = new THREE.Vector2();
  const goalPan = new THREE.Vector2();

  let waiters: (() => void)[] = [];

  const clampZoom = (z: number) => THREE.MathUtils.clamp(z, ZOOM_MIN, ZOOM_MAX);
  const clampPan = (p: THREE.Vector2) =>
    p.set(
      THREE.MathUtils.clamp(p.x, -options.halfExtent.x, options.halfExtent.x),
      THREE.MathUtils.clamp(p.y, -options.halfExtent.z, options.halfExtent.z),
    );

  /** 今の値でカメラを置き直す */
  const place = () => {
    const target = new THREE.Vector3(options.target.x + pan.x, options.target.y, options.target.z + pan.y);
    const horizontal = DISTANCE * Math.cos(elevation);
    camera.position.set(
      target.x + horizontal * Math.sin(azimuth),
      target.y + DISTANCE * Math.sin(elevation),
      target.z + horizontal * Math.cos(azimuth),
    );
    camera.lookAt(target);
    // マップ全体が収まる大きさを基準にし、そこから zoom 倍に拡大する
    const margin = 0.6;
    const halfWidthNeeded = options.radius + margin;
    const halfHeightNeeded =
      options.radius * Math.sin(elevation) + options.heightRange * Math.cos(elevation) * 0.6 + margin + 0.8;
    const halfHeight = Math.max(halfHeightNeeded, halfWidthNeeded / aspect);
    camera.top = halfHeight;
    camera.bottom = -halfHeight;
    camera.left = -halfHeight * aspect;
    camera.right = halfHeight * aspect;
    camera.zoom = zoom;
    camera.updateProjectionMatrix();
    camera.updateMatrixWorld();
  };

  /** 画面上の点（NDC）の下にある地面（注視点と同じ高さの平面）の位置 */
  const groundAt = (ndc: THREE.Vector2): THREE.Vector3 | undefined => {
    raycaster.setFromCamera(ndc, camera);
    return raycaster.ray.intersectPlane(ground, new THREE.Vector3()) ?? undefined;
  };

  /** 指で直接動かした時は、滑らかに寄せる途中の動きをやめて、その場で止める */
  const settleGoals = () => {
    goalZoom = zoom;
    goalPan.copy(pan);
  };

  const isIdle = () =>
    rotateT >= 1 &&
    Math.abs(goalElevation - elevation) < 1e-4 &&
    Math.abs(goalZoom - zoom) < 1e-4 &&
    goalPan.distanceTo(pan) < 1e-4;

  const flushWaiters = () => {
    if (!isIdle() || waiters.length === 0) return;
    const list = waiters;
    waiters = [];
    for (const w of list) w();
  };

  place();

  const rig: CameraRig = {
    camera,
    get quarter() {
      return quarter;
    },
    get heightLevel() {
      return heightLevel;
    },
    get zoom() {
      return goalZoom;
    },
    get idle() {
      return isIdle();
    },
    rotate(direction) {
      quarter = (quarter + direction + 4) % 4;
      fromAzimuth = azimuth;
      toAzimuth += direction * (Math.PI / 2);
      rotateT = 0;
    },
    zoomStep(steps) {
      goalZoom = clampZoom(goalZoom * Math.pow(ZOOM_STEP, steps));
    },
    zoomAt(scale, ndc) {
      settleGoals();
      const before = groundAt(ndc);
      zoom = clampZoom(zoom * scale);
      place();
      const after = groundAt(ndc);
      // 指の下の地面が動かないように、拡大した分だけ注視点をずらす
      if (before && after) pan.add(new THREE.Vector2(before.x - after.x, before.z - after.z));
      clampPan(pan);
      settleGoals();
      place();
    },
    pan(from, to) {
      settleGoals();
      const a = groundAt(from);
      const b = groundAt(to);
      if (!a || !b) return;
      clampPan(pan.add(new THREE.Vector2(a.x - b.x, a.z - b.z)));
      settleGoals();
      place();
    },
    cycleHeight() {
      heightLevel = ((heightLevel + 1) % 3) as HeightLevel;
      goalElevation = degToRad(HEIGHT_ANGLES_DEG[heightLevel]);
      return heightLevel;
    },
    reset() {
      goalZoom = initialZoom();
      goalPan.set(0, 0);
      heightLevel = DEFAULT_HEIGHT;
      goalElevation = degToRad(HEIGHT_ANGLES_DEG[heightLevel]);
    },
    focusOn(points) {
      if (points.length > 0 && !points.every((p) => inSafeBox(p))) {
        // 点の中心が画面の中央に来る注視点を求める（高さのある点は、視線に沿って地面の高さまで下ろす）
        const forward = new THREE.Vector3(
          -Math.cos(goalElevation) * Math.sin(toAzimuth),
          -Math.sin(goalElevation),
          -Math.cos(goalElevation) * Math.cos(toAzimuth),
        );
        const center = points.reduce((sum, p) => sum.add(p), new THREE.Vector3()).divideScalar(points.length);
        const t = (options.target.y - center.y) / forward.y;
        const onGround = center.addScaledVector(forward, t);
        clampPan(goalPan.set(onGround.x - options.target.x, onGround.z - options.target.z));
      }
      return new Promise<void>((resolve) => {
        waiters.push(resolve);
        flushWaiters();
      });
    },
    update(dt) {
      if (rotateT < 1) {
        rotateT = Math.min(1, rotateT + dt / ROTATE_SECONDS);
        const eased = 1 - Math.pow(1 - rotateT, 3);
        azimuth = fromAzimuth + (toAzimuth - fromAzimuth) * eased;
      }
      const k = 1 - Math.exp(-SMOOTHING * dt);
      const approach = (v: number, goal: number, eps: number) => (Math.abs(goal - v) < eps ? goal : v + (goal - v) * k);
      elevation = approach(elevation, goalElevation, 1e-3);
      zoom = approach(zoom, goalZoom, 1e-3);
      pan.set(approach(pan.x, goalPan.x, 2e-3), approach(pan.y, goalPan.y, 2e-3));
      place();
      flushWaiters();
    },
    resize(width, height) {
      aspect = width / Math.max(height, 1);
      const wasPortrait = portrait;
      portrait = aspect < 0.8;
      // 最初の表示と、縦横が入れ替わった時は、その向きの初期の拡大率にする
      if (width > 0 && height > 0 && (!sized || wasPortrait !== portrait)) {
        sized = true;
        zoom = goalZoom = initialZoom();
      }
      place();
    },
  };

  /** 点が「見やすい範囲」に入っているか（滑らかに動いている途中なら、動き終わった時の位置で調べる） */
  function inSafeBox(p: THREE.Vector3): boolean {
    const saved = { zoom, elevation, x: pan.x, z: pan.y, azimuth };
    zoom = goalZoom;
    elevation = goalElevation;
    pan.copy(goalPan);
    azimuth = toAzimuth;
    place();
    const s = p.clone().project(camera);
    zoom = saved.zoom;
    elevation = saved.elevation;
    pan.set(saved.x, saved.z);
    azimuth = saved.azimuth;
    place();
    return s.x >= SAFE_BOX.left && s.x <= SAFE_BOX.right && s.y >= SAFE_BOX.bottom && s.y <= SAFE_BOX.top;
  }

  return rig;
}

function azimuthOf(quarter: number): number {
  return Math.PI / 4 + quarter * (Math.PI / 2);
}

function degToRad(deg: number): number {
  return THREE.MathUtils.degToRad(deg);
}
