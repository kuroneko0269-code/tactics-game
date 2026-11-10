import * as THREE from 'three';

/**
 * 斜め上からマップを見下ろすカメラ。
 * 平行投影（遠近感のない投影。タクティクスRPGでよく使われる見え方）で、
 * 90度ずつ回転できる。回転は短いアニメーションで滑らかに行う。
 */
export interface CameraRig {
  readonly camera: THREE.OrthographicCamera;
  /** 1 で時計回り、-1 で反時計回りに 90 度回す */
  rotate(direction: 1 | -1): void;
  /** 現在の向き（0〜3） */
  readonly quarter: number;
  /** 毎フレーム呼ぶ。経過秒を渡す */
  update(deltaSeconds: number): void;
  resize(width: number, height: number): void;
}

export interface CameraRigOptions {
  /** 注視点（マップの中心） */
  target: THREE.Vector3;
  /** マップ全体が収まるための水平方向の半径 */
  radius: number;
  /** マップの高低差（ワールド座標での高さ） */
  heightRange: number;
}

const ELEVATION = THREE.MathUtils.degToRad(32);
const DISTANCE = 40;
const ROTATE_SECONDS = 0.35;

export function createCameraRig(options: CameraRigOptions): CameraRig {
  const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 100);
  let quarter = 0;
  let azimuth = azimuthOf(quarter);
  let fromAzimuth = azimuth;
  let toAzimuth = azimuth;
  let t = 1;

  const place = () => {
    const horizontal = DISTANCE * Math.cos(ELEVATION);
    camera.position.set(
      options.target.x + horizontal * Math.sin(azimuth),
      options.target.y + DISTANCE * Math.sin(ELEVATION),
      options.target.z + horizontal * Math.cos(azimuth),
    );
    camera.lookAt(options.target);
  };
  place();

  return {
    camera,
    get quarter() {
      return quarter;
    },
    rotate(direction) {
      quarter = (quarter + direction + 4) % 4;
      fromAzimuth = azimuth;
      toAzimuth += direction * (Math.PI / 2);
      t = 0;
    },
    update(dt) {
      if (t >= 1) return;
      t = Math.min(1, t + dt / ROTATE_SECONDS);
      const eased = 1 - Math.pow(1 - t, 3);
      azimuth = fromAzimuth + (toAzimuth - fromAzimuth) * eased;
      place();
    },
    resize(width, height) {
      const aspect = width / Math.max(height, 1);
      const margin = 0.6;
      const halfWidthNeeded = options.radius + margin;
      const halfHeightNeeded =
        options.radius * Math.sin(ELEVATION) + options.heightRange * Math.cos(ELEVATION) * 0.6 + margin + 0.8;
      const halfHeight = Math.max(halfHeightNeeded, halfWidthNeeded / aspect);
      camera.top = halfHeight;
      camera.bottom = -halfHeight;
      camera.left = -halfHeight * aspect;
      camera.right = halfHeight * aspect;
      camera.updateProjectionMatrix();
    },
  };
}

function azimuthOf(quarter: number): number {
  return Math.PI / 4 + quarter * (Math.PI / 2);
}
