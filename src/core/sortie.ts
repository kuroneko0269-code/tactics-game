/**
 * 出撃: 部隊（Roster）と、戦場の定義（マップ・味方の配置・敵の強さの段階）から、1戦ぶんの定義を組み立てる。
 *
 * - 味方は、部隊の並び順に、戦場の味方の配置へ置く。能力値・使えるアビリティ・付けている受動的なアビリティは、部隊の育成の状態から決まる。
 * - 敵は、選んだ段階で決まったレベル・成長値・習得済みアビリティ・受動的なアビリティを持つ（プレイヤーのレベルに合わせて変えない）。
 * - 並び順（行動順が同時になった時の順番）は、味方と敵を1体ずつ組にして、組ごとに先になる側を入れ替える
 *   （味方1, 敵1, 敵2, 味方2, 味方3, 敵3, ...）。どちらかの陣営を先にまとめると、同じ素早さのユニットどうしでは
 *   常にその陣営が先に動いてしまうため。
 */
import type { BattleSetup, UnitPlacement } from './battleTypes';
import type { Direction } from './geometry';
import type { MapDefinition } from './map';
import { equippedPassives, unitCommands, type GameCatalog, type Roster } from './progression';

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
  /** 敵の強さの段階（やさしい順） */
  readonly tiers: readonly EnemyTier[];
}

/** 部隊と選んだ段階から、1戦ぶんの定義を作る */
export function buildSortie(
  site: BattleSite,
  tierId: string,
  roster: Roster,
  catalog: Pick<GameCatalog, 'jobs'>,
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
  }));
  const enemies: UnitPlacement[] = tier.units.map((u) => ({ ...u, team: 'enemy' }));
  return { id: `${site.id}:${tier.id}`, map: site.map, units: interleaveTeams(players, enemies) };
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
