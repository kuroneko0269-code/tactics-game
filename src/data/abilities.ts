import type { SpellDefinition, StrikeDefinition } from '../core/battleTypes';

/**
 * 行動アビリティの定義。数値はすべて仮（バランス調整で変える）。
 * 画面に出す名前は src/ui/text.ts に id で引けるようにまとめている。どのジョブで習得できるかは jobs.ts。
 *
 * 詠唱のあるもの（spells。魔法と狙い撃ち）:
 * - power: 威力（%）。効果量 = 元の能力値（魔力。stat が attack なら攻撃力）× 威力 ÷ 100（切り捨て）
 * - range: 射程（歩数）。minRange は射程の下限。areaRadius: 範囲（中心からの歩数。0 で単体、1 で中心と上下左右の5マス）
 * - heightTolerance: 高さの許容。中心のマスとの高さの差がこれを超えるマスには届かない
 * - castSpeed: 詠唱の速さ。ユニットの CT と同じ時計で毎回これだけ溜まり、100 に達すると発動する
 *   （素早さ 6〜7 のユニットが10体いると、時計が1回進むごとにおよそ 0.6 回ぶんの手番が入る）
 * - weapons: 使うのに必要な武器の種類（省くと問わない）
 *
 * - kind: magic は魔法（沈黙で使えず、魔力の殻で軽くなる）、skill は溜めのある技（狙い撃ち）
 * - effect: damage（ダメージ）、heal（回復）、status（状態変化を付けるだけ。inflicts が付ける状態変化）
 *
 * すぐに出るもの（strikes。強打・突き飛ばし・足止めの矢）:
 * - damagePercent: 通常攻撃のダメージに掛ける倍率（%）。hitBonus: 命中率に足す値（%）
 * - knockback: 当たった相手を1マス押し出す。inflicts: 当たった相手に付ける状態変化
 */

/** 炎: 範囲の攻撃魔法。威力は高く、詠唱は遅い（発動までにほかのユニットの手番が2〜3回入る程度） */
export const fire: SpellDefinition = {
  id: 'fire',
  kind: 'magic',
  element: 'fire',
  effect: 'damage',
  power: 200,
  mpCost: 12,
  range: 4,
  areaRadius: 1,
  heightTolerance: 2,
  castSpeed: 25,
};

/** 風: 単体の攻撃魔法。威力は控えめで、詠唱は速い（ほかのユニットの手番が1回入る程度） */
export const wind: SpellDefinition = {
  id: 'wind',
  kind: 'magic',
  element: 'wind',
  effect: 'damage',
  power: 125,
  mpCost: 6,
  range: 4,
  areaRadius: 0,
  heightTolerance: 0,
  castSpeed: 50,
};

/** 雷: 単体の攻撃魔法。威力が高く、詠唱は遅い（炎よりさらに遅い） */
export const thunder: SpellDefinition = {
  id: 'thunder',
  kind: 'magic',
  element: 'thunder',
  effect: 'damage',
  power: 260,
  mpCost: 14,
  range: 4,
  areaRadius: 0,
  heightTolerance: 0,
  castSpeed: 20,
};

/** 癒し: 範囲の回復魔法。敵も範囲内にいれば回復する。詠唱は速い */
export const heal: SpellDefinition = {
  id: 'heal',
  kind: 'magic',
  element: 'light',
  effect: 'heal',
  power: 200,
  mpCost: 8,
  range: 4,
  areaRadius: 1,
  heightTolerance: 2,
  castSpeed: 50,
};

/** 大癒し: 単体の回復魔法。回復量が大きく、詠唱は癒しより遅い */
export const bigHeal: SpellDefinition = {
  id: 'bigHeal',
  kind: 'magic',
  element: 'light',
  effect: 'heal',
  power: 350,
  mpCost: 12,
  range: 4,
  areaRadius: 0,
  heightTolerance: 0,
  castSpeed: 34,
};

/**
 * 狙い撃ち: 弓の溜め撃ち。詠唱（狙いを付ける時間）があり、ダメージは攻撃力の 1.5 倍、射程は弓より 1 長い（3〜6）。
 * 魔法と同じく必ず当たる。ダメージには通常攻撃と同じ向きと高低差の補正が掛かる（フェーズ2-1b。高所や背面を取る意味を残すため）。弓が必要
 */
export const aimedShot: SpellDefinition = {
  id: 'aimedShot',
  kind: 'skill',
  element: 'none',
  effect: 'damage',
  stat: 'attack',
  directional: true,
  power: 150,
  mpCost: 0,
  range: 6,
  minRange: 3,
  areaRadius: 0,
  heightTolerance: 0,
  castSpeed: 50,
  weapons: ['bow'],
};

/** 封じ: 単体に沈黙を付ける魔法（ダメージはない）。詠唱は速い。相手が魔法を詠唱中なら、その詠唱は中断される */
export const seal: SpellDefinition = {
  id: 'seal',
  kind: 'magic',
  element: 'none',
  effect: 'status',
  inflicts: 'silence',
  power: 0,
  mpCost: 8,
  range: 4,
  areaRadius: 0,
  heightTolerance: 0,
  castSpeed: 50,
};

/** 守りの祈り: 中心と上下左右の5マスに守りを付ける魔法（敵も範囲内にいれば付く）。詠唱は速い。光属性 */
export const protectPrayer: SpellDefinition = {
  id: 'protectPrayer',
  kind: 'magic',
  element: 'light',
  effect: 'status',
  inflicts: 'protect',
  power: 0,
  mpCost: 10,
  range: 4,
  areaRadius: 1,
  heightTolerance: 2,
  castSpeed: 50,
};

/**
 * 業火: ダンジョン「はじまりの遺跡」のボスだけが使う、詠唱のとても長い強力な範囲の攻撃魔法（フェーズ2-2）。
 * 範囲 2（中心から2歩、13マス）。どのジョブでも習得できない。
 * 予約された範囲から逃げるか、突き飛ばしや封じで詠唱を止めるかの判断が生まれるように、発動までにほかのユニットの手番が5回前後入る遅さにした
 */
export const inferno: SpellDefinition = {
  id: 'inferno',
  kind: 'magic',
  element: 'fire',
  effect: 'damage',
  power: 170,
  mpCost: 20,
  range: 5,
  areaRadius: 2,
  heightTolerance: 3,
  castSpeed: 10,
};

/**
 * 蘇生: 戦闘不能のユニット1体を、最大 HP の 25%（切り捨て、最小 1）で復帰させる（フェーズ2-5）。復帰した時の CT は 0。
 * 単体。詠唱は長め（雷と同じ 20）。退場したユニットには効かない。光属性
 */
export const revive: SpellDefinition = {
  id: 'revive',
  kind: 'magic',
  element: 'light',
  effect: 'revive',
  power: 25,
  mpCost: 14,
  range: 4,
  areaRadius: 0,
  heightTolerance: 0,
  castSpeed: 20,
};

// ---- 時守の業（フェーズ2-6）。詠唱せず、その場で発動する（instant）。溜めのある技と同じく沈黙の影響を受けない ----

/** 引き戻し: 味方ひとり（自分以外）の HP を、その味方の前回の手番が始まった時の値に戻す。今の HP の方が高ければ何もしない */
export const rewind: SpellDefinition = {
  id: 'rewind',
  kind: 'skill',
  element: 'none',
  effect: 'rewind',
  instant: true,
  targets: 'ally',
  power: 0,
  mpCost: 6,
  range: 3,
  areaRadius: 0,
  heightTolerance: 0,
  castSpeed: 0,
};

/** 門渡り: 射程 3 の中にいる味方ひとり（自分以外）と、位置を入れ替える */
export const gateSwap: SpellDefinition = {
  id: 'gateSwap',
  kind: 'skill',
  element: 'none',
  effect: 'swap',
  instant: true,
  targets: 'ally',
  power: 0,
  mpCost: 4,
  range: 3,
  areaRadius: 0,
  heightTolerance: 0,
  castSpeed: 0,
};

/** 時送り: 敵ひとりの CT を 40 減らし、次の行動を遅らせる（0 より下にはしない）。射程 3 */
export const timeDelay: SpellDefinition = {
  id: 'timeDelay',
  kind: 'skill',
  element: 'none',
  effect: 'delay',
  instant: true,
  targets: 'enemy',
  ctDelay: 40,
  power: 0,
  mpCost: 6,
  range: 3,
  areaRadius: 0,
  heightTolerance: 0,
  castSpeed: 0,
};

// ---- 格闘家（フェーズ2-6）。詠唱なし。沈黙の影響を受けない技 ----

/** 気功: 自分か隣の味方の HP を回復する（攻撃力 × 100%）。詠唱なし */
export const chakra: SpellDefinition = {
  id: 'chakra',
  kind: 'skill',
  element: 'none',
  effect: 'heal',
  stat: 'attack',
  instant: true,
  targets: 'allyOrSelf',
  power: 100,
  mpCost: 4,
  range: 1,
  areaRadius: 0,
  heightTolerance: 0,
  castSpeed: 0,
};

/** 喝: 自分か隣の味方の状態変化をすべて解く。詠唱なし */
export const shout: SpellDefinition = {
  id: 'shout',
  kind: 'skill',
  element: 'none',
  effect: 'cleanse',
  instant: true,
  targets: 'allyOrSelf',
  power: 0,
  mpCost: 2,
  range: 1,
  areaRadius: 0,
  heightTolerance: 0,
  castSpeed: 0,
};

/**
 * 地走り: 正面の直線 3 マスに衝撃波（敵だけに、攻撃力 × 80% のダメージ）。隣り合うマスの高さの差が 1 を超えるマスで止まる。
 * 必ず当たる。詠唱なし。狙うのは隣のマス（向き）
 */
export const earthWave: SpellDefinition = {
  id: 'earthWave',
  kind: 'skill',
  element: 'none',
  effect: 'damage',
  stat: 'attack',
  instant: true,
  affects: 'enemies',
  shape: 'line',
  lineLength: 3,
  lineMaxStep: 1,
  power: 80,
  mpCost: 4,
  range: 1,
  minRange: 1,
  areaRadius: 0,
  heightTolerance: 0,
  castSpeed: 0,
};

// ---- 魔道士の追加（フェーズ2-6）----

/** 氷: 単体の攻撃魔法。威力は炎（200%）と風（125%）の間 */
export const ice: SpellDefinition = {
  id: 'ice',
  kind: 'magic',
  element: 'ice',
  effect: 'damage',
  power: 160,
  mpCost: 9,
  range: 4,
  areaRadius: 0,
  heightTolerance: 0,
  castSpeed: 34,
};

/** 土: 単体の攻撃魔法。相手が詠唱者より低い位置にいるほど威力が上がる（1 段ごとに +25%、上限 +100%） */
export const earth: SpellDefinition = {
  id: 'earth',
  kind: 'magic',
  element: 'earth',
  effect: 'damage',
  power: 120,
  heightPowerPerStep: 25,
  heightPowerCap: 100,
  mpCost: 10,
  range: 4,
  areaRadius: 0,
  heightTolerance: 0,
  castSpeed: 34,
};

// ---- 時魔道士（フェーズ2-6）: 行動順を操作する ----
const timeMagic = (
  id: string,
  rest: Pick<SpellDefinition, 'effect' | 'mpCost' | 'castSpeed'> & Partial<SpellDefinition>,
): SpellDefinition => ({ id, kind: 'magic', element: 'none', power: 0, range: 4, areaRadius: 0, heightTolerance: 0, ...rest });
/** 加速: 中心と上下左右の5マスにいる全員（敵も味方も）に加速（素早さ +50%）を付ける（PR #18 の回答。区別できるのは召喚士だけ） */
export const haste = timeMagic('haste', { effect: 'status', inflicts: 'haste', areaRadius: 1, heightTolerance: 2, mpCost: 8, castSpeed: 50 });
/** 減速: 中心と上下左右の5マスにいる全員（敵も味方も）に素早さ低下を付ける */
export const decelerate = timeMagic('decelerate', { effect: 'status', inflicts: 'speedDown', areaRadius: 1, heightTolerance: 2, mpCost: 8, castSpeed: 50 });
/** 停止: 停止（次の手番が何もできずに過ぎる）を付ける。詠唱は長い */
export const stop = timeMagic('stop', { effect: 'status', inflicts: 'stop', mpCost: 14, castSpeed: 34 });
/** 早送り: 味方ひとり（自分以外）の CT を満たし、すぐに行動させる。詠唱あり。消費 MP が大きい */
export const quicken = timeMagic('quicken', { effect: 'quicken', targets: 'ally', mpCost: 16, castSpeed: 50 });

// ---- 召喚士（フェーズ2-6）: 中心から 2 マス以内の、敵だけ（または味方だけ）に効く。詠唱は長く、消費 MP が大きい ----
const spirit = (id: string, element: SpellDefinition['element']): SpellDefinition => ({
  id,
  kind: 'magic',
  element,
  effect: 'damage',
  affects: 'enemies',
  power: 150,
  mpCost: 24,
  range: 4,
  areaRadius: 2,
  heightTolerance: 3,
  castSpeed: 12,
});
export const fireSpirit = spirit('fireSpirit', 'fire');
export const iceSpirit = spirit('iceSpirit', 'ice');
export const thunderSpirit = spirit('thunderSpirit', 'thunder');
export const earthSpirit = spirit('earthSpirit', 'earth');
/** 癒しの精霊: 中心から 2 マス以内の、味方だけを回復 */
export const healSpirit: SpellDefinition = {
  ...spirit('healSpirit', 'light'),
  effect: 'heal',
  affects: 'allies',
  castSpeed: 15,
};

/** 詠唱のある行動アビリティ（魔法と狙い撃ち）と、詠唱のない業（時守・格闘家） */
export const spells: readonly SpellDefinition[] = [
  fire,
  wind,
  thunder,
  heal,
  bigHeal,
  aimedShot,
  seal,
  protectPrayer,
  inferno,
  revive,
  rewind,
  gateSwap,
  timeDelay,
  chakra,
  shout,
  earthWave,
  ice,
  earth,
  haste,
  decelerate,
  stop,
  quicken,
  fireSpirit,
  iceSpirit,
  thunderSpirit,
  earthSpirit,
  healSpirit,
];

/** 強打: 通常攻撃のダメージ 1.5 倍、命中率 -15。近接武器（剣・杖）が必要 */
export const powerStrike: StrikeDefinition = {
  id: 'powerStrike',
  damagePercent: 140,
  hitBonus: -15,
  weapons: ['sword', 'staff'],
};

/**
 * 突き飛ばし: 隣接する相手に小さなダメージ（通常攻撃の半分）を与え、1マス押し出す。命中率は通常攻撃と同じ。
 * 押し出した先が低ければ落下ダメージ、押し出せなければ追加のダメージ（数値は battleRules.ts の knockback）。
 * 相手が詠唱中なら、詠唱を中断させる。近接武器（剣・杖）が必要
 */
export const knockback: StrikeDefinition = {
  id: 'knockback',
  damagePercent: 40,
  hitBonus: 0,
  weapons: ['sword', 'staff'],
  knockback: true,
};

/** 足止めの矢: 小さなダメージ（通常攻撃の 60%）を与え、鈍足を付ける。命中率は通常攻撃と同じ。弓が必要 */
export const slowArrow: StrikeDefinition = {
  id: 'slowArrow',
  damagePercent: 60,
  hitBonus: 0,
  weapons: ['bow'],
  inflicts: 'slow',
};

/**
 * 斬り分け（時守。フェーズ2-6）: 正面のマスと、その左右のマスにいる敵をまとめて斬る。1体ずつ命中を判定し、
 * ダメージは通常攻撃の 70%。剣が必要。最初から習得済み
 */
export const sweep: StrikeDefinition = {
  id: 'sweep',
  damagePercent: 70,
  hitBonus: 0,
  weapons: ['sword'],
  sweep: true,
};

// ---- 騎士（フェーズ2-6）: 武器による攻撃（通常攻撃の 60%）で、当たると状態変化を付ける。剣が必要 ----
const breakStrike = (id: string, inflicts: StrikeDefinition['inflicts']): StrikeDefinition => ({
  id,
  damagePercent: 60,
  hitBonus: 0,
  weapons: ['sword'],
  inflicts,
});
/** 武器破壊: 攻撃力低下を付ける */
export const breakWeapon = breakStrike('breakWeapon', 'attackDown');
/** 鎧破壊: 最大 HP 低下を付ける */
export const breakArmor = breakStrike('breakArmor', 'maxHpDown');
/** 速度破壊: 素早さ低下を付ける */
export const breakSpeed = breakStrike('breakSpeed', 'speedDown');
/** 魔力破壊: 魔力低下を付ける */
export const breakMagic = breakStrike('breakMagic', 'magicDown');

// ---- 格闘家（フェーズ2-6）----
/** 連撃: 素手の通常攻撃を2回（1回は通常攻撃の 60%。1回ごとに命中を判定する）。素手が必要 */
export const doubleStrike: StrikeDefinition = { id: 'doubleStrike', damagePercent: 60, hitBonus: 0, weapons: ['unarmed'], hits: 2 };

// ---- 盗賊（フェーズ2-6）----
/** ゴールドを盗む: 成功すると、戦闘の後にゴールドが増える（ダメージなし）。成功率は向きで決まる */
export const stealGold: StrikeDefinition = { id: 'stealGold', damagePercent: 0, hitBonus: 0, steal: 'gold' };
/** 装備を盗む: 成功すると、敵の装備をひとつ奪う（武器 → 防具 → 装飾品の順。ボスの専用の装備は盗めない） */
export const stealGear: StrikeDefinition = { id: 'stealGear', damagePercent: 0, hitBonus: 0, steal: 'item' };
/** 目くらまし: 通常攻撃の 50% のダメージを与え、目くらましを付ける。短剣が必要 */
export const blindStrike: StrikeDefinition = { id: 'blindStrike', damagePercent: 70, hitBonus: 0, weapons: ['dagger'], inflicts: 'blind' };
/** 不意打ち: 背面から攻撃した時だけ、通常攻撃の 200%（それ以外は通常攻撃と同じ）。短剣が必要 */
export const backstab: StrikeDefinition = { id: 'backstab', damagePercent: 100, backDamagePercent: 200, hitBonus: 0, weapons: ['dagger'] };

// ---- 魔法剣士（フェーズ2-6）: 隣の敵に武器で攻撃。ダメージの元は攻撃力 + 魔力。MP を使う。剣が必要 ----
const blade = (id: string, element: StrikeDefinition['element']): StrikeDefinition => ({
  id,
  damagePercent: 90,
  hitBonus: 0,
  weapons: ['sword'],
  magicBlend: true,
  element,
  mpCost: 6,
});
export const fireBlade = blade('fireBlade', 'fire');
export const iceBlade = blade('iceBlade', 'ice');
export const thunderBlade = blade('thunderBlade', 'thunder');
/** 魔封剣: 通常攻撃の 60% のダメージで、当たると沈黙を付ける。MP 6 */
export const sealBlade: StrikeDefinition = { id: 'sealBlade', damagePercent: 60, hitBonus: 0, weapons: ['sword'], inflicts: 'silence', mpCost: 6 };

/** すぐに出る技 */
export const strikes: readonly StrikeDefinition[] = [
  fireBlade,
  iceBlade,
  thunderBlade,
  sealBlade,
  powerStrike,
  knockback,
  slowArrow,
  sweep,
  breakWeapon,
  breakArmor,
  breakSpeed,
  breakMagic,
  doubleStrike,
  stealGold,
  stealGear,
  blindStrike,
  backstab,
];
