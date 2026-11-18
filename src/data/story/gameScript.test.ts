import { describe, expect, it } from 'vitest';
import gameScript from '../../../docs/story/game-script-prologue.md?raw';
import { parseScriptOrThrow, plainText, type Directive, type ScriptStep } from '../../core/script';
import { hillBattle, weirBattle } from '../battles/prologue';
import { currentScene, progressAt } from '../../core/story';
import { applyDirective } from '../../core/dialogue';
import { mainBook } from './books';
import { scriptTexts } from './scripts';
import { scriptCatalog } from './stageDefs';
import { stages } from './stages';

/**
 * 序章の台本が、ゲーム脚本（docs/story/game-script-prologue.md）の表の行と1対1で対応しているか。
 * 台本の `@脚本 場面-行` の印から次の印までが、その行を作る指示の組。戦闘の途中の行（勝ち方・手ほどき・膝をつく）は、戦場の定義で確かめる。
 */

interface Row {
  readonly scene: number;
  readonly row: number;
  readonly kind: string;
  readonly content: string;
}

/** 脚本の表を読む（場面の見出しの後の「| # | 種類 | 内容 |」の表） */
function readRows(md: string): Row[] {
  const rows: Row[] = [];
  let scene = -1;
  for (const line of md.split('\n')) {
    const h = /^## 場面(\d+)/.exec(line);
    if (h) scene = Number(h[1]);
    const m = /^\| (\d+) \| (札|台詞|動き|カメラ|物|音|字幕|操作|戦闘) \| (.*) \|$/.exec(line);
    if (m && scene >= 0) rows.push({ scene, row: Number(m[1]), kind: m[2]!, content: m[3]! });
  }
  return rows;
}

/** 脚本の場面 → その場面を作る台本 */
const SCENE_SCRIPTS: Readonly<Record<number, readonly string[]>> = {
  0: ['prologueOpen'],
  1: ['prologueWeirIntro', 'prologueWeirTag', 'prologueWeirCrack1', 'prologueWeirCrack2', 'prologueWeirCrack3', 'prologueWeirAfter'],
  2: ['prologueTower'],
  3: ['prologueHall'],
  4: ['prologueHome'],
  5: ['prologueCity'],
  6: ['prologueGate'],
  7: ['prologueHillIntro', 'prologueHillStart', 'prologueHillBell', 'prologueHillAfter'],
  8: ['prologueReturn'],
  9: ['prologueEnd'],
};
/** 戦闘の途中の行（戦場の定義で確かめる）。1-11（測り棒の札）は、手ほどきの段が出す台本 prologueWeirTag に書く */
const BATTLE_ROWS = ['1-9', '1-10', '1-13', '7-10', '7-12'];
/** 戦闘中に何度も起きる行（合わせ目が割れるたび・剣に当たるたび）。同じ印を、いくつかの台本に書く */
const REPEATED_ROWS = ['1-12', '7-11'];

interface Block {
  readonly scriptId: string;
  readonly ref: string;
  readonly steps: ScriptStep[];
}

const directivesOf = (s: ScriptStep): Directive[] => {
  const flat = (d: Directive): Directive[] => (d.kind === 'together' ? d.directives.flatMap(flat) : [d]);
  return (s.kind === 'line' ? s.directives : [s.directive]).flatMap(flat);
};

/** 台本を、脚本の行の印ごとの組に分ける（最初の印より前の手順は、場面の準備） */
function blocksOf(scriptId: string): Block[] {
  const script = parseScriptOrThrow(scriptId, scriptTexts[scriptId]!, scriptCatalog);
  const blocks: Block[] = [];
  for (const step of script.steps) {
    const cue = directivesOf(step).find((d) => d.kind === 'cue');
    if (cue && cue.kind === 'cue') blocks.push({ scriptId, ref: cue.ref, steps: [] });
    blocks[blocks.length - 1]?.steps.push(step);
  }
  return blocks;
}

const rows = readRows(gameScript);
const refOf = (r: Row) => `${r.scene}-${r.row}`;
/** 脚本の台詞の行の話者・肩書きと文（「（声のみ）」と【…】の注を除く。初めて出る人物は 話者〔肩書き〕） */
const speechOf = (r: Row) => {
  const m = /^(.+?)「(.*)」/.exec(r.content.replace(/【.*?】/g, '').trim());
  if (!m) throw new Error(`台詞を読めません: ${r.content}`);
  const who = /^(.+?)(?:〔(.+)〕)?$/.exec(m[1]!.replace('（声のみ）', ''))!;
  return { speaker: who[1]!, title: who[2], voiceOnly: m[1]!.includes('（声のみ）'), text: m[2]! };
};
/** 字幕の行の文と、暗転の上に出すか（「暗転の上に出す。「…」」の形） */
const captionOf = (r: Row) => {
  const m = /^暗転の上に出す。「(.*)」$/.exec(r.content);
  return m ? { text: m[1]!, overDark: true } : { text: r.content, overDark: false };
};
const allBlocks = Object.values(SCENE_SCRIPTS).flat().flatMap(blocksOf);
const lineSteps = (b: Block) => b.steps.flatMap((s) => (s.kind === 'line' ? [s] : []));

describe('序章の台本とゲーム脚本の対応', () => {
  it('脚本の表は10場面で、行を読める', () => {
    expect(new Set(rows.map((r) => r.scene))).toEqual(new Set([0, 1, 2, 3, 4, 5, 6, 7, 8, 9]));
    expect(rows.length).toBeGreaterThan(150);
    // 本の場面は、脚本の10場面の並び（場面1と7は、戦闘の前・戦闘の2つ）
    expect(mainBook.chapters[0]!.scenes.map((s) => s.id)).toEqual(['open', 'weir-intro', 'weir', 'tower', 'hall', 'home', 'city', 'gate', 'hill-intro', 'hill', 'return', 'end']);
  });

  it('脚本の行（戦闘の途中を除く）ごとに、台本にちょうど1つの印がある。印は脚本の行の順に並ぶ', () => {
    for (const r of rows) {
      const ref = refOf(r);
      const found = allBlocks.filter((b) => b.ref === ref);
      if (BATTLE_ROWS.includes(ref)) expect(found, ref).toHaveLength(0);
      else if (REPEATED_ROWS.includes(ref)) expect(found.length, ref).toBeGreaterThanOrEqual(1);
      else expect(found, ref).toHaveLength(1);
    }
    // 台本の印は、脚本にある行か「外」だけ。1つの台本の中では、脚本の行の順
    const known = new Set(rows.map(refOf));
    for (const [scene, ids] of Object.entries(SCENE_SCRIPTS)) {
      for (const id of ids) {
        const refs = blocksOf(id)
          .map((b) => b.ref)
          .filter((r) => r !== '外');
        for (const r of refs) {
          expect(known.has(r), `${id}: ${r}`).toBe(true);
          expect(r.split('-')[0], `${id}: ${r}`).toBe(scene);
        }
        const nums = refs.map((r) => Number(r.split('-')[1]));
        expect([...nums].sort((a, b) => a - b), id).toEqual(nums);
      }
    }
  });

  it('台詞の行は、脚本の話者と文のまま（【地の文から】の注は出さない）。声だけの話者は顔の枠を出さない', () => {
    for (const r of rows.filter((x) => x.kind === '台詞')) {
      const want = speechOf(r);
      const block = allBlocks.find((b) => b.ref === refOf(r))!;
      const lines = lineSteps(block).filter((l) => !l.inscription);
      expect(lines, refOf(r)).toHaveLength(1);
      const line = lines[0]!;
      expect({ speaker: line.speaker, text: plainText(line.text), title: line.speakerTitle }, refOf(r)).toEqual({ speaker: want.speaker, text: want.text, title: want.title });
      if (want.voiceOnly) expect(line.portrait, refOf(r)).toBe(false);
    }
  });

  it('字幕の行は、脚本の文のまま（「 / 」は字幕の改行）。「暗転の上に出す」字幕は、暗転の上に出す', () => {
    for (const r of rows.filter((x) => x.kind === '字幕')) {
      const block = allBlocks.find((b) => b.ref === refOf(r))!;
      const narr = lineSteps(block).filter((l) => l.speaker === null);
      expect(narr, refOf(r)).toHaveLength(1);
      const want = captionOf(r);
      expect(plainText(narr[0]!.text).replace('\n', ' / '), refOf(r)).toBe(want.text);
      expect(narr[0]!.overDark === true, refOf(r)).toBe(want.overDark);
    }
  });

  it('札の行は、場所と時の札（@札）として、脚本の文のまま出す。札は字幕の行に数えない', () => {
    const placards = rows.filter((x) => x.kind === '札');
    expect(placards.length).toBeGreaterThanOrEqual(14);
    for (const r of placards) {
      const block = allBlocks.find((b) => b.ref === refOf(r))!;
      const ps = block.steps.flatMap(directivesOf).filter((d) => d.kind === 'placard');
      expect(ps.map((d) => (d.kind === 'placard' ? d.text : '')), refOf(r)).toEqual([r.content]);
      expect(lineSteps(block), refOf(r)).toEqual([]);
    }
    // 台本の札は、すべて脚本の札の行にある。時守のいる時代の札には「今」か「過去」が付く（トウマの家と都の通りは、家族と都の人々の場所）
    const all = allBlocks.flatMap((b) => b.steps.flatMap(directivesOf)).filter((d) => d.kind === 'placard');
    expect(all.length).toBe(placards.length);
    for (const d of all) if (d.kind === 'placard' && /堰|丘/.test(d.text)) expect(d.era).toBe('過去');
  });

  it('場面の頭の字幕は、暗転の上に出してから画を見せる（場面1: 人物が見える前に、時と前提の字幕）', () => {
    const intro = parseScriptOrThrow('prologueWeirIntro', scriptTexts['prologueWeirIntro']!, scriptCatalog);
    const firstLine = intro.steps.findIndex((x) => x.kind === 'line');
    const fadeIn = intro.steps.findIndex((x) => x.kind === 'directive' && x.directive.kind === 'fadeIn');
    const dark = intro.steps.findIndex((x) => x.kind === 'directive' && x.directive.kind === 'fadeOut');
    expect(dark).toBeGreaterThanOrEqual(0);
    expect(dark).toBeLessThan(firstLine);
    expect(fadeIn).toBeGreaterThan(firstLine);
  });

  it('初めて出る人物の肩書きは、その人物が初めて話す台詞にだけ付く（台詞のないガレスは名札で出す）', () => {
    const titled = allBlocks.flatMap(lineSteps).filter((l) => l.speakerTitle);
    expect(titled.map((l) => `${l.speaker}〔${l.speakerTitle}〕`)).toEqual(['トウマ〔時守〕', 'イェルマ〔塔の長の補佐〕', 'ハルド〔塔の監督官〕', 'テオ〔若い時守〕', 'ユナ〔トウマの妹〕', 'ミオ〔薬屋の弟子〕']);
    const spoken = allBlocks.flatMap(lineSteps).filter((l) => !l.inscription && l.speaker !== null);
    for (const l of titled) expect(spoken.find((x) => x.speaker === l.speaker), l.speaker!).toBe(l);
    // 名札に「名前〔肩書き〕」と書かれた行は、@名札 で出す
    for (const r of rows.filter((x) => x.content.includes('名札に「'))) {
      const m = /名札に「(.+?)〔(.+?)〕」/.exec(r.content)!;
      const block = allBlocks.find((b) => b.ref === refOf(r))!;
      expect(block.steps.flatMap(directivesOf).filter((d) => d.kind === 'nameTag'), refOf(r)).toEqual([{ kind: 'nameTag', actor: m[1], title: m[2] }]);
    }
  });

  it('秒数の書かれたカットは、その秒で次へ移る（映す・秒を決めた物の文字）', () => {
    const timed = rows.filter((x) => /([\d.]+)秒で次へ）/.test(x.content));
    expect(timed.map(refOf)).toEqual(['3-2', '3-3', '3-11', '3-15']);
    for (const r of timed) {
      const sec = Number(/([\d.]+)秒で次へ）/.exec(r.content)![1]);
      const block = allBlocks.find((b) => b.ref === refOf(r))!;
      const shots = block.steps.flatMap(directivesOf).flatMap((d) => (d.kind === 'shot' ? [d.ms] : []));
      const ins = lineSteps(block).flatMap((l) => (l.inscription && l.autoMs !== undefined ? [l.autoMs] : []));
      expect([...shots, ...ins], refOf(r)).toEqual([sec * 1000]);
    }
  });

  it('物の行に書かれた文字（「」の中）は、物の文字として、読める大きさで出す', () => {
    for (const r of rows.filter((x) => x.kind === '物' && x.content.includes('「'))) {
      const text = /「(.*)」/.exec(r.content)![1]!;
      const block = allBlocks.find((b) => b.ref === refOf(r))!;
      const ins = lineSteps(block).filter((l) => l.inscription);
      expect(ins.map((l) => plainText(l.text)), refOf(r)).toEqual([text]);
    }
  });

  it('動き・カメラ・物・音の行は、それを見せる指示を持つ（文で説明しない: 台詞も語りも足さない）', () => {
    const show: Record<string, readonly Directive['kind'][]> = {
      動き: ['gesture', 'walk', 'face', 'posture', 'enter', 'exit', 'give', 'propRemove', 'propChange', 'propMove', 'strike', 'pushBack', 'light'],
      カメラ: ['camera', 'shot', 'location', 'cut', 'overlay'],
      物: ['propPut', 'propRemove', 'propChange', 'give', 'carry', 'camera', 'shot'],
      音: ['sound', 'melody', 'melodyWait', 'melodyStop', 'melodyCut', 'voice', 'listen', 'fadeOut'],
    };
    for (const r of rows) {
      const kinds = show[r.kind];
      if (!kinds || BATTLE_ROWS.includes(refOf(r))) continue;
      for (const block of allBlocks.filter((b) => b.ref === refOf(r))) {
        const ds = block.steps.flatMap(directivesOf).map((d) => d.kind);
        // 書かれた文字を見せる物の行は、物の文字で見せる
        const inscribed = r.kind === '物' && lineSteps(block).some((l) => l.inscription);
        expect(
          inscribed || ds.some((k) => kinds.includes(k)),
          `${refOf(r)}（${r.kind}）: ${ds.join(',')}`,
        ).toBe(true);
        // 物の文字のほかに、台詞や語りを足さない
        expect(lineSteps(block).filter((l) => !l.inscription), refOf(r)).toEqual([]);
      }
    }
  });

  it('脚本の台詞と字幕は、すべて台本にある。台本に、脚本にない台詞と語りはない', () => {
    const want = rows.filter((r) => r.kind === '台詞').map((r) => `${speechOf(r).speaker}:${speechOf(r).text}`);
    const wantNarr = rows.filter((r) => r.kind === '字幕').map((r) => captionOf(r).text);
    const lines = allBlocks.flatMap(lineSteps).filter((l) => !l.inscription);
    // 最初の印より前（場面の準備）にも、台詞は書かない
    const all = Object.values(SCENE_SCRIPTS)
      .flat()
      .flatMap((id) => parseScriptOrThrow(id, scriptTexts[id]!, scriptCatalog).steps.flatMap((s) => (s.kind === 'line' && !s.inscription ? [s] : [])));
    expect(all.length).toBe(lines.length);
    expect(lines.filter((l) => l.speaker !== null).map((l) => `${l.speaker}:${plainText(l.text)}`)).toEqual(want);
    expect(lines.filter((l) => l.speaker === null).map((l) => plainText(l.text).replace('\n', ' / '))).toEqual(wantNarr);
  });

  it('「外」の印（ゲームとして足した演出）は、章の題だけで、台詞も語りも持たない（操作の場面は、改訂した脚本の「操作」の行）', () => {
    const outside = allBlocks.filter((x) => x.ref === '外');
    expect(outside).toHaveLength(1);
    for (const b of outside) {
      const ds = b.steps.flatMap(directivesOf).filter((d) => d.kind !== 'cue');
      expect(lineSteps(b), b.scriptId).toEqual([]);
      for (const d of ds) expect(['chapterTitle'], `${b.scriptId}: ${d.kind}`).toContain(d.kind);
    }
    // 操作の場面（歩かせる・タップ・聞く）は、脚本の「操作」の行の組にある
    for (const b of allBlocks) {
      const ops = b.steps.flatMap(directivesOf).filter((d) => ['walkControl', 'tapControl', 'listen'].includes(d.kind));
      if (ops.length === 0) continue;
      const row = rows.find((r) => refOf(r) === b.ref);
      // 歩かせる操作の続き（見知らぬ男の礼の後、戸の前まで）は、「戸の前で立ち止まる」動きの行に書く
      expect(row && (row.kind === '操作' || b.ref === '9-6'), `${b.scriptId}: ${b.ref}`).toBe(true);
    }
  });

  it('場面9で石が鳴る時、終わりの三つの音でユナの指（場面4の作業台）を重ねる。場面4のユナの部屋と場面9の物置は、同じ窓と同じ構図', () => {
    const end = blocksOf('prologueEnd');
    const b23 = end.find((b) => b.ref === '9-23')!;
    const ds = b23.steps.flatMap(directivesOf);
    expect(ds.filter((d) => d.kind === 'melodyWait')).toEqual([{ kind: 'melodyWait', remaining: 3 }]);
    expect(ds.filter((d) => d.kind === 'overlay').map((d) => (d.kind === 'overlay' ? d.scriptId : ''))).toEqual(['prologueYunaHands']);
    // 重ねる画: ユナの指が三度叩く（顔は映さない: 後ろから手もとへ寄る）
    const hands = parseScriptOrThrow('prologueYunaHands', scriptTexts['prologueYunaHands']!, scriptCatalog).steps.flatMap(directivesOf);
    expect(hands).toContainEqual({ kind: 'gesture', actor: 'ユナ', gesture: '三度叩く' });
    expect(hands).toContainEqual({ kind: 'enter', actor: 'ユナ', x: 7, z: 2, facing: 'north' });
    // 同じ部屋（家のマップ）・同じ窓（マップに置いた物）・同じ構図（同じカメラの指示）
    const room4 = blocksOf('prologueHome').find((b) => b.ref === '4-15')!.steps.flatMap(directivesOf).find((d) => d.kind === 'camera');
    const room9 = end.find((b) => b.ref === '9-17')!.steps.flatMap(directivesOf).find((d) => d.kind === 'camera');
    expect(room9).toEqual(room4);
    const homeStageDef = stages.find((st) => st.id === 'stage-home')!;
    expect(homeStageDef.props?.find((p) => p.kind === '窓')).toBeDefined();
    // 場面4の鼻歌は二度: 一度目は終わりの三つの音の手前で戸の開く音に切られ、二度目は終わりの三つの音まで歌う
    const home = blocksOf('prologueHome');
    const first = home.find((b) => b.ref === '4-2')!.steps.flatMap(directivesOf);
    expect(first).toContainEqual({ kind: 'melody', melody: 'ユナの鼻歌', timbre: '鼻歌' });
    expect(first).toContainEqual({ kind: 'melodyCut', sound: '戸の開く音', remaining: 3 });
    const second = [...home.find((b) => b.ref === '4-24')!.steps, ...home.find((b) => b.ref === '4-25')!.steps].flatMap(directivesOf);
    expect(second).toContainEqual({ kind: 'melody', melody: 'ユナの鼻歌', timbre: '鼻歌' });
    expect(second).toContainEqual({ kind: 'melodyWait', remaining: 0 });
    expect(second.some((d) => d.kind === 'melodyCut')).toBe(false);
  });

  it('戦闘の途中の行は、戦場の定義にある（勝ち方・手ほどき・膝をつく・音）', () => {
    // 1-9: 合わせ目を3か所壊すと勝ち。番兵は退場しない（1-13: 膝をついたまま残る）。隊員の名札に役目を添える
    expect(weirBattle.roleTags).toEqual(['gord', 'kiri', 'fen', 'nono']);
    expect(hillBattle.roleTags).toEqual(['gord', 'kiri', 'fen', 'nono']);
    expect(weirBattle.objectives?.victory[0]).toMatchObject({ kind: 'destroyObjects', unitIds: ['weir-seam-1', 'weir-seam-2', 'weir-seam-3'] });
    const guards = weirBattle.tiers[0]!.units.filter((u) => u.id.startsWith('weir-guard'));
    expect(guards.length).toBe(3);
    for (const g of guards) expect(g.noRetire).toBe(true);
    // 1-10: 手ほどき（ゴードを前へ、キリを崖の上へ、フェンの火）。キリを崖の上へ動かすと、測り棒の札（1-11。台本 prologueWeirTag）を出す
    const steps = weirBattle.tutorial ?? [];
    expect(steps.find((s) => s.unitId === 'gord')).toBeDefined();
    expect(steps.find((s) => s.unitId === 'kiri' && s.mode === 'main')).toBeDefined();
    expect(steps.find((s) => s.id === 'weir-high')).toMatchObject({ unitId: 'kiri', minHeight: 3, scriptId: 'prologueWeirTag' });
    expect(steps.find((s) => s.unitId === 'fen')).toBeDefined();
    // 1-12: 合わせ目が割れるたびの音
    const crack = (weirBattle.events ?? []).filter((e) => e.trigger.kind === 'objectsBroken').flatMap((e) => e.effects.flatMap((x) => (x.kind === 'dialogue' ? [x.scriptId] : [])));
    expect(crack).toEqual(['prologueWeirCrack1', 'prologueWeirCrack2', 'prologueWeirCrack3']);
    // 7-10: 誓いの剣に4回当てると折れる。最後の一撃はトウマだけ。ガレスの HP は尽きない。衛士は膝をつく
    expect(hillBattle.objectives?.victory[0]).toMatchObject({ kind: 'hitUnit', unitId: 'hill-gareth', times: 4, finisherId: 'touma' });
    expect(hillBattle.tiers[0]!.units.find((u) => u.id === 'hill-gareth')?.minHp).toBe(1);
    expect(hillBattle.tiers[0]!.units.filter((u) => u.id.startsWith('hill-sentry') && u.noRetire)).toHaveLength(2);
    // 7-11: 剣に当たるたびに鐘のような音。歌は戦闘中も遠くで続く
    const bells = (hillBattle.events ?? []).filter((e) => e.trigger.kind === 'tally');
    expect(bells).toHaveLength(3);
    expect(hillBattle.ambient).toMatchObject({ melody: '月を呼ぶ節' });
    // 7-12: 3回目が当たった後、案内「最後の一撃は、トウマで」
    expect(hillBattle.tutorial?.[0]).toMatchObject({ id: 'hill-finisher', tally: { id: 'oath-sword', atLeast: 3 } });
  });
});

describe('場面を選ぶ（確認用の機能）の番号と、序章のすべての場面からの始まり', () => {
  /** 脚本の場面の見出し（## 場面4（全角の空白）家・夕食とユナの部屋の夜）→ 番号と名前 */
  const headings = [...gameScript.matchAll(/^## 場面(\d+)\s+(.+)$/gm)].map((m) => ({ n: Number(m[1]), name: m[2]!.replace(/（.*）$/, '').trim() }));
  const scenes = mainBook.chapters[0]!.scenes;

  it('序章の場面はすべて、脚本の場面の番号を持つ。番号は脚本の順に並び、脚本のすべての場面がある', () => {
    expect(headings.map((h) => h.n)).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8, 9]);
    const nums = scenes.map((s) => s.scriptScene);
    expect(nums.every((n) => n !== undefined)).toBe(true);
    expect([...new Set(nums)]).toEqual(headings.map((h) => h.n));
    expect([...nums].sort((a, b) => a! - b!)).toEqual(nums);
  });

  it('序章のすべての場面から始められる: 選んだ場面が今の場面になり、その場面の台本・会話のマップ・戦場がある', () => {
    for (const [i, s] of scenes.entries()) {
      const p = progressAt(mainBook, 0, i)!;
      expect(currentScene(mainBook, p)?.scene.id, s.id).toBe(s.id);
      expect(p.checked).toBe(true);
      if (s.kind === 'dialogue' || s.kind === 'interactive') {
        expect(scriptTexts[s.scriptId], s.id).toBeDefined();
        parseScriptOrThrow(s.scriptId, scriptTexts[s.scriptId]!, scriptCatalog);
      }
      if (s.kind === 'battle') expect([weirBattle.id, hillBattle.id], s.id).toContain(s.battleId);
    }
  });
});

describe('場面9の帰り道（発注者の回答）', () => {
  it('パン屋のおかみ・薬屋の老婆・ミオが朝と同じ場所にいる。ミオは薬屋の奥で薬研を持つ。三人とも台詞も会釈もない。売り子とユナはいない', () => {
    const steps = parseScriptOrThrow('prologueEnd', scriptTexts['prologueEnd']!, scriptCatalog).steps;
    const ds = steps.flatMap(directivesOf);
    const morning = parseScriptOrThrow('prologueCity', scriptTexts['prologueCity']!, scriptCatalog).steps.flatMap(directivesOf);
    for (const who of ['パン屋のおかみ', '薬屋の老婆', 'ミオ']) {
      const at = (list: Directive[]) => list.find((d) => d.kind === 'enter' && d.actor === who);
      expect(at(ds), who).toEqual(at(morning));
      expect(ds.some((d) => (d.kind === 'gesture' || d.kind === 'walk' || d.kind === 'voice') && d.actor === who), who).toBe(false);
      expect(steps.some((x) => x.kind === 'line' && x.speaker === who), who).toBe(false);
    }
    expect(ds).toContainEqual({ kind: 'carry', actor: 'ミオ', item: '薬研', slot: 'hand' });
    expect(ds.some((d) => d.kind === 'enter' && (d.actor === '売り子' || d.actor === 'ユナ'))).toBe(false);
  });
});

describe('場面の時刻の光（札の時刻に合う光）', () => {
  /** 札の文から、その場面の時刻（夕方・夜・朝。時刻を書いていない札は、続く場面の光のまま（undefined）） */
  const timeOfPlacard = (t: string) => (t.includes('夜') ? '夜' : t.includes('夕方') ? '夕方' : t.includes('朝') ? '朝' : undefined);
  it('序章の会話の場面で、札が出る時の光は、札の時刻に合う。場面4のユナの部屋は夜、場面9の物置は夕方', () => {
    const seen: string[] = [];
    for (const sc of mainBook.chapters[0]!.scenes) {
      if (sc.kind !== 'dialogue' && sc.kind !== 'interactive') continue;
      const script = parseScriptOrThrow(sc.scriptId, scriptTexts[sc.scriptId]!, scriptCatalog);
      let st = { actors: {}, props: {}, dark: false } as import('../../core/dialogue').StageState;
      for (const step of script.steps) {
        for (const d of step.kind === 'line' ? step.directives : [step.directive]) {
          st = applyDirective(st, d);
          if (d.kind !== 'placard') continue;
          const where = stages.find((x) => x.id === (st.location ?? sc.stageId))!;
          const now = st.time ?? where.time ?? '昼';
          const want = timeOfPlacard(d.text);
          if (want) expect(now, `${sc.id}: ${d.text}`).toBe(want);
          seen.push(`${d.text}:${now}`);
        }
      }
    }
    expect(seen).toContain('トウマの家　ユナの部屋　夜:夜');
    expect(seen).toContain('トウマの家　奥の部屋:夕方');
    expect(seen).toContain('都の通り　翌朝:朝');
    // 戦場の光: 堰は昼、丘は建国の朝
    expect([weirBattle.time, hillBattle.time]).toEqual(['昼', '朝']);
  });

  it('場面4の夜のユナの部屋は、星の見える窓とともった灯。場面9の物置は同じ窓のまま（光だけが違う）', () => {
    const home = blocksOf('prologueHome').find((b) => b.ref === '4-14')!.steps.flatMap(directivesOf);
    expect(home).toContainEqual({ kind: 'timeOfDay', time: '夜' });
    expect(home).toContainEqual({ kind: 'propChange', name: '窓', prop: '星の見える窓' });
    expect(home.some((d) => d.kind === 'propPut' && d.prop === '台のともった灯')).toBe(true);
    const end = parseScriptOrThrow('prologueEnd', scriptTexts['prologueEnd']!, scriptCatalog).steps.flatMap(directivesOf);
    expect(end.some((d) => d.kind === 'propChange' && d.name === '窓')).toBe(false);
  });
});
