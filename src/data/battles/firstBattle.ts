import type { BattleSetup } from '../../core/battleTypes';
import { twinHills } from '../maps/twinHills';

/**
 * フェーズ1-1 の戦闘: 味方4体（戦士2、弓使い2）対 敵4体（同じ構成）。
 * 配置は上下対称。味方は手前（z が大きい側）で奥を向き、敵は奥で手前を向く。
 */
export const firstBattle: BattleSetup = {
  id: 'first-battle',
  map: twinHills,
  units: [
    { id: 'p-warrior-1', team: 'player', jobId: 'warrior', x: 3, z: 8, facing: 'north' },
    { id: 'p-warrior-2', team: 'player', jobId: 'warrior', x: 6, z: 8, facing: 'north' },
    { id: 'p-archer-1', team: 'player', jobId: 'archer', x: 4, z: 9, facing: 'north' },
    { id: 'p-archer-2', team: 'player', jobId: 'archer', x: 5, z: 9, facing: 'north' },
    { id: 'e-warrior-1', team: 'enemy', jobId: 'warrior', x: 3, z: 1, facing: 'south' },
    { id: 'e-warrior-2', team: 'enemy', jobId: 'warrior', x: 6, z: 1, facing: 'south' },
    { id: 'e-archer-1', team: 'enemy', jobId: 'archer', x: 4, z: 0, facing: 'south' },
    { id: 'e-archer-2', team: 'enemy', jobId: 'archer', x: 5, z: 0, facing: 'south' },
  ],
};
