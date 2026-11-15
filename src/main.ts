import './ui/style.css';
import * as THREE from 'three';
import { startBattle } from './core/battle';
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
import { applyDirective, walkPath, type StageState } from './core/dialogue';
import { parseScriptOrThrow, type Directive, type Script } from './core/script';
import { advanceScene, currentScene, normalizeProgress, recapFor, STORY_START, type BookDefinition, type StoryProgress } from './core/story';
import { books } from './data/story/books';
import { scriptTexts } from './data/story/scripts';
import { ACTOR_LOOKS as ACTOR_LOOK_IDS, GESTURES, LIGHT_COLORS, POSTURES, PROP_KINDS, scriptCatalog } from './data/story/stageDefs';
import { stages } from './data/story/stages';
import { parties } from './data/story/parties';
import { DEFAULT_LOOK, LOOKS } from './data/story/looks';
import { SOUND_EFFECTS } from './data/sounds';
import { trialWeirBattle } from './data/battles/trialWeir';
import { createSceneView, type SceneView } from './render/sceneView';
import { facingToward, runDialogue, type DialogueRun, type DialogueSound, type StagePort } from './ui/dialogue';
import { showRecapScreen, showStoryBattleLost, showStoryEndScreen, showTitleScreen } from './ui/titleScreen';
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
type ScreenName = 'title' | 'base' | 'roster' | 'shop' | 'deploy' | 'battle' | 'result' | 'scene' | 'recap' | 'story-end';

/** 物語の戦闘の戦場（場面の battleId で引く） */
const storySites: readonly BattleSite[] = [trialWeirBattle];
/** 会話の場面のカメラの寄り（その画面の形の最初の拡大率を 1 として） */
const SCENE_ZOOM = { far: 0.85, mid: 1.25, near: 1.9 } as const;

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
  const updateSettings = (next: GameSettings) => {
    settings = next;
    settingsStore.save(next);
    sound.setVolume(next.volume, next.muted);
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
  sound.onMelodyChange(() => {
    const m = sound.melody();
    soundMark.show(m ? TEXT.sound.melodyMark(m.mark ?? TEXT.sound.timbres[m.timbre] ?? m.timbre) : null);
  });
  /** 会話から使う音の口 */
  const dialogueSound: DialogueSound = {
    playMelody: (melody, timbre, mark) => sound.playMelody(melody, timbre, mark),
    stopMelody: () => sound.stopMelody(),
    waitMelody: (remaining) => sound.waitMelody(remaining),
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
  /** 今の戦闘の戦場（見た目・手ほどき・台本の人物の名前に使う） */
  let currentSite: BattleSite | undefined;
  /** 開発中だけ: 今の戦闘が決着した時に呼ぶ処理（自動プレイで、ダンジョンの流れを確かめる時に決着を早める） */
  let currentFinish: ((state: BattleState) => void) | undefined;
  const setScreen = (name: ScreenName) => {
    screen = name;
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
  };

  const endBattle = () => {
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
        expToNext: (level) => (level >= progressionRules.maxLevel ? undefined : expToNext(level, progressionRules)),
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
    const steps = site?.tutorial ?? [];
    const tutorial =
      site && steps.length > 0 && !(settings.skipSeenTutorials && settings.seenTutorials.includes(site.id))
        ? createTutorial(hudEl, steps, {
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
  /** 会話の場面の舞台（会話の場面の間だけある） */
  let sceneView: SceneView | undefined;
  /** 進めている会話（会話の間だけある） */
  let dialogueRun: DialogueRun | undefined;
  function endScene() {
    sceneView?.dispose();
    sceneView = undefined;
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
  /** 台本を進める（終わるか飛ばすと解決する） */
  const playScript = async (scriptId: string, port: StagePort, initial?: StageState) => {
    const run = runDialogue(scriptOf(scriptId), {
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
      ...(import.meta.env.DEV ? { autoAdvance: () => devAutoDialogue } : {}),
    });
    dialogueRun = run;
    try {
      return await run.done;
    } finally {
      if (dialogueRun === run) dialogueRun = undefined;
      await setDark(false, 0);
      sound.stopMelody();
    }
  };

  /** 会話の場面の舞台を動かす口 */
  const scenePort = (view: SceneView): StagePort => ({
    sync: (st) => view.sync(st),
    async run(d, before, fast) {
      view.setSpeed(fast ? 4 : 1);
      const after: StageState = applyDirective(before, d);
      switch (d.kind) {
        case 'enter':
          return view.enter(d.actor, after.actors[d.actor]!);
        case 'exit':
          return view.exit(d.actor);
        case 'place':
          return view.sync(after);
        case 'walk': {
          const a = before.actors[d.actor];
          return a ? view.walk(d.actor, walkPath(a, d)) : undefined;
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
          const point = d.actor ? view.actorPoint(d.actor) : mapView.tileTop(d.x ?? 0, d.z ?? 0);
          if (point) await rig.lookAt(point, zoomOf(d));
          return;
        }
        case 'propPut':
          return view.putProp(d.name, d.prop, d);
        case 'propRemove':
          return view.removeProp(d.name);
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
      // 歩かせる人物と次のマスが見えるように、カメラを寄せる
      const next = tiles[0];
      if (next) void rig.focusOn([mapView.tileTop(next.x, next.z), mapView.tileTop(next.x, next.z).add(new THREE.Vector3(0, 1, 0))]);
    },
    step: async (actor, from, to) => {
      await view.walk(actor, [from, to]);
    },
  });

  /**
   * 戦闘中の会話と戦闘の後の台本の舞台（序章に足りない仕組み）。人形は戦闘のユニットと背景の人。
   * 台本の人物の名前は、戦場の cast（名前 → id）か、部隊の人物の名前で、ユニットの id に直す。
   * 動きは見せ方だけで、戦闘の状態は変えない（歩く・退場も見た目だけ。戦闘の後の台本で使う）
   */
  const battleActorId = (name: string): string | undefined => {
    const fromCast = currentSite?.cast?.[name];
    if (fromCast) return fromCast;
    const id = Object.entries(TEXT.unitNames).find(([, n]) => n === name)?.[0];
    return id;
  };
  const battlePort: StagePort = {
    sync: () => {},
    async run(d) {
      const view = battle?.view;
      if (!view) return;
      switch (d.kind) {
        case 'camera': {
          const id = d.actor ? battleActorId(d.actor) : undefined;
          const point = id ? view.actorPoint(id) : d.x !== undefined && d.z !== undefined ? mapView.tileTop(d.x, d.z) : undefined;
          if (point) await rig.lookAt(point, zoomOf(d));
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
          if (id && from) await view.walkActor(id, walkPath(from, d));
          return;
        }
        case 'exit': {
          const id = battleActorId(d.actor);
          if (id) await view.vanish(id);
          return;
        }
        case 'light': {
          const actor = d.actor ? battleActorId(d.actor) : undefined;
          const color = LIGHT_COLORS[d.color] ?? 0xffffff;
          await view.setLight(d.name, actor ? { actor, color } : { ...(d.x !== undefined ? { x: d.x, z: d.z } : {}), color });
          return;
        }
        case 'lightOff':
          await view.setLight(d.name, undefined);
          return;
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

  /** 題名の画面 */
  const showTitle = () => {
    endBattle();
    storyBaseNext = null;
    setScreen('title');
    showTitleScreen(screenEl, {
      story: () => ({ available: bookOf('main').chapters.length > 0, inProgress: story.main !== undefined && !story.main.finished }),
      trial: () => ({ inProgress: story.trial !== undefined && !story.trial.finished && !(story.trial.chapter === 0 && story.trial.scene === 0) }),
      onStory: () => playBook('main', false),
      onPlay: () => showBase(),
      onTrial: (fresh) => playBook('trial', fresh),
      onSettings: () => showSettingsSheet(screenEl, () => settings, updateSettings),
    });
  };

  /**
   * 物語の本を始める・続ける。続きからの時は、まず「これまで」を出す。途中の戦闘があれば、それを再開する
   */
  const playBook = (bookId: string, fresh: boolean) => {
    const book = bookOf(bookId);
    if (fresh || !story[bookId] || story[bookId]!.finished) {
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
      endBattle();
      endScene();
      const stageDef = stages.find((st) => st.id === scene.stageId);
      if (!stageDef) throw new Error(`会話の場面のマップ ${scene.stageId} が見つかりません`);
      useMap(stageDef.map);
      setScreen('scene');
      rig.reset();
      const view = createSceneView({
        scene: stage.scene,
        mapView,
        camera: () => rig.camera,
        canvas: stage.renderer.domElement,
        lookOf: (name) => LOOKS[ACTOR_LOOK_IDS[name] ?? ''] ?? DEFAULT_LOOK,
        propModelOf: (kind) => PROP_KINDS[kind] ?? 'box',
        postureOf: (name) => POSTURES[name],
        lightColorOf: (name) => LIGHT_COLORS[name] ?? 0xffffff,
      });
      sceneView = view;
      // 会話のマップに置いておく物（家具など）を、舞台の最初の様子にする
      const initial: StageState = {
        actors: {},
        props: Object.fromEntries((stageDef.props ?? []).map((p) => [p.id, { prop: p.kind, x: p.x, z: p.z }])),
        dark: false,
      };
      void playScript(scene.scriptId, scenePort(view), initial).then(() => {
        if (sceneView === view) completeScene(bookId);
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
  const finishStoryBattle = (bookId: string, state: BattleState) => {
    const origin = suspended?.origin;
    const target = origin?.kind === 'story' ? siteOf(origin) : storySites.find((x) => x.id === storyBattleScene(bookId)?.battleId);
    const won = state.winner === 'player';
    if (storyBattleScene(bookId)?.partyId) {
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
      /** 鳴っている旋律と、最近の効果音（序章に足りない仕組み） */
      sound: () => ({ melody: sound.melody(), recent: sound.recent() }),
      /** 手ほどきの様子（なければ null） */
      tutorial: () => battle?.tutorial?.status() ?? null,
      /** 設定 */
      settings: () => settings,
      /** 物語の進み具合 */
      story: () => story,
      /** 暗転しているか */
      dark: () => fadeEl.classList.contains('dark'),
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
    stage.renderer.render(stage.scene, rig.camera);
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
