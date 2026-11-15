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
  legacyUnitIds: { 'hero-1': 'touma', 'hero-2': 'gord' },
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
    expect(loaded).toEqual({ ok: true, data: { version: SAVE_VERSION, roster, dungeon, records, battle: null, story: {} }, migratedFrom: SAVE_VERSION });
  });

  it('版 3 → 4（フェーズ2-5）: 途中の戦闘「なし」を足す。部隊・ダンジョン・記録はそのまま', () => {
    expect(migrateSaveData({ version: 3, roster, dungeon, records }, context)).toEqual({
      ok: true,
      migratedFrom: 3,
      data: { version: SAVE_VERSION, roster, dungeon, records, battle: null, story: {} },
    });
    // 途中の戦闘の形が崩れていれば、その戦闘だけ捨てる
    expect(migrateSaveData({ version: 4, roster, dungeon, records, battle: { origin: { kind: 'x' }, state: null } }, context)).toMatchObject({
      ok: true,
      data: { battle: null },
    });
  });

  it('版 1（フェーズ2-1a・2-1b・2-2a）のデータは、版 2・3・4 を経て版 5 に直す。ダンジョンは挑戦中なし・クリアなし', () => {
    expect(SAVE_VERSION).toBe(6);
    const loaded = migrateSaveData({ version: 1, roster: { units: [unitV2] } }, context, SAVE_MIGRATIONS);
    expect(loaded).toMatchObject({ ok: true, migratedFrom: 1, data: { version: 6, dungeon: EMPTY_DUNGEON_STATE, records: EMPTY_RECORDS, battle: null } });
  });

  it('版 2 → 3: 育てた状態を残し、各ユニットの今のジョブの最初の装備を配って付け、最初の所持金を持たせる', () => {
    const mageV2 = { ...unitV2, id: 'u2', jobId: 'mage' };
    const loaded = migrateSaveData({ version: 2, roster: { units: [unitV2, mageV2] }, dungeon }, context);
    expect(loaded).toEqual({
      ok: true,
      migratedFrom: 2,
      data: {
        version: SAVE_VERSION,
        dungeon,
        records: EMPTY_RECORDS,
        battle: null,
        story: {},
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

  it('版 4 → 5（フェーズ2-6）: ユニットの id を人物の id に付け替える。途中の戦闘の中の id も付け替え、新しい項目を足す', () => {
    const units = [
      { ...unitV2, id: 'hero-1', equipment: { weapon: null, armor: null, accessory: null } },
      { ...unitV2, id: 'hero-2', equipment: { weapon: null, armor: null, accessory: null } },
    ];
    const state = {
      units: [
        { id: 'hero-1', team: 'player', hp: 30, charging: { spellId: 'heal', target: { kind: 'unit', unitId: 'hero-2' }, progress: 10 } },
        { id: 'hero-2', team: 'player', hp: 12 },
        { id: 'e-1', team: 'enemy', hp: 40 },
      ],
      turn: { unitId: 'hero-2', moved: false, acted: false },
      map: {},
      rules: {},
      scenario: { objectives: { victory: [], defeat: [{ kind: 'unitDefeated', unitId: 'hero-1' }] } },
      rngState: 5,
      turnNumber: 3,
      winner: null,
    };
    const old = {
      version: 4,
      roster: { ...roster, units },
      dungeon,
      records,
      battle: { origin: { kind: 'training', tierId: 'easy' }, state },
    };
    const loaded = migrateSaveData(old, context);
    if (!loaded.ok) throw new Error('読めませんでした');
    expect(loaded.data.roster.units.map((u) => u.id)).toEqual(['touma', 'gord']);
    // 育てた状態（今のジョブ・レベル・JP など）はそのまま
    expect(loaded.data.roster.units[0]).toEqual({ ...units[0], id: 'touma' });
    const b = loaded.data.battle!.state as unknown as typeof state & { units: Record<string, unknown>[] };
    expect(b.units.map((u) => u.id)).toEqual(['touma', 'gord', 'e-1']);
    expect(b.turn.unitId).toBe('gord');
    expect(b.units[0]).toMatchObject({ turnStartHp: 30, endureUsed: false, charging: { target: { unitId: 'gord' } } });
    expect(b.scenario.objectives.defeat[0]).toEqual({ kind: 'unitDefeated', unitId: 'touma' });
  });

  it('古い版のデータは、古い順に1つずつ新しい形に直してから読み込む', () => {
    // 仕組みを確かめるための、仮の版 1 → 2 → 3（版 2 で部隊の名前を roster から team に変え、版 3 で戻した、とする）
    const migrations: SaveMigrations = {
      1: (old) => ({ version: 2, team: old.roster, dungeon, records }),
      2: (old) => ({ version: 3, roster: old.team, dungeon: old.dungeon, records: old.records }),
    };
    const v1 = { version: 1, roster };
    expect(migrateSaveData(v1, context, migrations, 3)).toEqual({ ok: true, data: { version: 3, roster, dungeon, records, battle: null, story: {} }, migratedFrom: 1 });
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
