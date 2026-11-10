// 自動プレイによる画面の確認（npm run autoplay）。
//
// 実際のブラウザ（Chromium）で、画面のマスやユニット、ボタンをタップして1戦を最後まで進め、
// 勝敗と手番数が「core だけで計算した結果」と一致するかを確かめる。
// 画面の不具合（タップしたのに違うマスが選ばれる、ボタンが押せない、など）を見つけるためのもの。
//
// - 味方の行動は、敵と同じ AI（src/core/ai.ts）で決め、それを画面のタップで入力する。
//   そのため、core だけで AI 同士を戦わせた結果（runAutoBattle）と、最終状態が完全に一致するはず。
// - 魔法は、メニューから選んで射程のマスやユニットをタップし、「ユニットを狙う」「マスを狙う」を選んで確定する。
//   味方が最初にユニットを狙う魔法を使う時だけ、わざと「マスを狙う」に変える（両方の操作を確かめるため。
//   core だけの計算でも同じ動かし方をするので、結果は一致するはず）。
// - 1戦の後、詠唱中に自分の手番が来た場面を用意して、詠唱の中断（確認で「やめない」→ もう一度 →「詠唱をやめる」）を確かめる。
//   AI 同士の対戦では、詠唱中に自分の手番が来ることがほとんどないため。
// - 途中で、拡大・縮小（ピンチ・ボタン・ホイール）、視点の移動（ドラッグ）、カメラの高さ、回転、視点を戻す、を行う。
//   それらの操作の後でも、狙ったマスやユニットを正しくタップできることを確かめる。
//   また、ドラッグやピンチの終わりに、マスやユニットが誤って選ばれないことも確かめる。
//
// 使い方:
//   npm run autoplay                          スマホ縦向きと横向きで実行
//   npm run autoplay -- --viewports=portrait,landscape,pc
//   npm run autoplay -- --seed=123 --screenshots=autoplay-output --headed
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
const VIEWPORTS = (args.viewports ?? 'portrait,landscape').split(',');
const SCREENSHOT_DIR = args.screenshots;
const HEADED = args.headed === 'true';
/** 失敗した時の画面写真の置き場所 */
const FAILURE_DIR = 'autoplay-output';
/** 1つの画面サイズで1戦にかけてよい時間の上限 */
const BATTLE_TIMEOUT_MS = Number(args.timeout ?? 12 * 60 * 1000);

const VIEWPORT_OPTIONS = {
  portrait: { label: 'スマホ縦向き', ...devices['iPhone 13'] },
  landscape: { label: 'スマホ横向き', ...devices['iPhone 13 landscape'] },
  pc: { label: 'PC', viewport: { width: 1280, height: 800 } },
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
  const data = {
    battle: (await server.ssrLoadModule('/src/data/battles/firstBattle.ts')).firstBattle,
    jobs: (await server.ssrLoadModule('/src/data/jobs.ts')).jobs,
    spells: (await server.ssrLoadModule('/src/data/spells.ts')).spells,
    rules: (await server.ssrLoadModule('/src/data/battleRules.ts')).battleRules,
    ai: (await server.ssrLoadModule('/src/data/aiConfig.ts')).aiConfig,
    text: (await server.ssrLoadModule('/src/ui/text.ts')).TEXT,
  };
  core.data = data;
  const startState = core.battle.startBattle(data.battle, data.jobs, data.rules, SEED, data.spells).state;
  // core だけで、画面と同じ動かし方（playerPolicy）で決着まで進める
  const policy = playerPolicy(core);
  let expected = startState;
  let expectedCasts = 0;
  while (expected.turn && expected.turnNumber <= 1000) {
    const unit = expected.units.find((u) => u.id === expected.turn.unitId);
    const action = unit.team === 'player' ? policy(expected) : core.ai.decideNextAction(expected, data.ai);
    if (action.type === 'cast' && unit.team === 'player') expectedCasts++;
    expected = core.battle.applyAction(expected, action).state;
  }
  console.log(
    `シード値 ${SEED}: core だけの計算では ${expected.winner === 'player' ? '勝利' : '敗北'}（${expected.turnNumber}手番、味方の魔法 ${expectedCasts}回）`,
  );
  check(expectedCasts > 0, `シード値 ${SEED} では味方が魔法を使いません。別のシード値を選んでください`);

  const browser = await chromium.launch({
    headless: !HEADED,
    args: ['--enable-unsafe-swiftshader', '--use-angle=swiftshader', '--ignore-gpu-blocklist'],
  });
  const started = Date.now();
  const results = await Promise.all(
    VIEWPORTS.map((name) =>
      playOneBattle(browser, baseUrl, name, core, expected).then(
        (r) => ({ name, ok: true, ...r }),
        (e) => ({ name, ok: false, error: e }),
      ),
    ),
  );
  await browser.close();
  await server.close();

  console.log('');
  let failed = false;
  for (const r of results) {
    const label = VIEWPORT_OPTIONS[r.name]?.label ?? r.name;
    if (r.ok) {
      console.log(
        `✔ ${label}: ${r.winner === 'player' ? '勝利' : '敗北'}（${r.turns}手番、味方の手番 ${r.playerTurns}、` +
          `魔法の指定 ${r.casts}回（ユニット狙い ${r.unitCasts}・マス狙い ${r.tileCasts}）、詠唱の中断 ${r.interrupts}回、` +
          `カメラ操作 ${r.cameraOps}回、タップ ${r.taps}回、${r.seconds}秒）`,
      );
    } else {
      failed = true;
      console.log(`✘ ${label}: ${r.error instanceof CheckError ? r.error.message : r.error?.stack ?? r.error}`);
    }
  }
  console.log(`合計 ${Math.round((Date.now() - started) / 1000)}秒`);
  if (failed) process.exit(1);
}

async function playOneBattle(browser, baseUrl, name, core, expected) {
  const holder = {};
  try {
    return await playOneBattleInner(browser, baseUrl, name, core, expected, holder);
  } catch (e) {
    // 失敗した時の画面を残す（GitHub Actions では成果物としてダウンロードできる）
    if (holder.page) {
      fs.mkdirSync(FAILURE_DIR, { recursive: true });
      await holder.page.screenshot({ path: path.join(FAILURE_DIR, `${name}-failure.png`) }).catch(() => {});
    }
    throw e;
  }
}

async function playOneBattleInner(browser, baseUrl, name, core, expected, holder) {
  const options = VIEWPORT_OPTIONS[name];
  check(options, `画面サイズ ${name} は未定義です（portrait / landscape / pc）`);
  const { label, ...contextOptions } = options;
  // スマホの端末設定は WebKit 用なので、Chromium で開くために browserName 関係を外す
  delete contextOptions.defaultBrowserType;
  // 画面写真を撮らない時は、描画を軽くするため画素の密度を 1 にする（ソフトウェア描画で遅いため）
  if (!SCREENSHOT_DIR) contextOptions.deviceScaleFactor = 1;
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
  const deadline = started + BATTLE_TIMEOUT_MS;
  const stats = { taps: 0, cameraOps: 0, playerTurns: 0, casts: 0, unitCasts: 0, tileCasts: 0, interrupts: 0 };
  const policy = playerPolicy(core);
  const { text } = core.data;
  const INPUT_MODES = [
    'main',
    'targeting',
    'confirm',
    'spellMenu',
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
  await page.goto(`${baseUrl}?seed=${SEED}&speed=${SPEED}`);
  await page.waitForFunction(() => window.__tactics !== undefined, null, { timeout: 30000 });

  // ---- 画面から読むもの ----
  const T = (fn, arg) => page.evaluate(fn, arg);
  const getState = () => T(() => window.__tactics.state());
  const getMode = () => T(() => window.__tactics.modeDetail());
  const getCamera = () => T(() => window.__tactics.camera());
  const viewport = page.viewportSize();
  const center = { x: viewport.width / 2, y: viewport.height / 2 };

  const waitFor = async (description, fn, arg) => {
    const timeout = Math.max(1000, Math.min(60000, deadline - Date.now()));
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
      // 中央からドラッグして、狙う点を中央へ引き寄せる（大きすぎる移動は数回に分ける）
      const dx = clamp(center.x - p.x, -viewport.width * 0.4, viewport.width * 0.4);
      const dy = clamp(center.y - p.y, -viewport.height * 0.3, viewport.height * 0.3);
      await drag({ x: center.x - dx / 2, y: center.y - dy / 2 }, { x: center.x + dx / 2, y: center.y + dy / 2 });
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
  const visiblePointOf = (x, z, unitId) =>
    T(
      ([x, z, unitId]) => {
        const t = window.__tactics;
        const points = [...(unitId ? [t.unitScreen(unitId)] : []), ...t.tilePoints(x, z)];
        // 隣のマスとの境目ぎりぎりの点は避ける（周り 2px でも同じマスが一番手前に写っている点だけを使う）
        const firstAt = (px, py) => t.pickAt(px, py).find((c) => c !== null);
        const offsets = [
          [0, 0],
          [2, 0],
          [-2, 0],
          [0, 2],
          [0, -2],
        ];
        return points.find((p) => {
          if (!window.__clearOfButtons([p.x, p.y])) return false;
          return offsets.every(([dx, dy]) => {
            const first = firstAt(p.x + dx, p.y + dy);
            return first !== undefined && first.x === x && first.z === z;
          });
        });
      },
      [x, z, unitId],
    );

  /** 狙うマスを画面に入れ、見えている部分を探す。完全に隠れていれば、人がするようにカメラを回す */
  const aimAt = async (x, z, unitId, what) => {
    for (let turn = 0; turn < 4; turn++) {
      await bringIntoView(() => T(([x, z]) => window.__tactics.tileScreen(x, z), [x, z]), what);
      const p = await visiblePointOf(x, z, unitId);
      if (p) return p;
      const before = await snapshot();
      await pressCameraButton('camera-rotate-right');
      stats.cameraOps++;
      await waitCameraIdle();
      check((await snapshot()) === before, '回転ボタンで、マスかユニットが誤って選ばれました');
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
  const tapArrow = async (dir) => {
    const p = await bringIntoView(() => T((dir) => window.__tactics.arrowScreen(dir), dir), `向きの矢印 ${dir}`);
    await tapAt(p);
  };

  // ---- 魔法の指定 ----
  /** メニューから魔法を選び、狙い先をタップして（必要ならユニットかマスかを選んで）確定する */
  const castSpell = async (action, unit) => {
    const spellLabel = text.spells[action.spellId];
    await pressButton('魔法');
    await waitFor('使う魔法を選ぶ', () => window.__tactics.mode() === 'spellMenu');
    // MP が足りない魔法のボタンは押せないこと
    for (const sp of unit.spells) {
      const disabled = await page.getByRole('button', { name: text.spells[sp.id], exact: true }).isDisabled();
      check(disabled === unit.mp < sp.mpCost, `魔法「${text.spells[sp.id]}」のボタンの押せる・押せないが MP と合いません`);
    }
    await pressButton(spellLabel);
    await waitFor('狙う場所を選ぶ', () => window.__tactics.mode() === 'spellTarget');
    const state = await getState();
    const center =
      action.target.kind === 'tile' ? action.target : state.units.find((u) => u.id === action.target.unitId);
    const there = state.units.find((u) => u.hp > 0 && u.x === center.x && u.z === center.z);
    if (there) {
      await tapUnit(there.id);
      const chosen = await getMode();
      check(
        chosen.kind === 'spellTargetKind' && chosen.unitId === there.id,
        `ユニット ${there.id} のマスをタップしたのに、選ばれたのは ${JSON.stringify(chosen)}`,
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
      const after = await tileProbe();
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

  // ---- 1戦を進める ----
  await waitForInput();
  const initialCamera = await getCamera();
  await screenshot('00-start');
  let lastTurn = -1;
  for (;;) {
    check(Date.now() < deadline, `時間切れ（${BATTLE_TIMEOUT_MS / 1000}秒）`);
    check(pageErrors.length === 0, `ページでエラー: ${pageErrors.map((e) => e.message).join(' / ')}`);
    await waitForInput();
    const mode = await getMode();
    if (mode.kind === 'ended') break;
    let state = await getState();
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
      const tapPoint = await aimAt(action.x, action.z, undefined, `マス (${action.x}, ${action.z})`);
      const picked = await T(([x, y]) => window.__tactics.pickAt(x, y), [tapPoint.x, tapPoint.y]);
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
      if (mode.kind === 'main') await pressButton('攻撃');
      await waitFor('攻撃対象を選ぶ', () => window.__tactics.mode() === 'targeting');
      await tapUnit(action.targetId);
      const chosen = await getMode();
      check(
        chosen.kind === 'confirm' && chosen.targetId === action.targetId,
        `ユニット ${action.targetId} をタップしたのに、選ばれたのは ${JSON.stringify(chosen)}`,
      );
      await pressButton('確定');
      await waitFor('攻撃の後', () => window.__tactics.mode() !== 'busy' && window.__tactics.mode() !== 'confirm');
    } else if (action.type === 'cast') {
      check(mode.kind === 'main', `魔法の前のモードが main ではありません（${mode.kind}）`);
      await castSpell(action, unit);
    } else if (action.type === 'endTurn') {
      if (mode.kind === 'main') await pressButton('待機');
      await waitFor('向きを選ぶ', () => window.__tactics.mode() === 'facing');
      if ((await getMode()).facing !== action.facing) {
        await tapArrow(action.facing);
        const chosen = await getMode();
        check(
          chosen.kind === 'facing' && chosen.facing === action.facing,
          `矢印 ${action.facing} をタップしたのに、選ばれた向きは ${JSON.stringify(chosen)}`,
        );
      }
      const turn = state.turnNumber;
      await pressButton('決定');
      await waitFor('次の手番へ', (turn) => window.__tactics.state().turnNumber !== turn || window.__tactics.mode() === 'ended', turn);
    } else {
      throw new CheckError(`想定していない行動: ${JSON.stringify(action)}`);
    }
  }

  // ---- 結果の照合 ----
  const final = await getState();
  await screenshot('99-result');
  check(final.winner === expected.winner, `勝敗が core の計算と違います（画面 ${final.winner} / core ${expected.winner}）`);
  check(final.turnNumber === expected.turnNumber, `手番数が core の計算と違います（画面 ${final.turnNumber} / core ${expected.turnNumber}）`);
  check(JSON.stringify(final) === JSON.stringify(expected), '最終状態（HP・位置・乱数の状態など）が core の計算と違います');
  const resultText = await page.locator('.result-title').textContent();
  check(resultText === (final.winner === 'player' ? '勝利' : '敗北'), `決着の表示が違います（${resultText}）`);

  check(stats.casts > 0, '味方の魔法を一度も指定していません');
  check(stats.unitCasts > 0 && stats.tileCasts > 0, `ユニット狙いとマス狙いの両方を確かめられませんでした（${stats.unitCasts} / ${stats.tileCasts}）`);

  // 「もう一度」で新しい戦闘が始まること
  await pressButton('もう一度');
  await waitFor('新しい戦闘', () => window.__tactics.state().turnNumber <= 2 && window.__tactics.state().winner === null);
  check(pageErrors.length === 0, `ページでエラー: ${pageErrors.map((e) => e.message).join(' / ')}`);

  // ---- 詠唱の中断 ----
  // 詠唱中の味方の魔術師に手番が来た場面を用意して、移動しようとすると確認が出ること、
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
  await pressButton('決定');
  await waitFor('次の手番へ', () => window.__tactics.state().turnNumber > 1);
  // 直後に敵の手番が来ると HP は変わりうるので、位置・向き・MP・詠唱だけを比べる
  const drillExpected = drill.finish(facing).units.find((u) => u.id === drill.unitId);
  const drillActual = (await getState()).units.find((u) => u.id === drill.unitId);
  const pick = (u) => JSON.stringify([u.x, u.z, u.facing, u.mp, u.charging, u.ct === 0 ? 0 : 'later']);
  check(pick(drillActual) === pick(drillExpected), `詠唱の中断の後の状態が core の計算と違います（${pick(drillActual)} / ${pick(drillExpected)}）`);
  check(pageErrors.length === 0, `ページでエラー: ${pageErrors.map((e) => e.message).join(' / ')}`);

  await context.close();
  return {
    winner: final.winner,
    turns: final.turnNumber,
    ...stats,
    seconds: Math.round((Date.now() - started) / 1000),
  };
}

/**
 * 味方の動かし方。敵と同じ AI で決めるが、味方が最初にユニットを狙う魔法を使う時だけ、
 * そのユニットの今いるマスを狙う（マス狙い）に変える。画面の操作と core だけの計算で同じものを使う。
 */
function playerPolicy(core) {
  let changed = false;
  return (state) => {
    const action = core.ai.decideNextAction(state, core.data.ai);
    if (changed || action.type !== 'cast' || action.target.kind !== 'unit') return action;
    changed = true;
    const target = state.units.find((u) => u.id === action.target.unitId);
    return { ...action, target: { kind: 'tile', x: target.x, z: target.z } };
  };
}

/**
 * 詠唱の中断を確かめる場面。新しい戦闘の最初の状態から、味方の魔術師が「炎」を詠唱中のまま手番を迎えた状態を作る。
 * finish(facing) は、同じ操作（移動 → 向きを決めて終了）を core だけで行った結果。
 */
function interruptDrill(core) {
  const { battle: setup, jobs, rules, spells } = core.data;
  const base = core.battle.startBattle(setup, jobs, rules, SEED + 1, spells).state;
  const unitId = 'p-mage-1';
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
