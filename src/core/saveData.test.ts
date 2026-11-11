import { describe, expect, it } from 'vitest';
import {
  createSaveData,
  EMPTY_RECORDS,
  migrateSaveData,
  SAVE_MIGRATIONS,
  SAVE_VERSION,
  type SaveMigrationContext,
  type SaveMigrations,
} from './saveData';
import { EMPTY_DUNGEON_STATE, type DungeonState } from './dungeon';
import type { Roster } from './progression';

const unitV2 = {
  id: 'u1',
  jobId: 'warrior',
  level: 3,
  exp: 12,
  growth: { maxHp: 600, maxMp: 80, attack: 120, magic: 40, speed: 8 },
  jobs: { warrior: { jp: 40, jpTotal: 300, learned: ['powerStrike'] }, mage: { jp: 0, jpTotal: 0, learned: ['wind'] } },
  slots: { secondary: 'mage', reaction: null, support: null, movement: null },
};
const roster: Roster = {
  units: [{ ...unitV2, equipment: { weapon: 'i1', armor: null, accessory: null } }],
  gold: 250,
  items: [
    { uid: 'i1', itemId: 'sword' },
    { uid: 'i2', itemId: 'ring' },
  ],
  nextItemSeq: 3,
};

const dungeon: DungeonState = { run: { dungeonId: 'ruins', battle: 1 }, clears: { ruins: 2 } };
const records = { trainingWins: { normal: 2 } };
const context: SaveMigrationContext = {
  starterEquipment: { warrior: ['sword', 'mail'], mage: ['rod'] },
  startingGold: 300,
  equipment: [
    { id: 'sword', slot: 'weapon' },
    { id: 'mail', slot: 'armor' },
    { id: 'rod', slot: 'weapon' },
  ],
};

describe('セーブデータ', () => {
  it('保存した形（JSON の文字列）から読み込むと、元の部隊・ダンジョンの記録・訓練戦の記録に戻る', () => {
    const text = JSON.stringify(createSaveData(roster, dungeon, records));
    const loaded = migrateSaveData(JSON.parse(text), context);
    expect(loaded).toEqual({ ok: true, data: { version: SAVE_VERSION, roster, dungeon, records }, migratedFrom: SAVE_VERSION });
  });

  it('版 1（フェーズ2-1a・2-1b・2-2a）のデータは、版 2 を経て版 3 に直す。ダンジョンは挑戦中なし・クリアなし', () => {
    expect(SAVE_VERSION).toBe(3);
    const loaded = migrateSaveData({ version: 1, roster: { units: [unitV2] } }, context, SAVE_MIGRATIONS);
    expect(loaded).toMatchObject({ ok: true, migratedFrom: 1, data: { version: 3, dungeon: EMPTY_DUNGEON_STATE, records: EMPTY_RECORDS } });
  });

  it('版 2 → 3: 育てた状態を残し、各ユニットの今のジョブの最初の装備を配って付け、最初の所持金を持たせる', () => {
    const mageV2 = { ...unitV2, id: 'u2', jobId: 'mage' };
    const loaded = migrateSaveData({ version: 2, roster: { units: [unitV2, mageV2] }, dungeon }, context);
    expect(loaded).toEqual({
      ok: true,
      migratedFrom: 2,
      data: {
        version: 3,
        dungeon,
        records: EMPTY_RECORDS,
        roster: {
          units: [
            { ...unitV2, equipment: { weapon: 'i1', armor: 'i2', accessory: null } },
            { ...mageV2, equipment: { weapon: 'i3', armor: null, accessory: null } },
          ],
          gold: 300,
          items: [
            { uid: 'i1', itemId: 'sword' },
            { uid: 'i2', itemId: 'mail' },
            { uid: 'i3', itemId: 'rod' },
          ],
          nextItemSeq: 4,
        },
      },
    });
  });

  it('古い版のデータは、古い順に1つずつ新しい形に直してから読み込む', () => {
    // 仕組みを確かめるための、仮の版 1 → 2 → 3（版 2 で部隊の名前を roster から team に変え、版 3 で戻した、とする）
    const migrations: SaveMigrations = {
      1: (old) => ({ version: 2, team: old.roster, dungeon, records }),
      2: (old) => ({ version: 3, roster: old.team, dungeon: old.dungeon, records: old.records }),
    };
    const v1 = { version: 1, roster };
    expect(migrateSaveData(v1, context, migrations, 3)).toEqual({ ok: true, data: { version: 3, roster, dungeon, records }, migratedFrom: 1 });
    expect(migrateSaveData({ version: 2, team: roster, dungeon, records }, context, migrations, 3)).toMatchObject({ ok: true, migratedFrom: 2 });
    // 直す処理が抜けている版は読めない
    expect(migrateSaveData(v1, context, { 2: migrations[2]! }, 3)).toEqual({ ok: false, reason: 'noMigration' });
  });

  it('読めないデータは、理由を返して読み込まない', () => {
    const v = SAVE_VERSION;
    expect(migrateSaveData(null, context)).toEqual({ ok: false, reason: 'notObject' });
    expect(migrateSaveData([1, 2], context)).toEqual({ ok: false, reason: 'notObject' });
    expect(migrateSaveData({ roster }, context)).toEqual({ ok: false, reason: 'noVersion' });
    expect(migrateSaveData({ version: v + 1, roster }, context)).toEqual({ ok: false, reason: 'newerVersion' });
    expect(migrateSaveData({ version: v, roster: { ...roster, units: [] }, dungeon, records }, context)).toEqual({ ok: false, reason: 'badShape' });
    expect(migrateSaveData({ version: v, roster, records }, context)).toEqual({ ok: false, reason: 'badShape' });
    expect(migrateSaveData({ version: v, roster, dungeon }, context)).toEqual({ ok: false, reason: 'badShape' });
    expect(migrateSaveData({ version: v, roster, dungeon: { run: { dungeonId: 1 }, clears: {} }, records }, context)).toEqual({ ok: false, reason: 'badShape' });
    expect(migrateSaveData({ version: v, roster, dungeon: { run: null, clears: { ruins: -1 } }, records }, context)).toEqual({ ok: false, reason: 'badShape' });
    expect(migrateSaveData({ version: v, roster: { ...roster, units: [{ id: 'x' }] }, dungeon, records }, context)).toEqual({ ok: false, reason: 'badShape' });
    expect(migrateSaveData({ version: v, roster: { ...roster, gold: 'a' }, dungeon, records }, context)).toEqual({ ok: false, reason: 'badShape' });
    expect(migrateSaveData({ version: v, roster: { ...roster, items: [{ uid: 1 }] }, dungeon, records }, context)).toEqual({ ok: false, reason: 'badShape' });
    expect(migrateSaveData({ version: v, roster, dungeon, records: { trainingWins: { easy: -1 } } }, context)).toEqual({ ok: false, reason: 'badShape' });
  });
});
