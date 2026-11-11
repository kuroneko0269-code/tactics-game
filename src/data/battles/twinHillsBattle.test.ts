import { describe, expect, it } from 'vitest';
import { runAutoBattle } from '../../core/ai';
import { startBattle } from '../../core/battle';
import { manhattan } from '../../core/geometry';
import { getTile } from '../../core/map';
import { buildSortie } from '../../core/sortie';
import type { Roster } from '../../core/progression';
import { changeJob, gainExp, learnAbility, validateRoster } from '../../core/progression';
import { spells, strikes } from '../abilities';
import { equipment } from '../equipment';
import { passives } from '../passives';
import { equippedStats } from '../../core/equipment';
import { aiConfig } from '../aiConfig';
import { battleRules } from '../battleRules';
import { jobs } from '../jobs';
import { progressionRules } from '../progression';
import { initialRoster } from '../roster';
import { twinHillsBattle } from './twinHillsBattle';

const catalog = { jobs, spells, strikes, passives, equipment };
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
    // 装備（フェーズ2-4）: 「やさしい」は1段階目の武器だけで防具なし（癒し手は杖もなし）、
    // 「ふつう」は2段階目の武器と防具、「むずかしい」は3段階目の武器と防具と装飾品。能力値の補正は使わない
    const gear = (list: typeof easy) => list!.map((u) => u.equipment.map((e) => e.id));
    expect(gear(easy)).toEqual([['sword-1'], ['sword-1'], ['bow-1'], ['staff-1'], []]);
    expect(gear(normal)!.every((ids) => ids.length === 2 && ids.every((id) => id.endsWith('-2')))).toBe(true);
    expect(gear(hard)!.every((ids) => ids.length === 3 && ids.slice(0, 2).every((id) => id.endsWith('-3')))).toBe(true);
    expect([...easy!, ...normal!, ...hard!].every((u) => Object.keys(u.statBonus).every((k) => u.equipment.some((e) => k in e.stats)))).toBe(true);
    // 「やさしい」の敵の癒し手は杖を持たないので、素手（武器の種類なし）で、魔力が低い
    const healer = easy!.find((u) => u.jobId === 'healer')!;
    expect(healer.weapon).toBeNull();
    expect(healer.stats.magic).toBe(jobs.find((j) => j.id === 'healer')!.stats.magic);
    // 付けている受動的なアビリティは、能力値に反映される（重装で最大 HP、早足で移動力）。装飾品も（跳ね靴でジャンプ力）
    const hardWarrior = warrior(hard);
    expect(hardWarrior.stats.move).toBe(jobs.find((j) => j.id === 'warrior')!.stats.move + 1);
    expect(hardWarrior.stats.jump).toBe(jobs.find((j) => j.id === 'warrior')!.stats.jump + 1);
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
    const roster = { ...initialRoster, units: [warrior, ...initialRoster.units.slice(1)] };
    const unit = start(1, 'easy', roster).state.units.find((u) => u.id === 'hero-1')!;
    expect(unit.level).toBe(warrior.level);
    expect(unit.stats).toEqual(equippedStats(warrior, roster, catalog));
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

  it('敵 AI の封じ: 「ふつう」以上で、魔法を使う相手（育てていない部隊）がいる戦闘では、1戦に平均 0.5 回以上使う', () => {
    for (const tierId of ['normal', 'hard']) {
      let seals = 0;
      const n = 12;
      for (let seed = 1; seed <= n; seed++) {
        const { events, state } = runAutoBattle(start(seed, tierId).state, 1000, configs);
        const enemy = new Set(state.units.filter((u) => u.team === 'enemy').map((u) => u.id));
        seals += events.filter((e) => e.type === 'castStarted' && e.spellId === 'seal' && enemy.has(e.casterId)).length;
      }
      expect(seals / n, tierId).toBeGreaterThanOrEqual(0.5);
    }
  }, 30_000);
});

