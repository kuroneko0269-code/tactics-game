import { describe, expect, it } from 'vitest';
import { canTakeJob, changeJob, findUnit, gainJp, newlyUnlockedJobs } from '../core/progression';
import { spells, strikes } from './abilities';
import { equipment } from './equipment';
import { jobs } from './jobs';
import { passives } from './passives';
import { progressionRules } from './progression';
import { initialRoster } from './roster';

const catalog = { jobs, spells, strikes, passives, equipment };
const job = (id: string) => jobs.find((j) => j.id === id)!;

// data のテストは「定義データが core で正しく読めるか」を確かめるため、core の関数を使ってよい。
describe('ジョブの定義（フェーズ2-6）', () => {
  it('解放条件: 最初の4つはだれでも最初から。騎士 = 戦士 Lv 2、格闘家 = 戦士 Lv 3、盗賊 = 弓使い Lv 2', () => {
    for (const id of ['warrior', 'archer', 'mage', 'healer']) expect(job(id).unlock).toEqual([]);
    expect(job('knight').unlock).toEqual([{ jobId: 'warrior', level: 2 }]);
    expect(job('monk').unlock).toEqual([{ jobId: 'warrior', level: 3 }]);
    expect(job('thief').unlock).toEqual([{ jobId: 'archer', level: 2 }]);
  });

  it('ゴード（戦士）は、戦士の JP の累計が Lv 2 に届くと騎士に就けるようになる', () => {
    const gord = findUnit(initialRoster, 'gord');
    expect(canTakeJob(gord, job('knight'), progressionRules, catalog)).toBe(false);
    const lv2 = gainJp(gord, 'warrior', progressionRules.jobLevelJp[0]!);
    expect(newlyUnlockedJobs(gord, lv2, catalog, progressionRules)).toEqual(['knight']);
    expect(changeJob(lv2, 'knight', catalog, progressionRules).jobId).toBe('knight');
  });

  it('すべての行動アビリティと受動的なアビリティが、定義データにある', () => {
    for (const j of jobs) {
      for (const a of j.abilities ?? []) expect(spells.some((s) => s.id === a.id) || strikes.some((s) => s.id === a.id), `${j.id}: ${a.id}`).toBe(true);
      for (const a of j.passives ?? []) expect(passives.some((p) => p.id === a.id), `${j.id}: ${a.id}`).toBe(true);
    }
  });

  it('時守は、最初の素早さが戦士と同じ 6 で、素早さの伸びが高い（PR #16 の回答）', () => {
    expect(job('timekeeper').stats.speed).toBe(job('warrior').stats.speed);
    expect(job('timekeeper').growth!.speed).toBeGreaterThan(job('warrior').growth!.speed);
  });
});
