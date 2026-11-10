import type { Roster } from '../core/progression';

/**
 * 最初の部隊（はじめから遊ぶ時の5人）。今の版でできることがそのままできる状態で始める
 * （魔術師は「風」と「炎」、癒し手は「癒し」を習得済み）。名前は src/ui/text.ts に id で引けるようにまとめている。
 */
const noSlots = { secondary: null, reaction: null, support: null, movement: null };
const fresh = { level: 1, exp: 0, growth: { maxHp: 0, maxMp: 0, attack: 0, magic: 0, speed: 0 }, slots: noSlots };

export const initialRoster: Roster = {
  units: [
    { id: 'hero-1', jobId: 'warrior', ...fresh, jobs: { warrior: { jp: 0, jpTotal: 0, learned: [] } } },
    { id: 'hero-2', jobId: 'warrior', ...fresh, jobs: { warrior: { jp: 0, jpTotal: 0, learned: [] } } },
    { id: 'hero-3', jobId: 'archer', ...fresh, jobs: { archer: { jp: 0, jpTotal: 0, learned: [] } } },
    { id: 'hero-4', jobId: 'mage', ...fresh, jobs: { mage: { jp: 0, jpTotal: 0, learned: ['wind', 'fire'] } } },
    { id: 'hero-5', jobId: 'healer', ...fresh, jobs: { healer: { jp: 0, jpTotal: 0, learned: ['heal'] } } },
  ],
};
