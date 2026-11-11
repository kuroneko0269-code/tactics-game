import type { ActionResult, BattleSetup, BattleState } from '../core/battleTypes';
import type { Coord } from '../core/geometry';
import { unitAt } from '../core/movement';
import { targetUnitIds } from '../core/scenario';
import { swapPlacements } from '../core/sortie';
import type { BattleHud } from './hud';
import { objectivesView, overlayTiles, type OverlayKind } from './objectives';
import { TEXT, unitName } from './text';
import type { UnitLabels } from './unitLabels';

/**
 * 出撃前の配置の画面（フェーズ2-2）。マップ・敵の配置・勝敗条件を見ながら、味方の位置を入れ替える。
 * - 味方は決められた開始マスに自動で並ぶ。味方を2人続けてタップすると、位置を入れ替える（core の swapPlacements）。
 * - 敵をタップすると、情報の欄でその敵を見られる。
 * - 「戦闘開始」で、入れ替えた後の配置で戦闘を始める。
 * 表示用の状態は、戦闘を始める関数（preview）で毎回作り直す（戦闘の結果は計算しない）。
 */
export interface DeployViewPort {
  sync(state: BattleState): void;
  setMarks(marks: readonly { x: number; z: number; kind: 'move' | 'selected' }[]): void;
  setOverlays(tiles: readonly { x: number; z: number; kind: OverlayKind }[]): void;
}

export interface DeployController {
  onTap(candidates: readonly Coord[]): void;
  /** 今の配置 */
  readonly setup: BattleSetup;
  /** 選んでいる味方（自動テスト用） */
  readonly selected: string | null;
  readonly state: BattleState;
}

export function createDeployController(
  initial: BattleSetup,
  deps: {
    readonly preview: (setup: BattleSetup) => ActionResult;
    readonly view: DeployViewPort;
    readonly hud: BattleHud;
    readonly labels: UnitLabels;
    readonly onStart: (setup: BattleSetup) => void;
    readonly onBack: () => void;
  },
): DeployController {
  const { view, hud, labels } = deps;
  let setup = initial;
  let state = deps.preview(setup).state;
  let selected: string | null = null;
  let done = false;

  const render = () => {
    view.sync(state);
    const players = state.units.filter((u) => u.team === 'player');
    view.setMarks([
      ...players.filter((u) => u.id !== selected).map((u) => ({ x: u.x, z: u.z, kind: 'move' as const })),
      ...players.filter((u) => u.id === selected).map((u) => ({ x: u.x, z: u.z, kind: 'selected' as const })),
    ]);
    view.setOverlays(overlayTiles(state));
    labels.setTargets(targetUnitIds(state.scenario.objectives));
    hud.setObjectives(objectivesView(state));
    const sel = selected ? state.units.find((u) => u.id === selected) : undefined;
    hud.setHint(sel ? TEXT.deploy.selected(unitName(sel.id, sel.jobId)) : TEXT.deploy.hint);
    hud.setActions([
      { label: TEXT.deploy.back, onClick: () => !done && deps.onBack() },
      {
        label: TEXT.deploy.start,
        primary: true,
        onClick: () => {
          if (done) return;
          done = true;
          hud.showObjectives(false);
          deps.onStart(setup);
        },
      },
    ]);
  };

  render();
  hud.setTurnOrder([]);
  hud.setUnitInfo(undefined, 0);
  hud.showObjectives(true);

  return {
    onTap(candidates) {
      if (done) return;
      for (const c of candidates) {
        const u = unitAt(state, c.x, c.z);
        if (!u) continue;
        hud.setUnitInfo(u, 0);
        if (u.team !== 'player') return;
        if (selected === null) selected = u.id;
        else if (selected === u.id) selected = null;
        else {
          setup = swapPlacements(setup, selected, u.id);
          state = deps.preview(setup).state;
          selected = null;
        }
        render();
        return;
      }
    },
    get setup() {
      return setup;
    },
    get selected() {
      return selected;
    },
    get state() {
      return state;
    },
  };
}
