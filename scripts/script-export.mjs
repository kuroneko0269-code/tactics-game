/**
 * 「画面に出るものだけ」の書き出し（npm run script-export）。物語の作者が、実装が脚本のとおりかを読んで確かめるために使う。
 * 序章の場面ごとに、場所と時の札・字幕・台詞（話者と肩書きつき）・物に書かれた文字・名札・章の題・操作の案内を、出る順に並べる。
 * 伏線のカットの秒数（映す・秒を決めた物の文字・重ねる画・遠景）と、場面の光（朝・昼・夕方・夜）も、出る順に入れる。
 * 台本のデータ（src/data/story/scripts/）と章の定義・戦場の定義から自動で作る（計算は src/core/scriptExport.ts）。
 *
 * 使い方: npm run script-export                  … 画面に出す
 *         npm run script-export -- --out=ファイル  … ファイルに書く
 */
import fs from 'node:fs';
import { createServer } from 'vite';

const args = Object.fromEntries(process.argv.slice(2).map((a) => a.replace(/^--/, '').split('=')).map(([k, v]) => [k, v ?? 'true']));

const server = await createServer({ logLevel: 'error', server: { middlewareMode: true }, appType: 'custom' });
try {
  const load = (p) => server.ssrLoadModule(p);
  const { parseScriptOrThrow } = await load('/src/core/script.ts');
  const { screenTextOf, formatScreenText } = await load('/src/core/scriptExport.ts');
  const { scriptTexts } = await load('/src/data/story/scripts/index.ts');
  const { scriptCatalog } = await load('/src/data/story/stageDefs.ts');
  const { mainBook } = await load('/src/data/story/books.ts');
  const { prologueBattles } = await load('/src/data/battles/prologue/index.ts');
  const { TEXT } = await load('/src/ui/text.ts');
  const { prologueParty } = await load('/src/data/story/parties.ts');
  const { stages } = await load('/src/data/story/stages.ts');
  const { DEFAULT_TIME } = await load('/src/data/lighting.ts');
  const timeOf = (stageId) => stages.find((st) => st.id === stageId)?.time;
  /** 序章の部隊の人物のジョブ（名札に添える役目） */
  const chapterJob = (id) => prologueParty.units.find((u) => u.id === id)?.jobId;

  const labels = { walk: TEXT.dialogue.walkHint, tapDefault: TEXT.dialogue.tapHint, listenDefault: TEXT.dialogue.listenDefault, holdDefault: TEXT.dialogue.holdDefault };
  /** 台本の書き出し。会話の場面は、始めのマップから場面の光を出す（戦闘の台本は、戦場の光を見出しに出す） */
  const textOf = (id, startStage) =>
    screenTextOf(parseScriptOrThrow(id, scriptTexts[id], scriptCatalog), labels, startStage ? { startStage, timeOf, defaultTime: DEFAULT_TIME } : undefined)
      .map((t) => (t.kind === 'カット' ? { ...t, text: readableCut(t.text) } : t))
      .map(formatScreenText);
  /** カットの行の、会話用マップと回想の台本の名前を、読める言葉に直す（重ねる画は、その場所・光・動き） */
  const readableCut = (text) =>
    text
      .replace(/遠景 ([\w-]+)/, (_, id) => `遠景「${TEXT.mapNames[id] ?? id}」`)
      .replace(/。回想の台本 (\w+)）/, (_, id) => {
        const ds = parseScriptOrThrow(id, scriptTexts[id], scriptCatalog).steps.flatMap((s) => (s.kind === 'line' ? s.directives : [s.directive]));
        const loc = ds.find((d) => d.kind === 'location');
        const time = ds.find((d) => d.kind === 'timeOfDay')?.time ?? (loc ? timeOf(loc.stageId) : undefined) ?? DEFAULT_TIME;
        const moves = ds.filter((d) => d.kind === 'gesture').map((d) => `${d.actor}が${d.gesture}`);
        return `）: ${loc ? (TEXT.mapNames[loc.stageId] ?? loc.stageId) : ''}・光 ${time}・${moves.join('、')}`;
      });
  const lines = [];
  const chapter = mainBook.chapters[0];
  const chapterName = TEXT.story.chapters[chapter.id] ?? chapter.id;
  lines.push(
    `# ${chapterName} 画面に出るものの書き出し`,
    '',
    '（台本のデータから自動で作ったもの。行の始めが種類: 札・字幕・台詞・物の文字・名札・章の題・操作の案内。',
    '　あわせて、伏線のカットの秒数を「カット」、場面の光（朝・昼・夕方・夜）を「光」として、出る順に入れる。それ以外の動き・カメラ・音は書かない）',
    '',
  );
  for (const sc of chapter.scenes) {
    lines.push(`## ${TEXT.story.sceneLabel(chapterName, sc.scriptScene, TEXT.story.scenes[sc.id] ?? sc.id)}`, '');
    if (sc.kind === 'dialogue' || sc.kind === 'interactive') {
      lines.push(...textOf(sc.scriptId, sc.stageId));
    } else if (sc.kind === 'battle') {
      const site = prologueBattles.find((b) => b.id === sc.battleId);
      const events = site.events ?? [];
      const dialogues = (list) => list.flatMap((e) => e.effects.flatMap((x) => (x.kind === 'dialogue' ? [x.scriptId] : [])));
      lines.push(formatScreenText({ kind: '光', text: site.time ?? DEFAULT_TIME }));
      const start = dialogues(events.filter((e) => e.trigger.kind === 'turn' && e.trigger.turn === 0));
      for (const id of start) lines.push(`（戦闘の始め）`, ...textOf(id));
      if (site.roleTags) lines.push(`（戦闘中の名札）${site.roleTags.map((id) => TEXT.roleName(TEXT.jobs[chapterJob(id)] ?? '', TEXT.unitNames[id] ?? id)).join('・')}`);
      const steps = site.tutorial ?? [];
      if (steps.length > 0) lines.push('（戦闘中の手ほどき。物の文字の段は、手ほどきを飛ばしても必ず一度出る）');
      for (const st of steps) {
        if (st.scriptId) lines.push(...textOf(st.scriptId));
        else lines.push(formatScreenText({ kind: '操作の案内', text: TEXT.tutorial.steps[st.id] ?? st.id }));
      }
      const rest = [...new Set(dialogues(events.filter((e) => !(e.trigger.kind === 'turn' && e.trigger.turn === 0))))];
      for (const id of rest) {
        const t = textOf(id);
        if (t.length > 0) lines.push(`（戦闘の途中）`, ...t);
      }
      const after = site.afterVictory ? textOf(site.afterVictory) : [];
      if (after.length > 0) lines.push('（勝った後）', ...after);
    }
    lines.push('');
  }
  const out = lines.join('\n');
  if (args.out) {
    fs.writeFileSync(args.out, out);
    console.log(`書き出しました: ${args.out}`);
  } else console.log(out);
} finally {
  await server.close();
}
