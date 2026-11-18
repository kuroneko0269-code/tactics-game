import * as THREE from 'three';
import type { TimeLighting } from '../data/lighting';

/**
 * 場面の時刻の光を当てる（空の色・空からの光・日の光）。sky を渡すと、空の色だけはそれにする（夜空のマップなど、マップが決めた空の色）
 */
export function applyLighting(
  scene: THREE.Scene,
  lights: { readonly hemi: THREE.HemisphereLight; readonly sun: THREE.DirectionalLight },
  light: TimeLighting,
  sky?: number,
): void {
  scene.background = new THREE.Color(sky ?? light.sky);
  lights.hemi.color.setHex(light.hemiSky);
  lights.hemi.groundColor.setHex(light.hemiGround);
  lights.hemi.intensity = light.hemiIntensity;
  lights.sun.color.setHex(light.sunColor);
  lights.sun.intensity = light.sunIntensity;
}
