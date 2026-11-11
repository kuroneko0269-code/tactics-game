import type { StatusId, Team } from '../core/battleTypes';
import { hpBar, mpBar } from './hud';
import { TEXT } from './text';

/**
 * 各ユニットの頭上に出す HP（と MP）の表示と、ダメージ・回復の数字や「ミス」「不発」の浮かぶ表示。
 * 位置（画面座標）は毎フレーム外から渡してもらう。
 */
export interface UnitLabels {
  setHp(id: string, hp: number, maxHp: number): void;
  /** MP を持つユニットだけ、HP の下に細い MP の棒を出す */
  setMp(id: string, mp: number, maxMp: number): void;
  setPositions(anchors: readonly { id: string; x: number; y: number; visible: boolean }[]): void;
  popDamage(id: string, damage: number): void;
  popHeal(id: string, amount: number): void;
  popMiss(id: string): void;
  /** 「不発」「中断」などの短い文言。kind が reaction ならリアクションの名前として目立たせる */
  popText(id: string, text: string, kind?: 'note' | 'reaction'): void;
  /** 付いている状態変化の小さな目印（頭上の HP の上に、1文字ずつ） */
  setStatuses(id: string, statuses: readonly StatusId[]): void;
  /** ユニットを足す（増援が現れた時） */
  addUnit(unit: LabelUnit): void;
  /** 撃破の対象の敵に、頭上の札（★）を付ける */
  setTargets(ids: readonly string[]): void;
}

export interface LabelUnit {
  readonly id: string;
  readonly team: Team;
  readonly hp: number;
  readonly maxHp: number;
  readonly mp: number;
  readonly maxMp: number;
}

export function createUnitLabels(root: HTMLElement, units: readonly LabelUnit[]): UnitLabels {
  root.innerHTML = '';
  const labels = new Map<string, { box: HTMLElement; hp: HTMLElement; mp: HTMLElement; statuses: HTMLElement; team: Team }>();
  const add = (u: LabelUnit) => {
    if (labels.has(u.id)) return;
    const box = document.createElement('div');
    box.className = `unit-label team-${u.team}`;
    const hp = document.createElement('div');
    hp.className = 'unit-label-hp';
    const mp = document.createElement('div');
    mp.className = 'unit-label-mp';
    const statuses = document.createElement('div');
    statuses.className = 'unit-label-status';
    statuses.hidden = true;
    box.append(hp, mp, statuses);
    root.append(box);
    labels.set(u.id, { box, hp, mp, statuses, team: u.team });
  };

  const setHp = (id: string, hp: number, maxHp: number) => {
    const l = labels.get(id);
    if (!l) return;
    l.hp.innerHTML = '';
    const num = document.createElement('span');
    num.className = 'unit-label-num';
    num.textContent = String(hp);
    l.hp.append(hpBar(hp, maxHp, l.team), num);
  };
  const setMp = (id: string, mp: number, maxMp: number) => {
    const l = labels.get(id);
    if (!l) return;
    l.mp.innerHTML = '';
    l.mp.hidden = maxMp <= 0;
    if (maxMp <= 0) return;
    l.mp.append(mpBar(mp, maxMp));
    l.mp.title = `${TEXT.mp} ${mp} / ${maxMp}`;
  };
  const addUnit = (u: LabelUnit) => {
    add(u);
    setHp(u.id, u.hp, u.maxHp);
    setMp(u.id, u.mp, u.maxMp);
  };
  for (const u of units) addUnit(u);

  const pop = (id: string, text: string, className: string) => {
    const l = labels.get(id);
    if (!l) return;
    const p = document.createElement('div');
    p.className = `popup ${className}`;
    p.textContent = text;
    l.box.append(p);
    p.addEventListener('animationend', () => p.remove());
  };

  return {
    setHp,
    setMp,
    setPositions(anchors) {
      for (const a of anchors) {
        const l = labels.get(a.id);
        if (!l) continue;
        l.box.style.transform = `translate(${a.x}px, ${a.y}px)`;
        l.box.classList.toggle('hidden', !a.visible);
      }
    },
    addUnit,
    setTargets(ids) {
      for (const [id, l] of labels) {
        let badge = l.box.querySelector<HTMLElement>('.unit-label-target');
        if (ids.includes(id) && !badge) {
          badge = document.createElement('div');
          badge.className = 'unit-label-target';
          badge.textContent = TEXT.objectives.targetBadge;
          badge.title = TEXT.objectives.targetTag;
          l.box.prepend(badge);
        } else if (!ids.includes(id) && badge) {
          badge.remove();
        }
      }
    },
    popDamage: (id, damage) => pop(id, String(damage), 'damage'),
    popHeal: (id, amount) => pop(id, `+${amount}`, 'heal'),
    popMiss: (id) => pop(id, TEXT.miss, 'miss'),
    popText: (id, text, kind = 'note') => pop(id, text, kind),
    setStatuses(id, statuses) {
      const l = labels.get(id);
      if (!l) return;
      l.statuses.innerHTML = '';
      l.statuses.hidden = statuses.length === 0;
      for (const st of statuses) {
        const badge = document.createElement('span');
        badge.className = `status-badge status-${st}`;
        badge.textContent = TEXT.statusShort[st];
        badge.title = TEXT.statuses[st];
        l.statuses.append(badge);
      }
    },
  };
}
