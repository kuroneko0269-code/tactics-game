import type { PuppetLook } from './puppet';

/**
 * 会話の場面の人物の見た目（仮の人形の色と持ち物。物語の土台）。id は src/data/story/stageDefs.ts の ACTOR_LOOKS。
 * 色は設計書の「3-2. キャラクター設定」の仮の服の色に寄せた。ここにない人物は、ふつうの人の見た目。
 */
export const ACTOR_LOOKS: Readonly<Record<string, PuppetLook>> = {
  touma: { body: 0x1f2f5a, accent: 0x5fd0e0, weapon: 'sword' },
  yuna: { body: 0xe8dcc0, accent: 0xc9a24a, weapon: 'none', hair: 0x1a1a1a },
  mother: { body: 0x9a6a5a, accent: 0xe8d8b0, weapon: 'none', hair: 0x4a3a30 },
  father: { body: 0x5a6a4a, accent: 0xc8b890, weapon: 'none', hair: 0x3a3028 },
  hald: { body: 0x1f2f5a, accent: 0xc0c8d8, weapon: 'none', hair: 0x7a6a5a },
  teo: { body: 0x1f2f5a, accent: 0xf4f1e8, weapon: 'staff' },
  yelma: { body: 0xd8d8e0, accent: 0x8a8a96, weapon: 'none', hair: 0xc8c8d8 },
  gord: { body: 0x8a3a30, accent: 0xf2c14e, weapon: 'sword' },
  kiri: { body: 0x2f5a3a, accent: 0x8fd66b, weapon: 'bow' },
  fen: { body: 0x2a2a30, accent: 0x8a5cf0, weapon: 'staff' },
  nono: { body: 0xe8e0c8, accent: 0xf4f1e8, weapon: 'staff' },
  instructor: { body: 0x4a5a7a, accent: 0xf2c14e, weapon: 'none', hair: 0x8a8a8a },
  apprentice: { body: 0x7a9a5a, accent: 0xe8d8b0, weapon: 'none', hair: 0x5a3a20 },
};

export const DEFAULT_ACTOR_LOOK: PuppetLook = { body: 0x8a7a6a, accent: 0xd8c8a8, weapon: 'none', hair: 0x3a3028 };
