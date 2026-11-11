import type { DungeonDefinition } from '../../../core/dungeon';
import { ruinsAltar } from './altar';
import { ruinsCorridor } from './corridor';
import { ruinsEntrance } from './entrance';

/**
 * ダンジョン「はじまりの遺跡」（名称は仮）の3連戦。第1戦から順に並べる。
 * クリアすると、全員の今のジョブに 300 JP（「やさしい」の訓練戦で勝った時のおよそ 1.5 戦ぶん）を配る。
 */
export const ruinsDungeon: DungeonDefinition = {
  id: 'ruins',
  battles: [ruinsEntrance, ruinsCorridor, ruinsAltar],
  clearRewardJp: 300,
};
