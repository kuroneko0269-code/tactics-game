import { decideNextAction } from '../core/ai';
import { activeUnit, applyAction, getUnit } from '../core/battle';
import type { ActionResult, BattleAction, BattleEvent, BattleState, UnitState } from '../core/battleTypes';
import { attackableTargets, attackRangeTiles, previewAttack } from '../core/combat';
import { directionToward, type Coord, type Direction } from '../core/geometry';
import { reachableTiles, unitAt } from '../core/movement';
import { predictTurnOrder } from '../core/turnOrder';
import type { BattleHud, HudAction } from './hud';
import { TEXT, unitName } from './text';
import type { UnitLabels } from './unitLabels';

/**
 * 戦闘画面の操作の流れ（タップ → 行動の選択 → core に行動を渡す → 出来事を再生）。
 * 戦闘の結果は core の applyAction だけが決め、ここは出来事を順に見せるだけにする。
 *
 * 3D 表示（src/render）には直接依存せず、main.ts から渡される BattleViewPort を通して動かす。
 */
export interface BattleViewPort {
  sync(state: BattleState): void;
  setMarks(marks: readonly { x: number; z: number; kind: 'move' | 'attack' | 'target' | 'selected' }[]): void;
  setActive(unitId: string | undefined): void;
  showFacingArrows(unitId: string | undefined, selected?: Direction): void;
  turnTo(unitId: string, facing: Direction): Promise<void>;
  animateMove(unitId: string, path: readonly Coord[]): Promise<void>;
  animateAttack(event: Extract<BattleEvent, { type: 'attacked' }>, onImpact: () => void): Promise<void>;
  animateDefeat(unitId: string): Promise<void>;
  wait(seconds: number): Promise<void>;
  /**
   * 指定したマス（とその上のユニット）が画面の見やすい範囲になければ、カメラをそこへ滑らかに寄せる。
   * カメラが止まったら解決する。
   */
  focusTiles(tiles: readonly Coord[]): Promise<void>;
}

export interface BattleControllerDeps {
  readonly view: BattleViewPort;
  readonly hud: BattleHud;
  readonly labels: UnitLabels;
  /** 新しい戦闘を始める（「もう一度」用） */
  readonly newBattle: () => ActionResult;
}

export interface BattleController {
  /**
   * マス（またはユニット・矢印）がタップされた。
   * candidates は指の下にあったマスを手前から順に並べたもの（手前のユニットに隠れた奥のマスも含む）。
   * direction は向きの矢印をタップした時だけ。
   */
  onTap(candidates: readonly Coord[], direction?: Direction): void;
  readonly state: BattleState;
  /** プレイヤーの入力を待っているか（自動テスト用） */
  readonly mode: Mode['kind'];
  /** 操作の途中の状態（選んでいる向きや攻撃対象。自動テスト用） */
  readonly modeDetail: Readonly<Mode>;
}

export type Mode =
  | { kind: 'busy' }
  | { kind: 'main' }
  | { kind: 'targeting' }
  | { kind: 'confirm'; targetId: string }
  | { kind: 'facing'; facing: Direction }
  | { kind: 'ended' };

/** 敵の手番の見せ方（秒） */
const ENEMY_PAUSE = { start: 0.5, beforeMove: 0.35, beforeAttack: 0.45, afterAction: 0.2 };
const TURN_ORDER_COUNT = 8;

export function createBattleController(start: ActionResult, deps: BattleControllerDeps): BattleController {
  const { view, hud, labels } = deps;
  let state = start.state;
  let mode: Mode = { kind: 'busy' };

  const turn = () => state.turn;
  const actor = (): UnitState => {
    const u = activeUnit(state);
    if (!u) throw new Error('手番のユニットがいません');
    return u;
  };

  const showTurnOrder = () => {
    hud.setTurnOrder(
      predictTurnOrder(state, TURN_ORDER_COUNT).map((id) => {
        const u = getUnit(state, id);
        return { id, team: u.team, jobId: u.jobId };
      }),
    );
  };

  /** 今のモードに合わせて、マスの色分け・ボタン・案内文を出し直す */
  const refresh = () => {
    hud.showPreview(undefined);
    view.showFacingArrows(undefined);
    if (mode.kind === 'busy' || mode.kind === 'ended') {
      hud.setActions([]);
      return;
    }
    const unit = actor();
    const t = turn()!;
    hud.setUnitInfo(unit, state.turnNumber);
    showTurnOrder();
    const self = { x: unit.x, z: unit.z, kind: 'selected' as const };

    switch (mode.kind) {
      case 'main': {
        const moves = t.moved ? [] : reachableTiles(state, unit).map((c) => ({ x: c.x, z: c.z, kind: 'move' as const }));
        view.setMarks([...moves, self]);
        hud.setHint(t.moved ? TEXT.hints.afterMove : TEXT.hints.playerTurn);
        const actions: HudAction[] = [
          { label: TEXT.buttons.attack, onClick: () => setMode({ kind: 'targeting' }), disabled: t.acted, primary: !t.acted },
          { label: TEXT.buttons.wait, onClick: () => setMode({ kind: 'facing', facing: unit.facing }) },
        ];
        if (t.moved && !t.acted) actions.unshift({ label: TEXT.buttons.undoMove, onClick: () => void perform({ type: 'undoMove' }) });
        hud.setActions(actions);
        break;
      }
      case 'targeting':
      case 'confirm': {
        const range = attackRangeTiles(state, unit, unit).map((c) => ({ ...c, kind: 'attack' as const }));
        const targets = attackableTargets(state, unit, unit);
        const targetMarks = targets.map((u) => ({
          x: u.x,
          z: u.z,
          kind: mode.kind === 'confirm' && mode.targetId === u.id ? ('selected' as const) : ('target' as const),
        }));
        view.setMarks([...range, ...targetMarks]);
        if (mode.kind === 'targeting') {
          hud.setHint(targets.length > 0 ? TEXT.hints.chooseTarget : TEXT.hints.noTarget);
          hud.setActions([{ label: TEXT.buttons.back, onClick: () => setMode({ kind: 'main' }) }]);
        } else {
          const target = getUnit(state, mode.targetId);
          const p = previewAttack(state, unit, target);
          hud.setHint('');
          hud.showPreview({
            targetName: unitName(target.id, target.jobId),
            side: p.side,
            hitPercent: p.hitPercent,
            damage: p.damage,
            heightPercent: p.heightPercent,
            targetHp: target.hp,
            targetMaxHp: target.stats.maxHp,
          });
          hud.setActions([
            { label: TEXT.buttons.back, onClick: () => setMode({ kind: 'targeting' }) },
            { label: TEXT.buttons.confirm, primary: true, onClick: () => void perform({ type: 'attack', targetId: target.id }) },
          ]);
        }
        break;
      }
      case 'facing': {
        view.setMarks([self]);
        view.showFacingArrows(unit.id, mode.facing);
        void view.turnTo(unit.id, mode.facing);
        hud.setHint(TEXT.hints.chooseFacing);
        const actions: HudAction[] = [];
        if (!(t.moved && t.acted)) {
          actions.push({
            label: TEXT.buttons.back,
            onClick: () => {
              void view.turnTo(unit.id, unit.facing);
              setMode({ kind: 'main' });
            },
          });
        }
        const facing = mode.facing;
        actions.push({ label: TEXT.buttons.decide, primary: true, onClick: () => void perform({ type: 'endTurn', facing }) });
        hud.setActions(actions);
        break;
      }
    }
  };

  const setMode = (next: Mode) => {
    mode = next;
    refresh();
  };

  /** 出来事を順に再生する */
  const play = async (events: readonly BattleEvent[]) => {
    for (const ev of events) {
      switch (ev.type) {
        case 'turnStarted': {
          const unit = getUnit(state, ev.unitId);
          view.setActive(ev.unitId);
          hud.setUnitInfo(unit, ev.turnNumber);
          // 手番が回ってきたユニットが画面の外にいれば、カメラを寄せる（敵の手番も同じ）
          await view.focusTiles([unit]);
          break;
        }
        case 'moved':
          view.setMarks([]);
          await view.animateMove(ev.unitId, ev.path);
          break;
        case 'moveUndone':
          view.sync(state);
          break;
        case 'attacked': {
          const target = getUnit(state, ev.targetId);
          await view.animateAttack(ev, () => {
            if (ev.hit) labels.popDamage(ev.targetId, ev.damage);
            else labels.popMiss(ev.targetId);
            labels.setHp(ev.targetId, ev.targetHp, target.stats.maxHp);
          });
          break;
        }
        case 'defeated':
          await view.animateDefeat(ev.unitId);
          break;
        case 'turnEnded':
          view.showFacingArrows(undefined);
          await view.turnTo(ev.unitId, ev.facing);
          break;
        case 'battleEnded':
          break;
      }
    }
  };

  const perform = async (action: BattleAction) => {
    if (mode.kind === 'busy' || mode.kind === 'ended') return;
    const before = turn();
    mode = { kind: 'busy' };
    refresh();
    const result = applyAction(state, action);
    state = result.state;
    await play(result.events);
    afterPlayerAction(before?.unitId);
  };

  const afterPlayerAction = (previousUnitId: string | undefined) => {
    const t = turn();
    if (state.winner || !t) return void proceed();
    if (t.unitId !== previousUnitId) return void proceed();
    if (t.moved && t.acted) return setMode({ kind: 'facing', facing: actor().facing });
    setMode({ kind: 'main' });
  };

  /** 次の手番へ。敵なら自動で進め、味方なら入力を待つ */
  const proceed = async () => {
    for (;;) {
      if (state.winner || !state.turn) {
        mode = { kind: 'ended' };
        refresh();
        view.setMarks([]);
        view.setActive(undefined);
        hud.setHint('');
        hud.showResult(state.winner ?? undefined, state.turnNumber, restart);
        return;
      }
      const unit = actor();
      if (unit.team === 'player') {
        setMode({ kind: 'main' });
        return;
      }
      await runEnemyTurn();
    }
  };

  const runEnemyTurn = async () => {
    mode = { kind: 'busy' };
    refresh();
    const unit = actor();
    hud.setUnitInfo(unit, state.turnNumber);
    showTurnOrder();
    hud.setHint(TEXT.hints.enemyTurn);
    view.setMarks([{ x: unit.x, z: unit.z, kind: 'selected' }]);
    await view.wait(ENEMY_PAUSE.start);
    const turnNumber = state.turnNumber;
    while (state.turn && state.turnNumber === turnNumber) {
      const action = decideNextAction(state);
      if (action.type === 'move') {
        const moves = reachableTiles(state, actor()).map((c) => ({ x: c.x, z: c.z, kind: 'move' as const }));
        view.setMarks([...moves, { x: action.x, z: action.z, kind: 'selected' }]);
        await view.focusTiles([actor(), action]);
        await view.wait(ENEMY_PAUSE.beforeMove);
      } else if (action.type === 'attack') {
        const target = getUnit(state, action.targetId);
        view.setMarks([{ x: target.x, z: target.z, kind: 'target' }]);
        await view.focusTiles([actor(), target]);
        await view.wait(ENEMY_PAUSE.beforeAttack);
      }
      const result = applyAction(state, action);
      state = result.state;
      view.setMarks([]);
      await play(result.events);
      await view.wait(ENEMY_PAUSE.afterAction);
    }
  };

  const restart = () => {
    const result = deps.newBattle();
    state = result.state;
    view.sync(state);
    for (const u of state.units) labels.setHp(u.id, u.hp, u.stats.maxHp);
    hud.showResult(undefined, 0);
    mode = { kind: 'busy' };
    void play(result.events).then(proceed);
  };

  const onTap = (candidates: readonly Coord[], direction?: Direction) => {
    if (mode.kind === 'busy' || mode.kind === 'ended') return;
    const first = candidates[0];
    if (mode.kind === 'facing') {
      const unit = actor();
      const tile = candidates.find((c) => c.x !== unit.x || c.z !== unit.z);
      if (!direction && !tile) return;
      const facing = direction ?? directionToward(unit, tile!, mode.facing);
      return setMode({ kind: 'facing', facing });
    }
    // 今の操作で選べるマスがあれば、手前から順に探してそれを選ぶ
    if (mode.kind === 'main' && !turn()!.moved) {
      const reachable = reachableTiles(state, actor());
      const dest = candidates.find((c) => reachable.some((r) => r.x === c.x && r.z === c.z));
      if (dest) return void perform({ type: 'move', x: dest.x, z: dest.z });
    }
    if (mode.kind === 'targeting' || mode.kind === 'confirm') {
      const targets = attackableTargets(state, actor(), actor());
      for (const c of candidates) {
        const target = targets.find((u) => u.x === c.x && u.z === c.z);
        if (target) return setMode({ kind: 'confirm', targetId: target.id });
      }
    }
    // それ以外は、タップしたユニットの情報を見せるだけ
    const tapped = first ? unitAt(state, first.x, first.z) : undefined;
    if (tapped) hud.setUnitInfo(tapped, state.turnNumber);
  };

  void play(start.events).then(proceed);

  return {
    onTap,
    get state() {
      return state;
    },
    get mode() {
      return mode.kind;
    },
    get modeDetail() {
      return { ...mode };
    },
  };
}
