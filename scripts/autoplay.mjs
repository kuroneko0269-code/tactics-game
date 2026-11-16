// 自動プレイによる画面の確認（npm run autoplay）。
//
// 実際のブラウザ（Chromium）で、画面のマスやユニット、ボタンをタップして1戦を最後まで進め、
// 勝敗と手番数が「core だけで計算した結果」と一致するかを確かめる。
// 画面の不具合（タップしたのに違うマスが選ばれる、ボタンが押せない、など）を見つけるためのもの。
//
// 育成の流れ（フェーズ2-1a）も確かめる:
// 拠点 →「出撃」→ 敵の強さ「やさしい」→ 1戦 → 結果の画面（得た経験値と JP が core の計算と一致）→ 拠点
// →「編成」でアビリティの習得・ジョブチェンジ・副コマンドの付け替え → 再び出撃（部隊の変更が戦闘に反映される）
// → 技（強打）と副コマンドのメニューの操作 → ページを読み込み直しても部隊の状態が残る →「はじめから」で最初に戻る。
//
// - 味方の行動は、敵と同じ AI（src/core/ai.ts）で決め、それを画面のタップで入力する。
//   そのため、core だけで AI 同士を戦わせた結果（runAutoBattle）と、最終状態が完全に一致するはず。
// - 魔法は、メニューから選んで射程のマスやユニットをタップし、「ユニットを狙う」「マスを狙う」を選んで確定する。
//   味方が最初にユニットを狙う魔法を使う時だけ、わざと「マスを狙う」に変える（両方の操作を確かめるため。
//   core だけの計算でも同じ動かし方をするので、結果は一致するはず）。
// - 再び出撃した後、詠唱中に自分の手番が来た場面を用意して、詠唱の中断（確認で「やめない」→ もう一度 →「詠唱をやめる」）を確かめる。
//   AI 同士の対戦では、詠唱中に自分の手番が来ることがほとんどないため。
// - 途中で、拡大・縮小（ピンチ・ボタン・ホイール）、視点の移動（ドラッグ）、カメラの高さ、回転、視点を戻す、を行う。
//   それらの操作の後でも、狙ったマスやユニットを正しくタップできることを確かめる。
//   また、ドラッグやピンチの終わりに、マスやユニットが誤って選ばれないことも確かめる。
// - マスやユニット、向きのボタンは、まず人の指のように狙いの中央から少しずらして（最大 8px、--finger=px で変更）タップする。
//   意図と違う結果（何も起きない・違うマスへ移動・違う相手が選ばれる）になったら「押し直しが必要だった」と数え、
//   違うマスへ移動した時は「移動をやり直す」で戻してから、正確な位置で押し直す。回数は最後に表示する。
// - 最初の移動の後に「移動をやり直す」を押して戻れること、3手番に1回は向きを初期値（最も近い敵の方）から変えて
//   向きのボタンを押すこと、向きのボタンが互いに重ならないこと、攻撃・魔法の予測がカメラのボタンに重ならないことも確かめる。
//
// 勝敗条件・イベント・罠・配置（フェーズ2-2）も確かめる:
// - 出撃は「訓練戦」→ 敵の強さ → 出撃前の配置の画面。最初の出撃で、味方を2人続けてタップして位置を入れ替え、
//   もう一度入れ替えて元に戻してから「戦闘開始」を押す（core だけの計算と同じ配置で戦うため）。
// - ダンジョン「はじまりの遺跡」の第2戦の場面を用意して、見えない罠を踏む（発動して見えるようになり、移動をやり直せない）、
//   増援の予告の目印と出現、到達するマスへの移動で勝利、を確かめる。
// - 最後に、遺跡の3連戦を第1戦からクリアまで通す（戦闘の間の結果と編成、第2戦で負けてやり直す、読み込み直して第3戦から再開、
//   クリアの画面と報酬・記録）。戦闘は開発用の決着で早める。--full-dungeon で、3戦とも画面のタップで戦う（手元向け）。
//
// 使い方:
//   npm run autoplay                          スマホ縦向きと横向きで実行
//   npm run autoplay -- --viewports=portrait,landscape,pc
//   npm run autoplay -- --seed=123 --screenshots=autoplay-output --headed
//   npm run autoplay -- --viewports=portrait --full-dungeon   ダンジョンの3連戦もすべてタップで戦う
//
// 開発用サーバー（vite）をこのスクリプトの中で起動する。画面の状態は、開発中だけ用意される
// window.__tactics（src/main.ts）から読む。
import { createServer } from 'vite';
import { chromium, devices } from 'playwright';
import fs from 'node:fs';
import path from 'node:path';

const args = Object.fromEntries(
  process.argv.slice(2).map((a) => {
    const [k, v] = a.replace(/^--/, '').split('=');
    return [k, v ?? 'true'];
  }),
);
const SEED = Number(args.seed ?? 20261110);
const SPEED = Number(args.speed ?? 6);
const VIEWPORTS = (args.viewports ?? 'portrait,landscape').split(',').filter(Boolean);
const SCREENSHOT_DIR = args.screenshots;
const HEADED = args.headed === 'true';
/** 失敗した時の画面写真の置き場所 */
const FAILURE_DIR = 'autoplay-output';
/** 指のずれの最大（CSS ピクセル）。指先の太さによる狙いのずれの目安 */
const FINGER_ERROR_PX = Number(args.finger ?? 8);
/** 1つの画面サイズで1戦にかけてよい時間の上限 */
const BATTLE_TIMEOUT_MS = Number(args.timeout ?? 12 * 60 * 1000);
/** 1戦の後（結果・編成・再び出撃・読み込み直し）にかけてよい時間の上限 */
const AFTER_BATTLE_TIMEOUT_MS = 6 * 60 * 1000;
/**
 * ダンジョンの3連戦を、すべて画面のタップで戦う（時間がかかるので手元で実行する。約15分）。
 * 省くと、ダンジョンの戦闘は開発用の決着（window.__tactics.finishBattle）で早めて、戦闘の間の流れだけを確かめる（CI はこちら）
 */
const FULL_DUNGEON = args['full-dungeon'] === 'true';
/**
 * 短くした自動プレイ（CI 用。npm run autoplay:ci）。訓練戦の1戦は、確かめたい操作（移動のやり直し・ユニット狙いとマス狙いの魔法・
 * 向きのボタン・カメラ操作の一通り）がすべて済んだ次の味方の手番まで画面のタップで進め、その時点の状態が core だけの計算と
 * 一致することを確かめてから、開発用の決着で勝ちにする。最後まで戦って照合するのは、手元で実行する全体の自動プレイ（npm run autoplay）
 */
const QUICK = args.quick === 'true';
/** 序章の通しだけを確かめる（手元で直す時に。--story-only） */
const STORY_ONLY = args['story-only'] === 'true';
/** 画面の収まりだけを確かめる（手元で直す時に。--layouts-only） */
const LAYOUTS_ONLY = args['layouts-only'] === 'true';
/** 画面全体がスクロールしないかを確かめる画面サイズ（各画面を開いて調べるだけなので短い） */
/**
 * 画面全体がスクロールしないかを確かめる画面サイズ。短くした版（CI）は、縦向きより厳しい「小さめのスマホ」と、横向き・PC の3つ
 * （ブラウザを同時に動かす数を抑えて、CI の検査全体を5分以内に収めるため）。全体は縦向きも含めた4つ
 */
const LAYOUT_VIEWPORTS = (args.layouts ?? (QUICK ? 'small,landscape,pc' : 'portrait,small,landscape,pc')).split(',').filter(Boolean);

const VIEWPORT_OPTIONS = {
  portrait: { label: 'スマホ縦向き', ...devices['iPhone 13'] },
  landscape: { label: 'スマホ横向き', ...devices['iPhone 13 landscape'] },
  pc: { label: 'PC', viewport: { width: 1280, height: 800 } },
  small: { label: '小さめのスマホ', viewport: { width: 360, height: 640 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true },
};

class CheckError extends Error {}
const check = (ok, message) => {
  if (!ok) throw new CheckError(message);
};

async function main() {
  const server = await createServer({ logLevel: 'warn', server: { port: 5199, strictPort: false } });
  await server.listen();
  const baseUrl = server.resolvedUrls.local[0];

  // core だけで計算した結果（画面を使わない）
  const core = {
    battle: await server.ssrLoadModule('/src/core/battle.ts'),
    ai: await server.ssrLoadModule('/src/core/ai.ts'),
  };
  core.movement = await server.ssrLoadModule('/src/core/movement.ts');
  core.combat = await server.ssrLoadModule('/src/core/combat.ts');
  core.progression = await server.ssrLoadModule('/src/core/progression.ts');
  core.sortie = await server.ssrLoadModule('/src/core/sortie.ts');
  core.equipment = await server.ssrLoadModule('/src/core/equipment.ts');
  core.shop = await server.ssrLoadModule('/src/core/shop.ts');
  core.turnOrder = await server.ssrLoadModule('/src/core/turnOrder.ts');
  const abilities = await server.ssrLoadModule('/src/data/abilities.ts');
  const equipData = await server.ssrLoadModule('/src/data/equipment.ts');
  const data = {
    site: (await server.ssrLoadModule('/src/data/battles/twinHillsBattle.ts')).twinHillsBattle,
    dungeon: (await server.ssrLoadModule('/src/data/battles/ruins/index.ts')).ruinsDungeon,
    jobs: (await server.ssrLoadModule('/src/data/jobs.ts')).jobs,
    spells: abilities.spells,
    strikes: abilities.strikes,
    passives: (await server.ssrLoadModule('/src/data/passives.ts')).passives,
    rules: (await server.ssrLoadModule('/src/data/battleRules.ts')).battleRules,
    progression: (await server.ssrLoadModule('/src/data/progression.ts')).progressionRules,
    roster: (await server.ssrLoadModule('/src/data/roster.ts')).initialRoster,
    ai: (await server.ssrLoadModule('/src/data/aiConfig.ts')).aiConfig,
    text: (await server.ssrLoadModule('/src/ui/text.ts')).TEXT,
    books: (await server.ssrLoadModule('/src/data/story/books.ts')).books,
    equip: equipData,
  };
  data.catalog = { jobs: data.jobs, spells: data.spells, strikes: data.strikes, passives: data.passives, equipment: equipData.equipment };
  core.data = data;
  /** 部隊と段階から、画面と同じ方法で戦闘を始める（core だけで） */
  core.start = (roster, tierId, seed) =>
    core.battle.startBattle(
      core.sortie.buildSortie(data.site, tierId, roster, data.catalog, data.progression),
      data.jobs,
      data.rules,
      seed,
      data.spells,
      data.strikes,
      data.passives,
    );
  const startState = core.start(data.roster, 'easy', SEED).state;
  // core だけで、画面と同じ動かし方（playerPolicy）で決着まで進める
  const policy = playerPolicy(core);
  let expected = startState;
  let expectedCasts = 0;
  /** 短くした自動プレイで止める手番（確かめたい操作がすべて済んだ次の味方の手番）と、その手番の始まりの状態 */
  let quickStop;
  const done = { tile: false, unit: false, facing: false, turns: new Set() };
  const CAMERA_OP_COUNT = 6;
  while (expected.turn && expected.turnNumber <= 1000) {
    const unit = expected.units.find((u) => u.id === expected.turn.unitId);
    if (unit.team === 'player' && !expected.turn.moved && !expected.turn.acted && !done.turns.has(expected.turnNumber)) {
      if (!quickStop && done.tile && done.unit && done.facing && done.turns.size >= CAMERA_OP_COUNT) {
        quickStop = { turn: expected.turnNumber, state: expected };
      }
      done.turns.add(expected.turnNumber);
    }
    const action = unit.team === 'player' ? policy(expected) : core.ai.decideNextAction(expected, data.ai);
    if (unit.team === 'player') {
      if (action.type === 'cast') {
        expectedCasts++;
        done[action.target.kind] = true;
      }
      if (action.type === 'endTurn' && expected.turnNumber % 3 === 0) done.facing = true;
    }
    expected = core.battle.applyAction(expected, action).state;
  }
  console.log(
    `シード値 ${SEED}: core だけの計算では ${expected.winner === 'player' ? '勝利' : '敗北'}（${expected.turnNumber}手番、味方の魔法 ${expectedCasts}回）`,
  );
  if (QUICK && quickStop) {
    // 止める手番で、開発用の決着（勝ち）にした状態を、この戦闘の結果とする
    expected = { ...quickStop.state, winner: 'player', turn: null };
    console.log(`短くした自動プレイ: ${quickStop.turn}手番目の始まりまでタップで進め、照合してから勝ちで終える`);
  } else {
    quickStop = undefined;
  }
  check(expectedCasts > 0, `シード値 ${SEED} では味方が魔法を使いません。別のシード値を選んでください`);
  // 戦闘の後の部隊と、編成の画面で行う変更（core だけで計算）
  const plan = rosterPlan(core, expected);
  console.log(
    `戦闘の後: ${plan.learn ? `${plan.learn.unitId} が ${plan.learn.abilityId} を習得` : '習得できるアビリティなし'}、` +
      `${plan.jobUnitId} がジョブを変えて戻り（装備が外れる）、副コマンドに ${plan.subJobId}。` +
      `店で ${plan.buy.itemId} を買って ${plan.equipUnitId} に付け、${plan.jobUnitId} は「おまかせ」、${plan.sell.itemId} を売る`,
  );

  const started = Date.now();
  // 画面サイズごとに、別々のブラウザ（別々のプロセス）で動かす。
  // 1つのブラウザで複数の画面を開くと、描画（ソフトウェアで行う）が1つの描画用プロセスに集まって順番待ちになり、
  // 3つ同時・高解像度の画面写真つきの時に、時間切れで止まったように見えていたため。
  const layoutRun = async (name) => {
    const browser = await chromium.launch({
      headless: !HEADED,
      args: ['--enable-unsafe-swiftshader', '--use-angle=swiftshader', '--ignore-gpu-blocklist'],
    });
    try {
      const r = await checkLayouts(browser, baseUrl, name, core);
      return { name, ok: true, layout: true, ...r };
    } catch (e) {
      return { name, ok: false, layout: true, error: e };
    } finally {
      await browser.close();
    }
  };
  // 短くした版（CI）は、画面の収まりの確認も同時に動かして時間を抑える。全体では、ブラウザが多すぎて遅くならないよう、
  // 1戦を戦う画面サイズを先に、画面の収まりの確認をその後に動かす
  const layoutsAlongside = QUICK && !STORY_ONLY ? LAYOUT_VIEWPORTS.map(layoutRun) : [];
  // 序章（最初から最後まで・スキップで・会話と戦闘の途中で読み込み直して通す）。スマホ縦向きの1つで
  // 短くした版（CI）では、ほかの確認がすべて終わってから始める（同時に動かすブラウザが増えると、CI では全体が大きく遅くなるため）
  const storyRun1 = async () => {
    const browser = await chromium.launch({
      headless: !HEADED,
      args: ['--enable-unsafe-swiftshader', '--use-angle=swiftshader', '--ignore-gpu-blocklist'],
    });
    try {
      const r = await storyRun(browser, baseUrl, 'portrait', core);
      return { name: 'portrait', ok: true, ...r };
    } catch (e) {
      return { name: 'portrait', ok: false, story: true, error: e };
    } finally {
      await browser.close();
    }
  };
  const storyAlongside = LAYOUTS_ONLY || (QUICK && !STORY_ONLY) ? undefined : storyRun1();
  const battleResults = await Promise.all([
    ...(storyAlongside ? [storyAlongside] : []),
    ...(LAYOUTS_ONLY ? LAYOUT_VIEWPORTS.map(layoutRun) : layoutsAlongside),
    ...(STORY_ONLY || LAYOUTS_ONLY ? [] : VIEWPORTS).map(async (name) => {
      const browser = await chromium.launch({
        headless: !HEADED,
        args: ['--enable-unsafe-swiftshader', '--use-angle=swiftshader', '--ignore-gpu-blocklist'],
      });
      try {
        const r = await playOneBattle(browser, baseUrl, name, core, expected, plan, quickStop);
        return { name, ok: true, ...r };
      } catch (e) {
        return { name, ok: false, error: e };
      } finally {
        await browser.close();
      }
    }),
  ]);
  if (QUICK && !STORY_ONLY && !LAYOUTS_ONLY) battleResults.unshift(await storyRun1());
  const results = QUICK || STORY_ONLY || LAYOUTS_ONLY ? battleResults : [...battleResults, ...(await Promise.all(LAYOUT_VIEWPORTS.map(layoutRun)))];
  await server.close();

  console.log('');
  let failed = false;
  for (const r of results) {
    const label = `${r.layout ? '画面の収まり・' : r.story ? '序章・' : ''}${VIEWPORT_OPTIONS[r.name]?.label ?? r.name}`;
    if (r.ok && r.story && r.quick) {
      console.log(`✔ ${label}: 序章を要点だけ確かめて最後まで（台詞 ${r.lines}行・勝った後の台本 ${r.afterLines}行・読み込み直し ${r.reloads}回・スキップ ${r.skips}回。${r.seconds}秒）`);
    } else if (r.ok && r.story) {
      console.log(
        `✔ ${label}: 序章を最初から最後まで（台詞 ${r.lines}行・歩かせる ${r.walks}歩・戦闘中の会話 ${r.battleLines}行・勝った後の台本 ${r.afterLines}行・` +
          `旋律 ${r.melodies}種類・読み込み直し ${r.reloads}回）と、スキップ ${r.skips}回で通す（${r.seconds}秒）`,
      );
    } else if (r.ok && r.layout) {
      console.log(`✔ ${label}: ${r.screens}画面で、画面全体のスクロールなし・ボタンが画面の内側（${r.seconds}秒）`);
    } else if (r.ok) {
      console.log(
        `✔ ${label}: ${r.winner === 'player' ? '勝利' : '敗北'}（${r.turns}手番、味方の手番 ${r.playerTurns}、戦闘の途中での読み込み直しと再開 ${r.reloads}回、` +
          `魔法の指定 ${r.casts}回（ユニット狙い ${r.unitCasts}・マス狙い ${r.tileCasts}）、詠唱の中断 ${r.interrupts}回、` +
          `向きを変えた ${r.facingChanges}回、移動のやり直し ${r.undos}回、カメラ操作 ${r.cameraOps}回、タップ ${r.taps}回、${r.seconds}秒）`,
      );
      if (r.partial) {
        console.log(
          `  装備と店: 店で買う ${r.buys}回・売る ${r.sells}回、装備の付け替え ${r.equips}回、「おまかせ」 ${r.autoEquips}回、ゴールドと戦利品の表示 ✔`,
        );
        console.log(
          `  育成: 戦闘中のレベルアップの表示 ✔、結果の画面 ✔、編成のタブ ${r.tabs}回・習得 ${r.learned}回・ジョブチェンジ ${r.jobChanges}回・副コマンド ${r.subChanges}回、再び出撃 ✔、時守の業 ${r.timekeeper}回、新しいジョブの行動 ${r.newJobActions}回、状態変化の目印と膠着の表示 ✔`,
        );
        console.log(
          `  （技・突き飛ばし・罠・反撃・詠唱の中断・受動的なアビリティ・はじめから・ダンジョンは、短くした版では ${VIEWPORT_OPTIONS[VIEWPORTS[0]]?.label ?? VIEWPORTS[0]} だけで確かめる）`,
        );
      } else {
        console.log(
          `  装備と店: 店で買う ${r.buys}回・売る ${r.sells}回、装備の付け替え ${r.equips}回、「おまかせ」 ${r.autoEquips}回、ゴールドと戦利品の表示 ✔、ボスからの装備 ✔`,
        );
        console.log(
          `  育成: 戦闘中のレベルアップの表示 ✔、結果の画面 ✔、編成のタブ ${r.tabs}回・習得 ${r.learned}回・ジョブチェンジ ${r.jobChanges}回・副コマンド ${r.subChanges}回、再び出撃 ✔、` +
            `強打 ✔、突き飛ばし ${r.knockbacks}回、時守の業 ${r.timekeeper}回、ジョブの解放の知らせ ${r.unlocks}回・新しいジョブへの転職 ${r.newJobs}回・新しいジョブの行動 ${r.newJobActions}回、反撃 ${r.counters}回、受動的なアビリティの習得と付け替え ${r.passives}回、読み込み直し ✔、はじめから ✔`,
        );
        console.log(
          `  勝敗条件・イベント・罠: 配置の入れ替え ${r.swaps}回、罠の発動 ${r.traps}回、増援の出現 ${r.appeared}体、到達で勝利 ${r.reached}回`,
        );
        console.log(
          `  ダンジョン: 第1戦からクリアまで ✔（戦闘 ${r.dungeonBattles}回、うちタップで戦った ${r.dungeonTapped}回）、` +
            `負けた後のやり直し ${r.retries}回、編成の画面への行き来 ✔、読み込み直して再開 ✔、クリアの報酬と記録 ✔`,
        );
        console.log(`  戦闘不能と蘇生: 頭上のカウント・情報の欄・蘇生の予測・復帰・退場 ✔（蘇生 ${r.revives}回）、撤退 ${r.retreats}回`);
      }
      const f = r.finger;
      const sum = (o) => Object.values(o).reduce((a, b) => a + b, 0);
      console.log(
        `  押し直しが必要だった回数: ${sum(f.retaps)} / 指のタップ ${sum(f.tries)}回` +
          `（移動 ${f.retaps.move}/${f.tries.move}・うち違うマスへ移動 ${f.wrongMoves}、攻撃対象 ${f.retaps.target}/${f.tries.target}、` +
          `魔法の狙い ${f.retaps.spell}/${f.tries.spell}、向き ${f.retaps.facing}/${f.tries.facing}）`,
      );
    } else {
      failed = true;
      console.log(`✘ ${label}: ${r.error instanceof CheckError ? r.error.message : r.error?.stack ?? r.error}`);
    }
  }
  console.log(`合計 ${Math.round((Date.now() - started) / 1000)}秒`);
  if (failed) process.exit(1);
}

async function playOneBattle(browser, baseUrl, name, core, expected, plan, quickStop) {
  const holder = {};
  try {
    return await playOneBattleInner(browser, baseUrl, name, core, expected, plan, holder, quickStop);
  } catch (e) {
    // 失敗した時の画面を残す（GitHub Actions では成果物としてダウンロードできる）
    if (holder.page) {
      fs.mkdirSync(FAILURE_DIR, { recursive: true });
      await holder.page.screenshot({ path: path.join(FAILURE_DIR, `${name}-failure.png`) }).catch(() => {});
    }
    throw e;
  }
}

async function playOneBattleInner(browser, baseUrl, name, core, expected, plan, holder, quickStop) {
  const options = VIEWPORT_OPTIONS[name];
  check(options, `画面サイズ ${name} は未定義です（portrait / landscape / pc）`);
  const { label, ...contextOptions } = options;
  // スマホの端末設定は WebKit 用なので、Chromium で開くために browserName 関係を外す
  delete contextOptions.defaultBrowserType;
  // 画素の密度: 画面写真を撮らない時は 1、撮る時も 2 まで（スマホの端末設定は 3 だが、ソフトウェア描画では
  // 描く画素の数が 2.25 倍になって遅く、3つ同時に動かすと時間切れになっていたため。画面の描画も 2 倍までにしている）
  contextOptions.deviceScaleFactor = SCREENSHOT_DIR ? Math.min(2, contextOptions.deviceScaleFactor ?? 1) : 1;
  const context = await browser.newContext(contextOptions);
  const page = await context.newPage();
  holder.page = page;
  const touch = Boolean(contextOptions.hasTouch);
  const cdp = touch ? await context.newCDPSession(page) : undefined;
  const pageErrors = [];
  page.on('pageerror', (e) => pageErrors.push(e));
  // 処理されなかった Promise の失敗（演出の途中のエラーなど）も、ページのエラーとして数える
  page.on('console', (m) => {
    if (m.type() === 'error') pageErrors.push(new Error(m.text()));
  });
  const log = (msg) => console.log(`[${label}] ${msg}`);
  const started = Date.now();
  /** 待つ時間の上限。1戦の後は、育成の画面の確認のために数え直す */
  let deadline = started + BATTLE_TIMEOUT_MS;
  const stats = {
    taps: 0,
    cameraOps: 0,
    playerTurns: 0,
    casts: 0,
    unitCasts: 0,
    tileCasts: 0,
    interrupts: 0,
    facingChanges: 0,
    undos: 0,
    learned: 0,
    jobChanges: 0,
    subChanges: 0,
    knockbacks: 0,
    timekeeper: 0,
    unlocks: 0,
    newJobs: 0,
    newJobActions: 0,
    counters: 0,
    passives: 0,
    swaps: 0,
    dungeonBattles: 0,
    dungeonTapped: 0,
    retries: 0,
    traps: 0,
    appeared: 0,
    reached: 0,
    tabs: 0,
    buys: 0,
    sells: 0,
    equips: 0,
    autoEquips: 0,
    reloads: 0,
    revives: 0,
    retreats: 0,
  };
  /** 指に近いタップ（狙いの中央から少しずれる）の回数と、そのうち押し直しが必要だった回数（種類ごと） */
  const finger = {
    tries: { move: 0, target: 0, spell: 0, facing: 0 },
    retaps: { move: 0, target: 0, spell: 0, facing: 0 },
    /** 意図しないマスへ移動してしまった回数（押し直しの内数） */
    wrongMoves: 0,
    details: [],
  };
  let fingerIndex = 0;
  const policy = playerPolicy(core);
  const { text } = core.data;
  const INPUT_MODES = [
    'main',
    'targeting',
    'confirm',
    'abilityMenu',
    'spellTarget',
    'spellTargetKind',
    'spellConfirm',
    'confirmInterrupt',
    'facing',
    'ended',
  ];

  await page.addInitScript(`window.__clearOfButtons = ${clearOfButtons.toString()}`);
  await page.addInitScript(() =>
    window.addEventListener('unhandledrejection', (e) => console.error(`unhandledrejection: ${e.reason?.stack ?? e.reason}`)),
  );
  await page.goto(`${baseUrl}?seed=${SEED}&speed=${SPEED}&start=base&autodialogue=1`);
  await page.waitForFunction(() => window.__tactics?.screen() === 'base', null, { timeout: 30000 });

  // ---- 画面から読むもの ----
  const T = (fn, arg) => page.evaluate(fn, arg);
  const getState = () => T(() => window.__tactics.state());
  const getMode = () => T(() => window.__tactics.modeDetail());
  const getCamera = () => T(() => window.__tactics.camera());
  const viewport = page.viewportSize();
  const center = { x: viewport.width / 2, y: viewport.height / 2 };

  const waitFor = async (description, fn, arg) => {
    // 3つの画面サイズを同時に動かすと、ソフトウェアでの描画が遅くなり、敵の手番が続くと長く待つことがあるため、長めに待つ
    const timeout = Math.max(1000, Math.min(180000, deadline - Date.now()));
    try {
      await page.waitForFunction(fn, arg, { timeout, polling: 50 });
    } catch {
      const errors = pageErrors.map((e) => e.message).join(' / ');
      throw new CheckError(`待っても「${description}」になりませんでした（${JSON.stringify(await getMode())}）${errors ? ` ページのエラー: ${errors}` : ''}`);
    }
  };
  /** 入力を待つ状態（または決着）になり、カメラも止まるまで待つ */
  const waitForInput = () =>
    waitFor(
      '入力待ち',
      (modes) => {
        const t = window.__tactics;
        return modes.includes(t.mode()) && t.camera().idle;
      },
      INPUT_MODES,
    );
  const waitCameraIdle = () => waitFor('カメラが止まる', () => window.__tactics.camera().idle);
  /** 状態と操作のモードの写し（「何も変わっていない」ことを確かめるため） */
  const snapshot = async () => JSON.stringify([await getState(), await getMode()]);

  // ---- 指とマウスの操作 ----
  const touchEvent = (type, points) =>
    cdp.send('Input.dispatchTouchEvent', {
      type,
      touchPoints: points.map((p, i) => ({ x: p.x, y: p.y, id: i + 1, radiusX: 2, radiusY: 2, force: 1 })),
    });
  const tapAt = async (p) => {
    stats.taps++;
    if (touch) await page.touchscreen.tap(p.x, p.y);
    else await page.mouse.click(p.x, p.y);
  };
  const drag = async (from, to, steps = 8) => {
    if (touch) {
      await touchEvent('touchStart', [from]);
      for (let i = 1; i <= steps; i++) {
        await touchEvent('touchMove', [lerp(from, to, i / steps)]);
      }
      await touchEvent('touchEnd', []);
    } else {
      await page.mouse.move(from.x, from.y);
      await page.mouse.down();
      for (let i = 1; i <= steps; i++) {
        const p = lerp(from, to, i / steps);
        await page.mouse.move(p.x, p.y);
      }
      await page.mouse.up();
    }
  };
  /** 2本指のピンチ。scale が 1 より大きいと広げる（拡大） */
  const pinch = async (scale, at = center, startGap = 60, steps = 8) => {
    const pts = (gap) => [
      { x: at.x - gap / 2, y: at.y },
      { x: at.x + gap / 2, y: at.y },
    ];
    await touchEvent('touchStart', pts(startGap));
    for (let i = 1; i <= steps; i++) await touchEvent('touchMove', pts(startGap * (1 + ((scale - 1) * i) / steps)));
    await touchEvent('touchEnd', []);
  };
  const pressButton = async (name) => {
    const button = page.getByRole('button', { name, exact: true });
    stats.taps++;
    if (touch) await button.tap();
    else await button.click();
  };
  const pressCameraButton = async (cls) => {
    const button = page.locator(`.${cls}`);
    stats.taps++;
    if (touch) await button.tap();
    else await button.click();
  };

  /**
   * その点が画面の中にあり、情報欄やボタンに隠れていない（キャンバスが見えている）か。
   * ボタンのすぐ近くをタップすると、ブラウザが「ボタンを押そうとした」とみなして補正することがあるため
   * （スマホの実機でも同じ）、周り 16px にもボタンがないことを確かめる。
   */
  const isTappable = (p) => T(clearOfButtons, [p.x, p.y]);
  /**
   * 狙う点が隠れていたら、人がするようにドラッグで画面の中央へ寄せる。
   * ドラッグの後に、状態とモードが変わっていない（何も選ばれていない）ことも確かめる。
   */
  const bringIntoView = async (getPoint, what) => {
    for (let attempt = 0; attempt < 4; attempt++) {
      const p = await getPoint();
      check(p, `${what} の画面上の位置が分かりません`);
      if (await isTappable(p)) return p;
      const before = await snapshot();
      // 中央からドラッグして、狙う点を中央へ引き寄せる（大きすぎる移動は数回に分ける）。
      // 指を置く点が情報欄やボタンの上だとマップが動かないので、人がするように、マップの見えている所まで上下にずらして置く
      const dx = clamp(center.x - p.x, -viewport.width * 0.4, viewport.width * 0.4);
      const dy = clamp(center.y - p.y, -viewport.height * 0.3, viewport.height * 0.3);
      let shift = 0;
      for (const s of [0, 60, -60, 120, -120, 180]) {
        const from = { x: center.x - dx / 2, y: center.y - dy / 2 + s };
        const to = { x: center.x + dx / 2, y: center.y + dy / 2 + s };
        const inside = (q) => q.y > 0 && q.y < viewport.height;
        if (inside(from) && inside(to) && (await isTappable(from))) {
          shift = s;
          break;
        }
      }
      await drag({ x: center.x - dx / 2, y: center.y - dy / 2 + shift }, { x: center.x + dx / 2, y: center.y + dy / 2 + shift });
      stats.cameraOps++;
      await waitCameraIdle();
      check((await snapshot()) === before, `ドラッグの終わりに、マスかユニットが誤って選ばれました（${what} へ寄せる時）`);
    }
    const p = await getPoint();
    check(await isTappable(p), `${what} をドラッグで画面に入れられませんでした（${JSON.stringify(p)}）`);
    return p;
  };

  /**
   * マス (x, z) が一番手前に写っている点を探す（手前の高いマスやユニットに隠れていない部分）。
   * 人が「見えている部分」をタップするのと同じ。見つからなければ undefined。
   * unitId を渡すと、ユニットの体の中ほども候補にする。
   */
  const visiblePointOf = (x, z, unitId, strict = false) =>
    T(
      ([x, z, unitId, strict]) => {
        const t = window.__tactics;
        const points = [...(unitId ? [t.unitScreen(unitId)] : []), ...t.tilePoints(x, z)];
        // 隣のマスとの境目ぎりぎりの点は避ける（周りでも同じマスが一番手前に写っている点だけを使う）
        // タップした時に選ばれるマスの第一候補（tapJudge.ts の規則）
        const firstAt = (px, py) => t.candidatesAt(px, py).coords[0];
        // 周り 2px と 4px でも同じマスが一番手前に写っている点を優先する（ユニットの体は待機中に少し揺れるので、
        // 体のすぐ脇の点は避けたい）。4px の点がなければ 2px の点を使う（混み合った所では 4px の点がないことがある）
        const near = [
          [0, 0],
          [2, 0],
          [-2, 0],
          [0, 2],
          [0, -2],
        ];
        const far = [...near, [4, 0], [-4, 0], [0, 4], [0, -4]];
        const usable = (p, offsets) =>
          window.__clearOfButtons([p.x, p.y]) &&
          offsets.every(([dx, dy]) => {
            const first = firstAt(p.x + dx, p.y + dy);
            return first !== undefined && first.x === x && first.z === z;
          });
        return points.find((p) => usable(p, far)) ?? (strict ? undefined : points.find((p) => usable(p, near)));
      },
      [x, z, unitId, strict],
    );

  /** 狙うマスを画面に入れ、見えている部分を探す。完全に隠れていれば、人がするようにカメラを回す */
  const aimAt = async (x, z, unitId, what) => {
    // まず 4px の余裕のある点を、カメラを回しながら探す。どの向きにもなければ、2px の余裕の点で妥協する
    for (const strict of [true, false]) {
      for (let turn = 0; turn < 4; turn++) {
        await bringIntoView(() => T(([x, z]) => window.__tactics.tileScreen(x, z), [x, z]), what);
        const p = await visiblePointOf(x, z, unitId, strict);
        if (p) return p;
        const before = await snapshot();
        await pressCameraButton('camera-rotate-right');
        stats.cameraOps++;
        await waitCameraIdle();
        check((await snapshot()) === before, '回転ボタンで、マスかユニットが誤って選ばれました');
      }
    }
    throw new CheckError(`${what} の見えている部分が、どの向きからも見つかりませんでした`);
  };

  const tapTile = async (x, z) => {
    await tapAt(await aimAt(x, z, undefined, `マス (${x}, ${z})`));
  };
  const tapUnit = async (id) => {
    const u = (await getState()).units.find((u) => u.id === id);
    await tapAt(await aimAt(u.x, u.z, id, `ユニット ${id}`));
  };
  /** 向きのボタン（画面上でその向きの側に出る）の中央の点。出ていなければ undefined */
  const facingButtonPoint = (dir) =>
    T((dir) => {
      const b = document.querySelector(`.facing-pad:not([hidden]) .facing-button[data-direction="${dir}"]`);
      if (!b) return undefined;
      const r = b.getBoundingClientRect();
      return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
    }, dir);
  /** 向きのボタンを正確に押す */
  const pressFacing = async (dir) => {
    const b = page.locator(`.facing-pad .facing-button[data-direction="${dir}"]`);
    stats.taps++;
    if (touch) await b.tap();
    else await b.click();
  };
  /** 向きのボタン4つが、互いに重ならず、画面の中にあり、指で押せる大きさか */
  const checkFacingPad = async () => {
    const boxes = await T(() =>
      [...document.querySelectorAll('.facing-pad:not([hidden]) .facing-button')].map((b) => {
        const r = b.getBoundingClientRect();
        return { d: b.dataset.direction, x: r.left, y: r.top, w: r.width, h: r.height };
      }),
    );
    // 勝敗条件の帯・カメラのボタン・行動のボタンなどに重ならない（重なると、ボタンが隠れて押せない・帯の方が押されて一覧が開く）
    const others = await T(() =>
      ['.objective-bar', '.camera-buttons', '.actions button', '.undo-area button'].flatMap((sel) =>
        [...document.querySelectorAll(sel)].flatMap((e) => {
          if (e.hidden) return [];
          const r = e.getBoundingClientRect();
          return r.width > 0 && r.height > 0 ? [{ sel, x: r.left, y: r.top, w: r.width, h: r.height }] : [];
        }),
      ),
    );
    for (const o of others) {
      for (const b of boxes) {
        const overlap = b.x < o.x + o.w && o.x < b.x + b.w && b.y < o.y + o.h && o.y < b.y + b.h;
        check(!overlap, `向きのボタン ${b.d} が、${o.sel} に重なっています`);
      }
    }
    check(boxes.length === 4, `向きのボタンが4つありません（${boxes.length}）`);
    check(new Set(boxes.map((b) => b.d)).size === 4, `向きのボタンの向きが重複しています（${JSON.stringify(boxes)}）`);
    for (const b of boxes) {
      check(b.w >= 48 && b.h >= 48, `向きのボタンが小さすぎます（${b.w}×${b.h}）`);
      check(b.x >= 0 && b.y >= 0 && b.x + b.w <= viewport.width && b.y + b.h <= viewport.height, '向きのボタンが画面の外にあります');
    }
    for (let i = 0; i < boxes.length; i++) {
      for (let j = i + 1; j < boxes.length; j++) {
        const a = boxes[i];
        const b = boxes[j];
        const overlap = a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
        check(!overlap, `向きのボタンが重なっています（${a.d} と ${b.d}）`);
      }
    }
  };
  /** 2つの要素の画面上の四角が重なっているか */
  const overlaps = (selA, selB) =>
    T(
      ([a, b]) => {
        const ea = document.querySelector(a);
        const eb = document.querySelector(b);
        if (!ea || !eb || ea.hidden || eb.hidden) return false;
        const ra = ea.getBoundingClientRect();
        const rb = eb.getBoundingClientRect();
        return ra.left < rb.right && rb.left < ra.right && ra.top < rb.bottom && rb.top < ra.bottom;
      },
      [selA, selB],
    );

  // ---- 指に近いタップ（押し直しの回数を数える） ----
  /**
   * 人の指は、狙った物の見えている中央から少しずれた所に触れる。そのずれを決まった順番で作る（最大 FINGER_ERROR_PX）。
   * 乱数ではなく決まった並びなので、毎回同じ結果になる。
   */
  const fingerOffset = () => {
    const k = fingerIndex++;
    const angle = k * 2.399963; // 黄金角ずつ回して、いろいろな方向にずらす
    const r = FINGER_ERROR_PX * [1 / 3, 2 / 3, 1][k % 3];
    return { dx: Math.cos(angle) * r, dy: Math.sin(angle) * r };
  };
  /**
   * マス（またはユニット）の、人が狙う点。ユニットなら体の中ほど、マスなら上面の中央。
   * そこが手前の物に隠れていたら、上面の見えている点のうち中央に一番近い点。
   */
  const fingerPointOf = (x, z, unitId) =>
    T(
      ([x, z, unitId]) => {
        const t = window.__tactics;
        const center = unitId ? t.unitScreen(unitId) : t.tileScreen(x, z);
        const isFirst = (p) => {
          const first = t.candidatesAt(p.x, p.y).coords[0];
          return first !== undefined && first.x === x && first.z === z;
        };
        const ok = (p) => window.__clearOfButtons([p.x, p.y]) && isFirst(p);
        if (ok(center)) return center;
        const d = (p) => Math.hypot(p.x - center.x, p.y - center.y);
        return t
          .tilePoints(x, z)
          .filter(ok)
          .sort((a, b) => d(a) - d(b))[0];
      },
      [x, z, unitId],
    );
  /**
   * 指に近いタップを1回する。意図どおりなら true。違えば押し直しとして数え、必要なら元に戻して false を返す
   * （その後、呼び出し側が正確な位置で押し直す）。
   * point: 狙う点（undefined なら指のタップはせず、正確な位置で押す）
   * outcome: タップの結果 'ok' | 'none'（何も起きない）| 'wrong'（違う物が選ばれた）
   */
  const fingerTap = async (kind, point, outcome, recover, what) => {
    if (!point) return false;
    finger.tries[kind]++;
    const o = fingerOffset();
    const p = { x: point.x + o.dx, y: point.y + o.dy };
    const before = await T(([x, y]) => window.__tactics.candidatesAt(x, y).coords, [p.x, p.y]);
    await tapAt(p);
    const result = await outcome();
    if (result === 'ok') return true;
    finger.retaps[kind]++;
    finger.details.push(`${kind} ${what}: ${result === 'wrong' ? '違う物が選ばれた' : '反応なし'}（ずれ ${o.dx.toFixed(1)},${o.dy.toFixed(1)} / 指の下 ${JSON.stringify(before.slice(0, 3))}）`);
    if (result === 'wrong' && recover) await recover();
    return false;
  };
  /** 少し待って、条件が満たされたか（満たされなければ false） */
  const settle = async (fn, arg, timeout = 1500) => {
    try {
      await page.waitForFunction(fn, arg, { timeout, polling: 30 });
      return true;
    } catch {
      return false;
    }
  };
  const UNDO_MOVE_LABEL = /^移動を(戻す|やり直す)$/;

  /** 移動先のマスを指でタップする。違うマスへ移動したら「移動をやり直す」で戻してから、正確に押し直す */
  const fingerMove = async (unit, x, z) => {
    await aimAt(x, z, undefined, `マス (${x}, ${z})`);
    const point = await fingerPointOf(x, z);
    return fingerTap(
      'move',
      point,
      async () => {
        await settle(
          ([id, ox, oz]) => {
            const t = window.__tactics;
            const u = t.state().units.find((u) => u.id === id);
            return u.x !== ox || u.z !== oz || t.mode() !== 'main';
          },
          [unit.id, unit.x, unit.z],
          800,
        );
        await waitForInput();
        const now = (await getState()).units.find((u) => u.id === unit.id);
        const mode = await getMode();
        if (now.x === x && now.z === z) return 'ok';
        if (now.x !== unit.x || now.z !== unit.z) return 'wrong';
        if (mode.kind === 'confirmInterrupt') return 'wrong';
        return mode.kind === 'main' ? 'none' : 'wrong';
      },
      async () => {
        const mode = await getMode();
        if (mode.kind === 'confirmInterrupt') {
          await pressButton('やめない');
          return;
        }
        if (mode.kind === 'main') {
          finger.wrongMoves++;
          stats.taps++;
          const b = page.getByRole('button', { name: UNDO_MOVE_LABEL });
          if (touch) await b.tap();
          else await b.click();
          await waitFor(
            '移動のやり直し',
            ([id, ox, oz]) => {
              const t = window.__tactics;
              const u = t.state().units.find((u) => u.id === id);
              return u.x === ox && u.z === oz && t.mode() === 'main';
            },
            [unit.id, unit.x, unit.z],
          );
        }
      },
      `(${x}, ${z})`,
    );
  };

  // ---- 魔法の指定 ----
  /** メニューから魔法を選び、狙い先をタップして（必要ならユニットかマスかを選んで）確定する */
  /** そのアビリティが入っているコマンドのボタンを押し、メニューを開く */
  const openCommandOf = async (unit, abilityId) => {
    const command = unit.commands.find((c) => c.abilityIds.includes(abilityId));
    check(command, `${unit.id} のコマンドに ${abilityId} がありません`);
    await pressButton(text.commands[command.jobId]);
    await waitFor('使うものを選ぶ', () => window.__tactics.mode() === 'abilityMenu');
    // 武器が合わないアビリティと、MP が足りない魔法のボタンは押せないこと（蘇生は、戦闘不能の味方がいない時も押せない）
    const st = await getState();
    const downAlly = st.units.some((u) => u.team === unit.team && u.hp <= 0 && !u.retired);
    for (const id of command.abilityIds) {
      const spell = unit.spells.find((s) => s.id === id);
      const weapons = spell?.weapons ?? unit.strikes.find((s) => s.id === id)?.weapons;
      const usable =
        (!weapons || (unit.weapon === null ? weapons.includes('unarmed') : weapons.includes(unit.weapon))) &&
        (!spell || unit.mp >= spell.mpCost) &&
        unit.mp >= (unit.strikes.find((s) => s.id === id)?.mpCost ?? 0) &&
        (spell?.effect !== 'revive' || downAlly);
      const disabled = await page.getByRole('button', { name: text.abilities[id], exact: true }).isDisabled();
      check(disabled === !usable, `「${text.abilities[id]}」のボタンの押せる・押せないが、武器や MP と合いません`);
    }
  };
  const castSpell = async (action, unit) => {
    const spellLabel = text.abilities[action.spellId];
    await openCommandOf(unit, action.spellId);
    await pressButton(spellLabel);
    await waitFor('狙う場所を選ぶ', () => window.__tactics.mode() === 'spellTarget');
    const state = await getState();
    const center =
      action.target.kind === 'tile' ? action.target : state.units.find((u) => u.id === action.target.unitId);
    const there = state.units.find((u) => u.hp > 0 && u.x === center.x && u.z === center.z);
    const expectedMode = (m) =>
      there ? m.kind === 'spellTargetKind' && m.unitId === there.id : m.kind === 'spellConfirm' && m.target.kind === 'tile' && m.target.x === center.x && m.target.z === center.z;
    await aimAt(center.x, center.z, there?.id, `魔法の狙い (${center.x}, ${center.z})`);
    const fingerOk = await fingerTap(
      'spell',
      await fingerPointOf(center.x, center.z, there?.id),
      async () => {
        const m = await getMode();
        if (expectedMode(m)) return 'ok';
        return m.kind === 'spellTarget' ? 'none' : 'wrong';
      },
      undefined,
      `(${center.x}, ${center.z})`,
    );
    if (fingerOk) {
      if (there) await pressButton(action.target.kind === 'unit' ? 'ユニットを狙う' : 'マスを狙う');
    } else if (there) {
      await tapUnit(there.id);
      const chosen = await getMode();
      check(
        chosen.kind === 'spellTargetKind' && chosen.unitId === there.id,
        `ユニット ${there.id} のマスをタップしたのに、選ばれたのは ${JSON.stringify(chosen)} / タップの記録 ${JSON.stringify(await T(() => window.__tactics.tapLog()))} / ユニットの位置 ${JSON.stringify([there.x, there.z, await T((id) => window.__tactics.unitScreen(id), there.id)])}`,
      );
      await pressButton(action.target.kind === 'unit' ? 'ユニットを狙う' : 'マスを狙う');
    } else {
      await tapTile(center.x, center.z);
    }
    const chosen = await getMode();
    check(
      chosen.kind === 'spellConfirm' && JSON.stringify(chosen.target) === JSON.stringify(action.target),
      `魔法の狙い先が違います（期待 ${JSON.stringify(action.target)} / 画面 ${JSON.stringify(chosen)}）`,
    );
    check(await page.locator('.preview').isVisible(), '魔法の予測が表示されていません');
    check(!(await overlaps('.preview', '.camera-buttons')), '魔法の予測がカメラのボタンに重なっています');
    const title = await page.locator('.preview-title').textContent();
    check(title.includes(spellLabel), `魔法の予測の題が違います（${title}）`);
    if (stats.casts === 0) await screenshot('cast-preview');
    stats.casts++;
    if (action.target.kind === 'unit') stats.unitCasts++;
    else stats.tileCasts++;
    await pressButton('確定');
    await waitFor('魔法の指定の後', () => !['busy', 'spellConfirm'].includes(window.__tactics.mode()));
    const after = (await getState()).units.find((u) => u.id === unit.id);
    check(after.charging?.spellId === action.spellId, '魔法を指定したのに、詠唱中になっていません');
    if (stats.casts === 1) await screenshot('cast-charging');
  };

  // ---- カメラの操作（味方の手番ごとに順番に1つずつ） ----
  const tileProbe = () => T(() => window.__tactics.tileScreen(0, 0));
  const cameraOps = [
    async function pinchOrWheelIn() {
      const before = await getCamera();
      if (touch) await pinch(1.8);
      else await page.mouse.move(center.x, center.y).then(() => page.mouse.wheel(0, -300));
      await waitCameraIdle();
      const after = await getCamera();
      check(after.zoom > before.zoom * 1.2 || before.zoom >= 3.9, `ピンチ（ホイール）で拡大されませんでした（${before.zoom} → ${after.zoom}）`);
      return touch ? 'ピンチで拡大' : 'ホイールで拡大';
    },
    async function dragPan() {
      const before = await tileProbe();
      await drag({ x: center.x - 60, y: center.y - 40 }, { x: center.x + 60, y: center.y + 40 });
      await waitCameraIdle();
      let after = await tileProbe();
      // 小さなマップでは、視点が動ける範囲の端にいて動かないことがある。その時は逆向きにドラッグする
      if (Math.hypot(after.x - before.x, after.y - before.y) <= 20) {
        await drag({ x: center.x + 60, y: center.y + 40 }, { x: center.x - 60, y: center.y - 40 });
        await waitCameraIdle();
        after = await tileProbe();
      }
      check(Math.hypot(after.x - before.x, after.y - before.y) > 20, 'ドラッグで視点が動きませんでした');
      return 'ドラッグで視点を移動';
    },
    async function heightHigh() {
      // 「高い」になるまで押す（ボタンは 低い → 標準 → 高い → 低い と切り替わる）
      for (let i = 0; i < 3 && (await getCamera()).heightLevel !== 2; i++) {
        const before = (await getCamera()).heightLevel;
        await pressCameraButton('camera-height');
        check((await getCamera()).heightLevel === (before + 1) % 3, 'カメラの高さが次の段階になりませんでした');
      }
      await waitCameraIdle();
      check((await getCamera()).heightLevel === 2, 'カメラの高さが「高い」になりませんでした');
      return 'カメラの高さ: 高い';
    },
    async function zoomOutAndRotate() {
      const before = await getCamera();
      await pressCameraButton('camera-zoom-out');
      await pressCameraButton('camera-rotate-right');
      await waitCameraIdle();
      const after = await getCamera();
      check(after.zoom < before.zoom || before.zoom <= 0.81, '「－」で縮小されませんでした');
      check(after.quarter === (before.quarter + 1) % 4, '回転しませんでした');
      return '「－」で縮小 + 右に回す';
    },
    async function heightLowAndPinchOut() {
      for (let i = 0; i < 3 && (await getCamera()).heightLevel !== 0; i++) await pressCameraButton('camera-height');
      const before = await getCamera();
      if (touch) await pinch(0.6, center, 160);
      else await page.mouse.move(center.x, center.y).then(() => page.mouse.wheel(0, 200));
      await waitCameraIdle();
      const after = await getCamera();
      check(after.heightLevel === 0, 'カメラの高さが「低い」になりませんでした');
      check(after.zoom < before.zoom || before.zoom <= 0.81, `ピンチ（ホイール）で縮小されませんでした（${before.zoom} → ${after.zoom}）`);
      return `カメラの高さ: 低い + ${touch ? 'ピンチ' : 'ホイール'}で縮小`;
    },
    async function zoomInAndReset() {
      await pressCameraButton('camera-zoom-in');
      await pressCameraButton('camera-zoom-in');
      await waitCameraIdle();
      const before = await getCamera();
      await pressCameraButton('camera-reset');
      await waitCameraIdle();
      const cam = await getCamera();
      // 「視点を戻す」は拡大率と位置だけを戻し、回転とカメラの高さは変えない
      check(Math.abs(cam.zoom - initialCamera.zoom) < 1e-6, `「視点を戻す」で拡大率が最初に戻りませんでした（${cam.zoom}）`);
      check(cam.heightLevel === before.heightLevel, '「視点を戻す」でカメラの高さが変わりました');
      check(cam.quarter === before.quarter, '「視点を戻す」で回転の向きが変わりました');
      return '「＋」2回 + 視点を戻す（高さと回転はそのまま）';
    },
  ];

  const screenshot = async (tag) => {
    if (!SCREENSHOT_DIR) return;
    fs.mkdirSync(SCREENSHOT_DIR, { recursive: true });
    await page.screenshot({ path: path.join(SCREENSHOT_DIR, `${name}-${tag}.png`) });
  };

  // ---- 出撃前の配置の画面 ----
  const getDeploy = () => T(() => window.__tactics.deploy());
  const waitDeploy = () => waitFor('出撃前の配置', () => window.__tactics.mode() === 'deploy' && window.__tactics.camera().idle);
  /** 配置の画面で、ユニットをタップする（戦闘の状態はまだないので、配置の画面の状態から位置を読む） */
  const tapDeployUnit = async (id) => {
    const u = (await getDeploy()).state.units.find((x) => x.id === id);
    await tapAt(await aimAt(u.x, u.z, id, `配置のユニット ${id}`));
  };
  /** 配置の画面で、味方 a と b を2回続けてタップして入れ替える。入れ替わったことを確かめる */
  const swapOnDeploy = async (a, b) => {
    const pos = (d, id) => {
      const u = d.state.units.find((x) => x.id === id);
      return `${u.x},${u.z}`;
    };
    const before = await getDeploy();
    await tapDeployUnit(a);
    await waitFor('入れ替える味方を選ぶ', (id) => window.__tactics.deploy()?.selected === id, a);
    await tapDeployUnit(b);
    await waitFor('入れ替え', () => window.__tactics.deploy()?.selected === null);
    const after = await getDeploy();
    check(pos(after, a) === pos(before, b) && pos(after, b) === pos(before, a), `配置の入れ替えが違います（${a} ${pos(after, a)} / ${b} ${pos(after, b)}）`);
    stats.swaps++;
  };
  /** 拠点から訓練戦に出撃し、配置の画面で「戦闘開始」を押す */
  const sortieTraining = async (tierName, drill = false) => {
    await pressButton(text.base.sortie);
    await waitFor('出撃先を選ぶ', () => document.querySelector('[data-screen="sortie"]') !== null);
    if (drill) await screenshot('00-sortie');
    await pressButton(text.base.training);
    await waitFor('敵の強さを選ぶ', () => document.querySelector('[data-screen="tiers"]') !== null);
    if (drill) await screenshot('00-tiers');
    await pressButton(tierName);
    await waitDeploy();
    const panel = await page.locator('.objective-panel').textContent();
    check(panel.includes(text.objectives.defeatAll) && panel.includes(text.objectives.allDefeated), `配置の画面に勝敗条件が出ていません（${panel}）`);
    await pressButton(text.objectives.close);
    if (drill) {
      await screenshot('00-deploy');
      // 敵をタップすると、情報の欄にその敵の装備が出る（フェーズ2-4）
      const enemy = (await getDeploy()).state.units.find((u) => u.team === 'enemy' && u.equipment.length > 0);
      await tapDeployUnit(enemy.id);
      await waitFor('敵の情報の欄', () => document.querySelector('.info-equipment') !== null);
      const equipText = await page.locator('.info-equipment').textContent();
      const names = enemy.equipment.map((e) => text.equipment[e.id].name);
      check(names.every((n) => equipText.includes(n)), `敵の情報の欄に装備が出ていません（${equipText} / ${names}）`);
      await screenshot('00-deploy-enemy-info');
      // 2人を入れ替えて、もう一度入れ替えて元に戻す（core だけの計算と同じ配置で戦うため）
      await swapOnDeploy('touma', 'kiri');
      await screenshot('00-deploy-swapped');
      await swapOnDeploy('kiri', 'touma');
    }
    await pressButton(text.deploy.start);
    await waitFor('戦闘の開始', () => window.__tactics.screen() === 'battle' && window.__tactics.state() !== null);
  };

  // ---- 拠点から出撃する ----
  await screenshot('00-base');
  await sortieTraining(text.tiers.easy.name, true);

  // ---- 1戦を進める ----
  await waitForInput();
  const initialCamera = await getCamera();
  await screenshot('00-start');
  /**
   * 戦闘の途中でページを読み込み直し、拠点の「戦闘を再開」で続きから戦う（フェーズ2-5）。
   * exact なら、保存された状態が読み込み直す前の状態と同じであることも確かめる（入力待ちの時だけ。敵の手番の途中は進み続けるため）
   */
  const reloadAndResume = async (when, exact) => {
    const before = await getState();
    await page.reload();
    await page.waitForFunction(() => window.__tactics?.screen() === 'base', null, { timeout: 30000 });
    check(await page.locator('.resume-battle').isVisible(), `途中の戦闘があるのに、拠点に「${text.base.resumeBattle}」が出ていません（${when}）`);
    check(await page.locator('.retreat-battle').isVisible(), `途中の戦闘があるのに、拠点に「${text.base.retreatBattle}」が出ていません（${when}）`);
    check(!(await page.getByRole('button', { name: text.base.roster, exact: true }).isVisible()), '途中の戦闘があるのに、編成のボタンが出ています');
    const saved = await T(() => window.__tactics.suspended());
    check(saved && saved.state, `途中の戦闘が保存されていません（${when}）`);
    if (exact) check(JSON.stringify(saved.state) === JSON.stringify(before), `保存された戦闘の状態が、読み込み直す前と違います（${when}）`);
    if (!stats.reloads) await screenshot('resume-base');
    await pressButton(text.base.resumeBattle);
    await waitFor('戦闘の再開', () => window.__tactics.screen() === 'battle' && window.__tactics.state() !== null);
    const resumed = await getState();
    // 敵の手番の途中から再開した時は、すぐに続きの敵の行動が進むので、比べられるのは入力待ちの時だけ
    if (exact) check(JSON.stringify(resumed) === JSON.stringify(saved.state), `再開した戦闘の状態が、保存したものと違います（${when}）`);
    stats.reloads++;
    log(`${resumed.turnNumber}手番目（${when}）: ページを読み込み直して、拠点の「${text.base.resumeBattle}」から再開`);
  };

  /** 今の戦闘を、味方の手番は画面のタップで（AI と同じ動かし方で）、決着まで進める */
  const playByTaps = async (stop, reloads = false) => {
  let lastTurn = -1;
  for (;;) {
    check(Date.now() < deadline, `時間切れ（${BATTLE_TIMEOUT_MS / 1000}秒）`);
    check(pageErrors.length === 0, `ページでエラー: ${pageErrors.map((e) => e.message).join(' / ')}`);
    await waitForInput();
    const mode = await getMode();
    if (mode.kind === 'ended') break;
    let state = await getState();
    // 短くした自動プレイ: 止める手番の始まりで、core だけの計算と照合してから、開発用の決着で勝ちにする
    if (stop && state.turnNumber === stop.turn) {
      check(JSON.stringify(state) === JSON.stringify(stop.state), `${stop.turn}手番目の始まりの状態（HP・位置・経験値・乱数の状態など）が core の計算と違います`);
      await T(() => window.__tactics.finishBattle('player'));
      return true;
    }
    check(state.turn, '手番がありません');
    const unit = state.units.find((u) => u.id === state.turn.unitId);
    check(unit.team === 'player', `入力待ちなのに手番が敵です（${unit.id}）`);

    // 新しい味方の手番の最初に、カメラを1つ操作する
    if (state.turnNumber !== lastTurn) {
      lastTurn = state.turnNumber;
      const op = cameraOps[stats.playerTurns % cameraOps.length];
      stats.playerTurns++;
      const before = await snapshot();
      const what = await op();
      stats.cameraOps++;
      check((await snapshot()) === before, `カメラ操作（${what}）の後に、マスかユニットが誤って選ばれました`);
      if (stats.playerTurns <= cameraOps.length) {
        log(`${state.turnNumber}手番目: ${what}`);
        await screenshot(`${String(stats.playerTurns).padStart(2, '0')}-${op.name}`);
      }
      state = await getState();
    }

    const action = policy(state);
    if (action.type === 'move') {
      check(mode.kind === 'main', `移動の前のモードが main ではありません（${mode.kind}）`);
      if (await fingerMove(unit, action.x, action.z)) {
        await waitFor(
          `${unit.id} が (${action.x}, ${action.z}) へ移動`,
          ([id, x, z]) => {
            const u = window.__tactics.state().units.find((u) => u.id === id);
            return u.x === x && u.z === z && window.__tactics.mode() !== 'busy';
          },
          [unit.id, action.x, action.z],
        );
        // 最初の移動の後だけ、「移動をやり直す」を押して元の位置に戻り、もう一度同じマスへ移動する
        if (stats.undos === 0 && (await getMode()).kind === 'main') {
          await waitForInput();
          await screenshot('undo-move');
          await pressButton('移動をやり直す');
          await waitFor(
            '移動のやり直し',
            ([id, x, z]) => {
              const u = window.__tactics.state().units.find((u) => u.id === id);
              return u.x === x && u.z === z && window.__tactics.mode() === 'main';
            },
            [unit.id, unit.x, unit.z],
          );
          check(!(await page.getByRole('button', { name: '移動をやり直す' }).isVisible()), '移動をやり直した後も「移動をやり直す」が出ています');
          stats.undos++;
          await tapTile(action.x, action.z);
          await waitFor(
            `${unit.id} が (${action.x}, ${action.z}) へ移動（やり直しの後）`,
            ([id, x, z]) => {
              const u = window.__tactics.state().units.find((u) => u.id === id);
              return u.x === x && u.z === z && window.__tactics.mode() !== 'busy';
            },
            [unit.id, action.x, action.z],
          );
        }
        // 最初の移動の後で、ページを読み込み直して再開する（移動だけして閉じた場合も、その状態から再開できる）
        if (reloads && stats.reloads === 0 && (await getMode()).kind === 'main') {
          await waitForInput();
          await reloadAndResume('移動の後', true);
        }
        continue;
      }
      const tapPoint = await aimAt(action.x, action.z, undefined, `マス (${action.x}, ${action.z})`);
      const picked = await T(([x, y]) => window.__tactics.candidatesAt(x, y), [tapPoint.x, tapPoint.y]);
      await tapAt(tapPoint);
      await page
        .waitForFunction(
          ([id, x, z]) => {
            const u = window.__tactics.state().units.find((u) => u.id === id);
            return u.x !== x || u.z !== z;
          },
          [unit.id, unit.x, unit.z],
          { timeout: 3000, polling: 20 },
        )
        .catch(() => {});
      const nowUnit = (await getState()).units.find((u) => u.id === unit.id);
      check(
        nowUnit.x === action.x && nowUnit.z === action.z,
        `移動先が違います: 狙い (${action.x}, ${action.z}) / 実際 (${nowUnit.x}, ${nowUnit.z}) / タップ ${JSON.stringify(tapPoint)} / 判定 ${JSON.stringify(picked)} / モード ${JSON.stringify(await getMode())} / 手番 ${JSON.stringify((await getState()).turn)} / タップの記録 ${JSON.stringify(await T(() => window.__tactics.tapLog()))} / 要素 ${await T(([x, y]) => document.elementFromPoint(x, y)?.outerHTML.slice(0, 120), [tapPoint.x, tapPoint.y])}`,
      );
      await waitFor(
        `${unit.id} が (${action.x}, ${action.z}) へ移動`,
        ([id, x, z]) => {
          const u = window.__tactics.state().units.find((u) => u.id === id);
          return u.x === x && u.z === z && window.__tactics.mode() !== 'busy';
        },
        [unit.id, action.x, action.z],
      );
    } else if (action.type === 'attack') {
      if (mode.kind === 'main') {
        if (action.abilityId) {
          await openCommandOf(unit, action.abilityId);
          await pressButton(text.abilities[action.abilityId]);
        } else {
          await pressButton('攻撃');
        }
      }
      await waitFor('攻撃対象を選ぶ', () => window.__tactics.mode() === 'targeting');
      const target = state.units.find((u) => u.id === action.targetId);
      await aimAt(target.x, target.z, target.id, `ユニット ${target.id}`);
      const ok = await fingerTap(
        'target',
        await fingerPointOf(target.x, target.z, target.id),
        async () => {
          const m = await getMode();
          if (m.kind === 'confirm' && m.targetId === action.targetId) return 'ok';
          return m.kind === 'confirm' ? 'wrong' : 'none';
        },
        undefined,
        target.id,
      );
      if (!ok) await tapUnit(action.targetId);
      const chosen = await getMode();
      check(
        chosen.kind === 'confirm' && chosen.targetId === action.targetId,
        `ユニット ${action.targetId} をタップしたのに、選ばれたのは ${JSON.stringify(chosen)}`,
      );
      check(!(await overlaps('.preview', '.camera-buttons')), '攻撃の予測がカメラのボタンに重なっています');
      if (!stats.attackPreviewShot) {
        stats.attackPreviewShot = true;
        await screenshot('attack-preview');
      }
      await pressButton('確定');
      await waitFor('攻撃の後', () => window.__tactics.mode() !== 'busy' && window.__tactics.mode() !== 'confirm');
    } else if (action.type === 'cast') {
      check(mode.kind === 'main', `魔法の前のモードが main ではありません（${mode.kind}）`);
      await castSpell(action, unit);
    } else if (action.type === 'endTurn') {
      if (mode.kind === 'main') await pressButton('待機');
      await waitFor('向きを選ぶ', () => window.__tactics.mode() === 'facing');
      // 向きを選ぶ時、ユニットが画面の端ならカメラが寄るので、止まるのを待ってからボタンの位置を読む
      await waitCameraIdle();
      await checkFacingPad();
      if (stats.facingChanges === 0) await screenshot('facing-pad');
      if ((await getMode()).facing !== action.facing) {
        stats.facingChanges++;
        const ok = await fingerTap(
          'facing',
          await facingButtonPoint(action.facing),
          async () => ((await getMode()).facing === action.facing ? 'ok' : 'wrong'),
          undefined,
          action.facing,
        );
        if (!ok) await pressFacing(action.facing);
        const chosen = await getMode();
        check(
          chosen.kind === 'facing' && chosen.facing === action.facing,
          `向きのボタン ${action.facing} を押したのに、選ばれた向きは ${JSON.stringify(chosen)}`,
        );
      }
      const turn = state.turnNumber;
      await pressButton('確定');
      await waitFor('次の手番へ', (turn) => window.__tactics.state().turnNumber !== turn || window.__tactics.mode() === 'ended', turn);
      // 2回目の読み込み直し: 敵の手番の途中（敵が移動か行動をした後）で閉じても、最後に保存した状態から続きの敵の行動を再生する
      if (reloads && stats.reloads === 1) {
        const enemyMid = await page
          .waitForFunction(
            () => {
              const s = window.__tactics.state();
              const u = s?.turn && s.units.find((x) => x.id === s.turn.unitId);
              return u?.team === 'enemy' && (s.turn.moved || s.turn.acted);
            },
            null,
            { timeout: 15000, polling: 20 },
          )
          .then(() => true)
          .catch(() => false);
        if (enemyMid) await reloadAndResume('敵の手番の途中', false);
      }
    } else {
      throw new CheckError(`想定していない行動: ${JSON.stringify(action)}`);
    }
  }
  };
  const stopped = await playByTaps(quickStop, true);
  check(stats.reloads >= 1, '戦闘の途中での読み込み直しと再開を確かめられませんでした');

  // ---- 結果の照合 ----
  const final = stopped ? expected : await getState();
  await screenshot('99-result');
  check(final.winner === expected.winner, `勝敗が core の計算と違います（画面 ${final.winner} / core ${expected.winner}）`);
  check(final.turnNumber === expected.turnNumber, `手番数が core の計算と違います（画面 ${final.turnNumber} / core ${expected.turnNumber}）`);
  check(JSON.stringify(final) === JSON.stringify(expected), '最終状態（HP・位置・乱数の状態など）が core の計算と違います');
  // 戦闘中に経験値と JP が入っている（その場で反映される）
  check(final.units.some((u) => u.team === 'player' && u.progress && u.progress.gainedExp > 0), '戦闘中に経験値が入っていません');
  check(stats.casts > 0, '味方の魔法を一度も指定していません');
  check(stats.undos > 0, '「移動をやり直す」を一度も確かめていません');
  check(stats.facingChanges > 0, '向きのボタンを一度も押していません');
  check(stats.unitCasts > 0 && stats.tileCasts > 0, `ユニット狙いとマス狙いの両方を確かめられませんでした（${stats.unitCasts} / ${stats.tileCasts}）`);

  // ---- 結果の画面 ----
  deadline = Date.now() + AFTER_BATTLE_TIMEOUT_MS;
  await waitFor('結果の画面', () => window.__tactics.screen() === 'result');
  const resultText = await page.locator('.report-screen .result-title').textContent();
  check(resultText === (final.winner === 'player' ? '勝利' : '敗北'), `結果の画面の勝敗の表示が違います（${resultText}）`);
  // 勝利のボーナスの数え上げが終わるまで待つ
  await waitFor('結果の画面の数え上げ', () => document.querySelector('.report-screen[data-done="true"]') !== null);
  for (const u of plan.report.units) {
    const row = page.locator(`.report-row[data-unit-id="${u.unitId}"]`);
    const got = [await row.getAttribute('data-exp'), await row.getAttribute('data-jp')].map(Number);
    check(got[0] === u.exp && got[1] === u.jp, `${u.unitId} の得た経験値と JP の合計が core の計算と違います（画面 ${got} / core ${[u.exp, u.jp]}）`);
  }
  const levelUps = await page.locator('.report-ups .report-chip:not(.down):not(.unlock)').count();
  const expectedUps = plan.report.units.filter((u) => u.levelAfter > u.levelBefore).length;
  check(levelUps === expectedUps, `レベルが上がったユニットの数が違います（画面 ${levelUps} / core ${expectedUps}）`);
  // 新しく就けるようになったジョブの札（フェーズ2-6）
  const unlockChips = await page.locator('.report-ups .report-chip.unlock').count();
  // 新しく就けるジョブは、1つの札にまとめる
  const expectedUnlocks = plan.afterBattle.units.some(
    (u) => core.progression.newlyUnlockedJobs(core.data.roster.units.find((x) => x.id === u.id), u, core.data.catalog, core.data.progression).length > 0,
  )
    ? 1
    : 0;
  check(unlockChips === expectedUnlocks, `新しく就けるジョブの札の数が違います（画面 ${unlockChips} / core ${expectedUnlocks}）`);
  const jobUps = await page.locator('.report-job-up:not([hidden])').count();
  const expectedJobUps = plan.report.units.filter((u) => u.jobLevelAfter > u.jobLevelBefore).length;
  check(jobUps === expectedJobUps, `ジョブのレベルが上がった表示の数が違います（画面 ${jobUps} / core ${expectedJobUps}）`);
  // 手に入れたゴールドと戦利品（勝った時だけ。core と同じ抽選）
  const spoilsBox = page.locator('.report-spoils');
  const shownGold = Number(await spoilsBox.getAttribute('data-gold'));
  const shownItems = Number(await spoilsBox.getAttribute('data-items'));
  check(
    shownGold === plan.spoils.gold && shownItems === plan.spoils.itemIds.length,
    `結果の画面のゴールドと戦利品が core の計算と違います（画面 ${shownGold}・${shownItems}個 / core ${plan.spoils.gold}・${plan.spoils.itemIds.length}個）`,
  );
  await screenshot('result-screen');
  await pressButton(text.report.toBase);
  await waitFor('拠点', () => window.__tactics.screen() === 'base');
  const baseGold = Number(await page.locator('.base-gold').getAttribute('data-gold'));
  check(baseGold === plan.afterBattle.gold, `拠点の所持金が違います（画面 ${baseGold} / core ${plan.afterBattle.gold}）`);
  const sameRoster = async (want, what) => {
    const got = await T(() => window.__tactics.roster());
    check(JSON.stringify(got) === JSON.stringify(want), `${what}: 部隊の状態が core の計算と違います（画面 ${JSON.stringify(got)} / core ${JSON.stringify(want)}）`);
  };
  await sameRoster(plan.afterBattle, '戦闘の後');

  // ---- 編成: 4つのタブ、説明の欄からの習得・ジョブチェンジ・副コマンドの付け替え ----
  const tapLocator = async (loc) => {
    stats.taps++;
    if (touch) await loc.tap();
    else await loc.click();
  };
  const pickUnit = async (id) => {
    await tapLocator(page.locator(`.unit-pick[data-unit-id="${id}"]`));
    await waitFor(`${id} を選ぶ`, (id) => document.querySelector('.roster-screen')?.dataset.unitId === id, id);
  };
  const openTab = async (tab) => {
    await tapLocator(page.locator(`.roster-tabs .tab-button[data-tab="${tab}"]`));
    await waitFor(`タブ ${tab}`, (tab) => document.querySelector('.roster-panel')?.dataset.tab === tab, tab);
    stats.tabs++;
  };
  const openLearnGroup = async (group) => {
    await tapLocator(page.locator(`.learn-filter .tab-button[data-tab="${group}"]`));
    await waitFor(`習得の種類 ${group}`, (g) => document.querySelector('.learn-list')?.dataset.group === g, group);
  };
  /** 習得の一覧の項目を押して、説明の欄を開く */
  const openLearnItem = async (jobId, abilityId) => {
    await tapLocator(page.locator(`.learn-item[data-job-id="${jobId}"][data-ability-id="${abilityId}"]`));
    await waitFor('説明の欄', (a) => document.querySelector(`.sheet[data-sheet="ability"][data-ability-id="${a}"]`) !== null, abilityId);
    await waitSheetStill();
  };
  /** 欄がせり上がる動きの途中で押すと、動いている先を押してしまうことがあるため、動きが終わるまで待つ */
  const waitSheetStill = () =>
    waitFor('説明の欄の動きが終わる', () =>
      [...document.querySelectorAll('.sheet')].every((s) => s.getAnimations().every((a) => a.playState !== 'running')),
    );
  const closeSheet = async () => {
    await waitSheetStill();
    await pressButton(text.roster.close);
    await waitFor('説明の欄を閉じる', () => document.querySelector('.sheet') === null);
  };
  /** ユニットを選んだ後、ジョブチェンジと付け替えに2回以内のタップで届く（タブ → 項目） */
  const viaTwoTaps = async (tab, itemSelector, sheetKind) => {
    await openTab(tab);
    await tapLocator(page.locator(itemSelector));
    await waitFor(`欄 ${sheetKind}`, (k) => document.querySelector(`.sheet[data-sheet="${k}"]`) !== null, sheetKind);
    await waitSheetStill();
  };
  // ---- 店で買う（フェーズ2-4）: 説明の欄で、部隊のだれが装備できるかと能力値の変化を見てから買う。ゴールドが足りない物は買えない ----
  const shopGold = async () => Number(await page.locator('.shop-gold').getAttribute('data-gold'));
  const openShopItem = async (selector, kind) => {
    await tapLocator(page.locator(selector).first());
    await waitFor(`店の欄 ${kind}`, (k) => document.querySelector(`.sheet[data-sheet="${k}"]`) !== null, kind);
    await waitSheetStill();
  };
  await pressButton(text.base.shop);
  await waitFor('店の画面', () => window.__tactics.screen() === 'shop');
  const shownStock = await page.locator('.shop-list .shop-item').evaluateAll((els) => els.map((e) => e.dataset.itemId));
  check(JSON.stringify(shownStock) === JSON.stringify(plan.stock), `店の品ぞろえが違います（画面 ${shownStock} / core ${plan.stock}）`);
  await screenshot('shop-buy');
  await openShopItem(`.shop-item[data-item-id="${plan.buy.itemId}"]`, 'shop-buy');
  // 部隊の5人の行。剣を装備できる戦士の行には、付け替えた時の攻撃力の変化が出る
  check((await page.locator('.shop-fit-row').count()) === plan.afterBattle.units.length, '店の欄に部隊のだれが装備できるかが出ていません');
  check((await page.locator('.shop-fit-row.no').count()) === 3, '剣を装備できないユニットの数が違います');
  await screenshot('shop-buy-sheet');
  await tapLocator(page.locator('.sheet .shop-confirm'));
  await waitFor('買う', (n) => window.__tactics.roster().items.length === n, plan.afterBuy.items.length);
  stats.buys++;
  check((await shopGold()) === plan.afterBuy.gold, `買った後の所持金が違います（画面 ${await shopGold()} / core ${plan.afterBuy.gold}）`);
  await closeSheet();
  // ゴールドが足りない物は「買う」が押せず、理由が出る
  await openShopItem(`.shop-item[data-item-id="${plan.tooExpensive}"]`, 'shop-buy');
  check(await page.locator('.sheet .shop-confirm').isDisabled(), `ゴールドが足りない ${plan.tooExpensive} の「買う」が押せます`);
  check((await page.locator('.sheet').textContent()).includes(text.shop.buyRefusal.notEnoughGold), 'ゴールドが足りない理由が出ていません');
  await closeSheet();
  await pressButton(text.shop.back);
  await waitFor('拠点', () => window.__tactics.screen() === 'base');
  await sameRoster(plan.afterBuy, '店で買った後');

  await pressButton('編成');
  await waitFor('編成の画面', () => window.__tactics.screen() === 'roster');
  // 5つのタブを順に開く（能力の棒、ジョブ、アビリティの枠、習得の一覧、装備）
  for (const tab of ['stats', 'job', 'abilities', 'learn', 'equip']) {
    await openTab(tab);
    await screenshot(`roster-tab-${tab}`);
  }
  check((await page.locator('.stat-bar-row').count()) === 0, '装備のタブに能力の棒が出ています');
  check((await page.locator('.equip-row').count()) === 3, '装備のタブに3つの枠がありません');
  await openTab('stats');
  check((await page.locator('.stat-bar-row').count()) === 5, '能力のタブに5つの能力の棒がありません');
  check((await page.locator('.growth-total .bar').count()) === 1, '成長の合計の棒がありません');
  if (plan.learn) {
    await pickUnit(plan.learn.unitId);
    await openTab('learn');
    await openLearnGroup('action');
    await openLearnItem(plan.learn.jobId, plan.learn.abilityId);
    const button = page.locator('.sheet .learn-confirm');
    check(!(await button.isDisabled()), `${plan.learn.abilityId} の「習得する」が押せません`);
    await screenshot('roster-learn-sheet');
    await tapLocator(button);
    await waitFor(
      '習得',
      ([u, j, a]) => window.__tactics.roster().units.find((x) => x.id === u).jobs[j].learned.includes(a),
      [plan.learn.unitId, plan.learn.jobId, plan.learn.abilityId],
    );
    stats.learned++;
    await closeSheet();
    const itemText = await page.locator(`.learn-item[data-ability-id="${plan.learn.abilityId}"]`).textContent();
    check(itemText.includes(text.roster.learned), `習得した後の一覧に「習得済み」が出ていません（${itemText}）`);
  }
  await pickUnit(plan.jobUnitId);
  for (const jobId of [plan.subJobId, plan.homeJobId]) {
    await viaTwoTaps('job', `.job-choice[data-job-id="${jobId}"]`, 'job');
    check((await page.locator('.sheet .compare-grid').count()) === 1, '能力値と成長率の比較が出ていません');
    const first = stats.jobChanges === 0;
    // 魔道士になると、剣と鎧が外れる（変える前の欄と、変えた後の知らせに出る）
    const removedNames = plan.removed.map((id) => text.equipment[id].name).join('・');
    if (first) {
      check((await page.locator('.sheet .sheet-warning').textContent()).includes(removedNames), `外れる装備の知らせが出ていません（${removedNames}）`);
      await screenshot('roster-job-sheet');
    }
    await pressButton(text.roster.becomeJob(text.jobs[jobId]));
    await waitFor('ジョブチェンジ', ([u, j]) => window.__tactics.roster().units.find((x) => x.id === u).jobId === j, [plan.jobUnitId, jobId]);
    if (first) {
      check((await page.locator('.roster-notice').textContent()).includes(removedNames), '装備が外れた知らせが出ていません');
      check(
        await T((u) => Object.values(window.__tactics.roster().units.find((x) => x.id === u).equipment).every((v) => v === null), plan.jobUnitId),
        'ジョブを変えた後に、付けられない装備が外れていません',
      );
    }
    stats.jobChanges++;
  }
  // ---- 装備のタブ: 買った剣を付け替える（ほかの枠の候補には、付け替えた時の能力値の変化が出る）。外れた戦士は「おまかせ」 ----
  await pickUnit(plan.equipUnitId);
  await viaTwoTaps('equip', '.equip-row[data-slot="weapon"]', 'equip-weapon');
  const boughtChoice = page.locator(`.sheet .equip-choice[data-uid="${plan.buy.uid}"]`);
  check((await boughtChoice.count()) === 1, '買った剣が武器の候補に出ていません');
  await screenshot('roster-equip-sheet');
  await tapLocator(boughtChoice);
  await waitFor('武器の付け替え', ([u, uid]) => window.__tactics.roster().units.find((x) => x.id === u).equipment.weapon === uid, [plan.equipUnitId, plan.buy.uid]);
  stats.equips++;
  await pickUnit(plan.jobUnitId);
  await openTab('equip');
  await pressButton(text.roster.autoEquip);
  await waitFor(
    '「おまかせ」',
    ([u, want]) => JSON.stringify(window.__tactics.roster().units.find((x) => x.id === u).equipment) === want,
    [plan.jobUnitId, JSON.stringify(plan.afterEdit.units.find((x) => x.id === plan.jobUnitId).equipment)],
  );
  stats.autoEquips++;
  await screenshot('roster-equip-auto');
  await viaTwoTaps('abilities', '.slot-row[data-slot="secondary"]', 'slot-secondary');
  await screenshot('roster-slot-sheet');
  await tapLocator(page.locator(`.sheet .screen-button[data-job-id="${plan.subJobId}"]`));
  await waitFor('副コマンド', ([u, j]) => window.__tactics.roster().units.find((x) => x.id === u).slots.secondary === j, [plan.jobUnitId, plan.subJobId]);
  stats.subChanges++;
  const subText = await page.locator('.slot-row[data-slot="secondary"]').textContent();
  check(subText.includes(text.commands[plan.subJobId]), `付けた副コマンドが枠に出ていません（${subText}）`);
  await screenshot('roster-after');
  await pressButton(text.roster.back);
  await waitFor('拠点', () => window.__tactics.screen() === 'base');
  await sameRoster(plan.afterEdit, '編成の後');

  // ---- 店で売る: 装備中の物は売れない（理由が出る）。だれも付けていない物を売ると、売値（買値の半分）が入る ----
  await pressButton(text.base.shop);
  await waitFor('店の画面', () => window.__tactics.screen() === 'shop');
  await tapLocator(page.locator('.shop-tabs .tab-button[data-tab="sell"]'));
  await waitFor('売るのタブ', () => document.querySelector('.shop-list')?.dataset.tab === 'sell');
  await screenshot('shop-sell');
  await openShopItem(`.shop-item[data-uid="${plan.sell.equippedUid}"]`, 'shop-sell');
  check(await page.locator('.sheet .shop-confirm').isDisabled(), '装備中の物の「売る」が押せます');
  check((await page.locator('.sheet').textContent()).includes(text.shop.sellRefusal.equipped), '装備中の物を売れない理由が出ていません');
  await closeSheet();
  await openShopItem(`.shop-item[data-uid="${plan.sell.uid}"]`, 'shop-sell');
  await tapLocator(page.locator('.sheet .shop-confirm'));
  await waitFor('売る', (uid) => !window.__tactics.roster().items.some((i) => i.uid === uid), plan.sell.uid);
  stats.sells++;
  check((await shopGold()) === plan.afterSell.gold, `売った後の所持金が違います（画面 ${await shopGold()} / core ${plan.afterSell.gold}）`);
  await pressButton(text.shop.back);
  await waitFor('拠点', () => window.__tactics.screen() === 'base');
  await sameRoster(plan.afterSell, '店で売った後');

  // ---- 再び出撃: 部隊の変更（装備を含む）が戦闘に反映される ----
  await sortieTraining(text.tiers.normal.name);
  const second = await getState();
  const want = core.start(plan.afterSell, 'normal', 1).state;
  for (const u of want.units.filter((u) => u.team === 'player')) {
    const got = second.units.find((x) => x.id === u.id);
    const pick = (x) => JSON.stringify([x.jobId, x.level, x.stats, x.commands, x.weapon, x.equipment.map((e) => e.id)]);
    check(pick(got) === pick(u), `2戦目の ${u.id} に部隊の状態が反映されていません（画面 ${pick(got)} / core ${pick(u)}）`);
  }
  check(pageErrors.length === 0, `ページでエラー: ${pageErrors.map((e) => e.message).join(' / ')}`);

  // ---- 時守の4つの行動（フェーズ2-6）の本体 ----
  async function timekeeperScenes() {
    await waitForInput();
    const tk = timekeeperDrill(core);
    for (const d of tk.drills) {
      await page.evaluate((r) => window.__tactics.load(r), tk.start);
      await waitFor('時守の手番', (id) => window.__tactics.mode() === 'main' && window.__tactics.state().turn?.unitId === id, tk.unitId);
      await waitForInput();
      const me = (await getState()).units.find((u) => u.id === tk.unitId);
      await openCommandOf(me, d.abilityId);
      await pressButton(text.abilities[d.abilityId]);
      await waitFor(`「${d.abilityId}」の相手を選ぶ`, (id) => {
        const m = window.__tactics.modeDetail();
        return (m.kind === 'targeting' && m.abilityId === id) || (m.kind === 'spellTarget' && m.spellId === id);
      }, d.abilityId);
      await tapUnit(d.targetId);
      const m = await getMode();
      check(m.kind === 'confirm' || (m.kind === 'spellConfirm' && m.target.kind === 'unit' && m.target.unitId === d.targetId), `「${d.abilityId}」の相手の選択が違います（${JSON.stringify(m)}）`);
      const previewText = await page.locator('.preview').textContent();
      for (const want of d.previewIncludes) check(previewText.includes(want), `「${d.abilityId}」の予測に「${want}」がありません（${previewText}）`);
      check(!(await overlaps('.preview', '.actions')), `「${d.abilityId}」の予測が行動のボタンに重なっています`);
      await screenshot(`timekeeper-${d.abilityId}`);
      await pressButton('確定');
      await waitFor(`「${d.abilityId}」の後`, () => !['busy', 'confirm', 'spellConfirm'].includes(window.__tactics.mode()));
      const pick = (st) => JSON.stringify(st.units.filter((u) => d.compare.includes(u.id)).map((u) => [u.id, u.x, u.z, u.hp, u.ct]));
      check(pick(await getState()) === pick(d.expected), `「${d.abilityId}」の結果が core の計算と違います（画面 ${pick(await getState())} / core ${pick(d.expected)}）`);
      stats.timekeeper++;
    }
  }

  // ---- 新しいジョブ（騎士・格闘家・盗賊）の行動の本体 ----
  async function newJobActionScenes(jd) {
    // (3) 新しいジョブの代表的な行動を1つずつ（騎士の武器破壊・格闘家の連撃・盗賊の装備を盗む）。予測の文言と、結果が core の計算と同じか
    for (const d of jd.actions) {
      await page.evaluate((r) => window.__tactics.load(r), d.start);
      await waitFor('新しいジョブの手番', (id) => window.__tactics.mode() === 'main' && window.__tactics.state().turn?.unitId === id, d.unitId);
      await waitForInput();
      const me = (await getState()).units.find((u) => u.id === d.unitId);
      await openCommandOf(me, d.abilityId);
      await pressButton(text.abilities[d.abilityId]);
      await waitFor(`「${d.abilityId}」の相手を選ぶ`, (id) => {
        const m = window.__tactics.modeDetail();
        return m.kind === 'targeting' && m.abilityId === id;
      }, d.abilityId);
      await tapUnit(d.targetId);
      const previewText = await page.locator('.preview').textContent();
      for (const want of d.previewIncludes) check(previewText.includes(want), `「${d.abilityId}」の予測に「${want}」がありません（${previewText}）`);
      check(!(await overlaps('.preview', '.actions')), `「${d.abilityId}」の予測が行動のボタンに重なっています`);
      await screenshot(`newjob-${d.abilityId}`);
      await pressButton('確定');
      await waitFor(`「${d.abilityId}」の後`, () => !['busy', 'confirm'].includes(window.__tactics.mode()));
      const pick = (st) =>
        JSON.stringify([st.stolen ?? null, ...st.units.filter((u) => [d.unitId, d.targetId].includes(u.id)).map((u) => [u.id, u.hp, u.statuses, u.equipment.map((e) => e.id), u.stats.attack])]);
      check(pick(await getState()) === pick(d.expected), `「${d.abilityId}」の結果が core の計算と違います（画面 ${pick(await getState())} / core ${pick(d.expected)}）`);
      stats.newJobActions++;
    }
  }

  // ---- 魔法のジョブと目印・膠着の表示（フェーズ2-6 PR C）----
  async function magicJobScenes(jd) {
    // (4) 魔法のジョブ（フェーズ2-6 PR C）: 時魔道士の早送り、召喚士の炎の精霊（敵だけに効く赤い範囲）、魔法剣士の炎の剣
    for (const d of jd.spells) {
      await page.evaluate((r) => window.__tactics.load(r), d.start);
      await waitFor('魔法のジョブの手番', (id) => window.__tactics.mode() === 'main' && window.__tactics.state().turn?.unitId === id, d.unitId);
      await waitForInput();
      const me = (await getState()).units.find((u) => u.id === d.unitId);
      await openCommandOf(me, d.abilityId);
      await pressButton(text.abilities[d.abilityId]);
      await waitFor(`「${d.abilityId}」の狙い`, (id) => {
        const m = window.__tactics.modeDetail();
        return (m.kind === 'spellTarget' && m.spellId === id) || (m.kind === 'targeting' && m.abilityId === id);
      }, d.abilityId);
      await tapUnit(d.targetId);
      if ((await getMode()).kind === 'spellTargetKind') await pressButton(d.tile ? text.buttons.targetTile : text.buttons.targetUnit);
      const m = await getMode();
      check(m.kind === 'spellConfirm' || m.kind === 'confirm', `「${d.abilityId}」の確定の前の画面になっていません（${JSON.stringify(m)}）`);
      const previewText = await page.locator('.preview').textContent();
      for (const want of d.previewIncludes) check(previewText.includes(want), `「${d.abilityId}」の予測に「${want}」がありません（${previewText}）`);
      if (d.markKind) {
        const kinds = await T(() => window.__tactics.marks().map((x) => x.kind));
        check(kinds.includes(d.markKind), `「${d.abilityId}」の範囲の色分け（${d.markKind}）がありません（${JSON.stringify([...new Set(kinds)])}）`);
      }
      check(!(await overlaps('.preview', '.actions')), `「${d.abilityId}」の予測が行動のボタンに重なっています`);
      await screenshot(`newjob-${d.abilityId}`);
      await pressButton('確定');
      await waitFor(`「${d.abilityId}」の後`, () => !['busy', 'confirm', 'spellConfirm'].includes(window.__tactics.mode()));
      const pick = (st) => JSON.stringify(st.units.filter((u) => [d.unitId, d.targetId].includes(u.id)).map((u) => [u.id, u.hp, u.mp, u.charging, u.statuses]));
      check(pick(await getState()) === pick(d.expected), `「${d.abilityId}」の結果が core の計算と違います（画面 ${pick(await getState())} / core ${pick(d.expected)}）`);
      stats.newJobActions++;
    }

    // (5) 頭上の状態変化の目印は2つまでで、残りは「+N」。膠着まで残り 10 手番になると、勝敗条件の帯に残りの手番数が出る
    await page.evaluate((r) => window.__tactics.load(r), jd.markers.start);
    await waitFor('目印の場面', (id) => window.__tactics.mode() === 'main' && window.__tactics.state().turn?.unitId === id, jd.markers.unitId);
    await waitForInput();
    const badges = await T((id) => {
      const labels = [...document.querySelectorAll('.unit-label')];
      const i = window.__tactics.state().units.findIndex((u) => u.id === id);
      return [...labels[i].querySelectorAll('.status-badge')].map((b) => b.textContent);
    }, jd.markers.targetId);
    check(JSON.stringify(badges) === JSON.stringify(jd.markers.badges), `頭上の状態変化の目印が違います（画面 ${JSON.stringify(badges)} / 期待 ${JSON.stringify(jd.markers.badges)}）`);
    const quietBar = await page.locator('.objective-bar').textContent();
    check(quietBar.includes(jd.markers.stalemate), `膠着までの残りの手番数が出ていません（${quietBar}）`);
    await screenshot('status-markers-stalemate');
  }

  // 短くした版（CI）では、ここから先（技・突き飛ばし・罠と増援・反撃・詠唱の中断・読み込み直し・受動的なアビリティ・はじめから・ダンジョン）は
  // 最初の画面サイズ（縦向き）だけで確かめる。画面サイズによって変わるのはタップの位置と画面の収まりで、それはここまでと画面の収まりの確認で見ているため。
  // 検査全体を5分以内に収めるため（フェーズ2-4 で店と装備の操作を足し、5分を少し超えた）
  if (QUICK && name !== VIEWPORTS[0]) {
    await timekeeperScenes();
    const quickJd = jobDrills(core, passiveDrill(core, plan.afterSell).expected);
    await newJobActionScenes(quickJd);
    await magicJobScenes(quickJd);
    check(pageErrors.length === 0, `ページでエラー: ${pageErrors.map((e) => e.message).join(' / ')}`);
    await context.close();
    for (const d of finger.details) log(`押し直し: ${d}`);
    return {
      winner: final.winner,
      turns: final.turnNumber,
      finger,
      ...stats,
      partial: true,
      seconds: Math.round((Date.now() - started) / 1000),
    };
  }

  // ---- 技（強打）と副コマンドのメニュー ----
  // 強打を覚えた戦士が、敵の隣で手番を迎えた場面を用意して、「武技」→「強打」→ 相手 → 予測 → 確定 を確かめる。
  // 副コマンド（攻撃魔法）のメニューも開き、MP が足りない魔法が押せないことを確かめる
  const sd = strikeDrill(core, plan);
  await page.evaluate((r) => window.__tactics.load(r), sd.start);
  await waitFor('強打の手番', (id) => window.__tactics.mode() === 'main' && window.__tactics.state().turn?.unitId === id, sd.unitId);
  await waitForInput();
  const sdUnit = (await getState()).units.find((u) => u.id === sd.unitId);
  await openCommandOf(sdUnit, sd.subAbilityId);
  await screenshot('sub-command-menu');
  await pressButton(text.buttons.back);
  await waitFor('行動を選ぶ', () => window.__tactics.mode() === 'main');
  await openCommandOf(sdUnit, 'powerStrike');
  await pressButton(text.abilities.powerStrike);
  await waitFor('強打の相手を選ぶ', () => {
    const m = window.__tactics.modeDetail();
    return m.kind === 'targeting' && m.abilityId === 'powerStrike';
  });
  await tapUnit(sd.targetId);
  const sdMode = await getMode();
  check(sdMode.kind === 'confirm' && sdMode.abilityId === 'powerStrike' && sdMode.targetId === sd.targetId, `強打の相手の選択が違います（${JSON.stringify(sdMode)}）`);
  const sdTitle = await page.locator('.preview-title').textContent();
  check(sdTitle.includes(text.abilities.powerStrike), `強打の予測の題が違います（${sdTitle}）`);
  await screenshot('strike-preview');
  await pressButton('確定');
  // 戦闘中のレベルアップ: 頭上の「+N EXP」「+N JP」、「レベルアップ！」の帯とユニットの名前、情報の欄のレベル
  await waitFor('経験値と JP の表示', () => document.querySelector('.popup.gain') !== null);
  await waitFor('レベルアップの表示', () => {
    const b = document.querySelector('.levelup-banner');
    return b && !b.hidden && document.querySelector('.popup.levelup') !== null;
  });
  const bannerText = await page.locator('.levelup-banner').textContent();
  const sdName = text.unitNames[sd.unitId];
  check(bannerText.includes(text.gain.levelUp) && bannerText.includes(sdName), `レベルアップの帯にユニットの名前がありません（${bannerText}）`);
  await screenshot('level-up');
  await waitFor('強打の後', () => !['busy', 'confirm'].includes(window.__tactics.mode()));
  const sdAfter = await getState();
  const leveled = sdAfter.units.find((u) => u.id === sd.unitId);
  check(leveled.level === sdUnit.level + 1, `戦闘中にレベルが上がっていません（${sdUnit.level} → ${leveled.level}）`);
  const infoText = await page.locator('.unit-info').textContent();
  check(infoText.includes(text.roster.level(leveled.level)) && infoText.includes(text.gain.jpHave(leveled.progress.jp)), `情報の欄にレベルと JP が出ていません（${infoText}）`);
  const pickHit = (st) =>
    JSON.stringify(st.units.map((u) => [u.id, u.hp, u.actionCount, u.level, u.stats, u.progress]).filter(([id]) => id === sd.unitId || id === sd.targetId));
  check(pickHit(sdAfter) === pickHit(sd.expected), `強打の結果が core の計算と違います（画面 ${pickHit(sdAfter)} / core ${pickHit(sd.expected)}）`);
  check(pageErrors.length === 0, `ページでエラー: ${pageErrors.map((e) => e.message).join(' / ')}`);

  // ---- 突き飛ばし ----
  // 突き飛ばしを覚えた戦士が、高台の上で敵の背後に立った場面を用意して、「武技」→「突き飛ばし」→ 相手 →
  // 予測（押し出す先と落下ダメージ）→ 確定 を確かめる。押し出す先のマスと、押し出された後の位置・HP を core の計算と比べる
  await waitForInput();
  const kd = knockbackDrill(core);
  await page.evaluate((r) => window.__tactics.load(r), kd.start);
  await waitFor('突き飛ばしの手番', (id) => window.__tactics.mode() === 'main' && window.__tactics.state().turn?.unitId === id, kd.unitId);
  await waitForInput();
  const kdUnit = (await getState()).units.find((u) => u.id === kd.unitId);
  await openCommandOf(kdUnit, 'knockback');
  await pressButton(text.abilities.knockback);
  await waitFor('突き飛ばしの相手を選ぶ', () => {
    const m = window.__tactics.modeDetail();
    return m.kind === 'targeting' && m.abilityId === 'knockback';
  });
  await tapUnit(kd.targetId);
  const kdMode = await getMode();
  check(kdMode.kind === 'confirm' && kdMode.abilityId === 'knockback', `突き飛ばしの相手の選択が違います（${JSON.stringify(kdMode)}）`);
  const kdPreview = await page.locator('.preview').textContent();
  check(kdPreview.includes(text.preview.knockback) && kdPreview.includes(text.preview.knockbackTo(kd.fall)), `突き飛ばしの予測に押し出す先と落下ダメージがありません（${kdPreview}）`);
  const pushMark = await T(() => window.__tactics.marks().filter((m) => m.kind === 'push'));
  check(JSON.stringify(pushMark.map((m) => [m.x, m.z])) === JSON.stringify([[kd.to.x, kd.to.z]]), `押し出す先のマスの表示が違います（${JSON.stringify(pushMark)}）`);
  check(!(await overlaps('.preview', '.actions')), '突き飛ばしの予測が行動のボタンに重なっています');
  await screenshot('knockback-preview');
  await pressButton('確定');
  await waitFor('突き飛ばしの後', () => !['busy', 'confirm'].includes(window.__tactics.mode()));
  const pickPush = (st) => JSON.stringify(st.units.filter((u) => u.id === kd.targetId).map((u) => [u.x, u.z, u.hp]));
  check(pickPush(await getState()) === pickPush(kd.expected), `突き飛ばしの結果が core の計算と違います（画面 ${pickPush(await getState())} / core ${pickPush(kd.expected)}）`);
  stats.knockbacks++;
  check(pageErrors.length === 0, `ページでエラー: ${pageErrors.map((e) => e.message).join(' / ')}`);

  // ---- 罠・増援・到達（はじまりの遺跡 第2戦の場面） ----
  // 見えない罠（ぬかるみ）のマスへ移動すると、発動して見えるようになり、鈍足が付き、移動をやり直せない
  await waitForInput();
  const td = scenarioDrills(core);
  await page.evaluate((r) => window.__tactics.load(r), td.trap.start);
  await waitFor('罠の場面', (id) => window.__tactics.mode() === 'main' && window.__tactics.state().turn?.unitId === id, td.unitId);
  await waitForInput();
  const overlaysNow = () => T(() => window.__tactics.overlays());
  check(!(await overlaysNow()).some((o) => o.kind.startsWith('trap')), '見えていない罠が、マップに表示されています');
  check((await overlaysNow()).some((o) => o.kind === 'goal'), '到達するマスがマップに表示されていません');
  await tapTile(td.trap.to.x, td.trap.to.z);
  await waitFor('罠の発動', () => window.__tactics.state().scenario.traps.some((t) => t.revealed) && window.__tactics.mode() !== 'busy');
  await waitForInput();
  const trapState = await getState();
  check(
    JSON.stringify(trapState.units.find((u) => u.id === td.unitId).statuses) === JSON.stringify(td.trap.expected.units.find((u) => u.id === td.unitId).statuses),
    'ぬかるみの鈍足が core の計算と違います',
  );
  check((await overlaysNow()).some((o) => o.kind === 'trap-mud' && o.x === td.trap.to.x && o.z === td.trap.to.z), '発動した罠が、マップに表示されていません');
  check((await page.locator('.undo-move').count()) === 0, '罠が発動した移動の後に「移動をやり直す」が出ています');
  stats.traps++;
  await screenshot('trap');

  // 増援: 予告の目印があり、手番を終えると現れる
  await page.evaluate((r) => window.__tactics.load(r), td.reinforce.start);
  await waitFor('増援の場面', (id) => window.__tactics.mode() === 'main' && window.__tactics.state().turn?.unitId === id, td.unitId);
  await waitForInput();
  check((await overlaysNow()).filter((o) => o.kind === 'warning').length === td.reinforce.count, '増援の予告の目印が出ていません');
  const bar = await page.locator('.objective-bar').textContent();
  check(bar.includes(text.objectives.reinforcementShort(0)), `勝敗条件の欄に増援の予告がありません（${bar}）`);
  await screenshot('reinforcement-warning');
  await pressButton(text.buttons.wait);
  await waitFor('向きを選ぶ', () => window.__tactics.mode() === 'facing');
  await pressButton(text.buttons.endTurn);
  await waitFor('増援の出現', (n) => window.__tactics.state().units.length === n, td.reinforce.unitsAfter);
  await waitFor('増援の頭上の表示', (n) => document.querySelectorAll('.unit-label').length === n, td.reinforce.unitsAfter);
  stats.appeared += td.reinforce.count;
  await waitForInput();
  await screenshot('reinforcement-appeared');

  // 到達: 到達するマスへ移動すると勝利
  await page.evaluate((r) => window.__tactics.load(r), td.reach.start);
  await waitFor('到達の場面', (id) => window.__tactics.mode() === 'main' && window.__tactics.state().turn?.unitId === id, td.unitId);
  await waitForInput();
  await tapTile(td.reach.to.x, td.reach.to.z);
  await waitFor('到達で勝利', () => window.__tactics.state().winner === 'player' && window.__tactics.mode() === 'ended');
  stats.reached++;
  await screenshot('reach-victory');
  check(pageErrors.length === 0, `ページでエラー: ${pageErrors.map((e) => e.message).join(' / ')}`);

  // ---- 反撃 ----
  // 「反撃」を付けた敵の隣で手番を迎えた戦士が通常攻撃し、予測に「反撃あり」が出ること、
  // 反撃が発動して名前が表示され、結果が core の計算と同じになることを確かめる
  await waitForInput();
  const cd = counterDrill(core);
  await page.evaluate((r) => window.__tactics.load(r), cd.start);
  await waitFor('反撃を受ける手番', (id) => window.__tactics.mode() === 'main' && window.__tactics.state().turn?.unitId === id, cd.unitId);
  await waitForInput();
  await pressButton('攻撃');
  await waitFor('攻撃対象を選ぶ', () => window.__tactics.mode() === 'targeting');
  await tapUnit(cd.targetId);
  const cdPreview = await page.locator('.preview').textContent();
  check(cdPreview.includes(text.preview.counter), `攻撃の予測に「反撃あり」がありません（${cdPreview}）`);
  check(!(await overlaps('.preview', '.actions')), '反撃つきの攻撃の予測が行動のボタンに重なっています');
  await screenshot('counter-preview');
  const sawReaction = page
    .waitForFunction((name) => [...document.querySelectorAll('.popup.reaction')].some((p) => p.textContent === name), text.abilities.counter, {
      timeout: 20000,
      polling: 20,
    })
    .then(() => true)
    .catch(() => false);
  await pressButton('確定');
  check(await sawReaction, 'リアクション「反撃」の名前が表示されませんでした');
  await waitFor('反撃の後', () => !['busy', 'confirm'].includes(window.__tactics.mode()));
  const pickCounter = (st) => JSON.stringify(st.units.filter((u) => u.id === cd.unitId || u.id === cd.targetId).map((u) => [u.id, u.hp]));
  check(pickCounter(await getState()) === pickCounter(cd.expected), `反撃の結果が core の計算と違います（画面 ${pickCounter(await getState())} / core ${pickCounter(cd.expected)}）`);
  stats.counters++;
  check(pageErrors.length === 0, `ページでエラー: ${pageErrors.map((e) => e.message).join(' / ')}`);

  // ---- 時守の4つの行動（フェーズ2-6）----
  // トウマ（時守）が、敵の戦士2体（正面と、その左のマス）の前で手番を迎えた場面を用意して、
  // 斬り分け・引き戻し・門渡り・時送りを1つずつ、メニュー → 相手 → 予測 → 確定 で行い、結果を core の計算と比べる
  // 短くした版では、2つ目の画面サイズ（横向き）で確かめる（検査全体を5分以内に収めるため）
  if (!QUICK) await timekeeperScenes();
  check(pageErrors.length === 0, `ページでエラー: ${pageErrors.map((e) => e.message).join(' / ')}`);

  // ---- 詠唱の中断 ----
  // 詠唱中の味方の魔道士に手番が来た場面を用意して、移動しようとすると確認が出ること、
  // 「やめない」で何も変わらないこと、「詠唱をやめる」で中断されて移動することを確かめる
  await waitForInput();
  const drill = interruptDrill(core);
  await page.evaluate((r) => window.__tactics.load(r), drill.start);
  await waitFor('詠唱中の手番', (id) => window.__tactics.mode() === 'main' && window.__tactics.state().turn?.unitId === id, drill.unitId);
  await waitForInput();
  await screenshot('interrupt-0-charging');
  const beforeTap = await snapshot();
  await tapTile(drill.move.x, drill.move.z);
  check((await getMode()).kind === 'confirmInterrupt', '詠唱中に移動しようとしたのに、中断の確認が出ません');
  await screenshot('interrupt-1-confirm');
  await pressButton('やめない');
  check((await getMode()).kind === 'main', '「やめない」で元の操作に戻りません');
  const afterCancel = JSON.parse(await snapshot());
  check(JSON.stringify(afterCancel[0]) === JSON.stringify(JSON.parse(beforeTap)[0]), '「やめない」なのに状態が変わりました');
  await tapTile(drill.move.x, drill.move.z);
  check((await getMode()).kind === 'confirmInterrupt', '2回目の移動で中断の確認が出ません');
  await pressButton('詠唱をやめる');
  await waitFor(
    '中断して移動',
    ([id, x, z]) => {
      const u = window.__tactics.state().units.find((u) => u.id === id);
      return u.x === x && u.z === z && window.__tactics.mode() === 'main';
    },
    [drill.unitId, drill.move.x, drill.move.z],
  );
  const interruptedUnit = (await getState()).units.find((u) => u.id === drill.unitId);
  check(interruptedUnit.charging === null, '中断したのに、詠唱が続いています');
  check(interruptedUnit.mp === drill.mp, `中断で MP が変わりました（${drill.mp} → ${interruptedUnit.mp}）`);
  stats.interrupts++;
  await pressButton('待機');
  await waitFor('向きを選ぶ', () => window.__tactics.mode() === 'facing');
  const facing = (await getMode()).facing;
  await pressButton('確定');
  await waitFor('次の手番へ', () => window.__tactics.state().turnNumber > 1);
  // 直後に敵の手番が来ると HP は変わりうるので、位置・向き・MP・詠唱だけを比べる
  const drillExpected = drill.finish(facing).units.find((u) => u.id === drill.unitId);
  const drillActual = (await getState()).units.find((u) => u.id === drill.unitId);
  const pick = (u) => JSON.stringify([u.x, u.z, u.facing, u.mp, u.charging, u.ct === 0 ? 0 : 'later']);
  check(pick(drillActual) === pick(drillExpected), `詠唱の中断の後の状態が core の計算と違います（${pick(drillActual)} / ${pick(drillExpected)}）`);
  check(pageErrors.length === 0, `ページでエラー: ${pageErrors.map((e) => e.message).join(' / ')}`);

  // ---- 戦闘不能と蘇生（フェーズ2-5） ----
  // 蘇生を覚えた治癒師の手番で、近くに戦闘不能の味方（カウント 2）と、まもなく退場する敵（カウント 1）がいる場面を用意する。
  // 倒れた姿の頭上にカウントが出ること、タップすると情報の欄に残りのカウントが出ること、
  // 「回復魔法」→「蘇生」→ 倒れた味方 → 予測（復帰後の HP）→ 確定 → 発動して復帰すること、敵が退場することを確かめる
  await waitForInput();
  const ko = knockoutDrill(core);
  await page.evaluate((r) => window.__tactics.load(r), ko.start);
  await waitFor('蘇生の手番', (id) => window.__tactics.mode() === 'main' && window.__tactics.state().turn?.unitId === id, ko.unitId);
  await waitForInput();
  const badgeOf = (id) =>
    T((id) => {
      const labels = [...document.querySelectorAll('.unit-label')];
      const st = window.__tactics.state();
      const i = st.units.findIndex((u) => u.id === id);
      const b = labels[i]?.querySelector('.unit-label-knockout');
      return b && !b.hidden ? b.textContent : null;
    }, id);
  check((await badgeOf(ko.downId)) === text.knockout.badge(2), `戦闘不能の味方の頭上にカウントが出ていません（${await badgeOf(ko.downId)}）`);
  check((await badgeOf(ko.enemyId)) === text.knockout.badge(1), `戦闘不能の敵の頭上にカウントが出ていません（${await badgeOf(ko.enemyId)}）`);
  // 戦闘で人は死なない決まり: 戦闘不能の人は、その場に膝をついた姿で残る
  for (const id of [ko.downId, ko.enemyId]) {
    const pose = await T((id) => window.__tactics.unitPose(id), id);
    check(pose?.visible && pose.down && pose.kneel === 1, `戦闘不能のユニットが膝をついた姿になっていません（${id}: ${JSON.stringify(pose)}）`);
  }
  await tapUnit(ko.enemyId);
  await waitFor('戦闘不能の敵の情報', (t) => document.querySelector('.info-knockout')?.textContent === t, text.knockout.info(1));
  await screenshot('knockout-info');
  await tapUnit(ko.downId);
  await waitFor('戦闘不能の味方の情報', (t) => document.querySelector('.info-knockout')?.textContent === t, text.knockout.info(2));
  check((await getMode()).kind === 'main', '戦闘不能のユニットをタップしたら、操作が変わりました');
  const koUnit = (await getState()).units.find((u) => u.id === ko.unitId);
  await openCommandOf(koUnit, 'revive');
  await pressButton(text.abilities.revive);
  await waitFor('蘇生の狙いを選ぶ', () => window.__tactics.mode() === 'spellTarget');
  await tapUnit(ko.downId);
  const koMode = await getMode();
  check(
    koMode.kind === 'spellConfirm' && koMode.target.kind === 'unit' && koMode.target.unitId === ko.downId,
    `蘇生の狙いが違います（${JSON.stringify(koMode)}）`,
  );
  const revivePreview = await page.locator('.preview').textContent();
  check(revivePreview.includes(text.spellPreview.revive(ko.reviveHp, ko.maxHp)), `蘇生の予測に復帰後の HP がありません（${revivePreview}）`);
  await screenshot('revive-preview');
  await pressButton('確定');
  await waitFor('蘇生の指定の後', () => window.__tactics.mode() === 'main');
  await pressButton('待機');
  await waitFor('向きを選ぶ', () => window.__tactics.mode() === 'facing');
  const koFacing = (await getMode()).facing;
  const sawRevive = page
    .waitForFunction((t) => [...document.querySelectorAll('.popup')].some((p) => p.textContent === t), text.knockout.revived, { timeout: 30000, polling: 20 })
    .then(() => true)
    .catch(() => false);
  // 退場: 膝をついた敵が立ち上がり（膝の度合いが 0 に戻る）、マスの外へ歩いて退く（体の位置がマスの中央から離れる）
  const sawRetireWalk = page
    .waitForFunction(
      (id) => {
        const p = window.__tactics.unitPose(id);
        const st = window.__tactics.state();
        const u = st?.units.find((x) => x.id === id);
        if (!p || !u || !p.visible || p.kneel > 0.05) return false;
        const c = window.__tactics.tileWorld?.(p.coord.x, p.coord.z) ?? null;
        return c ? Math.hypot(p.world.x - c.x, p.world.z - c.z) > 0.3 : true;
      },
      ko.enemyId,
      { timeout: 30000, polling: 20 },
    )
    .then(() => true)
    .catch(() => false);
  await pressButton('確定');
  check(await sawRevive, `復帰の表示（${text.knockout.revived}）が出ませんでした`);
  check(await sawRetireWalk, '退場の時に、立ち上がって戦場から退く動きが見えませんでした');
  check((await T((id) => window.__tactics.unitPose(id)?.visible, ko.enemyId)) === false, '退場した敵が、まだ見えています');
  await waitFor('蘇生の後の手番', (id) => window.__tactics.mode() === 'main' && window.__tactics.state().turn?.unitId === id, ko.unitId);
  await waitForInput();
  const koAfter = await getState();
  const koExpected = ko.finish(koFacing);
  const pickKo = (st) => JSON.stringify(st.units.filter((u) => [ko.downId, ko.enemyId, ko.unitId].includes(u.id)).map((u) => [u.id, u.hp, u.ct, u.knockoutCount, u.retired, u.progress?.gainedExp ?? null]));
  check(pickKo(koAfter) === pickKo(koExpected), `蘇生と退場の結果が core の計算と違います（画面 ${pickKo(koAfter)} / core ${pickKo(koExpected)}）`);
  check((await badgeOf(ko.downId)) === null, '蘇生した味方の頭上に、まだカウントが出ています');
  await screenshot('revived');
  stats.revives++;
  check(pageErrors.length === 0, `ページでエラー: ${pageErrors.map((e) => e.message).join(' / ')}`);

  // ---- ページを読み込み直しても、部隊の状態が残る ----
  await page.reload();
  await page.waitForFunction(() => window.__tactics?.screen() === 'base', null, { timeout: 30000 });
  await sameRoster(plan.afterSell, '読み込み直した後');
  // ---- 受動的なアビリティの習得と付け替え ----
  // JP の貯まった部隊を用意して、編成の画面で「反撃」を覚え（ジョブのレベルが足りない「重装」は押せない）、
  // リアクションの枠に付ける。付けた後の部隊は core の計算と同じで、出撃するとその戦闘のユニットに反映される
  const pd = passiveDrill(core, plan.afterSell);
  await page.evaluate((r) => window.__tactics.setRoster(r), pd.start);
  await waitFor('拠点', () => window.__tactics.screen() === 'base');
  await pressButton('編成');
  await waitFor('編成の画面', () => window.__tactics.screen() === 'roster');
  await pickUnit(pd.unitId);
  await openTab('learn');
  // ジョブのレベルが足りない「重装」は、説明の欄の「習得する」が押せず、理由が出る
  await openLearnGroup('support');
  await openLearnItem(pd.jobId, pd.lockedId);
  const lockedButton = page.locator('.sheet .learn-confirm');
  check(await lockedButton.isDisabled(), `ジョブのレベルが足りない ${pd.lockedId} の「習得する」が押せます`);
  const lockedText = await page.locator('.sheet').textContent();
  check(lockedText.includes(text.roster.refusal.jobLevelTooLow), `ジョブのレベルが足りない理由が出ていません（${lockedText}）`);
  await screenshot('roster-learn-locked');
  await closeSheet();
  // 「反撃」を説明の欄から習得し、そのまま「付ける」
  await openLearnGroup('reaction');
  await openLearnItem(pd.jobId, pd.abilityId);
  await tapLocator(page.locator('.sheet .learn-confirm'));
  await waitFor('受動的なアビリティの習得', ([u, j, a]) => window.__tactics.roster().units.find((x) => x.id === u).jobs[j].learned.includes(a), [pd.unitId, pd.jobId, pd.abilityId]);
  await screenshot('roster-learned-sheet');
  await tapLocator(page.locator('.sheet .equip-toggle'));
  await waitFor('リアクションの付け替え', ([u, a]) => window.__tactics.roster().units.find((x) => x.id === u).slots.reaction === a, [pd.unitId, pd.abilityId]);
  await openTab('abilities');
  const slotText = await page.locator('.slot-row[data-slot="reaction"]').textContent();
  check(slotText.includes(text.abilities[pd.abilityId]), `付けたリアクションが編成の画面に出ていません（${slotText}）`);
  // 枠からも付け替えられる（外して、もう一度付ける）
  await viaTwoTaps('abilities', '.slot-row[data-slot="reaction"]', 'slot-reaction');
  await pressButton(text.roster.remove);
  await waitFor('リアクションを外す', (u) => window.__tactics.roster().units.find((x) => x.id === u).slots.reaction === null, pd.unitId);
  await viaTwoTaps('abilities', '.slot-row[data-slot="reaction"]', 'slot-reaction');
  await tapLocator(page.locator(`.sheet .screen-button[data-ability-id="${pd.abilityId}"]`));
  await waitFor('リアクションを付ける', ([u, a]) => window.__tactics.roster().units.find((x) => x.id === u).slots.reaction === a, [pd.unitId, pd.abilityId]);
  await screenshot('roster-passive-equipped');
  stats.passives++;
  await pressButton(text.roster.back);
  await waitFor('拠点', () => window.__tactics.screen() === 'base');
  await sameRoster(pd.expected, '受動的なアビリティを付けた後');
  await sortieTraining(text.tiers.easy.name);
  const pdUnit = (await getState()).units.find((u) => u.id === pd.unitId);
  check(JSON.stringify(pdUnit.passives.map((p) => p.id)) === JSON.stringify([pd.abilityId]), `戦闘のユニットに受動的なアビリティが反映されていません（${JSON.stringify(pdUnit.passives)}）`);
  await page.reload();
  await page.waitForFunction(() => window.__tactics?.screen() === 'base', null, { timeout: 30000 });
  await sameRoster(pd.expected, '受動的なアビリティを付けて読み込み直した後');
  check(pageErrors.length === 0, `ページでエラー: ${pageErrors.map((e) => e.message).join(' / ')}`);

  // ---- 撤退（フェーズ2-5）: 戦闘の途中で読み込み直すと、拠点に「戦闘を再開」と「撤退する」が出る。撤退すると負けとして、
  // それまでに得た経験値と JP を持ち帰り、途中の戦闘は消える ----
  check(await page.locator('.resume-battle').isVisible(), `出撃した戦闘の途中で読み込み直したのに、「${text.base.resumeBattle}」が出ていません`);
  const toRetreat = await T(() => window.__tactics.suspended());
  check(toRetreat?.origin.kind === 'training', `途中の戦闘の記録が違います（${JSON.stringify(toRetreat?.origin)}）`);
  await pressButton(text.base.retreatBattle);
  await waitFor('撤退の確認', () => document.querySelector('[data-view="retreat"]') !== null);
  await screenshot('retreat-confirm');
  await pressButton(text.base.cancel);
  check(await page.locator('.resume-battle').isVisible(), '撤退をやめたのに、「戦闘を再開」が出ていません');
  await pressButton(text.base.retreatBattle);
  await pressButton(text.base.confirmRetreatYes);
  await waitFor('撤退の結果の画面', () => window.__tactics.screen() === 'result');
  const retreatTitle = await page.locator('.report-screen .result-title').textContent();
  check(retreatTitle === text.report.retreatTitle, `撤退の結果の画面の題が違います（${retreatTitle}）`);
  await screenshot('retreat-result');
  const retreated = core.progression.applyBattleResult(pd.expected, { ...toRetreat.state, winner: 'enemy', turn: null }, core.data.catalog, core.data.progression).roster;
  await sameRoster(retreated, '撤退の後');
  check((await T(() => window.__tactics.suspended())) === null, '撤退した後も、途中の戦闘が残っています');
  await pressButton(text.report.toBase);
  await waitFor('拠点', () => window.__tactics.screen() === 'base');
  stats.retreats++;
  check(pageErrors.length === 0, `ページでエラー: ${pageErrors.map((e) => e.message).join(' / ')}`);

  // ---- ジョブの解放と、新しいジョブ（フェーズ2-6）----
  // (1) 戦闘中に解放条件を満たした瞬間の知らせ: 弓使いの JP がジョブ Lv 2 の直前のキリが攻撃すると、「盗賊に就けるようになった」と出る
  const jd = jobDrills(core, pd.expected);
  await page.evaluate((r) => window.__tactics.setRoster(r), jd.unlock.roster);
  await waitFor('拠点', () => window.__tactics.screen() === 'base');
  await page.evaluate((r) => window.__tactics.load(r), jd.unlock.start);
  await waitFor('解放の場面', (id) => window.__tactics.mode() === 'main' && window.__tactics.state().turn?.unitId === id, jd.unlock.unitId);
  await waitForInput();
  const sawUnlock = page
    .waitForFunction((msg) => document.querySelector('.message-banner')?.textContent === msg, jd.unlock.message, { timeout: 30000, polling: 20 })
    .then(() => true)
    .catch(() => false);
  await pressButton('攻撃');
  await waitFor('攻撃対象を選ぶ', () => window.__tactics.mode() === 'targeting');
  await tapUnit(jd.unlock.targetId);
  await pressButton('確定');
  check(await sawUnlock, `ジョブの解放の知らせ（${jd.unlock.message}）が出ませんでした`);
  await screenshot('job-unlocked-toast');
  stats.unlocks++;

  // (2) 編成の画面: まだ就けないジョブは条件と達成の具合を出し、押すと条件の一覧。就けるようになったジョブに転職する
  await page.evaluate((r) => window.__tactics.setRoster(r), jd.jobs.roster);
  await waitFor('拠点', () => window.__tactics.screen() === 'base');
  await pressButton('編成');
  await waitFor('編成の画面', () => window.__tactics.screen() === 'roster');
  await pickUnit('fen');
  await openTab('job');
  const lockedKnight = page.locator('.job-choice[data-job-id="knight"]');
  check((await lockedKnight.getAttribute('data-unlocked')) === 'false', '条件を満たしていない騎士が、就けるジョブとして出ています');
  const lockedJobText = await lockedKnight.textContent();
  check(lockedJobText.includes(text.roster.unlockProgress(text.jobs.warrior, 2, 1)), `騎士の解放条件と達成の具合が出ていません（${lockedJobText}）`);
  check((await page.locator('.job-choice[data-job-id="timekeeper"]').count()) === 0, 'トウマの専用ジョブが、ほかの人物の一覧に出ています');
  await tapLocator(lockedKnight);
  await waitFor('解放条件の欄', () => document.querySelector('.sheet[data-sheet="job"]') !== null);
  await waitSheetStill();
  const lockedSheetText = await page.locator('.sheet').textContent();
  check(lockedSheetText.includes(text.roster.lockedTitle(text.jobs.knight)) && lockedSheetText.includes(text.roster.lockedNote), `解放条件の欄が違います（${lockedSheetText}）`);
  check((await page.getByRole('button', { name: text.roster.becomeJob(text.jobs.knight) }).count()) === 0, 'まだ就けないジョブに「〇〇になる」が出ています');
  await screenshot('roster-job-locked');
  await closeSheet();
  // トウマの一覧には、専用ジョブの札が付いた時守が出る
  await pickUnit('touma');
  await openTab('job');
  check((await page.locator('.job-choice[data-job-id="timekeeper"]').getAttribute('data-exclusive')) === 'true', '時守に専用ジョブの札がありません');
  await screenshot('roster-job-list');
  for (const change of jd.jobs.changes) {
    await pickUnit(change.unitId);
    await viaTwoTaps('job', `.job-choice[data-job-id="${change.jobId}"]`, 'job');
    await pressButton(text.roster.becomeJob(text.jobs[change.jobId]));
    await waitFor('転職', ([u, j]) => window.__tactics.roster().units.find((x) => x.id === u).jobId === j, [change.unitId, change.jobId]);
    stats.jobChanges++;
    stats.newJobs++;
  }
  await sameRoster(jd.jobs.expected, '新しいジョブに転職した後');
  await pressButton(text.roster.back);
  await waitFor('拠点', () => window.__tactics.screen() === 'base');

  // (3) は短くした版では、2つ目の画面サイズ（横向き）で確かめる
  if (!QUICK) await newJobActionScenes(jd);
  // (4)(5) は短くした版では、2つ目の画面サイズ（横向き）で確かめる（検査全体を5分以内に収めるため。PR C）
  if (!QUICK) await magicJobScenes(jd);

  // 撤退の後の部隊に戻して、拠点へ戻る（用意した場面の戦闘は、部隊に反映しない）
  await page.evaluate((r) => window.__tactics.setRoster(r), retreated);
  await waitFor('拠点', () => window.__tactics.screen() === 'base');
  check(pageErrors.length === 0, `ページでエラー: ${pageErrors.map((e) => e.message).join(' / ')}`);

  // ---- 「はじめから」: 確認の後、最初の部隊に戻る（読み込み直しても最初のまま） ----
  await pressButton(text.base.newGame);
  await waitFor('はじめからの確認', () => document.querySelector('.screen-warning') !== null);
  await screenshot('new-game-confirm');
  await pressButton(text.base.cancel);
  await sameRoster(pd.expected, '「はじめから」をやめた後');
  await pressButton(text.base.newGame);
  await pressButton(text.base.confirmNewGameYes);
  await sameRoster(core.data.roster, '「はじめから」の後');
  await page.reload();
  await page.waitForFunction(() => window.__tactics?.screen() === 'base', null, { timeout: 30000 });
  await sameRoster(core.data.roster, '「はじめから」の後に読み込み直した後');
  check(pageErrors.length === 0, `ページでエラー: ${pageErrors.map((e) => e.message).join(' / ')}`);

  // ---- ダンジョン「はじまりの遺跡」の3連戦（フェーズ2-2b） ----
  // 第1戦 → 戦闘の間（結果・編成の画面への行き来）→ 第2戦で負ける → やり直して勝つ → 読み込み直して第3戦から再開
  // → 第3戦（ボスの撃破が勝利条件・ボスの★）→ クリアの画面（初めてのクリア・報酬の JP）→ 拠点にクリアの記録。
  // 戦闘そのものは、--full-dungeon の時は画面のタップで戦い、そうでなければ開発用の決着で早める（CI の時間を抑えるため）
  deadline = Date.now() + AFTER_BATTLE_TIMEOUT_MS + (FULL_DUNGEON ? 40 * 60 * 1000 : 0);
  const dungeonSite = (i) => core.data.dungeon.battles[i];
  const getDungeon = () => T(() => window.__tactics.dungeon());
  const startDungeonBattle = async (i) => {
    await waitDeploy();
    const panel = await page.locator('.objective-panel').textContent();
    const victory = dungeonSite(i).objectives.victory[0];
    const want =
      victory.kind === 'defeatUnit' ? text.objectives.defeatUnit(text.unitNames[victory.unitId]) : victory.kind === 'reachTile' ? text.objectives.reachTile : text.objectives.defeatAll;
    check(panel.includes(want), `第${i + 1}戦の勝敗条件が出ていません（${panel}）`);
    if (victory.kind === 'defeatUnit') check((await page.locator('.unit-label-target').count()) === 1, 'ボスに撃破の対象の札が付いていません');
    await screenshot(`dungeon-${i + 1}-deploy`);
    await pressButton(text.objectives.close);
    await pressButton(text.deploy.start);
    await waitFor('ダンジョンの戦闘の開始', () => window.__tactics.screen() === 'battle' && window.__tactics.state() !== null);
    const st = await getState();
    check(st.map.id === dungeonSite(i).map.id, `第${i + 1}戦のマップが違います（${st.map.id}）`);
    // 戦闘の間で全回復している（全員の HP と MP が最大）
    check(st.units.filter((u) => u.team === 'player').every((u) => u.hp === u.stats.maxHp && u.mp === u.stats.maxMp), `第${i + 1}戦の開始時に全回復していません`);
  };
  /** ダンジョンの戦闘を決着させる。tap なら画面のタップで、そうでなければ開発用の決着で（winner の勝ち） */
  const resolveDungeonBattle = async (winner, tap) => {
    stats.dungeonBattles++;
    if (tap) {
      stats.dungeonTapped++;
      await playByTaps();
    } else {
      await waitForInput();
      await T((w) => window.__tactics.finishBattle(w), winner);
    }
    await waitFor('戦闘の間の画面', () => window.__tactics.screen() === 'result');
  };
  const resultTitle = () => page.locator('.report-screen .result-title').textContent();

  await pressButton(text.base.sortie);
  await pressButton(text.dungeons.ruins);
  await waitFor('ダンジョンの画面', () => document.querySelector('[data-screen="dungeon"]') !== null);
  await screenshot('dungeon-start');
  await pressButton(text.base.challenge);
  check(JSON.stringify((await getDungeon()).run) === JSON.stringify({ dungeonId: 'ruins', battle: 0 }), '挑戦の開始が保存されていません');
  // 第1戦（全滅）
  await startDungeonBattle(0);
  await resolveDungeonBattle('player', FULL_DUNGEON);
  let won = (await resultTitle()) === text.result.player;
  for (let attempt = 0; !won && attempt < 3; attempt++) {
    stats.retries++;
    await pressButton(text.report.retry);
    await startDungeonBattle(0);
    await resolveDungeonBattle('player', FULL_DUNGEON);
    won = (await resultTitle()) === text.result.player;
  }
  check(won, '第1戦に勝てませんでした');
  check((await getDungeon()).run?.battle === 1, '第1戦の後の進み具合が保存されていません');
  await screenshot('dungeon-1-result');
  // 戦闘の間: 編成の画面へ行って戻る
  await pressButton(text.report.editRoster);
  await waitFor('編成の画面', () => window.__tactics.screen() === 'roster');
  await pressButton(text.roster.back);
  await waitFor('戦闘の間の画面に戻る', () => window.__tactics.screen() === 'result');
  const next2 = text.report.next(2, text.mapNames[dungeonSite(1).map.id]);
  await pressButton(next2);
  // 第2戦（到達）: まず負けて、やり直す。負けても進み具合はそのまま
  const goldBeforeLoss = await T(() => window.__tactics.roster().gold);
  await startDungeonBattle(1);
  await resolveDungeonBattle('enemy', false);
  check((await resultTitle()) === text.result.enemy, '第2戦の負けの画面が出ていません');
  // 負けた時は、ゴールドも戦利品も得られない
  check((await T(() => window.__tactics.roster().gold)) === goldBeforeLoss, '負けた時にゴールドが入っています');
  check((await page.locator('.report-spoils').getAttribute('data-gold')) === '0', '負けた時の結果の画面にゴールドが出ています');
  check((await getDungeon()).run?.battle === 1, '負けた後の進み具合が変わっています');
  await screenshot('dungeon-2-lost');
  stats.retries++;
  await pressButton(text.report.retry);
  await startDungeonBattle(1);
  await resolveDungeonBattle('player', FULL_DUNGEON);
  won = (await resultTitle()) === text.result.player;
  for (let attempt = 0; !won && attempt < 3; attempt++) {
    stats.retries++;
    await pressButton(text.report.retry);
    await startDungeonBattle(1);
    await resolveDungeonBattle('player', FULL_DUNGEON);
    won = (await resultTitle()) === text.result.player;
  }
  check(won, '第2戦に勝てませんでした');
  check((await getDungeon()).run?.battle === 2, '第2戦の後の進み具合が保存されていません');
  // ページを読み込み直すと拠点から。ダンジョンの画面で第3戦から再開できる
  await page.reload();
  await page.waitForFunction(() => window.__tactics?.screen() === 'base', null, { timeout: 30000 });
  check((await getDungeon()).run?.battle === 2, '読み込み直した後に進み具合が残っていません');
  await pressButton(text.base.sortie);
  await pressButton(text.dungeons.ruins);
  const resume3 = text.base.resume(3, text.mapNames[dungeonSite(2).map.id]);
  await screenshot('dungeon-resume');
  await pressButton(resume3);
  // 第3戦（ボスの撃破）→ クリア
  const jpBefore = await T(() => window.__tactics.roster().units.map((u) => u.jobs[u.jobId].jp));
  const goldBeforeBoss = await T(() => window.__tactics.roster().gold);
  await startDungeonBattle(2);
  await resolveDungeonBattle('player', FULL_DUNGEON);
  for (let attempt = 0; (await resultTitle()) === text.result.enemy && attempt < 3; attempt++) {
    stats.retries++;
    await pressButton(text.report.retry);
    await startDungeonBattle(2);
    await resolveDungeonBattle('player', FULL_DUNGEON);
  }
  const clearTitle = text.report.clearTitle(text.dungeons.ruins);
  check((await resultTitle()) === clearTitle, `クリアの画面が出ていません（${await resultTitle()}）`);
  const clearText = await page.locator('.report-screen').textContent();
  check(clearText.includes(text.report.firstClear) && clearText.includes(text.report.reward(core.data.dungeon.clearRewardJp)), 'クリアの画面に初めてのクリアと報酬がありません');
  const jpAfter = await T(() => window.__tactics.roster().units.map((u) => u.jobs[u.jobId].jp));
  // 報酬の JP（とこの戦闘で得た JP）が、全員の今のジョブに入っている
  check(jpAfter.every((jp, i) => jp >= jpBefore[i] + core.data.dungeon.clearRewardJp), `クリアの報酬の JP が入っていません（${jpBefore} → ${jpAfter}）`);
  check(JSON.stringify(await getDungeon()) === JSON.stringify({ run: null, clears: { ruins: 1 } }), 'クリアの記録が違います');
  // ボスからの初回の報酬（店では買えない装備）と、第3戦のゴールド
  const bossItemId = core.data.dungeon.firstClearItemId;
  check(clearText.includes(text.report.specialItem(text.equipment[bossItemId].name)), 'クリアの画面にボスからの装備が出ていません');
  check(await T((id) => window.__tactics.roster().items.some((i) => i.itemId === id), bossItemId), `ボスからの装備（${bossItemId}）が所持品にありません`);
  const bossGold = core.data.dungeon.battles[2].tiers[0].reward.gold;
  check((await T(() => window.__tactics.roster().gold)) === goldBeforeBoss + bossGold, `第3戦のゴールドが入っていません（${goldBeforeBoss} + ${bossGold}）`);
  await screenshot('dungeon-clear');
  await pressButton(text.report.toBase);
  await waitFor('拠点', () => window.__tactics.screen() === 'base');
  const baseText = await page.locator('.base-screen').textContent();
  check(baseText.includes(text.base.clearedBadge(text.dungeons.ruins, 1)), `拠点にクリアの記録が出ていません（${baseText}）`);
  await page.reload();
  await page.waitForFunction(() => window.__tactics?.screen() === 'base', null, { timeout: 30000 });
  check(JSON.stringify(await getDungeon()) === JSON.stringify({ run: null, clears: { ruins: 1 } }), '読み込み直した後にクリアの記録が残っていません');
  check(pageErrors.length === 0, `ページでエラー: ${pageErrors.map((e) => e.message).join(' / ')}`);

  await context.close();
  for (const d of finger.details) log(`押し直し: ${d}`);
  return {
    winner: final.winner,
    turns: final.turnNumber,
    finger,
    ...stats,
    seconds: Math.round((Date.now() - started) / 1000),
  };
}

/**
 * 画面の収まりの確認: 各画面（拠点・出撃先・敵の強さ・ダンジョン・挑み直しの確認・はじめからの確認・編成の5つのタブと説明の欄・店の買う・売るとその欄・
 * 配置・戦闘・結果・戦闘の間・負けた時・クリア）を開き、画面全体がスクロールしないこと（収まらない内容は枠の中だけでスクロールする）、
 * ボタンが画面の内側にあること、画面のボタンが指で押せる大きさ（高さ 48px 以上）であることを確かめる。
 */
/**
 * 序章（序章の PR B）を、題名の画面から最後まで通す（スマホ縦向き）。
 * 1回目: 台詞をタップで進め、操作の場面（歩かせる）を操作し、章の題・旋律の印・効果音・手ほどき（2段まで進めてから飛ばす）を確かめる。
 * 会話の途中と、2つの戦闘の途中で読み込み直して「これまで」から再開する。戦闘は味方も AI に任せ、読み込み直した時点の途中保存から
 * core だけで計算した結果と照合する。勝った後の台本（戦闘のマップの上）を通り、「第1章は準備中です」からタイトルへ。
 * 2回目: すべての会話をスキップし、戦闘は開発用の決着で勝ちにして通す（見た手ほどきは出ないこと）。
 */
async function storyRun(browser, baseUrl, name, core) {
  const options = VIEWPORT_OPTIONS[name];
  const { label, ...contextOptions } = options;
  delete contextOptions.defaultBrowserType;
  contextOptions.deviceScaleFactor = 1;
  const context = await browser.newContext(contextOptions);
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e));
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(new Error(m.text()));
  });
  const started = Date.now();
  const { text } = core.data;
  const log = (msg) => console.log(`[序章・${label}] ${msg}（${Math.round((Date.now() - started) / 1000)}秒）`);
  const screenshot = async (tag) => {
    if (!SCREENSHOT_DIR) return;
    fs.mkdirSync(SCREENSHOT_DIR, { recursive: true });
    await page.screenshot({ path: path.join(SCREENSHOT_DIR, `story-${name}-${tag}.png`) });
  };
  const until = (fn, arg, timeout = 90000) => page.waitForFunction(fn, arg, { timeout, polling: 50 });
  const press = async (n) => page.getByRole('button', { name: n, exact: true }).click();
  const T = (fn, arg) => page.evaluate(fn, arg);
  const status = () => T(() => window.__tactics.dialogue());
  const stats = { lines: 0, walks: 0, skips: 0, reloads: 0, titles: 0, battleLines: 0, afterLines: 0, melodies: new Set() };
  const sceneNow = () => T(() => window.__tactics.story().main?.scene ?? -1);
  const waitScene = (n) => until((n) => window.__tactics.story().main?.scene === n, n);
  const open = async () => {
    await page.goto(`${baseUrl}?seed=${SEED}&speed=${SPEED}`);
    await until(() => window.__tactics?.screen() === 'title');
  };
  /** 鳴っている旋律の印を記録する（音がなくても、画面に印が出ていること） */
  const noteMelody = async () => {
    const m = await T(() => ({ melody: window.__tactics.sound().melody, mark: document.querySelector('.sound-mark:not([hidden])')?.textContent ?? '' }));
    if (m.melody) {
      check(m.mark.startsWith('♪'), `旋律が鳴っているのに、画面に印が出ていません（${m.melody.melody}）`);
      stats.melodies.add(`${m.melody.melody}/${m.melody.timbre}`);
    }
  };
  /** 会話が待っている状態（台詞・操作）になるか、会話が終わるまで待つ。章の題が出たら、タップして閉じる */
  const settle = async () => {
    for (let guard = 0; guard < 10; guard++) {
      await until(() => {
        const d = window.__tactics.dialogue();
        return !d || d.waiting === 'line' || d.waiting === 'walk' || d.waiting === 'title';
      });
      if ((await status())?.waiting !== 'title') return;
      stats.titles++;
      check((await T(() => document.querySelector('.chapter-title-sub')?.textContent)) === '正しい仕事', '章の題が出ていません');
      await page.waitForTimeout(750);
      await page.locator('.chapter-title-card').click();
      await until(() => window.__tactics.dialogue()?.waiting !== 'title');
    }
  };
  const tapLine = async () => {
    const before = await status();
    await noteMelody();
    await page.locator('.dialogue-body').click();
    stats.lines++;
    await until((i) => {
      const d = window.__tactics.dialogue();
      return !d || d.index !== i;
    }, before.index);
  };
  const doWalk = async () => {
    for (let guard = 0; guard < 30; guard++) {
      const d = await status();
      if (!d || d.waiting !== 'walk') return;
      if (!d.walkNext) {
        await page.waitForTimeout(50);
        continue;
      }
      await until(() => window.__tactics.camera().idle);
      const p = await T((c) => window.__tactics.sceneTileScreen(c.x, c.z), d.walkNext);
      await page.mouse.click(p.x, p.y);
      await until((c) => {
        const s = window.__tactics.dialogue();
        return !s || s.waiting !== 'walk' || !s.walkNext || s.walkNext.x !== c.x || s.walkNext.z !== c.z;
      }, d.walkNext);
      stats.walks++;
    }
  };
  /** 今の場面の会話を最後まで進める。hook(status) が true を返したら、そこで止める */
  const drive = async (hook) => {
    const start = await sceneNow();
    for (let guard = 0; guard < 300; guard++) {
      await settle();
      const d = await status();
      if (!d) return 'ended';
      if ((await sceneNow()) !== start) return 'ended';
      if (hook && (await hook(d))) return 'stopped';
      if (d.waiting === 'line') await tapLine();
      else if (d.waiting === 'walk') await doWalk();
    }
    throw new CheckError('会話が終わりません');
  };
  const skip = async () => {
    await settle();
    await press(text.dialogue.skip);
    await until(() => document.querySelector('.sheet[data-sheet="skip"]') !== null);
    await press(text.dialogue.skipYes);
    stats.skips++;
  };
  const reloadAndResume = async () => {
    await page.reload();
    stats.reloads++;
    await until(() => window.__tactics?.screen() === 'title');
    await press(text.title.storyContinue);
    await until(() => window.__tactics.screen() === 'recap');
    check((await T(() => document.querySelectorAll('.recap-line').length)) > 0, '「これまで」が出ません');
    await press(text.story.recapContinue);
  };
  const deployAndStart = async () => {
    await until(() => window.__tactics.mode() === 'deploy');
    await press(text.objectives.close);
    await press(text.deploy.start);
    await until(() => window.__tactics.screen() === 'battle' && window.__tactics.state() !== null);
  };
  /**
   * 戦闘を味方も AI に任せて進め、途中（手番 reloadAt の後）で読み込み直して再開し、core だけの計算と照合する。
   * 戦闘中の会話と、勝った後の台本の台詞はタップで進める。次の場面（nextScene）に入ったら終わり
   */
  const autoBattle = async (siteName, reloadAt, nextScene) => {
    await T(() => window.__tactics.setAutoPlayer(true));
    await until((n) => (window.__tactics.state()?.turnNumber ?? 0) >= n || window.__tactics.dialogue()?.waiting === 'line', reloadAt, 240000);
    // 戦闘中の会話が出ていれば、読み終えてから
    while ((await status())?.waiting === 'line') {
      await tapLine();
      stats.battleLines++;
    }
    await until((n) => (window.__tactics.state()?.turnNumber ?? 0) >= n && window.__tactics.mode() !== 'deploy', reloadAt, 240000);
    const saved = await T(() => window.__tactics.suspended());
    check(saved?.origin?.kind === 'story', `${siteName}: 物語の戦闘の途中保存がありません`);
    await reloadAndResume();
    await until(() => window.__tactics.screen() === 'battle' || window.__tactics.dialogue() !== null);
    check((await T(() => window.__tactics.tutorial())) === null, `${siteName}: 再開した戦闘で、見た手ほどきがまた出ています`);
    await T(() => window.__tactics.setAutoPlayer(true));
    const expected = core.ai.runAutoBattle(saved.state, 3000, { player: core.data.ai, enemy: core.data.ai }).state;
    let last;
    for (let guard = 0; guard < 600; guard++) {
      const s = await T(() => ({ d: window.__tactics.dialogue(), state: window.__tactics.state(), scene: window.__tactics.story().main?.scene }));
      if (s.state) last = s.state;
      if (s.scene === nextScene) break;
      if (s.d?.waiting === 'line') {
        if (last?.winner) stats.afterLines++;
        else stats.battleLines++;
        await tapLine();
        continue;
      }
      await page.waitForTimeout(100);
    }
    check((await sceneNow()) === nextScene, `${siteName}: 戦闘が終わって次の場面へ進みません`);
    check(last?.winner === 'player', `${siteName}: 勝てませんでした`);
    check(
      expected.winner === last.winner && expected.turnNumber === last.turnNumber && JSON.stringify(expected.units.map((u) => u.hp)) === JSON.stringify(last.units.map((u) => u.hp)),
      `${siteName}: 途中保存から再開した戦闘が、core だけの計算と一致しません（画面 ${last.turnNumber}手番・core ${expected.turnNumber}手番）`,
    );
    return last;
  };

  /**
   * 短くした版（CI）の序章: 検査全体を5分以内に収めるため、要点だけを確かめ、残りの会話はスキップで進める。
   * 冒頭の石の節の印 → 堰の会話（ルビ・読み返し・読み込み直しと「これまで」・早送り）→ 堰の戦闘（手ほどき2段と飛ばす・倒れない番兵・
   * 戦闘の途中での読み込み直しと再開・開発用の決着・勝った後の台本）→ 会話はスキップ → 丘の戦闘（始めの会話・読み込み直しと再開・決着・
   * 勝った後の台本はスキップ）→「第1章は準備中です」。全部の通し（台詞のタップ・歩かせる・2つの戦闘を最後まで戦って core と照合・
   * すべてスキップの2回目）は、全体（npm run autoplay）で確かめる
   */
  const quickPrologue = async () => {
    // 場面1: 石の節が鳴るまで読み、印を確かめてからスキップ
    await drive(async (d) => {
      if (d.text.startsWith('物置の床で')) {
        await noteMelody();
        return true;
      }
      return false;
    });
    check(stats.melodies.has('ユナの鼻歌/石'), `冒頭の石の節の印が出ていません（${[...stats.melodies]}）`);
    await skip();
    // 場面2: ルビ・読み返し・読み込み直し・早送り
    await waitScene(1);
    let ruby = false;
    await drive(async (d) => {
      if (d.text.includes('堰だ')) {
        const rts = await T(() => [...document.querySelectorAll('.dialogue-text rt')].map((r) => r.textContent));
        ruby = rts.includes('せき');
      }
      return d.text.startsWith('ユナの発明で');
    });
    check(ruby, 'ルビが出ていません');
    await press(text.dialogue.backlog);
    await until(() => document.querySelectorAll('.backlog-row').length >= 4);
    await press(text.dialogue.close);
    await reloadAndResume();
    await until(() => window.__tactics.screen() === 'scene');
    check((await sceneNow()) === 1, '会話の途中で読み込み直した後、その場面の始めから再開していません');
    await settle();
    await press(text.dialogue.fast);
    // 場面3: 堰の戦闘
    const quickBattle = async (siteName, n, tutorial) => {
      await waitScene(n);
      await deployAndStart();
      if (tutorial) {
        await until(() => window.__tactics.tutorial()?.step === 'weir-move', undefined, 120000);
        const move = await T(() => window.__tactics.marks().find((m) => m.kind === 'move'));
        const at = await T((c) => window.__tactics.tileScreen(c.x, c.z), move);
        await page.mouse.click(at.x, at.y);
        await until(() => window.__tactics.tutorial()?.step === 'weir-attack', undefined, 30000);
        check(await T(() => !document.querySelector('.tutorial-pointer').hidden), '手ほどきの「攻撃」の段で、指し示す印が出ていません');
        await press(text.tutorial.skip);
        check((await T(() => window.__tactics.settings().seenTutorials)).includes('prologue-weir'), '手ほどきを見たことが設定に残っていません');
      }
      // 戦闘の始めの会話（丘）
      if (!tutorial) await until(() => window.__tactics.dialogue()?.waiting === 'line', undefined, 60000);
      while ((await status())?.waiting === 'line') {
        await tapLine();
        stats.battleLines++;
      }
      await T(() => window.__tactics.setAutoPlayer(true));
      await until(() => (window.__tactics.state()?.turnNumber ?? 0) >= 3, undefined, 120000);
      await reloadAndResume();
      await until(() => window.__tactics.screen() === 'battle' && window.__tactics.state() !== null);
      const saved = await T(() => window.__tactics.suspended());
      check(saved?.origin?.kind === 'story' && saved.state.turnNumber >= 3, `${siteName}: 戦闘の途中から再開していません`);
      check((await T(() => window.__tactics.tutorial())) === null, `${siteName}: 再開した戦闘で、見た手ほどきがまた出ています`);
      await until(() => ['main', 'busy', 'ended'].includes(window.__tactics.mode()));
      await T(() => window.__tactics.finishBattle('player'));
      await until(() => window.__tactics.dialogue()?.waiting === 'line');
      return saved.state;
    };
    const weir = await quickBattle('堰', 2, true);
    check(
      weir.units.filter((u) => u.id.startsWith('weir-guard') && u.noRetire && !u.minHp && u.kind === 'human').length === 3,
      '堰の番兵が「退場しない人」になっていません（HP が尽きれば膝をつく）',
    );
    // 勝った後の台本（戦闘のマップの上）を読む
    for (let guard = 0; guard < 30 && (await sceneNow()) === 2; guard++) {
      const d = await status();
      if (d?.waiting === 'line') {
        await tapLine();
        stats.afterLines++;
      } else await page.waitForTimeout(100);
    }
    check(stats.afterLines >= 4, `堰の勝った後の台本が流れていません（${stats.afterLines}行）`);
    check((await T(() => window.__tactics.sound().recent)).includes('gate'), '勝った後の効果音（門）が鳴っていません');
    log('冒頭の石の節・堰の会話（ルビ・読み返し・読み込み直しと「これまで」・早送り）・堰の戦闘（手ほどき・退場しない番兵・読み込み直しと再開・勝った後の台本）✔');
    // 場面4〜10 はスキップ。丘の戦闘
    for (const n of [3, 4, 5, 6, 7, 8, 9]) {
      await waitScene(n);
      await until(() => window.__tactics.screen() === 'scene' && window.__tactics.dialogue() !== null);
      await skip();
    }
    await quickBattle('丘', 10, false);
    await skip();
    for (const n of [11, 12, 13, 14]) {
      await waitScene(n);
      await until(() => window.__tactics.screen() === 'scene' && window.__tactics.dialogue() !== null);
      await skip();
    }
    await until(() => window.__tactics.screen() === 'story-end');
    check((await T(() => document.querySelector('.story-end-screen .screen-title')?.textContent)) === text.story.nextChapterSoon, '「第1章は準備中です」が出ていません');
    log('残りの会話はスキップ・丘の戦闘（始めの会話・読み込み直しと再開・勝った後の台本）・「第1章は準備中です」✔');
    return {};
  };

  // ---- 1回目: タップで進める ----
  await open();
  check(!(await page.getByRole('button', { name: '試しの場面', exact: true }).count()), '題名の画面に「試しの場面」が残っています');
  await press(text.title.story);
  await until(() => window.__tactics.screen() === 'scene');
  if (QUICK) {
    const r = await quickPrologue();
    check(errors.length === 0, `ページでエラー: ${errors.map((e) => e.message).join(' / ')}`);
    await context.close();
    return { story: true, quick: true, seconds: Math.round((Date.now() - started) / 1000), ...stats, ...r, melodies: stats.melodies.size };
  }
  // 場面1: 冒頭の先出し（石の節）・章の題・「一日前。」（暗転の中の語り）
  let sawDark = false;
  await drive(async (d) => {
    if (d.index === 0 || d.text.startsWith('戸を開けると')) {
      check(await T(() => document.querySelector('.dialogue-text.narration') !== null && document.querySelector('.dialogue-name').hidden), '語りが、名前なしの語りの書体で出ていません');
    }
    if (d.text === '一日前。') sawDark = await T(() => window.__tactics.dark());
    return false;
  });
  check(sawDark, '「一日前。」が暗転の中に出ていません');
  check(stats.titles === 1 && stats.melodies.has('ユナの鼻歌/石'), `冒頭: 章の題か、石の節の印を確かめられませんでした（${[...stats.melodies]}）`);
  await waitScene(1);
  // 場面2: 堰（戦闘の前）。ルビ・読み返しを確かめ、途中で読み込み直す。再開した後は早送りで進める
  let checkedRuby = false;
  await drive(async (d) => {
    if (!checkedRuby && d.text.includes('堰だ')) {
      const rts = await T(() => [...document.querySelectorAll('.dialogue-text rt')].map((r) => r.textContent));
      check(rts.includes('せき'), `ルビが出ていません（${rts.join(',')}）`);
      checkedRuby = true;
    }
    return d.text.startsWith('ユナの発明で');
  });
  check(checkedRuby, 'ルビを確かめられませんでした');
  await press(text.dialogue.backlog);
  await until(() => document.querySelector('.sheet[data-sheet="backlog"]') !== null);
  const rows = await T(() => [...document.querySelectorAll('.backlog-row')].map((r) => r.textContent));
  check(rows.length >= 4 && rows[rows.length - 1].includes('ユナの発明で'), `読み返しの一覧が違います（${rows.length}行）`);
  await press(text.dialogue.close);
  await reloadAndResume();
  await until(() => window.__tactics.screen() === 'scene');
  check((await sceneNow()) === 1, '会話の途中で読み込み直した後、その場面の始めから再開していません');
  await settle();
  await press(text.dialogue.fast);
  await waitScene(2);
  log('冒頭（三つの椀・母・石の節・暗転）・章の題・堰の会話（ルビ・読み返し・早送り）・会話の途中での読み込み直しと「これまで」✔');
  // 場面3: 堰の戦闘。手ほどき（移動の段 → 移動の後の段 → 飛ばす）と、倒れない番兵
  await waitScene(2);
  await deployAndStart();
  await until(() => window.__tactics.tutorial()?.step === 'weir-move', undefined, 120000);
  const move = await T(() => window.__tactics.marks().find((m) => m.kind === 'move'));
  check(move, '手ほどきの移動の段で、移動できるマスがありません');
  const at = await T((c) => window.__tactics.tileScreen(c.x, c.z), move);
  await page.mouse.click(at.x, at.y);
  await until(() => window.__tactics.tutorial()?.step === 'weir-attack', undefined, 30000);
  check(await T(() => !document.querySelector('.tutorial-pointer').hidden), '手ほどきの「攻撃」の段で、指し示す印が出ていません');
  check(
    (await T(() => window.__tactics.state().units.filter((u) => u.id.startsWith('weir-guard') && u.noRetire && !u.minHp).length)) === 3,
    '堰の番兵が「退場しない人」になっていません',
  );
  await press(text.tutorial.skip);
  check((await T(() => window.__tactics.settings().seenTutorials)).includes('prologue-weir'), '手ほどきを見たことが設定に残っていません');
  await press(text.buttons.wait).catch(() => {});
  const weir = await autoBattle('堰', 8, 3);
  check(weir.units.filter((u) => u.team === 'neutral').every((u) => u.retired), '堰の合わせ目が壊れていません');
  check(weir.units.filter((u) => u.id.startsWith('weir-guard')).every((u) => !u.retired), '退場しないはずの番兵が退場しています');
  check(weir.map.tiles.filter((t) => t.terrain === 'water' && t.x === 0).length > 0, '西の谷に水が流れていません');
  check(stats.afterLines >= 4, `堰の勝った後の台本が流れていません（${stats.afterLines}行）`);
  const recent = await T(() => window.__tactics.sound().recent);
  check(recent.includes('water') && recent.includes('gate'), `堰の勝った後の効果音（水・門）が鳴っていません（${recent}）`);
  log(`堰の戦闘（手ほどき・退場しない番兵・合わせ目3つ・水が別の谷へ・戦闘の途中での読み込み直しと core との一致・勝った後の台本 ${stats.afterLines}行）✔`);
  // 場面4〜10: 塔の門の脇・話を聞く部屋・広間・家（鼻歌）・都（歩かせる）・門・丘（歌声）。
  // 話を聞く部屋は、門の前の広間とは別の会話用マップで、ハルドの最初の台詞の時点で話者の名前が出ていること
  for (const n of [3, 4, 5, 6, 7, 8, 9]) {
    await waitScene(n);
    if (n === 4) {
      let named = false;
      await drive(async (d) => {
        if (d.text.startsWith('下流の村は')) {
          named = await T(() => document.querySelector('.dialogue-name')?.textContent === 'ハルド' && window.__tactics.sceneStage?.() === 'stage-hearing');
          await screenshot('prologue-hearing');
        }
        return false;
      });
      check(named, '話を聞く部屋で、ハルドの台詞に話者の名前が出ていないか、場面が門の前のままです');
      continue;
    }
    if (QUICK && (n === 3 || n === 8)) {
      await until(() => window.__tactics.screen() === 'scene' && window.__tactics.dialogue() !== null);
      await skip();
    } else await drive();
  }
  check(stats.melodies.has('ユナの鼻歌/鼻歌') && stats.melodies.has('月を呼ぶ節/歌声'), `鼻歌と月を呼ぶ節（丘の歌）の印を確かめられませんでした（${[...stats.melodies]}）`);
  check(stats.walks >= 5, `都で歩かせる操作が足りません（${stats.walks}歩）`);
  log(`塔・家（鼻歌と三度叩く）・都（歩かせる ${stats.walks}歩）・門・丘の会話 ✔${QUICK ? '（塔と門はスキップ）' : ''}`);
  // 場面11: 丘の戦闘。始めの演出（ゴードが斬りかかって押し返され、キリの矢が2本払われる）の後に、始めの台詞が出る
  await waitScene(10);
  const missesBefore = await T(() => window.__tactics.sound().recent.filter((x) => x === 'miss').length);
  await deployAndStart();
  for (let guard = 0; guard < 10; guard++) {
    await until(() => window.__tactics.dialogue()?.waiting === 'line', undefined, 120000);
    if ((await status()).text.startsWith('ゴードが剣ごと')) break;
    await tapLine();
    stats.battleLines++;
  }
  const hillStart = await T(() => {
    const st = window.__tactics.state();
    const g = st.units.find((u) => u.id === 'gord');
    const pose = window.__tactics.unitPose('gord');
    return { text: window.__tactics.dialogue()?.text ?? '', misses: window.__tactics.sound().recent.filter((x) => x === 'miss').length, back: pose && pose.coord.x === g.x && pose.coord.z === g.z, mode: window.__tactics.mode() };
  });
  check(hillStart.text.startsWith('ゴードが剣ごと'), `丘の始めの演出の後の台詞が出ていません（${hillStart.text}）`);
  check(hillStart.misses - missesBefore >= 3, `丘の始めの演出で、払われる攻撃が3回見えていません（${hillStart.misses - missesBefore}回）`);
  check(hillStart.back, '丘の始めの演出の後、ゴードが元の位置へ押し返されていません');
  await screenshot('prologue-hill-start');
  const afterBefore = stats.afterLines;
  const hill = await autoBattle('丘', 5, 11);
  check((hill.scenario.tallies?.['oath-sword'] ?? 0) >= 4, '誓いの剣に4回当てていません');
  check(hill.units.find((u) => u.id === 'hill-gareth').hp >= 1, 'HP が尽きないはずのガレスの HP が尽きています');
  check(stats.afterLines - afterBefore >= 6, `丘の勝った後の台本が流れていません（${stats.afterLines - afterBefore}行）`);
  log('丘の戦闘（始めの演出・誓いの剣に4回・HP の尽きないガレス・戦闘の途中での読み込み直しと core との一致・勝った後の台本）✔');
  // 場面12〜15: 塔の門の脇・話を聞く部屋・家までの道（歩かせる）・物置
  for (const n of [11, 12, 13, 14]) {
    await waitScene(n);
    if (QUICK && n === 11) {
      await until(() => window.__tactics.screen() === 'scene' && window.__tactics.dialogue() !== null);
      await skip();
    } else await drive();
  }
  await until(() => window.__tactics.screen() === 'story-end');
  check((await T(() => document.querySelector('.story-end-screen .screen-title')?.textContent)) === text.story.nextChapterSoon, '「第1章は準備中です」が出ていません');
  check((await T(() => window.__tactics.story().main?.finished)) === true, '序章を終えた記録がありません');
  await press(text.title.toTitle);
  await until(() => window.__tactics.screen() === 'title');
  log('帰還・家までの道・物置（石の節）・「第1章は準備中です」・タイトルへ ✔');

  // ---- 2回目: すべてスキップで通す ----
  await T(() => window.__tactics.setAutoPlayer(false));
  await press(text.title.story);
  const book = core.data.books.find((b) => b.id === 'main');
  const scenes = book.chapters[0].scenes;
  for (let n = 0; n < scenes.length; n++) {
    await waitScene(n);
    if (scenes[n].kind === 'battle') {
      await deployAndStart();
      // 戦闘の始めの会話（丘）は、タップで読み進める
      for (let guard = 0; guard < 10; guard++) {
        await until(() => ['main', 'ended'].includes(window.__tactics.mode()) || window.__tactics.dialogue()?.waiting === 'line', undefined, 120000);
        if ((await status())?.waiting !== 'line') break;
        await tapLine();
      }
      if (n === 2) check((await T(() => window.__tactics.tutorial())) === null, '2回目の堰の戦闘で、見た手ほどきがまた出ています');
      await T(() => window.__tactics.finishBattle('player'));
      await until(() => window.__tactics.dialogue()?.waiting === 'line');
      await skip();
      continue;
    }
    await until(() => window.__tactics.screen() === 'scene' && window.__tactics.dialogue() !== null);
    await skip();
  }
  await until(() => window.__tactics.screen() === 'story-end');
  log('スキップで最初から最後まで ✔');
  check(errors.length === 0, `ページでエラー: ${errors.map((e) => e.message).join(' / ')}`);
  await context.close();
  return { story: true, seconds: Math.round((Date.now() - started) / 1000), ...stats, melodies: stats.melodies.size };
}

async function checkLayouts(browser, baseUrl, name, core) {
  const options = VIEWPORT_OPTIONS[name];
  check(options, `画面サイズ ${name} は未定義です`);
  const { label, ...contextOptions } = options;
  delete contextOptions.defaultBrowserType;
  contextOptions.deviceScaleFactor = SCREENSHOT_DIR ? Math.min(2, contextOptions.deviceScaleFactor ?? 1) : 1;
  const context = await browser.newContext(contextOptions);
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e));
  const started = Date.now();
  const { text } = core.data;
  await page.goto(`${baseUrl}?seed=${SEED}&speed=${SPEED}&start=base&autodialogue=1`);
  await page.waitForFunction(() => window.__tactics?.screen() === 'base', null, { timeout: 30000 });
  const press = async (n) => page.getByRole('button', { name: n, exact: true }).click();
  const until = (fn, arg) => page.waitForFunction(fn, arg, { timeout: 60000, polling: 50 });
  let screens = 0;
  const inspect = async (tag) => {
    // 説明の欄のせり上がりなどの動き（終わりのあるもの）が終わるのを待つ
    await page.waitForFunction(
      () => document.getAnimations().every((a) => a.playState !== 'running' || a.effect?.getComputedTiming().iterations === Infinity),
      null,
      { timeout: 30000, polling: 50 },
    );
    const problems = await page.evaluate(() => {
      const out = [];
      const vw = window.innerWidth;
      const vh = window.innerHeight;
      const de = document.documentElement;
      if (de.scrollHeight > vh + 1 || de.scrollWidth > vw + 1) out.push(`ページ全体 ${de.scrollWidth}×${de.scrollHeight}`);
      const s = document.getElementById('screen');
      if (!s.hidden && (s.scrollHeight > s.clientHeight + 1 || s.scrollWidth > s.clientWidth + 1)) {
        out.push(`画面の中身があふれている ${s.scrollWidth}×${s.scrollHeight}`);
      }
      for (const b of document.querySelectorAll('#screen button, #hud button, #dialogue button')) {
        if (b.offsetParent === null) continue;
        const r = b.getBoundingClientRect();
        if (r.width === 0 || r.height === 0) continue;
        const name = b.getAttribute('aria-label') ?? b.textContent;
        // 数が増え続ける一覧の中は、枠の中でスクロールしてよい（枠そのものが画面の内側にあるかを見る）
        const area = b.closest('.scroll-area');
        const box = area ? area.getBoundingClientRect() : r;
        if (box.top < -1 || box.left < -1 || box.bottom > vh + 1 || box.right > vw + 1) out.push(`画面の外: ${name}`);
        if ((b.closest('#screen') || b.closest('#dialogue')) && r.height < 47.5) out.push(`小さいボタン（高さ ${Math.round(r.height)}px）: ${name}`);
      }
      return out;
    });
    // 画面写真は検査の前に撮る（収まらなかった画面も見られるように）
    if (SCREENSHOT_DIR) {
      fs.mkdirSync(SCREENSHOT_DIR, { recursive: true });
      await page.screenshot({ path: path.join(SCREENSHOT_DIR, `layout-${name}-${tag}.png`) });
    }
    check(problems.length === 0, `${label}「${tag}」: ${problems.join(' / ')}`);
    check(errors.length === 0, `ページでエラー: ${errors.map((e) => e.message).join(' / ')}`);
    screens++;
  };
  const screenIs = (n) => until((n) => window.__tactics.screen() === n, n);
  const resultDone = () => until(() => document.querySelector('.report-screen[data-done="true"]') !== null);
  const finish = async (winner) => {
    await until(() => ['main', 'ended'].includes(window.__tactics.mode()));
    await page.evaluate((w) => window.__tactics.finishBattle(w), winner);
    await screenIs('result');
    await resultDone();
  };
  const startFromDeploy = async () => {
    await until(() => window.__tactics.mode() === 'deploy');
    await inspect('deploy');
    await press(text.objectives.close);
    await press(text.deploy.start);
    await until(() => window.__tactics.screen() === 'battle' && window.__tactics.mode() === 'main' && window.__tactics.camera().idle);
  };

  await inspect('base');
  await press(text.base.newGame);
  await inspect('new-game-confirm');
  await press(text.base.cancel);
  // 編成: 4つのタブと説明の欄
  await press(text.base.roster);
  await screenIs('roster');
  const tab = async (t) => {
    await page.locator(`.roster-tabs .tab-button[data-tab="${t}"]`).click();
    await until((t) => document.querySelector('.roster-panel')?.dataset.tab === t, t);
  };
  for (const t of ['stats', 'job', 'abilities', 'learn']) {
    await tab(t);
    await inspect(`roster-${t}`);
  }
  await page.locator('.learn-item').first().click();
  await inspect('roster-sheet-ability');
  await press(text.roster.close);
  await tab('job');
  await page.locator('.job-choice:not([disabled])').first().click();
  await inspect('roster-sheet-job');
  await press(text.roster.close);
  await tab('abilities');
  await page.locator('.slot-row[data-slot="main"]').click();
  await inspect('roster-sheet-main');
  await press(text.roster.close);
  // 装備のタブと、枠の候補の欄（フェーズ2-4）
  await tab('equip');
  await inspect('roster-equip');
  await page.locator('.equip-row[data-slot="weapon"]').click();
  await inspect('roster-sheet-equip');
  await press(text.roster.close);
  await press(text.roster.back);
  await screenIs('base');
  // 店: 買う（一覧と説明の欄）・売る（フェーズ2-4）
  await press(text.base.shop);
  await screenIs('shop');
  await inspect('shop-buy');
  await page.locator('.shop-item').first().click();
  await inspect('shop-sheet-buy');
  await press(text.shop.close);
  await page.locator('.shop-tabs .tab-button[data-tab="sell"]').click();
  await until(() => document.querySelector('.shop-list')?.dataset.tab === 'sell');
  await inspect('shop-sell');
  await page.locator('.shop-item').first().click();
  await inspect('shop-sheet-sell');
  await press(text.shop.close);
  await press(text.shop.back);
  await screenIs('base');
  // 出撃先・敵の強さ・配置・戦闘・結果
  await press(text.base.sortie);
  await inspect('sortie');
  await press(text.base.training);
  await inspect('tiers');
  // 訓練戦の配置と戦闘の画面は、ダンジョンと同じ作りなので、ダンジョンの第1戦で確かめる（戦闘を1つ減らして時間を抑える）
  await press(text.base.back);
  await press(text.dungeons.ruins);
  await inspect('dungeon');
  // ダンジョン: 挑む → 配置 → 戦闘 → 戦闘の間（3つのボタン）→ 負けた時 → クリア
  await press(text.base.challenge);
  await startFromDeploy();
  await inspect('battle');
  // 戦闘の途中で読み込み直す: 拠点の「戦闘を再開」「撤退する」と、撤退の確認（フェーズ2-5）
  await page.reload();
  await screenIs('base');
  await inspect('base-suspended');
  await press(text.base.retreatBattle);
  await inspect('base-retreat-confirm');
  await press(text.base.cancel);
  await press(text.base.resumeBattle);
  await until(() => window.__tactics.screen() === 'battle' && window.__tactics.mode() === 'main' && window.__tactics.camera().idle);
  await finish('player');
  await inspect('dungeon-between');
  await press(text.report.next(2, text.mapNames[core.data.dungeon.battles[1].map.id]));
  await startFromDeploy();
  await finish('enemy');
  await inspect('dungeon-lost');
  await press(text.report.retry);
  await startFromDeploy();
  await finish('player');
  await press(text.report.suspend);
  await screenIs('base');
  await press(text.base.sortie);
  await press(text.dungeons.ruins);
  await inspect('dungeon-in-progress');
  await press(text.base.restart);
  await inspect('dungeon-restart-confirm');
  await press(text.base.cancel);
  await press(text.base.resume(3, text.mapNames[core.data.dungeon.battles[2].map.id]));
  await startFromDeploy();
  await finish('player');
  await inspect('dungeon-clear');
  await press(text.report.toBase);
  await screenIs('base');
  await inspect('base-cleared');
  // 戦闘不能の表示（倒れた姿・頭上のカウント・情報の欄）（フェーズ2-5）
  const ko = knockoutDrill(core);
  await page.evaluate((r) => window.__tactics.load(r), ko.start);
  await until(() => window.__tactics.mode() === 'main' && window.__tactics.camera().idle);
  await inspect('battle-knockout');
  // マスターの印（編成の画面のジョブのタブ）
  const P = core.progression;
  const mastered = core.data.roster.units.map((u, i) =>
    i === 0
      ? {
          ...u,
          jobs: {
            ...u.jobs,
            [u.jobId]: { jp: 0, jpTotal: 1500, learned: [...core.data.jobs.find((j) => j.id === u.jobId).abilities, ...core.data.jobs.find((j) => j.id === u.jobId).passives].map((a) => a.id) },
          },
        }
      : u,
  );
  const masteredRoster = { ...core.data.roster, units: mastered };
  check(P.isJobMastered(mastered[0], core.data.jobs.find((j) => j.id === mastered[0].jobId), core.data.progression), 'マスターの場面の部隊が想定と違います');
  await page.evaluate((r) => window.__tactics.setRoster(r), masteredRoster);
  await screenIs('base');
  await press(text.base.roster);
  await screenIs('roster');
  await tab('job');
  check((await page.locator('.job-current[data-mastered="true"]').count()) === 1, '編成の画面で、マスターしたジョブに印がありません');
  await inspect('roster-job-mastered');

  // ---- 物語の土台: 題名・会話・読み返し・スキップの確認・操作の場面・対象物のある戦闘・「これまで」 ----
  // 短くした版（CI）では確かめない（試しの場面の通しで同じ画面を通る。収まりは全体の自動プレイの4つの画面サイズで確かめる。CI の検査全体を5分以内に収めるため）
  if (QUICK) {
    await context.close();
    return { screens, seconds: Math.round((Date.now() - started) / 1000) };
  }
  await page.goto(`${baseUrl}?seed=${SEED}&speed=${SPEED}`);
  await screenIs('title');
  await inspect('title');
  // 設定の欄（序章に足りない仕組み）
  await press(text.settings.open);
  await until(() => document.querySelector('.sheet[data-sheet="settings"]') !== null);
  await inspect('settings');
  await press(text.settings.close);
  // 序章: 冒頭の語り・章の題・台詞・読み返し・スキップの確認
  await press(text.title.story);
  await screenIs('scene');
  const lineReady = () =>
    until(() => {
      const d = window.__tactics.dialogue();
      return d && (d.waiting === 'line' || d.waiting === 'walk' || d.waiting === 'title') && window.__tactics.camera().idle;
    });
  const tapLine = async () => {
    const i = await page.evaluate(() => window.__tactics.dialogue().index);
    await page.locator('.dialogue-body').click();
    await until((i) => window.__tactics.dialogue()?.index !== i, i);
    await lineReady();
  };
  await lineReady();
  await inspect('dialogue-narration');
  while ((await page.evaluate(() => window.__tactics.dialogue().waiting)) === 'line') await tapLine();
  await inspect('chapter-title');
  await page.waitForTimeout(750);
  await page.locator('.chapter-title-card').click();
  // 「一日前。」を読んで、次の場面へ
  await until(() => window.__tactics.dialogue()?.waiting === 'line');
  await page.locator('.dialogue-body').click();
  await until(() => window.__tactics.story().main?.scene === 1 && window.__tactics.dialogue() !== null);
  await lineReady();
  await press(text.dialogue.backlog);
  await inspect('dialogue-backlog');
  await press(text.dialogue.close);
  await press(text.dialogue.skip);
  await inspect('dialogue-skip-confirm');
  await press(text.dialogue.skipYes);
  // 堰の戦闘（配置・手ほどき・物の情報の欄）
  await startFromDeploy();
  await until(() => window.__tactics.tutorial()?.step === 'weir-move', undefined, 120000);
  await inspect('battle-tutorial');
  const seam = await page.evaluate(() => window.__tactics.unitScreen('weir-seam-2'));
  await page.mouse.click(seam.x, seam.y);
  await inspect('battle-objects');
  // 勝った後の台本（戦闘のマップの上）
  await page.evaluate(() => window.__tactics.finishBattle('player'));
  await until(() => window.__tactics.dialogue()?.waiting === 'line');
  await lineReady();
  await inspect('after-victory');
  await press(text.dialogue.skip);
  await press(text.dialogue.skipYes);
  // 塔の会話（台詞）と、「これまで」（読み込み直して続きから）
  await until(() => window.__tactics.story().main?.scene === 3 && window.__tactics.dialogue() !== null);
  await lineReady();
  await tapLine();
  await inspect('dialogue-line');
  await page.reload();
  await screenIs('title');
  await press(text.title.storyContinue);
  await screenIs('recap');
  await inspect('recap');
  await press(text.story.recapContinue);
  await screenIs('scene');
  for (const n of [3, 4]) {
    await until((n) => window.__tactics.story().main?.scene === n && window.__tactics.dialogue() !== null, n);
    await lineReady();
    await press(text.dialogue.skip);
    await press(text.dialogue.skipYes);
  }
  // 都: 歩かせる操作の場面
  await until(() => window.__tactics.story().main?.scene === 5 && window.__tactics.dialogue() !== null);
  await lineReady();
  while ((await page.evaluate(() => window.__tactics.dialogue().waiting)) === 'line') await tapLine();
  await inspect('interactive-walk');
  await context.close();
  return { screens, seconds: Math.round((Date.now() - started) / 1000) };
}

/**
 * 味方の動かし方。敵と同じ AI で決めるが、味方が最初にユニットを狙う魔法を使う時だけ、
 * そのユニットの今いるマスを狙う（マス狙い）に変える。画面の操作と core だけの計算で同じものを使う。
 */
function playerPolicy(core) {
  let changed = false;
  return (state) => {
    const action = core.ai.decideNextAction(state, core.data.ai);
    // 3手番に1回、向きを初期値（最も近い敵の方）から時計回りに1つ変える（向きのボタンを押す操作を確かめるため）
    if (action.type === 'endTurn' && state.turnNumber % 3 === 0) {
      const order = ['north', 'east', 'south', 'west'];
      return { ...action, facing: order[(order.indexOf(action.facing) + 1) % 4] };
    }
    if (changed || action.type !== 'cast' || action.target.kind !== 'unit') return action;
    changed = true;
    const target = state.units.find((u) => u.id === action.target.unitId);
    return { ...action, target: { kind: 'tile', x: target.x, z: target.z } };
  };
}

/**
 * 詠唱の中断を確かめる場面。新しい戦闘の最初の状態から、味方の魔道士が「炎」を詠唱中のまま手番を迎えた状態を作る。
 * finish(facing) は、同じ操作（移動 → 向きを決めて終了）を core だけで行った結果。
 */
function interruptDrill(core) {
  const { spells } = core.data;
  const base = core.start(core.data.roster, 'easy', SEED + 1).state;
  const unitId = 'fen';
  const fire = spells.find((s) => s.id === 'fire');
  const units = base.units.map((u) =>
    u.id === unitId
      ? { ...u, ct: 100, mp: u.mp - fire.mpCost, charging: { spellId: 'fire', target: { kind: 'tile', x: u.x, z: 4 }, progress: 50 } }
      : { ...u, ct: 0 },
  );
  const mage = units.find((u) => u.id === unitId);
  const state = {
    ...base,
    units,
    turn: { unitId, moved: false, acted: false, origin: { x: mage.x, z: mage.z, facing: mage.facing }, chargingAtStart: true },
    turnNumber: 1,
  };
  const move = core.movement.reachableTiles(state, mage).sort((a, b) => a.z - b.z || a.x - b.x)[0];
  return {
    unitId,
    mp: mage.mp,
    move: { x: move.x, z: move.z },
    start: { state, events: [{ type: 'turnStarted', unitId, turnNumber: 1 }] },
    finish(facing) {
      const moved = core.battle.applyAction(state, { type: 'move', x: move.x, z: move.z }).state;
      return core.battle.applyAction(moved, { type: 'endTurn', facing }).state;
    },
  };
}

/**
 * 戦闘の後の部隊と、編成の画面で行う変更を core だけで計算する。
 * - 習得: 戦闘で得た JP で覚えられるアビリティ（強打を優先）
 * - ジョブチェンジ: 2人目の戦士を魔道士にして（風を覚える）、戦士に戻す
 * - 副コマンド: その戦士の副コマンドを「攻撃魔法」にする
 */
function rosterPlan(core, finalState) {
  const P = core.progression;
  const E = core.equipment;
  const S = core.shop;
  const { catalog, progression: rules } = core.data;
  const { roster: afterProgress, report } = P.applyBattleResult(core.data.roster, finalState, catalog, rules);
  // 勝てば、ゴールドと戦利品（戦闘が終わった時点の乱数の状態で抽選。画面と同じ計算）
  const easy = core.data.site.tiers.find((t) => t.id === 'easy');
  const spoils = S.rollSpoils(easy.reward, finalState.winner === 'player', finalState.rngState);
  const afterBattle = S.grantSpoils(afterProgress, spoils).roster;
  // 店: 最初の品ぞろえから、買える中で強い剣を買う（鋼の剣が買えなければ旅人の剣）
  const stock = S.shopStock(core.data.equip.shop, { trainingWins: finalState.winner === 'player' ? { easy: 1 } : {}, dungeonClears: {} });
  const price = (id) => catalog.equipment.find((e) => e.id === id).price;
  const buyId = afterBattle.gold >= price('sword-2') ? 'sword-2' : 'sword-1';
  const bought = S.buyItem(afterBattle, buyId, stock, catalog);
  const afterBuy = bought.roster;
  // ゴールドが足りない物（品ぞろえの中で最も高い物）
  const tooExpensive = [...stock].sort((a, b) => price(b) - price(a))[0];
  if (price(tooExpensive) <= afterBuy.gold) throw new Error('ゴールドが足りない物が品ぞろえにありません');
  let learn;
  const candidates = [];
  for (const u of afterBuy.units) {
    const job = P.findJob(catalog, u.jobId);
    for (const a of job.abilities ?? []) {
      if (P.learnRefusal(u, job.id, a.id, catalog, rules) === null) candidates.push({ unitId: u.id, jobId: job.id, abilityId: a.id });
    }
  }
  learn = candidates.find((c) => c.abilityId === 'powerStrike' && c.unitId === 'gord') ?? candidates.find((c) => c.abilityId === 'powerStrike') ?? candidates[0];
  let roster = afterBuy;
  if (learn) roster = P.replaceUnit(roster, P.learnAbility(P.findUnit(roster, learn.unitId), learn.jobId, learn.abilityId, catalog, rules));
  // ジョブを変えて戻る（魔道士になると剣と鎧が外れ、戦士に戻っても外れたまま）
  const jobUnitId = 'gord';
  const homeJobId = P.findUnit(roster, jobUnitId).jobId;
  const subJobId = 'mage';
  const toSub = E.changeJobWithEquipment(roster, jobUnitId, subJobId, catalog, rules);
  const removed = toSub.removed.map((i) => i.itemId);
  roster = E.changeJobWithEquipment(toSub.roster, jobUnitId, homeJobId, catalog, rules).roster;
  // 装備のタブ: 買った剣をトウマ（時守）の武器の枠に付ける。ゴード（戦士）は「おまかせ」
  const equipUnitId = 'touma';
  roster = E.equipItem(roster, equipUnitId, 'weapon', bought.item.uid, catalog);
  roster = E.autoEquip(roster, jobUnitId, catalog, core.data.equip.autoEquipWeights);
  roster = P.replaceUnit(roster, P.setSecondary(P.findUnit(roster, jobUnitId), subJobId, catalog));
  const afterEdit = roster;
  // 売る: だれも付けていない旅人の剣。装備中の物（トウマの買った剣）は売れない
  const free = afterEdit.items.find((i) => !E.wearerOf(afterEdit, i.uid) && i.itemId === 'sword-1');
  if (!free) throw new Error('売る物がありません');
  const afterSell = S.sellItem(afterEdit, free.uid, catalog, core.data.equip.shop);
  return {
    report,
    spoils,
    afterBattle,
    stock,
    buy: { itemId: buyId, uid: bought.item.uid },
    tooExpensive,
    afterBuy,
    learn,
    jobUnitId,
    homeJobId,
    subJobId,
    removed,
    equipUnitId,
    afterEdit,
    sell: { itemId: free.itemId, uid: free.uid, equippedUid: bought.item.uid },
    afterSell,
  };
}

/**
 * 強打を確かめる場面。強打を覚え、副コマンドに攻撃魔法（風）を付けた戦士が、敵の戦士の隣で手番を迎えた状態。
 * 部隊は編成の後のもの（強打を覚えていなければ、ここで覚えたことにする）。expected は同じ強打を core だけで行った結果。
 */
function strikeDrill(core, plan) {
  const P = core.progression;
  const { catalog, progression: rules } = core.data;
  const unitId = plan.jobUnitId;
  let u = P.findUnit(plan.afterSell, unitId);
  if (!P.jobProgress(u, 'warrior').learned.includes('powerStrike')) {
    u = P.learnAbility(P.gainJp(u, 'warrior', 1000), 'warrior', 'powerStrike', catalog, rules);
  }
  const roster = P.replaceUnit(plan.afterSell, u);
  const base = core.start(roster, 'easy', SEED + 2).state;
  const me = base.units.find((x) => x.id === unitId);
  const targetId = 'e-warrior-2';
  // 敵の戦士を、戦士のすぐ前（奥側）に置く。こちらに背を向けさせ、強打の方が通常攻撃より得になるようにする
  // 経験値をレベルアップの直前まで貯めておく（強打の経験値で、戦闘の途中にレベルが上がる表示を確かめるため）
  const need = P.expToNext(me.level, rules) - 1;
  const units = base.units.map((x) =>
    x.id === unitId
      ? { ...x, ct: 100, progress: { ...x.progress, exp: need } }
      : x.id === targetId
        ? { ...x, x: me.x, z: me.z - 1, facing: 'north', ct: 0 }
        : { ...x, ct: 0 },
  );
  const state = {
    ...base,
    units,
    turn: { unitId, moved: false, acted: false, origin: { x: me.x, z: me.z, facing: me.facing }, chargingAtStart: false },
    turnNumber: 1,
  };
  const expected = core.battle.applyAction(state, { type: 'attack', targetId, abilityId: 'powerStrike' }).state;
  return { unitId, targetId, subAbilityId: 'wind', start: { state, events: [{ type: 'turnStarted', unitId, turnNumber: 1 }] }, expected };
}

/**
 * 戦闘不能と蘇生の場面（フェーズ2-5）。蘇生を覚えた治癒師（ノノ）の手番。
 * 隣に戦闘不能の味方（トウマ。カウント 2）、少し先に戦闘不能の敵（e-archer-1。カウント 1、CT 99 なので、すぐ退場する）。
 * finish(facing) は、蘇生を指定して待機し、向きを決めて手番を終えた後の状態（core だけで計算。蘇生は次の手番までに発動する）。
 */
function knockoutDrill(core) {
  const P = core.progression;
  const { catalog, progression: rules } = core.data;
  const unitId = 'nono';
  const downId = 'touma';
  const enemyId = 'e-archer-1';
  const healer = P.findUnit(core.data.roster, unitId);
  const learned = { ...healer, jobs: { ...healer.jobs, healer: { ...healer.jobs.healer, learned: [...healer.jobs.healer.learned, 'revive'] } } };
  const roster = P.replaceUnit(core.data.roster, learned);
  if (P.validateRoster(roster, catalog, rules).length > 0) throw new Error('蘇生の場面の部隊が正しくありません');
  const base = core.start(roster, 'easy', SEED + 6).state;
  const me = base.units.find((u) => u.id === unitId);
  const taken = (x, z) => base.units.some((u) => u.id !== downId && u.x === x && u.z === z);
  const spot = [
    [1, 0],
    [-1, 0],
    [0, -1],
    [0, 1],
  ]
    .map(([dx, dz]) => ({ x: me.x + dx, z: me.z + dz }))
    .find((c) => c.x >= 0 && c.z >= 0 && c.x < base.map.width && c.z < base.map.depth && !taken(c.x, c.z));
  const enemy = base.units.find((u) => u.id === enemyId);
  const state = drillState(base, unitId, {
    [downId]: { x: spot.x, z: spot.z, hp: 0, knockoutCount: 2, statuses: [] },
    [enemyId]: { hp: 0, knockoutCount: 1, ct: 99, x: enemy.x, z: enemy.z },
  });
  const down = state.units.find((u) => u.id === downId);
  const reviveSpell = core.data.spells.find((s) => s.id === 'revive');
  const cast = core.battle.applyAction(state, { type: 'cast', spellId: 'revive', target: { kind: 'unit', unitId: downId } }).state;
  return {
    unitId,
    downId,
    enemyId,
    maxHp: down.stats.maxHp,
    reviveHp: Math.max(1, Math.floor((down.stats.maxHp * reviveSpell.power) / 100)),
    start: { state, events: [{ type: 'turnStarted', unitId, turnNumber: 1 }] },
    finish: (facing) => core.battle.applyAction(cast, { type: 'endTurn', facing }).state,
  };
}

/** 敵を動かさずに、指定したユニットの手番から始まる状態を作る（ほかのユニットは CT 0） */
function drillState(base, unitId, patch) {
  const units = base.units.map((x) => ({ ...x, ct: x.id === unitId ? 100 : 0, ...(patch[x.id] ?? {}) }));
  const me = units.find((x) => x.id === unitId);
  return {
    ...base,
    units,
    turn: { unitId, moved: false, acted: false, origin: { x: me.x, z: me.z, facing: me.facing }, chargingAtStart: false },
    turnNumber: 1,
  };
}

/**
 * 勝敗条件・イベント・罠の場面（はじまりの遺跡 第2戦「崩れた回廊」）。
 * - trap: 味方の戦士が、見えないぬかるみ (3,9) の隣で手番を迎える。
 * - reinforce: 増援の予告があり、今の手番が終わると現れる。
 * - reach: 味方の戦士が、到達するマスの隣で手番を迎える。
 */
function scenarioDrills(core) {
  const site = core.data.dungeon.battles[1];
  const base = core.battle.startBattle(
    core.sortie.buildSortie(site, 'main', core.data.roster, core.data.catalog),
    core.data.jobs,
    core.data.rules,
    SEED,
    core.data.spells,
    core.data.strikes,
    core.data.passives,
  ).state;
  const unitId = 'touma';
  const start = (state) => ({ state, events: [{ type: 'turnStarted', unitId, turnNumber: state.turnNumber }] });
  // 罠
  const trapTo = site.traps.find((t) => t.kind === 'mud');
  const trapState = drillState(base, unitId, { [unitId]: { x: trapTo.x, z: trapTo.z + 1 } });
  const trapExpected = core.battle.applyAction(trapState, { type: 'move', x: trapTo.x, z: trapTo.z }).state;
  if (!trapExpected.scenario.traps.some((t) => t.revealed)) throw new Error('罠の場面が想定と違います');
  // 増援: 第2戦のイベントの増援を、この手番の後に現れる予告として置く
  const wave = base.scenario.events.find((e) => e.effects.some((f) => f.kind === 'reinforce'));
  const units = wave.effects.find((f) => f.kind === 'reinforce').units.map((u) => ({ ...u, id: `${u.id}-drill` }));
  const plain = drillState(base, unitId, {});
  const reinforceState = {
    ...plain,
    scenario: { ...plain.scenario, reinforcements: [{ eventId: wave.id, appearAfterTurn: plain.turnNumber, units }] },
  };
  // 到達
  const goal = site.objectives.victory[0].tiles[0];
  const reachState = drillState(base, unitId, { [unitId]: { x: goal.x, z: goal.z + 1 } });
  if (!core.battle.applyAction(reachState, { type: 'move', x: goal.x, z: goal.z }).state.winner) throw new Error('到達の場面が想定と違います');
  return {
    unitId,
    trap: { start: start(trapState), to: trapTo, expected: trapExpected },
    reinforce: { start: start(reinforceState), count: units.length, unitsAfter: base.units.length + units.length },
    reach: { start: start(reachState), to: goal },
  };
}

/**
 * 突き飛ばしを確かめる場面。突き飛ばしを覚えた戦士が、西の高い丘（高さ 4）の上にいて、
 * その東隣（高さ 3）に敵の戦士が背を向けて立っている。押し出す先（さらに東、高さ 1）は 2 段低いので落下ダメージがある。
 */
function knockbackDrill(core) {
  const P = core.progression;
  const { catalog, progression: rules } = core.data;
  const unitId = 'gord';
  const u = P.learnAbility(P.gainJp(P.findUnit(core.data.roster, unitId), 'warrior', 1000), 'warrior', 'knockback', catalog, rules);
  const base = core.start(P.replaceUnit(core.data.roster, u), 'easy', SEED + 3).state;
  const targetId = 'e-warrior-1';
  const state = drillState(base, unitId, {
    [unitId]: { x: 0, z: 4, facing: 'east' },
    [targetId]: { x: 1, z: 4, facing: 'east' },
  });
  const me = state.units.find((x) => x.id === unitId);
  const target = state.units.find((x) => x.id === targetId);
  const strike = me.strikes.find((s) => s.id === 'knockback');
  const preview = core.combat.previewAttack(state, me, target, me, strike);
  if (!preview.knockback?.to || preview.knockback.damage <= 0 || preview.hitPercent !== 100) throw new Error('突き飛ばしの場面が想定と違います');
  const expected = core.battle.applyAction(state, { type: 'attack', targetId, abilityId: 'knockback' }).state;
  return {
    unitId,
    targetId,
    to: preview.knockback.to,
    fall: preview.knockback.damage,
    start: { state, events: [{ type: 'turnStarted', unitId, turnNumber: 1 }] },
    expected,
  };
}

/**
 * 時守の4つの行動を確かめる場面（フェーズ2-6）。4つの業を覚えたトウマ（時守）が (4,7) で北を向き、
 * 正面 (4,6) に敵の戦士A、その左 (3,6) に敵の戦士B（斬り分けで巻き込む）、2マス東 (6,7) に HP の減ったゴード
 * （前回の手番の始めは満タン。引き戻し・門渡りの相手）、3マス北 (4,4) に敵の弓使い（時送りの相手）がいる。
 * 予測に出るはずの文言と、core だけで計算した結果を、行動ごとに返す。
 */
function timekeeperDrill(core) {
  const P = core.progression;
  const { catalog, progression: rules } = core.data;
  const unitId = 'touma';
  const t0 = P.findUnit(core.data.roster, unitId);
  const tp = P.jobProgress(t0, 'timekeeper');
  const touma = { ...t0, jobId: 'timekeeper', jobs: { ...t0.jobs, timekeeper: { ...tp, jpTotal: 1000, learned: ['sweep', 'rewind', 'gateSwap', 'timeDelay'] } } };
  const roster = P.replaceUnit(core.data.roster, touma);
  if (P.validateRoster(roster, catalog, rules).length > 0) throw new Error('時守の場面の部隊が正しくありません');
  const base = core.start(roster, 'easy', SEED + 7).state;
  const allyId = 'gord';
  const gord = base.units.find((u) => u.id === allyId);
  const state = drillState(base, unitId, {
    [unitId]: { x: 4, z: 7, facing: 'north' },
    'e-warrior-1': { x: 4, z: 6, facing: 'south' },
    'e-warrior-2': { x: 3, z: 6, facing: 'south' },
    [allyId]: { x: 6, z: 7, hp: gord.hp - 25, turnStartHp: gord.hp },
    'e-archer-1': { x: 4, z: 4, ct: 80 },
  });
  const spots = state.units.map((u) => `${u.x},${u.z}`);
  if (new Set(spots).size !== spots.length) throw new Error('時守の場面で、ユニットが同じマスにいます');
  const act = (action) => core.battle.applyAction(state, action).state;
  const me = state.units.find((u) => u.id === unitId);
  const sweep = core.combat.previewAttack(state, me, state.units.find((u) => u.id === 'e-warrior-1'), me, me.strikes.find((s) => s.id === 'sweep'));
  if (sweep.sweep?.length !== 1) throw new Error('斬り分けの場面が想定と違います');
  const t = core.data.text;
  const name = (id) => t.unitNames[id] ?? id;
  // 時送り: 使う前（この手番で行動したものとして）と使った後の行動順で、相手の手番が何番目か
  const position = (st, id) => core.turnOrder.predictTimeline(st, 30).findIndex((e) => e.kind === 'turn' && e.unitId === id) + 1;
  const delayAction = { type: 'cast', spellId: 'timeDelay', target: { kind: 'unit', unitId: 'e-archer-1' } };
  const delayed = act(delayAction);
  const ct = state.units.find((u) => u.id === 'e-archer-1').ct;
  const delayCt = Math.min(ct, core.data.spells.find((s) => s.id === 'timeDelay').ctDelay);
  return {
    unitId,
    start: { state, events: [{ type: 'turnStarted', unitId, turnNumber: 1 }] },
    drills: [
      {
        abilityId: 'sweep',
        targetId: 'e-warrior-1',
        previewIncludes: [t.preview.sweepLabel, name('e-warrior-2')],
        expected: act({ type: 'attack', targetId: 'e-warrior-1', abilityId: 'sweep' }),
        compare: ['e-warrior-1', 'e-warrior-2', unitId],
      },
      {
        abilityId: 'rewind',
        targetId: allyId,
        previewIncludes: [t.spellPreview.rewind(gord.hp - 25, gord.hp), t.spellPreview.instant],
        expected: act({ type: 'cast', spellId: 'rewind', target: { kind: 'unit', unitId: allyId } }),
        compare: [allyId, unitId],
      },
      {
        abilityId: 'gateSwap',
        targetId: allyId,
        previewIncludes: [t.spellPreview.swap],
        expected: act({ type: 'cast', spellId: 'gateSwap', target: { kind: 'unit', unitId: allyId } }),
        compare: [allyId, unitId],
      },
      {
        abilityId: 'timeDelay',
        targetId: 'e-archer-1',
        previewIncludes: [t.spellPreview.delay(delayCt, position({ ...state, turn: { ...state.turn, acted: true } }, 'e-archer-1'), position(delayed, 'e-archer-1'))],
        expected: delayed,
        compare: ['e-archer-1', unitId],
      },
    ],
  };
}

/**
 * 反撃を確かめる場面。「反撃」を付けた敵の戦士の西隣で、味方の戦士が手番を迎える。
 * 攻撃と反撃の両方が当たる乱数の状態を選ぶ（反撃は当たって生き残った時だけ起きるため）。
 */
function counterDrill(core) {
  const base = core.start(core.data.roster, 'easy', SEED + 4).state;
  const unitId = 'gord';
  const targetId = 'e-warrior-1';
  const counter = core.data.passives.find((p) => p.id === 'counter');
  const scene = drillState(base, unitId, {
    [unitId]: { x: 3, z: 6, facing: 'east' },
    [targetId]: { x: 4, z: 6, facing: 'north', passives: [counter] },
  });
  for (let rng = 1; rng < 1000; rng++) {
    const state = { ...scene, rngState: rng };
    const r = core.battle.applyAction(state, { type: 'attack', targetId });
    const attacks = r.events.filter((e) => e.type === 'attacked');
    if (attacks.length === 2 && attacks.every((a) => a.hit) && !r.state.winner) {
      return { unitId, targetId, start: { state, events: [{ type: 'turnStarted', unitId, turnNumber: 1 }] }, expected: r.state };
    }
  }
  throw new Error('反撃の場面を作れませんでした');
}

/**
 * 受動的なアビリティの習得と付け替えを確かめる部隊。ゴード（戦士）に戦士の JP を 300（ジョブのレベル 3）持たせる。
 * 「反撃」（ジョブのレベル 3 が必要）は覚えられ、「重装」（ジョブのレベル 4 が必要）は覚えられない。
 * expected は、反撃を覚えてリアクションの枠に付けた後の部隊（core だけで計算）。
 */
function passiveDrill(core, roster) {
  const P = core.progression;
  const { catalog, progression: rules } = core.data;
  const unitId = 'gord';
  const jobId = 'warrior';
  const u0 = P.findUnit(roster, unitId);
  const p = P.jobProgress(u0, jobId);
  const [lv3, lv4] = [rules.jobLevelJp[1], rules.jobLevelJp[2]];
  const u = { ...u0, jobId, slots: { ...u0.slots, secondary: u0.slots.secondary === jobId ? null : u0.slots.secondary }, jobs: { ...u0.jobs, [jobId]: { ...p, jp: 300, jpTotal: Math.max(lv3, Math.min(p.jpTotal, lv4 - 1)) } } };
  const start = P.replaceUnit(roster, u);
  if (P.jobLevel(u, jobId, rules) !== 3) throw new Error('受動的なアビリティの場面のジョブのレベルが想定と違います');
  const learned = P.setPassive(P.learnAbility(u, jobId, 'counter', catalog, rules), 'reaction', 'counter', catalog);
  return { unitId, jobId, abilityId: 'counter', lockedId: 'heavyArmor', lockedLevel: 4, start, expected: P.replaceUnit(start, learned) };
}

/**
 * ジョブの解放と新しいジョブの場面（フェーズ2-6）。base は受動的なアビリティの場面の後の部隊（ゴードは戦士 Lv 3）。
 * - unlock: キリ（弓使い）の弓使いの JP の累計を、ジョブ Lv 2 の 10 手前にした部隊と、キリが敵を撃つ手番（撃つと Lv 2 になり、盗賊が解放される）
 * - jobs: 編成の画面で転職する部隊（ゴードは戦士 Lv 3、キリは弓使い Lv 2）と、ゴード → 騎士 → 格闘家、キリ → 盗賊 に変えた後の部隊（core だけで計算）
 * - actions: 騎士の武器破壊・格闘家の連撃・盗賊の装備を盗む を、敵の戦士の背後で行う場面と、core だけで計算した結果
 */
function jobDrills(core, base) {
  const P = core.progression;
  const E = core.equipment;
  const S = core.shop;
  const { catalog, progression: rules } = core.data;
  const t = core.data.text;
  const lv2 = rules.jobLevelJp[0];
  const withJp = (roster, unitId, jobId, jpTotal) => {
    const u = P.findUnit(roster, unitId);
    const p = P.jobProgress(u, jobId);
    return P.replaceUnit(roster, { ...u, jobs: { ...u.jobs, [jobId]: { ...p, jp: Math.min(p.jp, jpTotal), jpTotal } } });
  };
  // (1) 解放の知らせ
  const unlockRoster = withJp(base, 'kiri', 'archer', lv2 - 10);
  if (P.findUnit(unlockRoster, 'kiri').jobId !== 'archer') throw new Error('解放の場面: キリが弓使いではありません');
  const unlockBase = core.start(unlockRoster, 'easy', SEED + 8).state;
  const unlockState = drillState(unlockBase, 'kiri', {
    kiri: { x: 4, z: 8, facing: 'north' },
    'e-warrior-1': { x: 4, z: 4, facing: 'south' },
  });
  checkFree(unlockState, '解放の場面');
  // (2) 編成の画面で転職
  const jobsRoster = withJp(withJp(base, 'kiri', 'archer', lv2), 'gord', 'warrior', Math.max(rules.jobLevelJp[1], P.jobProgress(P.findUnit(base, 'gord'), 'warrior').jpTotal));
  let expected = jobsRoster;
  const changes = [
    { unitId: 'gord', jobId: 'knight' },
    { unitId: 'gord', jobId: 'monk' },
    { unitId: 'kiri', jobId: 'thief' },
  ];
  for (const c of changes) expected = E.changeJobWithEquipment(expected, c.unitId, c.jobId, catalog, rules).roster;
  // (3) 代表的な行動: それぞれのジョブで、その技を覚えた部隊を作る
  const learned = (roster, unitId, jobId, abilities) => {
    let r = E.changeJobWithEquipment(roster, unitId, jobId, catalog, rules).roster;
    const u = P.findUnit(r, unitId);
    const p = P.jobProgress(u, jobId);
    r = P.replaceUnit(r, { ...u, jobs: { ...u.jobs, [jobId]: { ...p, jpTotal: Math.max(p.jpTotal, 1000), learned: [...new Set([...p.learned, ...abilities])] } } });
    return r;
  };
  // トウマは、格闘家の解放条件（戦士 Lv 3）を満たした状態にする
  const monkReady = withJp(jobsRoster, 'touma', 'warrior', rules.jobLevelJp[1]);
  let actionRoster = learned(learned(learned(monkReady, 'gord', 'knight', ['breakWeapon']), 'touma', 'monk', ['doubleStrike']), 'kiri', 'thief', ['stealGear']);
  // 盗賊に短剣を持たせる
  const bought = S.addItems(actionRoster, ['dagger-1']);
  actionRoster = E.equipItem(bought.roster, 'kiri', 'weapon', bought.added[0].uid, catalog);
  if (P.validateRoster(actionRoster, catalog, rules).length > 0) throw new Error(`新しいジョブの場面の部隊が正しくありません ${JSON.stringify(P.validateRoster(actionRoster, catalog, rules))}`);
  const actionBase = core.start(actionRoster, 'easy', SEED + 9).state;
  const scene = (unitId, abilityId, previewIncludes) => {
    const state = drillState(actionBase, unitId, {
      [unitId]: { x: 4, z: 7, facing: 'north' },
      'e-warrior-1': { x: 4, z: 6, facing: 'north' },
    });
    checkFree(state, `「${abilityId}」の場面`);
    return {
      unitId,
      abilityId,
      targetId: 'e-warrior-1',
      previewIncludes,
      start: { state, events: [{ type: 'turnStarted', unitId, turnNumber: 1 }] },
      expected: core.battle.applyAction(state, { type: 'attack', targetId: 'e-warrior-1', abilityId }).state,
    };
  };
  const enemySword = actionBase.units.find((u) => u.id === 'e-warrior-1').equipment.find((e) => e.slot === 'weapon');
  // 魔法のジョブ（PR C）: ゴード → 魔法剣士（戦士 Lv 3・魔道士 Lv 3）、フェン → 時魔道士（魔道士 Lv 2）、ノノ → 召喚士（魔道士 Lv 3・時魔道士 Lv 3）
  const lv3 = rules.jobLevelJp[1];
  let magicRoster = withJp(withJp(jobsRoster, 'gord', 'mage', lv3), 'nono', 'mage', lv3);
  magicRoster = withJp(withJp(magicRoster, 'nono', 'timeMage', lv3), 'fen', 'mage', lv3);
  magicRoster = learned(learned(learned(magicRoster, 'gord', 'magicKnight', ['fireBlade']), 'fen', 'timeMage', ['quicken']), 'nono', 'summoner', ['fireSpirit']);
  if (P.validateRoster(magicRoster, catalog, rules).length > 0) throw new Error(`魔法のジョブの場面の部隊が正しくありません ${JSON.stringify(P.validateRoster(magicRoster, catalog, rules))}`);
  const magicBase = core.start(magicRoster, 'easy', SEED + 10).state;
  const magicScene = (unitId, patch, abilityId, targetId, action, previewIncludes, extra = {}) => {
    const state = drillState(magicBase, unitId, patch);
    checkFree(state, `「${abilityId}」の場面`);
    return {
      unitId,
      abilityId,
      targetId,
      previewIncludes,
      ...extra,
      start: { state, events: [{ type: 'turnStarted', unitId, turnNumber: 1 }] },
      expected: core.battle.applyAction(state, action).state,
    };
  };
  const spells = [
    magicScene(
      'fen',
      { fen: { x: 4, z: 8 }, kiri: { x: 5, z: 8 } },
      'quicken',
      'kiri',
      { type: 'cast', spellId: 'quicken', target: { kind: 'unit', unitId: 'kiri' } },
      [t.abilities.quicken],
    ),
    magicScene(
      'nono',
      { nono: { x: 4, z: 8 }, 'e-warrior-1': { x: 4, z: 5 } },
      'fireSpirit',
      'e-warrior-1',
      { type: 'cast', spellId: 'fireSpirit', target: { kind: 'tile', x: 4, z: 5 } },
      [t.spellPreview.affects.enemies],
      { tile: true, markKind: 'spellAreaEnemies' },
    ),
    magicScene(
      'gord',
      { gord: { x: 4, z: 7, facing: 'north' }, 'e-warrior-1': { x: 4, z: 6, facing: 'north' } },
      'fireBlade',
      'e-warrior-1',
      { type: 'attack', targetId: 'e-warrior-1', abilityId: 'fireBlade' },
      [t.abilities.fireBlade],
    ),
  ];
  // 目印と膠着: 敵の戦士に状態変化を3つ付け、最後にダメージなどが起きたのを 21 手番前にした場面（膠着まで残り 10 手番）
  const markerState = drillState(actionBase, 'gord', {
    'e-warrior-1': {
      statuses: [
        { id: 'protect', turns: 2 },
        { id: 'slow', turns: 2 },
        { id: 'blind', turns: 2 },
      ],
    },
  });
  const stalemateTurns = core.data.rules.stalemate.turns;
  const quietState = { ...markerState, turnNumber: 25, lastActivityTurn: 25 - 1 - (stalemateTurns - 10) };
  return {
    unlock: {
      roster: unlockRoster,
      unitId: 'kiri',
      targetId: 'e-warrior-1',
      start: { state: unlockState, events: [{ type: 'turnStarted', unitId: 'kiri', turnNumber: 1 }] },
      message: t.roster.unlockToast(t.unitNames.kiri, t.jobs.thief),
    },
    jobs: { roster: jobsRoster, changes, expected },
    spells,
    markers: {
      unitId: 'gord',
      targetId: 'e-warrior-1',
      start: { state: quietState, events: [{ type: 'turnStarted', unitId: 'gord', turnNumber: 25 }] },
      badges: [t.statusShort.protect, t.statusShort.slow, t.statusMore(1)],
      stalemate: t.objectives.stalemateShort(10),
    },
    actions: [
      scene('gord', 'breakWeapon', [t.preview.inflicts(t.statuses.attackDown)]),
      scene('touma', 'doubleStrike', [t.preview.hits(2)]),
      scene('kiri', 'stealGear', [t.preview.stealPercent, t.preview.stealItem(t.equipment[enemySword.id].name)]),
    ],
  };
}

/** 場面で、2体が同じマスにいないことを確かめる */
function checkFree(state, what) {
  const spots = state.units.map((u) => `${u.x},${u.z}`);
  if (new Set(spots).size !== spots.length) throw new Error(`${what}で、ユニットが同じマスにいます`);
}

/** ブラウザの中で実行する: 点 (x, y) とその周り 16px が、すべてキャンバス（ボタンなどに隠れていない）か */
function clearOfButtons([x, y]) {
  const r = 16;
  const offsets = [
    [0, 0],
    [r, 0],
    [-r, 0],
    [0, r],
    [0, -r],
  ];
  return offsets.every(([dx, dy]) => document.elementFromPoint(x + dx, y + dy) instanceof HTMLCanvasElement);
}

function lerp(a, b, t) {
  return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t };
}

function clamp(v, lo, hi) {
  return Math.min(hi, Math.max(lo, v));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
