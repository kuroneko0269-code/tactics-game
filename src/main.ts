import './ui/style.css';
import * as THREE from 'three';
import { forceVictory, startBattle } from './core/battle';
import type { ActionResult, BattleState } from './core/battleTypes';
import {
  applyBattleResult,
  expToNext,
  findUnit,
  jobProgress,
  newlyUnlockedJobs,
  learnRefusal,
  validateRoster,
  type GameCatalog,
  type Roster,
} from './core/progression';
import { createMap, type MapDefinition } from './core/map';
import { DIRECTION_VECTORS } from './core/geometry';
import {
  clearCount,
  clearRewardItems,
  clearRewardJp,
  EMPTY_DUNGEON_STATE,
  finishRunBattle,
  grantClearReward,
  normalizeDungeonState,
  retreat,
  startRun,
  type DungeonState,
} from './core/dungeon';
import { buildSortie, type BattleSite } from './core/sortie';
import { EMPTY_RECORDS, type BattleOrigin, type GameRecords, type SuspendedBattle } from './core/saveData';
import { grantSpoils, recordTrainingWin, rollSpoils, shopStock, type BattleReward } from './core/shop';
import { strikes, spells } from './data/abilities';
import { passives } from './data/passives';
import { autoEquipWeights, equipment, saveMigrationContext, shop } from './data/equipment';
import { aiConfig } from './data/aiConfig';
import { battleRules } from './data/battleRules';
import { twinHillsBattle } from './data/battles/twinHillsBattle';
import { ruinsDungeon } from './data/battles/ruins';
import { jobs } from './data/jobs';
import { progressionRules } from './data/progression';
import { initialRoster } from './data/roster';
import { createStage } from './render/stage';
import { applyLighting } from './render/lighting';
import { DEFAULT_TIME, TIMES_OF_DAY } from './data/lighting';
import { createCameraRig } from './render/cameraRig';
import { createMapView, type MapView } from './render/mapView';
import { createBattleView, type BattleView } from './render/battleView';
import { createPicker } from './render/picker';
import { attachCameraInput } from './render/cameraInput';
import { createSaveStore, createSettingsStore, localStorageBackend, settingsBackend, type GameSettings } from './save/saveStore';
import { createBaseScreen } from './ui/baseScreen';
import { createBattleController, type BattleController } from './ui/battleController';
import { createDeployController, type DeployController } from './ui/deployController';
import { victoryText } from './ui/objectives';
import { createHud, type BattleHud } from './ui/hud';
import { showReportScreen } from './ui/reportScreen';
import { createRosterScreen } from './ui/rosterScreen';
import { createShopScreen } from './ui/shopScreen';
import { itemName } from './ui/equipmentText';
import { showVersion } from './ui/version';
import { TEXT, unitName } from './ui/text';
import { createUnitLabels, type UnitLabels } from './ui/unitLabels';
import { applyDirective, pointOf, propNamesMatching, walkPath, type StageState } from './core/dialogue';
import { parseScriptOrThrow, type Directive, type Script } from './core/script';
import { createPortraitRenderer } from './render/portrait';
import { createSpeakerMark } from './render/speakerMark';
import { createVoiceMarks, type VoiceKind } from './render/voiceMark';
import { advanceScene, currentScene, isChecked, normalizeProgress, progressAt, recapFor, sceneEntries, STORY_START, type BookDefinition, type StoryProgress } from './core/story';
import { books } from './data/story/books';
import { scriptTexts } from './data/story/scripts';
import { ACTOR_LOOKS as ACTOR_LOOK_IDS, GESTURES, LIGHT_COLORS, POSTURES, PROP_KINDS, scriptCatalog, VOICES } from './data/story/stageDefs';
import { stages } from './data/story/stages';
import { parties } from './data/story/parties';
import { DEFAULT_LOOK, LOOKS } from './data/story/looks';
import { LISTEN, melodyTimes, SOUND_EFFECTS } from './data/sounds';
import { prologueBattles } from './data/battles/prologue';
import { createSceneView, type SceneView } from './render/sceneView';
import { facingToward, inscriptionNodes, runDialogue, type DialogueRun, type DialogueSound, type StagePort } from './ui/dialogue';
import { showRecapScreen, showSceneSelect, showStoryBattleLost, showStoryEndScreen, showStoryMenu, showTitleScreen } from './ui/titleScreen';
import { createCheckBadge } from './ui/checkBadge';
import { createSoundSystem } from './ui/sound';
import { createSoundMark, showSettingsSheet } from './ui/settingsSheet';
import { createTutorial, type TutorialScreen } from './ui/tutorial';
import { chapterStartRecap } from './core/story';

/**
 * 入口。定義データ（data）を戦闘ルールと育成の計算（core）に渡し、
 * 3D 表示（render）と画面（ui）、保存（save）を組み立てる。
 *
 * 画面の流れ: 拠点 →（出撃: 訓練戦なら敵の強さを選ぶ）→ 出撃前の配置 → 戦闘 → 結果 → 拠点。拠点 →（編成・店）→ 拠点。
 * ダンジョン: 拠点 →（出撃: 挑む・再開する）→ 配置 → 戦闘 → 戦闘の間（結果・編成）→ 次の戦闘 … → クリアの画面 → 拠点。
 * 負けたら、やり直すか撤退するかを選ぶ。
 * 部隊の状態（所持金・所持品を含む）とダンジョンの進み具合・訓練戦の記録は、戦闘が終わった時と、編成を変えた時・店で売り買いした時に、
 * 端末へ自動で保存する。戦闘の途中の状態も、行動がひとつ確定するたびに保存する（フェーズ2-5）。
 * 途中の戦闘があれば、拠点で「戦闘を再開」と「撤退する」だけを出す（再開するまで、編成と店は使えない。部隊と戦闘の食い違いを防ぐため）。
 * 戦闘に勝つと、戦場の段階ごとの報酬（ゴールドと戦利品の抽選）を部隊に入れる（フェーズ2-4）。
 */
type ScreenName = 'title' | 'base' | 'roster' | 'shop' | 'deploy' | 'battle' | 'result' | 'scene' | 'recap' | 'story-end' | 'story-menu' | 'scene-select';

/** 物語の戦闘の戦場（場面の battleId で引く） */
const storySites: readonly BattleSite[] = prologueBattles;
/** 会話の場面のカメラの寄り（その画面の形の最初の拡大率を 1 として） */
const SCENE_ZOOM = { far: 0.85, mid: 1.25, near: 1.9 } as const;
/** 人物を映す点（頭の少し下）から、手もとまでの高さの差（@映す 名前の手もと） */
const HANDS_OFFSET = -0.3;
/** だれもいないマスを、人が立っている時と同じ高さで映す（@カメラ x,z 人の高さ。舞台の人物を映す点と同じ。src/render/sceneView.ts の actorPoint） */
const STANDING_OFFSET = 0.6;
/** 手もとを映す時の、さらに寄る倍率 */
const HANDS_ZOOM = 1.7;

interface ActiveBattle {
  readonly view: BattleView;
  readonly hud: BattleHud;
  readonly labels: UnitLabels;
  /** 出撃前の配置の間だけある */
  deploy?: DeployController;
  /** 戦闘が始まったらある */
  controller?: BattleController;
  /** 戦闘の手ほどき（手ほどきのある戦場で、まだ見ていない時だけある） */
  tutorial?: TutorialScreen;
}

function main(): void {
  const stageEl = document.getElementById('stage');
  const hudEl = document.getElementById('hud');
  const labelsEl = document.getElementById('labels');
  const screenEl = document.getElementById('screen');
  const metaEl = document.getElementById('meta');
  const dialogueEl = document.getElementById('dialogue');
  const fadeEl = document.getElementById('fade');
  if (!stageEl || !hudEl || !labelsEl || !screenEl || !metaEl || !dialogueEl || !fadeEl) {
    throw new Error('#stage / #hud / #labels / #screen / #meta / #dialogue / #fade が見つかりません');
  }
  document.title = TEXT.appTitle;

  const catalog: GameCatalog = { jobs, spells, strikes, passives, equipment };
  const site = twinHillsBattle;
  const store = createSaveStore(localStorageBackend(), catalog, progressionRules, saveMigrationContext, (reason) =>
    console.warn(`セーブデータを読み込めませんでした（${reason}）。はじめからにします`),
  );
  if (validateRoster(initialRoster, catalog, progressionRules).length > 0) throw new Error('最初の部隊の定義が正しくありません');
  const loaded = store.load();
  let roster: Roster = loaded?.roster ?? initialRoster;
  /** ダンジョンの進み具合とクリアの記録（戦闘の間で保存する） */
  let dungeonState: DungeonState = normalizeDungeonState(loaded?.dungeon ?? EMPTY_DUNGEON_STATE, [ruinsDungeon]);
  /** 訓練戦の段階ごとの勝利の回数（店の品ぞろえの条件） */
  let records: GameRecords = loaded?.records ?? EMPTY_RECORDS;
  /** 途中の戦闘（行動がひとつ確定するたびに保存する。決着したら消す） */
  let suspended: SuspendedBattle | null = loaded?.battle ?? null;
  /** 物語の進み具合（本ごと。物語の土台） */
  let story: Readonly<Record<string, StoryProgress>> = loaded?.story ?? {};
  /** 出したことのある操作の手引き（初めての時だけ出す） */
  let seenHints: readonly string[] = loaded?.seenHints ?? [];
  const persist = () => store.save({ roster, dungeon: dungeonState, records, battle: suspended, story, seenHints });

  // ---- 音と設定（序章に足りない仕組み） ----
  const settingsStore = createSettingsStore(settingsBackend());
  let settings: GameSettings = settingsStore.load();
  const sound = createSoundSystem();
  sound.setVolume(settings.volume, settings.muted);
  /** 確認用の機能の印と「勝ったことにする」（設定で入にした時だけ） */
  const checkBadge = createCheckBadge(document.getElementById('app') ?? document.body);
  checkBadge.setEnabled(settings.checkTools);
  /** 物語の戦闘で、まだ決着していない間（確認用の機能の「勝ったことにする」を出す） */
  let liveStoryBattle: { readonly bookId: string } | null = null;
  const refreshCheckWin = () =>
    checkBadge.setWin(settings.checkTools && liveStoryBattle && battle && (screen === 'deploy' || screen === 'battle') ? () => void checkWinBattle() : null);
  const updateSettings = (next: GameSettings) => {
    settings = next;
    settingsStore.save(next);
    sound.setVolume(next.volume, next.muted);
    checkBadge.setEnabled(next.checkTools);
    refreshCheckWin();
  };
  // ブラウザは最初のタップがあるまで音を鳴らせないので、最初のタップで音の仕組みを起こす
  const unlockSound = () => sound.unlock();
  document.addEventListener('pointerdown', unlockSound, { capture: true });
  document.addEventListener('keydown', unlockSound, { capture: true });
  // 画面のボタンを押した時の音（決定・取り消し・選ぶ）
  document.addEventListener(
    'click',
    (e) => {
      const b = (e.target as HTMLElement | null)?.closest?.('button');
      if (!b || b.disabled) return;
      const back = b.dataset.key === 'back' || b.classList.contains('quiet') || b.classList.contains('sheet-close');
      sound.effect(back ? 'cancel' : b.classList.contains('primary') ? 'confirm' : 'select');
    },
    { capture: true },
  );
  const soundMark = createSoundMark(document.getElementById('app') ?? document.body);
  /** 開発中だけ: これまでに鳴らした旋律・見せた場所・言葉にしない声の数（自動プレイが、短い印を見逃さずに確かめるため） */
  const devHistory = { melodies: new Set<string>(), stages: new Set<string>(), voices: 0, overlays: 0, placards: [] as string[], nameTags: [] as string[], objectLabels: [] as string[], inscriptions: [] as string[] };
  sound.onMelodyChange(() => {
    const m = sound.melody();
    if (m) devHistory.melodies.add(`${m.melody}/${m.timbre}`);
    soundMark.show(m ? TEXT.sound.melodyMark(m.mark ?? TEXT.sound.timbres[m.timbre] ?? m.timbre) : null);
  });
  /** 会話から使う音の口 */
  const dialogueSound: DialogueSound = {
    playMelody: (melody, timbre, mark) => sound.playMelody(melody, timbre, mark),
    stopMelody: () => sound.stopMelody(),
    waitMelody: (remaining) => sound.waitMelody(remaining),
    cutMelody: (remaining) => sound.cutMelody(remaining),
    stopAll: () => {
      sound.stopMelody();
      sound.stopAmbient();
    },
    listenFrom: (melody, timbre, timeline, elapsed) => sound.listenFrom(melody, timbre, timeline, elapsed, TEXT.sound.shellMark),
    listenPause: (finished) => sound.listenPause(finished),
    listenTimeline: (melody) => {
      const t = melodyTimes(melody);
      return t.noteStarts.length > 0 ? { shellMs: LISTEN.shellMs, swellMs: LISTEN.swellMs, noteStarts: t.noteStarts, melodyMs: t.totalMs } : undefined;
    },
    effect: (name) => {
      const id = SOUND_EFFECTS[name];
      if (!id) return;
      sound.effect(id);
      const mark = TEXT.sound.effectMarks[id];
      if (mark) soundMark.flash(TEXT.sound.melodyMark(mark));
    },
  };
  /** 戦闘の状態が変わった（行動がひとつ確定した）: 途中の戦闘として保存する */
  const saveBattle = (origin: BattleOrigin, state: BattleState) => {
    suspended = { origin, state };
    persist();
  };
  /** 今の店の品ぞろえ */
  const stock = () => shopStock(shop, { trainingWins: records.trainingWins, dungeonClears: dungeonState.clears });
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
  /** 場面の時刻の光（朝・昼・夕方・夜）。省くと昼 */
  const timeLight = (name: string | undefined) => TIMES_OF_DAY[name ?? DEFAULT_TIME] ?? TIMES_OF_DAY[DEFAULT_TIME]!;
  /** 今の時刻の光（自動テスト用と、遠景のカットから戻す時のため） */
  let currentTime: { name: string; sky?: number } = { name: DEFAULT_TIME };
  /** 場面の時刻の光を当てる。sky を渡すと空の色だけはそれ（マップが決めた空の色） */
  const applyTime = (name: string | undefined, sky?: number) => {
    currentTime = { name: name ?? DEFAULT_TIME, ...(sky !== undefined ? { sky } : {}) };
    applyLighting(stage.scene, stage.lights, timeLight(name), sky);
  };
  // マップの見た目は戦場の定義から作る（拠点や編成の画面でも、最後に出したマップを背景に出す）
  const rigOptions = (view: MapView, def: MapDefinition) => {
    const m = createMap(def);
    // マップの外のカメラを向けてよいマス（下流の村など）まで、カメラを動かせる範囲を広げる
    const lookouts = [...storySites, ...stages].filter((s) => s.map.id === def.id).flatMap((s) => s.lookouts ?? []);
    const half = { x: m.width / 2, z: m.depth / 2 };
    for (const p of lookouts) {
      half.x = Math.max(half.x, Math.abs(p.x - (m.width - 1) / 2) + 0.5);
      half.z = Math.max(half.z, Math.abs(p.z - (m.depth - 1) / 2) + 0.5);
    }
    return { target: view.center, radius: view.radius, heightRange: view.heightRange, halfExtent: half };
  };
  let mapView = createMapView(createMap(site.map));
  let mapId = site.map.id;
  let mapDef: MapDefinition = site.map;
  stage.scene.add(mapView.group);
  const rig = createCameraRig(rigOptions(mapView, site.map));
  /** 戦場のマップに切り替える（同じマップなら何もしない） */
  const useMap = (def: MapDefinition) => {
    if (def.id === mapId) return;
    stage.scene.remove(mapView.group);
    mapView.dispose();
    mapView = createMapView(createMap(def));
    mapId = def.id;
    mapDef = def;
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
  /** 今の戦闘の戦場（見た目・手ほどき・台本の人物の名前に使う） */
  let currentSite: BattleSite | undefined;
  /** 開発中だけ: 今の戦闘が決着した時に呼ぶ処理（自動プレイで、ダンジョンの流れを確かめる時に決着を早める） */
  let currentFinish: ((state: BattleState) => void) | undefined;
  /** 暗転で終わった台本の後、暗いままにしている（次の台本の始めか、会話の場面以外の画面へ移る時に明るくする） */
  let heldDark = false;
  const setScreen = (name: ScreenName) => {
    screen = name;
    // 暗転で終わった台本の後、会話の場面以外の画面へ移る時は明るくする（会話の場面は、次の台本の始めで決める）
    if (heldDark && name !== 'scene') {
      heldDark = false;
      void setDark(false, 0);
    }
    document.body.dataset.screen = name;
    // 戦闘の表示（情報欄・ボタン・頭上の HP）は、戦闘中だけ出す（結果の画面の後ろに透けないように）
    const inBattle = name === 'battle' || name === 'deploy';
    hudEl.hidden = !inBattle;
    labelsEl.hidden = !inBattle;
    if (name !== 'scene') endScene();
    if (inBattle || name === 'scene') {
      screenEl.hidden = true;
      screenEl.innerHTML = '';
    }
    refreshCheckWin();
  };

  const endBattle = () => {
    liveStoryBattle = null;
    refreshCheckWin();
    sound.stopAmbient();
    applyTime(undefined);
    if (!battle) return;
    battle.tutorial?.dispose();
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
    gold: () => roster.gold,
    suspended: () => (suspended ? suspendedTitle(suspended.origin) : null),
    onResumeBattle: () => resumeBattle(),
    onRetreatBattle: () => retreatBattle(),
    onSortie: (tierId) => startSortie(site, tierId, { kind: 'training', tierId }, (state) => finishBattle(tierId, state)),
    onDungeon: (fresh) => {
      if (fresh || dungeonState.run?.dungeonId !== ruinsDungeon.id) updateDungeon(startRun(dungeonState, ruinsDungeon.id));
      playDungeonBattle();
    },
    onRoster: () => showRoster(showBase),
    onShop: () => {
      setScreen('shop');
      shopScreen.show();
    },
    onNewGame: () => {
      store.clear();
      suspended = null;
      roster = initialRoster;
      dungeonState = EMPTY_DUNGEON_STATE;
      records = EMPTY_RECORDS;
      story = {};
      seenHints = [];
    },
    onTitle: () => showTitle(),
    storyNext: () => storyBaseNext,
  });
  /** 物語の拠点の場面の「物語を進める」（物語の拠点の場面の間だけある） */
  let storyBaseNext: (() => void) | null = null;
  const shopScreen = createShopScreen(screenEl, {
    catalog,
    shop,
    stock,
    roster: () => roster,
    update: updateRoster,
    onBack: () => showBase(),
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
    autoEquipWeights,
    roster: () => roster,
    update: updateRoster,
    onBack: () => rosterReturn(),
  });
  const showBase = () => {
    endBattle();
    storyBaseNext = null;
    setScreen('base');
    base.show();
  };

  const jobOf = (id: string) => findUnit(roster, id).jobId;
  /** before から after になって新しく就けるようになったジョブの知らせ（結果の画面に出す。フェーズ2-6） */
  const unlockNotes = (before: Roster, after: Roster): string[] => {
    // 1つの札にまとめる（小さめのスマホでも、結果の画面とクリアの画面に収まるように）
    const parts = after.units.flatMap((u) => {
      const b = before.units.find((x) => x.id === u.id);
      if (!b) return [];
      const jobIds = newlyUnlockedJobs(b, u, catalog, progressionRules);
      return jobIds.length === 0 ? [] : [TEXT.roster.unlockPart(unitName(u.id, u.jobId), jobIds.map((j) => TEXT.jobs[j] ?? j).join('・'))];
    });
    return parts.length === 0 ? [] : [TEXT.roster.unlockChip(parts.join('、'))];
  };
  /** 戦闘中: そのユニットの jobId の JP の累計が jpTotal になった時に、新しく就けるようになったジョブ */
  const unlockedInBattle = (unitId: string, jobId: string, jpTotal: number): string[] => {
    const u = roster.units.find((x) => x.id === unitId);
    if (!u) return [];
    const p = jobProgress(u, jobId);
    const after = { ...u, jobs: { ...u.jobs, [jobId]: { ...p, jpTotal: Math.max(p.jpTotal, jpTotal) } } };
    return newlyUnlockedJobs(u, after, catalog, progressionRules);
  };
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

  /**
   * 勝った時の報酬（ゴールドと戦利品の抽選）を部隊に入れる。抽選には、戦闘が終わった時点の乱数の状態を使う。
   * extraItems はボスからの初回の報酬など、必ず手に入る物
   */
  const takeSpoils = (base: Roster, reward: BattleReward | undefined, state: BattleState, extraItems: readonly string[] = []) => {
    const spoils = rollSpoils(reward, state.winner === 'player', state.rngState);
    // 盗賊が盗んだ物（フェーズ2-6）は、戦闘に勝った時だけ持ち帰れる（PR #17 の回答。負けた時・撤退した時はなし）
    const stolen = state.winner === 'player' ? (state.stolen ?? { gold: 0, items: [] }) : { gold: 0, items: [] };
    const all = { gold: spoils.gold + stolen.gold, itemIds: [...spoils.itemIds, ...extraItems, ...stolen.items] };
    const granted = grantSpoils(base, all);
    return {
      roster: granted.roster,
      view: {
        gold: all.gold,
        goldTotal: granted.roster.gold,
        items: [...spoils.itemIds.map(itemName), ...stolen.items.map((id) => TEXT.report.stolenItem(itemName(id)))],
        special: extraItems.map(itemName),
      },
    };
  };

  /** 訓練戦が終わった: 経験値と JP、勝てばゴールドと戦利品を部隊に入れて保存し、結果の画面を出す */
  const finishBattle = (tierId: string, state: BattleState) => {
    const before = roster;
    const result = applyBattleResult(roster, state, catalog, progressionRules);
    const spoils = takeSpoils(result.roster, site.tiers.find((t) => t.id === tierId)?.reward, state);
    if (result.report.victory) records = { ...records, trainingWins: recordTrainingWin(records.trainingWins, tierId) };
    suspended = null;
    updateRoster(spoils.roster);
    afterResultPause(() => {
      setScreen('result');
      showReportScreen(screenEl, result.report, jobOf, canLearn, [{ label: TEXT.report.toBase, onClick: showBase, primary: true }], {
        spoils: spoils.view,
        unlocks: unlockNotes(before, roster),
      });
    });
  };

  /** ダンジョンの挑戦中の戦闘に出撃する */
  const playDungeonBattle = () => {
    const run = dungeonState.run;
    if (!run) return showBase();
    startSortie(ruinsDungeon.battles[run.battle]!, 'main', { kind: 'dungeon', dungeonId: run.dungeonId, battle: run.battle }, finishDungeonBattle);
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
    const before = roster;
    const result = applyBattleResult(roster, state, catalog, progressionRules);
    const progress = finishRunBattle(dungeonState, ruinsDungeon, result.report.victory);
    const cleared = progress.outcome.kind === 'cleared';
    const firstClear = progress.outcome.kind === 'cleared' && progress.outcome.firstClear;
    // ボスからの初回の報酬は、戦利品と一緒に入れる（クリアの画面で目立たせる）
    const bossItems = cleared ? clearRewardItems(ruinsDungeon, firstClear) : [];
    const spoils = takeSpoils(result.roster, ruinsDungeon.battles[played]!.tiers[0]?.reward, state, bossItems);
    roster = cleared ? grantClearReward(spoils.roster, ruinsDungeon, firstClear) : spoils.roster;
    dungeonState = progress.state;
    suspended = null;
    persist();
    const outcome = progress.outcome;
    const unlocks = unlockNotes(before, roster);
    const t = battleTitle(played);
    const dungeonName = TEXT.dungeons[ruinsDungeon.id] ?? ruinsDungeon.id;
    const show = () => {
      setScreen('result');
      const heading = TEXT.report.dungeonTitle(t.n, t.mapName);
      if (outcome.kind === 'cleared') {
        showReportScreen(screenEl, result.report, jobOf, canLearn, [{ label: TEXT.report.toBase, onClick: showBase, primary: true }], {
          heading,
          title: TEXT.report.clearTitle(dungeonName),
          highlights: [
            ...(outcome.firstClear ? [TEXT.report.firstClear] : []),
            TEXT.report.reward(clearRewardJp(ruinsDungeon, outcome.firstClear)),
          ],
          unlocks,
          notes: [],
          spoils: spoils.view,
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
          { heading, notes: [TEXT.report.healed], spoils: spoils.view, unlocks },
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
          { heading, notes: [TEXT.report.lostNote], spoils: spoils.view, unlocks },
        );
      }
    };
    afterResultPause(show);
  };

  /** 途中の戦闘の題（拠点の「戦闘を再開」に添える） */
  const suspendedTitle = (origin: BattleOrigin) => {
    if (origin.kind === 'training') return TEXT.base.suspendedTraining(TEXT.tiers[origin.tierId]?.name ?? origin.tierId);
    if (origin.kind === 'story') return TEXT.base.suspendedStory(TEXT.books[origin.bookId] ?? origin.bookId);
    const t = battleTitle(origin.battle);
    return TEXT.base.suspendedDungeon(TEXT.dungeons[origin.dungeonId] ?? origin.dungeonId, t.n, t.mapName);
  };
  const finisherOf = (origin: BattleOrigin) =>
    origin.kind === 'training'
      ? (state: BattleState) => finishBattle(origin.tierId, state)
      : origin.kind === 'story'
        ? (state: BattleState) => finishStoryBattle(origin.bookId, state)
        : finishDungeonBattle;
  /** 途中の戦闘の戦場 */
  const siteOf = (origin: BattleOrigin): BattleSite => {
    if (origin.kind === 'training') return site;
    if (origin.kind === 'dungeon') return ruinsDungeon.battles[origin.battle]!;
    const scene = bookOf(origin.bookId).chapters[origin.chapter]?.scenes[origin.scene];
    const found = scene?.kind === 'battle' ? storySites.find((x) => x.id === scene.battleId) : undefined;
    if (!found) throw new Error('物語の戦闘の戦場が見つかりません');
    return found;
  };

  /**
   * 途中の戦闘を再開する（最後に保存した状態から）。敵の手番の途中で閉じていた時は、続きの敵の行動を AI がもう一度決めて再生する
   * （同じ状態からは必ず同じ行動になる）。決着した直後に閉じていた時は、そのまま結果の画面へ
   */
  const resumeBattle = () => {
    const s = suspended;
    if (!s) return showBase();
    endBattle();
    const def = siteOf(s.origin);
    currentSite = def;
    const onFinished = finisherOf(s.origin);
    if (s.state.winner) return onFinished(s.state);
    useMap(def.map);
    setScreen('battle');
    rig.reset();
    // 戦闘中の会話の途中で閉じていたら、その会話をもう一度出してから続ける（物語の土台）
    const pending = s.dialogue ? [{ type: 'dialogue' as const, scriptId: s.dialogue }] : [];
    battle = createActiveBattle({ state: s.state, events: pending }, onFinished, (st) => saveBattle(s.origin, st));
    if (s.origin.kind === 'story') liveStoryBattle = { bookId: s.origin.bookId };
    refreshCheckWin();
    // 再開した戦闘の地形が、マップの定義から変わっていれば（地形の変化の後）、見た目を合わせる
    void battle.view.updateMap(s.state.map);
    currentFinish = onFinished;
  };

  /**
   * 途中の戦闘から撤退する: 負けとして、それまでに得た経験値と JP を持ち帰る（ゴールドと戦利品はない）。
   * ダンジョンの戦闘なら、挑戦もやめる
   */
  const retreatBattle = () => {
    const s = suspended;
    if (!s) return showBase();
    const lost: BattleState = { ...s.state, winner: 'enemy', turn: null };
    const result = applyBattleResult(roster, lost, catalog, progressionRules);
    const unlocks = unlockNotes(roster, result.roster);
    // 撤退した時は、盗んだ物は持ち帰れない（PR #17 の回答）
    roster = result.roster;
    if (s.origin.kind === 'dungeon') dungeonState = retreat(dungeonState);
    const fromStory = s.origin.kind === 'story';
    suspended = null;
    persist();
    endBattle();
    setScreen('result');
    showReportScreen(screenEl, result.report, jobOf, canLearn, [{ label: fromStory ? TEXT.title.toTitle : TEXT.report.toBase, onClick: fromStory ? showTitle : showBase, primary: true }], {
      heading: suspendedTitle(s.origin),
      title: TEXT.report.retreatTitle,
      unlocks,
      notes: [s.origin.kind === 'dungeon' ? TEXT.report.retreatDungeonNote : TEXT.report.retreatNote],
    });
  };

  /** 出撃: 出撃前の配置の画面を出し、「戦闘開始」で戦闘を始める */
  const startSortie = (
    target: BattleSite,
    tierId: string,
    origin: BattleOrigin,
    onFinished: (state: BattleState) => void,
    onBack: () => void = showBase,
    party?: Roster,
  ) => {
    endBattle();
    currentSite = target;
    const seed = nextSeed;
    nextSeed = randomSeed();
    // 章のために決めた部隊（序章など）で戦う時は、育てた部隊を使わず、経験値と JP も入れない
    const setup = party ? buildSortie(target, tierId, party, catalog) : buildSortie(target, tierId, roster, catalog, progressionRules);
    const begin = (s: typeof setup): ActionResult =>
      startBattle(s, catalog.jobs, battleRules, seed, catalog.spells, catalog.strikes, catalog.passives);
    useMap(target.map);
    setScreen('deploy');
    rig.reset();
    const shell = createBattleShell(begin(setup));
    const active: ActiveBattle = { ...shell };
    battle = active;
    if (origin.kind === 'story') liveStoryBattle = { bookId: origin.bookId };
    refreshCheckWin();
    active.deploy = createDeployController(setup, {
      preview: begin,
      view: { sync: (st) => shell.view.sync(st), setMarks: (m) => setMarks(shell.view, m), setOverlays: (t) => setOverlays(shell.view, t) },
      hud: shell.hud,
      labels: shell.labels,
      onBack: () => onBack(),
      onStart: (final) => {
        active.deploy = undefined;
        setScreen('battle');
        const start = begin(final);
        shell.view.sync(start.state);
        // 戦闘が始まった時点で、途中の戦闘として保存する（その後は、行動がひとつ確定するたびに保存し直す）
        saveBattle(origin, start.state);
        active.controller = createController(shell, start, onFinished, (st) => saveBattle(origin, st));
        currentFinish = onFinished;
      },
    });
  };

  /** 戦闘の表示（ユニットの見た目・情報欄とボタン・頭上の HP）を作る */
  const createBattleShell = (start: ActionResult) => {
    const looks = currentSite?.looks ?? {};
    // 戦場の時刻の光（序章の丘は建国の朝）
    applyTime(currentSite?.time);
    const view = createBattleView({
      scene: stage.scene,
      mapView,
      initial: start.state,
      camera: () => rig.camera,
      canvas: stage.renderer.domElement,
      // 部隊の人物と物語の相手は、人物の見た目で出す（序章に足りない仕組み）
      lookOf: (u) => {
        const id = looks[u.id] ?? (u.team === 'player' ? u.id : undefined);
        return id ? LOOKS[id] : undefined;
      },
      bystanderLook: (look) => LOOKS[look] ?? DEFAULT_LOOK,
      decor: (currentSite?.decor ?? []).map((d) => ({ id: d.id, model: PROP_KINDS[d.kind] ?? 'box', x: d.x, z: d.z })),
    });
    view.sync(start.state);
    // 戦闘の間、遠くで続く旋律（丘の歌）。勝った後は台本の @節を止める で止まる
    const ambient = currentSite?.ambient;
    if (ambient && !start.state.winner) sound.playAmbient(ambient.melody, ambient.timbre, ambient.level);
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
        expToNext: (level) => (level >= progressionRules.maxLevel ? undefined : expToNext(level, progressionRules)),
        ...(currentSite?.roleTags ? { roleTags: currentSite.roleTags } : {}),
        // 物語の戦闘（物語から出撃した戦闘か、人物の呼び名を持つ序章の戦場）
        story: liveStoryBattle !== null || currentSite?.cast !== undefined,
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
    onStateChanged?: (state: BattleState) => void,
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
    // 戦闘の手ほどき（序章に足りない仕組み）: 手ほどきのある戦場で、まだ見ていないか、見たものも出す設定の時
    const site = currentSite;
    // 見た手ほどきを出さない設定で、もう見た戦場でも、物語の段（物の文字を出す段。scriptId）だけは出す
    const seen = site !== undefined && settings.skipSeenTutorials && settings.seenTutorials.includes(site.id);
    const steps = (site?.tutorial ?? []).filter((st) => !seen || st.scriptId !== undefined);
    const tutorial =
      site && steps.length > 0
        ? createTutorial(hudEl, steps, {
            ...(seen ? { storyOnly: true } : {}),
            tileScreen: (x, z) => view.tileScreenPosition(x, z),
            unitScreen: (id) => {
              try {
                return view.unitScreenPosition(id);
              } catch {
                return undefined;
              }
            },
            onFinished: () => {
              if (!settings.seenTutorials.includes(site.id)) updateSettings({ ...settings, seenTutorials: [...settings.seenTutorials, site.id] });
            },
            inscriptionOf: (scriptId) => {
              const line = scriptOf(scriptId).steps.find((x) => x.kind === 'line' && x.inscription);
              return line && line.kind === 'line' && line.speaker ? { label: line.speaker, nodes: inscriptionNodes(line.text) } : undefined;
            },
          })
        : undefined;
    if (battle) battle.tutorial = tutorial;
    pendingTutorial = tutorial;
    return createBattleController(start, {
      view: { ...view, focusTiles, setMarks: (m) => setMarks(view, m), setOverlays: (t) => setOverlays(view, t) },
      hud: shell.hud,
      labels: shell.labels,
      ai: aiConfig,
      onFinished,
      onStateChanged,
      unlockedJobs: unlockedInBattle,
      playDialogue: (scriptId) => playBattleDialogue(scriptId),
      sound: (id) => sound.effect(id),
      ...(tutorial ? { onModeChange: (key, info) => tutorial.onMode(key, info) } : {}),
      ...(import.meta.env.DEV ? { autoPlayer: () => devAutoPlayer } : {}),
    });
  };

  const createActiveBattle = (
    start: ActionResult,
    onFinished: (state: BattleState) => void,
    onStateChanged?: (state: BattleState) => void,
  ): ActiveBattle => {
    const shell = createBattleShell(start);
    const controller = createController(shell, start, onFinished, onStateChanged);
    return { ...shell, controller, ...(pendingTutorial ? { tutorial: pendingTutorial } : {}) };
  };
  /** createController が作った手ほどき（ActiveBattle に入れるまでの受け渡し） */
  let pendingTutorial: TutorialScreen | undefined;

  // ---- 物語（物語の土台）: 題名の画面、章と場面の流れ、会話の場面、戦闘中の会話 ----

  const bookOf = (id: string): BookDefinition => {
    const b = books.find((x) => x.id === id);
    if (!b) throw new Error(`物語の本 ${id} が見つかりません`);
    return b;
  };
  /** 読み込んだ台本（台本の id ごとに1回だけ読む） */
  const scriptCache = new Map<string, Script>();
  const scriptOf = (id: string): Script => {
    let script = scriptCache.get(id);
    if (!script) {
      const text = scriptTexts[id];
      if (text === undefined) throw new Error(`台本 ${id} が見つかりません`);
      script = parseScriptOrThrow(id, text, scriptCatalog);
      scriptCache.set(id, script);
    }
    return script;
  };
  /**
   * 話者の人形の見た目（顔の枠と名前の札の色）。台本の名前 → 人物の見た目。戦闘中は、戦場の人物の名前からユニットの見た目も引く。
   * マップにいない人物（声だけ など）も、名前から引ける
   */
  const speakerLook = (name: string) => {
    const direct = LOOKS[ACTOR_LOOK_IDS[name] ?? ''];
    if (direct) return direct;
    const id = battle ? battleActorId(name) : undefined;
    return (id ? LOOKS[currentSite?.looks?.[id] ?? id] : undefined) ?? DEFAULT_LOOK;
  };
  /** 顔の枠（話者の人形を別のカメラで写す）と、マップ上の話者の印 */
  const portrait = createPortraitRenderer(speakerLook);
  const speakerMark = createSpeakerMark(stage.scene);
  /** 言葉にしない声の、頭上の小さな印 */
  const voiceMarks = createVoiceMarks(stage.scene);
  const VOICE_KINDS: Readonly<Record<string, VoiceKind>> = { voiceShout: 'shout', voiceCall: 'call', voiceLaugh: 'laugh' };
  /** 言葉にしない声: 短い合成音と、頭上の小さな印（文字にはしない） */
  const playVoice = (voice: string, headOf: () => THREE.Vector3 | undefined) => {
    const id = VOICES[voice];
    if (!id) return;
    sound.effect(id);
    devHistory.voices++;
    voiceMarks.show(headOf, VOICE_KINDS[id] ?? 'call', 1.5);
  };
  /** 遠景のカット（@遠景）で見せている舞台（カットの間だけある） */
  let cutView: SceneView | undefined;
  /**
   * 離れた場所を映す短いカット: 今の舞台を隠し、会話用の小さなマップを ms の間だけ見せて、元に戻す（暗転でつなぐ）
   */
  const showCut = async (stageId: string, ms: number, fast: boolean) => {
    const def = stages.find((st) => st.id === stageId);
    if (!def) return;
    // 暗くなってから明るくなるように見えないよう、ほぼ切り替えるだけにする（初見の検査: 遠景が前の画と同じ光に見えるように）
    const fade = fast ? 60 : 120;
    await setDark(true, fade);
    const hidden = stage.scene.children.filter((o) => o.visible && !(o instanceof THREE.Light));
    for (const o of hidden) o.visible = false;
    const hudWas = hudEl.hidden;
    const labelsWas = labelsEl.hidden;
    hudEl.hidden = true;
    labelsEl.hidden = true;
    const cutMap = createMapView(createMap(def.map));
    stage.scene.add(cutMap.group);
    const view = createSceneView({ ...sceneViewOptions(), mapView: cutMap });
    view.sync({ actors: {}, props: Object.fromEntries((def.props ?? []).map((p) => [p.id, { prop: p.kind, x: p.x, z: p.z }])), dark: false });
    cutView = view;
    const timeBefore = currentTime;
    applyTime(def.time, def.sky);
    rig.setMap(rigOptions(cutMap, def.map));
    rig.reset();
    const v = def.view;
    if (v) void rig.lookAt(cutMap.tileTop(v.x, v.z).add(new THREE.Vector3(0, 0.5, 0)), SCENE_ZOOM[v.zoom], 0.01);
    await setDark(false, fade);
    // 遠景の間は、カメラをゆっくり横へ流す（動きのない画のまま待たせないように。序章の演出の直し）
    const hold = fast ? Math.min(ms, 300) : ms;
    if (v) void rig.lookAt(cutMap.tileTop(v.x + 1.5, v.z).add(new THREE.Vector3(0, 0.5, 0)), SCENE_ZOOM[v.zoom], hold / 1000);
    await new Promise<void>((resolve) => window.setTimeout(resolve, hold));
    await setDark(true, fade);
    view.dispose();
    cutView = undefined;
    stage.scene.remove(cutMap.group);
    cutMap.dispose();
    applyTime(timeBefore.name, timeBefore.sky);
    for (const o of hidden) o.visible = true;
    hudEl.hidden = hudWas;
    labelsEl.hidden = labelsWas;
    rig.setMap(rigOptions(mapView, mapDef));
    rig.reset();
    await setDark(false, fade);
  };
  /** 重ねている短い画（@重ねる）の舞台・カメラ（重ねている間だけある） */
  let overlayShow: { scene: THREE.Scene; rig: ReturnType<typeof createCameraRig>; view: SceneView } | undefined;
  /**
   * 短い画を重ねる（@重ねる。序章の場面9: 石が鳴る時のユナの指。第1章以降の回想）。今の画の写しを画面の上に置き、
   * その下で回想の台本（scriptId）の舞台を別のシーンと別のカメラで描く。写しを薄くして回想を透かして見せ、ms の後に戻す。
   * 今の舞台とカメラには触れないので、元の画にそのまま戻る
   */
  const showOverlay = async (scriptId: string, ms: number, fast: boolean) => {
    const script = scriptOf(scriptId);
    const flat = script.steps.flatMap((x) => (x.kind === 'line' ? x.directives : [x.directive]));
    const loc = flat.find((d) => d.kind === 'location');
    const def = loc && loc.kind === 'location' ? stages.find((st) => st.id === loc.stageId) : undefined;
    if (!def) return;
    // 今の画の写し（描いた直後に読み取る）
    stage.renderer.render(stage.scene, rig.camera);
    const shot = document.createElement('img');
    shot.className = 'overlay-snapshot';
    shot.src = stage.renderer.domElement.toDataURL('image/jpeg', 0.85);
    shot.alt = '';
    const tint = document.createElement('div');
    tint.className = 'overlay-tint';
    tint.style.opacity = '0';
    stageEl.append(shot, tint);
    // 回想の舞台（別のシーン・別のカメラ）
    const scene = new THREE.Scene();
    // 回想の画の時刻の光（回想の台本の @時刻 か、マップの時刻。序章の場面9は昨夜の作業台）
    const tod = flat.find((d) => d.kind === 'timeOfDay');
    const hemi = new THREE.HemisphereLight();
    const sun = new THREE.DirectionalLight();
    sun.position.set(6, 12, 4);
    scene.add(hemi, sun);
    applyLighting(scene, { hemi, sun }, timeLight(tod && tod.kind === 'timeOfDay' ? tod.time : def.time), def.sky);
    // 一瞬の画なので、夜の画でも手もとが見える明るさにする（暗くてユナの手が見分けられないと言われたため。初見の検査）
    hemi.intensity *= 3.2;
    sun.intensity *= 2.4;
    const map = createMapView(createMap(def.map));
    scene.add(map.group);
    const oRig = createCameraRig(rigOptions(map, def.map));
    oRig.resize(stage.renderer.domElement.clientWidth, stage.renderer.domElement.clientHeight);
    const view = createSceneView({ ...sceneViewOptions(), scene, mapView: map, camera: () => oRig.camera });
    // 準備（最初の仕草の前まで）は、そのままの様子にそろえる。カメラはすぐに向ける
    let st: StageState = { actors: {}, props: {}, dark: false };
    const firstMotion = flat.findIndex((d) => d.kind === 'gesture' || d.kind === 'wait');
    const setup = firstMotion < 0 ? flat : flat.slice(0, firstMotion);
    const motions = firstMotion < 0 ? [] : flat.slice(firstMotion);
    for (const d of setup) st = applyDirective(st, d);
    view.sync(st);
    for (const d of setup) {
      if (d.kind !== 'camera') continue;
      const point = d.actor ? (view.actorPoint(d.actor) ?? view.propPoint(d.actor)) : map.tileTop(d.x ?? 0, d.z ?? 0);
      if (point) void oRig.lookAt(point, d.zoom ? SCENE_ZOOM[d.zoom] : undefined, 0.01);
    }
    overlayShow = { scene, rig: oRig, view };
    const total = fast ? Math.min(ms, 300) : ms;
    const fade = Math.min(180, Math.floor(total / 4));
    await new Promise((r) => requestAnimationFrame(() => r(undefined)));
    shot.style.transitionDuration = `${fade}ms`;
    tint.style.transitionDuration = `${fade}ms`;
    shot.style.opacity = '0.12';
    tint.style.opacity = '1';
    devHistory.overlays++;
    const started = performance.now();
    view.setSpeed(fast ? 4 : 1);
    for (const d of motions) {
      if (d.kind === 'gesture') {
        const g = GESTURES[d.gesture];
        if (g) await view.gesture(d.actor, g);
      } else if (d.kind === 'wait') await new Promise((r) => window.setTimeout(r, fast ? 0 : d.ms));
    }
    const rest = total - fade - (performance.now() - started);
    if (rest > 0) await new Promise((r) => window.setTimeout(r, rest));
    shot.style.opacity = '1';
    tint.style.opacity = '0';
    await new Promise((r) => window.setTimeout(r, fade));
    overlayShow = undefined;
    view.dispose();
    map.dispose();
    shot.remove();
    tint.remove();
  };
  /** 話者の強調: 頭上に印を出し、カメラを少しだけ寄せる（null で印を消し、カメラを戻す） */
  const highlightSpeaker = (headOf: (() => THREE.Vector3 | undefined) | null) => {
    speakerMark.setTarget(headOf);
    rig.nudge(headOf?.() ?? null);
  };
  /** 会話の場面の舞台（会話の場面の間だけある） */
  let sceneView: SceneView | undefined;
  /** 進めている会話（会話の間だけある） */
  let dialogueRun: DialogueRun | undefined;
  function endScene() {
    sceneView?.dispose();
    sceneView = undefined;
    applyTime(undefined);
  }
  /** 暗転（画面を暗くする）と明転 */
  const setDark = (dark: boolean, ms: number) =>
    new Promise<void>((resolve) => {
      fadeEl.style.transitionDuration = `${ms}ms`;
      fadeEl.classList.toggle('dark', dark);
      fadeEl.dataset.dark = String(dark);
      window.setTimeout(resolve, ms);
    });
  const zoomOf = (d: Extract<Directive, { kind: 'camera' }>) => (d.zoom ? SCENE_ZOOM[d.zoom] : undefined);
  /** カメラをゆっくり動かす秒（早送りの時は短く） */
  const cameraSeconds = (d: Extract<Directive, { kind: 'camera' }>, fast: boolean) => (d.ms ? (fast ? Math.min(d.ms, 300) : d.ms) / 1000 : undefined);
  /** 台本を進める（終わるか飛ばすと解決する） */
  const playScript = async (scriptId: string | Script, port: StagePort, initial?: StageState) => {
    const script = typeof scriptId === 'string' ? scriptOf(scriptId) : scriptId;
    // 前の台本が暗転で終わって暗いままなら、この台本が暗転から始まる時は暗いまま続け、そうでなければ明るくする
    if (heldDark) {
      heldDark = false;
      const first = script.steps.find((s) => s.kind !== 'directive' || (s.directive.kind !== 'cue' && s.directive.kind !== 'placard'));
      if (!(first?.kind === 'directive' && first.directive.kind === 'fadeOut')) await setDark(false, 0);
    }
    const run = runDialogue(script, {
      root: dialogueEl,
      port,
      ...(initial ? { initial } : {}),
      hintSeen: (id) => seenHints.includes(id),
      markHint: (id) => {
        seenHints = [...seenHints, id];
        persist();
      },
      setDark,
      sound: dialogueSound,
      portrait,
      speakerColors: (name) => {
        const look = speakerLook(name);
        return { body: look.body, accent: look.accent };
      },
      overlay: showOverlay,
      onNotice: (kind, t) => (kind === 'placard' ? devHistory.placards : kind === 'nameTag' ? devHistory.nameTags : kind === 'inscription' ? devHistory.inscriptions : devHistory.objectLabels).push(t),
      ...(import.meta.env.DEV ? { autoAdvance: () => devAutoDialogue } : {}),
    });
    dialogueRun = run;
    // 戦闘中の会話の間は、手番の印を隠す（話者の印と見分けがつかないように）
    const battleView = port === battlePort ? battle?.view : undefined;
    battleView?.setActiveMarkerHidden(true);
    try {
      return await run.done;
    } finally {
      if (dialogueRun === run) dialogueRun = undefined;
      speakerMark.setTarget(null);
      battleView?.setActiveMarkerHidden(false);
      // 暗転で終わった台本は、次の場面か画面に切り替わるまで暗いままにする（場面の切り替わりに、一瞬だけ前の舞台が明るく映らないように。初見の検査）
      if (fadeEl.dataset.dark === 'true') heldDark = true;
      else await setDark(false, 0);
      sound.stopMelody();
    }
  };

  /** 会話の場面の舞台を動かす口 */
  const scenePort = (first: SceneView): StagePort => {
    let view = first;
    /** 舞台の場所（@場所）を、会話用のマップに合わせる。違えば、マップと舞台を作り直す */
    /** 舞台の時刻の光（@時刻 で決めた時刻か、今のマップの時刻） */
    const syncTime = (st: StageState) => {
      const def = stages.find((x) => x.id === (st.location ?? sceneBaseStageId));
      applyTime(st.time ?? def?.time, def?.sky);
    };
    const ensureLocation = (st: StageState) => {
      const want = st.location ?? sceneBaseStageId;
      if (!want || want === currentStageId) return;
      view = switchLocation(want);
    };
    return {
    sync: (st) => {
      ensureLocation(st);
      view.sync(st);
      syncTime(st);
    },
    async run(d, before, fast) {
      view.setSpeed(fast ? 4 : 1);
      const after: StageState = applyDirective(before, d);
      switch (d.kind) {
        case 'location':
          ensureLocation(after);
          view.sync(after);
          return syncTime(after);
        case 'timeOfDay':
          return syncTime(after);
        case 'cut':
          return showCut(d.stageId, d.ms, fast);
        case 'voice':
          return playVoice(d.voice, () => view.actorHead(d.actor));
        case 'humMark':
          voiceMarks.show(() => view.actorHead(d.actor), 'hum', d.ms / 1000);
          return;
        case 'propMove':
          return view.moveProp(d.name, d, d.ms / 1000);
        case 'enter':
          return view.enter(d.actor, after.actors[d.actor]!);
        case 'exit':
          return view.exit(d.actor);
        case 'place':
          return view.sync(after);
        case 'walk': {
          const a = before.actors[d.actor];
          return a ? view.walk(d.actor, walkPath(a, d), (d.speed ?? 100) / 100) : undefined;
        }
        case 'face': {
          const a = after.actors[d.actor];
          return a ? view.turn(d.actor, a.facing) : undefined;
        }
        case 'gesture': {
          const g = GESTURES[d.gesture];
          return g ? view.gesture(d.actor, g) : undefined;
        }
        case 'camera': {
          // 人物か物の名前（人物を先に探す）か、マス。手もとなら、人物の手の高さ
          const point = d.actor
            ? d.hands
              ? view.actorPoint(d.actor)?.add(new THREE.Vector3(0, HANDS_OFFSET, 0))
              : (view.actorPoint(d.actor) ?? view.propPoint(d.actor))
            : mapView.tileTop(d.x ?? 0, d.z ?? 0).add(new THREE.Vector3(0, d.standing ? STANDING_OFFSET : 0, 0));
          // 手もとは、ふつうの寄りより、さらに寄る（守り袋を握らせる手もと）
          const zoom = d.hands ? (zoomOf(d) ?? SCENE_ZOOM.near) * HANDS_ZOOM : zoomOf(d);
          if (point) await rig.lookAt(point, zoom, cameraSeconds(d, fast));
          return;
        }
        case 'propPut':
          return view.putProp(d.name, d.prop, d);
        case 'propRemove': {
          const names = propNamesMatching(before, d.name);
          // 片付ける: 人物が物の方を向き、拾う仕草をしてから物が消える
          const who = d.actor ? before.actors[d.actor] : undefined;
          const first = names[0] ? pointOf(before, names[0]) : undefined;
          if (d.actor && who && first) {
            await view.turn(d.actor, facingToward(who, first, who.facing));
            const g = GESTURES['拾う'];
            if (g) await view.gesture(d.actor, g);
          }
          await Promise.all(names.map((n) => view.removeProp(n)));
          return;
        }
        case 'give': {
          // 渡す人が相手の方を向いて手渡し、物が相手に移る
          const giver = before.actors[d.actor];
          const taker = before.actors[d.to];
          if (giver && taker) await view.turn(d.actor, facingToward(giver, taker, giver.facing));
          const g = GESTURES['手渡す'];
          if (g) await view.gesture(d.actor, g);
          view.setItems(d.actor, after.actors[d.actor]?.items);
          view.setItems(d.to, after.actors[d.to]?.items);
          return;
        }
        case 'propChange':
          return view.changeProp(d.name, d.prop);
        case 'carry':
        case 'release':
          return view.setItems(d.actor, after.actors[d.actor]?.items);
        case 'posture':
          return view.setPosture(d.actor, after.actors[d.actor]?.posture);
        case 'light':
        case 'lightOff':
          return view.setLight(d.name, after.lights?.[d.name]);
        default:
          return;
      }
    },
    setWalkTargets: (tiles, goal) => {
      view.setWalkTargets(tiles, goal);
      // 歩かせる間は、カメラを高い位置から見下ろす（家の廊下などで、歩く人物が手前の壁に隠れないように。初見の検査）。終わったら元の高さへ
      const toHeight = (h: 0 | 1 | 2) => {
        for (let i = 0; i < 3 && rig.heightLevel !== h; i++) rig.cycleHeight();
      };
      if (tiles.length > 0) {
        walkHeightBefore ??= rig.heightLevel;
        toHeight(2);
      } else if (walkHeightBefore !== undefined) {
        toHeight(walkHeightBefore);
        walkHeightBefore = undefined;
      }
      // 歩かせる人物と次のマスが見えるように、カメラを寄せる
      const next = tiles[0];
      if (next) void rig.focusOn([mapView.tileTop(next.x, next.z), mapView.tileTop(next.x, next.z).add(new THREE.Vector3(0, 1, 0))]);
    },
    step: async (actor, from, to) => {
      await view.walk(actor, [from, to]);
    },
    highlight: (speaker) => highlightSpeaker(speaker && view.actorHead(speaker) ? () => view.actorHead(speaker) : null),
    setTapTarget: (name) => {
      const c = view.setTapTarget(name);
      // タップする物が見えるように、カメラを寄せる
      if (c) void rig.focusOn([mapView.tileTop(c.x, c.z), mapView.tileTop(c.x, c.z).add(new THREE.Vector3(0, 1, 0))]);
      return c;
    },
    screenOf: (name) => {
      const held = heldOfName(name);
      return worldToScreen(tileOfName(name) ?? (held ? view.actorSlot(held.actor, held.slot) : undefined) ?? view.propTop(name) ?? view.actorHead(name));
    },
    };
  };
  /** 「x,z」と書いた名前なら、そのマスの上面の少し上（物の名前の札を、マップのマスに出す。堰など） */
  const tileOfName = (name: string) => {
    const m = /^(-?\d+),(-?\d+)$/.exec(name);
    return m ? mapView.tileTop(Number(m[1]), Number(m[2])).add(new THREE.Vector3(0, 0.5, 0)) : undefined;
  };
  /** 「ユナの手もと」「トウマの腰」「ゴードの背」のような名前なら、その人物の持ち物の付く所（物の名前の札を、持っている物のそばに出す） */
  const heldOfName = (name: string): { actor: string; slot: 'hand' | 'handL' | 'waist' | 'back' } | undefined => {
    const m = /^(.+)の(手もと|右手|左手|腰|背)$/.exec(name);
    if (!m) return undefined;
    const slot = ({ 手もと: 'hand', 右手: 'hand', 左手: 'handL', 腰: 'waist', 背: 'back' } as const)[m[2] as '手もと'];
    return { actor: m[1]!, slot };
  };
  /** 3D の位置を、画面の座標にする（物の名前の札を出す所。カメラの後ろなら undefined） */
  const worldToScreen = (world: THREE.Vector3 | undefined) => {
    if (!world) return undefined;
    const p = world.clone().project(rig.camera);
    if (p.z > 1) return undefined;
    const rect = stage.renderer.domElement.getBoundingClientRect();
    return { x: rect.left + ((p.x + 1) / 2) * rect.width, y: rect.top + ((1 - p.y) / 2) * rect.height };
  };

  /**
   * 戦闘中の会話と戦闘の後の台本の舞台（序章に足りない仕組み）。人形は戦闘のユニットと背景の人。
   * 台本の人物の名前は、戦場の cast（名前 → id）か、部隊の人物の名前で、ユニットの id に直す。
   * 動きは見せ方だけで、戦闘の状態は変えない（歩く・退場も見た目だけ。戦闘の後の台本で使う）
   */
  /** 台本の @攻撃 で、だれがだれに打ちかかったか（「トウマの後ろ」の向きを決めるため） */
  const lastStruck = new Map<string, string>();
  /** 歩かせる操作の前のカメラの高さ（歩かせる間だけ高くする） */
  let walkHeightBefore: 0 | 1 | 2 | undefined;
  const battleActorId = (name: string): string | undefined => {
    const fromCast = currentSite?.cast?.[name];
    if (fromCast) return fromCast;
    const id = Object.entries(TEXT.unitNames).find(([, n]) => n === name)?.[0];
    return id;
  };
  const battlePort: StagePort = {
    sync: () => {},
    screenOf: (name) => {
      const id = battleActorId(name);
      const held = heldOfName(name);
      const heldId = held ? battleActorId(held.actor) : undefined;
      return worldToScreen(tileOfName(name) ?? (heldId && held ? battle?.view.actorSlot(heldId, held.slot) : undefined) ?? (id ? battle?.view.actorHead(id) : battle?.view.propPoint(name)));
    },
    highlight: (speaker) => {
      const id = speaker ? battleActorId(speaker) : undefined;
      const view = battle?.view;
      highlightSpeaker(id && view?.actorHead(id) ? () => battle?.view.actorHead(id) : null);
    },
    async run(d, _before, fast) {
      const view = battle?.view;
      if (!view) return;
      switch (d.kind) {
        case 'camera': {
          const id = d.actor ? battleActorId(d.actor) : undefined;
          const point = id ? view.actorPoint(id) : d.x !== undefined && d.z !== undefined ? mapView.tileTop(d.x, d.z) : undefined;
          if (point) await rig.lookAt(point, zoomOf(d), cameraSeconds(d, fast));
          return;
        }
        case 'gesture': {
          const id = battleActorId(d.actor);
          const g = GESTURES[d.gesture];
          if (id && g) await view.gesture(id, g);
          return;
        }
        case 'face': {
          const id = battleActorId(d.actor);
          const st = battle?.controller?.state;
          const self = id ? st?.units.find((u) => u.id === id) ?? st?.bystanders?.find((b) => b.id === id) : undefined;
          const otherId = d.toward ? battleActorId(d.toward) : undefined;
          const other = otherId ? st?.units.find((u) => u.id === otherId) ?? st?.bystanders?.find((b) => b.id === otherId) : undefined;
          const facing = d.facing ?? (self && other ? facingToward(self, other, self.facing) : undefined);
          if (id && facing) await view.turnActor(id, facing);
          return;
        }
        case 'walk': {
          const id = battleActorId(d.actor);
          const st = battle?.controller?.state;
          const from = id ? st?.units.find((u) => u.id === id) ?? st?.bystanders?.find((b) => b.id === id) : undefined;
          if (id && from) await view.walkActor(id, walkPath(from, d), (d.speed ?? 100) / 100);
          return;
        }
        case 'exit': {
          const id = battleActorId(d.actor);
          if (id) await view.vanish(id, d.fall === true);
          return;
        }
        case 'wrap': {
          const id = battleActorId(d.actor);
          if (id) await view.wrap(id);
          return;
        }
        // 攻撃の動きと押し返し（序章の丘の始めの演出。見た目だけで、戦闘の状態は変えない）
        case 'strike': {
          const a = battleActorId(d.actor);
          const b = battleActorId(d.target);
          if (a && b) {
            lastStruck.set(a, b);
            await view.strikeActor(a, b, d.outcome, () => sound.effect(d.outcome === 'hit' ? 'hit' : 'miss'));
          }
          return;
        }
        case 'pushBack': {
          const id = battleActorId(d.actor);
          const u = id ? battle?.controller?.state.units.find((x) => x.id === id) : undefined;
          if (id && u) await view.pushBackActor(id, u);
          return;
        }
        case 'light': {
          const color = LIGHT_COLORS[d.color] ?? 0xffffff;
          // 「トウマの後ろ」: その人物の背中側の隣のマス（序章の丘: トウマの背後で帰りの門が開く。人物の上に立てると、だれが光に入ったか分からなくなるため）
          const behind = d.actor ? /^(.+)の後ろ$/.exec(d.actor) : null;
          if (behind) {
            const bid = battleActorId(behind[1]!);
            const units = battle?.controller?.state.units ?? [];
            const u = bid ? units.find((x) => x.id === bid) : undefined;
            if (u) {
              // 背中側: 台本で最後に打ちかかった相手の反対側（見た目の向き）。なければ戦闘の状態の向きの反対側
              const foe = units.find((x) => x.id === (bid ? lastStruck.get(bid) : undefined));
              const dx = foe ? foe.x - u.x : 0;
              const dz = foe ? foe.z - u.z : 0;
              const v = foe && (dx !== 0 || dz !== 0) ? (Math.abs(dx) >= Math.abs(dz) ? { x: Math.sign(dx), z: 0 } : { x: 0, z: Math.sign(dz) }) : DIRECTION_VECTORS[u.facing];
              await view.setLight(d.name, { x: u.x - v.x, z: u.z - v.z, color });
              return;
            }
          }
          const actor = d.actor ? battleActorId(d.actor) : undefined;
          await view.setLight(d.name, actor ? { actor, color } : { ...(d.x !== undefined ? { x: d.x, z: d.z } : {}), color });
          return;
        }
        case 'lightOff':
          await view.setLight(d.name, undefined);
          return;
        case 'cut':
          return showCut(d.stageId, d.ms, fast);
        case 'timeOfDay':
          return applyTime(d.time);
        case 'voice': {
          const id = battleActorId(d.actor);
          if (id) playVoice(d.voice, () => battle?.view.actorHead(id));
          return;
        }
        case 'humMark': {
          const id = battleActorId(d.actor);
          if (id) voiceMarks.show(() => battle?.view.actorHead(id), 'hum', d.ms / 1000);
          return;
        }
        case 'propMove':
          return view.moveProp(d.name, d, (fast ? Math.min(d.ms, 300) : d.ms) / 1000);
        case 'posture': {
          const id = battleActorId(d.actor);
          if (id) await view.setActorPose(id, d.posture === '立つ' ? {} : (POSTURES[d.posture] ?? {}));
          return;
        }
        // 物を置く・消す（戦闘の後の台本。見た目だけ）
        case 'propPut':
          return view.putProp(d.name, PROP_KINDS[d.prop] ?? 'box', d);
        case 'propRemove':
          return view.removeProp(d.name);
        case 'propChange':
          return view.changeProp(d.name, PROP_KINDS[d.prop] ?? 'box');
        case 'carry':
        case 'release': {
          const id = battleActorId(d.actor);
          if (id) view.setItems(id, d.slot, d.kind === 'carry' ? (PROP_KINDS[d.item] ?? '') : '');
          return;
        }
        case 'give': {
          const from = battleActorId(d.actor);
          const to = battleActorId(d.to);
          const g = GESTURES['手渡す'];
          if (from && g) await view.gesture(from, g);
          if (from) view.setItems(from, 'hand', '');
          if (to) view.setItems(to, d.slot, PROP_KINDS[d.item] ?? '');
          return;
        }
        default:
          return;
      }
    },
  };

  /** 戦闘中の会話（マップ上のイベントの「会話」）。出している間は、途中の戦闘にその会話の id を残す（閉じても、再開でもう一度出す） */
  const playBattleDialogue = async (scriptId: string) => {
    if (!scriptTexts[scriptId]) return;
    if (suspended) {
      suspended = { ...suspended, dialogue: scriptId };
      persist();
    }
    await playScript(scriptId, battlePort);
    if (suspended?.dialogue) {
      const { dialogue: _done, ...rest } = suspended;
      void _done;
      suspended = rest;
      persist();
    }
  };

  /** 今の会話の場面の会話用マップの id（自動テスト用） */
  let currentStageId: string | null = null;
  /** 今の会話の場面の、始めの会話用マップの id（@場所 で移る前） */
  let sceneBaseStageId: string | null = null;
  /** 今の会話の場面の印（場所を移しても同じ。場面が終わった時に、まだ同じ場面かを確かめる） */
  let sceneToken: object = {};

  /** 題名の画面 */
  const showTitle = () => {
    endBattle();
    storyBaseNext = null;
    setScreen('title');
    showTitleScreen(screenEl, {
      story: () => ({ available: bookOf('main').chapters.length > 0 }),
      onStory: () => openStoryMenu('main'),
      onPlay: () => showBase(),
      onSettings: () => showSettingsSheet(screenEl, () => settings, updateSettings),
    });
  };

  /** 場面の札（例: 序章 場面4 家・夕食とユナの部屋の夜） */
  const sceneLabelOf = (book: BookDefinition, chapter: number, scene: number) => {
    const c = book.chapters[chapter];
    const sc = c?.scenes[scene];
    if (!c || !sc) return '';
    return TEXT.story.sceneLabel(TEXT.story.chapters[c.id] ?? c.id, sc.scriptScene, TEXT.story.scenes[sc.id] ?? sc.id);
  };

  /**
   * 題名の画面の「物語」: 進み具合がなければ（確認用の機能が切なら）、そのまま最初から始める。
   * 進み具合があれば「つづきから」「はじめから」（確認つき）を選ぶ画面を出す。確認用の機能が入なら「場面を選ぶ」も出す
   */
  const openStoryMenu = (bookId: string) => {
    const book = bookOf(bookId);
    const progress = story[bookId];
    if (!progress && !settings.checkTools) return playBook(bookId, true);
    endBattle();
    setScreen('story-menu');
    const p = progress ? normalizeProgress(book, progress) : undefined;
    showStoryMenu(screenEl, {
      hasProgress: p !== undefined,
      ...(p ? { continueSub: p.finished ? TEXT.story.nextChapterSoon : sceneLabelOf(book, p.chapter, p.scene) } : {}),
      checkTools: settings.checkTools,
      onContinue: () => playBook(bookId, false),
      onRestart: () => restartBook(bookId),
      onSceneSelect: () => openSceneSelect(bookId),
      onBack: showTitle,
    });
  };

  /**
   * 「はじめから」: 物語の進み具合だけを消して、最初から始める。育てた部隊・装備・ゴールド・訓練と遺跡の記録は消さない。
   * 一度見た手ほどき（物語の戦闘の手ほどきと、会話の操作の手引き）は、もう一度出るように戻す
   */
  const restartBook = (bookId: string) => {
    const storyIds = new Set(storySites.map((x) => x.id));
    if (settings.seenTutorials.some((id) => storyIds.has(id))) updateSettings({ ...settings, seenTutorials: settings.seenTutorials.filter((id) => !storyIds.has(id)) });
    seenHints = [];
    playBook(bookId, true);
  };

  /** 確認用の機能の「場面を選ぶ」: 章のタブと、場面の一覧 */
  const openSceneSelect = (bookId: string) => {
    const book = bookOf(bookId);
    endBattle();
    setScreen('scene-select');
    const entries = sceneEntries(book);
    showSceneSelect(
      screenEl,
      book.chapters.map((c, ci) => ({
        id: c.id,
        label: TEXT.story.chapters[c.id] ?? c.id,
        scenes: entries.filter((e) => e.chapter === ci).map((e) => ({ label: sceneLabelOf(book, e.chapter, e.scene), onSelect: () => startAtScene(bookId, e.chapter, e.scene) })),
      })),
      () => openStoryMenu(bookId),
      story[bookId]?.chapter ?? 0,
    );
  };

  /** 選んだ場面から始める（それより前の出来事は済んだことにする。この後の物語の戦闘では、報酬を得ない） */
  const startAtScene = (bookId: string, chapter: number, scene: number) => {
    const p = progressAt(bookOf(bookId), chapter, scene);
    if (!p) return;
    if (suspended?.origin.kind === 'story' && suspended.origin.bookId === bookId) suspended = null;
    story = { ...story, [bookId]: p };
    persist();
    runScene(bookId, true);
  };

  /**
   * 確認用の機能の「勝ったことにする」: 物語の戦闘を、味方の勝ちで終える。戦闘の前の手ほどきと演出も打ち切る。
   * 勝った後の台本は、勝った時の様子（壊す物が壊れ、水が流れた後など）の上で流す。経験値・JP・ゴールド・戦利品は得ない
   */
  const checkWinBattle = async () => {
    const b = battle;
    const live = liveStoryBattle;
    if (!b || !live) return;
    const state = b.controller?.state ?? b.deploy?.state;
    if (!state || state.winner) return;
    liveStoryBattle = null;
    refreshCheckWin();
    b.tutorial?.dispose();
    b.tutorial = undefined;
    b.controller?.dispose();
    b.deploy = undefined;
    currentFinish = undefined;
    const run = dialogueRun;
    if (run) {
      run.abort();
      await run.done.catch(() => undefined);
    }
    hudEl.innerHTML = '';
    const won = forceVictory(state).state;
    if (screen === 'deploy') setScreen('battle');
    setMarks(b.view, []);
    setOverlays(b.view, []);
    b.view.sync(won);
    void b.view.updateMap(won.map);
    finishStoryBattle(live.bookId, won, true);
  };

  /**
   * 物語の本を始める・続ける。続きからの時は、まず「これまで」を出す。途中の戦闘があれば、それを再開する。
   * 最後まで終えた本の「つづきから」は、終わりの画面（序章の後は「第1章は準備中です」）を出す
   */
  const playBook = (bookId: string, fresh: boolean) => {
    const book = bookOf(bookId);
    if (fresh || !story[bookId]) {
      // 最初から: この本の途中の戦闘は捨てる
      if (suspended?.origin.kind === 'story' && suspended.origin.bookId === bookId) suspended = null;
      story = { ...story, [bookId]: STORY_START };
      persist();
      return runScene(bookId);
    }
    const progress = normalizeProgress(book, story[bookId]);
    story = { ...story, [bookId]: progress };
    const go = () => {
      if (suspended?.origin.kind === 'story' && suspended.origin.bookId === bookId) return resumeBattle();
      runScene(bookId, true);
    };
    const recap = recapFor(book, progress);
    if (recap.length === 0) return go();
    endBattle();
    setScreen('recap');
    showRecapScreen(screenEl, recap, go);
  };

  /** 今の場面を始める。章の最初の場面なら、先に章の「これまで」を出す（再開の「これまで」を出した直後は出さない） */
  const runScene = (bookId: string, recapShown = false) => {
    const book = bookOf(bookId);
    const progress = story[bookId] ?? STORY_START;
    const startRecap = recapShown ? [] : chapterStartRecap(book, progress);
    if (startRecap.length > 0) {
      endBattle();
      setScreen('recap');
      return showRecapScreen(screenEl, startRecap, () => runScene(bookId, true));
    }
    const now = currentScene(book, progress);
    if (!now) {
      setScreen('story-end');
      return showStoryEndScreen(screenEl, TEXT.books[bookId] ?? bookId, showTitle);
    }
    const scene = now.scene;
    if (scene.kind === 'dialogue' || scene.kind === 'interactive') {
      // 暗転の上の字幕から始まる場面は、舞台を見せる前から暗くしておく（人物が並んだ画を、字幕の前に一瞬見せないため）
      if (startsDark(scriptOf(scene.scriptId))) void setDark(true, 0);
      const { view, initial } = openScene(scene.stageId);
      const token = sceneToken;
      void playScript(scene.scriptId, scenePort(view), initial).then(() => {
        if (sceneToken === token && sceneView) completeScene(bookId);
      });
      return;
    }
    if (scene.kind === 'battle') {
      const target = storySites.find((x) => x.id === scene.battleId);
      if (!target) throw new Error(`物語の戦闘 ${scene.battleId} が見つかりません`);
      const origin: BattleOrigin = { kind: 'story', bookId, chapter: progress.chapter, scene: progress.scene };
      const party = scene.partyId ? parties[scene.partyId] : undefined;
      if (scene.partyId && !party) throw new Error(`章のための部隊 ${scene.partyId} が見つかりません`);
      return startSortie(target, 'main', origin, (state) => finishStoryBattle(bookId, state), showTitle, party);
    }
    // 拠点: 編成と店を使い、「物語を進める」で次へ
    showBase();
    storyBaseNext = () => completeScene(bookId);
    base.show();
  };

  /** 会話の場面の舞台を用意する（会話用マップ・人形と物の舞台・最初の様子） */
  function sceneViewOptions() {
    return {
      scene: stage.scene,
      mapView,
      camera: () => rig.camera,
      canvas: stage.renderer.domElement,
      lookOf: (name: string) => LOOKS[ACTOR_LOOK_IDS[name] ?? ''] ?? DEFAULT_LOOK,
      propModelOf: (kind: string) => PROP_KINDS[kind] ?? 'box',
      postureOf: (name: string) => POSTURES[name],
      lightColorOf: (name: string) => LIGHT_COLORS[name] ?? 0xffffff,
    };
  }
  /** 会話用マップの空の色（夜空など）。省いたマップは昼の空 */
  /** 会話用マップの時刻の光と空の色（夜空のマップなど） */
  const applySky = (def: { sky?: number; time?: string }) => applyTime(def.time, def.sky);
  /** 会話の場面の途中で場所を移す（@場所）: 会話用マップと舞台を作り直す（今の会話は続ける） */
  function switchLocation(stageId: string): SceneView {
    const stageDef = stages.find((st) => st.id === stageId);
    if (!stageDef) throw new Error(`会話の場面のマップ ${stageId} が見つかりません`);
    sceneView?.dispose();
    currentStageId = stageDef.id;
    devHistory.stages.add(stageDef.id);
    useMap(stageDef.map);
    mapView.group.visible = stageDef.hideGround !== true;
    applySky(stageDef);
    rig.reset();
    const view = createSceneView(sceneViewOptions());
    sceneView = view;
    return view;
  }
  function openScene(stageId: string): { view: SceneView; initial: StageState } {
    endBattle();
    endScene();
    const stageDef = stages.find((st) => st.id === stageId);
    if (!stageDef) throw new Error(`会話の場面のマップ ${stageId} が見つかりません`);
    currentStageId = stageDef.id;
    sceneBaseStageId = stageDef.id;
    sceneToken = {};
    useMap(stageDef.map);
    mapView.group.visible = stageDef.hideGround !== true;
    applySky(stageDef);
    setScreen('scene');
    rig.reset();
    const view = createSceneView(sceneViewOptions());
    sceneView = view;
    // 会話のマップに置いておく物（家具など）を、舞台の最初の様子にする
    const initial: StageState = {
      actors: {},
      props: Object.fromEntries((stageDef.props ?? []).map((p) => [p.id, { prop: p.kind, x: p.x, z: p.z }])),
      dark: false,
    };
    return { view, initial };
  }

  /** 台本が、最初の台詞より前に、すぐの暗転（@暗転 0）をするか */
  const startsDark = (s: Script) => {
    for (const st of s.steps) {
      if (st.kind === 'line') return false;
      if (st.directive.kind === 'fadeOut' && st.directive.ms === 0) return true;
    }
    return false;
  };

  /** 今の場面を終えた: 進み具合を進めて保存し、次の場面へ */
  const completeScene = (bookId: string) => {
    story = { ...story, [bookId]: advanceScene(bookOf(bookId), story[bookId] ?? STORY_START) };
    persist();
    runScene(bookId);
  };

  /** 今の物語の戦闘の場面（章のための部隊で戦うか、戦闘の後の台本を知るため） */
  const storyBattleScene = (bookId: string) => {
    const now = currentScene(bookOf(bookId), story[bookId] ?? STORY_START);
    return now?.scene.kind === 'battle' ? now.scene : undefined;
  };

  /**
   * 勝った後の台本を、戦闘のマップの上で流す（序章に足りない仕組み。帰りの門の光・人物が消える、など）。
   * 決着した直後に閉じて再開した時は、戦闘の見た目を作り直してから流す
   */
  const playAfterVictory = async (target: BattleSite, state: BattleState) => {
    if (!target.afterVictory) return;
    if (!battle) {
      useMap(target.map);
      setScreen('battle');
      rig.reset();
      currentSite = target;
      const shell = createBattleShell({ state, events: [] });
      battle = { ...shell };
      void shell.view.updateMap(state.map);
    }
    hudEl.hidden = true;
    labelsEl.hidden = true;
    await playScript(target.afterVictory, battlePort);
  };

  /**
   * 物語の戦闘が終わった: 経験値と JP（勝てばゴールドと戦利品）を部隊に入れ、勝てば次の場面へ。負ければやり直すかタイトルへ。
   * 章のために決めた部隊で戦った時（序章など）は、部隊に何も入れず、結果の画面も出さない（勝てば台本の後に次の場面へ）
   */
  const finishStoryBattle = (bookId: string, state: BattleState, checked = false) => {
    liveStoryBattle = null;
    refreshCheckWin();
    const origin = suspended?.origin;
    const target = origin?.kind === 'story' ? siteOf(origin) : storySites.find((x) => x.id === storyBattleScene(bookId)?.battleId);
    const won = state.winner === 'player';
    // 確認用の機能で進めた時（勝ったことにした・場面を選んで始めた）は、章のために決めた部隊の時と同じく、部隊に何も入れない
    if (storyBattleScene(bookId)?.partyId || checked || isChecked(story[bookId])) {
      // 勝った時は、台本を流し終えるまで途中の戦闘を残す（台本の途中で閉じても、もう一度流せるように）
      if (!won) {
        suspended = null;
        persist();
      }
      window.setTimeout(() => {
        void (async () => {
          if (won && target) await playAfterVictory(target, state);
          suspended = null;
          persist();
          endBattle();
          if (won) return completeScene(bookId);
          setScreen('result');
          showStoryBattleLost(screenEl, () => runScene(bookId, true), showTitle);
        })();
      }, 900);
      return;
    }
    const before = roster;
    const result = applyBattleResult(roster, state, catalog, progressionRules);
    const spoils = takeSpoils(result.roster, target?.tiers[0]?.reward, state);
    suspended = null;
    updateRoster(spoils.roster);
    const showResult = () => {
      setScreen('result');
      showReportScreen(
        screenEl,
        result.report,
        jobOf,
        canLearn,
        won
          ? [{ label: TEXT.story.next, onClick: () => completeScene(bookId), primary: true }]
          : [
              { label: TEXT.story.retry, onClick: () => runScene(bookId, true), primary: true },
              { label: TEXT.title.toTitle, onClick: showTitle },
            ],
        { heading: TEXT.books[bookId] ?? bookId, spoils: spoils.view, unlocks: unlockNotes(before, roster) },
      );
    };
    if (won && target?.afterVictory) {
      window.setTimeout(() => {
        void playAfterVictory(target, state).then(() => {
          endBattle();
          showResult();
        });
      }, 900);
      return;
    }
    afterResultPause(showResult);
  };

  const canvas = stage.renderer.domElement;
  /** 開発中だけ: 最近のタップの記録（自動プレイで失敗した時の調査用） */
  const tapLog: { x: number; y: number; coords: readonly { x: number; z: number }[]; mode: string }[] = [];
  const pick = createPicker(canvas, () => rig.camera, () => sceneView?.pickTargets() ?? battle?.view.pickTargets() ?? [mapView.group]);
  const candidatesAt = (x: number, y: number) =>
    battle ? battle.view.tapCandidates(pick, x, y) : { coords: [] as { x: number; z: number }[] };
  attachCameraInput(canvas, rig, (x, y) => {
    // 会話で台詞・語りを読んでいる時は、マップのどこを押しても次へ進む
    if (dialogueRun?.advance()) return;
    // 会話の場面の「歩かせる」: タップしたマス（人形を押した時はそのマス）を渡す
    if (sceneView && dialogueRun) {
      const coords = pick(x, y).flatMap((h) => {
        const c = sceneView?.coordOf(h.object);
        return c ? [c] : [];
      });
      dialogueRun.onTap(coords);
      return;
    }
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
  /** 開発中だけ: 味方の手番も AI が動かす（自動プレイで、物語の戦闘を通して確かめるため） */
  let devAutoPlayer = false;
  /** 開発中だけ: URL に ?autodialogue=1 と付けると、会話の台詞をタップを待たずに進める（今までの自動プレイの確認のため） */
  const devAutoDialogue = import.meta.env.DEV && new URLSearchParams(location.search).get('autodialogue') === '1';
  if (import.meta.env.DEV) {
    const speedParam = Number(new URLSearchParams(location.search).get('speed'));
    if (speedParam > 0) speed = Math.min(speedParam, 20);
    const v = () => {
      if (!battle) throw new Error('戦闘中ではありません');
      return battle.view;
    };
    (window as unknown as Record<string, unknown>).__tactics = {
      /** 今の画面（title / base / roster / battle / result / scene など） */
      screen: () => screen,
      /** 味方の手番も AI に任せる（true）か、タップで操作する（false）か */
      setAutoPlayer: (on: boolean) => {
        devAutoPlayer = on;
        // 味方の入力を待っている時に切り替えたら、その手番から AI で進める
        const c = battle?.controller;
        if (on && c && c.mode !== 'busy' && c.mode !== 'ended') c.resumeAuto?.();
      },
      /** 今の会話の様子（会話がなければ null。物語の土台） */
      dialogue: () => dialogueRun?.status() ?? null,
      /** 今の会話の舞台の様子（人物・物・肩書き。会話がなければ null） */
      dialogueStage: () => dialogueRun?.stage() ?? null,
      /**
       * 渡した台本のテキストを、会話用マップの上で流す（会話の見せ方と台本の指示を確かめるため。物語の進み具合は変えない）。
       * 終わると題名の画面に戻る
       */
      playScene: (text: string, stageId: string) => {
        const script = parseScriptOrThrow('test', text, scriptCatalog);
        const { view, initial } = openScene(stageId);
        const token = sceneToken;
        void playScript(script, scenePort(view), initial).then(() => {
          if (sceneToken !== token || !sceneView) return;
          endScene();
          showTitle();
        });
      },
      /** 鳴っている旋律と、最近の効果音（序章に足りない仕組み） */
      sound: () => ({ melody: sound.melody(), recent: sound.recent(), ambient: sound.ambient(), counts: sound.counts() }),
      /** 言葉にしない声の印の数・遠景のカットを見せているか */
      voiceMarks: () => voiceMarks.count,
      inCut: () => cutView !== undefined,
      /** 手ほどきの様子（なければ null） */
      tutorial: () => battle?.tutorial?.status() ?? null,
      /** 設定 */
      settings: () => settings,
      /** 物語の進み具合 */
      story: () => story,
      /** これまでに鳴らした旋律（旋律/音色）・見せた会話用マップ・言葉にしない声の数（読み込み直すと消える） */
      time: () => currentTime.name,
      /** 押す場所の上の揺れる目印が出ているか（会話の場面） */
      beacon: () => sceneView?.beaconVisible() ?? false,
      history: () => ({ melodies: [...devHistory.melodies], stages: [...devHistory.stages], voices: devHistory.voices, overlays: devHistory.overlays, placards: [...devHistory.placards], nameTags: [...devHistory.nameTags], objectLabels: [...devHistory.objectLabels], inscriptions: [...devHistory.inscriptions] }),
      /** 暗転しているか */
      dark: () => fadeEl.classList.contains('dark'),
      /** 話者の印が見えているか・顔の枠に写している人物（会話の見せ方） */
      speakerView: () => ({ mark: speakerMark.visible, portrait: portrait.current }),
      /** 会話の場面の人物とマスの画面座標 */
      actorScreen: (name: string) => sceneView?.actorScreen(name) ?? null,
      sceneTileScreen: (x: number, z: number) => sceneView?.tileScreen(x, z) ?? null,
      /** 部隊の状態 */
      roster: () => roster,
      /** ダンジョンの進み具合とクリアの記録 */
      dungeon: () => dungeonState,
      /** 保存してある途中の戦闘（なければ null） */
      suspended: () => suspended,
      /** 訓練戦の記録（段階ごとの勝利の回数） */
      records: () => records,
      /** 今の店の品ぞろえ */
      stock: () => stock(),
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
      /** ユニットの見た目の様子（膝をついているか、見た目の上でいるマス。戦闘で人は死なない決まり） */
      unitPose: (id: string) => battle?.view?.poseOf(id) ?? null,
      /** マスの上面の中央の、3D の世界の位置 */
      tileWorld: (x: number, z: number) => {
        const p = mapView.tileTop(x, z);
        return { x: p.x, z: p.z };
      },
      /** 今の会話の場面の会話用マップの id */
      sceneStage: () => currentStageId,
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
        // 確認用の場面なので、決着しても部隊には反映しない（途中の戦闘としても保存しない。それまでの途中の戦闘は捨てる）
        currentFinish = undefined;
        if (suspended) {
          suspended = null;
          persist();
        }
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
    sceneView?.update(dt, elapsed);
    cutView?.update(dt, elapsed);
    speakerMark.update(elapsed);
    voiceMarks.update(dt, elapsed);
    if (overlayShow) {
      // 短い画を重ねている間は、回想の舞台を描く（今の画の写しを、その上に薄く置いている）
      overlayShow.rig.update(dt);
      overlayShow.view.update(dt, elapsed);
      stage.renderer.render(overlayShow.scene, overlayShow.rig.camera);
    } else stage.renderer.render(stage.scene, rig.camera);
    if (battle) {
      battle.labels.setPositions(battle.view.unitAnchors());
      battle.hud.update();
      battle.tutorial?.update();
    }
  });

  // 開発中だけ: URL に ?start=base と付けると、題名の画面を飛ばして拠点から始める（自動プレイの今までの確認のため）
  if (import.meta.env.DEV && new URLSearchParams(location.search).get('start') === 'base') showBase();
  else showTitle();
}

/** マップの id から、マップの定義を探す（自動プレイで、別のマップの戦闘を用意する時に使う） */
function mapDefinitionOf(id: string): MapDefinition {
  const def = [twinHillsBattle, ...ruinsDungeon.battles, ...storySites, ...stages].find((b) => b.map.id === id)?.map;
  if (!def) throw new Error(`マップ ${id} が見つかりません`);
  return def;
}

function randomSeed(): number {
  return Math.floor(Math.random() * 0x7fffffff) + 1;
}

main();
