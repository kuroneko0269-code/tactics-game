// KayKit の素材（作者の配布物の glb）から、使う体の部品と動きだけを取り出して、軽くした glb を public/models/kaykit/ に書く。
// 一度だけ手元で動かし、出来た glb をリポジトリに入れる（配布物そのものはリポジトリに入れない）。素材の出どころは docs/CREDITS.md。
//
//   node scripts/kaykit-prepare.mjs --src=配布物の glb を置いたフォルダ
//
// 配布物のフォルダには、KayKit Character Pack : Adventurers 1.0 の Characters/gltf/ にある
// Rogue.glb・Mage.glb・Barbarian.glb・Knight.glb を置く（作者の GitHub: KayKit-Game-Assets/KayKit-Character-Pack-Adventures-1.0）。
//
// 出来るもの:
//   rogue.glb・mage.glb・barbarian.glb … 体・腕・脚の形と骨（色の画像・持ち物・兜・マント・動きは外す）
//   heads.glb … 頭の形（Knight の頭と Barbarian の頭。どちらも骨は共通）
//   motions.glb … 骨と、使う動きだけ（形は持たない）
// 色の画像は入れない。色は、遊ぶ時に人物ごとに小さな画像を作って塗る（src/render/kaykit.ts）。
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { prune, dedup, resample, quantize, weld } from '@gltf-transform/functions';
import { mkdirSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';

const args = Object.fromEntries(process.argv.slice(2).map((a) => a.replace(/^--/, '').split('=')));
if (!args.src) {
  console.error('使い方: node scripts/kaykit-prepare.mjs --src=配布物の glb を置いたフォルダ');
  process.exit(1);
}
const src = resolve(args.src);
const out = resolve('public/models/kaykit');
mkdirSync(out, { recursive: true });
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS);

/** 使う動き（物語の仕草に結び付けるもの。docs/KAYKIT.md の「仕草と動き」） */
const MOTIONS = [
  'Idle',
  'Unarmed_Idle',
  'Walking_A',
  'Walking_C',
  'Sit_Chair_Down',
  'Sit_Chair_Idle',
  'Sit_Chair_StandUp',
  'Sit_Floor_Down',
  'Sit_Floor_Idle',
  'PickUp',
  'Interact',
  'Use_Item',
];

/** 形を持つ節のうち、名前が keep に合うものだけを残し、ほかの形・色の画像・動きを外す */
async function strip(file, keep, { motions = [] } = {}) {
  const doc = await io.read(join(src, file));
  const root = doc.getRoot();
  for (const node of root.listNodes()) {
    const mesh = node.getMesh();
    if (mesh && !keep.some((k) => node.getName() === k)) {
      node.setMesh(null);
      // 持ち物・兜・マントは骨ではない節なので、節ごと外す
      if (!node.getSkin()) node.dispose();
    }
  }
  for (const anim of root.listAnimations()) {
    if (motions.includes(anim.getName())) {
      // 足の向きなどを決める操作用の骨（IK・control）の動きは、体の骨の動きに焼き込まれているので外す
      for (const c of anim.listChannels()) {
        if (/IK|control/.test(c.getTargetNode()?.getName() ?? '')) {
          c.getSampler()?.dispose();
          c.dispose();
        }
      }
      continue;
    }
    for (const c of anim.listChannels()) c.dispose();
    for (const sm of anim.listSamplers()) sm.dispose();
    anim.dispose();
  }
  for (const tex of root.listTextures()) tex.dispose();
  for (const mat of root.listMaterials()) {
    mat.setBaseColorTexture(null);
    mat.setName('kaykit');
  }
  return doc;
}

async function write(doc, name, { quantizeMesh = true } = {}) {
  // 位置は小さくしない（小さくすると、体の部品ごとに骨の基準がずれ、別の人物の部品と1つにまとめられないため）。
  // 色の画像を外しても、色の区画を指す UV は残す（遊ぶ時に作る色の画像で塗るため）
  const fns = [prune({ keepAttributes: true }), dedup()];
  if (quantizeMesh) fns.push(weld(), quantize({ pattern: /^(NORMAL|TEXCOORD_0|JOINTS_0|WEIGHTS_0)$/, quantizeNormal: 10, quantizeTexcoord: 12 }));
  else fns.push(resample({ tolerance: 0.0005 }));
  await doc.transform(...fns);
  const path = join(out, name);
  await io.write(path, doc);
  console.log(name.padEnd(16), `${(statSync(path).size / 1024).toFixed(1)} KB`);
}

const BODY = (n) => [`${n}_Body`, `${n}_ArmLeft`, `${n}_ArmRight`, `${n}_LegLeft`, `${n}_LegRight`];
await write(await strip('Rogue.glb', BODY('Rogue')), 'rogue.glb');
await write(await strip('Mage.glb', BODY('Mage')), 'mage.glb');
await write(await strip('Barbarian.glb', BODY('Barbarian')), 'barbarian.glb');

// 頭: Knight の頭（髪は遊ぶ時に色の区画で切り取る）と Barbarian の頭（ひげ）を、1つのファイルにまとめる
{
  const knight = await strip('Knight.glb', ['Knight_Head']);
  const barbarian = await strip('Barbarian.glb', ['Barbarian_Head']);
  // Barbarian の頭の形を、Knight のファイルの骨に付け直す（骨の名前と順番は5人で同じ）
  const { mergeDocuments } = await import('@gltf-transform/functions');
  mergeDocuments(knight, barbarian);
  const root = knight.getRoot();
  const scenes = root.listScenes();
  const skins = root.listSkins();
  const head = root.listNodes().find((n) => n.getName() === 'Barbarian_Head');
  head.setSkin(skins[0]);
  const rig = root.listNodes().find((n) => n.getName() === 'Rig' && n.listChildren().some((c) => c.getName() === 'Knight_Head'));
  rig.addChild(head);
  for (const s of scenes.slice(1)) s.dispose();
  for (const s of skins.slice(1)) s.dispose();
  // 2つのファイルの中身を、1つの入れ物にまとめる（glb は入れ物が1つ）
  const buffer = root.listBuffers()[0];
  for (const a of root.listAccessors()) a.setBuffer(buffer);
  for (const b of root.listBuffers().slice(1)) b.dispose();
  await write(knight, 'heads.glb');
}

// 動き: 骨と動きだけ（形は持たない）
{
  const doc = await strip('Rogue.glb', [], { motions: MOTIONS });
  const names = doc.getRoot().listAnimations().map((a) => a.getName());
  const missing = MOTIONS.filter((m) => !names.includes(m));
  if (missing.length) throw new Error(`動きが見つかりません: ${missing.join(', ')}`);
  await write(doc, 'motions.glb', { quantizeMesh: false });
}
