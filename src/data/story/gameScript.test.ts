import { describe, expect, it } from 'vitest';
import gameScript from '../../../docs/story/game-script-prologue.md?raw';
import { parseScriptOrThrow, plainText, type Directive, type ScriptStep } from '../../core/script';
import { hillBattle, weirBattle } from '../battles/prologue';
import { mainBook } from './books';
import { scriptTexts } from './scripts';
import { scriptCatalog } from './stageDefs';

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
    const m = /^\| (\d+) \| (台詞|動き|カメラ|物|音|字幕|操作|戦闘) \| (.*) \|$/.exec(line);
    if (m && scene >= 0) rows.push({ scene, row: Number(m[1]), kind: m[2]!, content: m[3]! });
  }
  return rows;
}

/** 脚本の場面 → その場面を作る台本 */
const SCENE_SCRIPTS: Readonly<Record<number, readonly string[]>> = {
  0: ['prologueOpen'],
  1: ['prologueWeirIntro', 'prologueWeirCrack1', 'prologueWeirCrack2', 'prologueWeirCrack3', 'prologueWeirAfter'],
  2: ['prologueTower'],
  3: ['prologueHall'],
  4: ['prologueHome'],
  5: ['prologueCity'],
  6: ['prologueGate'],
  7: ['prologueHillIntro', 'prologueHillStart', 'prologueHillBell', 'prologueHillAfter'],
  8: ['prologueReturn'],
  9: ['prologueEnd'],
};
/** 戦闘の途中の行（戦場の定義で確かめる） */
const BATTLE_ROWS = ['1-8', '1-9', '1-11', '7-9', '7-11'];
/** 戦闘中に何度も起きる行（合わせ目が割れるたび・剣に当たるたび）。同じ印を、いくつかの台本に書く */
const REPEATED_ROWS = ['1-10', '7-10'];

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
/** 脚本の台詞の行の話者と文（「（声のみ）」と【…】の注を除く） */
const speechOf = (r: Row) => {
  const m = /^(.+?)「(.*)」/.exec(r.content.replace(/【.*?】/g, '').trim());
  if (!m) throw new Error(`台詞を読めません: ${r.content}`);
  return { speaker: m[1]!.replace('（声のみ）', ''), voiceOnly: m[1]!.includes('（声のみ）'), text: m[2]! };
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
      expect({ speaker: line.speaker, text: plainText(line.text) }, refOf(r)).toEqual({ speaker: want.speaker, text: want.text });
      if (want.voiceOnly) expect(line.portrait, refOf(r)).toBe(false);
    }
  });

  it('字幕の行は、脚本の文のまま（「 / 」は字幕の改行）', () => {
    for (const r of rows.filter((x) => x.kind === '字幕')) {
      const block = allBlocks.find((b) => b.ref === refOf(r))!;
      const narr = lineSteps(block).filter((l) => l.speaker === null);
      expect(narr, refOf(r)).toHaveLength(1);
      expect(plainText(narr[0]!.text).replace('\n', ' / '), refOf(r)).toBe(r.content);
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
      カメラ: ['camera', 'location', 'cut'],
      物: ['propPut', 'propRemove', 'propChange', 'give', 'carry', 'camera'],
      音: ['sound', 'melody', 'melodyWait', 'melodyStop', 'voice', 'listen', 'fadeOut'],
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
    const wantNarr = rows.filter((r) => r.kind === '字幕').map((r) => r.content);
    const lines = allBlocks.flatMap(lineSteps).filter((l) => !l.inscription);
    // 最初の印より前（場面の準備）にも、台詞は書かない
    const all = Object.values(SCENE_SCRIPTS)
      .flat()
      .flatMap((id) => parseScriptOrThrow(id, scriptTexts[id]!, scriptCatalog).steps.flatMap((s) => (s.kind === 'line' && !s.inscription ? [s] : [])));
    expect(all.length).toBe(lines.length);
    expect(lines.filter((l) => l.speaker !== null).map((l) => `${l.speaker}:${plainText(l.text)}`)).toEqual(want);
    expect(lines.filter((l) => l.speaker === null).map((l) => plainText(l.text).replace('\n', ' / '))).toEqual(wantNarr);
  });

  it('「外」の印（ゲームとして足した演出）は、操作の場面と章の題だけで、台詞も語りも持たない', () => {
    for (const b of allBlocks.filter((x) => x.ref === '外')) {
      const ds = b.steps.flatMap(directivesOf).filter((d) => d.kind !== 'cue');
      expect(lineSteps(b), b.scriptId).toEqual([]);
      for (const d of ds) expect(['walkControl', 'tapControl', 'chapterTitle'], `${b.scriptId}: ${d.kind}`).toContain(d.kind);
    }
  });

  it('戦闘の途中の行は、戦場の定義にある（勝ち方・手ほどき・膝をつく・音）', () => {
    // 1-8: 合わせ目を3か所壊すと勝ち。番兵は退場しない（1-11: 膝をついたまま残る）
    expect(weirBattle.objectives?.victory[0]).toMatchObject({ kind: 'destroyObjects', unitIds: ['weir-seam-1', 'weir-seam-2', 'weir-seam-3'] });
    const guards = weirBattle.tiers[0]!.units.filter((u) => u.id.startsWith('weir-guard'));
    expect(guards.length).toBe(3);
    for (const g of guards) expect(g.noRetire).toBe(true);
    // 1-9: 手ほどき（ゴードを前へ、キリを崖の上へ、フェンの火）。崖の上に立った時、札の文字をもう一度出す
    const steps = weirBattle.tutorial ?? [];
    expect(steps.find((s) => s.unitId === 'gord')).toBeDefined();
    expect(steps.find((s) => s.unitId === 'kiri' && s.mode === 'main')).toBeDefined();
    expect(steps.find((s) => s.id === 'weir-high')).toMatchObject({ unitId: 'kiri', minHeight: 3 });
    expect(steps.find((s) => s.unitId === 'fen')).toBeDefined();
    // 1-10: 合わせ目が割れるたびの音
    const crack = (weirBattle.events ?? []).filter((e) => e.trigger.kind === 'objectsBroken').flatMap((e) => e.effects.flatMap((x) => (x.kind === 'dialogue' ? [x.scriptId] : [])));
    expect(crack).toEqual(['prologueWeirCrack1', 'prologueWeirCrack2', 'prologueWeirCrack3']);
    // 7-9: 誓いの剣に4回当てると折れる。最後の一撃はトウマだけ。ガレスの HP は尽きない。衛士は膝をつく
    expect(hillBattle.objectives?.victory[0]).toMatchObject({ kind: 'hitUnit', unitId: 'hill-gareth', times: 4, finisherId: 'touma' });
    expect(hillBattle.tiers[0]!.units.find((u) => u.id === 'hill-gareth')?.minHp).toBe(1);
    expect(hillBattle.tiers[0]!.units.filter((u) => u.id.startsWith('hill-sentry') && u.noRetire)).toHaveLength(2);
    // 7-10: 剣に当たるたびに鐘のような音。歌は戦闘中も遠くで続く
    const bells = (hillBattle.events ?? []).filter((e) => e.trigger.kind === 'tally');
    expect(bells).toHaveLength(3);
    expect(hillBattle.ambient).toMatchObject({ melody: '月を呼ぶ節' });
    // 7-11: 3回目が当たった後、案内「最後の一撃は、トウマで」
    expect(hillBattle.tutorial?.[0]).toMatchObject({ id: 'hill-finisher', tally: { id: 'oath-sword', atLeast: 3 } });
  });
});
