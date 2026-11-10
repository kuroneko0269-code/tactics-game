import { defineConfig, type Plugin } from 'vitest/config';

// GitHub Pages では https://<ユーザー名>.github.io/<リポジトリ名>/ で公開されるため、
// 本番ビルドのときだけ base（サイトの置き場所）をリポジトリ名に合わせる。
const REPO_NAME = 'tactics-game';

// 版: ビルドした日時。画面の隅に表示し、公開中の最新の版（version.json）と比べて古ければ更新を案内する（src/ui/version.ts）
const BUILD_TIME = new Date().toISOString();

/** ビルドの時に、版を書いた version.json を公開ファイルに加える */
function versionFile(): Plugin {
  return {
    name: 'version-file',
    apply: 'build',
    generateBundle() {
      this.emitFile({ type: 'asset', fileName: 'version.json', source: `${JSON.stringify({ version: BUILD_TIME })}\n` });
    },
  };
}

export default defineConfig(({ command, isPreview }) => ({
  // npm run dev では / のまま、build と preview（ビルド結果の確認）では /tactics-game/ にする。
  base: command === 'build' || isPreview ? `/${REPO_NAME}/` : '/',
  define: {
    __BUILD_TIME__: JSON.stringify(BUILD_TIME),
  },
  plugins: [versionFile()],
  build: {
    // Three.js 本体だけで 500KB 近くあるため、警告の基準を少し上げる
    chunkSizeWarningLimit: 800,
  },
  test: {
    include: ['src/**/*.test.ts'],
    environment: 'node',
  },
}));
