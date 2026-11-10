import * as THREE from 'three';
import type { CameraRig } from './cameraRig';
import { createGestureTracker, type GestureEvent, type Point } from './gesture';

/**
 * 画面（キャンバス）への指・マウスの操作を、カメラの操作とタップに振り分ける。
 * - 1本指のドラッグ / マウスのドラッグ: 平行移動
 * - 2本指のピンチ / マウスホイール: 拡大・縮小
 * - ほとんど動かさずに離した時だけ: タップ（onTap に画面座標を渡す）
 */
export function attachCameraInput(canvas: HTMLCanvasElement, rig: CameraRig, onTap: (clientX: number, clientY: number) => void) {
  const tracker = createGestureTracker();

  const ndc = (p: Point) => {
    const rect = canvas.getBoundingClientRect();
    return new THREE.Vector2(((p.x - rect.left) / rect.width) * 2 - 1, -((p.y - rect.top) / rect.height) * 2 + 1);
  };
  const handle = (events: GestureEvent[]) => {
    for (const e of events) {
      if (e.type === 'tap') onTap(e.at.x, e.at.y);
      else if (e.type === 'pan') rig.pan(ndc(e.from), ndc(e.to));
      else rig.zoomAt(e.scale, ndc(e.center));
    }
  };
  const at = (e: MouseEvent): Point => ({ x: e.clientX, y: e.clientY });

  canvas.addEventListener('pointerdown', (e) => {
    // マウスは左ボタンだけ（右クリックなどは無視）
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    canvas.setPointerCapture?.(e.pointerId);
    handle(tracker.down(e.pointerId, at(e)));
  });
  canvas.addEventListener('pointermove', (e) => handle(tracker.move(e.pointerId, at(e))));
  canvas.addEventListener('pointerup', (e) => handle(tracker.up(e.pointerId, at(e))));
  canvas.addEventListener('pointercancel', (e) => handle(tracker.cancel(e.pointerId)));
  canvas.addEventListener(
    'wheel',
    (e) => {
      e.preventDefault();
      // 1回の回転（約100）で約1.2倍。トラックパッドの細かい動きにも追従する
      const delta = e.deltaMode === 1 ? e.deltaY * 33 : e.deltaY;
      rig.zoomAt(Math.exp(-delta * 0.0018), ndc(at(e)));
    },
    { passive: false },
  );
  canvas.addEventListener('contextmenu', (e) => e.preventDefault());
}
