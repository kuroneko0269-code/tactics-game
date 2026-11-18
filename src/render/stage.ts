import * as THREE from 'three';

/**
 * Three.js の基本セット（描画器・シーン・照明）を用意する。
 * 画面サイズが変わったら（スマホの縦横回転を含む）自動で追従する。
 */
export interface Stage {
  readonly renderer: THREE.WebGLRenderer;
  readonly scene: THREE.Scene;
  /** 空からの光（半球の光）と、日の光（影を落とす向きのある光）。場面の時刻で色と明るさを変える */
  readonly lights: { readonly hemi: THREE.HemisphereLight; readonly sun: THREE.DirectionalLight };
  /** 画面サイズが変わったときに呼ばれる処理を登録する */
  onResize(listener: (width: number, height: number) => void): void;
}

export function createStage(container: HTMLElement): Stage {
  const renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFShadowMap;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  container.appendChild(renderer.domElement);

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x9fc6e8);

  const hemi = new THREE.HemisphereLight(0xdfefff, 0x5a4a3a, 1.4);
  scene.add(hemi);
  const sun = new THREE.DirectionalLight(0xffffff, 2.2);
  sun.position.set(6, 12, 4);
  sun.castShadow = true;
  sun.shadow.mapSize.set(1024, 1024);
  sun.shadow.bias = -0.0005;
  const s = sun.shadow.camera;
  s.left = -8;
  s.right = 8;
  s.top = 8;
  s.bottom = -8;
  s.near = 1;
  s.far = 40;
  scene.add(sun);

  const listeners: ((w: number, h: number) => void)[] = [];
  const resize = () => {
    const w = container.clientWidth;
    const h = container.clientHeight;
    renderer.setSize(w, h);
    for (const l of listeners) l(w, h);
  };
  new ResizeObserver(resize).observe(container);
  resize();

  return {
    renderer,
    scene,
    lights: { hemi, sun },
    onResize(listener) {
      listeners.push(listener);
      listener(container.clientWidth, container.clientHeight);
    },
  };
}
