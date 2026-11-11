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
import { createMap, type MapDefinition } from './core/map';
import {
  clearCount,
  EMPTY_DUNGEON_STATE,
  finishRunBattle,
  grantClearReward,
  normalizeDungeonState,
  retreat,
  startRun,
  type DungeonState,
} from './core/dungeon';
import { buildSortie, type BattleSite } from './core/sortie';
import { strikes, spells } from './data/abilities';
import { passives } from './data/passives';
import { aiConfig } from './data/aiConfig';
import { battleRules } from './data/battleRules';
import { twinHillsBattle } from './data/battles/twinHillsBattle';
import { ruinsDungeon } from './data/battles/ruins';
import { jobs } from './data/jobs';
import { progressionRules } from './data/progression';
import { initialRoster } from './data/roster';
import { createStage } from './render/stage';
import { createCameraRig } from './render/cameraRig';
import { createMapView, type MapView } from './render/mapView';
import { createBattleView, type BattleView } from './render/battleView';
import { createPicker } from './render/picker';
import { attachCameraInput } from './render/cameraInput';
import { createSaveStore, localStorageBackend } from './save/saveStore';
import { createBaseScreen } from './ui/baseScreen';
import { createBattleController, type BattleController } from './ui/battleController';
import { createDeployController, type DeployController } from './ui/deployController';
import { victoryText } from './ui/objectives';
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
 * 画面の流れ: 拠点 →（出撃: 訓練戦なら敵の強さを選ぶ）→ 出撃前の配置 → 戦闘 → 結果 → 拠点。拠点 →（編成）→ 拠点。
 * ダンジョン: 拠点 →（出撃: 挑む・再開する）→ 配置 → 戦闘 → 戦闘の間（結果・編成）→ 次の戦闘 … → クリアの画面 → 拠点。
 * 負けたら、やり直すか撤退するかを選ぶ。
 * 部隊の状態とダンジョンの進み具合は、戦闘が終わった時と編成を変えた時に、端末へ自動で保存する（戦闘の途中は保存しない）。
 */
type ScreenName = 'base' | 'roster' | 'deploy' | 'battle' | 'result';

interface ActiveBattle {
  readonly view: BattleView;
  readonly hud: BattleHud;
  readonly labels: UnitLabels;
  /** 出撃前の配置の間だけある */
  deploy?: DeployController;
  /** 戦闘が始まったらある */
  controller?: BattleController;
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

  const catalog: GameCatalog = { jobs, spells, strikes, passives };
  const site = twinHillsBattle;
  const store = createSaveStore(localStorageBackend(), catalog, progressionRules, (reason) =>
    console.warn(`セーブデータを読み込めませんでした（${reason}）。はじめからにします`),
  );
  if (validateRoster(initialRoster, catalog, progressionRules).length > 0) throw new Error('最初の部隊の定義が正しくありません');
  const loaded = store.load();
  let roster: Roster = loaded?.roster ?? initialRoster;
  /** ダンジョンの進み具合とクリアの記録（戦闘の間で保存する） */
  let dungeonState: DungeonState = normalizeDungeonState(loaded?.dungeon ?? EMPTY_DUNGEON_STATE, [ruinsDungeon]);
  const persist = () => store.save({ roster, dungeon: dungeonState });
  const updateRoster = (next: Roster) => {
    roster = next;
    persist();
  };
  const updateDungeon = (next: DungeonState) => {
    dungeonState = next;
    persist();
  };

  // シード値（乱数の種）。URL に ?seed=123 と付けると、最初の戦闘を再現できる
  const seedParam = Number(new URLSearchParams(location.search).get('seed'));
  let nextSeed = Number.isInteger(seedParam) && seedParam > 0 ? seedParam : randomSeed();

  const stage = createStage(stageEl);
  // マップの見た目は戦場の定義から作る（拠点や編成の画面でも、最後に出したマップを背景に出す）
  const rigOptions = (view: MapView, def: MapDefinition) => {
    const m = createMap(def);
    return { target: view.center, radius: view.radius, heightRange: view.heightRange, halfExtent: { x: m.width / 2, z: m.depth / 2 } };
  };
  let mapView = createMapView(createMap(site.map));
  let mapId = site.map.id;
  stage.scene.add(mapView.group);
  const rig = createCameraRig(rigOptions(mapView, site.map));
  /** 戦場のマップに切り替える（同じマップなら何もしない） */
  const useMap = (def: MapDefinition) => {
    if (def.id === mapId) return;
    stage.scene.remove(mapView.group);
    mapView.dispose();
    mapView = createMapView(createMap(def));
    mapId = def.id;
    stage.scene.add(mapView.group);
    rig.setMap(rigOptions(mapView, def));
  };
  stage.onResize((w, h) => rig.resize(w, h));
  showVersion(metaEl);

  let screen: ScreenName = 'base';
  /** 開発中だけ: 最後にマップに出したマスの色分け（自動プレイで、押し出す先の表示を確かめるため） */
  let lastMarks: readonly { x: number; z: number; kind: string }[] = [];
  /** 開発中だけ: 最後にマップに出した目印（到達するマス・増援の予告・見えている罠） */
  let lastOverlays: readonly { x: number; z: number; kind: string }[] = [];
  const setOverlays = (view: BattleView, tiles: Parameters<BattleView['setOverlays']>[0]) => {
    lastOverlays = tiles;
    view.setOverlays(tiles);
  };
  let battle: ActiveBattle | undefined;
  /** 開発中だけ: 今の戦闘が決着した時に呼ぶ処理（自動プレイで、ダンジョンの流れを確かめる時に決着を早める） */
  let currentFinish: ((state: BattleState) => void) | undefined;
  const setScreen = (name: ScreenName) => {
    screen = name;
    document.body.dataset.screen = name;
    // 戦闘の表示（情報欄・ボタン・頭上の HP）は、戦闘中だけ出す（結果の画面の後ろに透けないように）
    const inBattle = name === 'battle' || name === 'deploy';
    hudEl.hidden = !inBattle;
    labelsEl.hidden = !inBattle;
    if (inBattle) {
      screenEl.hidden = true;
      screenEl.innerHTML = '';
    }
  };

  const endBattle = () => {
    if (!battle) return;
    battle.controller?.dispose();
    battle.view.dispose();
    hudEl.innerHTML = '';
    labelsEl.innerHTML = '';
    battle = undefined;
  };

  const base = createBaseScreen(screenEl, {
    mapId: site.map.id,
    tiers: site.tiers.map((t) => ({ id: t.id, level: Math.max(...t.units.map((u) => u.level ?? 1)) })),
    dungeon: {
      id: ruinsDungeon.id,
      battles: ruinsDungeon.battles.map((b) => ({
        mapId: b.map.id,
        objective: (b.objectives?.victory ?? [{ kind: 'defeatAll' as const }]).map((c) => victoryText(c)).join('／'),
      })),
    },
    dungeonStatus: () => ({
      nextBattle: dungeonState.run?.dungeonId === ruinsDungeon.id ? dungeonState.run.battle : null,
      clears: clearCount(dungeonState, ruinsDungeon.id),
    }),
    onSortie: (tierId) => startSortie(site, tierId, finishBattle),
    onDungeon: (fresh) => {
      if (fresh || dungeonState.run?.dungeonId !== ruinsDungeon.id) updateDungeon(startRun(dungeonState, ruinsDungeon.id));
      playDungeonBattle();
    },
    onRoster: () => showRoster(showBase),
    onNewGame: () => {
      store.clear();
      roster = initialRoster;
      dungeonState = EMPTY_DUNGEON_STATE;
    },
  });
  /** 編成の画面の「戻る」の行き先（拠点か、ダンジョンの戦闘の間の画面） */
  let rosterReturn: () => void = () => showBase();
  const showRoster = (back: () => void) => {
    rosterReturn = back;
    setScreen('roster');
    rosterScreen.show();
  };
  const rosterScreen = createRosterScreen(screenEl, {
    catalog,
    rules: progressionRules,
    roster: () => roster,
    update: updateRoster,
    onBack: () => rosterReturn(),
  });
  const showBase = () => {
    endBattle();
    setScreen('base');
    base.show();
  };

  const jobOf = (id: string) => findUnit(roster, id).jobId;
  const canLearn = (id: string) => {
    const u = findUnit(roster, id);
    const job = catalog.jobs.find((j) => j.id === u.jobId)!;
    return [...(job.abilities ?? []), ...(job.passives ?? [])].some(
      (a) => learnRefusal(u, job.id, a.id, catalog, progressionRules) === null,
    );
  };
  /** 勝敗の表示を少し見せてから、結果の画面へ */
  const afterResultPause = (fn: () => void) =>
    window.setTimeout(() => {
      endBattle();
      fn();
    }, 1200);

  /** 訓練戦が終わった: 経験値と JP を部隊に反映して保存し、結果の画面を出す */
  const finishBattle = (state: BattleState) => {
    const result = applyBattleResult(roster, state, catalog, progressionRules);
    updateRoster(result.roster);
    afterResultPause(() => {
      setScreen('result');
      showReportScreen(screenEl, result.report, jobOf, canLearn, [{ label: TEXT.report.toBase, onClick: showBase, primary: true }]);
    });
  };

  /** ダンジョンの挑戦中の戦闘に出撃する */
  const playDungeonBattle = () => {
    const run = dungeonState.run;
    if (!run) return showBase();
    startSortie(ruinsDungeon.battles[run.battle]!, 'main', finishDungeonBattle);
  };
  const battleTitle = (index: number) => {
    const b = ruinsDungeon.battles[index]!;
    return { n: index + 1, mapName: TEXT.mapNames[b.map.id] ?? b.map.id };
  };

  /**
   * ダンジョンの戦闘が終わった: 経験値と JP を反映し、進み具合を進めて保存してから、戦闘の間の画面を出す。
   * 勝てば「次へ進む」「編成を変える」「拠点へ戻る（続きは次回）」、負ければ「やり直す」「編成を変える」「撤退」。
   * 最後の戦闘に勝てば、クリアの報酬（JP）を配って記録し、クリアの画面を出す。
   */
  const finishDungeonBattle = (state: BattleState) => {
    const played = dungeonState.run!.battle;
    const result = applyBattleResult(roster, state, catalog, progressionRules);
    const progress = finishRunBattle(dungeonState, ruinsDungeon, result.report.victory);
    roster = progress.outcome.kind === 'cleared' ? grantClearReward(result.roster, ruinsDungeon) : result.roster;
    dungeonState = progress.state;
    persist();
    const outcome = progress.outcome;
    const t = battleTitle(played);
    const dungeonName = TEXT.dungeons[ruinsDungeon.id] ?? ruinsDungeon.id;
    const show = () => {
      setScreen('result');
      const heading = TEXT.report.dungeonTitle(t.n, t.mapName);
      if (outcome.kind === 'cleared') {
        showReportScreen(screenEl, result.report, jobOf, canLearn, [{ label: TEXT.report.toBase, onClick: showBase, primary: true }], {
          heading,
          title: TEXT.report.clearTitle(dungeonName),
          highlights: [...(outcome.firstClear ? [TEXT.report.firstClear] : []), TEXT.report.reward(ruinsDungeon.clearRewardJp)],
          notes: [],
        });
      } else if (outcome.kind === 'next') {
        const next = battleTitle(outcome.battle);
        showReportScreen(
          screenEl,
          result.report,
          jobOf,
          canLearn,
          [
            { label: TEXT.report.next(next.n, next.mapName), onClick: playDungeonBattle, primary: true },
            { label: TEXT.report.editRoster, onClick: () => showRoster(show) },
            { label: TEXT.report.suspend, onClick: showBase },
          ],
          { heading, notes: [TEXT.report.healed] },
        );
      } else {
        showReportScreen(
          screenEl,
          result.report,
          jobOf,
          canLearn,
          [
            { label: TEXT.report.retry, onClick: playDungeonBattle, primary: true },
            { label: TEXT.report.editRoster, onClick: () => showRoster(show) },
            {
              label: TEXT.report.retreat,
              danger: true,
              onClick: () => {
                updateDungeon(retreat(dungeonState));
                showBase();
              },
            },
          ],
          { heading, notes: [TEXT.report.lostNote] },
        );
      }
    };
    afterResultPause(show);
  };

  /** 出撃: 出撃前の配置の画面を出し、「戦闘開始」で戦闘を始める */
  const startSortie = (target: BattleSite, tierId: string, onFinished: (state: BattleState) => void) => {
    endBattle();
    const seed = nextSeed;
    nextSeed = randomSeed();
    const setup = buildSortie(target, tierId, roster, catalog);
    const begin = (s: typeof setup): ActionResult =>
      startBattle(s, catalog.jobs, battleRules, seed, catalog.spells, catalog.strikes, catalog.passives);
    useMap(target.map);
    setScreen('deploy');
    rig.reset();
    const shell = createBattleShell(begin(setup));
    const active: ActiveBattle = { ...shell };
    battle = active;
    active.deploy = createDeployController(setup, {
      preview: begin,
      view: { sync: (st) => shell.view.sync(st), setMarks: (m) => setMarks(shell.view, m), setOverlays: (t) => setOverlays(shell.view, t) },
      hud: shell.hud,
      labels: shell.labels,
      onBack: () => showBase(),
      onStart: (final) => {
        active.deploy = undefined;
        setScreen('battle');
        const start = begin(final);
        shell.view.sync(start.state);
        active.controller = createController(shell, start, onFinished);
        currentFinish = onFinished;
      },
    });
  };

  /** 戦闘の表示（ユニットの見た目・情報欄とボタン・頭上の HP）を作る */
  const createBattleShell = (start: ActionResult) => {
    const view = createBattleView({
      scene: stage.scene,
      mapView,
      initial: start.state,
      camera: () => rig.camera,
      canvas: stage.renderer.domElement,
    });
    view.sync(start.state);
    const hud = createHud(
      hudEl,
      start.state.map.id,
      {
        onRotate: (d) => rig.rotate(d),
        onZoom: (steps) => rig.zoomStep(steps),
        onCycleHeight: () => rig.cycleHeight(),
        onResetView: () => rig.reset(),
        initialHeight: rig.heightLevel,
        facingScreen: (unitId) => view.facingScreen(unitId),
      },
      start.state.scenario.objectives.victory.flatMap((c) => (c.kind === 'defeatUnit' ? [c.unitId] : [])),
    );
    const labels = createUnitLabels(
      labelsEl,
      start.state.units.map((u) => ({ id: u.id, team: u.team, hp: u.hp, maxHp: u.stats.maxHp, mp: u.mp, maxMp: u.stats.maxMp })),
    );
    return { view, hud, labels };
  };
  const setMarks = (view: BattleView, marks: Parameters<BattleView['setMarks']>[0]) => {
    lastMarks = marks;
    view.setMarks(marks);
  };

  const createController = (
    shell: { view: BattleView; hud: BattleHud; labels: UnitLabels },
    start: ActionResult,
    onFinished: (state: BattleState) => void,
  ): BattleController => {
    const { view } = shell;
    // 手番のユニットなどが画面の外にいる時に、カメラを寄せる（足もとと頭上の両方が見えるように）
    const focusTiles = (tiles: readonly { x: number; z: number }[]) =>
      rig.focusOn(
        tiles.flatMap((t) => {
          const top = mapView.tileTop(t.x, t.z);
          return [top, top.clone().add(new THREE.Vector3(0, 1.2, 0))];
        }),
      );
    return createBattleController(start, {
      view: { ...view, focusTiles, setMarks: (m) => setMarks(view, m), setOverlays: (t) => setOverlays(view, t) },
      hud: shell.hud,
      labels: shell.labels,
      ai: aiConfig,
      onFinished,
    });
  };

  const createActiveBattle = (start: ActionResult, onFinished: (state: BattleState) => void): ActiveBattle => {
    const shell = createBattleShell(start);
    return { ...shell, controller: createController(shell, start, onFinished) };
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
    if (import.meta.env.DEV) tapLog.push({ x, y, coords, mode: battle.controller?.mode ?? 'deploy' });
    if (battle.deploy) battle.deploy.onTap(coords);
    else battle.controller?.onTap(coords);
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
      /** ダンジョンの進み具合とクリアの記録 */
      dungeon: () => dungeonState,
      /**
       * 今の戦闘を、指定した陣営の勝ちで終わらせる（ダンジョンの流れ（戦闘の間・やり直し・クリア）を短い時間で確かめるため）。
       * ここまでに行った行動の経験値と JP は入る
       */
      finishBattle: (winner: 'player' | 'enemy') => {
        const st = battle?.controller?.state;
        const finish = currentFinish;
        if (!st || !finish) throw new Error('戦闘中ではありません');
        battle!.controller!.dispose();
        currentFinish = undefined;
        finish({ ...st, winner, turn: null });
      },
      state: () => battle?.controller?.state ?? null,
      mode: () => (battle?.deploy ? 'deploy' : (battle?.controller?.mode ?? 'none')),
      modeDetail: () => battle?.controller?.modeDetail ?? { kind: 'none' },
      /** 出撃前の配置の画面の状態（配置・選んでいる味方） */
      deploy: () => (battle?.deploy ? { state: battle.deploy.state, selected: battle.deploy.selected, setup: battle.deploy.setup } : null),
      tileScreen: (x: number, z: number) => v().tileScreenPosition(x, z),
      tilePoints: (x: number, z: number) => v().tileScreenPoints(x, z),
      unitScreen: (id: string) => v().unitScreenPosition(id),
      /** その点をタップした時の、選ぶマスの候補（優先する順。tapJudge.ts） */
      candidatesAt: (x: number, y: number) => candidatesAt(x, y),
      /** その点の下にある物のマス（手前から順。判定の規則を通す前） */
      pickAt: (x: number, y: number) => pick(x, y).map((h) => v().coordOf(h.object) ?? null),
      tapLog: () => tapLog.slice(-3),
      /** 今マップに出しているマスの色分け */
      marks: () => lastMarks,
      overlays: () => lastOverlays,
      camera: () => ({ zoom: rig.zoom, heightLevel: rig.heightLevel, quarter: rig.quarter, idle: rig.idle }),
      /** 部隊を差し替えて保存し、拠点の画面に戻る（受動的なアビリティの習得など、JP の貯まった場面を確かめるため） */
      setRoster: (next: Roster) => {
        if (validateRoster(next, catalog, progressionRules).length > 0) throw new Error('部隊の定義が正しくありません');
        updateRoster(next);
        showBase();
      },
      /** 渡した状態から戦闘を始め直す（詠唱の中断など、AI の対戦では起きにくい場面を確かめるため） */
      load: (result: ActionResult) => {
        endBattle();
        useMap(mapDefinitionOf(result.state.map.id));
        setScreen('battle');
        // 確認用の場面なので、決着しても部隊には反映しない
        currentFinish = undefined;
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

/** マップの id から、マップの定義を探す（自動プレイで、別のマップの戦闘を用意する時に使う） */
function mapDefinitionOf(id: string): MapDefinition {
  const def = [twinHillsBattle, ...ruinsDungeon.battles].find((b) => b.map.id === id)?.map;
  if (!def) throw new Error(`マップ ${id} が見つかりません`);
  return def;
}

function randomSeed(): number {
  return Math.floor(Math.random() * 0x7fffffff) + 1;
}

main();
