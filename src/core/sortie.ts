/**
 * 出撃: 部隊（Roster）と、戦場の定義（マップ・味方の配置・敵の強さの段階）から、1戦ぶんの定義を組み立てる。
 *
 * - 味方は、部隊の並び順に、戦場の味方の配置へ置く。能力値・使えるアビリティ・付けている受動的なアビリティは、部隊の育成の状態から決まる。
 * - 敵は、選んだ段階で決まったレベル・成長値・習得済みアビリティ・受動的なアビリティを持つ（プレイヤーのレベルに合わせて変えない）。
 * - 勝敗条件・マップ上のイベント・罠は、戦場の定義のものをそのまま使う（フェーズ2-2）。
 * - 出撃前の配置の画面で、味方2体の位置を入れ替えられる（swapPlacements）。
 * - 並び順（行動順が同時になった時の順番）は、味方と敵を1体ずつ組にして、組ごとに先になる側を入れ替える
 *   （味方1, 敵1, 敵2, 味方2, 味方3, 敵3, ...）。どちらかの陣営を先にまとめると、同じ素早さのユニットどうしでは
 *   常にその陣営が先に動いてしまうため。
 */
import type { BattleObjectives, BattleSetup, MapEventDefinition, TrapPlacement, UnitPlacement } from './battleTypes';
import type { Direction } from './geometry';
import type { MapDefinition } from './map';
import { equippedPassives, jobProgress, unitCommands, type GameCatalog, type ProgressionRules, type Roster } from './progression';

/** 配置の場所 */
export interface Slot {
  readonly x: number;
  readonly z: number;
  readonly facing: Direction;
}

/** 敵の強さの段階 */
export interface EnemyTier {
  readonly id: string;
  /** 敵のユニット（team は enemy として扱う） */
  readonly units: readonly Omit<UnitPlacement, 'team'>[];
}

/** 戦場の定義（src/data に置く） */
export interface BattleSite {
  readonly id: string;
  readonly map: MapDefinition;
  /** 味方の配置。部隊の並び順に置く */
  readonly playerSlots: readonly Slot[];
  /** 敵の強さの段階（やさしい順）。ダンジョンの戦闘のように敵が決まっている戦場では1つだけ */
  readonly tiers: readonly EnemyTier[];
  /** 勝敗条件。省くと「敵の全滅で勝利、味方の全滅で敗北」 */
  readonly objectives?: BattleObjectives;
  /** マップ上のイベント */
  readonly events?: readonly MapEventDefinition[];
  /** 罠 */
  readonly traps?: readonly TrapPlacement[];
}

/**
 * 部隊と選んだ段階から、1戦ぶんの定義を作る。
 * progression を渡すと、味方は戦闘中に経験値と JP を得る（部隊の今の経験値と、今のジョブの JP を持って出る）。
 */
export function buildSortie(
  site: BattleSite,
  tierId: string,
  roster: Roster,
  catalog: Pick<GameCatalog, 'jobs'>,
  progression?: ProgressionRules,
): BattleSetup {
  const tier = site.tiers.find((t) => t.id === tierId);
  if (!tier) throw new Error(`敵の段階 ${tierId} が見つかりません`);
  if (roster.units.length > site.playerSlots.length) throw new Error('味方の配置が足りません');
  const players: UnitPlacement[] = roster.units.map((u, i) => ({
    id: u.id,
    team: 'player',
    jobId: u.jobId,
    ...site.playerSlots[i]!,
    level: u.level,
    growth: u.growth,
    commands: unitCommands(u, catalog),
    passives: equippedPassives(u),
    ...(progression
      ? { progress: { exp: u.exp, jp: jobProgress(u, u.jobId).jp, jpTotal: jobProgress(u, u.jobId).jpTotal } }
      : {}),
  }));
  const enemies: UnitPlacement[] = tier.units.map((u) => ({ ...u, team: 'enemy' }));
  return {
    id: `${site.id}:${tier.id}`,
    map: site.map,
    units: interleaveTeams(players, enemies),
    objectives: site.objectives,
    events: site.events,
    traps: site.traps,
    ...(progression ? { progression } : {}),
  };
}

/**
 * 出撃前の配置で、味方2体の位置（と向き）を入れ替える。並び順（行動順が同時になった時の順番）は変えない。
 * どちらかが味方でない・同じユニットの時はエラー。
 */
export function swapPlacements(setup: BattleSetup, idA: string, idB: string): BattleSetup {
  const a = setup.units.find((u) => u.id === idA);
  const b = setup.units.find((u) => u.id === idB);
  if (!a || !b || a.team !== 'player' || b.team !== 'player') throw new Error(`味方 ${idA} と ${idB} は入れ替えられません`);
  if (idA === idB) throw new Error('同じユニットは入れ替えられません');
  const spot = (u: UnitPlacement) => ({ x: u.x, z: u.z, facing: u.facing });
  return {
    ...setup,
    units: setup.units.map((u) => (u.id === idA ? { ...u, ...spot(b) } : u.id === idB ? { ...u, ...spot(a) } : u)),
  };
}

/** 味方と敵を1体ずつ組にして、組ごとに先になる側を入れ替えて並べる（味方1, 敵1, 敵2, 味方2, 味方3, 敵3, ...） */
export function interleaveTeams<T>(players: readonly T[], enemies: readonly T[]): T[] {
  const result: T[] = [];
  const n = Math.max(players.length, enemies.length);
  for (let i = 0; i < n; i++) {
    const pair = [players[i], enemies[i]].filter((u): u is T => u !== undefined);
    result.push(...(i % 2 === 0 ? pair : pair.reverse()));
  }
  return result;
}
