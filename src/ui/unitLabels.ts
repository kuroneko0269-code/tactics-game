import type { Team } from '../core/battleTypes';
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
  /** 「不発」「中断」などの短い文言 */
  popText(id: string, text: string): void;
}

export function createUnitLabels(
  root: HTMLElement,
  units: readonly { id: string; team: Team; hp: number; maxHp: number; mp: number; maxMp: number }[],
): UnitLabels {
  root.innerHTML = '';
  const labels = new Map<string, { box: HTMLElement; hp: HTMLElement; mp: HTMLElement; team: Team }>();
  for (const u of units) {
    const box = document.createElement('div');
    box.className = `unit-label team-${u.team}`;
    const hp = document.createElement('div');
    hp.className = 'unit-label-hp';
    const mp = document.createElement('div');
    mp.className = 'unit-label-mp';
    box.append(hp, mp);
    root.append(box);
    labels.set(u.id, { box, hp, mp, team: u.team });
  }

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
  for (const u of units) {
    setHp(u.id, u.hp, u.maxHp);
    setMp(u.id, u.mp, u.maxMp);
  }

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
    popDamage: (id, damage) => pop(id, String(damage), 'damage'),
    popHeal: (id, amount) => pop(id, `+${amount}`, 'heal'),
    popMiss: (id) => pop(id, TEXT.miss, 'miss'),
    popText: (id, text) => pop(id, text, 'note'),
  };
}
