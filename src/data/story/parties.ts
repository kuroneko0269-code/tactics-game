import type { Roster } from '../../core/progression';
import { initialRoster } from '../roster';

/**
 * 章のために決めた部隊（序章に足りない仕組み）。物語の戦闘の場面に partyId を書くと、育てた部隊の代わりにこれで戦う
 * （育てた部隊の強さに左右されない。戦闘の結果は部隊に入れない）。ユニットの id は人物の id。
 */
export const parties: Readonly<Record<string, Roster>> = {
  /** 試しの場面（仕組みを確かめる仮の内容）: 最初の部隊のまま */
  trial: initialRoster,
};
