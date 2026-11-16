import { describe, expect, it } from 'vitest';
import { startBattle } from '../../../core/battle';
import { runAutoBattle } from '../../../core/ai';
import { judgeOutcome } from '../../../core/scenario';
import { buildSortie } from '../../../core/sortie';
import { battleRules } from '../../battleRules';
import { jobs } from '../../jobs';
import { equipment } from '../../equipment';
import { spells, strikes } from '../../abilities';
import { passives } from '../../passives';
import { aiConfig } from '../../aiConfig';
import { prologueParty } from '../../story/parties';
import { hillBattle, prologueBattles, weirBattle } from './index';

/**
 * 序章の2つの戦闘（序章の PR B）: 序章の部隊と敵を AI 同士で戦わせ、必ず決着し、ほぼ必ず勝つこと
 * （初めて遊ぶ人が、説明を読まなくても勝てる強さ。勝率と手番数は npm run balance -- --prologue でも出す）
 */
describe('序章の戦闘の強さ', () => {
  for (const site of prologueBattles) {
    it(`${site.id}: AI 同士で 20 戦すべて決着し、すべて勝つ。味方はほとんど戦闘不能にならない`, () => {
      let wins = 0;
      let knockouts = 0;
      for (let seed = 1; seed <= 20; seed++) {
        const setup = buildSortie(site, 'main', prologueParty, { jobs, equipment });
        const start = startBattle(setup, jobs, battleRules, seed, spells, strikes, passives).state;
        const end = runAutoBattle(start, 3000, { player: aiConfig, enemy: aiConfig }).state;
        expect(end.winner, `シード ${seed}`).not.toBeNull();
        if (end.winner === 'player') wins++;
        knockouts += end.units.filter((u) => u.team === 'player' && u.hp <= 0).length;
      }
      expect(wins).toBe(20);
      expect(knockouts).toBeLessThanOrEqual(2);
    }, 60000);
  }
});

const start = (site: typeof weirBattle, seed = 1) =>
  startBattle(buildSortie(site, 'main', prologueParty, { jobs, equipment }), jobs, battleRules, seed, spells, strikes, passives).state;

describe('序章の戦闘の決まり（戦闘で人は死なない決まり）', () => {
  it('堰: 番兵は人で、HP が尽きると膝をつき、退場しない。番兵をすべて退けても、堰を崩すまで勝ちにならない', () => {
    const s = start(weirBattle);
    const guards = s.units.filter((u) => u.id.startsWith('weir-guard'));
    expect(guards).toHaveLength(3);
    for (const g of guards) expect(g).toMatchObject({ kind: 'human', noRetire: true });
    expect(guards.some((g) => g.minHp !== undefined)).toBe(false);
    const down = { ...s, units: s.units.map((u) => (u.id.startsWith('weir-guard') ? { ...u, hp: 0, knockoutCount: 3 } : u)) };
    expect(judgeOutcome(down)).toBeNull();
  });

  it('丘: ガレスの HP は尽きない（AI 同士で最後まで戦っても 1 以上）。最後の一撃はトウマだけが当てる', () => {
    expect(hillBattle.objectives?.victory[0]).toMatchObject({ kind: 'hitUnit', times: 4, finisherId: 'touma' });
    for (let seed = 1; seed <= 10; seed++) {
      const r = runAutoBattle(start(hillBattle, seed), 3000, { player: aiConfig, enemy: aiConfig });
      expect(r.state.winner).toBe('player');
      expect(r.state.units.find((u) => u.id === 'hill-gareth')!.hp).toBeGreaterThanOrEqual(1);
      // 勝ちを決めた（4回目の）回数を数えた攻撃は、トウマの攻撃
      const lastTally = r.events.findIndex((e) => e.type === 'tallied' && e.count === 4);
      const attack = r.events.slice(0, lastTally).reverse().find((e) => e.type === 'attacked');
      expect(attack && attack.type === 'attacked' && attack.attackerId).toBe('touma');
    }
  }, 60000);
});
