/**
 * KayKit の人形の試し: 作り分けと動きの確かめの写真を撮る（scripts/kaykit-lineup.html を開発用サーバーで開いて撮る）。
 *
 *   node scripts/kaykit-lineup.mjs --out=フォルダ [--skeletons=骸骨の glb のフォルダ] [--root=別の版の写し]
 *
 * 出来るもの（どれも jpg）:
 *   views.jpg（4人を正面・横・後ろ）・views-current.jpg（今の人形で同じ並び）・views-plain.jpg（素材そのままの陰影）・
 *   motions-<人物>.jpg（仕草ごとの、動きの途中の姿）・parts.jpg（自作の部品の見本）・skeletons.jpg（--skeletons を渡した時）・
 *   head-<人物>.jpg（頭と肩を5つの向きから）・body-<人物>.jpg（全身を5つの向きから）・face-[dinner-|night-]<人物>.jpg（顔を寄せて正面・斜め・横）・hairs-base.jpg / hairs-new.jpg（髪型の土台と試作）・
 *   gest-bow-touma-<度>.jpg / gest-move-touma-<度>.jpg（トウマの前髪: うつむく仕草と場面4の動きを、水平・22 度・32 度の見下ろしから）・
 *   compare-heads.jpg / compare-small.jpg（トウマと、見比べ用に仮で作ったジン・テオの頭。小さい方はスマホで人物が映る大きさ）。--only=head,views のように、撮る物を名前の頭で選べる
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
const ROOT = path.resolve(args.root ?? '.');
const allow = [ROOT, path.resolve('node_modules'), ...(args.skeletons ? [path.resolve(args.skeletons)] : [])];
const server = await createServer({ root: ROOT, configFile: path.join(ROOT, 'vite.config.ts'), logLevel: 'warn', server: { port: 5241, strictPort: false, hmr: false, fs: { allow }, watch: { ignored: ['**/*'] } } });
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
  ...['touma', 'yuna', 'father', 'mother'].flatMap((who) => [
    [`dinner-${who}`, `mode=closeup&who=${who}&w=1500&h=420&light=dinner`],
    [`night-${who}`, `mode=closeup&who=${who}&w=1500&h=420&light=night`],
  ]),
  // 顔を寄せて（正面・斜め・横）。光なし・夕食・夜
  ...['touma', 'yuna', 'father', 'mother'].flatMap((who) => [
    [`face-${who}`, `mode=face&who=${who}&w=1200&h=520`],
    [`face-dinner-${who}`, `mode=face&who=${who}&w=1200&h=520&light=dinner`],
    [`face-night-${who}`, `mode=face&who=${who}&w=1200&h=520&light=night`],
  ]),
  // 髪型を増やす試作（ゲームには入れない）: 土台の作者の髪3種と、試作
  ['hairs-base', 'mode=hairs&set=base&w=1400&h=600&cy=0.62'],
  ['hairs-new', 'mode=hairs&set=new&w=1800&h=600&cy=0.62'],
  // トウマの前髪: うつむく仕草と場面4の動きを、ゲームのカメラに近い見下ろし（22 度・32 度）と水平から
  ...['0', '22', '32'].flatMap((e) => [
    [`gest-bow-touma-${e}`, `mode=gest&set=bow&who=touma&w=1500&h=420&elev=${e}`],
    [`gest-move-touma-${e}`, `mode=gest&set=move&who=touma&w=1700&h=420&elev=${e}`],
  ]),
  // 見分けの比べ（トウマ・ジン（仮）・テオ（仮））。大きい写真と、スマホで人物が映る大きさに縮めた写真
  ['compare-heads', 'mode=compare&w=1800&h=460&elev=10'],
  ['compare-small', 'mode=compare&by=view&w=420&h=150&elev=26&gap=0.5&cy=0.5'],
];
const only = args.only ? args.only.split(',') : null;
for (let i = shots.length - 1; i >= 0; i--) if (only && !only.some((o) => shots[i][0].startsWith(o))) shots.splice(i, 1);
if (args.skeletons) shots.push(['skeletons', `mode=skeleton&w=1000&h=440&dir=/@fs${path.resolve(args.skeletons)}/`]);
for (const [name, query] of shots) {
  const [w, h] = [Number(/w=(\d+)/.exec(query)[1]), Number(/h=(\d+)/.exec(query)[1])];
  const page = await browser.newPage({ viewport: { width: w, height: h } });
  page.on('pageerror', (e) => console.error(name, e.message));
  // --root で別の版の写しを撮る時も、並べるページは今の版の物を使う（写しの側にページが無い時のため、写しへ置く）
  if (ROOT !== path.resolve('.')) fs.copyFileSync('scripts/kaykit-lineup.html', path.join(ROOT, 'scripts/kaykit-lineup.html'));
  await page.goto(`${base}scripts/kaykit-lineup.html?${query}`);
  await page.waitForFunction(() => window.done, null, { timeout: 120000 });
  await page.screenshot({ path: path.join(args.out, `${name}.jpg`), type: 'jpeg', quality: 82 });
  await page.close();
  console.log(name);
}
await browser.close();
await server.close();
