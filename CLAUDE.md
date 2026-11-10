# CLAUDE.md

ブラウザで遊べるタクティクスRPG。高低差のあるマス目マップ、ジョブ育成、詠唱時間のあるターン制バトルが柱。
発注者は非エンジニア。**報告・PR 説明・ドキュメントは日本語で書き、専門用語には一言説明を添える。**

- 開発計画: [docs/ROADMAP.md](docs/ROADMAP.md)
- 仕様の要点: [docs/GAME_DESIGN.md](docs/GAME_DESIGN.md)

## 技術構成

TypeScript / Vite（開発サーバーとビルド）/ Three.js（3D描画）/ Vitest（テスト）/ npm。
公開先は GitHub Pages（https://kuroneko0269-code.github.io/tactics-game/）。

## フォルダ構成と依存のルール

| フォルダ | 役割 | 依存してよいもの |
| --- | --- | --- |
| `src/core` | 戦闘ルールなどのゲームロジック | `src/data` のみ。Three.js・DOM・`render`・`ui` は禁止 |
| `src/data` | ジョブ・アビリティ・装備・マップの定義データ | 型のために `src/core` のみ |
| `src/render` | Three.js による3D描画 | `core`, `data`, Three.js |
| `src/ui` | メニューや戦闘中の表示（HTML/CSS） | `core`, `data` |
| `src/main.ts` | 上記を組み立てる入口 | すべて |

- **core から render / ui / three を import しない。** 将来、協力プレイ用のサーバーで core をそのまま動かすため。
  `eslint.config.js` の `no-restricted-imports` で機械的に検査している。
- **core ではブラウザ専用の機能（window, document など）を使わない。** lint に加え、
  `tsconfig.core.json`（DOM の型を外した設定）の型チェックでも検出される。
- **core の乱数は `src/core/rng.ts` のシード付き生成器だけを使う。** `Math.random` は lint で禁止。
  同じシード値なら同じ結果になるので、リプレイと通信同期で結果を再現できる。
- **ジョブやアビリティの数値はコードに直接書かず `src/data` に置く。** core はデータを読んで計算するだけにする。
- キャラクターは当面、コードで組み立てた仮の人形（`src/render/puppet.ts`）。将来ローポリ3Dモデルに差し替える。
- スマホのブラウザでも遊べること。操作はタップ（クリックも同じ扱い）、縦向き・横向きどちらでも崩れないこと。
  ボタンは指で押せる大きさ（目安 48px 以上）にする。
- 名称・キャラクター・素材はすべてオリジナル。既存作品の固有名詞や見た目を使わない。

## よく使うコマンド

```sh
npm install          # 初回のみ。必要な部品をダウンロード
npm run dev          # 開発用サーバーを起動（http://localhost:5173/）
npm run lint         # 書き方と依存方向の検査
npm run typecheck    # 型チェック（全体 + core 単体）
npm test             # テストを1回実行（npm run test:watch で変更のたびに実行）
npm run build        # 公開用ファイルを dist/ に作る
npm run preview      # ビルド結果を確認（http://localhost:4173/tactics-game/）
npm run check        # lint・型チェック・テスト・ビルドをまとめて実行
```

## 作業ルール

1. **作業ごとにブランチを切って PR を作る。** main に直接コミットしない（main に入ると自動で公開される）。
2. **PR 前に lint・型チェック・テスト・ビルドを通す。**（`npm run check`。PR では GitHub Actions でも自動実行される）
3. **core の変更にはテストを付ける。** テストは対象ファイルの隣に `*.test.ts` として置く。
4. **仕様で迷ったら推測で進めず、PR の説明に質問として書く。**

## CI / 公開

- `.github/workflows/ci.yml`: PR ごとに lint・型チェック・テスト・ビルドを実行。
- `.github/workflows/deploy.yml`: main への変更ごとに同じ検査をしてから GitHub Pages に公開。
- `vite.config.ts` の `base` は本番ビルド時に `/tactics-game/`。リポジトリ名を変えたらここも変える。
