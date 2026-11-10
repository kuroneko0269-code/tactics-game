import { describe, expect, it } from 'vitest';
import type { BattleState, GrowthValues, JobDefinition } from './battleTypes';
import {
  addGrowth,
  applyBattleResult,
  changeJob,
  expToNext,
  gainExp,
  gainJp,
  growthPoints,
  isGrowthCapped,
  jobLevel,
  learnAbility,
  learnRefusal,
  levelDown,
  levelUp,
  secondaryChoices,
  setSecondary,
  statsWithGrowth,
  unitCommands,
  unitStats,
  validateRoster,
  ZERO_GROWTH,
  type GameCatalog,
  type ProgressionRules,
  type Roster,
  type RosterUnit,
} from './progression';
import { makeState, testArcher, testHealer, testMage, testSpells, testStrikes, testWarrior } from './testSupport';

/** HP がよく伸びるジョブ（成長率 HP 3.0、攻撃力 0.6） */
const sturdy: JobDefinition = {
  ...testWarrior,
  abilities: [{ id: 'powerStrike', jpCost: 100 }],
  growth: { maxHp: 300, maxMp: 0, attack: 60, magic: 10, speed: 4 },
};
/** 魔力と MP がよく伸び、HP は伸びにくいジョブ */
const scholar: JobDefinition = {
  ...testMage,
  growth: { maxHp: 150, maxMp: 120, attack: 20, magic: 70, speed: 4 },
};
/** ほかのジョブのレベルで解放されるジョブ */
const knight: JobDefinition = {
  ...testWarrior,
  id: 'knight',
  growth: { maxHp: 250, maxMp: 0, attack: 50, magic: 0, speed: 4 },
  unlock: [{ jobId: 'warrior', level: 3 }],
};
const catalog: GameCatalog = {
  jobs: [sturdy, { ...testArcher, abilities: [{ id: 'aimedShot', jpCost: 120 }] }, scholar, testHealer, knight],
  spells: testSpells,
  strikes: testStrikes,
};

const rules: ProgressionRules = {
  maxLevel: 50,
  expBase: 100,
  expPerLevel: 10,
  expPerAction: 10,
  jpPerAction: 20,
  jpVictoryBonus: 50,
  jobLevelJp: [100, 250, 450, 700, 1000, 1350, 1750],
  growthCap: { maxHp: 2000, maxMp: 2000, attack: 600, magic: 600, speed: 100 },
  growthWeights: { maxHp: 1, maxMp: 1, attack: 4, magic: 4, speed: 20 },
  growthTotalCap: 60,
};

const recruit = (jobId = 'warrior', patch: Partial<RosterUnit> = {}): RosterUnit => ({
  id: 'u1',
  jobId,
  level: 1,
  exp: 0,
  growth: ZERO_GROWTH,
  jobs: { [jobId]: { jp: 0, jpTotal: 0, learned: [] } },
  slots: { secondary: null, reaction: null, support: null, movement: null },
  ...patch,
});

const levelTimes = (u: RosterUnit, n: number) => {
  let x = u;
  for (let i = 0; i < n; i++) x = levelUp(x, catalog, rules);
  return x;
};

describe('キャラクターのレベルと成長値', () => {
  it('レベルが上がると、その時のジョブの成長率ぶん成長値が増える。能力値は基本値 + 成長値（端数は持ち越す）', () => {
    const u = levelUp(recruit(), catalog, rules);
    expect(u.level).toBe(2);
    expect(u.growth).toEqual({ maxHp: 300, maxMp: 0, attack: 60, magic: 10, speed: 4 });
    // 攻撃力 +0.6 は、まだ能力値に足されない（切り捨て）。2 回目で +1.2 → +1
    expect(unitStats(u, catalog).attack).toBe(testWarrior.stats.attack);
    expect(unitStats(levelUp(u, catalog, rules), catalog).attack).toBe(testWarrior.stats.attack + 1);
    expect(unitStats(u, catalog).maxHp).toBe(testWarrior.stats.maxHp + 3);
  });

  it('どのジョブでレベルを上げたかで、伸び方が変わる', () => {
    const asWarrior = levelTimes(recruit('warrior'), 10);
    const asMage = levelTimes(recruit('mage', { jobs: { mage: { jp: 0, jpTotal: 0, learned: [] } } }), 10);
    expect(asWarrior.growth.maxHp).toBe(3000 > rules.growthCap.maxHp ? rules.growthCap.maxHp : 3000);
    expect(asWarrior.growth.maxHp).toBeGreaterThan(asMage.growth.maxHp);
    expect(asMage.growth.magic).toBeGreaterThan(asWarrior.growth.magic);
    // 同じジョブに就いても、育て方で能力値が違う
    const a = unitStats({ ...asWarrior, jobId: 'mage' }, catalog);
    const b = unitStats({ ...asMage, jobId: 'mage' }, catalog);
    expect(a.maxHp).toBeGreaterThan(b.maxHp);
    expect(b.magic).toBeGreaterThan(a.magic);
  });

  it('経験値が貯まるとレベルが上がる。余りは持ち越し、一度に何レベルも上がれる。上限では貯まらない', () => {
    expect(expToNext(1, rules)).toBe(100);
    expect(expToNext(2, rules)).toBe(110);
    const u = gainExp(recruit(), 250, catalog, rules);
    expect(u.level).toBe(3);
    expect(u.exp).toBe(40);
    const max = gainExp(recruit('warrior', { level: 50 }), 999, catalog, rules);
    expect(max.level).toBe(50);
    expect(max.exp).toBe(0);
    const almost = gainExp(recruit('warrior', { level: 49 }), 99999, catalog, rules);
    expect(almost.level).toBe(50);
    expect(almost.exp).toBe(0);
  });

  it('レベルを下げると、その時のジョブの成長率ぶん成長値が減る（0 より下にはならない）。レベル 1 では下がらない', () => {
    const grown = levelTimes(recruit(), 3);
    const down = levelDown({ ...grown, exp: 50 }, catalog);
    expect(down.level).toBe(3);
    expect(down.exp).toBe(0);
    expect(down.growth).toEqual({ maxHp: 600, maxMp: 0, attack: 120, magic: 20, speed: 8 });
    // 伸びの悪いジョブ（MP の成長率 1.2 の魔術師）で下げても、0 より下にはならない
    expect(levelDown({ ...grown, jobId: 'mage' }, catalog).growth.maxMp).toBe(0);
    expect(levelDown(recruit(), catalog)).toEqual(recruit());
  });

  it('伸びの悪いジョブで下げ、伸びの良いジョブで上げ直すと、差し引きで成長値が増える', () => {
    const start = levelTimes(recruit(), 5);
    const down = levelDown({ ...start, jobId: 'mage' }, catalog);
    const up = levelUp({ ...down, jobId: 'warrior' }, catalog, rules);
    expect(up.level).toBe(start.level);
    expect(up.growth.maxHp - start.growth.maxHp).toBe(sturdy.growth!.maxHp - scholar.growth!.maxHp);
    expect(up.growth.attack).toBeGreaterThan(start.growth.attack);
  });

  it('能力ごとの成長値と、成長の点数の合計には上限がある', () => {
    // 能力ごと: HP の上限 2000 を超えない
    const capped = addGrowth({ ...ZERO_GROWTH, maxHp: 1900 }, sturdy.growth!, rules);
    expect(capped.maxHp).toBe(2000);
    // 合計: 60 点（×100 で 6000）を超えない。順番（HP → MP → 攻撃力 → 魔力 → 素早さ）に入る分だけ足す
    const near: GrowthValues = { maxHp: 1000, maxMp: 0, attack: 600, magic: 0, speed: 0 };
    expect(growthPoints(near, rules)).toBe(34);
    const full = addGrowth(near, { maxHp: 2000, maxMp: 0, attack: 0, magic: 600, speed: 0 }, rules);
    expect(full.maxHp).toBe(2000);
    expect(full.magic).toBe(400);
    expect(growthPoints(full, rules)).toBe(60);
    expect(isGrowthCapped(full, rules)).toBe(true);
    // 上限に達したら、レベルが上がっても成長値は増えない（レベルは上がる）
    const u = levelUp(recruit('warrior', { growth: full }), catalog, rules);
    expect(u.level).toBe(2);
    expect(u.growth).toEqual(full);
    // すべての能力を最大にはできない
    const allMax = rules.growthCap;
    expect(growthPoints(allMax, rules)).toBeGreaterThan(rules.growthTotalCap);
  });

  it('能力値は成長値を 100 で割って切り捨てて足す（移動力とジャンプ力は変わらない）', () => {
    const s = statsWithGrowth(testWarrior.stats, { maxHp: 1299, maxMp: 50, attack: 100, magic: 0, speed: 199 });
    expect(s).toEqual({ ...testWarrior.stats, maxHp: testWarrior.stats.maxHp + 12, attack: testWarrior.stats.attack + 1, speed: testWarrior.stats.speed + 1 });
  });
});

describe('JP とジョブのレベル', () => {
  it('JP は今のジョブに入り、累計でジョブのレベルが 1〜8 に上がる。習得で使っても、ジョブのレベルは下がらない', () => {
    let u = gainJp(recruit(), 'warrior', 99);
    expect(jobLevel(u, 'warrior', rules)).toBe(1);
    u = gainJp(u, 'warrior', 1);
    expect(jobLevel(u, 'warrior', rules)).toBe(2);
    u = learnAbility(u, 'warrior', 'powerStrike', catalog, rules);
    expect(u.jobs.warrior).toEqual({ jp: 0, jpTotal: 100, learned: ['powerStrike'] });
    expect(jobLevel(u, 'warrior', rules)).toBe(2);
    u = gainJp(u, 'warrior', 5000);
    expect(jobLevel(u, 'warrior', rules)).toBe(8);
    expect(jobLevel(u, 'archer', rules)).toBe(1);
  });

  it('習得できるかの判定: JP が足りない・習得済み・そのジョブのアビリティでない・ジョブが解放されていない', () => {
    const u = gainJp(recruit(), 'warrior', 99);
    expect(learnRefusal(u, 'warrior', 'powerStrike', catalog, rules)).toBe('notEnoughJp');
    expect(learnRefusal(gainJp(u, 'warrior', 1), 'warrior', 'powerStrike', catalog, rules)).toBeNull();
    expect(learnRefusal(u, 'warrior', 'fire', catalog, rules)).toBe('unknownAbility');
    const learned = learnAbility(gainJp(u, 'warrior', 1), 'warrior', 'powerStrike', catalog, rules);
    expect(learnRefusal(learned, 'warrior', 'powerStrike', catalog, rules)).toBe('alreadyLearned');
    expect(() => learnAbility(u, 'warrior', 'powerStrike', catalog, rules)).toThrow();
    // ほかのジョブの JP では習得できない（ジョブごとの JP を使う）
    expect(learnRefusal(gainJp(u, 'archer', 500), 'warrior', 'powerStrike', catalog, rules)).toBe('notEnoughJp');
    expect(learnRefusal(gainJp(u, 'archer', 500), 'archer', 'aimedShot', catalog, rules)).toBeNull();
  });

  it('戦闘の結果: 行動の回数ぶんの経験値と JP、勝てば全員に追加の JP。負けても得た分は持ち帰れる', () => {
    const roster: Roster = { units: [recruit(), { ...recruit('archer'), id: 'u2', jobs: { archer: { jp: 0, jpTotal: 0, learned: [] } } }] };
    const battle = (winner: 'player' | 'enemy'): BattleState => {
      const s = makeState({
        heights: [[0, 0, 0, 0]],
        units: [
          { id: 'u1', team: 'player', x: 0, z: 0 },
          { id: 'u2', team: 'player', job: testArcher, x: 1, z: 0 },
          { id: 'e', team: 'enemy', x: 3, z: 0 },
        ],
      });
      const counts: Record<string, number> = { u1: 12, u2: 3, e: 9 };
      return { ...s, winner, turn: null, units: s.units.map((u) => ({ ...u, actionCount: counts[u.id]! })) };
    };
    const won = applyBattleResult(roster, battle('player'), catalog, rules);
    expect(won.report.victory).toBe(true);
    const u1 = won.roster.units[0]!;
    expect(u1.level).toBe(2);
    expect(u1.exp).toBe(20);
    expect(u1.jobs.warrior).toEqual({ jp: 12 * 20 + 50, jpTotal: 290, learned: [] });
    expect(won.report.units[0]).toMatchObject({ unitId: 'u1', actions: 12, exp: 120, jp: 290, levelBefore: 1, levelAfter: 2, jobLevelBefore: 1, jobLevelAfter: 3 });
    expect(won.roster.units[1]!.jobs.archer!.jp).toBe(3 * 20 + 50);

    const lost = applyBattleResult(roster, battle('enemy'), catalog, rules);
    expect(lost.report.victory).toBe(false);
    expect(lost.roster.units[0]!.level).toBe(2);
    expect(lost.roster.units[0]!.jobs.warrior!.jp).toBe(12 * 20);
    // 敵のユニットは部隊に入らない
    expect(lost.roster.units.map((u) => u.id)).toEqual(['u1', 'u2']);
  });
});

describe('ジョブチェンジと副コマンド', () => {
  it('ジョブを変えると、成長値はそのままで、能力値は新しいジョブの基本値 + 成長値になる', () => {
    const grown = levelTimes(recruit(), 4);
    const mage = changeJob(grown, 'mage', catalog, rules);
    expect(mage.growth).toEqual(grown.growth);
    expect(unitStats(mage, catalog)).toEqual(statsWithGrowth(testMage.stats, grown.growth));
    // 最初から習得済みのアビリティ（風）は、そのジョブに就いた時に習得済みになる
    expect(mage.jobs.mage!.learned).toEqual(['wind']);
    expect(unitCommands(mage, catalog)).toEqual([{ jobId: 'mage', abilityIds: ['wind'] }]);
  });

  it('解放条件（ほかのジョブのレベル）を満たさないジョブには就けない', () => {
    const u = recruit();
    expect(() => changeJob(u, 'knight', catalog, rules)).toThrow();
    const ready = gainJp(u, 'warrior', 250);
    expect(changeJob(ready, 'knight', catalog, rules).jobId).toBe('knight');
  });

  it('副コマンド: ほかのジョブで習得済みのアビリティを使える。今のジョブと同じジョブ、習得済みがないジョブは付けられない', () => {
    let u = changeJob(recruit(), 'mage', catalog, rules);
    u = changeJob(u, 'warrior', catalog, rules);
    expect(secondaryChoices(u, catalog)).toEqual(['mage']);
    expect(() => setSecondary(u, 'archer', catalog)).toThrow();
    expect(() => setSecondary(u, 'warrior', catalog)).toThrow();
    u = setSecondary(u, 'mage', catalog);
    expect(unitCommands(u, catalog)).toEqual([
      { jobId: 'warrior', abilityIds: [] },
      { jobId: 'mage', abilityIds: ['wind'] },
    ]);
    // 副コマンドと同じジョブに変えたら、副コマンドは外れる
    expect(changeJob(u, 'mage', catalog, rules).slots.secondary).toBeNull();
    expect(setSecondary(u, null, catalog).slots.secondary).toBeNull();
  });
});

describe('編成の検証', () => {
  it('正しい部隊なら誤りはない', () => {
    let u = changeJob(recruit(), 'mage', catalog, rules);
    u = setSecondary(changeJob(u, 'warrior', catalog, rules), 'mage', catalog);
    expect(validateRoster({ units: [u, { ...recruit('archer'), id: 'u2' }] }, catalog, rules)).toEqual([]);
  });

  it('ルールに合わない部隊の誤りを見つける', () => {
    const bad: Roster = {
      units: [
        recruit('warrior', { level: 0, exp: -1 }),
        recruit('nope', { id: 'u2' }),
        recruit('knight', { id: 'u3' }),
        recruit('warrior', {
          id: 'u4',
          growth: { ...ZERO_GROWTH, maxHp: 5000, attack: 600, magic: 600 },
          jobs: { warrior: { jp: 10, jpTotal: 5, learned: ['fire'] } },
          slots: { secondary: 'warrior', reaction: 'counter', support: null, movement: null },
        }),
        recruit('warrior', { id: 'u4' }),
      ],
    };
    const kinds = validateRoster(bad, catalog, rules).map((p) => p.kind);
    expect(kinds).toEqual(
      expect.arrayContaining([
        'badLevel',
        'badExp',
        'unknownJob',
        'jobLocked',
        'badGrowth',
        'growthOverTotal',
        'badJp',
        'unknownAbility',
        'badSecondary',
        'slotNotAvailable',
        'duplicateUnit',
      ]),
    );
  });
});
