import type { BattleState, DefeatCondition, VictoryCondition } from '../core/battleTypes';
import { goalTiles, turnsRemaining } from '../core/scenario';
import type { ObjectivesView } from './hud';
import { TEXT, unitName } from './text';

/**
 * 勝敗条件・増援の予告・見えている罠を、画面の表示の形にする（フェーズ2-2）。
 * 状態を読んで文言とマスの一覧を作るだけで、戦闘の結果は計算しない。
 */

/** ユニットの名前（いなければ id で引ける名前） */
const namer = (state: BattleState) => (id: string) => unitName(id, state.units.find((x) => x.id === id)?.jobId ?? '');

/** 勝利条件の文言。nameOf はユニットの名前の引き方（省くと id で引ける名前） */
export function victoryText(c: VictoryCondition, nameOf: (id: string) => string = (id) => unitName(id, '')): string {
  switch (c.kind) {
    case 'defeatAll':
      return TEXT.objectives.defeatAll;
    case 'defeatUnit':
      return TEXT.objectives.defeatUnit(nameOf(c.unitId));
    case 'reachTile':
      return TEXT.objectives.reachTile;
    case 'surviveTurns':
      return TEXT.objectives.surviveTurns(c.turns);
  }
}

/** 常に出す短い文に使う、勝利条件の短い表記 */
function victoryShort(state: BattleState, c: VictoryCondition): string {
  return c.kind === 'reachTile' ? TEXT.objectives.reachTileShort : victoryText(c, namer(state));
}

export function defeatText(c: DefeatCondition, nameOf: (id: string) => string = (id) => unitName(id, '')): string {
  switch (c.kind) {
    case 'allDefeated':
      return TEXT.objectives.allDefeated;
    case 'unitDefeated':
      return TEXT.objectives.unitDefeated(nameOf(c.unitId));
    case 'turnLimit':
      return TEXT.objectives.turnLimit(c.turns);
  }
}

/** 勝敗条件の表示。手番数の条件があれば残りの手番数を、増援の予告があれば何手番後かを添える */
export function objectivesView(state: BattleState): ObjectivesView {
  const { victory, defeat } = state.scenario.objectives;
  const notes: string[] = [];
  const short: string[] = [TEXT.objectives.summaryVictory(victory.map((c) => victoryShort(state, c)).join('／'))];
  const turns = turnsRemaining(state);
  if (turns) {
    notes.push(TEXT.objectives.turnsLeft(turns.turns));
    short.push(TEXT.objectives.turnsLeft(turns.turns));
  }
  const next = [...state.scenario.reinforcements].sort((a, b) => a.appearAfterTurn - b.appearAfterTurn);
  for (const r of next) notes.push(TEXT.objectives.reinforcement(r.units.length, r.appearAfterTurn - state.turnNumber));
  if (next[0]) short.push(TEXT.objectives.reinforcementShort(next[0].appearAfterTurn - state.turnNumber));
  notes.push(TEXT.objectives.alwaysNote);
  return {
    summary: short.join(' ・ '),
    victory: victory.map((c) => victoryText(c, namer(state))),
    defeat: defeat.map((c) => defeatText(c, namer(state))),
    notes,
  };
}

export type OverlayKind = 'goal' | 'warning' | 'trap-rockfall' | 'trap-mud' | 'trap-drain';

/** マップに出し続ける目印: 到達するマス、増援の出現する予定のマス、見えている罠（見えていない罠は出さない） */
export function overlayTiles(state: BattleState): { x: number; z: number; kind: OverlayKind }[] {
  return [
    ...goalTiles(state.scenario.objectives).map((t) => ({ ...t, kind: 'goal' as const })),
    ...state.scenario.reinforcements.flatMap((r) => r.units.map((u) => ({ x: u.x, z: u.z, kind: 'warning' as const }))),
    ...state.scenario.traps.filter((t) => t.revealed).map((t) => ({ x: t.x, z: t.z, kind: `trap-${t.kind}` as const })),
  ];
}
