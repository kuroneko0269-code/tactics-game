import { describe, expect, it } from 'vitest';
import { spells, strikes } from '../data/abilities';
import { equipment, saveMigrationContext, startingGold } from '../data/equipment';
import { passives } from '../data/passives';
import { jobs } from '../data/jobs';
import { progressionRules } from '../data/progression';
import { initialRoster } from '../data/roster';
import { changeJob, findUnit, gainJp, learnAbility, replaceUnit, setPassive, validateRoster } from '../core/progression';
import { changeJobWithEquipment, equippedDefinitions } from '../core/equipment';
import { EMPTY_DUNGEON_STATE } from '../core/dungeon';
import { EMPTY_RECORDS } from '../core/saveData';
import { createSaveStore, type SaveBackend } from './saveStore';

const catalog = { jobs, spells, strikes, passives, equipment };
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
const storeOf = (backend: SaveBackend, onFail?: (r: string) => void) =>
  createSaveStore(backend, catalog, progressionRules, saveMigrationContext, onFail);

/**
 * 版 4 までの最初の部隊（ユニットの id は hero-1〜5、トウマは戦士）。フェーズ2-6 で id を人物の id にし、トウマを時守から始めるようにした
 */
const legacyIds = ['hero-1', 'hero-2', 'hero-3', 'hero-4', 'hero-5'];
const legacyTouma = { ...initialRoster.units[0]!, jobId: 'warrior', jobs: { warrior: { jp: 0, jpTotal: 0, learned: [] } } };
/** 版 4 までの最初の部隊を、版 5 に直した形（id は人物の id。トウマは戦士のまま） */
const migratedInitialRoster = { ...initialRoster, units: [legacyTouma, ...initialRoster.units.slice(1)] };
/** 版 2 までの部隊のユニット（装備の枠がない。id は hero-1〜5） */
const oldUnits: Record<string, unknown>[] = migratedInitialRoster.units.map((u, i) => ({
  ...Object.fromEntries(Object.entries(u).filter(([key]) => key !== 'equipment')),
  id: legacyIds[i]!,
}));

describe('セーブの出入口', () => {
  it('部隊（所持金・所持品・装備を含む）とダンジョンの記録・訓練戦の記録を保存して読み込むと、元に戻る（版の番号も保存される）', () => {
    const backend = memory();
    const store = storeOf(backend);
    expect(store.load()).toBeUndefined();
    let u = gainJp(findUnit(initialRoster, 'touma'), 'warrior', 300);
    u = learnAbility(u, 'warrior', 'powerStrike', catalog, progressionRules);
    const roster = changeJobWithEquipment(replaceUnit(initialRoster, u), 'touma', 'archer', catalog, progressionRules).roster;
    const dungeon = { run: { dungeonId: 'ruins', battle: 2 }, clears: { ruins: 1 } };
    const records = { trainingWins: { easy: 3, normal: 1 } };
    store.save({ roster: { ...roster, gold: 1234 }, dungeon, records, battle: null });
    expect(JSON.parse(backend.text!).version).toBe(9);
    expect(store.load()).toEqual({ roster: { ...roster, gold: 1234 }, dungeon, records, battle: null, story: {} });
    store.clear();
    expect(store.load()).toBeUndefined();
  });

  it('壊れたデータや、ルールに合わない部隊は読み込まず、理由を知らせる', () => {
    const backend = memory();
    const reasons: string[] = [];
    const store = storeOf(backend, (r) => reasons.push(r));
    backend.text = '{ 壊れた';
    expect(store.load()).toBeUndefined();
    backend.text = JSON.stringify({ version: 1, roster: { units: [{ ...oldUnits[0], jobId: 'unknown' }] } });
    expect(store.load()).toBeUndefined();
    backend.text = JSON.stringify({ version: 99, roster: initialRoster });
    expect(store.load()).toBeUndefined();
    // 持っていない個体を付けている
    const ghost = replaceUnit(initialRoster, { ...initialRoster.units[0]!, equipment: { weapon: 'i999', armor: null, accessory: null } });
    backend.text = JSON.stringify({ version: 3, roster: ghost, dungeon: EMPTY_DUNGEON_STATE, records: EMPTY_RECORDS });
    expect(store.load()).toBeUndefined();
    expect(reasons).toEqual(['invalidJson', 'invalidRoster', 'newerVersion', 'invalidRoster']);
  });

  it('フェーズ2-1a のセーブデータ（版 1）は、版 5 に直して読み込めて（ユニットの id は人物の id になる）、育てた状態が残り、今のジョブの最初の装備が配られる', () => {
    // 2-1a の版が保存した形そのまま（リアクション・サポート・ムーブの枠は空。装備の枠はない）
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
          ...oldUnits.slice(1),
        ],
      },
    };
    const backend = memory();
    backend.text = JSON.stringify(saved21a);
    const reasons: string[] = [];
    const store = storeOf(backend, (r) => reasons.push(r));
    const loaded = store.load()!;
    expect(reasons).toEqual([]);
    expect(loaded.dungeon).toEqual(EMPTY_DUNGEON_STATE);
    expect(loaded.records).toEqual(EMPTY_RECORDS);
    expect(loaded.roster.gold).toBe(startingGold);
    expect(validateRoster(loaded.roster, catalog, progressionRules)).toEqual([]);
    // 育てた状態はそのまま
    const hero = findUnit(loaded.roster, 'touma');
    expect(hero).toMatchObject({ jobId: 'archer', level: 12, exp: 31, growth: saved21a.roster.units[0]!.growth });
    expect(hero.jobs).toEqual(saved21a.roster.units[0]!.jobs);
    // 今のジョブ（弓使い）の最初の装備を付けている。ほかの4人も、それぞれのジョブの物
    expect(loaded.roster.units.map((x) => equippedDefinitions(x, loaded.roster, catalog).map((d) => d.id))).toEqual([
      ['bow-1', 'light-1'],
      ['sword-1', 'heavy-1'],
      ['bow-1', 'light-1'],
      ['staff-1', 'robe-1'],
      ['staff-1', 'robe-1'],
    ]);
    expect(loaded.roster.items).toHaveLength(10);
    expect(loaded.roster.nextItemSeq).toBe(11);
    // 2-1a で貯めた戦士の JP（ジョブのレベル 6）で、戦士の反撃を習得して、弓使いのまま付けられる
    let u = learnAbility(hero, 'warrior', 'counter', catalog, progressionRules);
    u = setPassive(u, 'reaction', 'counter', catalog);
    store.save({ roster: replaceUnit(loaded.roster, u), dungeon: loaded.dungeon, records: loaded.records, battle: null });
    expect(JSON.parse(backend.text!).version).toBe(9);
    expect(findUnit(store.load()!.roster, 'touma').slots).toEqual({ secondary: 'warrior', reaction: 'counter', support: null, movement: null });
  });

  it('版 2 のデータ（ダンジョンの挑戦中・クリアの記録あり）は、記録を残したまま版 3 に直す。最初の部隊なら、はじめからの部隊と同じになる', () => {
    const v2 = {
      version: 2,
      roster: { units: oldUnits },
      dungeon: { run: { dungeonId: 'ruins', battle: 1 }, clears: { ruins: 2 } },
    };
    const backend = memory();
    backend.text = JSON.stringify(v2);
    const loaded = storeOf(backend).load()!;
    expect(loaded.dungeon).toEqual(v2.dungeon);
    expect(loaded.roster).toEqual(migratedInitialRoster);
    expect(loaded.battle).toBeNull();
    // 古いセーブデータのトウマ（戦士）も、専用ジョブの時守に就ける（就くと斬り分けを覚える）
    const touma = changeJob(findUnit(loaded.roster, 'touma'), 'timekeeper', catalog, progressionRules);
    expect(touma.jobs.timekeeper?.learned).toEqual(['sweep']);
    // ほかの人物は、トウマの専用ジョブに就けない
    expect(() => changeJob(findUnit(loaded.roster, 'gord'), 'timekeeper', catalog, progressionRules)).toThrow();
  });

  it('版 3 のデータ（フェーズ2-4）は、育てた状態と記録をそのまま残し、「途中の戦闘なし」として版 4 に直す', () => {
    const roster = { ...initialRoster, gold: 777 };
    const v3 = { version: 3, roster, dungeon: { run: { dungeonId: 'ruins', battle: 2 }, clears: { ruins: 1 } }, records: { trainingWins: { normal: 2 } } };
    const backend = memory();
    backend.text = JSON.stringify(v3);
    expect(storeOf(backend).load()).toEqual({ roster, dungeon: v3.dungeon, records: v3.records, battle: null, story: {} });
  });
});

describe('端末ごとの設定（序章に足りない仕組み）', () => {
  it('保存して読み込むと戻る。読めない値は初期値にそろえる', async () => {
    const { createSettingsStore, normalizeSettings, DEFAULT_SETTINGS } = await import('./saveStore');
    let text: string | null = null;
    const store = createSettingsStore({ read: () => text, write: (t) => (text = t), remove: () => (text = null) });
    expect(store.load()).toEqual(DEFAULT_SETTINGS);
    expect(DEFAULT_SETTINGS.checkTools).toBe(false);
    const saved = {
      volume: 30,
      muted: true,
      skipSeenTutorials: false,
      seenTutorials: ['a'],
      checkTools: true,
      storyFont: 'shipporiAntique',
      textSize: 'large',
      puppetStyle: 'pixel',
    } as const;
    store.save(saved);
    expect(store.load()).toEqual(saved);
    expect(normalizeSettings({ checkTools: 'yes' }).checkTools).toBe(false);
    expect(normalizeSettings({ volume: 250, muted: 'x', seenTutorials: [1, 'b'] })).toEqual({ ...DEFAULT_SETTINGS, volume: 100, seenTutorials: ['b'] });
    // 書体・文字の大きさ・人形の描き方（見た目の見本の2回目）。前の版の設定（項目がない）は初期値。知らない値も初期値
    expect(normalizeSettings({ volume: 40 })).toEqual({ ...DEFAULT_SETTINGS, volume: 40 });
    expect(DEFAULT_SETTINGS).toMatchObject({ storyFont: 'zenOldMincho', textSize: 'medium', puppetStyle: 'smooth' });
    expect(normalizeSettings({ storyFont: 'gothic', textSize: 'huge', puppetStyle: 3 })).toEqual(DEFAULT_SETTINGS);
    text = '{壊れた';
    expect(store.load()).toEqual(DEFAULT_SETTINGS);
  });
});
