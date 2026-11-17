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

describe('ゲーム脚本のための指示（物の文字・声・遠景・場所・物を動かす・タップ・聞く・脚本の行の印）', () => {
  const cat: ScriptCatalog = {
    ...catalog,
    props: [...catalog.props, '石', '戸'],
    melodies: ['ユナの鼻歌'],
    timbres: ['石'],
    voices: ['叫び', '笑い'],
    locations: { 'stage-a': [{ name: '机', prop: '椀', x: 1, z: 1 }], 'stage-far': [] },
  };
  it('物の文字は、物の呼び名「文」 @文字 で読む。字数の決まりは台詞と同じで、人物の台詞の続きには数えない', () => {
    const s = parseScriptOrThrow('t', ['測り棒の札「高い所から撃つ矢は、遠くまで届く。」 @文字', 'ユナ「a」', 'ユナ「b」', '封蝋「未来より」 @文字', 'ユナ「c」', 'ユナ「d」'].join('\n'), cat);
    const first = s.steps[0]!;
    expect(first).toMatchObject({ kind: 'line', speaker: '測り棒の札', inscription: true });
    expect(checkScriptRules(s, rules)).toEqual([]);
    const long = parseScriptOrThrow('t', `札「${'あ'.repeat(41)}」 @文字`, cat);
    expect(checkScriptRules(long, rules).map((w) => w.kind)).toEqual(['length']);
    expect(parseScript('t', 'これは語り @文字', cat).ok).toBe(false);
  });

  it('字幕は ／ で改行する。字幕の1行の字数を調べ、例外に書いた行は知らせない', () => {
    const s = parseScriptOrThrow('t', `一行目。／${'い'.repeat(41)}`, cat);
    const line = s.steps[0]!;
    if (line.kind !== 'line') throw new Error();
    expect(line.text.map((x) => x.text).join('')).toBe(`一行目。\n${'い'.repeat(41)}`);
    expect(checkScriptRules(s, { ...rules, maxCaptionLineChars: 40 }).map((w) => w.kind)).toEqual(['caption']);
    expect(checkScriptRules(s, { ...rules, maxCaptionLineChars: 40, captionExceptions: ['い'.repeat(41)] })).toEqual([]);
  });

  it('声・遠景・場所・物を動かす・タップ・聞く・脚本の行の印を読む。書き間違いは知らせる', () => {
    const ds = directivesOf.call(null, '') as Directive[];
    expect(ds).toEqual([]);
    const s = parseScriptOrThrow(
      't',
      ['@脚本 2-5', '@声 番兵 叫び', '@遠景 stage-far 3', '@場所 stage-a', '@動かす 机 3,4 2', '@タップ 戸 戸を開ける', '@聞く ユナの鼻歌 石 耳に当てる', 'ユナ「a」 @脚本 2-6', '@脚本 外'].join('\n'),
      cat,
    );
    const got = s.steps.flatMap((x) => (x.kind === 'directive' ? [x.directive] : x.directives));
    expect(got).toEqual([
      { kind: 'cue', ref: '2-5' },
      { kind: 'voice', actor: '番兵', voice: '叫び' },
      { kind: 'cut', stageId: 'stage-far', ms: 3000 },
      { kind: 'location', stageId: 'stage-a', props: [{ name: '机', prop: '椀', x: 1, z: 1 }] },
      { kind: 'propMove', name: '机', x: 3, z: 4, ms: 2000 },
      { kind: 'tapControl', target: '戸', label: '戸を開ける' },
      { kind: 'listen', melody: 'ユナの鼻歌', timbre: '石', label: '耳に当てる' },
      { kind: 'cue', ref: '2-6' },
      { kind: 'cue', ref: '外' },
    ]);
    for (const bad of ['@声 番兵 歌う', '@遠景 stage-x 2', '@場所 stage-x', '@聞く 何か 石', '@脚本 二', 'ユナ「a」 @タップ 戸', 'ユナ「a」 @場所 stage-a', '@同時 @遠景 stage-far 1 @間 1']) {
      expect(parseScript('t', bad, cat).ok, bad).toBe(false);
    }
  });

  it('場所を移すと、人物と光はいなくなり、物は新しいマップの物になる。物を動かすと位置が変わる', () => {
    const before: StageState = { ...EMPTY_STAGE, actors: { ユナ: { x: 1, z: 1, facing: 'south' } }, props: { 椀1: { prop: '椀', x: 2, z: 2 } }, lights: { 門: { x: 1, z: 1, color: '白' } }, dark: true };
    const s = parseScriptOrThrow('t', '@場所 stage-a\n@動かす 机 3,4', cat);
    const after = stageAt(s, 2, before);
    expect(after).toEqual({ actors: {}, props: { 机: { prop: '椀', x: 3, z: 4 } }, dark: true, location: 'stage-a' });
  });
});
