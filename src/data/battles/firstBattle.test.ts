import { describe, expect, it } from 'vitest';
import { runAutoBattle } from '../../core/ai';
import { startBattle } from '../../core/battle';
import { manhattan } from '../../core/geometry';
import { getTile } from '../../core/map';
import { battleRules } from '../battleRules';
import { jobs } from '../jobs';
import { firstBattle } from './firstBattle';

// data のテストは「定義データが core で正しく読めるか」を確かめるため、core の関数を使ってよい。
describe('フェーズ1-1 の戦闘データ', () => {
  it('core で読み込めて、味方4体（戦士2・弓使い2）と敵4体（同じ構成）がいる', () => {
    const { state } = startBattle(firstBattle, jobs, battleRules, 1);
    expect(state.map.width).toBe(10);
    expect(state.map.depth).toBe(10);
    for (const team of ['player', 'enemy'] as const) {
      const members = state.units.filter((u) => u.team === team).map((u) => u.jobId).sort();
      expect(members).toEqual(['archer', 'archer', 'warrior', 'warrior']);
    }
  });

  it('マップは奥と手前で対称で、両軍の初期位置から高台までの距離が同じ', () => {
    const { state } = startBattle(firstBattle, jobs, battleRules, 1);
    const { map } = state;
    for (const tile of map.tiles) {
      expect(getTile(map, tile.x, map.depth - 1 - tile.z)?.height).toBe(tile.height);
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

  it('AI 同士で戦わせると、どのシード値でも決着がつく', () => {
    for (let seed = 1; seed <= 20; seed++) {
      const { state } = runAutoBattle(startBattle(firstBattle, jobs, battleRules, seed).state, 1000);
      expect(state.winner, `シード値 ${seed}`).not.toBeNull();
    }
  });
});
