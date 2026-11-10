import { defineConfig } from 'vitest/config';

// GitHub Pages では https://<ユーザー名>.github.io/<リポジトリ名>/ で公開されるため、
// 本番ビルドのときだけ base（サイトの置き場所）をリポジトリ名に合わせる。
const REPO_NAME = 'tactics-game';

export default defineConfig(({ command, isPreview }) => ({
  // npm run dev では / のまま、build と preview（ビルド結果の確認）では /tactics-game/ にする。
  base: command === 'build' || isPreview ? `/${REPO_NAME}/` : '/',
  build: {
    // Three.js 本体だけで 500KB 近くあるため、警告の基準を少し上げる
    chunkSizeWarningLimit: 800,
  },
  test: {
    include: ['src/**/*.test.ts'],
    environment: 'node',
  },
}));
