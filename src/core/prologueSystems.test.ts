import { describe, expect, it } from 'vitest';
import { applyAction, startBattle } from './battle';
import type { BattleSetup, BattleState } from './battleTypes';
import { knockbackOutcome, previewAttack } from './combat';
import { applyDirective, applyStep, EMPTY_STAGE, isStop, stageAt, type StageState } from './dialogue';
import { previewSpellAt } from './magic';
import { reachableTiles } from './movement';
import { suspendedBattleFits } from './saveData';
import { spawnTile } from './scenario';
import { parseScript, type ScriptCatalog } from './script';
import { chapterStartRecap, recapFor, validateBook, type BookDefinition } from './story';
import { buildSortie, type BattleSite } from './sortie';
import type { Roster } from './progression';
import { findSeed, flat, makeState, testFire, testJobs, testKnockback, testRules, testSpells, testStrikes } from './testSupport';

/**
 * 序章に足りない仕組み（PR A）の core の部分: 倒れない敵、戦わない背景の人々、台本の新しい指示（光・節・音・章題・持ち物・姿勢）、
 * 場面ごとの「これまで」と章の冒頭の「これまで」、章のために決めた部隊の途中の戦闘
 */

describe('倒れない敵（minHp）', () => {
  const state = (hp: number) =>
    makeState({
      heights: flat(4, 4),
      units: [
        { id: 'p', team: 'player', x: 1, z: 1, facing: 'south' },
        { id: 'g', team: 'enemy', x: 1, z: 2, facing: 'north', hp },
      ],
    });
  const unbreakable = (s: BattleState, minHp = 1): BattleState => ({ ...s, units: s.units.map((u) => (u.id === 'g' ? { ...u, minHp } : u)) });

  it('攻撃が当たっても、HP は下限より下がらず、戦闘不能にならない', () => {
    const s = unbreakable(state(3));
    const p = previewAttack(s, s.units[0]!, s.units[1]!);
    expect(p.damage).toBe(2);
    const r = findSeed(s, { type: 'attack', targetId: 'g' }, (x) => x.events.some((e) => e.type === 'attacked' && e.hit));
    const g = r.state.units.find((u) => u.id === 'g')!;
    expect(g.hp).toBe(1);
    expect(r.events.some((e) => e.type === 'defeated')).toBe(false);
    // 下限にいる時は、当ててもダメージ 0
    const again = unbreakable(state(1));
    expect(previewAttack(again, again.units[0]!, again.units[1]!).damage).toBe(0);
  });

  it('魔法・突き飛ばしの落下ダメージも、下限で止まる', () => {
    const s = unbreakable(state(2), 2);
    const spell = previewSpellAt(s, s.units[0]!, testFire, { x: 1, z: 2 });
    expect(spell.results.find((r) => r.unitId === 'g')?.hp).toBe(2);
    const kb = applyAction(
      { ...unbreakable(state(30), 25), units: unbreakable(state(30), 25).units.map((u) => (u.id === 'p' ? { ...u, strikes: [testKnockback] } : u)) },
      { type: 'attack', targetId: 'g', abilityId: 'knockback' },
    );
    expect(kb.state.units.find((u) => u.id === 'g')!.hp).toBeGreaterThanOrEqual(25);
  });

  it('配置の minHp を戦闘の状態に持つ。1 より小さい値はエラー', () => {
    const setup: BattleSetup = {
      id: 't',
      map: { id: 't', heights: flat(3, 3), terrain: ['ggg', 'ggg', 'ggg'], legend: { g: 'grass' } },
      units: [
        { id: 'p', team: 'player', jobId: 'warrior', x: 0, z: 0, facing: 'south' },
        { id: 'g', team: 'enemy', jobId: 'warrior', x: 2, z: 2, facing: 'north', minHp: 5 },
      ],
    };
    const r = startBattle(setup, testJobs, testRules, 1, testSpells, testStrikes);
    expect(r.state.units.find((u) => u.id === 'g')?.minHp).toBe(5);
    expect(() => startBattle({ ...setup, units: [setup.units[0]!, { ...setup.units[1]!, minHp: 0 }] }, testJobs, testRules, 1)).toThrow();
  });
});

describe('戦わない背景の人々', () => {
  const base = makeState({
    heights: flat(5, 1),
    units: [
      { id: 'p', team: 'player', x: 0, z: 0, facing: 'east' },
      { id: 'e', team: 'enemy', x: 2, z: 0, facing: 'west' },
    ],
  });
  const withCrowd: BattleState = { ...base, bystanders: [{ id: 'b', x: 3, z: 0, facing: 'west', look: 'worker' }] };

  it('立っているマスは、通れず止まれない（その先にも進めない）', () => {
    const tiles = reachableTiles({ ...withCrowd, units: withCrowd.units.filter((u) => u.id !== 'e') }, withCrowd.units[0]!).map((t) => t.x);
    expect(tiles).toContain(2);
    expect(tiles).not.toContain(3);
    expect(tiles).not.toContain(4);
  });

  it('突き飛ばしの押し出す先にいれば、押し出せない。増援もそのマスには出ない', () => {
    const atk = { ...withCrowd.units[0]!, x: 1 };
    expect(knockbackOutcome(withCrowd, 'p', atk, withCrowd.units[1]!).to).toBeNull();
    expect(spawnTile(withCrowd, { x: 3, z: 0 })).not.toEqual({ x: 3, z: 0 });
  });

  it('戦場の定義から戦闘の状態に入る（ユニットとは別。行動順にも入らない）', () => {
    const site: BattleSite = {
      id: 's',
      map: { id: 's', heights: flat(4, 4), terrain: ['gggg', 'gggg', 'gggg', 'gggg'], legend: { g: 'grass' } },
      playerSlots: [{ x: 0, z: 0, facing: 'south' }],
      tiers: [{ id: 'main', units: [{ id: 'e', jobId: 'warrior', x: 3, z: 3, facing: 'north' }] }],
      bystanders: [{ id: 'b', x: 2, z: 0, facing: 'south', look: 'worker' }],
    };
    const roster = {
      units: [{ id: 'touma', jobId: 'warrior', level: 1, exp: 0, growth: { maxHp: 0, maxMp: 0, attack: 0, magic: 0, speed: 0 }, jobs: { warrior: { jp: 0, jpTotal: 0, learned: [] } }, slots: { secondary: null, reaction: null, support: null, movement: null }, equipment: { weapon: null, armor: null, accessory: null } }],
      gold: 0,
      items: [],
      nextItemSeq: 1,
    } as unknown as Roster;
    const setup = buildSortie(site, 'main', roster, { jobs: testJobs, equipment: [] });
    const r = startBattle(setup, testJobs, testRules, 1, testSpells, testStrikes);
    expect(r.state.bystanders).toEqual([{ id: 'b', x: 2, z: 0, facing: 'south', look: 'worker' }]);
    expect(r.state.units.some((u) => u.id === 'b')).toBe(false);
    // 背景の人とユニットが重なる定義はエラー
    expect(() => startBattle({ ...setup, bystanders: [{ id: 'b', x: 3, z: 3, facing: 'south', look: 'worker' }] }, testJobs, testRules, 1)).toThrow();
    // JSON にそのまま変換できる
    expect(JSON.parse(JSON.stringify(r.state)).bystanders).toEqual(r.state.bystanders);
  });
});

describe('台本の新しい指示', () => {
  const catalog: ScriptCatalog = {
    gestures: ['うなずく'],
    props: ['灯', '小さな灯'],
    melodies: ['ユナの鼻歌'],
    timbres: ['鼻歌', '石'],
    sounds: ['門'],
    lightColors: ['白', '金'],
    postures: ['座る'],
  };
  const text = `@登場 ユナ 1,1 南
@章題 序章 正しい仕事
@節 ユナの鼻歌 鼻歌
ユナ「ふふ」 @持つ ユナ 小さな灯 腰 @姿勢 ユナ 座る
@節を待つ 3
@節を止める
@音 門
@光 門の光 2,3
@光 灯の光 ユナ 金
@離す ユナ 腰
@光を消す 門の光
@姿勢 ユナ 立つ
`;

  it('読める。章題で止まり、舞台の様子に持ち物・姿勢・光が残る', () => {
    const r = parseScript('t', text, catalog);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const kinds = r.script.steps.flatMap((s) => (s.kind === 'directive' ? [s.directive.kind] : s.directives.map((d) => d.kind)));
    expect(kinds).toEqual(['enter', 'chapterTitle', 'melody', 'carry', 'posture', 'melodyWait', 'melodyStop', 'sound', 'light', 'light', 'release', 'lightOff', 'posture']);
    expect(r.script.steps.filter(isStop)).toHaveLength(2);
    // 台詞の前の持ち物と姿勢
    const mid = stageAt(r.script, 4);
    expect(mid.actors['ユナ']).toMatchObject({ items: { waist: '小さな灯' }, posture: '座る' });
    const end = stageAt(r.script, r.script.steps.length);
    expect(end.actors['ユナ']?.items).toEqual({ waist: '' });
    expect(end.actors['ユナ']?.posture).toBeUndefined();
    expect(end.lights).toEqual({ 灯の光: { actor: 'ユナ', color: '金' } });
  });

  it('知らない旋律・音色・効果音・色・姿勢・持つ所と、台詞の後ろの章題は、何行目がどう悪いかを返す', () => {
    const bad = `@節 知らない節 鼻歌
@節 ユナの鼻歌 口笛
@音 太鼓
@光 a 1,1 赤
@姿勢 ユナ 寝る
@持つ ユナ 灯 頭
ユナ「あ」 @章題 序章 題
@節を待つ 一`;
    const r = parseScript('t', bad, catalog);
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.errors.map((e) => e.line)).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
    expect(r.errors[0]!.message).toContain('旋律「知らない節」はありません');
  });

  it('人物を出し直すと、持ち物と姿勢は見た目の決まりに戻る。舞台にいない人物への指示は何もしない', () => {
    let st: StageState = applyDirective(EMPTY_STAGE, { kind: 'enter', actor: 'a', x: 0, z: 0, facing: 'south' });
    st = applyDirective(st, { kind: 'carry', actor: 'a', item: '灯', slot: 'hand' });
    st = applyDirective(st, { kind: 'enter', actor: 'a', x: 1, z: 0, facing: 'south' });
    expect(st.actors.a?.items).toBeUndefined();
    expect(applyDirective(st, { kind: 'posture', actor: 'zz', posture: '座る' })).toBe(st);
    expect(applyStep(st, { kind: 'directive', line: 1, directive: { kind: 'melody', melody: 'x', timbre: 'y' } })).toBe(st);
  });
});

describe('「これまで」（場面ごと・章の冒頭）', () => {
  const book: BookDefinition = {
    id: 'main',
    chapters: [
      {
        id: 'c0',
        recap: ['序章の初め'],
        scenes: [
          { kind: 'dialogue', id: 'a', scriptId: 'a', stageId: 'r' },
          { kind: 'dialogue', id: 'b', scriptId: 'b', stageId: 'r', recap: ['堰を崩した'] },
          { kind: 'battle', id: 'c', battleId: 'x', partyId: 'p' },
        ],
      },
      { id: 'c1', recap: ['序章のあらすじ'], scenes: [{ kind: 'dialogue', id: 'a', scriptId: 'a', stageId: 'r' }] },
    ],
  };

  it('再開した時は、今の場面か、それより前で recap を書いた最後の場面の文（なければ章の文）', () => {
    expect(validateBook(book)).toEqual([]);
    expect(recapFor(book, { chapter: 0, scene: 1, finished: false })).toEqual(['堰を崩した']);
    expect(recapFor(book, { chapter: 0, scene: 2, finished: false })).toEqual(['堰を崩した']);
    expect(recapFor(book, { chapter: 1, scene: 0, finished: false })).toEqual(['序章のあらすじ']);
    expect(validateBook({ ...book, chapters: [{ ...book.chapters[0]!, scenes: [{ ...book.chapters[0]!.scenes[0]!, recap: ['1', '2', '3', '4'] }] }] })).toHaveLength(1);
  });

  it('章の冒頭: 2つ目からの章の最初の場面で、章の文を出す（本の最初の章では出さない）', () => {
    expect(chapterStartRecap(book, { chapter: 0, scene: 0, finished: false })).toEqual([]);
    expect(chapterStartRecap(book, { chapter: 1, scene: 0, finished: false })).toEqual(['序章のあらすじ']);
    expect(chapterStartRecap(book, { chapter: 1, scene: 0, finished: true })).toEqual([]);
  });
});

describe('章のために決めた部隊の、物語の戦闘の途中保存', () => {
  it('味方が経験値と JP を持たなくても、物語の今の場面の戦闘なら使う（訓練戦なら捨てる）', () => {
    const state = makeState({ heights: flat(2, 2), units: [{ id: 'touma', team: 'player', x: 0, z: 0 }, { id: 'e', team: 'enemy', x: 1, z: 1 }] });
    const roster = { units: [], gold: 0, items: [], nextItemSeq: 1 } as unknown as Roster;
    const dungeon = { run: null, clears: {} };
    const story = { main: { chapter: 0, scene: 2, finished: false } };
    expect(suspendedBattleFits({ origin: { kind: 'story', bookId: 'main', chapter: 0, scene: 2 }, state }, roster, dungeon, story)).toBe(true);
    expect(suspendedBattleFits({ origin: { kind: 'story', bookId: 'main', chapter: 0, scene: 1 }, state }, roster, dungeon, story)).toBe(false);
    expect(suspendedBattleFits({ origin: { kind: 'training', tierId: 'easy' }, state }, roster, dungeon, story)).toBe(false);
  });
});
