import { decideNextAction, type AiConfig } from '../core/ai';
import { activeUnit, applyAction, getUnit } from '../core/battle';
import type {
  ActionResult,
  BattleAction,
  BattleEvent,
  BattleState,
  SpellDefinition,
  SpellElement,
  SpellTarget,
  UnitState,
} from '../core/battleTypes';
import { attackableTargets, attackRangeTiles, previewAttack } from '../core/combat';
import { directionToward, manhattan, type Coord, type Direction } from '../core/geometry';
import { chargeArea, hasMpFor, previewSpellAt, spellOf, spellRangeTiles, targetCenter } from '../core/magic';
import { reachableTiles, unitAt } from '../core/movement';
import { predictTimeline } from '../core/turnOrder';
import type { BattleHud, HudAction, TurnOrderEntry } from './hud';
import { TEXT, unitName } from './text';
import type { UnitLabels } from './unitLabels';

/**
 * 戦闘画面の操作の流れ（タップ → 行動の選択 → core に行動を渡す → 出来事を再生）。
 * 戦闘の結果は core の applyAction だけが決め、ここは出来事を順に見せるだけにする。
 *
 * 3D 表示（src/render）には直接依存せず、main.ts から渡される BattleViewPort を通して動かす。
 */
export type MarkKind = 'move' | 'attack' | 'target' | 'selected' | 'spellRange' | 'spellArea';

export interface BattleViewPort {
  sync(state: BattleState): void;
  setMarks(marks: readonly { x: number; z: number; kind: MarkKind }[]): void;
  setReserved(tiles: readonly { x: number; z: number; element: SpellElement }[]): void;
  setCharging(unitId: string, element: SpellElement | undefined): void;
  setActive(unitId: string | undefined): void;
  showFacingArrows(unitId: string | undefined, selected?: Direction): void;
  turnTo(unitId: string, facing: Direction): Promise<void>;
  animateMove(unitId: string, path: readonly Coord[]): Promise<void>;
  animateAttack(event: Extract<BattleEvent, { type: 'attacked' }>, onImpact: () => void): Promise<void>;
  animateCast(event: Extract<BattleEvent, { type: 'castStarted' }>, element: SpellElement): Promise<void>;
  animateSpell(event: Extract<BattleEvent, { type: 'spellResolved' }>, onImpact: () => void): Promise<void>;
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
  /** 敵 AI の設定 */
  readonly ai: AiConfig;
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
  /** 渡した状態から戦闘を始め直す（開発中の自動テスト用） */
  load(result: ActionResult): void;
  readonly state: BattleState;
  /** プレイヤーの入力を待っているか（自動テスト用） */
  readonly mode: Mode['kind'];
  /** 操作の途中の状態（選んでいる向きや攻撃対象。自動テスト用） */
  readonly modeDetail: Readonly<Mode>;
}

/** 詠唱の中断の確認の後に続ける操作 */
type PendingStep = { kind: 'mode'; mode: Mode } | { kind: 'action'; action: BattleAction };

export type Mode =
  | { kind: 'busy' }
  | { kind: 'main' }
  | { kind: 'targeting' }
  | { kind: 'confirm'; targetId: string }
  | { kind: 'spellMenu' }
  | { kind: 'spellTarget'; spellId: string }
  /** ユニットのいるマスをタップした時、ユニットを狙うかマスを狙うかを選ぶ */
  | { kind: 'spellTargetKind'; spellId: string; x: number; z: number; unitId: string }
  | { kind: 'spellConfirm'; spellId: string; target: SpellTarget }
  /** 詠唱中のユニットが移動か行動をする前の確認 */
  | { kind: 'confirmInterrupt'; then: PendingStep }
  | { kind: 'facing'; facing: Direction }
  | { kind: 'ended' };

/** 敵の手番の見せ方（秒） */
const ENEMY_PAUSE = { start: 0.5, beforeMove: 0.35, beforeAttack: 0.45, afterAction: 0.2 };
/** 行動順の欄に出す数（ユニットの手番と魔法の発動の合計） */
const TURN_ORDER_COUNT = 8;
/** 発動が何番目になるかを数える時に、先まで予測する数 */
const TIMING_LOOKAHEAD = 30;

export function createBattleController(start: ActionResult, deps: BattleControllerDeps): BattleController {
  const { view, hud, labels } = deps;
  let state = start.state;
  let mode: Mode = { kind: 'busy' };
  /** 詠唱の中断を承諾した手番（その手番の中では、もう確認しない） */
  let interruptAcceptedTurn = -1;

  const turn = () => state.turn;
  const actor = (): UnitState => {
    const u = activeUnit(state);
    if (!u) throw new Error('手番のユニットがいません');
    return u;
  };
  const spellName = (id: string) => TEXT.spells[id] ?? id;

  const showTurnOrder = (pendingSpellId?: string) => {
    const entries: TurnOrderEntry[] = predictTimeline(state, TURN_ORDER_COUNT, { pendingSpellId }).map((e, i) => {
      if (e.kind === 'turn') {
        const u = getUnit(state, e.unitId);
        return { kind: 'turn', id: e.unitId, team: u.team, jobId: u.jobId };
      }
      const caster = getUnit(state, e.casterId);
      const pending = pendingSpellId !== undefined && e.casterId === turn()?.unitId && i > 0;
      return {
        kind: 'spell',
        casterId: caster.id,
        casterJobId: caster.jobId,
        team: caster.team,
        spellId: e.spellId,
        element: spellOf(caster, e.spellId).element,
        pending,
      };
    });
    hud.setTurnOrder(entries);
  };

  /** 詠唱中の魔法が予約している範囲を、マップに薄く表示し続ける（敵の魔法も） */
  const showReserved = () => {
    const tiles: { x: number; z: number; element: SpellElement }[] = [];
    for (const u of state.units) {
      if (!u.charging) continue;
      const element = spellOf(u, u.charging.spellId).element;
      for (const t of chargeArea(state, u)) tiles.push({ ...t, element });
    }
    view.setReserved(tiles);
  };

  /** 手番開始時から詠唱中で、まだ中断を承諾していないか */
  const needsInterruptConfirm = () => {
    const t = turn();
    return Boolean(t?.chargingAtStart && actor().charging && interruptAcceptedTurn !== state.turnNumber);
  };
  /** 詠唱の中断になる操作は、確認を挟んでから行う */
  const guard = (step: PendingStep) => {
    if (needsInterruptConfirm()) return setMode({ kind: 'confirmInterrupt', then: step });
    runStep(step);
  };
  const runStep = (step: PendingStep) => {
    if (step.kind === 'mode') setMode(step.mode);
    else void perform(step.action);
  };

  /** 魔法の狙い先として選べるマスか（射程の内側） */
  const inSpellRange = (spell: SpellDefinition, c: Coord) => manhattan(actor(), c) <= spell.range;

  /** 今のモードに合わせて、マスの色分け・ボタン・案内文を出し直す */
  const refresh = () => {
    hud.showPreview(undefined);
    view.showFacingArrows(undefined);
    showReserved();
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
        const charging = t.chargingAtStart && unit.charging ? spellName(unit.charging.spellId) : undefined;
        hud.setHint(charging ? TEXT.hints.charging(charging) : t.moved ? TEXT.hints.afterMove : TEXT.hints.playerTurn);
        const actions: HudAction[] = [
          {
            label: TEXT.buttons.attack,
            onClick: () => guard({ kind: 'mode', mode: { kind: 'targeting' } }),
            disabled: t.acted,
            primary: !t.acted && unit.spells.length === 0 && !charging,
          },
        ];
        if (unit.spells.length > 0) {
          actions.push({
            label: TEXT.buttons.magic,
            onClick: () => guard({ kind: 'mode', mode: { kind: 'spellMenu' } }),
            disabled: t.acted,
            primary: !t.acted && !charging,
          });
        }
        actions.push({ label: TEXT.buttons.wait, onClick: () => setMode({ kind: 'facing', facing: unit.facing }), primary: Boolean(charging) });
        if (t.moved && !t.acted) actions.unshift({ label: TEXT.buttons.undoMove, onClick: () => void perform({ type: 'undoMove' }) });
        hud.setActions(actions);
        break;
      }
      case 'confirmInterrupt': {
        view.setMarks([self]);
        hud.setHint(TEXT.hints.confirmInterrupt(spellName(unit.charging?.spellId ?? '')));
        const then = mode.then;
        hud.setActions([
          { label: TEXT.buttons.keepCasting, onClick: () => setMode({ kind: 'main' }) },
          {
            label: TEXT.buttons.interrupt,
            danger: true,
            onClick: () => {
              interruptAcceptedTurn = state.turnNumber;
              runStep(then);
            },
          },
        ]);
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
            chargingPercent: p.chargingPercent,
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
      case 'spellMenu': {
        view.setMarks([self]);
        hud.setHint(TEXT.hints.chooseSpell(unit.mp, unit.stats.maxMp));
        hud.setActions([
          { label: TEXT.buttons.back, onClick: () => setMode({ kind: 'main' }) },
          ...unit.spells.map(
            (sp): HudAction => ({
              label: spellName(sp.id),
              detail: `${TEXT.mp} ${sp.mpCost}`,
              disabled: !hasMpFor(unit, sp),
              onClick: () => setMode({ kind: 'spellTarget', spellId: sp.id }),
            }),
          ),
        ]);
        break;
      }
      case 'spellTarget':
      case 'spellTargetKind':
      case 'spellConfirm': {
        const spell = spellOf(unit, mode.spellId);
        const range = spellRangeTiles(state.map, spell, unit).map((c) => ({ ...c, kind: 'spellRange' as const }));
        if (mode.kind === 'spellTarget') {
          view.setMarks([...range, self]);
          hud.setHint(TEXT.hints.chooseSpellTarget);
          hud.setActions([{ label: TEXT.buttons.back, onClick: () => setMode({ kind: 'spellMenu' }) }]);
          showTurnOrder(spell.id);
          break;
        }
        if (mode.kind === 'spellTargetKind') {
          view.setMarks([...range, { x: mode.x, z: mode.z, kind: 'selected' }]);
          hud.setHint(`${TEXT.hints.chooseTargetKind}（${TEXT.hints.targetKindHelp}）`);
          const { spellId, x, z, unitId } = mode;
          hud.setActions([
            { label: TEXT.buttons.back, onClick: () => setMode({ kind: 'spellTarget', spellId }) },
            {
              label: TEXT.buttons.targetTile,
              onClick: () => setMode({ kind: 'spellConfirm', spellId, target: { kind: 'tile', x, z } }),
            },
            {
              label: TEXT.buttons.targetUnit,
              primary: true,
              onClick: () => setMode({ kind: 'spellConfirm', spellId, target: { kind: 'unit', unitId } }),
            },
          ]);
          showTurnOrder(spell.id);
          break;
        }
        // 確定前の予測: 範囲、巻き込まれる全員と予測の効果量、発動が行動順の何番目か、味方を巻き込む警告
        const center = targetCenter(state, mode.target)!;
        const preview = previewSpellAt(state, unit, spell, center, { ...unit, charging: null });
        const area = preview.tiles.map((c) => ({ ...c, kind: 'spellArea' as const }));
        view.setMarks([...range, ...area]);
        hud.setHint('');
        const timeline = predictTimeline(state, TIMING_LOOKAHEAD, { pendingSpellId: spell.id });
        const timing = timeline.findIndex((e, i) => i > 0 && e.kind === 'spell' && e.casterId === unit.id) + 1;
        const affected = preview.results.map((r) => ({ ...r, unit: getUnit(state, r.unitId) }));
        const allies = affected.filter((r) => r.unit.team === unit.team).length;
        const enemies = affected.length - allies;
        const warning =
          spell.effect === 'damage' && allies > 0
            ? TEXT.spellPreview.allyWarning(allies)
            : spell.effect === 'heal' && enemies > 0
              ? TEXT.spellPreview.enemyHealWarning(enemies)
              : '';
        const target = mode.target;
        hud.showSpellPreview({
          spellName: spellName(spell.id),
          element: spell.element,
          effect: spell.effect,
          targetText:
            target.kind === 'unit'
              ? TEXT.spellPreview.targetUnit(unitName(target.unitId, getUnit(state, target.unitId).jobId))
              : TEXT.spellPreview.targetTile,
          timing,
          mpText: TEXT.spellPreview.mp(spell.mpCost, unit.mp),
          results: affected.map((r) => ({
            name: unitName(r.unitId, r.unit.jobId),
            team: r.unit.team,
            amount: r.amount,
            hp: r.hp,
            maxHp: r.unit.stats.maxHp,
          })),
          warning,
        });
        showTurnOrder(spell.id);
        hud.setActions([
          { label: TEXT.buttons.back, onClick: () => setMode({ kind: 'spellTarget', spellId: spell.id }) },
          { label: TEXT.buttons.confirm, primary: true, onClick: () => void perform({ type: 'cast', spellId: spell.id, target }) },
        ]);
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
          showReserved();
          break;
        case 'moveUndone':
          view.sync(state);
          showReserved();
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
        case 'castStarted': {
          const caster = getUnit(state, ev.casterId);
          const element = spellOf(caster, ev.spellId).element;
          view.setMarks([]);
          labels.setMp(ev.casterId, ev.mp, caster.stats.maxMp);
          await view.animateCast(ev, element);
          view.setCharging(ev.casterId, element);
          showReserved();
          break;
        }
        case 'spellResolved': {
          view.setCharging(ev.casterId, undefined);
          await view.focusTiles([getUnit(state, ev.casterId), ...ev.tiles]);
          await view.animateSpell(ev, () => {
            for (const r of ev.results) {
              const u = getUnit(state, r.unitId);
              if (ev.effect === 'heal') labels.popHeal(r.unitId, r.amount);
              else labels.popDamage(r.unitId, r.amount);
              labels.setHp(r.unitId, r.hp, u.stats.maxHp);
            }
          });
          showReserved();
          break;
        }
        case 'spellFizzled':
          view.setCharging(ev.casterId, undefined);
          labels.popText(ev.casterId, TEXT.fizzled);
          showReserved();
          await view.wait(0.4);
          break;
        case 'castInterrupted':
          view.setCharging(ev.casterId, undefined);
          labels.popText(ev.casterId, TEXT.interrupted);
          showReserved();
          await view.wait(0.4);
          break;
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
    showReserved();
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
      const action = decideNextAction(state, deps.ai);
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
      } else if (action.type === 'cast') {
        // 敵の魔法も、狙った範囲を見せてから指定する
        const spell = spellOf(actor(), action.spellId);
        const center = targetCenter(state, action.target)!;
        const area = previewSpellAt(state, actor(), spell, center).tiles.map((c) => ({ ...c, kind: 'spellArea' as const }));
        view.setMarks(area);
        showTurnOrder(spell.id);
        await view.focusTiles([actor(), center]);
        await view.wait(ENEMY_PAUSE.beforeAttack);
      }
      const result = applyAction(state, action);
      state = result.state;
      view.setMarks([]);
      await play(result.events);
      await view.wait(ENEMY_PAUSE.afterAction);
    }
  };

  const startFrom = (result: ActionResult) => {
    state = result.state;
    view.sync(state);
    for (const u of state.units) {
      labels.setHp(u.id, u.hp, u.stats.maxHp);
      labels.setMp(u.id, u.mp, u.stats.maxMp);
    }
    hud.showResult(undefined, 0);
    mode = { kind: 'busy' };
    interruptAcceptedTurn = -1;
    showReserved();
    void play(result.events).then(proceed);
  };
  const restart = () => startFrom(deps.newBattle());

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
      if (dest) return guard({ kind: 'action', action: { type: 'move', x: dest.x, z: dest.z } });
    }
    if (mode.kind === 'targeting' || mode.kind === 'confirm') {
      const targets = attackableTargets(state, actor(), actor());
      for (const c of candidates) {
        const target = targets.find((u) => u.x === c.x && u.z === c.z);
        if (target) return setMode({ kind: 'confirm', targetId: target.id });
      }
    }
    if (mode.kind === 'spellTarget' || mode.kind === 'spellTargetKind' || mode.kind === 'spellConfirm') {
      const spell = spellOf(actor(), mode.spellId);
      const c = candidates.find((c) => inSpellRange(spell, c));
      if (c) {
        // ユニットのいるマスなら、ユニットを狙うかマスを狙うかを選ばせる
        const there = unitAt(state, c.x, c.z);
        if (there) return setMode({ kind: 'spellTargetKind', spellId: spell.id, x: c.x, z: c.z, unitId: there.id });
        return setMode({ kind: 'spellConfirm', spellId: spell.id, target: { kind: 'tile', x: c.x, z: c.z } });
      }
    }
    // それ以外は、タップしたユニットの情報を見せるだけ
    const tapped = first ? unitAt(state, first.x, first.z) : undefined;
    if (tapped) hud.setUnitInfo(tapped, state.turnNumber);
  };

  void play(start.events).then(proceed);

  return {
    onTap,
    load: startFrom,
    get state() {
      return state;
    },
    get mode() {
      return mode.kind;
    },
    get modeDetail() {
      return JSON.parse(JSON.stringify(mode)) as Mode;
    },
  };
}
