import './ui/style.css';
import * as THREE from 'three';
import { startBattle } from './core/battle';
import { battleRules } from './data/battleRules';
import { firstBattle } from './data/battles/firstBattle';
import { jobs } from './data/jobs';
import { createStage } from './render/stage';
import { createCameraRig } from './render/cameraRig';
import { createMapView } from './render/mapView';
import { createBattleView } from './render/battleView';
import { createPicker } from './render/picker';
import { attachCameraInput } from './render/cameraInput';
import { createBattleController } from './ui/battleController';
import { createHud } from './ui/hud';
import { TEXT } from './ui/text';
import { createUnitLabels } from './ui/unitLabels';

/**
 * 入口。定義データ（data）を戦闘ルール（core）に渡して戦闘を始め、
 * 3D 表示（render）と画面の操作（ui）を組み立てる。
 */
function main(): void {
  const stageEl = document.getElementById('stage');
  const hudEl = document.getElementById('hud');
  const labelsEl = document.getElementById('labels');
  if (!stageEl || !hudEl || !labelsEl) throw new Error('#stage / #hud / #labels が見つかりません');
  document.title = TEXT.appTitle;

  // シード値（乱数の種）。URL に ?seed=123 と付けると、同じ戦闘を再現できる
  const seedParam = Number(new URLSearchParams(location.search).get('seed'));
  let nextSeed = Number.isInteger(seedParam) && seedParam > 0 ? seedParam : randomSeed();
  const newBattle = () => {
    const seed = nextSeed;
    nextSeed = randomSeed();
    return startBattle(firstBattle, jobs, battleRules, seed);
  };
  const first = newBattle();

  const stage = createStage(stageEl);
  const mapView = createMapView(first.state.map);
  stage.scene.add(mapView.group);

  const rig = createCameraRig({
    target: mapView.center,
    radius: mapView.radius,
    heightRange: mapView.heightRange,
    halfExtent: { x: first.state.map.width / 2, z: first.state.map.depth / 2 },
  });
  stage.onResize((w, h) => rig.resize(w, h));

  const view = createBattleView({
    scene: stage.scene,
    mapView,
    initial: first.state,
    camera: () => rig.camera,
    canvas: stage.renderer.domElement,
  });
  view.sync(first.state);

  const hud = createHud(hudEl, first.state.map.id, {
    onRotate: (d) => rig.rotate(d),
    onZoom: (steps) => rig.zoomStep(steps),
    onCycleHeight: () => rig.cycleHeight(),
    onResetView: () => rig.reset(),
    initialHeight: rig.heightLevel,
  });
  const labels = createUnitLabels(
    labelsEl,
    first.state.units.map((u) => ({ id: u.id, team: u.team, hp: u.hp, maxHp: u.stats.maxHp })),
  );
  // 手番のユニットなどが画面の外にいる時に、カメラを寄せる（足もとと頭上の両方が見えるように）
  const focusTiles = (tiles: readonly { x: number; z: number }[]) =>
    rig.focusOn(
      tiles.flatMap((t) => {
        const top = mapView.tileTop(t.x, t.z);
        return [top, top.clone().add(new THREE.Vector3(0, 1.2, 0))];
      }),
    );
  const controller = createBattleController(first, { view: { ...view, focusTiles }, hud, labels, newBattle });

  const canvas = stage.renderer.domElement;
  const pick = createPicker(canvas, () => rig.camera, () => view.pickTargets());
  attachCameraInput(canvas, rig, (x, y) => {
    const objects = pick(x, y);
    const coords = objects.map((o) => view.coordOf(o)).filter((c) => c !== undefined);
    const direction = objects.map((o) => view.directionOf(o)).find((d) => d !== undefined);
    controller.onTap(coords, direction);
  });
  // iPhone の Safari で、2本指の操作がページ全体の拡大にならないようにする
  document.addEventListener('gesturestart', (e) => e.preventDefault());

  // キーボードでも操作できるように（Q / E / 左右矢印キーで回転、+ / - で拡大・縮小）
  window.addEventListener('keydown', (e) => {
    if (e.key === 'q' || e.key === 'ArrowLeft') rig.rotate(-1);
    if (e.key === 'e' || e.key === 'ArrowRight') rig.rotate(1);
    if (e.key === '+' || e.key === ';' || e.key === '=') rig.zoomStep(1);
    if (e.key === '-') rig.zoomStep(-1);
  });

  // 開発中だけ、自動プレイ（npm run autoplay）から状態と画面座標を読めるようにする。
  // 開発中は URL に ?speed=4 と付けると、動きの表示を4倍速にできる（戦闘の結果は変わらない）
  let speed = 1;
  if (import.meta.env.DEV) {
    const speedParam = Number(new URLSearchParams(location.search).get('speed'));
    if (speedParam > 0) speed = Math.min(speedParam, 20);
    (window as unknown as Record<string, unknown>).__tactics = {
      state: () => controller.state,
      mode: () => controller.mode,
      modeDetail: () => controller.modeDetail,
      tileScreen: (x: number, z: number) => view.tileScreenPosition(x, z),
      tilePoints: (x: number, z: number) => view.tileScreenPoints(x, z),
      unitScreen: (id: string) => view.unitScreenPosition(id),
      arrowScreen: (dir: Parameters<typeof view.arrowScreenPosition>[0]) => view.arrowScreenPosition(dir),
      pickAt: (x: number, y: number) => pick(x, y).map((o) => view.coordOf(o) ?? null),
      camera: () => ({ zoom: rig.zoom, heightLevel: rig.heightLevel, quarter: rig.quarter, idle: rig.idle }),
    };
  }

  const timer = new THREE.Timer();
  stage.renderer.setAnimationLoop((time) => {
    timer.update(time);
    const dt = Math.min(timer.getDelta(), 0.1) * speed;
    const elapsed = timer.getElapsed();
    rig.update(dt);
    mapView.update(elapsed);
    view.update(dt, elapsed);
    stage.renderer.render(stage.scene, rig.camera);
    labels.setPositions(view.unitAnchors());
  });
}

function randomSeed(): number {
  return Math.floor(Math.random() * 0x7fffffff) + 1;
}

main();
