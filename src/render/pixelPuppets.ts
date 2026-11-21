import * as THREE from 'three';
import { setOutlineScale } from './puppet';

/**
 * ドット風の描き方（見た目の見本の2回目。確認用の機能が入の時だけ、設定で選べる）。
 * 人物だけを低い解像度で描いてから、にじませずに拡大して重ね、くっきりした点の絵のように見せる。背景と文字は今の解像度のまま。
 *
 * 1. 画面に、背景だけを描く（人物は色も奥行きも書かずに素通りさせる。影を落とす計算には人物も入る）
 * 2. 小さな画（画面の 1/PIXEL）に、背景の奥行きだけを書いてから人物を描く（壁や家具の後ろの人物は隠れる）
 * 3. 小さな画を、点を補わずに画面いっぱいへ拡大して重ねる
 */
/** 点の大きさ（画面の CSS の画素で） */
const PIXEL = 3;
/** 小さな画で、輪郭線を太くする割合（線が1点より細くなって途切れないように） */
const OUTLINE_SCALE = 1.5;

export interface PixelPuppets {
  render(scene: THREE.Scene, camera: THREE.Camera): void;
  dispose(): void;
}

type Drawn = THREE.Mesh | THREE.Line | THREE.Points | THREE.Sprite;

export function createPixelPuppets(renderer: THREE.WebGLRenderer): PixelPuppets {
  const target = new THREE.WebGLRenderTarget(1, 1, { minFilter: THREE.NearestFilter, magFilter: THREE.NearestFilter, depthBuffer: true, generateMipmaps: false });
  const quadScene = new THREE.Scene();
  const quadCamera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  const quad = new THREE.Mesh(
    new THREE.PlaneGeometry(2, 2),
    new THREE.MeshBasicMaterial({ map: target.texture, transparent: true, depthTest: false, depthWrite: false, premultipliedAlpha: true }),
  );
  quadScene.add(quad);
  const size = new THREE.Vector2();
  const clear = new THREE.Color();

  const materialsOf = (o: Drawn): THREE.Material[] => (Array.isArray(o.material) ? o.material : [o.material]);

  return {
    render(scene, camera) {
      // 人物（人形の印のあるグループの中）と、それ以外に分ける
      const puppetSet = new Set<THREE.Object3D>();
      scene.traverse((o) => {
        if (o.userData.puppet) o.traverse((c) => puppetSet.add(c));
      });
      const puppets: THREE.Material[] = [];
      const others: THREE.Material[] = [];
      scene.traverseVisible((o) => {
        const d = o as Drawn;
        if (!(d as THREE.Mesh).isMesh && !(d as THREE.Line).isLine && !(d as THREE.Points).isPoints && !(d as THREE.Sprite).isSprite) return;
        (puppetSet.has(o) ? puppets : others).push(...materialsOf(d));
      });
      const saved = new Map<THREE.Material, [boolean, boolean]>();
      for (const m of [...puppets, ...others]) if (!saved.has(m)) saved.set(m, [m.colorWrite, m.depthWrite]);

      // 1. 背景だけを画面に描く
      for (const m of puppets) {
        m.colorWrite = false;
        m.depthWrite = false;
      }
      renderer.render(scene, camera);
      for (const [m, [c, d]] of saved) {
        m.colorWrite = c;
        m.depthWrite = d;
      }

      // 2. 小さな画に、背景の奥行きと人物を描く
      renderer.getSize(size);
      const w = Math.max(1, Math.round(size.x / PIXEL));
      const h = Math.max(1, Math.round(size.y / PIXEL));
      if (target.width !== w || target.height !== h) target.setSize(w, h);
      for (const m of others) m.colorWrite = false;
      const background = scene.background;
      const autoShadow = renderer.shadowMap.autoUpdate;
      renderer.getClearColor(clear);
      const clearAlpha = renderer.getClearAlpha();
      scene.background = null;
      renderer.shadowMap.autoUpdate = false;
      setOutlineScale(OUTLINE_SCALE);
      renderer.setRenderTarget(target);
      renderer.setClearColor(0x000000, 0);
      renderer.clear();
      renderer.render(scene, camera);
      renderer.setRenderTarget(null);
      setOutlineScale(1);
      renderer.setClearColor(clear, clearAlpha);
      renderer.shadowMap.autoUpdate = autoShadow;
      scene.background = background;
      for (const [m, [c, d]] of saved) {
        m.colorWrite = c;
        m.depthWrite = d;
      }

      // 3. 拡大して重ねる
      const autoClear = renderer.autoClear;
      renderer.autoClear = false;
      renderer.render(quadScene, quadCamera);
      renderer.autoClear = autoClear;
    },
    dispose() {
      target.dispose();
      quad.geometry.dispose();
      (quad.material as THREE.Material).dispose();
    },
  };
}
