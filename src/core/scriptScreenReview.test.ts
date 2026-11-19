import { describe, expect, it } from 'vitest';
import { EMPTY_STAGE, stageAt } from './dialogue';
import { parseScript, parseScriptOrThrow, type ScriptCatalog } from './script';
import { screenTextOf } from './scriptExport';

/**
 * 序章の演出の直し（実際の画面での初見の検査）で足した台本の書き方:
 * 物の名前の札（@物の札）・待たないカメラ（@カメラ … 待たない）・白の中へ落ちる退場（@退場 名前 落ちる）
 */
const catalog: ScriptCatalog = { gestures: ['うなずく'], props: ['椀', '石'] };
const steps = (text: string) => parseScriptOrThrow('t', text, catalog).steps;
const directivesOf = (text: string) => steps(text).flatMap((s) => (s.kind === 'directive' ? [s.directive] : s.directives));
const labels = { walk: '歩く', tapDefault: '押す', listenDefault: '聞く', holdDefault: '押し続ける' };

describe('物の名前の札（@物の札）', () => {
  it('物・人物・マスの上に、名前だけを出す。秒を省くと 2.5 秒。名前に空白があれば全角の空白でつなぐ', () => {
    expect(directivesOf('@物の札 包み 蜜菓子の包み 3秒\n@物の札 ゴード 測り棒\n@物の札 4,2 堰 2\n@物の札 卓 円い 卓')).toEqual([
      { kind: 'objectLabel', target: '包み', text: '蜜菓子の包み', ms: 3000 },
      { kind: 'objectLabel', target: 'ゴード', text: '測り棒', ms: 2500 },
      { kind: 'objectLabel', target: '4,2', text: '堰', ms: 2000 },
      { kind: 'objectLabel', target: '卓', text: '円い　卓', ms: 2500 },
    ]);
  });

  it('名前を書き忘れると知らせる。舞台は変えない。台詞の後ろにも書ける', () => {
    expect(parseScript('t', '@物の札 包み', catalog).ok).toBe(false);
    expect(stageAt(parseScriptOrThrow('t', '@物の札 包み 蜜菓子の包み', catalog), 1)).toEqual(EMPTY_STAGE);
    expect(steps('ハルド「食え」 @物の札 包み 蜜菓子の包み')[0]).toMatchObject({ kind: 'line', directives: [{ kind: 'objectLabel', text: '蜜菓子の包み' }] });
  });

  it('画面に出るものの書き出しに、物の札として出る', () => {
    const out = screenTextOf(parseScriptOrThrow('t', '@物の札 包み 蜜菓子の包み 2秒', catalog), labels);
    expect(out).toEqual([{ kind: '物の札', text: '蜜菓子の包み（包みの上に2秒）' }]);
  });
});

describe('待たないカメラ（@カメラ … 待たない）', () => {
  it('「待たない」を添えると flow になる。寄りと秒は今までどおり', () => {
    expect(directivesOf('@カメラ 4,15 遠 4秒 待たない\n@カメラ 4,6 中 2秒')).toEqual([
      { kind: 'camera', x: 4, z: 15, zoom: 'far', ms: 4000, flow: true },
      { kind: 'camera', x: 4, z: 6, zoom: 'mid', ms: 2000 },
    ]);
  });

  it('書き出しの「すべて」では、待たないことが分かる', () => {
    const out = screenTextOf(parseScriptOrThrow('t', '@カメラ 4,15 遠 4秒 待たない', catalog), labels, undefined, { all: true });
    expect(out.map((x) => x.text)).toContain('4,15のマスへ（遠）4秒かけて（動き終わるのを待たずに次へ）');
  });

  it('知らない言葉は書き間違いとして知らせる', () => {
    expect(parseScript('t', '@カメラ 4,15 遠 急ぐ', catalog).ok).toBe(false);
  });
});

describe('白の中へ落ちる退場（@退場 名前 落ちる）', () => {
  it('「落ちる」を添えると fall になる。ほかの言葉は知らせる。舞台からはいなくなる', () => {
    expect(directivesOf('@退場 ガレス 落ちる\n@退場 トウマ')).toEqual([
      { kind: 'exit', actor: 'ガレス', fall: true },
      { kind: 'exit', actor: 'トウマ' },
    ]);
    expect(parseScript('t', '@退場 ガレス 飛ぶ', catalog).ok).toBe(false);
    const s = parseScriptOrThrow('t', '@登場 ガレス 1,1 南\n@退場 ガレス 落ちる', catalog);
    expect(stageAt(s, 2).actors['ガレス']).toBeUndefined();
  });

  it('書き出しの「すべて」では、落ちて消えることが分かる', () => {
    const out = screenTextOf(parseScriptOrThrow('t', '@退場 ガレス 落ちる', catalog), labels, undefined, { all: true });
    expect(out.map((x) => x.text)).toContain('ガレスが光にさらわれ、白く光りながら足もとの下へ落ちて消える');
  });
});

describe('書き出しの言い回し（物を消す・片付ける）', () => {
  it('「椀*」は「椀をすべて消す」、「*」は「物をすべて消す」、1つなら「石を消す」。人物がいれば「片付ける」', () => {
    const out = screenTextOf(
      parseScriptOrThrow('t', '@置く 椀1 椀 1,1\n@置く 石1 石 2,2\n@消す 椀*\n@消す 石1\n@消す *\n@片付ける 椀* 母', catalog),
      labels,
      undefined,
      { all: true },
    );
    const texts = out.filter((x) => x.kind === '物').map((x) => x.text);
    expect(texts).toContain('椀をすべて消す');
    expect(texts).toContain('石1を消す');
    expect(texts).toContain('物をすべて消す');
    expect(texts).toContain('母が椀をすべて片付ける');
    expect(texts.some((t) => t.includes('をすべてを'))).toBe(false);
  });
});
