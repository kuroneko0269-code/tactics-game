import { describe, expect, it } from 'vitest';
import { applyStep, overlaysOf, skipToEnd, stageAt, EMPTY_STAGE } from './dialogue';
import { parseScript, parseScriptOrThrow, type ScriptCatalog } from './script';
import { estimateScriptMs, type ScriptTiming } from './scriptTiming';

/**
 * ゲーム脚本の改訂（2026-11-18）のための台本の書き方: 場所と時の札・暗転の上の字幕・初めて出る人物の肩書き・名札・
 * 映す秒数・短い画を重ねる・音を別の音で切る・聞く操作の間に節を待つ
 */
const catalog: ScriptCatalog = {
  gestures: ['うなずく', '三度叩く'],
  props: ['椀', '石'],
  melodies: ['ユナの鼻歌'],
  timbres: ['鼻歌', '石'],
  sounds: ['戸', '石の音'],
};
const steps = (text: string) => parseScriptOrThrow('t', text, catalog).steps;
const directivesOf = (text: string) => steps(text).flatMap((s) => (s.kind === 'directive' ? [s.directive] : s.directives));

describe('場所と時の札（@札）', () => {
  it('札の文は空白を全角の空白でつなぎ、始めの「今」「過去」を時として持つ。台詞にも字幕にもならない', () => {
    const ds = directivesOf('@札 今　暦の塔\n@札 過去 アスタルの丘 建国の朝\n@札 トウマの家　夕方');
    expect(ds).toEqual([
      { kind: 'placard', text: '今　暦の塔', era: '今' },
      { kind: 'placard', text: '過去　アスタルの丘　建国の朝', era: '過去' },
      { kind: 'placard', text: 'トウマの家　夕方' },
    ]);
    expect(steps('@札 今　暦の塔').every((s) => s.kind === 'directive')).toBe(true);
  });

  it('札は舞台を変えない', () => {
    expect(stageAt(parseScriptOrThrow('t', '@札 今　暦の塔', catalog), 1)).toEqual(EMPTY_STAGE);
  });
});

describe('暗転の上の字幕（@暗転の上）', () => {
  it('字幕の後ろに書くと、暗くなった舞台で出す（スキップしても暗いまま）', () => {
    const s = parseScriptOrThrow('t', '一日前。 @暗転の上\n@明転 0.8', catalog);
    const line = s.steps[0]!;
    expect(line).toMatchObject({ kind: 'line', speaker: null, overDark: true });
    expect(applyStep(EMPTY_STAGE, line).dark).toBe(true);
    expect(stageAt(s, 1).dark).toBe(true);
    expect(stageAt(s, 2).dark).toBe(false);
    expect(skipToEnd(s, 0, EMPTY_STAGE).stage.dark).toBe(false);
  });

  it('台詞に書いたり、1行に分けて書いたりすると、書き間違いとして知らせる', () => {
    expect(parseScript('t', 'ユナ「a」 @暗転の上', catalog).ok).toBe(false);
    expect(parseScript('t', '@暗転の上', catalog).ok).toBe(false);
  });
});

describe('初めて出る人物の肩書き（話者〔肩書き〕「台詞」）と名札（@名札）', () => {
  it('話者の後の〔〕を、その台詞だけの肩書きとして読む。話者の名前には含めない', () => {
    const s = steps('トウマ〔時守〕「ユナは」\nトウマ「ああ」\nイェルマ〔塔の長の補佐〕「お疲れさまでした」');
    expect(s[0]).toMatchObject({ speaker: 'トウマ', speakerTitle: '時守' });
    expect(s[1]).toMatchObject({ speaker: 'トウマ' });
    expect(s[1]!.kind === 'line' && s[1]!.speakerTitle).toBeUndefined();
    expect(s[2]).toMatchObject({ speaker: 'イェルマ', speakerTitle: '塔の長の補佐' });
  });

  it('名札は、台詞のない人物の名前と肩書き', () => {
    expect(directivesOf('@名札 ガレス アスタルの若き王')).toEqual([{ kind: 'nameTag', actor: 'ガレス', title: 'アスタルの若き王' }]);
    expect(parseScript('t', '@名札 ガレス', catalog).ok).toBe(false);
  });
});

describe('映す秒数（@映す）・重ねる（@重ねる）・音を切る（@節を切る）・節の頭を待つ', () => {
  it('映すは、対象と寄りと秒を持つ。秒は必ず書く', () => {
    expect(directivesOf('@映す 暦盤 近 1.5秒\n@映す 4,3 中 2')).toEqual([
      { kind: 'shot', actor: '暦盤', zoom: 'near', ms: 1500 },
      { kind: 'shot', x: 4, z: 3, zoom: 'mid', ms: 2000 },
    ]);
    expect(parseScript('t', '@映す 暦盤 近', catalog).ok).toBe(false);
  });

  it('重ねるは、回想の台本の名前と秒。1行に分けて書く（台詞の後ろや @同時 の中には書けない）', () => {
    const s = parseScriptOrThrow('t', '@重ねる prologueYunaHands 1.4', catalog);
    expect(s.steps[0]).toMatchObject({ kind: 'directive', directive: { kind: 'overlay', scriptId: 'prologueYunaHands', ms: 1400 } });
    expect(overlaysOf(s)).toEqual(['prologueYunaHands']);
    expect(parseScript('t', 'ユナ「a」 @重ねる x 1', catalog).ok).toBe(false);
    expect(parseScript('t', '@同時 @重ねる x 1 @間 1', catalog).ok).toBe(false);
  });

  it('節を切るは、効果音と、切る手前の音（終わりから数えて何個目か）', () => {
    expect(directivesOf('@節を切る 戸 3\n@節を切る 戸')).toEqual([
      { kind: 'melodyCut', sound: '戸', remaining: 3 },
      { kind: 'melodyCut', sound: '戸', remaining: 0 },
    ]);
    expect(parseScript('t', '@節を切る 太鼓 3', catalog).ok).toBe(false);
  });

  it('節を待つ 頭 は、旋律の最初の音まで待つ', () => {
    expect(directivesOf('@節を待つ 頭')).toEqual([{ kind: 'melodyWait', remaining: 0, first: true }]);
  });
});

describe('見込みの時間（新しい指示）', () => {
  const timing: ScriptTiming = {
    msPerChar: 100,
    msPerLine: 1000,
    gestureMs: { 三度叩く: 1200 },
    walkStepMs: 300,
    melodies: { ユナの鼻歌: { totalMs: 4000, noteStarts: [0, 1000, 2000, 3000] } },
    shortMs: 300,
    walkControlStepMs: 700,
    tapMs: 1500,
    listenMs: 7000,
    holdStepMs: 100,
    chapterTitleMs: 4000,
  };
  const ms = (text: string) => estimateScriptMs(parseScriptOrThrow('t', text, catalog), timing);

  it('同時の中の @間 は、その後ろの指示をその秒だけ遅らせる（映しながら、1秒後に札を出す）', () => {
    expect(ms('@同時 @映す 4,3 中 3 @間 1 @映す 4,3 中 1')).toBe(3000);
    expect(ms('@同時 @映す 4,3 中 1 @間 1 @映す 4,3 中 1.5')).toBe(2500);
    expect(ms('@同時 @映す 4,3 中 1 @間 2')).toBe(2000);
  });

  it('映すは書いた秒。札と名札は待たない', () => {
    expect(ms('@映す 4,3 中 1.5')).toBe(1500);
    expect(ms('@札 今　暦の塔\n@名札 ガレス 王')).toBe(0);
  });

  it('節を切るは、切る手前の音まで。聞く操作の間の 節を待つ・重ねる は、聞く時間に含める', () => {
    expect(ms('@節 ユナの鼻歌 鼻歌\n@節を切る 戸 2')).toBe(2000);
    expect(ms('@聞く ユナの鼻歌 石\n@節を待つ 頭\n@節を待つ 3\n@重ねる h 1.4\n@節を待つ')).toBe(7000);
    expect(ms('@重ねる h 1.4')).toBe(1700);
  });
});

describe('秒を決めた物の文字（@文字 1.5秒）', () => {
  it('物の文字として読み、出す時間を持つ。秒のない @文字 は、タップを待つ', () => {
    const s = steps('封蝋の印「未来より」 @文字 1.5秒\n札「a」 @文字');
    expect(s[0]).toMatchObject({ speaker: '封蝋の印', inscription: true, autoMs: 1500 });
    expect(s[1]).toMatchObject({ inscription: true });
    expect(s[1]!.kind === 'line' && s[1]!.autoMs).toBeUndefined();
    expect(parseScript('t', '札「a」 @文字 0秒', catalog).ok).toBe(false);
  });
});

describe('画面に出るものだけの書き出し（screenTextOf）', () => {
  it('札・字幕・台詞（肩書きつき）・物の文字・名札・章の題・操作の案内を、出る順に並べる。動きと音は出さない', async () => {
    const { screenTextOf, formatScreenText } = await import('./scriptExport');
    const s = parseScriptOrThrow(
      't',
      [
        '一日前。 @暗転の上',
        '@札 過去 谷の外れの堰',
        '@仕草 ユナ うなずく',
        'トウマ〔時守〕「ユナは」',
        '母「だれ？」 @顔なし',
        '札「高い所から\\u3000ユナ」 @文字',
        '@名札 ガレス アスタルの若き王',
        '@タップ 石 石を拾う',
        '@聞く ユナの鼻歌 石',
        '一行／二行',
      ].join('\n').replace('\\u3000', '　'),
      { ...catalog, props: [...catalog.props, '石'] },
    );
    const out = screenTextOf(s, { walk: '歩く', tapDefault: '押す', listenDefault: '聞く', holdDefault: '押し続ける' });
    expect(out).toEqual([
      { kind: '字幕', text: '一日前。（暗転の上）' },
      { kind: '札', text: '過去　谷の外れの堰' },
      { kind: '台詞', text: 'トウマ〔時守〕「ユナは」' },
      { kind: '台詞', text: '母「だれ？」（顔なし）' },
      { kind: '物の文字', text: '札「高い所から　ユナ」' },
      { kind: '名札', text: 'ガレス〔アスタルの若き王〕' },
      { kind: '操作の案内', text: '石を拾う' },
      { kind: '操作の案内', text: '聞く' },
      { kind: '字幕', text: '一行 / 二行' },
    ]);
    expect(formatScreenText(out[1]!)).toBe('札\u3000\u3000\u3000\u3000\u3000過去\u3000谷の外れの堰');
  });
});

describe('場面の時刻の光（@時刻）', () => {
  const cat: ScriptCatalog = { ...catalog, times: ['朝', '昼', '夕方', '夜'], locations: { 'stage-home': [] } };
  it('時刻の名前を読み、舞台の時刻になる。場所を移すと、移った先のマップの時刻に戻る', () => {
    const s = parseScriptOrThrow('t', '@時刻 夜\n@場所 stage-home\n@時刻 夕方', cat);
    expect(s.steps[0]).toMatchObject({ kind: 'directive', directive: { kind: 'timeOfDay', time: '夜' } });
    expect(stageAt(s, 1).time).toBe('夜');
    expect(stageAt(s, 2).time).toBeUndefined();
    expect(stageAt(s, 3).time).toBe('夕方');
  });

  it('ない時刻は、書き間違いとして知らせる', () => {
    expect(parseScript('t', '@時刻 真夜中', cat).ok).toBe(false);
  });
});

describe('書き出しのカットの秒数と場面の光', () => {
  it('映す・秒を決めた物の文字・重ねる画の秒数と、時刻が変わった所の光を、出る順に並べる', async () => {
    const { screenTextOf } = await import('./scriptExport');
    const cat: ScriptCatalog = { ...catalog, times: ['昼', '夕方', '夜'], locations: { 'stage-home': [], 'stage-tower': [] } };
    const s = parseScriptOrThrow(
      't',
      ['@札 今 暦の塔', '@映す 暦盤 近 1.5', '封蝋の印「未来より」 @文字 1.5秒', '@時刻 夜', '@場所 stage-home', '@時刻 夕方', '一行。', '@重ねる h 1.4'].join('\n'),
      cat,
    );
    const labels = { walk: '歩く', tapDefault: '押す', listenDefault: '聞く', holdDefault: '押し続ける' };
    const light = { startStage: 'stage-tower', timeOf: (id: string) => (id === 'stage-tower' ? '昼' : undefined), defaultTime: '昼' };
    expect(screenTextOf(s, labels, light)).toEqual([
      { kind: '光', text: '昼' },
      { kind: '札', text: '今　暦の塔' },
      { kind: 'カット', text: '暦盤を映す（近・1.5秒で次へ）' },
      { kind: '物の文字', text: '封蝋の印「未来より」（1.5秒で次へ）' },
      { kind: '光', text: '夕方' },
      { kind: '字幕', text: '一行。' },
      { kind: 'カット', text: '短い画を重ねる（1.4秒。回想の台本 h）' },
    ]);
    // 光の情報を渡さなければ、光は出さない
    expect(screenTextOf(s, labels).some((t) => t.kind === '光')).toBe(false);
  });
});

describe('書き出しの「すべて」の指定と、文字の案内なし', () => {
  const cat: ScriptCatalog = {
    ...catalog,
    gestures: ['うなずく', '三度叩く', '戸を開ける'],
    props: ['椀', '石', '戸', '開いた戸'],
    times: ['昼', '夕方'],
  };
  const labels = { walk: '光っているマスを押すと歩きます。', tapDefault: '押す', listenDefault: '聞く', holdDefault: '押し続ける' };

  it('文字の案内なしの台本では、操作の案内の文を出さず、操作の説明（光る印・手の絵）を出す', async () => {
    const { screenTextOf } = await import('./scriptExport');
    const s = parseScriptOrThrow('t', ['@歩かせる トウマ 1,0', '@文字の案内 なし', '@タップ 戸 戸を開ける', '@聞く ユナの鼻歌 石'].join('\n'), cat);
    const out = screenTextOf(s, labels);
    expect(out[0]).toEqual({ kind: '操作の案内', text: '光っているマスを押すと歩きます。' });
    expect(out.slice(1).map((t) => t.kind)).toEqual(['操作', '操作']);
    expect(out.some((t) => t.text === '戸を開ける')).toBe(false);
    expect(out[2]!.text).toMatch(/手の絵/);
  });

  it('すべての指定では、脚本の行の印・動き・物・カメラ・画面・間・音も、指示の順に種類つきで出す', async () => {
    const { screenTextOf, formatScreenText } = await import('./scriptExport');
    const s = parseScriptOrThrow(
      't',
      ['@脚本 4-2', '@節 ユナの鼻歌 鼻歌', '@節を切る 戸 3', '@脚本 4-3', '@同時 @仕草 トウマ 戸を開ける @変える 戸 開いた戸', '@歩く トウマ 2,3', '@カメラ ユナ 中 1秒', '@暗転 0.8', '@間 1', 'ユナ〔トウマの妹〕「おかえり」 @脚本 4-5'].join('\n'),
      cat,
    );
    const out = screenTextOf(s, labels, undefined, { all: true });
    expect(out.map(formatScreenText)).toEqual([
      '―― 脚本 4-2 ――',
      '音　　　　　節「ユナの鼻歌」（鼻歌）',
      '音　　　　　節を、終わりから3つ目の音の手前で切り、「戸」',
      '―― 脚本 4-3 ――',
      '動き　　　　（同時に）トウマ: 戸を開ける',
      '物　　　　　（同時に）戸を「開いた戸」に変える',
      '動き　　　　トウマが2,3へ歩く',
      'カメラ　　　ユナへ（中）1秒かけて',
      '画面　　　　暗転（0.8秒）',
      '間　　　　　1秒',
      '―― 脚本 4-5 ――',
      '台詞　　　　ユナ〔トウマの妹〕「おかえり」',
    ]);
    // すべての指定がなければ、文字として出るものだけ
    expect(screenTextOf(s, labels).map((t) => t.kind)).toEqual(['台詞']);
  });

  it('映す先の「の手もと」を読む', () => {
    expect(directivesOf('@映す テオの手もと 近 1.5')).toEqual([{ kind: 'shot', actor: 'テオ', hands: true, zoom: 'near', ms: 1500 }]);
  });
});
