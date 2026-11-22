/**
 * 人形の工房: 髪の案（A・B・C）を横に並べた写真を撮る（scripts/kaykit-workshop.html を開発用サーバーで開いて撮る）。
 *
 *   node scripts/kaykit-workshop.mjs --out=フォルダ --round=往復の番号 [--who=touma,yuna]
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
