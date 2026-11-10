import { describe, expect, it } from 'vitest';
import { runAutoBattle } from '../../core/ai';
import { startBattle } from '../../core/battle';
import { manhattan } from '../../core/geometry';
import { getTile } from '../../core/map';
import { aiConfig } from '../aiConfig';
import { battleRules } from '../battleRules';
import { jobs } from '../jobs';
import { spells } from '../spells';
import { firstBattle } from './firstBattle';

const start = (seed: number) => startBattle(firstBattle, jobs, battleRules, seed, spells);
const configs = { player: aiConfig, enemy: aiConfig };

// data のテストは「定義データが core で正しく読めるか」を確かめるため、core の関数を使ってよい。
describe('フェーズ1-2 の戦闘データ', () => {
  it('core で読み込めて、味方5体（戦士2・弓使い1・魔術師1・癒し手1）と敵5体（同じ構成）がいる', () => {
    const { state } = start(1);
    expect(state.map.width).toBe(10);
    expect(state.map.depth).toBe(10);
    for (const team of ['player', 'enemy'] as const) {
      const members = state.units.filter((u) => u.team === team).map((u) => u.jobId).sort();
      expect(members).toEqual(['archer', 'healer', 'mage', 'warrior', 'warrior']);
    }
    const mage = state.units.find((u) => u.jobId === 'mage')!;
    expect(mage.spells.map((s) => s.id)).toEqual(['fire', 'wind']);
    expect(mage.mp).toBe(mage.stats.maxMp);
    expect(state.units.find((u) => u.jobId === 'healer')!.spells.map((s) => s.id)).toEqual(['heal']);
  });

  it('マップは奥と手前で対称で、両軍の配置も対称。初期位置から高台までの距離が同じ', () => {
    const { state } = start(1);
    const { map } = state;
    for (const tile of map.tiles) {
      expect(getTile(map, tile.x, map.depth - 1 - tile.z)?.height).toBe(tile.height);
    }
    for (const u of state.units.filter((u) => u.team === 'player')) {
      const mirror = state.units.find((e) => e.team === 'enemy' && e.jobId === u.jobId && e.x === u.x);
      expect(mirror?.z, u.id).toBe(map.depth - 1 - u.z);
    }
    const maxHeight = Math.max(...map.tiles.map((t) => t.height));
    const highTiles = map.tiles.filter((t) => t.height === maxHeight);
    const nearest = (team: 'player' | 'enemy') =>
      Math.min(
        ...state.units
          .filter((u) => u.team === team)
          .flatMap((u) => highTiles.map((t) => manhattan(u, t))),
      );
    expect(nearest('player')).toBe(nearest('enemy'));
  });

  it('AI 同士で戦わせると、どのシード値でも決着がつき、魔法も使われる', () => {
    for (let seed = 1; seed <= 20; seed++) {
      const { state, events } = runAutoBattle(start(seed).state, 1000, configs);
      expect(state.winner, `シード値 ${seed}`).not.toBeNull();
      expect(events.some((e) => e.type === 'spellResolved'), `シード値 ${seed}`).toBe(true);
    }
  }, 60_000);

  it('同じシード値からは、同じ結果になる', () => {
    const a = runAutoBattle(start(77).state, 1000, configs);
    const b = runAutoBattle(start(77).state, 1000, configs);
    expect(a.state).toEqual(b.state);
    expect(a.events).toEqual(b.events);
  }, 30_000);
});
