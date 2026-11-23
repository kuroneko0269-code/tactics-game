# 素材の出どころ

このゲームに取り込んだ、外部の素材の一覧です。素材を足したら、ここに1つ足します。
（書体は npm の部品として取り込んでいるので、package.json と各部品の使用条件を見てください。）

## Zen Maru Gothic（書体）

| 項目 | 内容 |
| --- | --- |
| 素材の名前 | Zen Maru Gothic（丸ゴシック体。Google Fonts で配布） |
| 作者 | The Zen Maru Gothic Authors（https://github.com/googlefonts/zen-marugothic ） |
| 入手元 | npm の部品 `@fontsource/zen-maru-gothic`（5.3.1。Google Fonts の書体を、文字の範囲ごとに分けた woff2 にしたもの） |
| 使用条件 | SIL Open Font License 1.1（OFL。商用可・同梱して配布してよい・書体だけを売ってはいけない・改変した書体に元の名前を使わない）。部品の `LICENSE` に「Copyright 2021 The Zen Maru Gothic Authors … This Font Software is licensed under the SIL Open Font License, Version 1.1.」と全文が書かれていることを、取り込む前に読んで確かめた。書体そのものは改変していない（使う文字の範囲のファイルだけを公開ファイルに入れる） |
| 取り込んだ日 | 2026-11-22 |
| 取り込んだ物 | 太さ 500（台詞など）と 700（名前など）の2つ。src に出てくる文字を含む範囲だけ（`scripts/font-subset.mjs`） |
| 使っている所 | ゲーム全体の書体。ヒラギノ丸ゴ（端末の書体。同梱しない）が無い端末でだけ読み込む（`src/ui/storyLook.ts`。2026-11-23 に書体を1つに決め、ほかの書体（Zen Old Mincho・Shippori Antique・Shippori Mincho）は外した） |

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
