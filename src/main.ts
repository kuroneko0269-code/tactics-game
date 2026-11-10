import './ui/style.css';
import * as THREE from 'three';
import { startBattle } from './core/battle';
import type { ActionResult, BattleState } from './core/battleTypes';
import {
  applyBattleResult,
  findUnit,
  learnRefusal,
  validateRoster,
  type GameCatalog,
  type Roster,
} from './core/progression';
import { createMap } from './core/map';
import { buildSortie } from './core/sortie';
import { strikes, spells } from './data/abilities';
import { aiConfig } from './data/aiConfig';
import { battleRules } from './data/battleRules';
import { twinHillsBattle } from './data/battles/twinHillsBattle';
import { jobs } from './data/jobs';
import { progressionRules } from './data/progression';
import { initialRoster } from './data/roster';
import { createStage } from './render/stage';
import { createCameraRig } from './render/cameraRig';
import { createMapView } from './render/mapView';
import { createBattleView, type BattleView } from './render/battleView';
import { createPicker } from './render/picker';
import { attachCameraInput } from './render/cameraInput';
import { createSaveStore, localStorageBackend } from './save/saveStore';
import { createBaseScreen } from './ui/baseScreen';
import { createBattleController, type BattleController } from './ui/battleController';
import { createHud, type BattleHud } from './ui/hud';
import { showReportScreen } from './ui/reportScreen';
import { createRosterScreen } from './ui/rosterScreen';
import { showVersion } from './ui/version';
import { TEXT } from './ui/text';
import { createUnitLabels, type UnitLabels } from './ui/unitLabels';

/**
 * 入口。定義データ（data）を戦闘ルールと育成の計算（core）に渡し、
 * 3D 表示（render）と画面（ui）、保存（save）を組み立てる。
 *
 * 画面の流れ: 拠点 →（出撃: 敵の強さを選ぶ）→ 戦闘 → 結果 → 拠点。拠点 →（編成）→ 拠点。
 * 部隊の状態は、戦闘が終わった時と編成を変えた時に、端末へ自動で保存する。
 */
type ScreenName = 'base' | 'roster' | 'battle' | 'result';

interface ActiveBattle {
  readonly view: BattleView;
  readonly hud: BattleHud;
  readonly labels: UnitLabels;
  readonly controller: BattleController;
}

function main(): void {
  const stageEl = document.getElementById('stage');
  const hudEl = document.getElementById('hud');
  const labelsEl = document.getElementById('labels');
  const screenEl = document.getElementById('screen');
  const metaEl = document.getElementById('meta');
  if (!stageEl || !hudEl || !labelsEl || !screenEl || !metaEl) {
    throw new Error('#stage / #hud / #labels / #screen / #meta が見つかりません');
  }
  document.title = TEXT.appTitle;

  const catalog: GameCatalog = { jobs, spells, strikes };
  const site = twinHillsBattle;
  const store = createSaveStore(localStorageBackend(), catalog, progressionRules, (reason) =>
    console.warn(`セーブデータを読み込めませんでした（${reason}）。はじめからにします`),
  );
  if (validateRoster(initialRoster, catalog, progressionRules).length > 0) throw new Error('最初の部隊の定義が正しくありません');
  let roster: Roster = store.load() ?? initialRoster;
  const updateRoster = (next: Roster) => {
    roster = next;
    store.save(roster);
  };

  // シード値（乱数の種）。URL に ?seed=123 と付けると、最初の戦闘を再現できる
  const seedParam = Number(new URLSearchParams(location.search).get('seed'));
  let nextSeed = Number.isInteger(seedParam) && seedParam > 0 ? seedParam : randomSeed();

  const stage = createStage(stageEl);
  // マップの見た目は戦場の定義から作る（拠点や編成の画面でも、背景に出す）
  const map = createMap(site.map);
  const mapView = createMapView(map);
  stage.scene.add(mapView.group);
  const rig = createCameraRig({
    target: mapView.center,
    radius: mapView.radius,
    heightRange: mapView.heightRange,
    halfExtent: { x: map.width / 2, z: map.depth / 2 },
  });
  stage.onResize((w, h) => rig.resize(w, h));
  showVersion(metaEl);

  let screen: ScreenName = 'base';
  let battle: ActiveBattle | undefined;
  const setScreen = (name: ScreenName) => {
    screen = name;
    document.body.dataset.screen = name;
    // 戦闘の表示（情報欄・ボタン・頭上の HP）は、戦闘中だけ出す（結果の画面の後ろに透けないように）
    hudEl.hidden = name !== 'battle';
    labelsEl.hidden = name !== 'battle';
    if (name === 'battle') {
      screenEl.hidden = true;
      screenEl.innerHTML = '';
    }
  };

  const endBattle = () => {
    if (!battle) return;
    battle.controller.dispose();
    battle.view.dispose();
    hudEl.innerHTML = '';
    labelsEl.innerHTML = '';
    battle = undefined;
  };

  const base = createBaseScreen(screenEl, {
    mapId: site.map.id,
    tiers: site.tiers.map((t) => ({ id: t.id, level: Math.max(...t.units.map((u) => u.level ?? 1)) })),
    onSortie: (tierId) => startSortie(tierId),
    onRoster: () => {
      setScreen('roster');
      rosterScreen.show();
    },
    onNewGame: () => {
      store.clear();
      roster = initialRoster;
    },
  });
  const rosterScreen = createRosterScreen(screenEl, {
    catalog,
    rules: progressionRules,
    roster: () => roster,
    update: updateRoster,
    onBack: () => showBase(),
  });
  const showBase = () => {
    endBattle();
    setScreen('base');
    base.show();
  };

  /** 戦闘が終わった: 経験値と JP を部隊に反映して保存し、結果の画面を出す */
  const finishBattle = (state: BattleState) => {
    const result = applyBattleResult(roster, state, catalog, progressionRules);
    updateRoster(result.roster);
    const jobOf = (id: string) => findUnit(roster, id).jobId;
    const canLearn = (id: string) => {
      const u = findUnit(roster, id);
      const job = catalog.jobs.find((j) => j.id === u.jobId)!;
      return (job.abilities ?? []).some((a) => learnRefusal(u, job.id, a.id, catalog, progressionRules) === null);
    };
    // 勝敗の表示を少し見せてから、結果の画面へ
    window.setTimeout(() => {
      setScreen('result');
      showReportScreen(screenEl, result.report, jobOf, canLearn, showBase);
    }, 1200);
  };

  const startSortie = (tierId: string) => {
    endBattle();
    const seed = nextSeed;
    nextSeed = randomSeed();
    const setup = buildSortie(site, tierId, roster, catalog);
    const start: ActionResult = startBattle(setup, catalog.jobs, battleRules, seed, catalog.spells, catalog.strikes);
    setScreen('battle');
    rig.reset();
    battle = createActiveBattle(start, finishBattle);
  };

  const createActiveBattle = (start: ActionResult, onFinished: (state: BattleState) => void): ActiveBattle => {
    const view = createBattleView({
      scene: stage.scene,
      mapView,
      initial: start.state,
      camera: () => rig.camera,
      canvas: stage.renderer.domElement,
    });
    view.sync(start.state);
    const hud = createHud(hudEl, start.state.map.id, {
      onRotate: (d) => rig.rotate(d),
      onZoom: (steps) => rig.zoomStep(steps),
      onCycleHeight: () => rig.cycleHeight(),
      onResetView: () => rig.reset(),
      initialHeight: rig.heightLevel,
      facingScreen: (unitId) => view.facingScreen(unitId),
    });
    const labels = createUnitLabels(
      labelsEl,
      start.state.units.map((u) => ({ id: u.id, team: u.team, hp: u.hp, maxHp: u.stats.maxHp, mp: u.mp, maxMp: u.stats.maxMp })),
    );
    // 手番のユニットなどが画面の外にいる時に、カメラを寄せる（足もとと頭上の両方が見えるように）
    const focusTiles = (tiles: readonly { x: number; z: number }[]) =>
      rig.focusOn(
        tiles.flatMap((t) => {
          const top = mapView.tileTop(t.x, t.z);
          return [top, top.clone().add(new THREE.Vector3(0, 1.2, 0))];
        }),
      );
    const controller = createBattleController(start, {
      view: { ...view, focusTiles },
      hud,
      labels,
      ai: aiConfig,
      onFinished,
    });
    return { view, hud, labels, controller };
  };

  const canvas = stage.renderer.domElement;
  /** 開発中だけ: 最近のタップの記録（自動プレイで失敗した時の調査用） */
  const tapLog: { x: number; y: number; coords: readonly { x: number; z: number }[]; mode: string }[] = [];
  const pick = createPicker(canvas, () => rig.camera, () => battle?.view.pickTargets() ?? [mapView.group]);
  const candidatesAt = (x: number, y: number) =>
    battle ? battle.view.tapCandidates(pick, x, y) : { coords: [] as { x: number; z: number }[] };
  attachCameraInput(canvas, rig, (x, y) => {
    if (!battle) return;
    const { coords } = candidatesAt(x, y);
    if (import.meta.env.DEV) tapLog.push({ x, y, coords, mode: battle.controller.mode });
    battle.controller.onTap(coords);
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
    const v = () => {
      if (!battle) throw new Error('戦闘中ではありません');
      return battle.view;
    };
    (window as unknown as Record<string, unknown>).__tactics = {
      /** 今の画面（base / roster / battle / result） */
      screen: () => screen,
      /** 部隊の状態 */
      roster: () => roster,
      state: () => battle?.controller.state ?? null,
      mode: () => battle?.controller.mode ?? 'none',
      modeDetail: () => battle?.controller.modeDetail ?? { kind: 'none' },
      tileScreen: (x: number, z: number) => v().tileScreenPosition(x, z),
      tilePoints: (x: number, z: number) => v().tileScreenPoints(x, z),
      unitScreen: (id: string) => v().unitScreenPosition(id),
      /** その点をタップした時の、選ぶマスの候補（優先する順。tapJudge.ts） */
      candidatesAt: (x: number, y: number) => candidatesAt(x, y),
      /** その点の下にある物のマス（手前から順。判定の規則を通す前） */
      pickAt: (x: number, y: number) => pick(x, y).map((h) => v().coordOf(h.object) ?? null),
      tapLog: () => tapLog.slice(-3),
      camera: () => ({ zoom: rig.zoom, heightLevel: rig.heightLevel, quarter: rig.quarter, idle: rig.idle }),
      /** 渡した状態から戦闘を始め直す（詠唱の中断など、AI の対戦では起きにくい場面を確かめるため） */
      load: (result: ActionResult) => {
        endBattle();
        setScreen('battle');
        // 確認用の場面なので、決着しても部隊には反映しない
        battle = createActiveBattle(result, () => {});
      },
    };
  }

  const timer = new THREE.Timer();
  stage.renderer.setAnimationLoop((time) => {
    timer.update(time);
    const dt = Math.min(timer.getDelta(), 0.1) * speed;
    const elapsed = timer.getElapsed();
    rig.update(dt);
    mapView.update(elapsed);
    if (battle) battle.view.update(dt, elapsed);
    stage.renderer.render(stage.scene, rig.camera);
    if (battle) {
      battle.labels.setPositions(battle.view.unitAnchors());
      battle.hud.update();
    }
  });

  showBase();
}

function randomSeed(): number {
  return Math.floor(Math.random() * 0x7fffffff) + 1;
}

main();
