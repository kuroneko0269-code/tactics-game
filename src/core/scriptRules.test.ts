import { describe, expect, it } from 'vitest';
import { applyDirective, propNamesMatching, stageAt, EMPTY_STAGE, type StageState } from './dialogue';
import { parseScript, parseScriptOrThrow, type Directive, type ScriptCatalog } from './script';
import { charCount, checkScriptRules, formatRuleWarning, type ScriptRules } from './scriptRules';

const catalog: ScriptCatalog = { gestures: ['うなずく', '拾う'], props: ['椀', '灯', '小さな灯', '紙包み'] };
const rules: ScriptRules = { maxLineChars: 40, maxSameSpeakerRun: 3, maxNarrationLines: 2 };
const directivesOf = (text: string) => parseScriptOrThrow('t', text, catalog).steps.flatMap((s) => (s.kind === 'directive' ? [s.directive] : s.directives));

describe('会話の見せ方の指定（顔の枠・話者の強調・肩書き）', () => {
  it('台詞の後ろの @顔なし・@強調なし は、その台詞だけの指定として読む（指示にはならない）', () => {
    const s = parseScriptOrThrow('t', ['声「聞こえるか」 @顔なし', 'ユナ「うん」 @強調なし @仕草 ユナ うなずく', 'ユナ「ふつう」'].join('\n'), catalog);
    const lines = s.steps.flatMap((x) => (x.kind === 'line' ? [x] : []));
    expect(lines[0]).toMatchObject({ speaker: '声', portrait: false, directives: [] });
    expect(lines[0]!.highlight).toBeUndefined();
    expect(lines[1]).toMatchObject({ highlight: false, directives: [{ kind: 'gesture', actor: 'ユナ', gesture: 'うなずく' }] });
    expect(lines[1]!.portrait).toBeUndefined();
    expect(lines[2]!.portrait).toBeUndefined();
    expect(lines[2]!.highlight).toBeUndefined();
  });

  it('@顔なし を1行に分けて書くと、書き間違いとして知らせる', () => {
    const r = parseScript('t', 'ユナ「a」\n@顔なし', catalog);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.errors[0]).toMatchObject({ line: 2 });
  });

  it('肩書きは舞台の様子に残り、「なし」で外す', () => {
    const ds = directivesOf('@肩書き タリス 八の席\n@肩書き ユナ 技師\n@肩書き ユナ なし');
    expect(ds[0]).toEqual({ kind: 'title', actor: 'タリス', title: '八の席' });
    const st = ds.reduce(applyDirective, EMPTY_STAGE);
    expect(st.titles).toEqual({ タリス: '八の席' });
  });
});

describe('動きで見せるための指示', () => {
  const base: StageState = {
    ...EMPTY_STAGE,
    actors: { ユナ: { x: 1, z: 1, facing: 'south' }, トウマ: { x: 3, z: 1, facing: 'west', items: { hand: '紙包み' } } },
    props: { 椀1: { prop: '椀', x: 2, z: 2 }, 椀2: { prop: '椀', x: 2, z: 2 }, 灯: { prop: '灯', x: 1, z: 4 } },
  };

  it('歩く速さを変えられる（ふつうは書かない）', () => {
    expect(directivesOf('@歩く ユナ 2,3 ゆっくり\n@歩く ユナ 2,3 走る\n@歩く ユナ 2,3 ふつう\n@歩く ユナ 2,3')).toEqual([
      { kind: 'walk', actor: 'ユナ', x: 2, z: 3, speed: 50 },
      { kind: 'walk', actor: 'ユナ', x: 2, z: 3, speed: 250 },
      { kind: 'walk', actor: 'ユナ', x: 2, z: 3 },
      { kind: 'walk', actor: 'ユナ', x: 2, z: 3 },
    ]);
    expect(parseScript('t', '@歩く ユナ 2,3 跳ねる', catalog).ok).toBe(false);
  });

  it('人物だけでなく、物の方も向ける', () => {
    const st = applyDirective(base, { kind: 'face', actor: 'ユナ', toward: '灯' });
    expect(st.actors['ユナ']!.facing).toBe('south');
    const st2 = applyDirective(base, { kind: 'face', actor: 'トウマ', toward: '椀1' });
    expect(st2.actors['トウマ']!.facing).toBe('west');
    const st3 = applyDirective(base, { kind: 'face', actor: 'ユナ', toward: 'トウマ' });
    expect(st3.actors['ユナ']!.facing).toBe('east');
  });

  it('渡す: 渡す人の右手が空になり、受け取る人の持つ所に付く', () => {
    const [d] = directivesOf('@渡す トウマ ユナ 紙包み 腰');
    expect(d).toEqual({ kind: 'give', actor: 'トウマ', to: 'ユナ', item: '紙包み', slot: 'waist' });
    const st = applyDirective(base, d!);
    expect(st.actors['トウマ']!).toMatchObject({ facing: 'west', items: { hand: '' } });
    expect(st.actors['ユナ']!.items).toEqual({ waist: '紙包み' });
  });

  it('片付ける・消す: 終わりが * なら、その名前で始まる物をすべて（椀が四つから三つ、部屋の中身の入れ替え）', () => {
    expect(propNamesMatching(base, '椀*')).toEqual(['椀1', '椀2']);
    expect(propNamesMatching(base, '*')).toEqual(['椀1', '椀2', '灯']);
    expect(propNamesMatching(base, '椀3')).toEqual([]);
    const [clear, remove] = directivesOf('@片付ける 椀* ユナ\n@消す *');
    expect(clear).toEqual({ kind: 'propRemove', name: '椀*', actor: 'ユナ' });
    const cleared = applyDirective(base, clear!);
    expect(Object.keys(cleared.props)).toEqual(['灯']);
    // 片付ける人は物の方を向く
    expect(cleared.actors['ユナ']!.facing).toBe('east');
    expect(applyDirective(base, remove!).props).toEqual({});
  });

  it('カメラ: 人物か物へ寄せる・引く。秒を書くと、その時間をかけてゆっくり動く', () => {
    expect(directivesOf('@カメラ 灯 近 3秒\n@カメラ 2,2 遠\n@カメラ ユナ 1.5')).toEqual([
      { kind: 'camera', actor: '灯', zoom: 'near', ms: 3000 },
      { kind: 'camera', x: 2, z: 2, zoom: 'far' },
      { kind: 'camera', actor: 'ユナ', ms: 1500 },
    ]);
    expect(parseScript('t', '@カメラ ユナ 近 遠', catalog).ok).toBe(false);
    expect(parseScript('t', '@カメラ ユナ そっと', catalog).ok).toBe(false);
  });

  it('同時: 同じ行の指示を1つの手順にまとめ、舞台はすべてを行った様子になる', () => {
    const s = parseScriptOrThrow('t', '@登場 ユナ 1,1 南\n@登場 トウマ 3,1 西\n@同時 @歩く ユナ 1,3 @歩く トウマ 3,3 速く @間 1', catalog);
    const last = s.steps[s.steps.length - 1]!;
    expect(last.kind === 'directive' && last.directive.kind).toBe('together');
    const together = (last as { directive: Extract<Directive, { kind: 'together' }> }).directive;
    expect(together.directives.map((d) => d.kind)).toEqual(['walk', 'walk', 'wait']);
    const st = stageAt(s, s.steps.length);
    expect(st.actors['ユナ']).toMatchObject({ x: 1, z: 3 });
    expect(st.actors['トウマ']).toMatchObject({ x: 3, z: 3 });
    // 1つだけ・操作の場面・台詞の後ろの同時は書き間違い
    expect(parseScript('t', '@同時 @歩く ユナ 1,3', catalog).ok).toBe(false);
    expect(parseScript('t', '@同時 @歩く ユナ 1,3 @押し続ける 3', catalog).ok).toBe(false);
    expect(parseScript('t', 'ユナ「a」 @同時 @歩く ユナ 1,3', catalog).ok).toBe(false);
  });
});

describe('台本の決まりの検査（読む量の決まり）', () => {
  it('字数はルビの読みを数えない', () => {
    expect(charCount('あいう')).toBe(3);
    const s = parseScriptOrThrow('t', `ユナ「{${'堰'.repeat(40)}|せき}」\nユナ「${'あ'.repeat(41)}」`, catalog);
    const w = checkScriptRules(s, rules);
    expect(w.map((x) => [x.line, x.kind])).toEqual([[2, 'length']]);
    expect(w[0]!.message).toContain('41 字');
  });

  it('同じ人物の台詞が4枠以上続くと、4枠目で1回だけ知らせる。語りや別の人がはさまると数え直す', () => {
    const s = parseScriptOrThrow(
      't',
      ['ユナ「1」', 'ユナ「2」', '@仕草 ユナ うなずく', 'ユナ「3」', 'ユナ「4」', 'ユナ「5」', 'トウマ「a」', 'トウマ「b」', 'トウマ「c」', '語り。', 'トウマ「d」'].join('\n'),
      catalog,
    );
    const w = checkScriptRules(s, rules);
    expect(w.map((x) => [x.line, x.kind])).toEqual([[5, 'sameSpeaker']]);
  });

  it('1つの場面（台本）で語りが3行以上あると、3行目で知らせる', () => {
    const two = parseScriptOrThrow('t', '一日前。\nユナ「a」\n夜。', catalog);
    expect(checkScriptRules(two, rules)).toEqual([]);
    const three = parseScriptOrThrow('t', '一日前。\nユナ「a」\n夜。\n朝。', catalog);
    const w = checkScriptRules(three, rules);
    expect(w).toHaveLength(1);
    expect(w[0]).toMatchObject({ line: 4, kind: 'narration' });
    expect(formatRuleWarning(w[0]!)).toMatch(/^台本 t: 4行目: 語りが 3 行あります.*1・3・4行目/);
  });
});
