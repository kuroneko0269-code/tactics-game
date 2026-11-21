/**
 * 描画の重さを測る（序章の場面4。見た目の見本の PR で、変更の前後を同じ条件で比べるために作った）。
 *
 *   node scripts/render-perf.mjs [--root=別の作業フォルダ] [--seconds=5] [--dpr=2]
 *
 * --root に、比べたい版のリポジトリの写し（git worktree）を渡すと、その版の画面を測る（node_modules は今の物を使ってよい）。
 * スマホ縦向き（iPhone 13 の大きさ・画素の密度 --dpr）で、「場面を選ぶ」から場面4を始め、
 * 夕食（「おかえり」の台詞の時）と夜（ユナの部屋の最初の台詞の時）で、--seconds 秒ずつ次を数える:
 * - 1こまあたりの描く回数（WebGL の draw の呼び出し。影の計算の分も含む）と三角形の数
 * - 1こまの処理の時間（画面を描く処理にかかった時間の平均）と、1秒あたりのこまの数
 * ソフトウェアの描画（この環境のブラウザ）で測るので、実機の数字そのものではない。版どうしの比べ合いに使う。
 */
import { createServer } from 'vite';
import { chromium, devices } from 'playwright';
import path from 'node:path';

const args = Object.fromEntries(
  process.argv.slice(2).map((a) => {
    const m = /^--([^=]+)(?:=(.*))?$/.exec(a);
    return m ? [m[1], m[2] ?? 'true'] : [a, 'true'];
  }),
);
const ROOT = path.resolve(args.root ?? '.');
const SECONDS = Number(args.seconds ?? 5);
const DPR = Number(args.dpr ?? 2);
/** 測る所: 脚本の行の印 */
const POINTS = [
  { cue: '4-5', name: '夕食（おかえり）' },
  { cue: '4-16', name: '夜（ユナの部屋）' },
];

/** ページの中で、WebGL の描く回数と三角形を数える（顔の丸の小さな canvas は数えない） */
function hookWebGL() {
  const stats = { calls: 0, triangles: 0, frames: 0, frameMs: 0 };
  window.__perf = stats;
  const count = (mode, n, inst = 1) => {
    stats.calls++;
    if (mode === 4) stats.triangles += (n / 3) * inst;
  };
  for (const proto of [WebGLRenderingContext.prototype, WebGL2RenderingContext.prototype]) {
    const de = proto.drawElements;
    const da = proto.drawArrays;
    proto.drawElements = function (mode, n, type, off) {
      if (!this.canvas.classList?.contains('portrait-canvas')) count(mode, n);
      return de.call(this, mode, n, type, off);
    };
    proto.drawArrays = function (mode, first, n) {
      if (!this.canvas.classList?.contains('portrait-canvas')) count(mode, n);
      return da.call(this, mode, first, n);
    };
    if (proto.drawElementsInstanced) {
      const dei = proto.drawElementsInstanced;
      proto.drawElementsInstanced = function (mode, n, type, off, inst) {
        count(mode, n, inst);
        return dei.call(this, mode, n, type, off, inst);
      };
    }
  }
  const raf = window.requestAnimationFrame.bind(window);
  window.requestAnimationFrame = (cb) =>
    raf((t) => {
      const s = performance.now();
      cb(t);
      stats.frameMs += performance.now() - s;
      stats.frames++;
    });
}

async function main() {
  const server = await createServer({ root: ROOT, configFile: path.join(ROOT, 'vite.config.ts'), logLevel: 'warn', server: { port: 5231, strictPort: false, hmr: false, fs: { allow: [ROOT, path.resolve('node_modules')] }, watch: { ignored: ['**/*'] } } });
  await server.listen();
  const baseUrl = server.resolvedUrls.local[0];
  const text = (await server.ssrLoadModule('/src/ui/text.ts')).TEXT;
  const books = (await server.ssrLoadModule('/src/data/story/books.ts')).books;
  const book = books.find((b) => b.id === 'main');
  const scenes = book.chapters[0].scenes;
  const scene4 = scenes.find((s) => s.scriptScene === 4);

  const browser = await chromium.launch();
  const phone = { ...devices['iPhone 13'] };
  delete phone.defaultBrowserType;
  const context = await browser.newContext({ ...phone, deviceScaleFactor: DPR });
  await context.addInitScript(hookWebGL);
  const page = await context.newPage();
  const T = (fn, a) => page.evaluate(fn, a);
  const until = (fn, a, timeout = 120000) => page.waitForFunction(fn, a, { timeout, polling: 50 });
  const press = (n) => page.getByRole('button', { name: n, exact: true }).click();

  await page.goto(`${baseUrl}?seed=1`);
  await until(() => window.__tactics?.screen() === 'title');
  await press(text.settings.open);
  await press(text.settings.checkOff);
  await press(text.settings.close);
  await press(text.title.story);
  await until(() => window.__tactics.screen() === 'story-menu');
  await press(text.check.sceneSelect);
  await until(() => window.__tactics.screen() === 'scene-select');
  await page.getByRole('button', { name: text.story.sceneLabel(text.story.chapters[book.chapters[0].id], 4, text.story.scenes[scene4.id]), exact: true }).click();

  const results = [];
  for (const point of POINTS) {
    // その行の台詞が出るまで、台詞を押して進める
    for (let guard = 0; guard < 400; guard++) {
      const d = await T(() => window.__tactics.dialogue());
      if (d?.waiting === 'line' && d.cue === point.cue) break;
      if (d?.waiting === 'line') {
        const sel = d.inscription ? '.dialogue-inscription' : d.caption ? '.dialogue-caption' : '.dialogue-body';
        await page.locator(sel).click().catch(() => {});
        await until((i) => window.__tactics.dialogue()?.index !== i, d.index).catch(() => {});
      } else await page.waitForTimeout(100);
    }
    await page.waitForTimeout(1500);
    await T(() => Object.assign(window.__perf, { calls: 0, triangles: 0, frames: 0, frameMs: 0 }));
    await page.waitForTimeout(SECONDS * 1000);
    const s = await T(() => ({ ...window.__perf }));
    results.push({
      所: point.name,
      '描く回数/こま': Math.round(s.calls / s.frames),
      '三角形/こま': Math.round(s.triangles / s.frames),
      'こまの処理(ms)': Number((s.frameMs / s.frames).toFixed(1)),
      'こま/秒': Number((s.frames / SECONDS).toFixed(1)),
    });
  }
  console.log(`版: ${ROOT}（画素の密度 ${DPR}、${SECONDS} 秒ずつ）`);
  console.table(results);
  console.log(JSON.stringify(results));
  await browser.close();
  await server.close();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
