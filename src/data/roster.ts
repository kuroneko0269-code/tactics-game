import type { Roster } from '../core/progression';
import { characterIds as c } from './characters';
import { startingGold } from './equipment';

/**
 * 最初の部隊（はじめから遊ぶ時の5人）。今の版でできることがそのままできる状態で始める
 * （魔道士は「風」と「炎」、治癒師は「癒し」を習得済み）。名前は src/ui/text.ts に id で引けるようにまとめている。
 * ユニットの id は人物の変わらない id（characters.ts。フェーズ2-6）。トウマは専用ジョブ「時守」（斬り分けを習得済み）から始まる。
 * 装備（フェーズ2-4）: 全員が今のジョブの1段階目の武器と防具（equipment.ts の starterEquipment）を付けて始める。所持金は startingGold。
 */
const noSlots = { secondary: null, reaction: null, support: null, movement: null };
const fresh = { level: 1, exp: 0, growth: { maxHp: 0, maxMp: 0, attack: 0, magic: 0, speed: 0 }, slots: noSlots };
const gear = (weapon: string, armor: string) => ({ weapon, armor, accessory: null });

export const initialRoster: Roster = {
  units: [
    { id: c.touma, jobId: 'timekeeper', ...fresh, jobs: { timekeeper: { jp: 0, jpTotal: 0, learned: ['sweep'] } }, equipment: gear('i1', 'i2') },
    { id: c.gord, jobId: 'warrior', ...fresh, jobs: { warrior: { jp: 0, jpTotal: 0, learned: [] } }, equipment: gear('i3', 'i4') },
    { id: c.kiri, jobId: 'archer', ...fresh, jobs: { archer: { jp: 0, jpTotal: 0, learned: [] } }, equipment: gear('i5', 'i6') },
    { id: c.fen, jobId: 'mage', ...fresh, jobs: { mage: { jp: 0, jpTotal: 0, learned: ['wind', 'fire'] } }, equipment: gear('i7', 'i8') },
    { id: c.nono, jobId: 'healer', ...fresh, jobs: { healer: { jp: 0, jpTotal: 0, learned: ['heal'] } }, equipment: gear('i9', 'i10') },
  ],
  gold: startingGold,
  items: [
    { uid: 'i1', itemId: 'sword-1' },
    { uid: 'i2', itemId: 'heavy-1' },
    { uid: 'i3', itemId: 'sword-1' },
    { uid: 'i4', itemId: 'heavy-1' },
    { uid: 'i5', itemId: 'bow-1' },
    { uid: 'i6', itemId: 'light-1' },
    { uid: 'i7', itemId: 'staff-1' },
    { uid: 'i8', itemId: 'robe-1' },
    { uid: 'i9', itemId: 'staff-1' },
    { uid: 'i10', itemId: 'robe-1' },
  ],
  nextItemSeq: 11,
};
