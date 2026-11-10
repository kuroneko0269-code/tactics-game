import { describe, expect, it } from 'vitest';
import { spells, strikes } from '../data/abilities';
import { jobs } from '../data/jobs';
import { progressionRules } from '../data/progression';
import { initialRoster } from '../data/roster';
import { changeJob, findUnit, gainJp, learnAbility, replaceUnit } from '../core/progression';
import { createSaveStore, type SaveBackend } from './saveStore';

const catalog = { jobs, spells, strikes };
const memory = (): SaveBackend & { text: string | null } => {
  const b = {
    text: null as string | null,
    read: () => b.text,
    write: (t: string) => {
      b.text = t;
    },
    remove: () => {
      b.text = null;
    },
  };
  return b;
};

describe('セーブの出入口', () => {
  it('部隊を保存して読み込むと、元に戻る（版の番号も保存される）', () => {
    const backend = memory();
    const store = createSaveStore(backend, catalog, progressionRules);
    expect(store.load()).toBeUndefined();
    let u = gainJp(findUnit(initialRoster, 'hero-1'), 'warrior', 300);
    u = learnAbility(u, 'warrior', 'powerStrike', catalog, progressionRules);
    u = changeJob(u, 'archer', catalog, progressionRules);
    const roster = replaceUnit(initialRoster, u);
    store.save(roster);
    expect(JSON.parse(backend.text!).version).toBe(1);
    expect(store.load()).toEqual(roster);
    store.clear();
    expect(store.load()).toBeUndefined();
  });

  it('壊れたデータや、ルールに合わない部隊は読み込まず、理由を知らせる', () => {
    const backend = memory();
    const reasons: string[] = [];
    const store = createSaveStore(backend, catalog, progressionRules, (r) => reasons.push(r));
    backend.text = '{ 壊れた';
    expect(store.load()).toBeUndefined();
    backend.text = JSON.stringify({ version: 1, roster: { units: [{ ...initialRoster.units[0], jobId: 'unknown' }] } });
    expect(store.load()).toBeUndefined();
    backend.text = JSON.stringify({ version: 99, roster: initialRoster });
    expect(store.load()).toBeUndefined();
    expect(reasons).toEqual(['invalidJson', 'invalidRoster', 'newerVersion']);
  });
});
