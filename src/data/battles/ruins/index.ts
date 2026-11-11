import type { BattleSite } from '../../../core/sortie';
import { ruinsAltar } from './altar';
import { ruinsCorridor } from './corridor';
import { ruinsEntrance } from './entrance';

/** ダンジョン「はじまりの遺跡」（名称は仮）の3つの戦闘。第1戦から順に並べる */
export const ruinsDungeon: { readonly id: string; readonly battles: readonly BattleSite[] } = {
  id: 'ruins',
  battles: [ruinsEntrance, ruinsCorridor, ruinsAltar],
};
