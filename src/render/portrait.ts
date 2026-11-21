import * as THREE from 'three';
import { createPuppet, type Puppet, type PuppetLook } from './puppet';

/**
 * 会話の枠の「顔の枠」: 話している人物の人形を、マップとは別の小さな舞台に置き、別のカメラで胸から上を写す。
 * 絵のファイルは使わない。人形はマップと同じ createPuppet で作るので、後で人形を作り込んだ 3D モデルに差し替えると、
 * 顔の枠も自動で変わる。マップにいない人物（声だけ など）も、見た目さえ引ければ写せる。
 *
 * 描画器（WebGL）は、マップの描画器とは別に1つだけ作る（小さな canvas）。
 * 話者が変わった時だけ描く（毎フレームは描かない。スマホとソフトウェア描画で重くしないため）。
 */
export interface PortraitRenderer {
  /** 顔の枠に入れる canvas */
  readonly canvas: HTMLCanvasElement;
  /** その人物を写す（同じ人物なら描き直さない）。null で消す */
  show(name: string | null): void;
  /** 今写している人物（自動テスト用） */
  readonly current: string | null;
  dispose(): void;
}

/** canvas の画素の大きさ（CSS の大きさは style.css。画素の密度 2 までを見込む） */
const PIXELS = 192;

export function createPortraitRenderer(lookOf: (name: string) => PuppetLook): PortraitRenderer {
  const canvas = document.createElement('canvas');
  canvas.width = PIXELS;
  canvas.height = PIXELS;
  canvas.className = 'portrait-canvas';
  let renderer: THREE.WebGLRenderer | undefined;
  const scene = new THREE.Scene();
  // 灯のような暖かい光を斜め前から当て、反対側は濃紺の空の光で淡く起こす（顔の丸の中で、やわらかい陰影が出るように）
  scene.add(new THREE.HemisphereLight(0xc8d4ff, 0x4a3a30, 1.3));
  const key = new THREE.DirectionalLight(0xffe2bc, 2.4);
  key.position.set(1.2, 1.4, 2.4);
  scene.add(key);
  const camera = new THREE.PerspectiveCamera(26, 1, 0.05, 20);
  const puppets = new Map<string, Puppet>();
  let current: string | null = null;

  const ensureRenderer = () => {
    if (renderer) return renderer;
    renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, preserveDrawingBuffer: true });
    renderer.setPixelRatio(1);
    renderer.setSize(PIXELS, PIXELS, false);
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.setClearColor(0x000000, 0);
    return renderer;
  };

  const puppetOf = (name: string) => {
    let p = puppets.get(name);
    if (!p) {
      p = createPuppet(lookOf(name));
      // 少し斜め（向かって左を向く）にして、顔と体の形が分かるようにする
      p.setYaw(0.42);
      p.update(0);
      puppets.set(name, p);
    }
    return p;
  };

  return {
    canvas,
    get current() {
      return current;
    },
    show(name) {
      if (name === current) return;
      current = name;
      for (const p of puppets.values()) scene.remove(p.group);
      if (name === null) return;
      const puppet = puppetOf(name);
      scene.add(puppet.group);
      // 人形の大きさから、胸から上が収まるようにカメラを置く（背の高さが違っても同じ写り方になる）
      const box = new THREE.Box3().setFromObject(puppet.group);
      const top = box.max.y;
      // 丸い枠なので、頭のてっぺんに余白を残し、肩までを入れる
      const chest = top * 0.5;
      const center = new THREE.Vector3(0, (top + chest) / 2 - 0.005, 0);
      const span = (top - chest) * 1.32;
      const distance = span / 2 / Math.tan(THREE.MathUtils.degToRad(camera.fov / 2));
      camera.position.set(0.12 * distance, center.y + 0.06, distance);
      camera.lookAt(center);
      try {
        ensureRenderer().render(scene, camera);
      } catch {
        // WebGL が使えない時は、顔の枠を空のままにする（名前の札は出る）
      }
    },
    dispose() {
      renderer?.dispose();
      renderer = undefined;
    },
  };
}
