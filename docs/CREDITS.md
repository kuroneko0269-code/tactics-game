# 素材の出どころ

このゲームに取り込んだ、外部の素材の一覧です。素材を足したら、ここに1つ足します。
（書体は npm の部品として取り込んでいるので、package.json と各部品の使用条件を見てください。）

## KayKit Character Pack : Adventurers 1.0

| 項目 | 内容 |
| --- | --- |
| 素材の名前 | KayKit - Character Pack : Adventurers（1.0。無料版） |
| 作者 | Kay Lousberg（www.kaylousberg.com） |
| 入手元 | 作者の GitHub「KayKit-Game-Assets」の `KayKit-Character-Pack-Adventures-1.0`（`addons/kaykit_character_pack_adventures/Characters/gltf/`）。配布ページは https://kaylousberg.itch.io/kaykit-adventurers |
| 使用条件 | CC0 1.0 Universal（パブリックドメイン。商用可・表記不要・改造可）。配布物の `LICENSE.txt` に「License: (Creative Commons Zero, CC0) … This content is free to use in personal, educational and commercial projects. … crediting Kay Lousberg … (this is not mandatory)」と書かれていることを、取り込む前に読んで確かめた |
| 取り込んだ日 | 2026-11-21 |
| 取り込んだ物 | Rogue・Mage・Barbarian の体・腕・脚の形、Knight・Barbarian・Rogue・Mage の頭の形（髪は頭と一体。2026-11-21 の髪の作り直しで Rogue と Mage の頭を足し、作者の髪をそのまま使うようにした。使用条件の `LICENSE.txt` は足す前に読み直した）、骨（41本。5人で共通）、動き 12 種（`public/models/kaykit/`。`scripts/kaykit-prepare.mjs` で、使う物だけを取り出して軽くした。色の画像・持ち物・兜・帽子・マントは取り込んでいない） |
| 使っている所 | KayKit の人形の試し（序章の場面4。`src/render/kaykit.ts`） |

## KayKit Character Pack : Skeletons 1.0

| 項目 | 内容 |
| --- | --- |
| 素材の名前 | KayKit - Character Pack : Skeletons（1.0。無料版） |
| 作者 | Kay Lousberg（www.kaylousberg.com） |
| 入手元 | 作者の GitHub「KayKit-Game-Assets」の `KayKit-Character-Pack-Skeletons-1.0`。配布ページは https://kaylousberg.itch.io/kaykit-skeletons |
| 使用条件 | CC0 1.0 Universal。配布物の `LICENSE.txt` に「License: (Creative Commons Zero, CC0) … free to use in personal, educational and commercial projects … (this is not mandatory)」と書かれていることを読んで確かめた |
| 取り込んだ日 | 2026-11-21（見立ての写真を撮っただけ。リポジトリにも公開ファイルにも入れていない） |
| 使っている所 | なし（見立ての写真 `docs/images/kaykit/skeletons.jpg` だけ） |

## 入手できなかった物

- **KayKit Character Animations**（無料の動きのパック。https://kaylousberg.itch.io/kaykit-character-animations ）: この作業の環境からは itch.io に届かず、作者の GitHub にも見つからなかった
  （作者以外の写しは使わない決まり）。Adventurers 1.0 の glb に、同じ骨の動き 76 種が入っているので、今回はそれを使った。
  動きのパックを使う時は、配布ページの無料版（「KayKit Character Animations」の zip。中の glTF）を発注者に用意してもらう（パソコンが要る。itch.io の zip を展開するため）。
  置き場所は、リポジトリの外の作業用のフォルダ（`scripts/kaykit-prepare.mjs --src=` に渡す。配布物そのものはリポジトリに入れない）。
