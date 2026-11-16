import * as THREE from 'three';

/**
 * 話者の印: 会話で台詞が出ている間、マップ上の話している人形の頭上に出す小さな印（下向きの三角）。
 * 位置は毎フレーム、人形の頭の位置を聞き直す（歩いている人物にもついていく）。ほかの人形は動かさない。
 */
export interface SpeakerMark {
  /** 印を付ける先（頭の上の位置を返す関数）。null で隠す */
  setTarget(headOf: (() => THREE.Vector3 | undefined) | null): void;
  /** 今印が見えているか（自動テスト用） */
  readonly visible: boolean;
  update(elapsedSeconds: number): void;
  dispose(): void;
}

export function createSpeakerMark(scene: THREE.Scene): SpeakerMark {
  const group = new THREE.Group();
  const material = new THREE.MeshBasicMaterial({ color: 0xffd65a, depthTest: false, transparent: true, opacity: 0.95 });
  const cone = new THREE.Mesh(new THREE.ConeGeometry(0.075, 0.14, 4), material);
  cone.rotation.x = Math.PI; // 先を下に向ける
  cone.renderOrder = 10;
  const rim = new THREE.Mesh(new THREE.ConeGeometry(0.095, 0.17, 4), new THREE.MeshBasicMaterial({ color: 0x3a2a10, depthTest: false, transparent: true, opacity: 0.6 }));
  rim.rotation.x = Math.PI;
  rim.renderOrder = 9;
  group.add(rim, cone);
  // タップの判定に入れない
  group.traverse((o) => (o.raycast = () => {}));
  group.visible = false;
  scene.add(group);
  let target: (() => THREE.Vector3 | undefined) | null = null;
  return {
    setTarget(headOf) {
      target = headOf;
      if (!headOf) group.visible = false;
    },
    get visible() {
      return group.visible;
    },
    update(elapsed) {
      const p = target?.();
      group.visible = p !== undefined;
      if (!p) return;
      // ゆっくり上下に揺れ、少し回る（控えめに）
      group.position.set(p.x, p.y + 0.16 + Math.sin(elapsed * 3) * 0.03, p.z);
      group.rotation.y = elapsed * 1.2;
    },
    dispose() {
      scene.remove(group);
    },
  };
}

/** 人形（グループ）の頭の上の位置。見た目の大きさから求める（人物ごとの背の高さ・座った姿勢に合う） */
export function headTop(object: THREE.Object3D): THREE.Vector3 | undefined {
  if (!object.visible) return undefined;
  const box = new THREE.Box3().setFromObject(object);
  if (box.isEmpty()) return undefined;
  return new THREE.Vector3(object.position.x, box.max.y, object.position.z);
}
