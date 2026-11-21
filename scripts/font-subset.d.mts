import type { Plugin } from 'vite';

/** 書体（@fontsource の明朝体）の、src に出てくる文字を含む範囲だけを残し、woff2 だけを使う Vite の部品 */
export function fontSubset(): Plugin;
