import './ui/style.css';
import * as THREE from 'three';
import { createMap, getTile } from './core/map';
import { testMap } from './data/maps/testMap';
import { testUnits } from './data/units';
import { createStage } from './render/stage';
import { createCameraRig } from './render/cameraRig';
import { createMapView, type TileCoord } from './render/mapView';
import { createPuppet } from './render/puppet';
import { onTapObject } from './render/picker';
import { createHud } from './ui/hud';

/**
 * 動作確認用の画面。
 * マップ・カメラ・仮の人形・HUD を組み立てて、タップでマスを選択できるようにする。
 */
function main(): void {
  const stageEl = document.getElementById('stage');
  const hudEl = document.getElementById('hud');
  if (!stageEl || !hudEl) throw new Error('#stage または #hud が見つかりません');

  const map = createMap(testMap);
  const stage = createStage(stageEl);

  const mapView = createMapView(map);
  stage.scene.add(mapView.group);

  const puppets = testUnits.map((unit) => {
    const puppet = createPuppet(unit.colors);
    puppet.group.position.copy(mapView.tileTop(unit.x, unit.z));
    puppet.setFacing(unit.facing);
    // 人形をタップしても、立っているマスを選択したことにする
    puppet.group.userData.tileCoord = { x: unit.x, z: unit.z } satisfies TileCoord;
    stage.scene.add(puppet.group);
    return { unit, puppet };
  });

  const rig = createCameraRig({
    target: mapView.center,
    radius: mapView.radius,
    heightRange: mapView.heightRange,
  });
  stage.onResize((w, h) => rig.resize(w, h));

  const select = (coord: TileCoord | undefined) => {
    mapView.setSelected(coord);
    const tile = coord ? getTile(map, coord.x, coord.z) : undefined;
    const unit = coord ? testUnits.find((u) => u.x === coord.x && u.z === coord.z) : undefined;
    hud.showSelection(tile, unit?.name);
  };

  const hud = createHud(hudEl, map.name, { onRotate: (d) => rig.rotate(d) });

  onTapObject(
    stage.renderer.domElement,
    () => rig.camera,
    () => [mapView.group, ...puppets.map((p) => p.puppet.group)],
    (object) => select(object ? mapView.coordOf(object) : undefined),
  );

  // キーボードでも回転できるように（Q / E キー、左右矢印キー）
  window.addEventListener('keydown', (e) => {
    if (e.key === 'q' || e.key === 'ArrowLeft') rig.rotate(-1);
    if (e.key === 'e' || e.key === 'ArrowRight') rig.rotate(1);
  });

  const timer = new THREE.Timer();
  stage.renderer.setAnimationLoop((time) => {
    timer.update(time);
    const dt = timer.getDelta();
    const elapsed = timer.getElapsed();
    rig.update(dt);
    mapView.update(elapsed);
    for (const p of puppets) p.puppet.update(elapsed);
    stage.renderer.render(stage.scene, rig.camera);
  });
}

main();
