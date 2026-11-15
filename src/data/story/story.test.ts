import { describe, expect, it } from 'vitest';
import { applyStep, EMPTY_STAGE, type StageState } from '../../core/dialogue';
import { createMap, getTile } from '../../core/map';
import { parseScript } from '../../core/script';
import { validateBook } from '../../core/story';
import { startBattle } from '../../core/battle';
import { buildSortie } from '../../core/sortie';
import { battleRules } from '../battleRules';
import { prologueBattles } from '../battles/prologue';
import { ruinsDungeon } from '../battles/ruins';
import { jobs } from '../jobs';
import { equipment } from '../equipment';
import { spells, strikes } from '../abilities';
import { passives } from '../passives';
import { books, mainBook } from './books';
import { scriptTexts } from './scripts';
import { ACTOR_LOOKS, GESTURES, PROP_KINDS, scriptCatalog } from './stageDefs';
import { stageMap, stages } from './stages';
import { MODELS } from './models';
import { LOOKS } from './looks';
import { parties } from './parties';
import { characterIds } from '../characters';
import { validateRoster } from '../../core/progression';
import { progressionRules } from '../progression';
import type { BattleSite } from '../../core/sortie';

/** 物語の定義データ（台本・本・会話の場面のマップ）が、core で正しく読めるか */
describe('物語の定義データ', () => {
  it('すべての台本が読める（書き間違いがない）', () => {
    for (const [id, text] of Object.entries(scriptTexts)) {
      const r = parseScript(id, text, scriptCatalog);
      expect(r.ok ? [] : r.errors.map((e) => `${id} ${e.line}行目: ${e.message}`)).toEqual([]);
    }
  });

  it('本の場面は、ある台本・会話のマップ・戦場を指している。本編の本に書き間違いはない', () => {
    expect(validateBook(mainBook)).toEqual([]);
    const sites = prologueBattles.map((b) => b.id);
    for (const book of books) {
      for (const c of book.chapters) {
        for (const s of c.scenes) {
          if (s.kind === 'dialogue' || s.kind === 'interactive') {
            expect(scriptTexts[s.scriptId], s.scriptId).toBeDefined();
            expect(stages.some((st) => st.id === s.stageId), s.stageId).toBe(true);
          }
          if (s.kind === 'battle') expect(sites).toContain(s.battleId);
        }
      }
    }
  });

  it('会話の場面の人物と物は、マップの中に立ち、歩かせる道は今いるマスの隣から始まる', () => {
    for (const book of books) {
      for (const c of book.chapters) {
        for (const s of c.scenes) {
          if (s.kind !== 'dialogue' && s.kind !== 'interactive') continue;
          const map = createMap(stages.find((st) => st.id === s.stageId)!.map);
          const r = parseScript(s.scriptId, scriptTexts[s.scriptId]!, scriptCatalog);
          if (!r.ok) throw new Error(s.scriptId);
          let stage: StageState = EMPTY_STAGE;
          for (const step of r.script.steps) {
            const ds = step.kind === 'line' ? step.directives : [step.directive];
            for (const d of ds) {
              if (d.kind === 'walkControl') {
                const a = stage.actors[d.actor];
                expect(a, `${s.scriptId} ${step.line}行目`).toBeDefined();
                const first = d.path[0]!;
                expect(Math.abs(first.x - a!.x) + Math.abs(first.z - a!.z), `${s.scriptId} ${step.line}行目`).toBe(1);
                for (const p of d.path) expect(getTile(map, p.x, p.z), `${s.scriptId} ${step.line}行目`).toBeDefined();
              }
              if (d.kind === 'enter' || d.kind === 'propPut' || d.kind === 'walk' || d.kind === 'place') {
                expect(getTile(map, d.x, d.z), `${s.scriptId} ${step.line}行目`).toBeDefined();
              }
            }
            stage = applyStep(stage, step);
          }
        }
      }
    }
  });

  it('戦闘のイベントの会話は、ある台本を指している', () => {
    for (const site of [...prologueBattles, ...ruinsDungeon.battles]) {
      for (const e of site.events ?? []) {
        for (const effect of e.effects) if (effect.kind === 'dialogue') expect(scriptTexts[effect.scriptId], effect.scriptId).toBeDefined();
      }
    }
  });

  it('序章の戦闘を、序章の部隊で始められる（堰は合わせ目が3つ、丘は誓いの剣に4回当てる）', () => {
    const weir = startBattle(buildSortie(prologueBattles[0], 'main', parties.prologue!, { jobs, equipment }), jobs, battleRules, 1, spells, strikes, passives).state;
    expect(weir.units.filter((u) => u.team === 'neutral').map((u) => u.id)).toEqual(['weir-seam-1', 'weir-seam-2', 'weir-seam-3']);
    expect(weir.scenario.objectives.victory[0]!.kind).toBe('destroyObjects');
    // 序章の部隊は経験値と JP を持たない（育てた部隊と関係がない）
    expect(weir.units.filter((u) => u.team === 'player').every((u) => u.progress === null)).toBe(true);
    const hill = startBattle(buildSortie(prologueBattles[1], 'main', parties.prologue!, { jobs, equipment }), jobs, battleRules, 1, spells, strikes, passives).state;
    expect(hill.scenario.objectives.victory[0]).toMatchObject({ kind: 'hitUnit', unitId: 'hill-gareth', times: 4 });
    expect(hill.units.find((u) => u.id === 'hill-gareth')?.minHp).toBe(1);
  });
});

/** 序章に足りない仕組み（PR A）の定義データ */
describe('物・人物の見た目・旋律・手ほどきの定義', () => {
  it('台本の物の種類は、すべて形のデータがある。人物の見た目の名前も、すべて見た目のデータがある', () => {
    for (const [name, model] of Object.entries(PROP_KINDS)) expect(MODELS[model], name).toBeDefined();
    for (const [name, look] of Object.entries(ACTOR_LOOKS)) expect(LOOKS[look], name).toBeDefined();
    for (const look of Object.values(LOOKS)) for (const item of look.items ?? []) expect(MODELS[item.model], item.model).toBeDefined();
  });

  it('仕草の時刻は 0 から 1 へ順に並び、最後は元の姿勢に戻る', () => {
    for (const [name, g] of Object.entries(GESTURES)) {
      const ts = g.frames.map((f) => f.t);
      expect(ts[0], name).toBe(0);
      expect(ts[ts.length - 1], name).toBe(1);
      expect([...ts].sort((a, b) => a - b), name).toEqual(ts);
    }
  });

  it('物語の戦場の手ほどき・人物の名前・見た目は、ある段の文・ユニット・見た目を指す', () => {
    const sites: BattleSite[] = [...prologueBattles];
    for (const site of sites) {
      const ids = new Set([...site.tiers.flatMap((t) => t.units.map((u) => u.id)), ...(site.bystanders ?? []).map((b) => b.id), ...(site.objects ?? []).map((o) => o.id)]);
      for (const step of site.tutorial ?? []) if (step.point?.kind === 'unit') expect(ids.has(step.point.unitId), step.id).toBe(true);
      for (const [name, id] of Object.entries(site.cast ?? {})) expect(ids.has(id), name).toBe(true);
      for (const [id, look] of Object.entries(site.looks ?? {})) {
        // 部隊の人物（トウマなど）の見た目も、戦場ごとに変えられる
        expect(ids.has(id) || Object.values(characterIds).includes(id as never), id).toBe(true);
        expect(LOOKS[look], look).toBeDefined();
      }
      for (const b of site.bystanders ?? []) expect(LOOKS[b.look], b.look).toBeDefined();
      if (site.afterVictory) expect(scriptTexts[site.afterVictory], site.afterVictory).toBeDefined();
    }
  });

  it('章のために決めた部隊は、正しい部隊。場面の partyId は、ある部隊を指す', () => {
    for (const [id, party] of Object.entries(parties)) {
      expect(validateRoster(party, { jobs, spells, strikes, passives, equipment }, progressionRules), id).toEqual([]);
    }
    for (const book of books) for (const c of book.chapters) for (const s of c.scenes) if (s.kind === 'battle' && s.partyId) expect(parties[s.partyId], s.partyId).toBeDefined();
  });
});

describe('会話用のマップ（文字の行）', () => {
  it('文字の行から高さと地形を読む。行の長さがそろっていなければエラー', () => {
    const m = stageMap('t', ['4s 0b', '0w 1g']);
    expect(m.heights).toEqual([
      [4, 0],
      [0, 1],
    ]);
    expect(createMap(m).tiles.map((t) => t.terrain)).toEqual(['stone', 'wood', 'water', 'grass']);
    expect(() => stageMap('t', ['0g 0g', '0g'])).toThrow();
  });

  it('マップに置いておく物は、マップの中にあり、物の種類がある', () => {
    for (const st of stages) {
      const map = createMap(st.map);
      for (const p of st.props ?? []) {
        expect(getTile(map, p.x, p.z), `${st.id} ${p.id}`).toBeDefined();
        expect(PROP_KINDS[p.kind], `${st.id} ${p.kind}`).toBeDefined();
      }
    }
  });
});
