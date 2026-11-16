import type { Roster } from '../../core/progression';
import { characterIds as c } from '../characters';
import { archer, healer, mage, timekeeper, warrior } from '../jobs';
import { grownBy } from '../battles/enemyUnits';

/**
 * 章のために決めた部隊（序章に足りない仕組み）。物語の戦闘の場面に partyId を書くと、育てた部隊の代わりにこれで戦う
 * （育てた部隊の強さに左右されない。戦闘の結果は部隊に入れない）。ユニットの id は人物の id。
 */
const noSlots = { secondary: null, reaction: null, support: null, movement: null };

/**
 * 序章の部隊（序章の PR B）: トウマ（時守）、ゴード（戦士）、キリ（弓使い）、フェン（魔道士）、ノノ（治癒師）。
 * 十二回目の任務を任される「いちばん確かな隊」なので、最初の部隊より少し育った レベル 3。装備は1段階目。
 * 行動アビリティ: トウマは斬り分け、ゴードは強打、キリは狙い撃ち、フェンは風と炎（積み石の合わせ目を火で割る）、ノノは癒し。
 */
export const prologueParty: Roster = {
  units: [
    { id: c.touma, jobId: 'timekeeper', level: 3, exp: 0, growth: grownBy(timekeeper, 2), slots: noSlots, jobs: { timekeeper: { jp: 0, jpTotal: 0, learned: ['sweep'] } }, equipment: { weapon: 'p1', armor: 'p2', accessory: null } },
    { id: c.gord, jobId: 'warrior', level: 3, exp: 0, growth: grownBy(warrior, 2), slots: noSlots, jobs: { warrior: { jp: 0, jpTotal: 0, learned: ['powerStrike'] } }, equipment: { weapon: 'p3', armor: 'p4', accessory: null } },
    { id: c.kiri, jobId: 'archer', level: 3, exp: 0, growth: grownBy(archer, 2), slots: noSlots, jobs: { archer: { jp: 0, jpTotal: 0, learned: ['aimedShot'] } }, equipment: { weapon: 'p5', armor: 'p6', accessory: null } },
    { id: c.fen, jobId: 'mage', level: 3, exp: 0, growth: grownBy(mage, 2), slots: noSlots, jobs: { mage: { jp: 0, jpTotal: 0, learned: ['wind', 'fire'] } }, equipment: { weapon: 'p7', armor: 'p8', accessory: null } },
    { id: c.nono, jobId: 'healer', level: 3, exp: 0, growth: grownBy(healer, 2), slots: noSlots, jobs: { healer: { jp: 0, jpTotal: 0, learned: ['heal'] } }, equipment: { weapon: 'p9', armor: 'p10', accessory: null } },
  ],
  gold: 0,
  items: [
    { uid: 'p1', itemId: 'sword-1' },
    { uid: 'p2', itemId: 'heavy-1' },
    { uid: 'p3', itemId: 'sword-1' },
    { uid: 'p4', itemId: 'heavy-1' },
    { uid: 'p5', itemId: 'bow-1' },
    { uid: 'p6', itemId: 'light-1' },
    { uid: 'p7', itemId: 'staff-1' },
    { uid: 'p8', itemId: 'robe-1' },
    { uid: 'p9', itemId: 'staff-1' },
    { uid: 'p10', itemId: 'robe-1' },
  ],
  nextItemSeq: 11,
};

export const parties: Readonly<Record<string, Roster>> = {
  prologue: prologueParty,
};
