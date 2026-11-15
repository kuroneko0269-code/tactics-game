import { describe, expect, it } from 'vitest';
import { applyAction, getUnit, startBattle } from './battle';
import type { BattleState, JobDefinition, SpellDefinition, StatusId } from './battleTypes';
import { previewAttack, weaponFits } from './combat';
import { applyStatusStats } from './effects';
import { predictTimeline } from './turnOrder';
import { flat, makeState, testRules, testWarrior } from './testSupport';

/** 新しい状態変化（フェーズ2-6）: 攻撃力低下・魔力低下・素早さ低下・最大 HP 低下・目くらまし・停止・加速 */
const wait = (state: BattleState) => applyAction(state, { type: 'endTurn', facing: getUnit(state, state.turn!.unitId).facing });
/** 状態変化を付ける魔法（その場で発動する、テスト用） */
const statusSpell = (status: StatusId): SpellDefinition => ({
  id: `give-${status}`,
  kind: 'magic',
  element: 'none',
  effect: 'status',
  inflicts: status,
  instant: true,
  power: 0,
  mpCost: 0,
  range: 5,
  areaRadius: 0,
  heightTolerance: 0,
  castSpeed: 0,
});

/** w が e に status を付けた後の状態（e の能力値は付いた時に計算し直される） */
function inflicted(status: StatusId, eHp?: number): BattleState {
  const state = makeState({
    heights: flat(4, 1),
    units: [
      { id: 'w', team: 'player', x: 0, z: 0 },
      { id: 'e', team: 'enemy', x: 1, z: 0, hp: eHp },
    ],
  });
  const spell = statusSpell(status);
  const withSpell = { ...state, units: state.units.map((u) => (u.id === 'w' ? { ...u, spells: [spell] } : u)) };
  return applyAction(withSpell, { type: 'cast', spellId: spell.id, target: { kind: 'unit', unitId: 'e' } }).state;
}

describe('能力値を変える状態変化', () => {
  it('攻撃力低下・魔力低下・素早さ低下・加速・最大 HP 低下は、能力値に倍率を掛ける（切り捨て、素早さと最大 HP は最低 1）', () => {
    const stats = testWarrior.stats;
    const of = (id: StatusId) => applyStatusStats(stats, [{ id, turns: 2 }], testRules);
    expect(of('attackDown').attack).toBe(15);
    expect(of('magicDown').magic).toBe(0);
    expect(of('speedDown').speed).toBe(3);
    expect(of('haste').speed).toBe(9);
    expect(of('maxHpDown').maxHp).toBe(40);
    expect(applyStatusStats({ ...stats, speed: 1 }, [{ id: 'speedDown', turns: 1 }], testRules).speed).toBe(1);
    // 素早さ低下と加速が両方付いていれば、両方掛ける
    expect(applyStatusStats(stats, [{ id: 'haste', turns: 1 }, { id: 'speedDown', turns: 1 }], testRules).speed).toBe(4);
  });

  it('付いた時に能力値が変わり、攻撃の予測にも効く。持続が切れると元に戻る', () => {
    const s = inflicted('attackDown');
    const e = getUnit(s, 'e');
    expect(e.stats.attack).toBe(15);
    expect(e.statuses).toEqual([{ id: 'attackDown', turns: 3 }]);
    // e の攻撃は 15 ダメージ（正面）
    expect(previewAttack(s, e, getUnit(s, 'w')).damage).toBe(15);
    // e の手番が 3 回終わると消えて、攻撃力が戻る
    let state = wait(s).state;
    for (let i = 0; i < 6 && getUnit(state, 'e').statuses.length > 0; i++) state = wait(state).state;
    expect(getUnit(state, 'e').statuses).toEqual([]);
    expect(getUnit(state, 'e').stats.attack).toBe(20);
  });

  it('最大 HP 低下: 今の HP は新しい最大まで下がり、消えても今の HP は戻らない', () => {
    const s = inflicted('maxHpDown');
    expect(getUnit(s, 'e')).toMatchObject({ hp: 40, stats: expect.objectContaining({ maxHp: 40 }) });
    let state = s;
    for (let i = 0; i < 8 && getUnit(state, 'e').statuses.length > 0; i++) state = wait(state).state;
    expect(getUnit(state, 'e')).toMatchObject({ hp: 40, stats: expect.objectContaining({ maxHp: 50 }) });
  });

  it('素早さ低下と加速は、行動順の速さを変える', () => {
    const slow = getUnit(inflicted('speedDown'), 'e');
    const fast = getUnit(inflicted('haste'), 'e');
    expect([slow.stats.speed, fast.stats.speed]).toEqual([3, 9]);
  });
});

describe('目くらまし・停止', () => {
  it('目くらまし: 武器による攻撃の命中率 -30（予測にも出る）', () => {
    const s = inflicted('blind');
    const p = previewAttack(s, getUnit(s, 'e'), getUnit(s, 'w'));
    expect(p.blindPenalty).toBe(30);
    expect(p.hitPercent).toBe(85 - 30);
  });

  it('停止: 次の手番は何もできずに過ぎる（手番の数に数えない）。その後の CT は 0、停止は消える。行動順の予測にも出ない', () => {
    const s = inflicted('stop');
    expect(predictTimeline(s, 3).filter((x) => x.kind === 'turn' && x.unitId === 'e')).toHaveLength(0);
    // w の手番を終えると、e の手番が来るはずだが過ぎて、また w の手番になる
    let state = s;
    let r = wait(state);
    while (!r.events.some((e) => e.type === 'turnSkipped')) {
      expect(r.state.turn?.unitId).toBe('w');
      state = r.state;
      r = wait(state);
    }
    expect(r.events).toContainEqual({ type: 'turnSkipped', unitId: 'e', ct: 0 });
    expect(r.events).toContainEqual({ type: 'statusExpired', unitId: 'e', status: 'stop' });
    expect(r.state.turn?.unitId).toBe('w');
    expect(r.state.turnNumber).toBe(state.turnNumber + 1);
    expect(getUnit(r.state, 'e').statuses).toEqual([]);
  });
});

describe('素手（フェーズ2-6）', () => {
  it('素手の時だけ合うアビリティ（unarmed）。素手の時のジョブの補正は、武器の枠が空の時だけ能力値に足す', () => {
    expect(weaponFits(['unarmed'], null)).toBe(true);
    expect(weaponFits(['unarmed'], 'sword')).toBe(false);
    const monk: JobDefinition = { ...testWarrior, id: 'monk', weaponTypes: [], unarmedBonus: { attack: 7 } };
    const setup = (equipment: never[] | undefined) => ({
      id: 't',
      map: { id: 'm', heights: flat(3, 1), terrain: ['ggg'], legend: { g: 'grass' as const } },
      units: [
        { id: 'm', team: 'player' as const, jobId: 'monk', x: 0, z: 0, facing: 'east' as const, ...(equipment ? { equipment } : {}) },
        { id: 'e', team: 'enemy' as const, jobId: 'warrior', x: 2, z: 0, facing: 'west' as const },
      ],
    });
    const bare = startBattle(setup([]), [monk, testWarrior], testRules, 1).state;
    expect(getUnit(bare, 'm')).toMatchObject({ weapon: null, stats: expect.objectContaining({ attack: 27 }) });
  });
});
