import { describe, expect, it } from 'vitest';
import { runAutoBattle } from '../../../core/ai';
import { startBattle } from '../../../core/battle';
import { getTile } from '../../../core/map';
import { buildSortie } from '../../../core/sortie';
import { spells, strikes } from '../../abilities';
import { aiConfig } from '../../aiConfig';
import { battleRules } from '../../battleRules';
import { jobs } from '../../jobs';
import { passives } from '../../passives';
import { initialRoster } from '../../roster';
import { ruinsDungeon } from './index';

const catalog = { jobs, spells, strikes, passives };
const start = (index: number, seed: number) =>
  startBattle(buildSortie(ruinsDungeon.battles[index]!, 'main', initialRoster, catalog), jobs, battleRules, seed, spells, strikes, passives);
const configs = { player: aiConfig, enemy: aiConfig };

// data のテストは「定義データが core で正しく読めるか」を確かめるため、core の関数を使ってよい。
describe('ダンジョン「はじまりの遺跡」', () => {
  it('3つの戦闘は、それぞれ大きさの違うマップで、core で読み込める', () => {
    const sizes = ruinsDungeon.battles.map((_, i) => {
      const { state } = start(i, 1);
      expect(state.units.filter((u) => u.team === 'player')).toHaveLength(5);
      return `${state.map.width}x${state.map.depth}`;
    });
    expect(new Set(sizes).size).toBe(3);
    expect(start(0, 1).state.units.filter((u) => u.team === 'enemy')).toHaveLength(4);
  });

  it('勝利条件は 敵の全滅 → 到達 → ボスの撃破。到達するマスと罠はマップの中', () => {
    const kinds = ruinsDungeon.battles.map((b) => b.objectives!.victory.map((c) => c.kind));
    expect(kinds).toEqual([['defeatAll'], ['reachTile'], ['defeatUnit']]);
    for (const b of ruinsDungeon.battles) {
      const map = start(ruinsDungeon.battles.indexOf(b), 1).state.map;
      for (const t of b.traps ?? []) expect(getTile(map, t.x, t.z)).toBeDefined();
    }
  });

  it('脱力の罠はダンジョンの中に1か所だけで、第3戦にある', () => {
    const drains = ruinsDungeon.battles.flatMap((b, i) => (b.traps ?? []).filter((t) => t.kind === 'drain').map(() => i));
    expect(drains).toEqual([2]);
  });

  it('3つの戦闘それぞれで、AI 同士の対戦が必ず決着し、同じシード値なら同じ結果になる', () => {
    for (let i = 0; i < ruinsDungeon.battles.length; i++) {
      for (const seed of [1, 2, 3]) {
        const a = runAutoBattle(start(i, seed).state, 1000, configs);
        expect(a.state.winner, `第${i + 1}戦 シード値 ${seed}`).not.toBeNull();
        const b = runAutoBattle(start(i, seed).state, 1000, configs);
        expect(b.state).toEqual(a.state);
      }
    }
  }, 30_000);
});
