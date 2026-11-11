import { describe, expect, it } from 'vitest';
import { runAutoBattle } from '../../core/ai';
import { startBattle } from '../../core/battle';
import { manhattan } from '../../core/geometry';
import { getTile } from '../../core/map';
import { buildSortie } from '../../core/sortie';
import type { Roster } from '../../core/progression';
import { changeJob, gainExp, learnAbility, unitStats, validateRoster } from '../../core/progression';
import { spells, strikes } from '../abilities';
import { passives } from '../passives';
import { aiConfig } from '../aiConfig';
import { battleRules } from '../battleRules';
import { jobs } from '../jobs';
import { progressionRules } from '../progression';
import { initialRoster } from '../roster';
import { twinHillsBattle } from './twinHillsBattle';

const catalog = { jobs, spells, strikes, passives };
const start = (seed: number, tierId = 'easy', roster: Roster = initialRoster) =>
  startBattle(buildSortie(twinHillsBattle, tierId, roster, catalog), jobs, battleRules, seed, spells, strikes, passives);
const configs = { player: aiConfig, enemy: aiConfig };

// data のテストは「定義データが core で正しく読めるか」を確かめるため、core の関数を使ってよい。
describe('ふたつの丘の戦場と最初の部隊', () => {
  it('最初の部隊は正しく、core で読み込めて、味方5体（戦士2・弓使い1・魔術師1・癒し手1）と敵5体（同じ構成）がいる', () => {
    expect(validateRoster(initialRoster, catalog, progressionRules)).toEqual([]);
    const { state } = start(1);
    expect(state.map.width).toBe(10);
    expect(state.map.depth).toBe(10);
    for (const team of ['player', 'enemy'] as const) {
      const members = state.units.filter((u) => u.team === team).map((u) => u.jobId).sort();
      expect(members).toEqual(['archer', 'healer', 'mage', 'warrior', 'warrior']);
    }
    // 今の版でできることがそのままできる: 魔術師は風と炎、癒し手は癒し
    const mage = state.units.find((u) => u.team === 'player' && u.jobId === 'mage')!;
    expect(mage.spells.map((s) => s.id).sort()).toEqual(['fire', 'wind']);
    expect(mage.mp).toBe(mage.stats.maxMp);
    expect(state.units.find((u) => u.team === 'player' && u.jobId === 'healer')!.spells.map((s) => s.id)).toEqual(['heal']);
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
      Math.min(...state.units.filter((u) => u.team === team).flatMap((u) => highTiles.map((t) => manhattan(u, t))));
    expect(nearest('player')).toBe(nearest('enemy'));
  });

  it('並び順は、味方と敵を組にして、組ごとに先になる側を入れ替える', () => {
    const { state } = start(1);
    expect(state.units.map((u) => u.team)).toEqual([
      'player', 'enemy', 'enemy', 'player', 'player', 'enemy', 'enemy', 'player', 'player', 'enemy',
    ]);
  });

  it('敵の段階が上がるほど、レベルと能力値が高く、覚えている技と受動的なアビリティが多い', () => {
    const enemiesOf = (tierId: string) => start(1, tierId).state.units.filter((u) => u.team === 'enemy');
    const [easy, normal, hard] = ['easy', 'normal', 'hard'].map(enemiesOf);
    expect(easy!.every((u) => u.level === 1)).toBe(true);
    expect(normal!.every((u) => u.level === 8)).toBe(true);
    expect(hard!.every((u) => u.level === 18)).toBe(true);
    const warrior = (list: typeof easy) => list!.find((u) => u.id === 'e-warrior-1')!;
    expect(warrior(normal).stats.maxHp).toBeGreaterThan(warrior(easy).stats.maxHp);
    expect(warrior(hard).stats.attack).toBeGreaterThan(warrior(normal).stats.attack);
    expect(warrior(easy).strikes).toEqual([]);
    expect(warrior(normal).strikes.map((s) => s.id)).toEqual(['powerStrike', 'knockback']);
    expect(hard!.find((u) => u.jobId === 'mage')!.spells.map((s) => s.id)).toContain('thunder');
    // 「やさしい」には受動的なアビリティを付けない。段階が上がるほど多い
    const passiveCount = (list: typeof easy) => list!.reduce((n, u) => n + u.passives.length, 0);
    expect(passiveCount(easy)).toBe(0);
    expect(passiveCount(normal)).toBeGreaterThan(0);
    expect(passiveCount(hard)).toBeGreaterThan(passiveCount(normal));
    // 「やさしい」の敵の癒し手は MP が少ない（癒しを2回まで）
    const healer = easy!.find((u) => u.jobId === 'healer')!;
    expect(healer.stats.maxMp).toBe(16);
    // 付けている受動的なアビリティは、能力値に反映される（重装で最大 HP、早足で移動力）
    const hardWarrior = warrior(hard);
    expect(hardWarrior.stats.move).toBe(jobs.find((j) => j.id === 'warrior')!.stats.move + 1);
  });

  it('部隊の育成の状態（ジョブ・成長値・副コマンド）が、戦闘のユニットに反映される', () => {
    let warrior = gainExp(initialRoster.units[0]!, 2000, catalog, progressionRules);
    warrior = changeJob(warrior, 'mage', catalog, progressionRules);
    warrior = learnAbility(
      { ...warrior, jobs: { ...warrior.jobs, mage: { ...warrior.jobs.mage!, jp: 999, jpTotal: 999 } } },
      'mage',
      'fire',
      catalog,
      progressionRules,
    );
    warrior = changeJob(warrior, 'warrior', catalog, progressionRules);
    warrior = { ...warrior, slots: { ...warrior.slots, secondary: 'mage' } };
    const roster = { units: [warrior, ...initialRoster.units.slice(1)] };
    const unit = start(1, 'easy', roster).state.units.find((u) => u.id === 'hero-1')!;
    expect(unit.level).toBe(warrior.level);
    expect(unit.stats).toEqual(unitStats(warrior, catalog));
    expect(unit.commands).toEqual([
      { jobId: 'warrior', abilityIds: [] },
      { jobId: 'mage', abilityIds: ['wind', 'fire'] },
    ]);
    expect(unit.weapon).toBe('sword');
  });

  it('3段階それぞれで、AI 同士で戦わせると、どのシード値でも決着がつく', () => {
    for (const tierId of ['easy', 'normal', 'hard']) {
      for (let seed = 1; seed <= 8; seed++) {
        const { state, events } = runAutoBattle(start(seed, tierId).state, 1000, configs);
        expect(state.winner, `${tierId} シード値 ${seed}`).not.toBeNull();
        if (tierId === 'easy') expect(events.some((e) => e.type === 'spellResolved'), `シード値 ${seed}`).toBe(true);
      }
    }
  }, 120_000);

  it('同じシード値からは、同じ結果になる', () => {
    const a = runAutoBattle(start(77, 'hard').state, 1000, configs);
    const b = runAutoBattle(start(77, 'hard').state, 1000, configs);
    expect(a.state).toEqual(b.state);
    expect(a.events).toEqual(b.events);
  }, 30_000);
});
