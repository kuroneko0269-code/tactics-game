import { describe, expect, it } from 'vitest';
import { forceVictory, startBattle } from '../../../core/battle';
import { attackRangeTiles } from '../../../core/combat';
import { isValidSpellTarget, spellRangeTiles } from '../../../core/magic';
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

describe('確認用の機能の「勝ったことにする」（forceVictory）', () => {
  it('堰: 合わせ目がすべて壊れ、堰の下の川筋に水が流れた様子で、味方の勝ちになる（経験値と JP は入らない）', () => {
    const s = start(weirBattle);
    const r = forceVictory(s);
    expect(r.state.winner).toBe('player');
    expect(r.state.turn).toBeNull();
    expect(r.state.units.filter((u) => u.object).every((u) => u.retired && u.hp === 0)).toBe(true);
    // 水は堰の真ん中から川筋を下流へ（西の涸れた谷は涸れたまま。2026-11-19 物語の作者の訂正）
    expect(r.state.map.tiles.filter((t) => t.x === 4 && t.z >= 2 && t.terrain === 'water').length).toBe(7);
    expect(r.state.map.tiles.some((t) => t.x === 0 && t.terrain === 'water')).toBe(false);
    // 番兵は膝をつかない（戦っていない）。味方の経験値と JP は始めのまま
    expect(r.state.units.filter((u) => u.team === 'player').map((u) => u.progress)).toEqual(s.units.filter((u) => u.team === 'player').map((u) => u.progress));
    expect(JSON.parse(JSON.stringify(r.state))).toEqual(r.state);
  });

  it('丘: 誓いの剣に4回当てたことになり、味方の勝ちになる。ガレスの HP は減らない', () => {
    const s = start(hillBattle);
    const r = forceVictory(s);
    expect(r.state.winner).toBe('player');
    expect(r.state.scenario.tallies?.['oath-sword']).toBe(4);
    expect(r.state.units.find((u) => u.id === 'hill-gareth')!.hp).toBe(s.units.find((u) => u.id === 'hill-gareth')!.hp);
  });
});

describe('丘の七つの氏族（戦わない背景の人々）は、攻撃や魔法の対象にならない', () => {
  it('攻撃の届くマス・魔法で狙えるマスに、氏族の立つマスは入らない。マスを狙う魔法でも狙えない', () => {
    const s = start(hillBattle);
    const clans = (s.bystanders ?? []).map((b) => `${b.x},${b.z}`);
    expect(clans).toHaveLength(8);
    const fire = spells.find((x) => x.id === 'fire')!;
    for (const u of s.units.filter((x) => x.team === 'player')) {
      // 氏族の隣へ置いて確かめる
      for (const b of s.bystanders ?? []) {
        const from = { x: b.x === 0 ? 1 : b.x === 8 ? 7 : b.x, z: b.z + (b.x === 1 || b.x === 7 ? 1 : 0) };
        const placed = { ...u, ...from };
        expect(attackRangeTiles(s, placed, from).map((t) => `${t.x},${t.z}`)).not.toContain(`${b.x},${b.z}`);
        expect(spellRangeTiles(s, fire, from).map((t) => `${t.x},${t.z}`)).not.toContain(`${b.x},${b.z}`);
        expect(isValidSpellTarget(s, fire, placed, { kind: 'tile', x: b.x, z: b.z })).toBe(false);
      }
    }
  });
});
