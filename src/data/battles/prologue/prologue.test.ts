import { describe, expect, it } from 'vitest';
import { startBattle } from '../../../core/battle';
import { runAutoBattle } from '../../../core/ai';
import { buildSortie } from '../../../core/sortie';
import { battleRules } from '../../battleRules';
import { jobs } from '../../jobs';
import { equipment } from '../../equipment';
import { spells, strikes } from '../../abilities';
import { passives } from '../../passives';
import { aiConfig } from '../../aiConfig';
import { prologueParty } from '../../story/parties';
import { prologueBattles } from './index';

/**
 * 序章の2つの戦闘（序章の PR B）: 序章の部隊と敵を AI 同士で戦わせ、必ず決着し、ほぼ必ず勝つこと
 * （初めて遊ぶ人が、説明を読まなくても勝てる強さ。勝率と手番数は npm run balance -- --prologue でも出す）
 */
describe('序章の戦闘の強さ', () => {
  for (const site of prologueBattles) {
    it(`${site.id}: AI 同士で 20 戦すべて決着し、すべて勝つ。味方はほとんど倒れない`, () => {
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
