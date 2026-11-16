import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { createCameraRig, LANDSCAPE_ZOOM, NUDGE_MAX, PORTRAIT_ZOOM, ZOOM_MAX, ZOOM_MIN } from './cameraRig';

function makeRig(width = 800, height = 600) {
  const rig = createCameraRig({
    target: new THREE.Vector3(0, 0.8, 0),
    radius: 7,
    heightRange: 2.2,
    halfExtent: { x: 5, z: 5 },
  });
  rig.resize(width, height);
  return rig;
}

/** カメラが止まるまで進める */
function settle(rig: ReturnType<typeof makeRig>) {
  for (let i = 0; i < 600 && !rig.idle; i++) rig.update(1 / 60);
}

function screenOf(rig: ReturnType<typeof makeRig>, p: THREE.Vector3) {
  return p.clone().project(rig.camera);
}

describe('カメラ', () => {
  it('PC など大きな横長の画面は拡大率 1。スマホの縦向き・横向きは最初から拡大した状態', () => {
    expect(makeRig(800, 600).zoom).toBe(1);
    expect(makeRig(1280, 800).zoom).toBe(1);
    expect(makeRig(390, 844).zoom).toBe(PORTRAIT_ZOOM);
    expect(makeRig(844, 390).zoom).toBe(LANDSCAPE_ZOOM);
  });

  it('縦向きと横向きを切り替えると、その向きの初期の拡大率になる', () => {
    const rig = makeRig(390, 844);
    rig.resize(844, 390);
    expect(rig.zoom).toBe(LANDSCAPE_ZOOM);
    rig.resize(390, 844);
    expect(rig.zoom).toBe(PORTRAIT_ZOOM);
  });

  it('拡大・縮小には上限と下限がある', () => {
    const rig = makeRig();
    rig.zoomStep(50);
    settle(rig);
    expect(rig.zoom).toBe(ZOOM_MAX);
    expect(rig.camera.zoom).toBeCloseTo(ZOOM_MAX);
    rig.zoomAt(0.001, new THREE.Vector2(0, 0));
    expect(rig.zoom).toBe(ZOOM_MIN);
  });

  it('指の位置を中心に拡大すると、指の下の地面は動かない', () => {
    const rig = makeRig();
    const ndc = new THREE.Vector2(0.3, -0.2);
    const ray = new THREE.Raycaster();
    ray.setFromCamera(ndc, rig.camera);
    const before = ray.ray.intersectPlane(new THREE.Plane(new THREE.Vector3(0, 1, 0), -0.8), new THREE.Vector3())!;
    rig.zoomAt(1.5, ndc);
    const s = screenOf(rig, before);
    expect(s.x).toBeCloseTo(0.3);
    expect(s.y).toBeCloseTo(-0.2);
  });

  it('平行移動すると、つかんだ地面が指に付いてくる', () => {
    const rig = makeRig();
    rig.zoomAt(2, new THREE.Vector2(0, 0));
    const p = new THREE.Vector3(0, 0.8, 0);
    rig.pan(new THREE.Vector2(0, 0), new THREE.Vector2(0.2, 0.1));
    const s = screenOf(rig, p);
    expect(s.x).toBeCloseTo(0.2);
    expect(s.y).toBeCloseTo(0.1);
  });

  it('平行移動しても、マップの中心から離れすぎない（注視点はマップの範囲内）', () => {
    const rig = makeRig();
    rig.zoomAt(3, new THREE.Vector2(0, 0));
    for (let i = 0; i < 50; i++) rig.pan(new THREE.Vector2(-0.9, -0.9), new THREE.Vector2(0.9, 0.9));
    const center = screenOf(rig, new THREE.Vector3(0, 0.8, 0));
    // マップの中心はまだ画面の近くにある（端のマスは画面の中央付近まで来られる）
    const corner = [
      new THREE.Vector3(-5, 0.8, -5),
      new THREE.Vector3(5, 0.8, -5),
      new THREE.Vector3(-5, 0.8, 5),
      new THREE.Vector3(5, 0.8, 5),
    ].map((c) => screenOf(rig, c));
    expect(corner.some((c) => Math.abs(c.x) <= 1 && Math.abs(c.y) <= 1)).toBe(true);
    expect(Math.abs(center.x) + Math.abs(center.y)).toBeGreaterThan(0.5);
  });

  it('画面の外にある点へは寄せ、見えている点では動かない', async () => {
    const rig = makeRig();
    rig.zoomAt(3, new THREE.Vector2(0, 0));
    const near = new THREE.Vector3(0.2, 0.8, 0.2);
    let done = false;
    void rig.focusOn([near]).then(() => (done = true));
    await Promise.resolve();
    expect(done).toBe(true);

    const far = new THREE.Vector3(4.5, 1.6, 4.5);
    expect(Math.abs(screenOf(rig, far).x) > 1 || Math.abs(screenOf(rig, far).y) > 1).toBe(true);
    const focused = rig.focusOn([far]);
    expect(rig.idle).toBe(false);
    settle(rig);
    await focused;
    const s = screenOf(rig, far);
    expect(s.x).toBeCloseTo(0, 1);
    expect(s.y).toBeCloseTo(0, 1);
  });

  it('高さは3段階で切り替わり、高いほど真上に近くなる', () => {
    const rig = makeRig();
    const angle = () => {
      const dir = new THREE.Vector3();
      rig.camera.getWorldDirection(dir);
      return -dir.y; // 真下を向くと 1
    };
    expect(rig.heightLevel).toBe(1);
    const standard = angle();
    expect(rig.cycleHeight()).toBe(2);
    settle(rig);
    const high = angle();
    expect(rig.cycleHeight()).toBe(0);
    settle(rig);
    const low = angle();
    expect(high).toBeGreaterThan(standard);
    expect(standard).toBeGreaterThan(low);
  });

  it('視点を戻すと、拡大率と位置だけが最初の状態に戻り、回転と高さはそのまま', () => {
    const rig = makeRig(390, 844);
    rig.zoomAt(2, new THREE.Vector2(0.5, 0.5));
    rig.pan(new THREE.Vector2(0, 0), new THREE.Vector2(0.4, 0));
    rig.cycleHeight();
    rig.rotate(1);
    rig.reset();
    settle(rig);
    expect(rig.zoom).toBe(PORTRAIT_ZOOM);
    expect(rig.heightLevel).toBe(2);
    expect(rig.quarter).toBe(1);
    const s = screenOf(rig, new THREE.Vector3(0, 0.8, 0));
    expect(s.x).toBeCloseTo(0);
    expect(s.y).toBeCloseTo(0);
  });

  it('話者の強調: もとの視点から話者の方へ少しだけ寄せ（上限あり・拡大率は変えない）、null で戻す', () => {
    const rig = makeRig(390, 844);
    const center = new THREE.Vector3(0, 0.8, 0);
    void rig.lookAt(center, 1.2);
    settle(rig);
    const zoom = rig.zoom;
    const before = screenOf(rig, center);
    // 遠くの話者でも、寄せる量は上限まで
    rig.nudge(new THREE.Vector3(4, 0.8, 0));
    settle(rig);
    expect(rig.zoom).toBe(zoom);
    const moved = screenOf(rig, center);
    expect(moved.x).toBeLessThan(before.x);
    // 注視点の地面のずれは NUDGE_MAX 以下
    const target = new THREE.Vector3();
    rig.camera.getWorldDirection(target);
    const nudged = rig.camera.position.clone();
    rig.nudge(null);
    settle(rig);
    const back = screenOf(rig, center);
    expect(back.x).toBeCloseTo(before.x, 3);
    expect(back.y).toBeCloseTo(before.y, 3);
    expect(nudged.distanceTo(rig.camera.position)).toBeLessThanOrEqual(NUDGE_MAX + 1e-6);
    // 近くの話者には、距離の 1/4 だけ寄せる
    rig.nudge(new THREE.Vector3(0.4, 0.8, 0));
    settle(rig);
    const small = rig.camera.position.clone();
    rig.nudge(null);
    settle(rig);
    expect(small.distanceTo(rig.camera.position)).toBeCloseTo(0.1, 3);
  });

  it('秒を指定した lookAt は、その時間をかけて動き、途中は動いている扱い', () => {
    const rig = makeRig(800, 600);
    void rig.lookAt(new THREE.Vector3(3, 0.8, 3), 1.5, 2);
    for (let i = 0; i < 60; i++) rig.update(1 / 60);
    expect(rig.idle).toBe(false);
    const half = screenOf(rig, new THREE.Vector3(3, 0.8, 3));
    expect(Math.abs(half.x) + Math.abs(half.y)).toBeGreaterThan(0.01);
    for (let i = 0; i < 70; i++) rig.update(1 / 60);
    settle(rig);
    expect(rig.idle).toBe(true);
    const end = screenOf(rig, new THREE.Vector3(3, 0.8, 3));
    expect(end.x).toBeCloseTo(0, 3);
    expect(end.y).toBeCloseTo(0, 3);
  });
});
