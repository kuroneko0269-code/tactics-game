import { decideNextAction, defaultFacing, type AiConfig } from '../core/ai';
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
import { attackableTargets, attackRangeTiles, previewAttack, strikeOf, weaponFits, type AttackPreview } from '../core/combat';
import { isSilencedFor, mpCostOf, passiveIdOf, statusBlocker } from '../core/effects';
import { directionToward, type Coord, type Direction } from '../core/geometry';
import { chargeArea, hasMpFor, inSpellRange, previewSpellAt, spellOf, spellRangeTiles, targetCenter } from '../core/magic';
import { reachableTiles, unitAt } from '../core/movement';
import { targetUnitIds } from '../core/scenario';
import { predictTimeline } from '../core/turnOrder';
import { objectivesView, overlayTiles, type OverlayKind } from './objectives';
import type { AttackPreviewView, BattleHud, HudAction, TurnOrderEntry } from './hud';
import { TEXT, unitName } from './text';
import type { UnitLabels } from './unitLabels';

/**
 * 戦闘画面の操作の流れ（タップ → 行動の選択 → core に行動を渡す → 出来事を再生）。
 * 戦闘の結果は core の applyAction だけが決め、ここは出来事を順に見せるだけにする。
 *
 * 3D 表示（src/render）には直接依存せず、main.ts から渡される BattleViewPort を通して動かす。
 */
export type MarkKind = 'move' | 'attack' | 'target' | 'selected' | 'spellRange' | 'spellArea' | 'push';

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
  /** 突き飛ばしで押し出される（押し出せない時は、その場で揺れる）。止まった瞬間に onImpact を呼ぶ */
  animateKnockback(event: Extract<BattleEvent, { type: 'knockedBack' }>, onImpact: () => void): Promise<void>;
  animateCast(event: Extract<BattleEvent, { type: 'castStarted' }>, element: SpellElement): Promise<void>;
  animateSpell(event: Extract<BattleEvent, { type: 'spellResolved' }>, onImpact: () => void): Promise<void>;
  animateDefeat(unitId: string): Promise<void>;
  /** 戦闘の間ずっと出しておく目印（到達するマス・増援の予告・見えている罠） */
  setOverlays(tiles: readonly { x: number; z: number; kind: OverlayKind }[]): void;
  /** 増援が現れる */
  animateAppear(unit: UnitState): Promise<void>;
  /** 罠が発動する */
  animateTrap(event: Extract<BattleEvent, { type: 'trapTriggered' }>): Promise<void>;
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
  /** 決着した時に呼ぶ（結果の画面へ進むため） */
  readonly onFinished: (state: BattleState) => void;
}

export interface BattleController {
  /**
   * マス（またはユニット）がタップされた。
   * candidates は選ぶマスの候補を優先する順に並べたもの（render/tapJudge.ts の規則）。
   * 今の操作で選べる最初の候補を選ぶ。先頭はタップした点に一番手前に写っていたマス。
   */
  onTap(candidates: readonly Coord[]): void;
  /** 渡した状態から戦闘を始め直す（開発中の自動テスト用） */
  load(result: ActionResult): void;
  /** 戦闘を途中でやめる（敵の手番を進めるのをやめ、決着も知らせない） */
  dispose(): void;
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
  /** 攻撃する相手を選ぶ。abilityId は技（強打など）。通常攻撃なら null */
  | { kind: 'targeting'; abilityId: string | null }
  | { kind: 'confirm'; targetId: string; abilityId: string | null }
  /** コマンド（主コマンドなら 0、副コマンドなら 1）の中から、使う魔法・技を選ぶ */
  | { kind: 'abilityMenu'; command: number }
  | { kind: 'spellTarget'; spellId: string }
  /** ユニットのいるマスをタップした時、ユニットを狙うかマスを狙うかを選ぶ */
  | { kind: 'spellTargetKind'; spellId: string; x: number; z: number; unitId: string }
  | { kind: 'spellConfirm'; spellId: string; target: SpellTarget }
  /** 詠唱中のユニットが移動か行動をする前の確認 */
  | { kind: 'confirmInterrupt'; then: PendingStep }
  | { kind: 'facing'; facing: Direction }
  | { kind: 'ended' };

/** そのアビリティが入っているコマンドの番号（主コマンドなら 0） */
function commandIndexOf(unit: UnitState, abilityId: string): number {
  return Math.max(0, unit.commands.findIndex((c) => c.abilityIds.includes(abilityId)));
}

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
  /** 決着を知らせたか */
  let finished = false;
  /** 途中でやめたか */
  let disposed = false;

  const turn = () => state.turn;
  const actor = (): UnitState => {
    const u = activeUnit(state);
    if (!u) throw new Error('手番のユニットがいません');
    return u;
  };
  const abilityName = (id: string) => TEXT.abilities[id] ?? id;

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

  /** 勝敗条件の表示（残りの手番数・増援の予告）と、マップの目印（到達するマス・増援・見えている罠）を出し直す */
  const showScenario = () => {
    hud.setObjectives(objectivesView(state));
    view.setOverlays(overlayTiles(state));
    labels.setTargets(targetUnitIds(state.scenario.objectives));
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
  const canAim = (spell: SpellDefinition, c: Coord) => inSpellRange(spell, actor(), c);

  /** コマンドのアビリティのうち、今使えるか（使えなければ、ボタンに添える理由） */
  const abilityBlock = (unit: UnitState, abilityId: string): { disabled: boolean; detail?: string } => {
    const spell = unit.spells.find((s) => s.id === abilityId);
    const strike = unit.strikes.find((s) => s.id === abilityId);
    const weapons = spell?.weapons ?? strike?.weapons;
    if (!weaponFits(weapons, unit.weapon)) {
      return { disabled: true, detail: TEXT.abilityBlocked.weapon(weapons!.map((w) => TEXT.weapons[w]).join('・')) };
    }
    if (spell && isSilencedFor(unit, spell)) return { disabled: true, detail: TEXT.abilityBlocked.silence };
    if (spell) {
      const cost = mpCostOf(unit, spell);
      return { disabled: !hasMpFor(unit, spell), detail: cost > 0 ? `${TEXT.mp} ${cost}` : undefined };
    }
    return { disabled: false };
  };

  /** 攻撃の予測を、予測欄の表示の形にする（補正の内訳、押し出し、合計、反撃） */
  const attackPreviewView = (title: string, attacker: UnitState, target: UnitState, p: AttackPreview): AttackPreviewView => {
    const extraRows: { label: string; value: string; className?: string }[] = [];
    const notes: string[] = [];
    if (p.focusBonus > 0) notes.push(TEXT.preview.focus(abilityName(passiveIdOf(attacker, 'weaponHitBonus') ?? ''), p.focusBonus));
    if (p.evadePenalty > 0) notes.push(TEXT.preview.evade(abilityName(passiveIdOf(target, 'evade') ?? ''), p.evadePenalty));
    if (p.protectPercent !== 100) notes.push(TEXT.preview.protect(p.protectPercent));
    if (p.interrupts) notes.push(TEXT.preview.interrupts);
    if (p.inflicts) {
      const blocker = statusBlocker(target, p.inflicts);
      notes.push(
        blocker
          ? TEXT.preview.blocked(TEXT.equipment[blocker.id]?.name ?? blocker.id, TEXT.statuses[p.inflicts])
          : TEXT.preview.inflicts(TEXT.statuses[p.inflicts]),
      );
    }
    if (p.knockback) {
      const kb = p.knockback;
      extraRows.push({
        label: TEXT.preview.knockback,
        value: kb.to
          ? TEXT.preview.knockbackTo(kb.damage)
          : TEXT.preview.knockbackBlocked(TEXT.preview.knockbackReasons[kb.blockedBy ?? 'edge'] ?? '', kb.damage),
        className: kb.damage > 0 ? 'up' : '',
      });
      if (kb.damage > 0) {
        const total = p.damage + kb.damage;
        extraRows.push({ label: '', value: TEXT.preview.total(total, Math.max(0, target.hp - total)) });
      }
    }
    if (p.counter) {
      extraRows.push({
        label: TEXT.preview.counter,
        value: TEXT.preview.counterDetail(p.counter.damage, p.counter.hitPercent),
        className: 'counter',
      });
      notes.push(`${TEXT.preview.counter}: ${TEXT.preview.counterNote}`);
    }
    return {
      title,
      targetName: unitName(target.id, target.jobId),
      side: p.side,
      hitPercent: p.hitPercent,
      damage: p.damage,
      heightPercent: p.heightPercent,
      chargingPercent: p.chargingPercent,
      targetHp: target.hp,
      targetMaxHp: target.stats.maxHp,
      extraRows,
      notes,
    };
  };

  /** 今のモードに合わせて、マスの色分け・ボタン・案内文を出し直す */
  const refresh = () => {
    hud.showPreview(undefined);
    view.showFacingArrows(undefined);
    hud.showFacingPad(undefined);
    hud.setUndoMove(undefined);
    showReserved();
    showScenario();
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
        const charging = t.chargingAtStart && unit.charging ? abilityName(unit.charging.spellId) : undefined;
        hud.setHint(charging ? TEXT.hints.charging(charging) : t.moved ? TEXT.hints.afterMove : TEXT.hints.playerTurn);
        // 行動のボタン: 攻撃と、習得済みのアビリティがあるコマンド（主コマンド・副コマンド）
        const commands = unit.commands.map((c, i) => ({ c, i })).filter(({ c }) => c.abilityIds.length > 0);
        const actions: HudAction[] = [
          {
            label: TEXT.buttons.attack,
            onClick: () => guard({ kind: 'mode', mode: { kind: 'targeting', abilityId: null } }),
            disabled: t.acted,
            primary: !t.acted && commands.length === 0 && !charging,
          },
        ];
        for (const { c, i } of commands) {
          actions.push({
            label: TEXT.commands[c.jobId] ?? c.jobId,
            onClick: () => guard({ kind: 'mode', mode: { kind: 'abilityMenu', command: i } }),
            disabled: t.acted,
            primary: !t.acted && !charging && i === 0,
          });
        }
        actions.push({ label: TEXT.buttons.wait, onClick: () => setMode(facingMode()), primary: Boolean(charging) });
        hud.setActions(actions);
        // 移動した直後は「移動をやり直す」を目立つ位置に出す（意図しないマスへ移動した時にすぐ戻せるように）
        // 罠やイベントが起きた移動は取り消せない
        if (t.moved && !t.acted && !t.moveLocked) hud.setUndoMove(() => void perform({ type: 'undoMove' }));
        break;
      }
      case 'confirmInterrupt': {
        view.setMarks([self]);
        hud.setHint(TEXT.hints.confirmInterrupt(abilityName(unit.charging?.spellId ?? '')));
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
        const abilityId = mode.abilityId;
        const strike = abilityId === null ? undefined : strikeOf(unit, abilityId);
        // 突き飛ばしは、押し出す先もマップ上に示す
        const pushTo =
          mode.kind === 'confirm' ? previewAttack(state, unit, getUnit(state, mode.targetId), unit, strike).knockback?.to : undefined;
        view.setMarks([...range, ...targetMarks, ...(pushTo ? [{ ...pushTo, kind: 'push' as const }] : [])]);
        const backFromTargeting = (): Mode =>
          abilityId === null ? { kind: 'main' } : { kind: 'abilityMenu', command: commandIndexOf(unit, abilityId) };
        if (mode.kind === 'targeting') {
          hud.setHint(
            targets.length === 0 ? TEXT.hints.noTarget : strike ? TEXT.hints.chooseStrikeTarget(abilityName(strike.id)) : TEXT.hints.chooseTarget,
          );
          hud.setActions([{ label: TEXT.buttons.back, onClick: () => setMode(backFromTargeting()) }]);
        } else {
          const target = getUnit(state, mode.targetId);
          const p = previewAttack(state, unit, target, unit, strike);
          hud.setHint('');
          hud.showPreview(
            attackPreviewView(strike ? TEXT.preview.strikeTitle(abilityName(strike.id)) : TEXT.preview.title, unit, target, p),
          );
          const action: BattleAction =
            abilityId === null ? { type: 'attack', targetId: target.id } : { type: 'attack', targetId: target.id, abilityId };
          hud.setActions([
            { label: TEXT.buttons.back, onClick: () => setMode({ kind: 'targeting', abilityId }) },
            { label: TEXT.buttons.confirm, primary: true, onClick: () => void perform(action) },
          ]);
        }
        break;
      }
      case 'abilityMenu': {
        view.setMarks([self]);
        hud.setHint(TEXT.hints.chooseAbility(unit.mp, unit.stats.maxMp));
        const command = unit.commands[mode.command]!;
        hud.setActions([
          { label: TEXT.buttons.back, onClick: () => setMode({ kind: 'main' }) },
          ...command.abilityIds.map((id): HudAction => {
            const isSpell = unit.spells.some((s) => s.id === id);
            return {
              label: abilityName(id),
              ...abilityBlock(unit, id),
              onClick: () =>
                setMode(isSpell ? { kind: 'spellTarget', spellId: id } : { kind: 'targeting', abilityId: id }),
            };
          }),
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
          hud.setActions([
            { label: TEXT.buttons.back, onClick: () => setMode({ kind: 'abilityMenu', command: commandIndexOf(unit, spell.id) }) },
          ]);
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
        const harmful = spell.effect === 'damage' || (spell.effect === 'status' && state.rules.status[spell.inflicts!].harmful);
        const warning =
          harmful && allies > 0
            ? TEXT.spellPreview.allyWarning(allies)
            : !harmful && enemies > 0
              ? TEXT.spellPreview.enemyHealWarning(enemies)
              : '';
        const target = mode.target;
        hud.showSpellPreview({
          spellName: abilityName(spell.id),
          element: spell.element,
          effect: spell.effect,
          targetText:
            target.kind === 'unit'
              ? TEXT.spellPreview.targetUnit(unitName(target.unitId, getUnit(state, target.unitId).jobId))
              : TEXT.spellPreview.targetTile,
          timing,
          mpText: mpCostOf(unit, spell) > 0 ? TEXT.spellPreview.mp(mpCostOf(unit, spell), unit.mp) : '',
          results: affected.map((r) => {
            const u = r.unit;
            const reducedBy = [
              ...(spell.effect === 'damage' && u.statuses.some((x) => x.id === 'protect') ? [TEXT.statuses.protect] : []),
              ...(spell.effect === 'damage' && spell.kind === 'magic' && passiveIdOf(u, 'magicShell')
                ? [abilityName(passiveIdOf(u, 'magicShell')!)]
                : []),
            ];
            const blocker = spell.effect === 'status' ? statusBlocker(u, spell.inflicts!) : undefined;
            const interrupts =
              !blocker && spell.inflicts === 'silence' && u.id !== unit.id && u.charging && spellOf(u, u.charging.spellId).kind === 'magic';
            return {
              name: unitName(r.unitId, u.jobId),
              team: u.team,
              amount: r.amount,
              hp: r.hp,
              maxHp: u.stats.maxHp,
              statusText:
                spell.effect !== 'status'
                  ? undefined
                  : blocker
                    ? TEXT.preview.blocked(TEXT.equipment[blocker.id]?.name ?? blocker.id, TEXT.statuses[spell.inflicts!])
                    : TEXT.spellPreview.status(TEXT.statuses[spell.inflicts!]),
              note:
                [
                  r.side ? TEXT.spellPreview.angle(TEXT.sides[r.side], TEXT.preview.heightPercent(r.heightPercent ?? 0)) : '',
                  interrupts ? TEXT.spellPreview.interrupt : '',
                  reducedBy.length > 0 ? TEXT.spellPreview.reduced(reducedBy.join('・')) : '',
                ].join('') || undefined,
            };
          }),
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
        // 向きのボタンがユニットの周りに出るので、ユニットが画面の端なら見やすい所へ寄せる
        void view.focusTiles([unit]);
        hud.showFacingPad(unit.id, mode.facing, (facing) => {
          if (mode.kind === 'facing') setMode({ kind: 'facing', facing });
        });
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
        actions.push({ label: TEXT.buttons.endTurn, primary: true, onClick: () => void perform({ type: 'endTurn', facing }) });
        hud.setActions(actions);
        break;
      }
    }
  };

  /** 手番の終わりの向きを選ぶ操作。向きの初期値は最も近い敵の方向（確定ボタン1つで手番を終えられるように） */
  const facingMode = (): Mode => ({ kind: 'facing', facing: defaultFacing(state, actor()) });

  const setMode = (next: Mode) => {
    mode = next;
    refresh();
  };

  /**
   * 再生中の出来事の時点で付いている状態変化。出来事は1つの行動の分をまとめて受け取るので、
   * 最終的な状態から、その出来事の後の様子を近似する（付いた・消えた順に頭上の目印を更新する）
   */
  const statusesAfter = (unitId: string) => getUnit(state, unitId).statuses.map((x) => x.id);

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
        case 'knockedBack': {
          const target = getUnit(state, ev.unitId);
          await view.animateKnockback(ev, () => {
            if (ev.damage > 0) labels.popDamage(ev.unitId, ev.damage);
            labels.setHp(ev.unitId, ev.hp, target.stats.maxHp);
          });
          showReserved();
          break;
        }
        case 'statusAdded':
          labels.popText(ev.unitId, TEXT.statuses[ev.status]);
          labels.setStatuses(ev.unitId, statusesAfter(ev.unitId));
          await view.wait(0.25);
          break;
        case 'statusExpired':
          labels.setStatuses(ev.unitId, statusesAfter(ev.unitId));
          break;
        case 'statusBlocked':
          // 装備で状態変化を防いだ時は、装備の名前と「沈黙を防いだ」を短く表示する
          labels.popText(ev.unitId, TEXT.equipmentBlocked(TEXT.equipment[ev.itemId]?.name ?? ev.itemId, TEXT.statuses[ev.status]), 'reaction');
          await view.wait(0.35);
          break;
        case 'reaction':
          // リアクションが発動した時は、アビリティの名前を短く表示する
          labels.popText(ev.unitId, abilityName(ev.abilityId), 'reaction');
          await view.wait(0.35);
          break;
        case 'mpRestored': {
          const u = getUnit(state, ev.unitId);
          labels.setMp(ev.unitId, ev.mp, u.stats.maxMp);
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
          labels.setStatuses(ev.unitId, []);
          await view.animateDefeat(ev.unitId);
          break;
        case 'turnEnded':
          view.showFacingArrows(undefined);
          await view.turnTo(ev.unitId, ev.facing);
          break;
        case 'trapTriggered': {
          await view.focusTiles([ev]);
          await view.animateTrap(ev);
          if (ev.unitId) {
            const u = getUnit(state, ev.unitId);
            labels.popText(ev.unitId, TEXT.traps[ev.trap] ?? ev.trap, 'reaction');
            if (ev.damage > 0) {
              labels.popDamage(ev.unitId, ev.damage);
              labels.setHp(ev.unitId, ev.hp, u.stats.maxHp);
            }
            if (ev.level) {
              labels.setHp(ev.unitId, ev.hp, u.stats.maxHp);
              labels.setMp(ev.unitId, u.mp, u.stats.maxMp);
              labels.popText(ev.unitId, TEXT.levelChange(ev.level.from, ev.level.to));
              hud.showMessage(`${TEXT.traps.drain}（${unitName(u.id, u.jobId)} ${TEXT.levelChange(ev.level.from, ev.level.to)}）`);
            }
          }
          showScenario();
          await view.wait(0.35);
          break;
        }
        case 'message':
          hud.showMessage(TEXT.messages[ev.messageId] ?? ev.messageId);
          await view.wait(0.9);
          break;
        case 'reinforcementWarned':
          showScenario();
          await view.focusTiles(ev.tiles);
          await view.wait(0.6);
          break;
        case 'unitAppeared': {
          const u = ev.unit;
          labels.addUnit({ id: u.id, team: u.team, hp: u.hp, maxHp: u.stats.maxHp, mp: u.mp, maxMp: u.stats.maxMp });
          await view.focusTiles([u]);
          await view.animateAppear(u);
          labels.popText(u.id, TEXT.appeared, 'reaction');
          showScenario();
          await view.wait(0.25);
          break;
        }
        case 'progressGained':
          // 行動で得た経験値と JP。操作は止めない（待たずに次へ進む）
          labels.popGain(ev.unitId, ev.exp, ev.jp);
          break;
        case 'leveledUp': {
          const u = getUnit(state, ev.unitId);
          labels.setHp(ev.unitId, ev.hp, ev.stats.maxHp);
          labels.setMp(ev.unitId, ev.mp, ev.stats.maxMp);
          labels.popLevelUp(ev.unitId, ev.to);
          hud.showLevelUp(TEXT.gain.levelUpBanner(unitName(u.id, u.jobId), ev.to));
          await view.wait(0.45);
          break;
        }
        case 'jobLeveledUp':
          labels.popText(ev.unitId, TEXT.gain.jobLevelUp(TEXT.jobs[ev.jobId] ?? ev.jobId, ev.to), 'joblevel');
          break;
        case 'eventFired':
        case 'battleEnded':
          break;
      }
    }
    showReserved();
    showScenario();
  };

  const perform = async (action: BattleAction) => {
    if (disposed || mode.kind === 'busy' || mode.kind === 'ended') return;
    const before = turn();
    mode = { kind: 'busy' };
    refresh();
    const result = applyAction(state, action);
    state = result.state;
    await play(result.events);
    afterPlayerAction(before?.unitId);
  };

  const afterPlayerAction = (previousUnitId: string | undefined) => {
    if (disposed) return;
    const t = turn();
    if (state.winner || !t) return void proceed();
    if (t.unitId !== previousUnitId) return void proceed();
    if (t.moved && t.acted) return setMode(facingMode());
    setMode({ kind: 'main' });
  };

  /** 次の手番へ。敵なら自動で進め、味方なら入力を待つ */
  const proceed = async () => {
    for (;;) {
      if (disposed) return;
      if (state.winner || !state.turn) {
        mode = { kind: 'ended' };
        refresh();
        view.setMarks([]);
        view.setActive(undefined);
        hud.setHint('');
        hud.showResult(state.winner ?? undefined, state.turnNumber);
        if (!finished && !disposed) {
          finished = true;
          deps.onFinished(state);
        }
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
    while (state.turn && state.turnNumber === turnNumber && !disposed) {
      const action = decideNextAction(state, deps.ai);
      if (action.type === 'move') {
        const moves = reachableTiles(state, actor()).map((c) => ({ x: c.x, z: c.z, kind: 'move' as const }));
        view.setMarks([...moves, { x: action.x, z: action.z, kind: 'selected' }]);
        await view.focusTiles([actor(), action]);
        await view.wait(ENEMY_PAUSE.beforeMove);
      } else if (action.type === 'attack') {
        const target = getUnit(state, action.targetId);
        const strike = action.abilityId === undefined ? undefined : strikeOf(actor(), action.abilityId);
        // 敵の突き飛ばしも、押し出す先を見せてから行う
        const pushTo = previewAttack(state, actor(), target, actor(), strike).knockback?.to;
        view.setMarks([{ x: target.x, z: target.z, kind: 'target' }, ...(pushTo ? [{ ...pushTo, kind: 'push' as const }] : [])]);
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
      labels.setStatuses(u.id, u.statuses.map((x) => x.id));
    }
    hud.showResult(undefined, 0);
    mode = { kind: 'busy' };
    interruptAcceptedTurn = -1;
    showReserved();
    void play(result.events).then(proceed);
  };

  const onTap = (candidates: readonly Coord[]) => {
    if (disposed || mode.kind === 'busy' || mode.kind === 'ended') return;
    const first = candidates[0];
    if (mode.kind === 'facing') {
      // マスをタップしても、その方向を向ける（向きのボタンの代わり）
      const unit = actor();
      if (!first || (first.x === unit.x && first.z === unit.z)) return;
      return setMode({ kind: 'facing', facing: directionToward(unit, first, mode.facing) });
    }
    // ユニットの体をタップした時は、候補はそのユニットのマスだけになっている（tapJudge.ts）
    const occupied = first ? unitAt(state, first.x, first.z) : undefined;
    // 今の操作で選べるマスがあれば、候補の先頭から順に探してそれを選ぶ
    if (mode.kind === 'main' && !turn()!.moved) {
      const reachable = reachableTiles(state, actor());
      const dest = candidates.find((c) => reachable.some((r) => r.x === c.x && r.z === c.z));
      if (dest) return guard({ kind: 'action', action: { type: 'move', x: dest.x, z: dest.z } });
    }
    if (mode.kind === 'targeting' || mode.kind === 'confirm') {
      const targets = attackableTargets(state, actor(), actor());
      for (const c of candidates) {
        const target = targets.find((u) => u.x === c.x && u.z === c.z);
        if (target) return setMode({ kind: 'confirm', targetId: target.id, abilityId: mode.abilityId });
      }
    }
    if (mode.kind === 'spellTarget' || mode.kind === 'spellTargetKind' || mode.kind === 'spellConfirm') {
      const spell = spellOf(actor(), mode.spellId);
      const c = candidates.find((c) => canAim(spell, c));
      if (c) {
        // ユニットのいるマスなら、ユニットを狙うかマスを狙うかを選ばせる
        const there = unitAt(state, c.x, c.z);
        if (there) return setMode({ kind: 'spellTargetKind', spellId: spell.id, x: c.x, z: c.z, unitId: there.id });
        return setMode({ kind: 'spellConfirm', spellId: spell.id, target: { kind: 'tile', x: c.x, z: c.z } });
      }
    }
    // それ以外は、タップしたユニットの情報を見せるだけ
    if (occupied) hud.setUnitInfo(occupied, state.turnNumber);
  };

  void play(start.events).then(proceed);

  return {
    onTap,
    load: startFrom,
    dispose() {
      disposed = true;
      mode = { kind: 'ended' };
    },
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
