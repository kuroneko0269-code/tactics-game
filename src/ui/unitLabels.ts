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
  /** 「不発」「中断」などの短い文言。kind が reaction ならリアクションの名前として目立たせる。joblevel はジョブのレベルアップ（控えめ） */
  popText(id: string, text: string, kind?: 'note' | 'reaction' | 'joblevel'): void;
  /** 行動で得た経験値と JP（「+9 EXP」「+20 JP」）を、ユニットの頭上に短く出す */
  popGain(id: string, exp: number, jp: number): void;
  /** レベルアップ（「Lv 3↑」）を、頭上の表示を光らせて出す（「レベルアップ！」の帯は hud が出す） */
  popLevelUp(id: string, level: number): void;
  /** 付いている状態変化の小さな目印（頭上の HP の上に、1文字ずつ） */
  setStatuses(id: string, statuses: readonly StatusId[]): void;
  /** ユニットを足す（増援が現れた時） */
  addUnit(unit: LabelUnit): void;
  /** 撃破の対象の敵に、頭上の札（★）を付ける */
  setTargets(ids: readonly string[]): void;
  /**
   * 戦闘不能の残りのカウントを頭上に出す（フェーズ2-5）。null で消す（立ち上がった）。
   * 退場したユニットは、頭上の表示ごと隠す（retired）
   */
  /** 戦闘不能の札。stays は退場しないユニット（数字の代わりに「膝」を出す。戦闘で人は死なない決まり） */
  setKnockout(id: string, count: number | null, retired?: boolean, stays?: boolean): void;
}

export interface LabelUnit {
  readonly id: string;
  readonly team: Team;
  readonly hp: number;
  readonly maxHp: number;
  readonly mp: number;
  readonly maxMp: number;
}

/** 頭上に出す状態変化の目印の数の上限 */
const MAX_STATUS_BADGES = 2;

export function createUnitLabels(root: HTMLElement, units: readonly LabelUnit[]): UnitLabels {
  root.innerHTML = '';
  const labels = new Map<
    string,
    { box: HTMLElement; hp: HTMLElement; mp: HTMLElement; statuses: HTMLElement; knockout: HTMLElement; team: Team; retired: boolean }
  >();
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
    const knockout = document.createElement('div');
    knockout.className = 'unit-label-knockout';
    knockout.hidden = true;
    knockout.title = TEXT.knockout.badgeTitle;
    box.append(knockout, hp, mp, statuses);
    root.append(box);
    labels.set(u.id, { box, hp, mp, statuses, knockout, team: u.team, retired: false });
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

  const pop = (id: string, text: string | readonly string[], className: string) => {
    const l = labels.get(id);
    if (!l) return;
    const p = document.createElement('div');
    p.className = `popup ${className}`;
    for (const line of typeof text === 'string' ? [text] : text) {
      const span = document.createElement('span');
      span.textContent = line;
      p.append(span);
    }
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
        l.box.classList.toggle('hidden', !a.visible || l.retired);
      }
    },
    addUnit,
    setKnockout(id, count, retired = false, stays = false) {
      const l = labels.get(id);
      if (!l) return;
      l.retired = retired;
      l.box.classList.toggle('down', count !== null && !retired);
      l.knockout.hidden = count === null || retired;
      l.knockout.textContent = count === null ? '' : stays ? TEXT.knockout.badgeStay : TEXT.knockout.badge(count);
      l.knockout.dataset.count = count === null || stays ? '' : String(count);
      if (retired) l.box.classList.add('hidden');
    },
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
    popGain: (id, exp, jp) => pop(id, [TEXT.gain.exp(exp), TEXT.gain.jp(jp)], 'gain'),
    popLevelUp(id, level) {
      pop(id, TEXT.gain.levelUpShort(level), 'levelup');
      // 頭上の表示も一瞬光らせる
      const l = labels.get(id);
      if (!l) return;
      l.box.classList.remove('leveled');
      void l.box.offsetWidth;
      l.box.classList.add('leveled');
    },
    setStatuses(id, statuses) {
      const l = labels.get(id);
      if (!l) return;
      l.statuses.innerHTML = '';
      l.statuses.hidden = statuses.length === 0;
      // 目印は2つまで（同時にたくさん付くと読めなくなるため。フェーズ2-6）。残りは「+N」で、情報の欄ですべて見られる
      for (const st of statuses.slice(0, MAX_STATUS_BADGES)) {
        const badge = document.createElement('span');
        badge.className = `status-badge status-${st}`;
        badge.textContent = TEXT.statusShort[st];
        badge.title = TEXT.statuses[st];
        l.statuses.append(badge);
      }
      if (statuses.length > MAX_STATUS_BADGES) {
        const more = document.createElement('span');
        more.className = 'status-badge status-more';
        more.textContent = TEXT.statusMore(statuses.length - MAX_STATUS_BADGES);
        more.title = TEXT.statusMoreTitle;
        l.statuses.append(more);
      }
    },
  };
}
