import { describe, expect, it } from 'vitest';
import { applyStep, EMPTY_STAGE, type StageState } from '../../core/dialogue';
import { createMap, getTile } from '../../core/map';
import { parseScript } from '../../core/script';
import { validateBook } from '../../core/story';
import { startBattle } from '../../core/battle';
import { buildSortie } from '../../core/sortie';
import { battleRules } from '../battleRules';
import { trialWeirBattle } from '../battles/trialWeir';
import { ruinsDungeon } from '../battles/ruins';
import { jobs } from '../jobs';
import { initialRoster } from '../roster';
import { equipment } from '../equipment';
import { spells, strikes } from '../abilities';
import { passives } from '../passives';
import { books, trialBook } from './books';
import { scriptTexts } from './scripts';
import { scriptCatalog } from './stageDefs';
import { stages } from './stages';

/** 物語の定義データ（台本・本・会話の場面のマップ）が、core で正しく読めるか */
describe('物語の定義データ', () => {
  it('すべての台本が読める（書き間違いがない）', () => {
    for (const [id, text] of Object.entries(scriptTexts)) {
      const r = parseScript(id, text, scriptCatalog);
      expect(r.ok ? [] : r.errors.map((e) => `${id} ${e.line}行目: ${e.message}`)).toEqual([]);
    }
  });

  it('本の場面は、ある台本・会話のマップ・戦場を指している。試しの場面の本に書き間違いはない', () => {
    expect(validateBook(trialBook)).toEqual([]);
    const sites = [trialWeirBattle.id];
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
    for (const site of [trialWeirBattle, ...ruinsDungeon.battles]) {
      for (const e of site.events ?? []) {
        for (const effect of e.effects) if (effect.kind === 'dialogue') expect(scriptTexts[effect.scriptId], effect.scriptId).toBeDefined();
      }
    }
  });

  it('試しの戦闘を、最初の部隊で始められる（対象物が2つ、勝利条件は物をすべて壊す）', () => {
    const setup = buildSortie(trialWeirBattle, 'main', initialRoster, { jobs, equipment });
    const { state } = startBattle(setup, jobs, battleRules, 1, spells, strikes, passives);
    expect(state.units.filter((u) => u.team === 'neutral').map((u) => u.id)).toEqual(['trial-seam-1', 'trial-seam-2']);
    expect(state.scenario.objectives.victory[0]!.kind).toBe('destroyObjects');
  });
});
