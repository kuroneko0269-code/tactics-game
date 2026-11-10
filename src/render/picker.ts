import * as THREE from 'three';

/**
 * タップ（クリック）された3Dオブジェクトを調べる仕組み。
 * 指を動かした場合はタップとみなさない（将来のドラッグ操作と区別するため）。
 */
export function onTapObject(
  canvas: HTMLCanvasElement,
  camera: () => THREE.Camera,
  targets: () => THREE.Object3D[],
  onHit: (object: THREE.Object3D | undefined) => void,
): void {
  const raycaster = new THREE.Raycaster();
  const pointer = new THREE.Vector2();
  const TAP_MAX_MOVE_PX = 10;
  let down: { x: number; y: number; id: number } | undefined;

  canvas.addEventListener('pointerdown', (e) => {
    if (!e.isPrimary) return;
    down = { x: e.clientX, y: e.clientY, id: e.pointerId };
  });
  canvas.addEventListener('pointercancel', () => {
    down = undefined;
  });
  canvas.addEventListener('pointerup', (e) => {
    if (!down || down.id !== e.pointerId) return;
    const moved = Math.hypot(e.clientX - down.x, e.clientY - down.y);
    down = undefined;
    if (moved > TAP_MAX_MOVE_PX) return;

    const rect = canvas.getBoundingClientRect();
    pointer.set(((e.clientX - rect.left) / rect.width) * 2 - 1, -((e.clientY - rect.top) / rect.height) * 2 + 1);
    raycaster.setFromCamera(pointer, camera());
    const hit = raycaster.intersectObjects(targets(), true).find((h) => !(h.object instanceof THREE.LineSegments));
    onHit(hit?.object);
  });
}
