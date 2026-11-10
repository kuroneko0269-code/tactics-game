import type { BattleSetup } from '../../core/battleTypes';
import { twinHills } from '../maps/twinHills';

/**
 * フェーズ1-2 の戦闘: 味方5体（戦士2、弓使い1、魔術師1、癒し手1）対 敵5体（同じ構成）。
 * 配置は上下対称。味方は手前（z が大きい側）で奥を向き、敵は奥で手前を向く。
 * 戦士が前列、弓使い・魔術師・癒し手が後列。
 *
 * 並び順は、同じジョブの味方と敵を組にして、組ごとに先になる側を入れ替える。
 * 行動順が同時になった時は並び順の早い方が先に動くので、どちらかを先にまとめて並べると、
 * 同じ素早さのユニットどうしでは常にその陣営が先に動いてしまうため。
 */
export const firstBattle: BattleSetup = {
  id: 'first-battle',
  map: twinHills,
  units: [
    { id: 'p-warrior-1', team: 'player', jobId: 'warrior', x: 3, z: 8, facing: 'north' },
    { id: 'e-warrior-1', team: 'enemy', jobId: 'warrior', x: 3, z: 1, facing: 'south' },
    { id: 'e-warrior-2', team: 'enemy', jobId: 'warrior', x: 6, z: 1, facing: 'south' },
    { id: 'p-warrior-2', team: 'player', jobId: 'warrior', x: 6, z: 8, facing: 'north' },
    { id: 'p-archer-1', team: 'player', jobId: 'archer', x: 5, z: 9, facing: 'north' },
    { id: 'e-archer-1', team: 'enemy', jobId: 'archer', x: 5, z: 0, facing: 'south' },
    { id: 'e-mage-1', team: 'enemy', jobId: 'mage', x: 4, z: 0, facing: 'south' },
    { id: 'p-mage-1', team: 'player', jobId: 'mage', x: 4, z: 9, facing: 'north' },
    { id: 'p-healer-1', team: 'player', jobId: 'healer', x: 6, z: 9, facing: 'north' },
    { id: 'e-healer-1', team: 'enemy', jobId: 'healer', x: 6, z: 0, facing: 'south' },
  ],
};
