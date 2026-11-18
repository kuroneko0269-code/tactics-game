/**
 * 出撃: 部隊（Roster）と、戦場の定義（マップ・味方の配置・敵の強さの段階）から、1戦ぶんの定義を組み立てる。
 *
 * - 味方は、部隊の並び順に、戦場の味方の配置へ置く。能力値・使えるアビリティ・付けている受動的なアビリティ・装備は、
 *   部隊の育成の状態から決まる。
 * - 敵は、選んだ段階で決まったレベル・成長値・習得済みアビリティ・受動的なアビリティ・装備を持つ（プレイヤーのレベルに合わせて変えない）。
 * - 段階ごとに、勝った時の報酬（ゴールドと戦利品の候補。shop.ts）を持つ（フェーズ2-4）。
 * - 勝敗条件・マップ上のイベント・罠は、戦場の定義のものをそのまま使う（フェーズ2-2）。
 * - 出撃前の配置の画面で、味方2体の位置を入れ替えられる（swapPlacements）。
 * - 並び順（行動順が同時になった時の順番）は、味方と敵を1体ずつ組にして、組ごとに先になる側を入れ替える
 *   （味方1, 敵1, 敵2, 味方2, 味方3, 敵3, ...）。どちらかの陣営を先にまとめると、同じ素早さのユニットどうしでは
 *   常にその陣営が先に動いてしまうため。
 */
import type { BattleObjectives, BattleSetup, BystanderPlacement, MapEventDefinition, ObjectPlacement, TrapPlacement, UnitPlacement } from './battleTypes';
import type { Direction } from './geometry';
import type { MapDefinition } from './map';
import { equippedDefinitions } from './equipment';
import {
  equippedPassives,
  findJob,
  growthTotalCapOf,
  hasLearnedAll,
  isJobMastered,
  jobProgress,
  unitCommands,
  type GameCatalog,
  type ProgressionRules,
  type Roster,
} from './progression';
import type { BattleReward } from './shop';

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
  /** 勝った時の報酬（ゴールドと戦利品の候補） */
  readonly reward?: BattleReward;
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
  /** 対象物（物語の土台） */
  readonly objects?: readonly ObjectPlacement[];
  /** 戦わない背景の人々（序章に足りない仕組み。対象にならず、行動順にも入らない） */
  readonly bystanders?: readonly BystanderPlacement[];
  /**
   * 台本に書く人物の名前 → この戦場のユニットか背景の人の id（序章に足りない仕組み）。
   * 戦闘中の会話と戦闘の後の台本で、仕草・向き・カメラ・光の相手を名前で指す時に使う。
   * 部隊の人物（トウマなど）は、ここに書かなくても名前で指せる
   */
  readonly cast?: Readonly<Record<string, string>>;
  /** ユニットの id → 人物の見た目の名前（src/data/story/looks.ts。物語の相手。省くとジョブの形と陣営の色） */
  readonly looks?: Readonly<Record<string, string>>;
  /** 戦場の時刻の光（朝・昼・夕方・夜。省くと昼。序章の丘は建国の朝） */
  readonly time?: string;
  /** 名札に役目（ジョブの名前）を添えるユニットの id（ゲーム脚本の序章: 戦士ゴード・弓使いキリ・魔道士フェン・治癒師ノノ） */
  readonly roleTags?: readonly string[];
  /** 勝った後に、戦闘のマップの上で流す台本の id（帰りの門の光・人物が消える、など。戦闘の結果は変えない） */
  readonly afterVictory?: string;
  /** 戦闘の手ほどき（序章に足りない仕組み。マスやボタンを指し示し、短い説明を出して、その操作を待つ） */
  readonly tutorial?: readonly TutorialStep[];
  /**
   * 見た目だけの置き物（砦・旗・遠景の大勢の人々など。ゲーム脚本の序章）。kind は台本の物の種類の名前（src/data/story/stageDefs.ts）。
   * マップの外（x や z が範囲の外）にも置ける。戦闘の状態には入らない（通れる・対象にならない）。勝った後の台本から @動かす・@消す できる
   */
  readonly decor?: readonly { readonly id: string; readonly kind: string; readonly x: number; readonly z: number }[];
  /**
   * 戦闘の間、遠くで繰り返し鳴らす旋律（丘の歌。ゲーム脚本の序章）。名前は src/data/sounds.ts の旋律と音色。level は音の大きさ（0〜100）。
   * 勝った後の台本の @節を止める で止まる
   */
  readonly ambient?: { readonly melody: string; readonly timbre: string; readonly level: number };
}

/**
 * 戦闘の手ほどきの1段（序章に足りない仕組み）。味方の手番で、画面の操作が mode になった時に出し、
 * その操作が済んだら（操作の段階が mode から変わったら）次の段へ進む。文は src/ui/text.ts の tutorial に id で引く。
 * - point: 指し示す物（マス・ユニット・ボタン）。ボタンは操作の種類の名前（攻撃・待機・確定・手番を終える・戻る など）
 * - turn: その段を出してよい、味方の何回目の手番からか（省くと最初の手番から）
 */
export interface TutorialStep {
  readonly id: string;
  readonly mode: 'main' | 'afterMove' | 'targeting' | 'confirm' | 'facing' | 'abilityMenu' | 'spellTarget' | 'spellConfirm';
  readonly point?:
    | { readonly kind: 'tile'; readonly x: number; readonly z: number }
    | { readonly kind: 'unit'; readonly unitId: string }
    | { readonly kind: 'button'; readonly button: TutorialButton }
    /** 移動できるマスのうち、mode の操作で選ぶとよい目標に近いマス（味方の位置によって変わるため） */
    | { readonly kind: 'reachToward'; readonly x: number; readonly z: number };
  readonly turn?: number;
  /** その人物の手番の時だけ出す（ゲーム脚本の序章: ゴードを前へ、キリを崖の上へ、など） */
  readonly unitId?: string;
  /** その人物が、この高さ以上のマスに立っている時だけ出す（崖の上に立った時） */
  readonly minHeight?: number;
  /** 数えた回数（勝利条件の hitUnit の id など）がこの数に届いてから出す（3回目が当たった後） */
  readonly tally?: { readonly id: string; readonly atLeast: number };
  /**
   * この段で、物に書かれた文字（台本の @文字 の行）を、紙の札のように出す（ゲーム脚本の序章 1-10: キリを崖の上へ動かすと、
   * 測り棒の札が出る）。台本の名前。札の文は台本が正（text.ts には書かない）
   */
  readonly scriptId?: string;
}

/** 手ほどきで指し示せるボタン */
export type TutorialButton = 'attack' | 'ability' | 'wait' | 'confirm' | 'endTurn' | 'back' | 'undoMove';

/**
 * 部隊と選んだ段階から、1戦ぶんの定義を作る。
 * progression を渡すと、味方は戦闘中に経験値と JP を得る（部隊の今の経験値と、今のジョブの JP を持って出る）。
 */
export function buildSortie(
  site: BattleSite,
  tierId: string,
  roster: Roster,
  catalog: Pick<GameCatalog, 'jobs' | 'equipment'>,
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
    equipment: equippedDefinitions(u, roster, catalog),
    ...(progression
      ? {
          progress: {
            exp: u.exp,
            jp: jobProgress(u, u.jobId).jp,
            jpTotal: jobProgress(u, u.jobId).jpTotal,
            growthTotalCap: growthTotalCapOf(u, catalog, progression),
            masteryPending: !isJobMastered(u, findJob(catalog, u.jobId), progression) && hasLearnedAll(u, findJob(catalog, u.jobId)),
          },
        }
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
    ...(site.objects ? { objects: site.objects } : {}),
    ...(site.bystanders ? { bystanders: site.bystanders } : {}),
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
