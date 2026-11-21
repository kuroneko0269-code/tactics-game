/**
 * KayKit の人形の試し: 場面4の実際の画面（夕食と夜の光）で、人物の顔を寄せた写真を撮る（目・鼻・髪の確かめ）。
 *
 *   node scripts/kaykit-faces.mjs --out=フォルダ [--root=別の版の写し] [--yh=b] [--puppet=current]
 *
 * スマホ縦向き（画素の密度 4）で「場面を選ぶ」から場面4を始め、夕食（4-13）と夜（4-18）の行で画面を撮り、
 * 映っている人物（トウマ・ユナ・父・母）の頭のまわりを切り抜いて、1枚に並べる（faces-<所>.png）。全体の画（whole-<所>.png）も残す。
 * --yh=b で、ユナの髪を案 B にする（設定の「ユナの髪」。確認用の機能を入にして選ぶ）。
 */
import { createServer } from 'vite';
import { chromium, devices } from 'playwright';
import fs from 'node:fs';
import path from 'node:path';

const args = Object.fromEntries(process.argv.slice(2).map((a) => a.replace(/^--/, '').split('=')));
if (!args.out) {
  console.error('使い方: node scripts/kaykit-faces.mjs --out=フォルダ');
  process.exit(1);
}
fs.mkdirSync(args.out, { recursive: true });
const ROOT = path.resolve(args.root ?? '.');
const DPR = 4;
const POINTS = [
  { cue: '4-13', name: 'dinner' },
  { cue: '4-18', name: 'night' },
];
const PEOPLE = ['トウマ', 'ユナ', '父', '母'];

const server = await createServer({ root: ROOT, configFile: path.join(ROOT, 'vite.config.ts'), logLevel: 'warn', server: { port: 5251, strictPort: false, hmr: false, fs: { allow: [ROOT, path.resolve('node_modules')] }, watch: { ignored: ['**/*'] } } });
await server.listen();
const baseUrl = server.resolvedUrls.local[0];
const text = (await server.ssrLoadModule('/src/ui/text.ts')).TEXT;
const book = (await server.ssrLoadModule('/src/data/story/books.ts')).books.find((b) => b.id === 'main');
const scene4 = book.chapters[0].scenes.find((s) => s.scriptScene === 4);
const browser = await chromium.launch();
const phone = { ...devices['iPhone 13'] };
delete phone.defaultBrowserType;
const context = await browser.newContext({ ...phone, deviceScaleFactor: DPR });
const page = await context.newPage();
const T = (fn, a) => page.evaluate(fn, a);
const until = (fn, a, timeout = 120000) => page.waitForFunction(fn, a, { timeout, polling: 50 });
const press = (n) => page.getByRole('button', { name: n, exact: true }).click();
await page.goto(`${baseUrl}?seed=1`);
await until(() => window.__tactics?.screen() === 'title');
await press(text.settings.open);
await press(text.settings.checkOff);
if (args.puppet) await press(text.settings.choiceLabel(text.settings.puppetKind, text.settings.puppetKinds[args.puppet]));
if (args.yh && text.settings.yunaHairs) await press(text.settings.choiceLabel(text.settings.yunaHair, text.settings.yunaHairs[args.yh]));
await press(text.settings.close);
await press(text.title.story);
await until(() => window.__tactics.screen() === 'story-menu');
await press(text.check.sceneSelect);
await until(() => window.__tactics.screen() === 'scene-select');
await page.getByRole('button', { name: text.story.sceneLabel(text.story.chapters[book.chapters[0].id], 4, text.story.scenes[scene4.id]), exact: true }).click();
for (const point of POINTS) {
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
  const whole = path.join(args.out, `whole-${point.name}.png`);
  await page.screenshot({ path: whole });
  const spots = [];
  for (const name of PEOPLE) {
    const at = await T((n) => window.__tactics.actorScreen(n), name);
    if (at) spots.push({ name, ...at });
  }
  fs.writeFileSync(path.join(args.out, `spots-${point.name}.json`), JSON.stringify(spots));
  console.log(point.name, spots.map((s) => s.name).join(' '));
}
await browser.close();
await server.close();
