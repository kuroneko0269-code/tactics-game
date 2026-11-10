/**
 * 戦闘で使う型。
 * 戦闘の状態（BattleState）は JSON にそのまま変換できる単純なデータだけで組み立てる。
 * 数値（能力値や命中率）は src/data の定義データから受け取り、ここには書かない。
 */
import type { Coord, Direction, RelativeSide } from './geometry';
import type { BattleMap, MapDefinition } from './map';

export type Team = 'player' | 'enemy';

/** 能力値 */
export interface UnitStats {
  readonly maxHp: number;
  readonly attack: number;
  /** 素早さ。時間の経過ごとに CT に足される */
  readonly speed: number;
  /** 移動力。1回の移動で進める歩数 */
  readonly move: number;
  /** ジャンプ力。隣のマスとの高さの差がこれ以下なら進める */
  readonly jump: number;
}

/** 通常攻撃の届き方 */
export type AttackProfile =
  | {
      /** 隣接マスへの近接攻撃 */
      readonly kind: 'melee';
      /** 攻撃できる相手との高さの差の上限 */
      readonly maxHeightDiff: number;
    }
  | {
      /** 離れたマスへの射撃 */
      readonly kind: 'ranged';
      /** 射程の下限（歩数） */
      readonly minRange: number;
      /** 射程の上限（歩数） */
      readonly maxRange: number;
      /** 相手より高い位置にいるとき、高さの差がこの値ごとに射程の上限が 1 伸びる */
      readonly heightPerExtraRange: number;
    };

export interface JobDefinition {
  readonly id: string;
  readonly stats: UnitStats;
  readonly attack: AttackProfile;
}

/** 戦闘ルールの数値。百分率はすべて整数 */
export interface BattleRules {
  /** CT がこの値に達したユニットが行動する */
  readonly ctThreshold: number;
  /** 手番の後の CT: 移動と行動の両方をした時 */
  readonly ctAfterMoveAndAct: number;
  /** 手番の後の CT: 移動と行動のどちらか片方だけをした時 */
  readonly ctAfterMoveOrAct: number;
  /** 手番の後の CT: どちらもせず待機した時 */
  readonly ctAfterWait: number;
  /** 命中率（%）。攻撃対象から見た攻撃側の位置で決まる */
  readonly hitPercent: Readonly<Record<RelativeSide, number>>;
  /** ダメージの倍率（%）。攻撃対象から見た攻撃側の位置で決まる */
  readonly damagePercent: Readonly<Record<RelativeSide, number>>;
  /** 高低差 1 段あたりのダメージ補正（%）。攻撃側が高ければ増え、低ければ減る */
  readonly heightDamagePercentPerStep: number;
  /** 高低差によるダメージ補正の上限（%）。下限はこれの負の値 */
  readonly heightDamagePercentCap: number;
  /** 命中した時のダメージの最小値 */
  readonly minimumDamage: number;
}

/** 戦闘開始時のユニット配置（src/data に置く） */
export interface UnitPlacement {
  readonly id: string;
  readonly team: Team;
  readonly jobId: string;
  readonly x: number;
  readonly z: number;
  readonly facing: Direction;
}

/** 1戦ぶんの定義（src/data に置く） */
export interface BattleSetup {
  readonly id: string;
  readonly map: MapDefinition;
  readonly units: readonly UnitPlacement[];
}

export interface UnitState {
  readonly id: string;
  readonly team: Team;
  readonly jobId: string;
  readonly x: number;
  readonly z: number;
  readonly facing: Direction;
  /** 0 になったら戦闘不能 */
  readonly hp: number;
  readonly ct: number;
  readonly stats: UnitStats;
  readonly attack: AttackProfile;
}

/** いま手番を持っているユニットの進み具合 */
export interface TurnState {
  readonly unitId: string;
  readonly moved: boolean;
  readonly acted: boolean;
  /** 手番開始時の位置と向き（移動の取り消しで戻す先） */
  readonly origin: Coord & { readonly facing: Direction };
}

export interface BattleState {
  readonly map: BattleMap;
  readonly rules: BattleRules;
  readonly units: readonly UnitState[];
  /** 手番を持っているユニット。決着後は null */
  readonly turn: TurnState | null;
  /** 勝った陣営。決着前は null */
  readonly winner: Team | null;
  /** 乱数生成器の内部状態（rng.ts の getState の値） */
  readonly rngState: number;
  /** これまでに始まった手番の数 */
  readonly turnNumber: number;
}

/** プレイヤーや AI が選ぶ行動 */
export type BattleAction =
  | { readonly type: 'move'; readonly x: number; readonly z: number }
  /** 行動する前なら、移動を取り消して手番開始時の位置と向きに戻せる */
  | { readonly type: 'undoMove' }
  | { readonly type: 'attack'; readonly targetId: string }
  /** 向きを決めて手番を終える */
  | { readonly type: 'endTurn'; readonly facing: Direction };

/** 戦闘中に起きた出来事。画面はこれを順に再生するだけにする */
export type BattleEvent =
  | { readonly type: 'turnStarted'; readonly unitId: string; readonly turnNumber: number }
  | { readonly type: 'moved'; readonly unitId: string; readonly path: readonly Coord[] }
  | {
      readonly type: 'moveUndone';
      readonly unitId: string;
      readonly x: number;
      readonly z: number;
      readonly facing: Direction;
    }
  | {
      readonly type: 'attacked';
      readonly attackerId: string;
      readonly targetId: string;
      /** 攻撃のために攻撃側が向き直った向き */
      readonly attackerFacing: Direction;
      readonly side: RelativeSide;
      readonly hitPercent: number;
      /** 高低差によるダメージ補正（%）。マイナスもある */
      readonly heightPercent: number;
      readonly hit: boolean;
      /** 与えたダメージ。外れたら 0 */
      readonly damage: number;
      /** 攻撃後の対象の HP */
      readonly targetHp: number;
    }
  | { readonly type: 'defeated'; readonly unitId: string }
  | { readonly type: 'turnEnded'; readonly unitId: string; readonly facing: Direction; readonly ct: number }
  | { readonly type: 'battleEnded'; readonly winner: Team };

export interface ActionResult {
  readonly state: BattleState;
  readonly events: readonly BattleEvent[];
}
