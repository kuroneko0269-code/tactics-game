/**
 * 人形の見比べの写真（KayKit の人形の試し）: 同じ場面を2つの人形で撮った story-shots の出力を、脚本の行ごとに並べた一覧にする。
 *
 *   npm run story-shots -- --out=作業/kaykit --from=4 --scenes=4
 *   npm run story-shots -- --out=作業/current --from=4 --scenes=4 --puppet=current
 *   node scripts/puppet-compare.mjs --a=作業/kaykit --b=作業/current --out=docs/images/kaykit-compare
 *
 * 写真は、脚本の行（@脚本 の印）と写真の種類（動き・台詞・字幕）と、その行の中の何枚目かで組にする（動きの途中の写真は、
 * 撮る時刻が少しずれるので、同じ行の同じ順番の写真を組にする）。組にならなかった写真は省く。
 * 出来るもの: compare-1.jpg … （1枚に4組。左が --a、右が --b）
 */
import { chromium } from 'playwright';
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const args = Object.fromEntries(process.argv.slice(2).map((a) => a.replace(/^--/, '').split('=')));
if (!args.a || !args.b || !args.out) {
  console.error('使い方: node scripts/puppet-compare.mjs --a=フォルダ --b=フォルダ --out=フォルダ [--la=KayKit] [--lb=今の人形] [--per=4]');
  process.exit(1);
}
const labelA = args.la ?? 'KayKit';
const labelB = args.lb ?? '今の人形';
const PER = Number(args.per ?? 4);
const read = (dir) => JSON.parse(fs.readFileSync(path.join(dir, 'frames.json'), 'utf8'));
const framesA = read(args.a);
const framesB = read(args.b);
const keyed = (frames) => {
  const seen = new Map();
  return frames.map((f) => {
    const k = `${f.cue}|${f.kind}`;
    const i = seen.get(k) ?? 0;
    seen.set(k, i + 1);
    return { ...f, key: `${k}|${i}` };
  });
};
const byKey = new Map(keyed(framesB).map((f) => [f.key, f]));
const pairs = keyed(framesA)
  .filter((f) => byKey.has(f.key))
  .map((f) => ({ a: f, b: byKey.get(f.key) }));

fs.mkdirSync(args.out, { recursive: true });
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1600, height: 900 }, deviceScaleFactor: 1 });
const img = (dir, f) => pathToFileURL(path.resolve(dir, 'frames', f.file)).href;
const esc = (s) => String(s).replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' })[c]);
let sheet = 0;
for (let i = 0; i < pairs.length; i += PER) {
  sheet++;
  const group = pairs.slice(i, i + PER);
  const cells = group
    .map(
      ({ a, b }, j) => `<figure><figcaption>${i + j + 1}. 脚本 ${esc(a.cue || '始め')}・${esc(a.kind)}${a.text ? `「${esc(a.text.slice(0, 14))}${a.text.length > 14 ? '…' : ''}」` : ''}</figcaption>
<div class="pair"><div><img src="${img(args.a, a)}"><span>${esc(labelA)}</span></div><div><img src="${img(args.b, b)}"><span>${esc(labelB)}</span></div></div></figure>`,
    )
    .join('');
  const html = path.join(args.out, '.compare.html');
  fs.writeFileSync(
    html,
    `<!doctype html><html><head><meta charset="utf-8"><style>
body{margin:0;background:#1b1b20;color:#e8e2d0;font:15px sans-serif}
main{display:grid;grid-template-columns:repeat(${PER},1fr);gap:10px;padding:10px;width:${PER * 395}px}
figure{margin:0}figcaption{height:38px;overflow:hidden;line-height:1.3}
.pair{display:flex;gap:4px}.pair div{position:relative}.pair img{width:192px;display:block}
.pair span{position:absolute;left:4px;top:4px;background:#000a;padding:2px 6px;border-radius:4px;font-size:13px}
</style></head><body><main>${cells}</main></body></html>`,
  );
  // 写真を file:// で読むため、一覧の HTML もファイルにして開く
  await page.goto(pathToFileURL(path.resolve(html)).href);
  fs.rmSync(html);
  await page.waitForFunction(() => [...document.images].every((im) => im.complete));
  const main = await page.$('main');
  await main.screenshot({ path: path.join(args.out, `compare-${sheet}.jpg`), type: 'jpeg', quality: 78 });
}
await browser.close();
console.log(`${pairs.length} 組（${framesA.length} 枚と ${framesB.length} 枚から）→ ${sheet} 枚: ${args.out}`);
