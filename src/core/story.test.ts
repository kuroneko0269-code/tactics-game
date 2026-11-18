import { describe, expect, it } from 'vitest';
import { advance, backlog, isFinished, linesOf, nextStop, skipToEnd, stageAt, walkPath, EMPTY_STAGE } from './dialogue';
import { createSaveData, migrateSaveData, SAVE_MIGRATIONS, suspendedBattleFits, type SaveMigrationContext } from './saveData';
import { parseScript, parseScriptOrThrow, plainText, type ScriptCatalog } from './script';
import { advanceScene, currentScene, isChecked, normalizeProgress, progressAt, recapFor, sceneEntries, STORY_START, validateBook, type BookDefinition } from './story';
import { flat, makeState } from './testSupport';
import type { Roster } from './progression';

const catalog: ScriptCatalog = { gestures: ['うなずく', '背を向ける', '指で数える'], props: ['椀', '灯', 'ともった灯'] };

const sample = `# 試しの台本
@登場 ユナ 2,3 南
@登場 トウマ 3,4 北
ユナ「兄さん、{真鍮|しんちゅう}の{灯|あかり}よ」 @仕草 ユナ うなずく
トウマ「ああ」
@置く 椀1 椀 2,2
@置く 椀2 椀 3,2
「だれ？」と母が言った。
@暗転 0.5
一日前。
@明転
@消す 椀2
@変える 灯 ともった灯
@押し続ける 30 ねじを巻く
@歩かせる トウマ 3,3 3,2 4,2
ユナ「おかえり」 @向き ユナ トウマ @カメラ ユナ 近
`;

describe('台本の読み込み', () => {
  it('話者・台詞・語り・ルビ・指示を読む', () => {
    const script = parseScriptOrThrow('sample', sample, catalog);
    expect(linesOf(script)).toEqual(['ユナ:兄さん、真鍮の灯よ', 'トウマ:ああ', ':「だれ？」と母が言った。', ':一日前。', 'ユナ:おかえり']);
    const first = script.steps.find((s) => s.kind === 'line')!;
    expect(first.kind === 'line' && first.text).toEqual([
      { text: '兄さん、' },
      { text: '真鍮', ruby: 'しんちゅう' },
      { text: 'の' },
      { text: '灯', ruby: 'あかり' },
      { text: 'よ' },
    ]);
    expect(first.kind === 'line' && first.directives).toEqual([{ kind: 'gesture', actor: 'ユナ', gesture: 'うなずく' }]);
    const directives = script.steps.flatMap((s) => (s.kind === 'directive' ? [s.directive] : []));
    expect(directives).toContainEqual({ kind: 'enter', actor: 'ユナ', x: 2, z: 3, facing: 'south' });
    expect(directives).toContainEqual({ kind: 'fadeOut', ms: 500 });
    expect(directives).toContainEqual({ kind: 'fadeIn', ms: 600 });
    expect(directives).toContainEqual({ kind: 'propPut', name: '椀1', prop: '椀', x: 2, z: 2 });
    expect(directives).toContainEqual({ kind: 'propChange', name: '灯', prop: 'ともった灯' });
    expect(directives).toContainEqual({ kind: 'hold', steps: 30, label: 'ねじを巻く' });
    expect(directives).toContainEqual({ kind: 'walkControl', actor: 'トウマ', path: [{ x: 3, z: 3 }, { x: 3, z: 2 }, { x: 4, z: 2 }] });
    const last = script.steps[script.steps.length - 1]!;
    expect(last.kind === 'line' && last.directives).toEqual([
      { kind: 'face', actor: 'ユナ', toward: 'トウマ' },
      { kind: 'camera', actor: 'ユナ', zoom: 'near' },
    ]);
  });

  it('全角の ＠ と数字、「 」の中の @ を扱える', () => {
    const s = parseScriptOrThrow('x', 'ユナ「メールは a@b です」　＠仕草　ユナ　うなずく\n＠登場 トウマ ３，４ 西', catalog);
    expect(linesOf(s)).toEqual(['ユナ:メールは a@b です']);
    expect(s.steps[1]).toMatchObject({ directive: { kind: 'enter', x: 3, z: 4, facing: 'west' } });
  });

  it('書き間違いは、何行目がどう悪いかを一覧で返す', () => {
    const r = parseScript(
      'bad',
      ['ユナ「こんにちは」', '@仕草 ユナ おじぎ', '@登場 トウマ 3-4 北', 'ユナ「閉じていない', '{灯|あかり', '@踊る ユナ', '@歩かせる トウマ 1,1 3,3', 'トウマ「ああ」 @押し続ける 3'].join('\n'),
      catalog,
    );
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.errors.map((e) => e.line)).toEqual([2, 3, 4, 5, 6, 7, 8]);
    expect(r.errors[0]!.message).toContain('仕草「おじぎ」はありません');
    expect(r.errors[2]!.message).toContain('」 がありません');
    expect(r.errors[4]!.message).toContain('指示「踊る」はありません');
    expect(() => parseScriptOrThrow('bad', '@踊る', catalog)).toThrow(/台本 bad: 1行目/);
  });
});

describe('会話の進行（早送り・スキップ・読み返し）', () => {
  const script = parseScriptOrThrow('sample', sample, catalog);

  it('台詞と操作の場面で止まり、指示だけの手順は続けて行う', () => {
    let i = nextStop(script, 0);
    const seen: string[] = [];
    while (!isFinished(script, i)) {
      const s = script.steps[i]!;
      seen.push(s.kind === 'line' ? plainText(s.text) : s.directive.kind);
      i = nextStop(script, advance(script, i));
    }
    expect(seen).toEqual(['兄さん、真鍮の灯よ', 'ああ', '「だれ？」と母が言った。', '一日前。', 'hold', 'walkControl', 'おかえり']);
  });

  it('舞台の様子（人物・物・暗転）は、それまでの指示を順に行った結果', () => {
    const i = script.steps.findIndex((s) => s.kind === 'line' && plainText(s.text) === '一日前。');
    const st = stageAt(script, i);
    expect(st.dark).toBe(true);
    expect(Object.keys(st.props).sort()).toEqual(['椀1', '椀2']);
    expect(st.actors['ユナ']).toEqual({ x: 2, z: 3, facing: 'south' });
    const end = stageAt(script, script.steps.length);
    expect(end.dark).toBe(false);
    expect(Object.keys(end.props)).toEqual(['椀1']);
    // 歩かせた後の位置と向き、相手の方を向く
    expect(end.actors['トウマ']).toEqual({ x: 4, z: 2, facing: 'east' });
    expect(end.actors['ユナ']!.facing).toBe('east');
  });

  it('スキップ: 最後まで飛ばすと、舞台は最後の様子になり、飛ばした操作の場面を数える', () => {
    const i = nextStop(script, 0);
    const r = skipToEnd(script, i, stageAt(script, i));
    expect(r.index).toBe(script.steps.length);
    expect(r.stage).toEqual(stageAt(script, script.steps.length));
    expect(r.skippedInteractive).toBe(2);
  });

  it('読み返し: 今出ている行までの台詞と語り（話者つき）', () => {
    const i = script.steps.findIndex((s) => s.kind === 'line' && plainText(s.text) === '「だれ？」と母が言った。');
    expect(backlog(script, i).map((b) => `${b.speaker ?? '-'}:${plainText(b.text)}`)).toEqual(['ユナ:兄さん、真鍮の灯よ', 'トウマ:ああ', '-:「だれ？」と母が言った。']);
  });

  it('歩く道順は、縦に進んでから横に進む', () => {
    expect(walkPath({ x: 1, z: 1 }, { x: 3, z: 0 })).toEqual([{ x: 1, z: 1 }, { x: 1, z: 0 }, { x: 2, z: 0 }, { x: 3, z: 0 }]);
    expect(stageAt({ id: 'e', steps: [] }, 0)).toEqual(EMPTY_STAGE);
  });
});

describe('章と場面の流れ', () => {
  const book: BookDefinition = {
    id: 'main',
    chapters: [
      {
        id: 'c1',
        recap: ['一行目', '二行目'],
        scenes: [
          { kind: 'dialogue', id: 's1', scriptId: 'a', stageId: 'room' },
          { kind: 'battle', id: 's2', battleId: 'b' },
        ],
      },
      { id: 'c2', recap: ['続き'], scenes: [{ kind: 'base', id: 's1' }] },
    ],
  };

  it('場面を順に進め、章の最後で次の章へ、本の最後で終わる', () => {
    expect(validateBook(book)).toEqual([]);
    let p = STORY_START;
    expect(currentScene(book, p)?.scene.id).toBe('s1');
    p = advanceScene(book, p);
    expect(currentScene(book, p)?.scene.kind).toBe('battle');
    p = advanceScene(book, p);
    expect(p).toEqual({ chapter: 1, scene: 0, finished: false });
    p = advanceScene(book, p);
    expect(p.finished).toBe(true);
    expect(currentScene(book, p)).toBeUndefined();
  });

  it('「これまで」: 最初の場面と終えた本では出さない。それ以外は今の章の文（3行以内）', () => {
    expect(recapFor(book, STORY_START)).toEqual([]);
    expect(recapFor(book, { chapter: 0, scene: 1, finished: false })).toEqual(['一行目', '二行目']);
    expect(recapFor(book, { chapter: 1, scene: 0, finished: false })).toEqual(['続き']);
    expect(validateBook({ ...book, chapters: [{ ...book.chapters[0]!, recap: ['1', '2', '3', '4'] }] })).toHaveLength(1);
  });

  it('保存してあった進み具合を、今の本の定義に合わせる', () => {
    expect(normalizeProgress(book, undefined)).toEqual(STORY_START);
    expect(normalizeProgress(book, { chapter: 0, scene: 9, finished: false })).toEqual({ chapter: 0, scene: 0, finished: false });
    expect(normalizeProgress(book, { chapter: 9, scene: 0, finished: false })).toEqual(STORY_START);
  });
});

describe('セーブデータ（版 6）', () => {
  const context: SaveMigrationContext = { starterEquipment: {}, startingGold: 0, equipment: [], legacyUnitIds: {} };
  const unit = { id: 'touma', jobId: 'warrior', level: 1, exp: 0, growth: {}, jobs: {}, slots: {}, equipment: {} };
  const roster = { units: [unit], gold: 0, items: [], nextItemSeq: 1 } as unknown as Roster;
  const dungeon = { run: null, clears: {} };
  const records = { trainingWins: {} };

  it('版 5 → 6: 物語は「まだ始めていない」。途中の戦闘のイベントの「メッセージ」を「会話」に直す', () => {
    const state = makeState({ heights: flat(2, 2), units: [{ id: 'touma', team: 'player', x: 0, z: 0, progress: { exp: 0, jp: 0, jpTotal: 0, gainedExp: 0, gainedJp: 0, growthTotalCap: 0, masteryPending: false } }, { id: 'e', team: 'enemy', x: 1, z: 1 }] });
    const old = {
      ...state,
      scenario: { ...state.scenario, events: [{ id: 'm', trigger: { kind: 'turn', turn: 0 }, effects: [{ kind: 'message', messageId: 'hello' }], times: 1, fired: 1 }] },
    };
    const v5 = { version: 5, roster, dungeon, records, battle: { origin: { kind: 'training', tierId: 'easy' }, state: old } };
    const loaded = migrateSaveData(v5, context, SAVE_MIGRATIONS);
    expect(loaded.ok).toBe(true);
    if (!loaded.ok) return;
    expect(loaded.data.story).toEqual({});
    expect(loaded.data.battle?.state.scenario.events[0]!.effects).toEqual([{ kind: 'dialogue', scriptId: 'hello' }]);
  });

  it('物語の進み具合を保存して読み込むと戻る。形の崩れた本だけ捨てる', () => {
    const story = { trial: { chapter: 0, scene: 2, finished: false } };
    const text = JSON.stringify(createSaveData(roster, dungeon, records, null, story));
    const loaded = migrateSaveData(JSON.parse(text), context);
    expect(loaded.ok && loaded.data.story).toEqual(story);
    const broken = migrateSaveData({ ...JSON.parse(text), story: { trial: story.trial, bad: { chapter: 'x' } } }, context);
    expect(broken.ok && broken.data.story).toEqual(story);
  });

  it('物語の戦闘の途中保存は、物語の今の場面の戦闘の時だけ使う', () => {
    const state = makeState({ heights: flat(2, 2), units: [{ id: 'touma', team: 'player', x: 0, z: 0, progress: { exp: 0, jp: 0, jpTotal: 0, gainedExp: 0, gainedJp: 0, growthTotalCap: 0, masteryPending: false } }] });
    const battle = { origin: { kind: 'story' as const, bookId: 'trial', chapter: 0, scene: 2 }, state };
    expect(suspendedBattleFits(battle, roster, dungeon, { trial: { chapter: 0, scene: 2, finished: false } })).toBe(true);
    expect(suspendedBattleFits(battle, roster, dungeon, { trial: { chapter: 0, scene: 3, finished: false } })).toBe(false);
    expect(suspendedBattleFits(battle, roster, dungeon, {})).toBe(false);
  });
});

describe('確認用の機能の「場面を選ぶ」と、確認用の印（checked）', () => {
  const book: BookDefinition = {
    id: 'b',
    chapters: [
      { id: 'c1', recap: ['一'], scenes: [{ kind: 'base', id: 'a' }, { kind: 'base', id: 'b', scriptScene: 1 }] },
      { id: 'c2', recap: ['二'], scenes: [{ kind: 'base', id: 'c' }] },
    ],
  };

  it('場面の一覧は、章と場面の番号を順に並べる', () => {
    expect(sceneEntries(book).map((e) => [e.chapter, e.scene, e.chapterId, e.definition.id])).toEqual([
      [0, 0, 'c1', 'a'],
      [0, 1, 'c1', 'b'],
      [1, 0, 'c2', 'c'],
    ]);
  });

  it('選んだ場面が今の場面になり、それより前は済んだことになる。本にない場面は選べない', () => {
    const p = progressAt(book, 1, 0)!;
    expect(p).toEqual({ chapter: 1, scene: 0, finished: false, checked: true });
    expect(currentScene(book, p)?.scene.id).toBe('c');
    expect(progressAt(book, 0, 5)).toBeUndefined();
    expect(progressAt(book, 3, 0)).toBeUndefined();
  });

  it('確認用の印は、場面を進めても、最後まで終えても残る。読み込み直しても残る。ふつうに始めた進み具合には付かない', () => {
    const p = progressAt(book, 0, 1)!;
    const next = advanceScene(book, p);
    expect(next).toEqual({ chapter: 1, scene: 0, finished: false, checked: true });
    expect(advanceScene(book, next)).toMatchObject({ finished: true, checked: true });
    expect(isChecked(normalizeProgress(book, next))).toBe(true);
    expect(isChecked(advanceScene(book, STORY_START))).toBe(false);
    expect(isChecked(undefined)).toBe(false);
  });
});
