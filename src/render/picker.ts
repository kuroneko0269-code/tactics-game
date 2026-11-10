import * as THREE from 'three';

/**
 * 画面上の点の下にある3Dオブジェクトを調べる仕組み。
 * 指の下にある物を、手前から順にすべて返す（当たった面と点を含む）。どれを選ぶかは tapJudge.ts の規則で決める。
 * タップかどうかの判断は gesture.ts が行い、タップと決まった時だけここで調べる。
 */
export function createPicker(canvas: HTMLCanvasElement, camera: () => THREE.Camera, targets: () => THREE.Object3D[]) {
  const raycaster = new THREE.Raycaster();
  const pointer = new THREE.Vector2();
  return (clientX: number, clientY: number): THREE.Intersection[] => {
    const rect = canvas.getBoundingClientRect();
    pointer.set(((clientX - rect.left) / rect.width) * 2 - 1, -((clientY - rect.top) / rect.height) * 2 + 1);
    raycaster.setFromCamera(pointer, camera());
    // 線（マスの縁取り）と、非表示の物は除く（Three.js の判定は非表示の物にも当たるため）
    return raycaster
      .intersectObjects(targets(), true)
      .filter((h) => !(h.object instanceof THREE.LineSegments) && isShown(h.object));
  };
}

function isShown(object: THREE.Object3D): boolean {
  for (let o: THREE.Object3D | null = object; o; o = o.parent) {
    if (!o.visible) return false;
  }
  return true;
}
