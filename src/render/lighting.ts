import * as THREE from 'three';
import type { TimeLighting } from '../data/lighting';

/**
 * 場面の時刻の光を当てる（空の色・空からの光・日の光）。sky を渡すと、空の色だけはそれにする（夜空のマップなど、マップが決めた空の色）。
 * ambient は室内の明るさの割合（空からの光と日の光を弱め、灯の光を引き立てる。省くと 1）
 */
export function applyLighting(
  scene: THREE.Scene,
  lights: { readonly hemi: THREE.HemisphereLight; readonly sun: THREE.DirectionalLight },
  light: TimeLighting,
  sky?: number,
  ambient = 1,
): void {
  scene.background = new THREE.Color(sky ?? light.sky);
  lights.hemi.color.setHex(light.hemiSky);
  lights.hemi.groundColor.setHex(light.hemiGround);
  lights.hemi.intensity = light.hemiIntensity * ambient;
  lights.sun.color.setHex(light.sunColor);
  lights.sun.intensity = light.sunIntensity * ambient;
  // 室内（ambient が 1 より小さい）では、日の光の影を落とさない（灯の影だけにする。影の計算を減らしてスマホで軽くするため）
  lights.sun.castShadow = ambient >= 1;
}
