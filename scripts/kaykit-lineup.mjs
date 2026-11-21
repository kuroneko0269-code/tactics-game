/**
 * KayKit の人形の試し: 作り分けと動きの確かめの写真を撮る（scripts/kaykit-lineup.html を開発用サーバーで開いて撮る）。
 *
 *   node scripts/kaykit-lineup.mjs --out=フォルダ [--skeletons=骸骨の glb のフォルダ]
 *
 * 出来るもの（どれも jpg）:
 *   views.jpg（4人を正面・横・後ろ）・views-current.jpg（今の人形で同じ並び）・views-plain.jpg（素材そのままの陰影）・
 *   motions-<人物>.jpg（仕草ごとの、動きの途中の姿）・parts.jpg（自作の部品の見本）・skeletons.jpg（--skeletons を渡した時）・
 *   head-<人物>.jpg（頭と肩を5つの向きから）・body-<人物>.jpg（全身を5つの向きから）。--only=head,views のように、撮る物を名前の頭で選べる
 */
import { createServer } from 'vite';
import { chromium } from 'playwright';
import fs from 'node:fs';
import path from 'node:path';

const args = Object.fromEntries(process.argv.slice(2).map((a) => a.replace(/^--/, '').split('=')));
if (!args.out) {
  console.error('使い方: node scripts/kaykit-lineup.mjs --out=フォルダ [--skeletons=フォルダ]');
  process.exit(1);
}
fs.mkdirSync(args.out, { recursive: true });
const allow = [path.resolve('.'), ...(args.skeletons ? [path.resolve(args.skeletons)] : [])];
const server = await createServer({ logLevel: 'warn', server: { port: 5241, strictPort: false, hmr: false, fs: { allow }, watch: { ignored: ['**/*'] } } });
await server.listen();
const base = server.resolvedUrls.local[0];
const browser = await chromium.launch();
const shots = [
  ['views', 'mode=views&w=1500&h=460'],
  ['views-current', 'mode=views&w=1500&h=460&puppet=current'],
  ['views-plain', 'mode=views&w=1500&h=460&shade=plain'],
  ['motions-yuna', 'mode=motions&who=yuna&w=1400&h=440'],
  ['motions-touma', 'mode=motions&who=touma&w=1400&h=440'],
  ['motions-father', 'mode=motions&who=father&w=1400&h=440'],
  ['motions-mother', 'mode=motions&who=mother&w=1400&h=440'],
  ['parts', 'mode=parts&w=1400&h=440'],
  ...['touma', 'yuna', 'father', 'mother'].flatMap((who) => [
    [`head-${who}`, `mode=closeup&who=${who}&w=1500&h=420`],
    [`body-${who}`, `mode=closeup&who=${who}&frame=body&w=1500&h=520`],
  ]),
];
const only = args.only ? args.only.split(',') : null;
for (let i = shots.length - 1; i >= 0; i--) if (only && !only.some((o) => shots[i][0].startsWith(o))) shots.splice(i, 1);
if (args.skeletons) shots.push(['skeletons', `mode=skeleton&w=1000&h=440&dir=/@fs${path.resolve(args.skeletons)}/`]);
for (const [name, query] of shots) {
  const [w, h] = [Number(/w=(\d+)/.exec(query)[1]), Number(/h=(\d+)/.exec(query)[1])];
  const page = await browser.newPage({ viewport: { width: w, height: h } });
  page.on('pageerror', (e) => console.error(name, e.message));
  await page.goto(`${base}scripts/kaykit-lineup.html?${query}`);
  await page.waitForFunction(() => window.done, null, { timeout: 120000 });
  await page.screenshot({ path: path.join(args.out, `${name}.jpg`), type: 'jpeg', quality: 82 });
  await page.close();
  console.log(name);
}
await browser.close();
await server.close();
