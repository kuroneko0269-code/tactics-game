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
  /** MP の最大値。魔法を使うと減り、戦闘中は回復しない */
  readonly maxMp: number;
  /** 魔力。魔法のダメージと回復量の元になる */
  readonly magic: number;
}

/** 魔法の属性。今は表示と記録だけで、効果の違いはない（後のフェーズで連携魔法と弱点に使う） */
export type SpellElement = 'fire' | 'wind' | 'holy';

/** 魔法の効果の種類 */
export type SpellEffect = 'damage' | 'heal';

/** 魔法の定義（src/data に置く） */
export interface SpellDefinition {
  readonly id: string;
  readonly element: SpellElement;
  readonly effect: SpellEffect;
  /** 威力（%）。ダメージ・回復量 = 魔力 × 威力 ÷ 100（切り捨て） */
  readonly power: number;
  /** 消費 MP */
  readonly mpCost: number;
  /** 射程（歩数）。指定する時だけ確かめる */
  readonly range: number;
  /** 範囲の大きさ（中心からの歩数）。0 なら単体、1 なら中心と上下左右の5マス */
  readonly areaRadius: number;
  /** 高さの許容。中心のマスとの高さの差がこれを超えるマスには届かない */
  readonly heightTolerance: number;
  /** 詠唱の速さ。ユニットの CT と同じ時計で毎回これだけ溜まり、しきい値に達すると発動する */
  readonly castSpeed: number;
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
  /** 使える魔法の id（spells の定義から引く） */
  readonly spellIds?: readonly string[];
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
  /** 詠唱中のユニットが受けるダメージの倍率（%）。通常攻撃にも魔法にも掛かる */
  readonly chargingDamagePercent: number;
}

/** 魔法の狙い先 */
export type SpellTarget =
  /** ユニットを狙う。発動までに対象が動いても追いかける */
  | { readonly kind: 'unit'; readonly unitId: string }
  /** マスを狙う。その場所に撃つ */
  | { readonly kind: 'tile'; readonly x: number; readonly z: number };

/** 詠唱中の魔法 */
export interface ChargeState {
  readonly spellId: string;
  readonly target: SpellTarget;
  /** 詠唱の進み具合。毎回 castSpeed ずつ溜まり、しきい値に達すると発動する */
  readonly progress: number;
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
  readonly mp: number;
  /** 使える魔法（定義データをそのまま持つ。状態を JSON にしたまま計算できるように） */
  readonly spells: readonly SpellDefinition[];
  /** 詠唱中の魔法。詠唱していなければ null */
  readonly charging: ChargeState | null;
  /** 直前の自分の手番で移動したか（AI が「動いていない相手」を見分けるため） */
  readonly movedLastTurn: boolean;
}

/** いま手番を持っているユニットの進み具合 */
export interface TurnState {
  readonly unitId: string;
  readonly moved: boolean;
  readonly acted: boolean;
  /** 手番開始時の位置と向き（移動の取り消しで戻す先） */
  readonly origin: Coord & { readonly facing: Direction };
  /**
   * 手番開始時に詠唱中だったか。true の間に移動か行動をすると、その詠唱は中断される。
   * （この手番で新しく指定した魔法は中断されない）
   */
  readonly chargingAtStart: boolean;
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
  /** 最後に通常攻撃か魔法の指定があった手番（なければ 0）。AI がにらみ合いを見分けるため */
  readonly lastAggressionTurn: number;
}

/** プレイヤーや AI が選ぶ行動 */
export type BattleAction =
  | { readonly type: 'move'; readonly x: number; readonly z: number }
  /** 行動する前なら、移動を取り消して手番開始時の位置と向きに戻せる */
  | { readonly type: 'undoMove' }
  | { readonly type: 'attack'; readonly targetId: string }
  /** 魔法を指定する（すぐには発動せず、詠唱を始める） */
  | { readonly type: 'cast'; readonly spellId: string; readonly target: SpellTarget }
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
      /** 対象が詠唱中だった時の被ダメージ倍率（%）。詠唱中でなければ 100 */
      readonly chargingPercent: number;
    }
  | {
      /** 魔法を指定した（詠唱を始めた） */
      readonly type: 'castStarted';
      readonly casterId: string;
      readonly spellId: string;
      readonly target: SpellTarget;
      readonly mp: number;
      /** 指定のために詠唱者が向き直った向き */
      readonly casterFacing: Direction;
    }
  | {
      /** 魔法が発動した */
      readonly type: 'spellResolved';
      readonly casterId: string;
      readonly spellId: string;
      readonly element: SpellElement;
      readonly effect: SpellEffect;
      /** 中心のマス */
      readonly center: Coord;
      /** 効果が届いたマス（高さの許容を超えたマスは含まない） */
      readonly tiles: readonly Coord[];
      readonly results: readonly SpellUnitResult[];
    }
  | {
      /** 魔法が不発になった */
      readonly type: 'spellFizzled';
      readonly casterId: string;
      readonly spellId: string;
      /** casterDefeated: 詠唱者が倒れた / targetDefeated: 狙ったユニットが倒れていた */
      readonly reason: 'casterDefeated' | 'targetDefeated';
    }
  | {
      /** 詠唱中に自分の手番で移動か行動をしたため、詠唱が中断された（MP は戻らない） */
      readonly type: 'castInterrupted';
      readonly casterId: string;
      readonly spellId: string;
    }
  | { readonly type: 'defeated'; readonly unitId: string }
  | { readonly type: 'turnEnded'; readonly unitId: string; readonly facing: Direction; readonly ct: number }
  | { readonly type: 'battleEnded'; readonly winner: Team };

/** 魔法が1体のユニットに与えた結果 */
export interface SpellUnitResult {
  readonly unitId: string;
  /** ダメージ（effect が damage）または回復量（effect が heal） */
  readonly amount: number;
  /** 効果の後の HP */
  readonly hp: number;
}

export interface ActionResult {
  readonly state: BattleState;
  readonly events: readonly BattleEvent[];
}
