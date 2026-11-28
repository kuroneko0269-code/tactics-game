/**
 * 人形の工房: 髪の案（A・B・C）を横に並べた写真を撮る（scripts/kaykit-workshop.html を開発用サーバーで開いて撮る）。
 *
 *   node scripts/kaykit-workshop.mjs --out=フォルダ --round=往復の番号 [--who=touma,yuna]
 *   node scripts/kaykit-workshop.mjs --out=フォルダ --round=往復の番号 --who=gord,kiri --trio
 *     （その2: 人物ごとに正面・斜め前・後ろの全身を1枚、決まった人物と案を横に並べた lineup-<往復>.jpg と白黒の lineup-<往復>-gray.jpg）
 *
 * 出来るもの: <人物>-<往復>.jpg（案ごとに正面・斜め前・横・斜め後ろ・後ろ・見下ろし）と <人物>-<往復>-small.jpg（場面4でスマホに映る大きさの全身）。
 * 案は scripts/kaykit-workshop-variants.js に書く。
 */
import { createServer } from 'vite';
import { chromium } from 'playwright';
import fs from 'node:fs';
import path from 'node:path';

const args = Object.fromEntries(process.argv.slice(2).map((a) => a.replace(/^--/, '').split('=')));
if (!args.out || !args.round) {
  console.error('使い方: node scripts/kaykit-workshop.mjs --out=フォルダ --round=往復の番号 [--who=touma,yuna]');
  process.exit(1);
}
fs.mkdirSync(args.out, { recursive: true });
const server = await createServer({ logLevel: 'warn', server: { port: 5251, strictPort: false, hmr: false, watch: { ignored: ['**/*'] } } });
await server.listen();
const base = server.resolvedUrls.local[0];
const browser = await chromium.launch();
const shoot = async (url, name, sel = '#out', dpr = 1) => {
  const page = await browser.newPage({ viewport: { width: 2400, height: 900 }, deviceScaleFactor: dpr });
  page.on('pageerror', (e) => e.message !== 'lineup done' && console.error(name, e.message));
  await page.goto(`${base}scripts/kaykit-workshop.html?${url}`);
  await page.waitForFunction(() => window.done, null, { timeout: 180000 });
  for (const [s, n] of [[sel, name], ...(url.includes('kind=lineup') ? [['#gray', name.replace('.jpg', '-gray.jpg')]] : [])]) {
    await page.locator(s).screenshot({ path: path.join(args.out, n), type: 'jpeg', quality: 86 });
    console.log(n);
  }
  await page.close();
};
if ('compare' in args) {
  // 絵と比べる（その3）: 人物ごとに、立ち絵と人形（正面・斜め前・後ろ）を並べた写真と、決まった4人の並び（スマホの大きさ）と白黒の版。
  // --blind=yuna,father,... で、名前の代わりに番号を付けた並び（目隠しの当てっこ用）も撮る
  const whos = (args.who ?? 'touma,yuna,father,mother').split(',').filter(Boolean);
  await Promise.all(whos.map((who) => shoot(`who=${who}&round=${args.round}&kind=compare`, `compare-${who}-${args.round}.jpg`)));
  await shoot(`who=&round=${args.round}&kind=lineup&set=${whos.join(',')}`, `lineup-${args.round}.jpg`, '#out', 2);
  if (args.blind) await shoot(`who=&round=${args.round}&kind=lineup&blind=${args.blind}`, `blind-${args.round}.jpg`, '#out', 2);
  await browser.close();
  await server.close();
  process.exit(0);
}
if ('trio' in args) {
  // 3つの向き（正面・斜め前・後ろ）の全身を人物ごとに1枚と、決まった人物との並び（スマホの大きさ）と、その白黒の版
  const whos = (args.who ?? '').split(',').filter(Boolean);
  await Promise.all(whos.map((who) => shoot(`who=${who}&round=${args.round}&kind=trio`, `${who}-${args.round}.jpg`)));
  if (args.frame) await Promise.all(whos.map((who) => shoot(`who=${who}&round=${args.round}&kind=trio&frame=${args.frame}`, `${who}-${args.round}-${args.frame}.jpg`)));
  await shoot(`who=${whos.join(',')}&round=${args.round}&kind=lineup${args.set ? `&set=${args.set}` : ''}`, `lineup-${args.round}.jpg`, '#out', 2);
  await browser.close();
  await server.close();
  process.exit(0);
}
for (const who of (args.who ?? 'touma,yuna').split(',')) {
  for (const kind of ['views', 'small']) {
    const page = await browser.newPage({ viewport: { width: 2400, height: 900 }, deviceScaleFactor: kind === 'small' ? 3 : 1 });
    page.on('pageerror', (e) => console.error(who, kind, e.message));
    await page.goto(`${base}scripts/kaykit-workshop.html?who=${who}&round=${args.round}&kind=${kind}${args.frame ? `&frame=${args.frame}` : ''}`);
    await page.waitForFunction(() => window.done, null, { timeout: 180000 });
    const name = `${who}-${args.round}${kind === 'small' ? '-small' : ''}.jpg`;
    await page.locator('#out').screenshot({ path: path.join(args.out, name), type: 'jpeg', quality: 86 });
    await page.close();
    console.log(name);
  }
}
await browser.close();
await server.close();
