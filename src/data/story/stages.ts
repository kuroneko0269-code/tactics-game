import type { MapDefinition } from '../../core/map';

/**
 * 会話の場面のための、戦闘をしない小さなマップ（物語の土台）。会話の場面（章のデータ）から id で選ぶ。
 * 名前は text.ts の mapNames に id で引く。
 */
export interface StageDefinition {
  readonly id: string;
  readonly map: MapDefinition;
}

/** 室内（仮）: 5×5 の床と、奥の壁（高さ 4） */
export const roomStage: StageDefinition = {
  id: 'stage-room',
  map: {
    id: 'stage-room',
    heights: [
      [4, 4, 4, 4, 4],
      [0, 0, 0, 0, 0],
      [0, 0, 0, 0, 0],
      [0, 0, 0, 0, 0],
      [0, 0, 0, 0, 0],
    ],
    terrain: ['sssss', 'ddddd', 'ddddd', 'ddddd', 'ddddd'],
    legend: { s: 'stone', d: 'dirt' },
  },
};

/** 野外（仮）: 7×6 の草地と小さな段差 */
export const yardStage: StageDefinition = {
  id: 'stage-yard',
  map: {
    id: 'stage-yard',
    heights: [
      [2, 2, 1, 1, 1, 2, 2],
      [1, 1, 0, 0, 0, 1, 2],
      [0, 0, 0, 0, 0, 0, 1],
      [0, 0, 0, 0, 0, 0, 0],
      [0, 0, 0, 1, 0, 0, 0],
      [0, 0, 0, 0, 0, 0, 0],
    ],
    terrain: ['ssgggss', 'ggggggs', 'gggdggg', 'gggdggg', 'gggdggg', 'gggdggg'],
    legend: { s: 'stone', g: 'grass', d: 'dirt' },
  },
};

export const stages: readonly StageDefinition[] = [roomStage, yardStage];
