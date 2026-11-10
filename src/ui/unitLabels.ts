import type { Team } from '../core/battleTypes';
import { hpBar } from './hud';
import { TEXT } from './text';

/**
 * 各ユニットの頭上に出す HP 表示と、ダメージの数字・「ミス」の浮かぶ表示。
 * 位置（画面座標）は毎フレーム外から渡してもらう。
 */
export interface UnitLabels {
  setHp(id: string, hp: number, maxHp: number): void;
  setPositions(anchors: readonly { id: string; x: number; y: number; visible: boolean }[]): void;
  popDamage(id: string, damage: number): void;
  popMiss(id: string): void;
}

export function createUnitLabels(
  root: HTMLElement,
  units: readonly { id: string; team: Team; hp: number; maxHp: number }[],
): UnitLabels {
  root.innerHTML = '';
  const labels = new Map<string, { box: HTMLElement; hp: HTMLElement; team: Team }>();
  for (const u of units) {
    const box = document.createElement('div');
    box.className = `unit-label team-${u.team}`;
    const hp = document.createElement('div');
    hp.className = 'unit-label-hp';
    box.append(hp);
    root.append(box);
    labels.set(u.id, { box, hp, team: u.team });
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
  for (const u of units) setHp(u.id, u.hp, u.maxHp);

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
    setPositions(anchors) {
      for (const a of anchors) {
        const l = labels.get(a.id);
        if (!l) continue;
        l.box.style.transform = `translate(${a.x}px, ${a.y}px)`;
        l.box.classList.toggle('hidden', !a.visible);
      }
    },
    popDamage: (id, damage) => pop(id, String(damage), 'damage'),
    popMiss: (id) => pop(id, TEXT.miss, 'miss'),
  };
}
