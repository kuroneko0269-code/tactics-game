// ESLint（コードの書き方を自動検査する道具）の設定。
// 特に重要なのは「src/core は描画や画面に依存しない」というルールを機械的に守らせる部分。
import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import globals from 'globals';

// 依存の向き（矢印は「読み込んでよい」）:
//   main.ts → core, data, render, ui
//   render / ui → core, data
//   data → core（型だけ）
//   core → どこにも依存しない
// core と data を結び付けるのは main.ts（将来はサーバーの入口も）の役割。

/** render / ui / Three.js への依存（core と data では禁止） */
const viewLayerPatterns = [
  {
    group: ['**/render', '**/render/**', '**/ui', '**/ui/**', '**/main', '**/main.ts'],
    message:
      'core と data は render / ui / main.ts に依存してはいけません（将来サーバーで core をそのまま動かすため）。',
  },
  {
    group: ['three', 'three/**'],
    message: 'core と data では Three.js を使えません。描画は src/render に書いてください。',
  },
];

/** core から読み込んではいけないもの */
const coreForbiddenImports = {
  patterns: [
    ...viewLayerPatterns,
    {
      group: ['**/data', '**/data/**'],
      message:
        'core は src/data を読み込んではいけません。定義データは関数の引数として受け取ってください（結び付けは main.ts で行う）。',
    },
  ],
};

/** data から読み込んではいけないもの（core は型だけ読み込める） */
const dataForbiddenImports = {
  patterns: [
    ...viewLayerPatterns,
    {
      group: ['**/core', '**/core/**'],
      allowTypeImports: true,
      message:
        'data から core は型だけ読み込めます（import type を使ってください）。core の関数を呼ぶのは main.ts の役割です。',
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
      'no-restricted-imports': ['error', coreForbiddenImports],
      'no-restricted-properties': [
        'error',
        {
          object: 'Math',
          property: 'random',
          message:
            'core では Math.random を使わず、src/core/rng.ts のシード付き乱数を使ってください（同じ状態から同じ結果を再現するため）。',
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
  // data: 定義データ。描画・画面に依存せず、core からは型だけを読み込む。
  // 「型だけ」を見分けるため、TypeScript 対応版の no-restricted-imports を使う。
  {
    files: ['src/data/**/*.ts'],
    rules: {
      'no-restricted-imports': 'off',
      '@typescript-eslint/no-restricted-imports': ['error', dataForbiddenImports],
    },
  },
  // data のテストは「定義データが core で正しく読めるか」を確かめるため、core の関数を使ってよい。
  {
    files: ['src/data/**/*.test.ts'],
    rules: {
      '@typescript-eslint/no-restricted-imports': ['error', { patterns: viewLayerPatterns }],
    },
  },
);
