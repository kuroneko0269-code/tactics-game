import { describe, expect, it } from 'vitest';
import { createSaveData, migrateSaveData, SAVE_MIGRATIONS, SAVE_VERSION, type SaveMigrations } from './saveData';
import { EMPTY_DUNGEON_STATE, type DungeonState } from './dungeon';
import type { Roster } from './progression';

const roster: Roster = {
  units: [
    {
      id: 'u1',
      jobId: 'warrior',
      level: 3,
      exp: 12,
      growth: { maxHp: 600, maxMp: 80, attack: 120, magic: 40, speed: 8 },
      jobs: { warrior: { jp: 40, jpTotal: 300, learned: ['powerStrike'] }, mage: { jp: 0, jpTotal: 0, learned: ['wind'] } },
      slots: { secondary: 'mage', reaction: null, support: null, movement: null },
    },
  ],
};

const dungeon: DungeonState = { run: { dungeonId: 'ruins', battle: 1 }, clears: { ruins: 2 } };

describe('セーブデータ', () => {
  it('保存した形（JSON の文字列）から読み込むと、元の部隊とダンジョンの記録に戻る', () => {
    const text = JSON.stringify(createSaveData(roster, dungeon));
    const loaded = migrateSaveData(JSON.parse(text));
    expect(loaded).toEqual({ ok: true, data: { version: SAVE_VERSION, roster, dungeon }, migratedFrom: SAVE_VERSION });
  });

  it('版 1（フェーズ2-1a・2-1b・2-2a）のデータは、版 2 に直して読み込む。部隊はそのまま、ダンジョンは挑戦中なし・クリアなし', () => {
    expect(SAVE_VERSION).toBe(2);
    const loaded = migrateSaveData({ version: 1, roster }, SAVE_MIGRATIONS);
    expect(loaded).toEqual({ ok: true, data: { version: 2, roster, dungeon: EMPTY_DUNGEON_STATE }, migratedFrom: 1 });
  });

  it('古い版のデータは、古い順に1つずつ新しい形に直してから読み込む', () => {
    // 仕組みを確かめるための、仮の版 1 → 2 → 3（版 2 で部隊の名前を units から members に変え、版 3 で戻した、とする）
    const migrations: SaveMigrations = {
      1: (old) => ({ version: 2, team: old.roster, dungeon }),
      2: (old) => ({ version: 3, roster: old.team, dungeon: old.dungeon }),
    };
    const v1 = { version: 1, roster };
    expect(migrateSaveData(v1, migrations, 3)).toEqual({ ok: true, data: { version: 3, roster, dungeon }, migratedFrom: 1 });
    expect(migrateSaveData({ version: 2, team: roster, dungeon }, migrations, 3)).toMatchObject({ ok: true, migratedFrom: 2 });
    // 直す処理が抜けている版は読めない
    expect(migrateSaveData(v1, { 2: migrations[2]! }, 3)).toEqual({ ok: false, reason: 'noMigration' });
  });

  it('読めないデータは、理由を返して読み込まない', () => {
    expect(migrateSaveData(null)).toEqual({ ok: false, reason: 'notObject' });
    expect(migrateSaveData([1, 2])).toEqual({ ok: false, reason: 'notObject' });
    expect(migrateSaveData({ roster })).toEqual({ ok: false, reason: 'noVersion' });
    expect(migrateSaveData({ version: SAVE_VERSION + 1, roster })).toEqual({ ok: false, reason: 'newerVersion' });
    expect(migrateSaveData({ version: SAVE_VERSION, roster: { units: [] }, dungeon })).toEqual({ ok: false, reason: 'badShape' });
    expect(migrateSaveData({ version: SAVE_VERSION, roster })).toEqual({ ok: false, reason: 'badShape' });
    expect(migrateSaveData({ version: SAVE_VERSION, roster, dungeon: { run: { dungeonId: 1 }, clears: {} } })).toEqual({ ok: false, reason: 'badShape' });
    expect(migrateSaveData({ version: SAVE_VERSION, roster, dungeon: { run: null, clears: { ruins: -1 } } })).toEqual({ ok: false, reason: 'badShape' });
    expect(migrateSaveData({ version: SAVE_VERSION, roster: { units: [{ id: 'x' }] }, dungeon })).toEqual({ ok: false, reason: 'badShape' });
  });
});
