// ESLint（コードの書き方を自動検査する道具）の設定。
// 特に重要なのは「src/core は描画や画面に依存しない」というルールを機械的に守らせる部分。
import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import globals from 'globals';

/** core / data から読み込んではいけないもの */
const pureLayerForbiddenImports = {
  patterns: [
    {
      group: ['**/render', '**/render/**', '**/ui', '**/ui/**'],
      message:
        'core と data は render / ui に依存してはいけません（将来サーバーで core をそのまま動かすため）。',
    },
    {
      group: ['three', 'three/**'],
      message: 'core と data では Three.js を使えません。描画は src/render に書いてください。',
    },
  ],
};

export default tseslint.config(
  { ignores: ['dist/**', 'node_modules/**', 'coverage/**'] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ['**/*.ts'],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'module',
    },
  },
  // ブラウザで動く層（render / ui / main.ts）
  {
    files: ['src/render/**/*.ts', 'src/ui/**/*.ts', 'src/main.ts'],
    languageOptions: { globals: globals.browser },
  },
  // 設定ファイル類（Node.js で動く）
  {
    files: ['*.js', '*.ts'],
    languageOptions: { globals: globals.node },
  },
  // core: ゲームロジック。描画・画面・ブラウザ・Math.random に依存しない。
  {
    files: ['src/core/**/*.ts'],
    rules: {
      'no-restricted-imports': ['error', pureLayerForbiddenImports],
      'no-restricted-properties': [
        'error',
        {
          object: 'Math',
          property: 'random',
          message:
            'core では Math.random を使わず、src/core/rng.ts のシード付き乱数を使ってください（リプレイと通信同期のため）。',
        },
      ],
      'no-restricted-globals': [
        'error',
        ...['window', 'document', 'navigator', 'localStorage', 'requestAnimationFrame'].map((name) => ({
          name,
          message: 'core ではブラウザ専用の機能を使えません。',
        })),
      ],
    },
  },
  // data: 定義データ。core と同じく描画・画面に依存しない。
  {
    files: ['src/data/**/*.ts'],
    rules: {
      'no-restricted-imports': ['error', pureLayerForbiddenImports],
    },
  },
);
