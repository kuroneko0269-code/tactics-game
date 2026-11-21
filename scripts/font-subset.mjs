import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

/** src の中のすべての文字（画面の文言・台本・定義データ）。書体の、使う文字の範囲だけを残すため */
function sourceChars() {
  const chars = new Set();
  const walk = (dir) => {
    for (const name of readdirSync(dir)) {
      const path = join(dir, name);
      if (statSync(path).isDirectory()) walk(path);
      else if (/\.(ts|html|css)$/.test(name) && !name.endsWith('.test.ts')) for (const ch of readFileSync(path, 'utf8')) chars.add(ch.codePointAt(0));
    }
  };
  walk('src');
  for (const ch of readFileSync('index.html', 'utf8')) chars.add(ch.codePointAt(0));
  return chars;
}

/** unicode-range（U+3000-303f,U+30a0 など）に、使う文字が1つでも入っているか */
function rangeUsed(range, chars) {
  return range.split(',').some((part) => {
    const m = /U\+([0-9a-f]+)(?:-([0-9a-f]+))?/i.exec(part.trim());
    if (!m) return true;
    const from = parseInt(m[1], 16);
    const to = m[2] ? parseInt(m[2], 16) : from;
    for (let c = from; c <= to; c++) if (chars.has(c)) return true;
    return false;
  });
}

/**
 * 書体（Shippori Mincho。npm の @fontsource から同梱。外部へは読みに行かない）の読み込みを軽くする:
 * - 文字の範囲ごとに分かれた書体のうち、src に出てくる文字を含む範囲だけを残す（使わない範囲は公開ファイルにも入れない）
 * - woff2 だけを使う（古い形式の woff の予備を外す）
 * ブラウザは、画面に出す文字を含む範囲の woff2 だけを読み込む（unicode-range）。範囲にない文字は端末の明朝体で出る
 */
export function fontSubset() {
  let chars;
  return {
    name: 'font-subset',
    enforce: 'pre',
    transform(code, id) {
      if (!id.includes('@fontsource') || !id.endsWith('.css')) return null;
      chars ??= sourceChars();
      const used = chars;
      const blocks = code.split(/(?=\/\* [^*]+ \*\/\s*@font-face)/);
      const kept = blocks.filter((b) => {
        const m = /unicode-range:\s*([^;]+);/.exec(b);
        return !m || rangeUsed(m[1], used);
      });
      return { code: kept.join('').replace(/,\s*url\([^)]*\.woff\)\s*format\('woff'\)/g, ''), map: null };
    },
  };
}

