import * as THREE from 'three';

/**
 * タップ（クリック）された3Dオブジェクトを調べる仕組み。
 * 指の下にある物を、手前から順にすべて返す（手前のユニットに隠れた奥のマスも選べるようにするため）。
 * 指を動かした場合はタップとみなさない（将来のドラッグ操作と区別するため）。
 */
export function onTapObject(
  canvas: HTMLCanvasElement,
  camera: () => THREE.Camera,
  targets: () => THREE.Object3D[],
  onHit: (objects: THREE.Object3D[]) => void,
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
    // 線（マスの縁取り）と、非表示の物は除く（Three.js の判定は非表示の物にも当たるため）
    const hits = raycaster
      .intersectObjects(targets(), true)
      .filter((h) => !(h.object instanceof THREE.LineSegments) && isShown(h.object));
    onHit(hits.map((h) => h.object));
  });
}

function isShown(object: THREE.Object3D): boolean {
  for (let o: THREE.Object3D | null = object; o; o = o.parent) {
    if (!o.visible) return false;
  }
  return true;
}
