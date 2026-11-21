/**
 * 物語の場面の画面写真を撮る（初見の検査のため。手順は docs/STORY_REVIEW.md）。
 *
 *   npm run story-shots -- --out=フォルダ [--speed=3] [--scenes=0,1,2] [--from=4]
 *
 * --from=4 で、確認用の機能の「場面を選ぶ」から、その脚本の場面の始めから動かし、--scenes の最後の場面を過ぎたら止める（1場面だけを見る時）。
 *
 * 序章を題名の画面から最後まで、スマホ縦向き（iPhone 13 の大きさ、画素の密度 1）で動かし、
 * 台詞・字幕・操作が出るたびと、動きの途中（決まった間隔。前の写真と同じ画は省く）に画面写真を撮る。
 * 戦闘は、手ほどきの最初の段を撮ってから飛ばし、味方も AI に任せて最後まで戦う（数秒ごとに撮る）。
 *
 * 出力（--out のフォルダ。リポジトリの外を指定し、コミットしない）:
 * - frames/: 1枚ずつの画面写真
 * - sheets/scene-<場面>-<n>.png: 場面ごとに、番号と音の印をつけて8枚ずつ並べた一覧（観客に渡す）
 * - frames.json: 写真ごとの場面・脚本の行（@脚本 の印）・台詞・音（作る側が観客の答えと照らすため。観客には渡さない）
 *
 * 音の印は、聞こえる音を中立の言葉で書く（旋律は「節A」のように記号で呼び、だれの歌かは書かない）。
 */
import { createServer } from 'vite';
import { chromium, devices } from 'playwright';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

const args = Object.fromEntries(
  process.argv.slice(2).map((a) => {
    const m = /^--([^=]+)(?:=(.*))?$/.exec(a);
    return m ? [m[1], m[2] ?? 'true'] : [a, 'true'];
  }),
);
const OUT = args.out;
if (!OUT) {
  console.error('--out=フォルダ を指定してください（リポジトリの外の作業用フォルダ）');
  process.exit(1);
}
const SPEED = Number(args.speed ?? 3);
const SEED = Number(args.seed ?? 20261110);
/** 撮る脚本の場面（省くとすべて。それ以外の場面も動かすが、写真は撮らない） */
const ONLY = args.scenes ? new Set(args.scenes.split(',').map(Number)) : null;
/** 動きの途中を撮る間隔（ミリ秒） */
const BUSY_MS = Number(args.busy ?? 650);
/** 戦闘の途中を撮る間隔（ミリ秒） */
const BATTLE_MS = Number(args.battle ?? 3500);

/** 効果音の id → 聞こえる音の言葉（中立に） */
const EFFECT_WORDS = {
  crack: '石の割れる音',
  // 言葉にしない声（頭上の小さな印と一緒に鳴る。画面の観客にも、鳴っていると分かるように書く）
  voiceShout: '人の叫び声（言葉ではない）',
  voiceCall: '物売りの呼び込みの声（言葉ではない）',
  voiceLaugh: '人の笑い声',
  collapse: '大きな物が崩れる音',
  water: '水の音（強い）',
  waterSoft: '水の音（弱い）',
  waterMid: '水の音（中くらい）',
  windUp: 'ねじを巻く音',
  bell: '鐘のような音',
  door: '戸の開く音',
  gate: '光が開くような音',
  chime: '石が鳴るような澄んだ音',
  break: '何かが折れる音',
  attack: '武器を振る音',
  hit: '当たった音',
  miss: '払われた音',
  magic: '魔法の音',
};
/** 旋律の名前 → 記号（同じ旋律は同じ記号。だれの歌かは書かない） */
const MELODY_SIGNS = { ユナの鼻歌: '節A（終わりまで）', 月を呼ぶ節: '節A（最後の三つの音がない）', 送りの節: '節Aの最初の句' };
const TIMBRE_WORDS = { 鼻歌: '女の人の鼻歌', 石: '石の澄んだ音色', 歌声: '大勢の歌声' };

async function main() {
  const server = await createServer({ logLevel: 'warn', server: { port: 5198, strictPort: false, hmr: false, watch: { ignored: ['**/*'] } } });
  await server.listen();
  const baseUrl = server.resolvedUrls.local[0];
  const text = (await server.ssrLoadModule('/src/ui/text.ts')).TEXT;
  const books = (await server.ssrLoadModule('/src/data/story/books.ts')).books;
  const scenes = books.find((b) => b.id === 'main').chapters[0].scenes;

  fs.mkdirSync(path.join(OUT, 'frames'), { recursive: true });
  fs.mkdirSync(path.join(OUT, 'sheets'), { recursive: true });
  const browser = await chromium.launch();
  const phone = { ...devices['iPhone 13'] };
  delete phone.defaultBrowserType;
  const context = await browser.newContext({ ...phone, deviceScaleFactor: 1 });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));

  const T = (fn, a) => page.evaluate(fn, a);
  const until = (fn, a, timeout = 120000) => page.waitForFunction(fn, a, { timeout, polling: 50 });
  const press = (n) => page.getByRole('button', { name: n, exact: true }).click();
  const status = () => T(() => window.__tactics.dialogue());
  const storyScene = () => T(() => window.__tactics.story().main?.scene ?? -1);

  const frames = [];
  let lastHash = '';
  let lastEffects = {};
  /** 脚本の場面の番号（books の scriptScene） */
  const scriptSceneOf = (i) => (i >= 0 && i < scenes.length ? scenes[i].scriptScene : 99);

  const soundNote = async () => {
    const s = await T(() => ({ melody: window.__tactics.sound().melody, ambient: window.__tactics.sound().ambient, counts: window.__tactics.sound().counts, mark: document.querySelector('.sound-mark:not([hidden])')?.textContent ?? '' }));
    const parts = [];
    if (s.melody) parts.push(`♪ ${TIMBRE_WORDS[s.melody.timbre] ?? s.melody.timbre}・${MELODY_SIGNS[s.melody.melody] ?? s.melody.melody}`);
    else if (s.ambient) parts.push(`♪ 遠くで ${MELODY_SIGNS[s.ambient] ?? s.ambient}（大勢の歌声）`);
    const fresh = Object.keys(s.counts).filter((id) => s.counts[id] > (lastEffects[id] ?? 0));
    lastEffects = { ...s.counts };
    const words = [...new Set(fresh.map((id) => EFFECT_WORDS[id]).filter(Boolean))];
    if (words.length) parts.push(`音: ${words.join('・')}`);
    return parts.join(' ／ ');
  };

  /** 画面写真を撮る。dedupe なら、前の写真と同じ画は省く */
  const shoot = async (kind, dedupe) => {
    const sceneIndex = await storyScene();
    const ss = scriptSceneOf(sceneIndex);
    if (ONLY && !ONLY.has(ss)) return;
    const buf = await page.screenshot();
    const hash = crypto.createHash('md5').update(buf).digest('hex');
    if (dedupe && hash === lastHash) return;
    lastHash = hash;
    const d = await status();
    const n = frames.length + 1;
    const file = `f${String(n).padStart(4, '0')}.png`;
    fs.writeFileSync(path.join(OUT, 'frames', file), buf);
    frames.push({
      n,
      file,
      scriptScene: ss,
      storyScene: sceneIndex,
      kind,
      cue: d?.cue ?? '',
      speaker: d?.speaker ?? null,
      text: d?.waiting === 'line' ? d.text : '',
      placard: d?.placard ?? '',
      sound: await soundNote(),
    });
  };

  const tapLine = async () => {
    const before = await status();
    const sel = before.inscription ? '.dialogue-inscription' : before.caption ? '.dialogue-caption' : '.dialogue-body';
    // 時間で進む物の文字は、ひとりでに進むことがある
    for (let i = 0; i < 6; i++) {
      const d = await status();
      if (!d || d.index !== before.index) return;
      await page.waitForTimeout(40);
    }
    await page.locator(sel).click().catch(() => {});
    await until((i) => {
      const d = window.__tactics.dialogue();
      return !d || d.index !== i;
    }, before.index);
  };

  const listenCenter = async () => {
    const box = await page.locator('.listen-button').boundingBox();
    return { x: box.x + box.width / 2, y: box.y + box.height / 2 };
  };

  /** 会話（会話の場面・戦闘中の台本）を1歩進める。進めたら true */
  const stepDialogue = async (d) => {
    if (d.waiting === 'title') {
      await shoot('章の題');
      await page.waitForTimeout(700);
      await page.locator('.chapter-title-card').click().catch(() => {});
      await until(() => window.__tactics.dialogue()?.waiting !== 'title');
      return true;
    }
    if (d.waiting === 'line') {
      await page.waitForTimeout(250);
      await shoot(d.caption ? '字幕' : d.inscription ? '物の文字' : '台詞');
      await tapLine();
      return true;
    }
    if (d.waiting === 'walk') {
      if (!d.walkNext) return false;
      await until(() => window.__tactics.camera().idle);
      await shoot('操作（歩かせる）', true);
      const p = await T((c) => window.__tactics.sceneTileScreen(c.x, c.z), d.walkNext);
      await page.mouse.click(p.x, p.y);
      await until((c) => {
        const s = window.__tactics.dialogue();
        return !s || s.waiting !== 'walk' || !s.walkNext || s.walkNext.x !== c.x || s.walkNext.z !== c.z;
      }, d.walkNext);
      return true;
    }
    if (d.waiting === 'tap') {
      await until(() => window.__tactics.camera().idle);
      await page.waitForTimeout(500);
      await shoot('操作（物をタップ）');
      const p = await T((c) => window.__tactics.sceneTileScreen(c.x, c.z), d.tapTarget);
      await page.mouse.click(p.x, p.y);
      await until(() => window.__tactics.dialogue()?.waiting !== 'tap');
      return true;
    }
    if (d.waiting === 'listen') {
      await page.waitForTimeout(1500);
      await shoot('操作（押し続ける）');
      const c = await listenCenter();
      await page.mouse.move(c.x, c.y);
      await page.mouse.down();
      for (let guard = 0; guard < 400; guard++) {
        const s = await status();
        if (!s || s.waiting !== 'listen') break;
        await shoot('押し続けている間', true);
        await page.waitForTimeout(BUSY_MS);
      }
      await page.mouse.up();
      return true;
    }
    return false;
  };

  let battleShotAt = 0;
  let deployDone = new Set();
  const runBattle = async () => {
    const mode = await T(() => window.__tactics.mode());
    const sceneIndex = await storyScene();
    if (mode === 'deploy' && !deployDone.has(sceneIndex)) {
      deployDone.add(sceneIndex);
      await page.waitForTimeout(600);
      await shoot('出撃前（勝利条件）');
      await press(text.objectives.close).catch(() => {});
      await page.waitForTimeout(300);
      await shoot('出撃前の配置');
      await press(text.deploy.start);
      await until(() => window.__tactics.screen() === 'battle' && window.__tactics.state() !== null);
      return;
    }
    const tut = await T(() => window.__tactics.tutorial());
    if (tut?.step && !tut.story) {
      await page.waitForTimeout(400);
      await shoot('手ほどき');
      await press(text.tutorial.skip).catch(() => {});
      await page.waitForTimeout(200);
    }
    await T(() => window.__tactics.setAutoPlayer(true));
    if (Date.now() - battleShotAt > BATTLE_MS) {
      battleShotAt = Date.now();
      await shoot('戦闘', true);
    }
  };

  await page.goto(`${baseUrl}?seed=${SEED}&speed=${SPEED}`);
  await until(() => window.__tactics?.screen() === 'title');
  /** --from: 脚本の場面の番号から始める（確認用の機能の「場面を選ぶ」）。--scenes の最後を過ぎたら止める */
  const FROM = args.from !== undefined ? Number(args.from) : null;
  const LAST = ONLY ? Math.max(...ONLY) : null;
  if (FROM !== null) {
    await press(text.settings.open);
    await press(text.settings.checkOff);
    await press(text.settings.close);
    await press(text.title.story);
    await until(() => window.__tactics.screen() === 'story-menu');
    await press(text.check.sceneSelect);
    await until(() => window.__tactics.screen() === 'scene-select');
    const i = scenes.findIndex((s) => s.scriptScene === FROM);
    const book = books.find((b) => b.id === 'main');
    const label = text.story.sceneLabel(text.story.chapters[book.chapters[0].id], scenes[i].scriptScene, text.story.scenes[scenes[i].id]);
    await page.getByRole('button', { name: label, exact: true }).click();
  } else await press(text.title.story);
  let busyShotAt = 0;
  let logAt = 0;
  const started = Date.now();
  for (let guard = 0; guard < 200000; guard++) {
    const screen = await T(() => window.__tactics.screen());
    if (screen === 'story-end') break;
    if (FROM !== null && LAST !== null && scriptSceneOf(await storyScene()) > LAST) break;
    if (Date.now() - started > 40 * 60 * 1000) throw new Error('時間がかかりすぎています');
    const d = await status();
    if (args.debug && Date.now() - logAt > 5000) {
      logAt = Date.now();
      console.log(screen, JSON.stringify(d && { w: d.waiting, cue: d.cue, i: d.index, t: d.text }), await T(() => window.__tactics.mode()));
    }
    if (d && d.waiting !== 'none' && d.waiting !== 'busy' && d.waiting !== 'hold') {
      if (await stepDialogue(d)) continue;
    }
    if ((screen === 'battle' || screen === 'deploy') && !d) {
      await runBattle();
      await page.waitForTimeout(150);
      continue;
    }
    if (screen === 'recap') {
      await press(text.story.recapContinue).catch(() => {});
      continue;
    }
    if (d && Date.now() - busyShotAt > BUSY_MS) {
      busyShotAt = Date.now();
      await shoot('動き', true);
    }
    await page.waitForTimeout(60);
  }
  console.log(`画面写真 ${frames.length} 枚（${Math.round((Date.now() - started) / 1000)}秒）`);
  fs.writeFileSync(path.join(OUT, 'frames.json'), JSON.stringify(frames, null, 1));

  // ---- 場面ごとの一覧（8枚ずつ。番号と音の印をつける） ----
  const sheet = await browser.newPage({ viewport: { width: 1240, height: 800 }, deviceScaleFactor: 1 });
  const byScene = new Map();
  for (const f of frames) {
    if (!byScene.has(f.scriptScene)) byScene.set(f.scriptScene, []);
    byScene.get(f.scriptScene).push(f);
  }
  const esc = (s) => s.replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' })[c]);
  const sheets = [];
  for (const [ss, list] of byScene) {
    for (let k = 0; k * 8 < list.length; k++) {
      const part = list.slice(k * 8, k * 8 + 8);
      const cells = part
        .map((f) => {
          const b64 = fs.readFileSync(path.join(OUT, 'frames', f.file)).toString('base64');
          return `<figure><div class="no">${f.n}</div><img src="data:image/png;base64,${b64}"><figcaption>${esc(f.sound || '（音の印なし）')}</figcaption></figure>`;
        })
        .join('');
      await sheet.setContent(
        `<html><head><style>body{margin:0;background:#222;color:#eee;font:13px sans-serif}main{display:grid;grid-template-columns:repeat(4,296px);gap:8px;padding:8px}
figure{margin:0;position:relative}img{width:296px;display:block}figcaption{min-height:34px;padding:3px 2px;color:#ffd98a}
.no{position:absolute;left:0;top:0;background:#c00;color:#fff;font-weight:bold;padding:2px 7px;font-size:16px}</style></head><body><main>${cells}</main></body></html>`,
      );
      const file = `scene-${ss}-${k + 1}.png`;
      await sheet.screenshot({ path: path.join(OUT, 'sheets', file), fullPage: true });
      sheets.push(file);
    }
  }
  console.log(`一覧 ${sheets.length} 枚: ${path.join(OUT, 'sheets')}`);
  // 観客への依頼文（人物像の {PERSONA} は、観客ごとに書き換える。docs/STORY_REVIEW.md）
  const list = sheets.map((f) => path.resolve(OUT, 'sheets', f)).join('\n');
  const template = fs.readFileSync(new URL('./story-review-prompt.md', import.meta.url), 'utf8');
  fs.writeFileSync(path.join(OUT, 'audience-prompt.md'), template.replace('{LIST}', list));
  console.log(`観客への依頼文: ${path.join(OUT, 'audience-prompt.md')}`);
  if (errors.length) console.log(`ページのエラー: ${errors.join(' / ')}`);
  await browser.close();
  await server.close();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
