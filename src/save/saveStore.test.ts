import { describe, expect, it } from 'vitest';
import { spells, strikes } from '../data/abilities';
import { passives } from '../data/passives';
import { jobs } from '../data/jobs';
import { progressionRules } from '../data/progression';
import { initialRoster } from '../data/roster';
import { changeJob, findUnit, gainJp, learnAbility, replaceUnit, setPassive } from '../core/progression';
import { createSaveStore, type SaveBackend } from './saveStore';

const catalog = { jobs, spells, strikes, passives };
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

  it('フェーズ2-1a のセーブデータ（版 1）は、そのまま読み込めて、育てた状態が残る。受動的なアビリティを付けて保存し直せる', () => {
    // 2-1a の版が保存した形そのまま（リアクション・サポート・ムーブの枠は空）
    const saved21a = {
      version: 1,
      roster: {
        units: [
          {
            id: 'hero-1',
            jobId: 'archer',
            level: 12,
            exp: 31,
            growth: { maxHp: 3080, maxMp: 440, attack: 655, magic: 245, speed: 64 },
            jobs: {
              warrior: { jp: 460, jpTotal: 960, learned: ['powerStrike'] },
              archer: { jp: 30, jpTotal: 150, learned: ['aimedShot'] },
            },
            slots: { secondary: 'warrior', reaction: null, support: null, movement: null },
          },
          ...initialRoster.units.slice(1),
        ],
      },
    };
    const backend = memory();
    backend.text = JSON.stringify(saved21a);
    const reasons: string[] = [];
    const store = createSaveStore(backend, catalog, progressionRules, (r) => reasons.push(r));
    const loaded = store.load();
    expect(reasons).toEqual([]);
    expect(loaded).toEqual(saved21a.roster);
    // 2-1a で貯めた戦士の JP（ジョブのレベル 6）で、戦士の反撃を習得して、弓使いのまま付けられる
    let u = learnAbility(findUnit(loaded!, 'hero-1'), 'warrior', 'counter', catalog, progressionRules);
    u = setPassive(u, 'reaction', 'counter', catalog);
    store.save(replaceUnit(loaded!, u));
    expect(findUnit(store.load()!, 'hero-1').slots).toEqual({ secondary: 'warrior', reaction: 'counter', support: null, movement: null });
  });
});
