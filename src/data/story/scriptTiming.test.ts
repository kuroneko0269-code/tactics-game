import { describe, expect, it } from 'vitest';
import { parseScriptOrThrow } from '../../core/script';
import { estimateScriptMs } from '../../core/scriptTiming';
import { scriptTexts } from './scripts';
import { scriptCatalog } from './stageDefs';
import { SCRIPT_TIMING } from './scriptTiming';

/** 序章の場面ごとの見込みの時間（戦闘の操作の時間を除く）。ゲーム脚本の見込みは、会話の合計で約6分50秒 */
const PROLOGUE_SCENES: readonly { readonly name: string; readonly scripts: readonly string[]; readonly plan: number }[] = [
  { name: '場面0 冒頭の先出し', scripts: ['prologueOpen'], plan: 20 },
  { name: '場面1 堰（戦闘の前と勝った後）', scripts: ['prologueWeirIntro', 'prologueWeirAfter'], plan: 50 },
  { name: '場面2 暦の塔・門と報告の部屋', scripts: ['prologueTower'], plan: 30 },
  { name: '場面3 暦の塔・円卓の広間', scripts: ['prologueHall'], plan: 55 },
  { name: '場面4 家・夕食と工房の夜', scripts: ['prologueHome'], plan: 65 },
  { name: '場面5 都と橋', scripts: ['prologueCity'], plan: 50 },
  { name: '場面6 塔の門', scripts: ['prologueGate'], plan: 15 },
  { name: '場面7 建国の丘（戦闘の前と勝った後）', scripts: ['prologueHillIntro', 'prologueHillStart', 'prologueHillAfter'], plan: 60 },
  { name: '場面8 塔へ帰る', scripts: ['prologueReturn'], plan: 30 },
  { name: '場面9 家までの道と物置', scripts: ['prologueEnd'], plan: 40 },
];

const seconds = (ids: readonly string[]) => ids.reduce((sum, id) => sum + estimateScriptMs(parseScriptOrThrow(id, scriptTexts[id]!, scriptCatalog), SCRIPT_TIMING), 0) / 1000;

describe('序章の見込みの時間', () => {
  it('場面ごとの見込み（npm run script-rules で一覧を出す）。会話の合計は、脚本の見込み（約6分50秒）から大きく外れない', () => {
    const rows = PROLOGUE_SCENES.map((s) => ({ ...s, est: Math.round(seconds(s.scripts)) }));
    const total = rows.reduce((a, r) => a + r.est, 0);
    const fmt = (sec: number) => `${Math.floor(sec / 60)}分${String(sec % 60).padStart(2, '0')}秒`;
    console.log(['序章の見込みの時間（脚本の見込み → 台本の見込み）', ...rows.map((r) => `${r.name}: ${r.plan}秒 → ${r.est}秒`), `合計: ${fmt(410)} → ${fmt(total)}`].join('\n'));
    expect(total).toBeGreaterThan(300);
    expect(total).toBeLessThan(540);
  });
});
