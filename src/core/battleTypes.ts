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

/**
 * 魔法の属性。今は表示と記録だけで、効果の違いはない（後のフェーズで連携魔法と弱点に使う）。
 * none は属性のない技（狙い撃ちなど）。
 */
export type SpellElement = 'fire' | 'wind' | 'thunder' | 'light' | 'none';

/** 武器の種類。装備している武器で決まる（フェーズ2-4。それまではジョブごとに固定だった） */
export type WeaponType = 'sword' | 'bow' | 'staff';

/** 防具の種類（鎧・軽装・ローブ） */
export type ArmorType = 'heavy' | 'light' | 'robe';

/** 装備の枠（武器・防具・装飾品） */
export type EquipSlot = 'weapon' | 'armor' | 'accessory';

/**
 * 装備の特別な効果（主に装飾品）。数値は src/data の定義に置く。
 * - statusImmunity: その状態変化が付かない
 * - steadyCasting: 詠唱中に受けるダメージの増加（chargingDamagePercent）を打ち消す
 */
export type EquipmentEffect =
  | { readonly kind: 'statusImmunity'; readonly status: StatusId }
  | { readonly kind: 'steadyCasting' };

/**
 * 装備の定義（src/data に置く）。部隊が持つのは、この定義を指す「個体」（progression.ts の ItemInstance）。
 * 画面に出す名前と説明は src/ui/text.ts に id で引く。
 */
export interface EquipmentDefinition {
  readonly id: string;
  readonly slot: EquipSlot;
  /** 武器の種類（slot が weapon の時） */
  readonly weaponType?: WeaponType;
  /** 防具の種類（slot が armor の時） */
  readonly armorType?: ArmorType;
  /** 強さの段階（1〜3。店で買えない特別な物は 0） */
  readonly tier: number;
  /** 買値（ゴールド）。売値はこの半分（src/data の shopRules）。店に並ぶかどうかは店の定義で決まる */
  readonly price: number;
  /** 能力値に足す値 */
  readonly stats: Partial<UnitStats>;
  /** 武器の届き方（slot が weapon の時） */
  readonly attack?: AttackProfile;
  /** 特別な効果 */
  readonly effects?: readonly EquipmentEffect[];
}

/** 能力値のうち、レベルが上がると伸びるもの（移動力とジャンプ力は伸びない） */
export type GrowthStat = 'maxHp' | 'maxMp' | 'attack' | 'magic' | 'speed';

/**
 * 成長値・成長率。能力ごとに、能力値の 1/100 を単位にした整数で持つ（例: 250 は能力値 2.5 ぶん）。
 * 能力値に足すのは 100 で割って切り捨てた分で、端数は内部で持ち越す。
 */
export type GrowthValues = Readonly<Record<GrowthStat, number>>;

/** 魔法の効果の種類。status は状態変化を付けるだけ（ダメージも回復もない） */
export type SpellEffect = 'damage' | 'heal' | 'status';

/**
 * 詠唱のある行動アビリティの種類。magic は魔法（沈黙で使えなくなり、魔力の殻で軽くなる）、
 * skill は狙い撃ちのような溜めのある技（沈黙の影響を受けない）
 */
export type SpellKind = 'magic' | 'skill';

/**
 * 状態変化（一時的な効果）の種類。
 * - protect（守り）: 受けるダメージが減る
 * - slow（鈍足）: 移動力が下がる
 * - silence（沈黙）: 魔法を使えない。付いた時に魔法を詠唱中なら、詠唱が中断される
 */
export type StatusId = 'protect' | 'slow' | 'silence';

/** ユニットに付いている状態変化。turns は残りの手番数（そのユニットの手番が終わるたびに 1 減り、0 で消える） */
export interface StatusState {
  readonly id: StatusId;
  readonly turns: number;
}

/**
 * 状態変化の数値（src/data に置く）。harmful は、付けられた側に不利な効果か
 * （経験値の計算で、味方に使った行動かを見分けるために使う）
 */
export interface StatusRules {
  readonly protect: {
    readonly harmful: boolean;
    readonly turns: number;
    /** 受けるダメージの倍率（%）。75 なら 25% 減る */
    readonly damageTakenPercent: number;
  };
  readonly slow: {
    readonly harmful: boolean;
    readonly turns: number;
    /** 移動力から引く値 */
    readonly movePenalty: number;
    /** 引いた後の移動力の下限 */
    readonly minMove: number;
  };
  readonly silence: {
    readonly harmful: boolean;
    readonly turns: number;
  };
}

/** 突き飛ばしの数値（src/data に置く）。ダメージは押し出された相手の最大 HP に対する割合（%） */
export interface KnockbackRules {
  /** 押し出した先が低い時、高さの差 1 につき与える落下ダメージ（最大 HP の %） */
  readonly fallDamagePercentPerHeight: number;
  /** 押し出せなかった時に与える追加のダメージ（最大 HP の %） */
  readonly blockedDamagePercent: number;
}

/** 受動的なアビリティの枠 */
export type PassiveSlot = 'reaction' | 'support' | 'movement';

/** 受動的なアビリティの効果。数値は src/data の定義に置く */
export type PassiveEffect =
  /** 反撃: 隣接するマスから近接攻撃を受けて生き残った時、通常攻撃で反撃する（反撃に対する反撃は起きない） */
  | { readonly kind: 'counter' }
  /** 身かわし: 正面と側面からの、武器による攻撃の命中率を下げる */
  | { readonly kind: 'evade'; readonly hitPenalty: number }
  /** 魔力の殻: 魔法で受けるダメージの倍率（%） */
  | { readonly kind: 'magicShell'; readonly damageTakenPercent: number }
  /** 瞑想: ダメージを受けて生き残った時、MP を回復する */
  | { readonly kind: 'meditate'; readonly mp: number }
  /** 重装: 最大 HP の倍率（%） */
  | { readonly kind: 'maxHpPercent'; readonly percent: number }
  /** 集中: 武器による攻撃の命中率に足す値 */
  | { readonly kind: 'weaponHitBonus'; readonly bonus: number }
  /** 早口: 詠唱の速さの倍率（%） */
  | { readonly kind: 'castSpeedPercent'; readonly percent: number }
  /** 節約: 消費 MP の倍率（%。切り捨て） */
  | { readonly kind: 'mpCostPercent'; readonly percent: number }
  /** 早足: 移動力に足す値 */
  | { readonly kind: 'moveBonus'; readonly amount: number }
  /** 身軽: ジャンプ力に足す値 */
  | { readonly kind: 'jumpBonus'; readonly amount: number };

/** 受動的なアビリティ（リアクション・サポート・ムーブ）の定義（src/data に置く） */
export interface PassiveDefinition {
  readonly id: string;
  readonly slot: PassiveSlot;
  readonly effect: PassiveEffect;
}

/**
 * 詠唱のある行動アビリティ（魔法と、狙い撃ちのような溜めのある技）の定義（src/data に置く）。
 * core の中では、詠唱してから発動するものをまとめて「spell」と呼ぶ。
 */
export interface SpellDefinition {
  readonly id: string;
  /** 魔法（magic）か、溜めのある技（skill） */
  readonly kind: SpellKind;
  readonly element: SpellElement;
  readonly effect: SpellEffect;
  /** effect が status の時に付ける状態変化 */
  readonly inflicts?: StatusId;
  /** 効果量の元になる能力値。省くと魔力（magic）。狙い撃ちは攻撃力（attack） */
  readonly stat?: 'magic' | 'attack';
  /**
   * true なら、ダメージに向き（正面・側面・背面）と高低差の補正が掛かる（狙い撃ち）。必ず当たる点は変わらない。
   * 向きと高さは、発動した時点の詠唱者と相手の位置・相手の向きで決まる
   */
  readonly directional?: boolean;
  /** 威力（%）。ダメージ・回復量 = 元の能力値 × 威力 ÷ 100（切り捨て） */
  readonly power: number;
  /** 消費 MP */
  readonly mpCost: number;
  /** 射程（歩数）。指定する時だけ確かめる */
  readonly range: number;
  /** 射程の下限（歩数）。省くと 0（自分のマスも狙える） */
  readonly minRange?: number;
  /** 使うのに必要な武器の種類（どれか1つ）。省くと武器を問わない */
  readonly weapons?: readonly WeaponType[];
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

/**
 * すぐに出る技（強打など）の定義（src/data に置く）。通常攻撃と同じ届き方で、命中率とダメージが変わる。
 */
export interface StrikeDefinition {
  readonly id: string;
  /** 通常攻撃のダメージに掛ける倍率（%）。向きと高低差の補正の後に掛けて切り捨てる */
  readonly damagePercent: number;
  /** 命中率に足す値（%。マイナスもある）。結果は 0〜100 に収める */
  readonly hitBonus: number;
  /** 使うのに必要な武器の種類（どれか1つ）。省くと武器を問わない */
  readonly weapons?: readonly WeaponType[];
  /** true なら、当たった相手を1マス押し出す（突き飛ばし）。相手が詠唱中なら、詠唱を中断させる */
  readonly knockback?: boolean;
  /** 当たった相手に付ける状態変化（足止めの矢の鈍足など） */
  readonly inflicts?: StatusId;
}

/** ジョブで習得できるアビリティ（行動アビリティと、受動的なアビリティ） */
export interface JobAbility {
  /** アビリティの id（行動アビリティは spells か strikes、受動的なアビリティは passives の定義から引く） */
  readonly id: string;
  /** 習得に使う JP（そのジョブの JP を消費する） */
  readonly jpCost: number;
  /** true なら、そのジョブに就いた時点で習得済みになる（JP を使わない） */
  readonly starter?: boolean;
  /** 習得に必要な、そのジョブのレベル。省くと 1（いつでも） */
  readonly jobLevel?: number;
}

/** ジョブの解放条件の1つ（ほかのジョブのレベル） */
export interface JobRequirement {
  readonly jobId: string;
  readonly level: number;
}

export interface JobDefinition {
  readonly id: string;
  /** 基本の能力値。ユニットの能力値は、これに成長値と装備を足したもの */
  readonly stats: UnitStats;
  /**
   * 通常攻撃の届き方。装備（UnitPlacement.equipment）を指定しない配置（テスト用）だけで使う。
   * 装備を指定した配置では、武器の届き方（武器がなければ BattleRules.unarmedAttack）を使う
   */
  readonly attack: AttackProfile;
  /** 装備できる武器の種類。装備を指定しない配置（テスト用）では、先頭の種類の武器を持っているものとして扱う */
  readonly weaponTypes?: readonly WeaponType[];
  /** 装備できる防具の種類 */
  readonly armorTypes?: readonly ArmorType[];
  /** 行動アビリティの一覧（このジョブのコマンド） */
  readonly abilities?: readonly JobAbility[];
  /** 受動的なアビリティ（リアクション・サポート・ムーブ）の一覧。習得すると、ジョブを問わず付けられる */
  readonly passives?: readonly JobAbility[];
  /** 成長率。このジョブでレベルが上がった時（下がった時）に、成長値がこれだけ増える（減る） */
  readonly growth?: GrowthValues;
  /** 解放条件。すべて満たすと、このジョブに就ける。空なら最初から就ける */
  readonly unlock?: readonly JobRequirement[];
}

/** 使える行動アビリティの1まとまり（コマンド）。jobId のジョブのアビリティのうち、使えるもの */
export interface UnitCommand {
  readonly jobId: string;
  readonly abilityIds: readonly string[];
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
  /** 状態変化の数値 */
  readonly status: StatusRules;
  /** 突き飛ばしの数値 */
  readonly knockback: KnockbackRules;
  /** 罠の数値 */
  readonly trap: TrapRules;
  /** 武器を装備していない時の通常攻撃の届き方（素手） */
  readonly unarmedAttack: AttackProfile;
}

/** 罠の数値（src/data に置く） */
export interface TrapRules {
  /** 落石: 最大 HP に対するダメージの割合（%。切り捨て、最小 1。守りで減る） */
  readonly rockfallDamagePercent: number;
}

/**
 * 罠の種類。
 * - rockfall（落石）: ダメージを受ける
 * - mud（ぬかるみ）: 鈍足が付く
 * - drain（脱力の罠）: キャラクターのレベルが 1 下がる（戦闘が終わっても戻らない）
 */
export type TrapKind = 'rockfall' | 'mud' | 'drain';

/** マップに置く罠（src/data に置く）。踏むまで見えない */
export interface TrapPlacement {
  readonly x: number;
  readonly z: number;
  readonly kind: TrapKind;
}

/** 戦闘中の罠。revealed は一度発動して見えるようになったか（見えるようになっても、踏めば何度でも発動する） */
export interface TrapState extends TrapPlacement {
  readonly revealed: boolean;
}

/**
 * 勝利条件。どれか1つを満たすと勝利。敵の全滅は、書かなくても常に勝利になる。
 * - defeatAll: 敵の全滅
 * - defeatUnit: 特定の敵の撃破
 * - reachTile: 味方のだれかが、指定のマスのどれかに立つ
 * - surviveTurns: 規定の手番数を耐える（turns 回の手番が終わった時点で勝利）
 */
export type VictoryCondition =
  | { readonly kind: 'defeatAll' }
  | { readonly kind: 'defeatUnit'; readonly unitId: string }
  | { readonly kind: 'reachTile'; readonly tiles: readonly Coord[] }
  | { readonly kind: 'surviveTurns'; readonly turns: number };

/**
 * 敗北条件。どれか1つを満たすと敗北。味方の全滅は、書かなくても常に敗北になる。
 * - allDefeated: 味方の全滅
 * - unitDefeated: 特定の味方が倒れる
 * - turnLimit: 規定の手番数を超える（turns 回の手番が終わっても勝っていなければ敗北）
 */
export type DefeatCondition =
  | { readonly kind: 'allDefeated' }
  | { readonly kind: 'unitDefeated'; readonly unitId: string }
  | { readonly kind: 'turnLimit'; readonly turns: number };

/** 勝敗条件。勝利と敗北が同時に満たされた時は、勝利を優先する */
export interface BattleObjectives {
  readonly victory: readonly VictoryCondition[];
  readonly defeat: readonly DefeatCondition[];
}

/**
 * マップ上のイベントのきっかけ。
 * - turn: turn 回の手番が終わった時（0 なら戦闘の開始時）。every があれば、その後も every 手番ごとに
 * - enterTile: ユニット（team を書けばその陣営だけ）が、移動か突き飛ばしで指定のマスのどれかに入った時
 * - hpBelow: 特定のユニットの HP が最大 HP の percent% 以下になった時（倒れた時も含む。1回だけ）
 * - unitDefeated: 特定のユニットが倒れた時（1回だけ）
 */
export type EventTrigger =
  | { readonly kind: 'turn'; readonly turn: number; readonly every?: number }
  | { readonly kind: 'enterTile'; readonly tiles: readonly Coord[]; readonly team?: Team }
  | { readonly kind: 'hpBelow'; readonly unitId: string; readonly percent: number }
  | { readonly kind: 'unitDefeated'; readonly unitId: string };

/**
 * マップ上のイベントで起きること（src/data に置く形）。
 * - reinforce: 増援。きっかけの delay 手番後に、units の位置に現れる（それまでは出現するマスに予告の目印を出す）。
 *   出現するマスにユニットがいる時は、近くの空いたマスに出す
 * - message: 短いメッセージを出す（文言は src/ui/text.ts に messageId で引く）
 * - trap: 指定のマスにいるユニットに、罠と同じ効果を与える（マスに置いた罠とは別。見えない罠を増やすものではない）
 */
export type EventEffect =
  | { readonly kind: 'reinforce'; readonly units: readonly UnitPlacement[]; readonly delay: number }
  | { readonly kind: 'message'; readonly messageId: string }
  | { readonly kind: 'trap'; readonly trap: TrapKind; readonly tiles: readonly Coord[] };

/** マップ上のイベント（src/data に置く）。times は起きる回数の上限（省くと 1。every のあるきっかけで繰り返す時に使う） */
export interface MapEventDefinition {
  readonly id: string;
  readonly trigger: EventTrigger;
  readonly effects: readonly EventEffect[];
  readonly times?: number;
}

/** 戦闘中の「起きること」。増援は、戦闘の開始時に能力値まで組み立てたユニット（id は出現の時に付け直す）を持つ */
export type EventEffectState =
  | { readonly kind: 'reinforce'; readonly units: readonly UnitState[]; readonly delay: number }
  | { readonly kind: 'message'; readonly messageId: string }
  | { readonly kind: 'trap'; readonly trap: TrapKind; readonly tiles: readonly Coord[] };

/** 戦闘中のイベント。fired は起きた回数 */
export interface MapEventState {
  readonly id: string;
  readonly trigger: EventTrigger;
  readonly effects: readonly EventEffectState[];
  readonly times: number;
  readonly fired: number;
}

/** 予告済みの増援。appearAfterTurn 回の手番が終わった時点で現れる */
export interface PendingReinforcement {
  readonly eventId: string;
  readonly appearAfterTurn: number;
  /** 現れるユニット（id は付け直し済み。x, z は出現する予定のマス） */
  readonly units: readonly UnitState[];
}

/** 戦闘の筋書き（勝敗条件・イベント・罠・予告済みの増援）。JSON にそのまま変換できる */
export interface ScenarioState {
  readonly objectives: BattleObjectives;
  readonly events: readonly MapEventState[];
  readonly traps: readonly TrapState[];
  readonly reinforcements: readonly PendingReinforcement[];
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

/** 戦闘開始時のユニット配置 */
export interface UnitPlacement {
  readonly id: string;
  readonly team: Team;
  readonly jobId: string;
  readonly x: number;
  readonly z: number;
  readonly facing: Direction;
  /** キャラクターのレベル。省くと 1 */
  readonly level?: number;
  /** 成長値。省くと 0（ジョブの基本値のまま） */
  readonly growth?: GrowthValues;
  /**
   * 使える行動アビリティ（主コマンドが先頭、副コマンドが次）。
   * 省くと、ジョブのアビリティすべてを主コマンドとして使える（テスト用）。
   */
  readonly commands?: readonly UnitCommand[];
  /** 付けている受動的なアビリティの id（リアクション・サポート・ムーブ）。省くとなし */
  readonly passives?: readonly string[];
  /**
   * 能力値の補正（マイナスもある）。成長値を足した後に足す（0 より下にはしない）。
   * 敵の強さの段階の調整に使う（例: 「やさしい」の敵の癒し手は MP が少ない）
   */
  readonly statBonus?: Partial<UnitStats>;
  /**
   * 装備（定義データそのもの）。指定すると、能力値に装備の値を足し、武器の種類と通常攻撃の届き方は武器で決まる
   * （武器がなければ素手）。省くと、ジョブの attack と weaponTypes の先頭を使う（テスト用）
   */
  readonly equipment?: readonly EquipmentDefinition[];
  /** 部隊のユニットの経験値と JP（渡すと、戦闘中に経験値と JP を得てレベルが上がる。敵には渡さない） */
  readonly progress?: PlacementProgress;
}

/**
 * 戦闘中に経験値と JP を得るユニット（部隊のユニット）の進み具合。敵のユニットは持たない（経験値も JP も得ない）。
 * 経験値と JP は、行動した時点でここに入り、経験値が貯まればその場でレベルが上がる（成長値と能力値も変わる）。
 * 戦闘が終わった時に、部隊（Roster）へ書き戻す（progression.ts の applyBattleResult）。
 */
export interface UnitProgressState {
  /** 今のレベルの中で貯まっている経験値 */
  readonly exp: number;
  /** 今のジョブの使える JP */
  readonly jp: number;
  /** 今のジョブの JP の累計（ジョブのレベルを決める） */
  readonly jpTotal: number;
  /** この戦闘で得た経験値の合計（結果の画面に出す） */
  readonly gainedExp: number;
  /** この戦闘で得た JP の合計 */
  readonly gainedJp: number;
}

/** 部隊のユニットを戦場に出す時に渡す、経験値と JP の今の値 */
export interface PlacementProgress {
  readonly exp: number;
  readonly jp: number;
  readonly jpTotal: number;
}

/** 育成の数値（src/data に置く）。計算は progression.ts。戦闘中の経験値と JP にも使うので、戦闘の状態にも持たせる */
export interface ProgressionRules {
  /** キャラクターのレベルの上限 */
  readonly maxLevel: number;
  /** レベル L から L+1 に上がるのに必要な経験値 = expBase + expPerLevel × (L − 1) */
  readonly expBase: number;
  readonly expPerLevel: number;
  /** 攻撃・魔法・技を1回実行するたびに得る経験値（相手のレベルによる増減の前） */
  readonly expPerAction: number;
  /** 味方に使う行動（回復・守りなど）で得る経験値（相手のレベルによる増減の前） */
  readonly expPerSupportAction: number;
  /** 勝利した時に、倒れたユニットを含む全員が得る経験値（敵のレベルによる増減の前） */
  readonly expVictory: number;
  /**
   * 相手のレベルによる増減。倍率（%）=（相手のレベル + expLevelOffset）× 100 ÷（自分のレベル + expLevelOffset）（切り捨て）。
   * 上限は expLevelPercentMax。増減の後は切り捨てで、最低でも 1
   */
  readonly expLevelOffset: number;
  readonly expLevelPercentMax: number;
  /** 攻撃・魔法・技を1回実行するたびに、今のジョブに入る JP */
  readonly jpPerAction: number;
  /** 勝利した時に、全員の今のジョブに入る JP */
  readonly jpVictoryBonus: number;
  /**
   * ジョブのレベルが上がる JP の累計。[i] はレベル i + 2 になる累計（長さ 7 なら、レベル 1〜8）
   */
  readonly jobLevelJp: readonly number[];
  /** 能力ごとの成長値の上限（能力値の 1/100 単位） */
  readonly growthCap: GrowthValues;
  /** 成長の点数の重み。能力値 1 ぶんの成長を何点と数えるか */
  readonly growthWeights: GrowthValues;
  /** 成長の点数の合計の上限 */
  readonly growthTotalCap: number;
}

/** 1戦ぶんの定義（src/data に置く） */
export interface BattleSetup {
  readonly id: string;
  readonly map: MapDefinition;
  readonly units: readonly UnitPlacement[];
  /** 勝敗条件。省くと「敵の全滅で勝利、味方の全滅で敗北」 */
  readonly objectives?: BattleObjectives;
  /** マップ上のイベント */
  readonly events?: readonly MapEventDefinition[];
  /** 罠 */
  readonly traps?: readonly TrapPlacement[];
  /** 育成の数値。渡すと、progress を持つユニットが戦闘中に経験値と JP を得る */
  readonly progression?: ProgressionRules;
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
  /**
   * 今の能力値 = ジョブの基本値（baseStats）+ 成長値（growth）+ 補正（statBonus）に、受動的なアビリティ（重装・早足・身軽）を反映したもの。
   * 戦闘中にレベルが上がる（下がる）と、計算し直す
   */
  readonly stats: UnitStats;
  readonly attack: AttackProfile;
  readonly mp: number;
  /** 今のキャラクターのレベル（戦闘中に上がることも、脱力の罠で下がることもある） */
  readonly level: number;
  /** この戦闘で脱力の罠によって下がったレベルの数（結果の画面に出す） */
  readonly levelDrops: number;
  /** ジョブの基本の能力値 */
  readonly baseStats: UnitStats;
  /** 成長値（レベルが上がると、growthRates ぶん増える） */
  readonly growth: GrowthValues;
  /** 今のジョブの成長率 */
  readonly growthRates: GrowthValues;
  /** 能力値の補正（装備の値と、敵の強さの段階の調整を合わせたもの。なければ空） */
  readonly statBonus: Partial<UnitStats>;
  /** 装備（定義データをそのまま持つ。情報の欄の表示と、装飾品の効果に使う） */
  readonly equipment: readonly EquipmentDefinition[];
  /** 経験値と JP の進み具合（部隊のユニットだけ。敵は null） */
  readonly progress: UnitProgressState | null;
  /** 装備している武器の種類（素手なら null）。合わないアビリティは使えない */
  readonly weapon: WeaponType | null;
  /** 行動アビリティのコマンド（主コマンドが先頭）。画面のメニューの並び */
  readonly commands: readonly UnitCommand[];
  /**
   * 詠唱のある行動アビリティ（魔法・狙い撃ち）。定義データをそのまま持つ（状態を JSON にしたまま計算できるように）。
   * commands に含まれるもの。武器が合わないものも含む（使えるかは canUseAbility で確かめる）
   */
  readonly spells: readonly SpellDefinition[];
  /** すぐに出る技（強打など）。spells と同じく定義データをそのまま持つ */
  readonly strikes: readonly StrikeDefinition[];
  /** 付けている受動的なアビリティ（リアクション・サポート・ムーブ）。定義データをそのまま持つ */
  readonly passives: readonly PassiveDefinition[];
  /** 付いている状態変化 */
  readonly statuses: readonly StatusState[];
  /** この戦闘で経験値を得た行動（攻撃・技・発動した魔法）の回数（バランス確認の集計に使う） */
  readonly actionCount: number;
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
  /** 移動で罠やイベントが起きたか。起きた後は、移動を取り消せない */
  readonly moveLocked?: boolean;
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
  /** 育成の数値（戦闘中の経験値・JP・レベルアップに使う）。なければ、戦闘中に経験値と JP は入らない */
  readonly progression: ProgressionRules | null;
  /** これまでに始まった手番の数 */
  readonly turnNumber: number;
  /** 最後に通常攻撃か魔法の指定があった手番（なければ 0）。AI がにらみ合いを見分けるため */
  readonly lastAggressionTurn: number;
  /** 勝敗条件・イベント・罠・予告済みの増援 */
  readonly scenario: ScenarioState;
}

/** プレイヤーや AI が選ぶ行動 */
export type BattleAction =
  | { readonly type: 'move'; readonly x: number; readonly z: number }
  /** 行動する前なら、移動を取り消して手番開始時の位置と向きに戻せる */
  | { readonly type: 'undoMove' }
  /** 通常攻撃。abilityId を付けると、その技（強打など）で攻撃する */
  | { readonly type: 'attack'; readonly targetId: string; readonly abilityId?: string }
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
      /** 技（強打など）の id。通常攻撃なら null */
      readonly abilityId: string | null;
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
      /** リアクションの「反撃」による攻撃か */
      readonly counter: boolean;
    }
  | {
      /** 突き飛ばしで押し出された（to が null なら、押し出せずにその場で追加のダメージを受けた） */
      readonly type: 'knockedBack';
      readonly unitId: string;
      readonly from: Coord;
      readonly to: Coord | null;
      /** 落下ダメージ、または押し出せなかった時の追加のダメージ（なければ 0） */
      readonly damage: number;
      readonly hp: number;
    }
  | { readonly type: 'statusAdded'; readonly unitId: string; readonly status: StatusId; readonly turns: number }
  | { readonly type: 'statusExpired'; readonly unitId: string; readonly status: StatusId }
  /** 装備の効果で状態変化を防いだ（itemId は防いだ装備） */
  | { readonly type: 'statusBlocked'; readonly unitId: string; readonly status: StatusId; readonly itemId: string }
  | {
      /** リアクションが発動した（画面でアビリティの名前を短く表示する） */
      readonly type: 'reaction';
      readonly unitId: string;
      readonly abilityId: string;
    }
  | {
      /** MP が回復した（瞑想） */
      readonly type: 'mpRestored';
      readonly unitId: string;
      readonly amount: number;
      readonly mp: number;
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
      /**
       * casterDefeated: 詠唱者が倒れた。
       * （狙ったユニットが倒れていた場合は不発にせず、倒れたマスに発動する。フェーズ1 の仕上げで発注者が決定）
       */
      readonly reason: 'casterDefeated';
    }
  | {
      /**
       * 詠唱が中断された（MP は戻らない）。
       * reason: acted は自分の手番で移動か行動をした、silenced は沈黙が付いた、knockedBack は突き飛ばしを受けた
       */
      readonly type: 'castInterrupted';
      readonly casterId: string;
      readonly spellId: string;
      readonly reason: 'acted' | 'silenced' | 'knockedBack';
    }
  | { readonly type: 'defeated'; readonly unitId: string }
  | {
      /**
       * 罠が発動した。unitId は踏んだ（そのマスにいた）ユニット。イベントで起きた罠でマスに誰もいなければ null。
       * revealed は、この発動で初めて見えるようになったか（マスに置いた罠だけ）。
       * damage と hp は落石の時、level は脱力の罠の時（下がる前と後の今のレベル）
       */
      readonly type: 'trapTriggered';
      readonly trap: TrapKind;
      readonly x: number;
      readonly z: number;
      readonly unitId: string | null;
      readonly revealed: boolean;
      readonly damage: number;
      readonly hp: number;
      readonly level?: { readonly from: number; readonly to: number };
    }
  | {
      /** マップ上のイベントが起きた */
      readonly type: 'eventFired';
      readonly eventId: string;
    }
  | { readonly type: 'message'; readonly messageId: string }
  | {
      /** 増援の予告。appearAfterTurn 回の手番が終わった時点で、tiles に現れる */
      readonly type: 'reinforcementWarned';
      readonly eventId: string;
      readonly appearAfterTurn: number;
      readonly tiles: readonly Coord[];
    }
  | {
      /** 増援が現れた（unit は現れた時点のユニットの状態） */
      readonly type: 'unitAppeared';
      readonly unit: UnitState;
    }
  | {
      /**
       * 行動（攻撃・技・発動した魔法）で経験値と JP を得た。exp と jp は得た量。
       * 反撃・中断・不発・対象のいない魔法では起きない。敵のユニットでは起きない
       */
      readonly type: 'progressGained';
      readonly unitId: string;
      readonly exp: number;
      readonly jp: number;
    }
  | {
      /** キャラクターのレベルが上がった（from から to へ）。能力値と、増えた分だけ増えた今の HP・MP */
      readonly type: 'leveledUp';
      readonly unitId: string;
      readonly from: number;
      readonly to: number;
      readonly stats: UnitStats;
      readonly hp: number;
      readonly mp: number;
    }
  | {
      /** ジョブのレベルが上がった */
      readonly type: 'jobLeveledUp';
      readonly unitId: string;
      readonly jobId: string;
      readonly from: number;
      readonly to: number;
    }
  | { readonly type: 'turnEnded'; readonly unitId: string; readonly facing: Direction; readonly ct: number }
  | {
      /** 決着した。reason は決め手になった条件（勝利なら勝利条件、敗北なら敗北条件の kind） */
      readonly type: 'battleEnded';
      readonly winner: Team;
      readonly reason: VictoryCondition['kind'] | DefeatCondition['kind'];
    };

/** 魔法が1体のユニットに与えた結果 */
export interface SpellUnitResult {
  readonly unitId: string;
  /** ダメージ（effect が damage）または回復量（effect が heal）。状態変化だけの魔法では 0 */
  readonly amount: number;
  /** 効果の後の HP */
  readonly hp: number;
}

export interface ActionResult {
  readonly state: BattleState;
  readonly events: readonly BattleEvent[];
}
