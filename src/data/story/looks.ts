/**
 * 人物の見た目（仮の人形。序章に足りない仕組み）。箱を組み合わせた人形の、体の大きさ・服の色・髪・持ち物をデータで書く。
 * 色と体つきは docs/story/design.md の「3-2. キャラクター設定」の外見（多くは「仮」）に寄せた。作り込んだ 3D モデルは後のフェーズ。
 * 会話の場面では、台本の名前 → stageDefs.ts の ACTOR_LOOKS → ここの見た目、の順に引く。
 * 戦闘では、部隊の人物はユニットの id（人物の id）で、ほかは戦場の定義の looks（ユニットの id → 見た目の名前）で引く。
 * 見た目を足す時は、ここに1つ足し、台本で使う名前を stageDefs.ts の ACTOR_LOOKS に足す。
 */

/** 持ち物を付ける所（右手・左手・腰・背） */
export type LookItemSlot = 'hand' | 'handL' | 'waist' | 'back';

export interface LookDefinition {
  /** 服の主な色 */
  readonly body: number;
  /** 帯・襟・帽子の色 */
  readonly accent: number;
  /** 髪の色（省くと、帽子をかぶった兵の見た目） */
  readonly hair?: number;
  /** 髪の形 */
  readonly hairStyle?: 'short' | 'tied' | 'long' | 'bun' | 'curly' | 'messy' | 'braid' | 'cropped';
  /** 帽子（省くと、髪だけ） */
  readonly hat?: 'helm' | 'hood' | 'wizard' | 'cap';
  /** 背の高さの倍率（1 がふつう。大柄なら 1.1、小柄なら 0.9 など） */
  readonly scale?: number;
  /** 体の幅の倍率（1 がふつう。がっしり・ふくよかなら大きく、細身なら小さく） */
  readonly width?: number;
  /** 手に持つ武器（省くと持たない） */
  readonly weapon?: 'sword' | 'bow' | 'staff' | 'spear';
  /** 足（ズボン）の色。省くと濃い茶 */
  readonly legs?: number;
  /** 持ち物（物の見た目の id。models.ts） */
  readonly items?: readonly { readonly model: string; readonly slot: LookItemSlot }[];
  /** 腰から下が長い服（外套・長衣）。色は body と同じ */
  readonly robe?: boolean;
  /** 白いひげ（塔の長など） */
  readonly beard?: number;
}

const NAVY = 0x1f2a4a;

export const LOOKS: Readonly<Record<string, LookDefinition>> = {
  // ---- 隊（操作する仲間） ----
  /** トウマ: 二十歳前後、中背の細身、黒の短髪、時守の濃紺の外套 */
  touma: { body: NAVY, accent: 0x5fd0e0, hair: 0x15151a, hairStyle: 'short', width: 0.92, weapon: 'sword', robe: true, legs: 0x2a2a30 },
  /** ゴード: 大柄、茶の短髪、鈍い赤。背に真鍮の測り棒 */
  gord: {
    body: 0x8a3a30,
    accent: 0xc9a24a,
    hair: 0x5a3a22,
    hairStyle: 'cropped',
    scale: 1.14,
    width: 1.22,
    weapon: 'sword',
    items: [{ model: 'measuringRod', slot: 'back' }],
  },
  /** キリ: 細身、後ろで束ねた髪、深い緑。弓 */
  kiri: { body: 0x2f5a3a, accent: 0x8fd66b, hair: 0x2a2018, hairStyle: 'tied', width: 0.86, weapon: 'bow' },
  /** フェン: 小柄、白髪まじり、黒。杖 */
  fen: { body: 0x26262c, accent: 0x8a5cf0, hair: 0xa8a8a4, hairStyle: 'short', scale: 0.88, weapon: 'staff', robe: true },
  /** ノノ: ふくよか、栗色の巻き髪、生成り。杖と薬箱 */
  nono: {
    body: 0xe8e0c8,
    accent: 0x7aa86a,
    hair: 0x7a4a2a,
    hairStyle: 'curly',
    width: 1.22,
    weapon: 'staff',
    items: [{ model: 'medicineBox', slot: 'waist' }],
  },
  // ---- 操作しない人物 ----
  /** ユナ: 十六歳、小柄、黒髪をひとつに結ぶ、油の染みた生成りの作業着 */
  yuna: { body: 0xd8ccb0, accent: 0x8a6a3a, hair: 0x15151a, hairStyle: 'tied', scale: 0.88, width: 0.9, legs: 0x5a4a3a, items: [{ model: 'pouch', slot: 'waist' }] },
  /** テオ: 十七歳、小柄、柔らかい茶髪、時守の濃紺に白い襟 */
  teo: { body: NAVY, accent: 0xf4f1e8, hair: 0x8a6a4a, hairStyle: 'messy', scale: 0.9, width: 0.9, robe: true },
  /** イェルマ: 背の高い女、銀の長い髪、塔の白と灰（像に見えないよう、帯は濃い青、髪は服より暗い銀。序章の演出の直し） */
  // 初見の検査で「像に見える」と言われたので、服を温かい白に、帯と裾を濃くして、髪と服の色を分ける
  yelma: { body: 0xebe3d2, accent: 0x34447a, hair: 0x5e5e70, hairStyle: 'long', scale: 1.1, robe: true, legs: 0x4a5274 },
  /** ハルド: がっしり、刈り込んだ灰茶の髪、時守の濃紺に銀の留め具 */
  hald: { body: NAVY, accent: 0xc0c8d8, hair: 0x7a6a5a, hairStyle: 'cropped', width: 1.16, scale: 1.04, robe: true },
  /** トウマ（ユナの灯を受け取った後）: 腰に真鍮の灯 */
  toumaLamp: {
    body: NAVY,
    accent: 0x5fd0e0,
    hair: 0x15151a,
    hairStyle: 'short',
    width: 0.92,
    weapon: 'sword',
    robe: true,
    legs: 0x2a2a30,
    items: [{ model: 'lampSmall', slot: 'waist' }],
  },
  /** ガレス（丘。誓いの剣を手に持つ。折れると「折れた剣」に持ち替える） */
  garethOath: { body: 0xa8403a, accent: 0xc9a24a, hair: 0xc8a85a, hairStyle: 'short', hat: 'helm', scale: 1.12, width: 1.15, items: [{ model: 'sword', slot: 'hand' }] },
  /** ガレス（丘。二十歳過ぎ）: 長身で肩幅が広い、くすんだ金髪、色あせた緋。古い剣と兜 */
  gareth: { body: 0xa8403a, accent: 0xc9a24a, hair: 0xc8a85a, hairStyle: 'short', hat: 'helm', scale: 1.12, width: 1.15, weapon: 'sword' },
  /** 母（仮） */
  mother: { body: 0x9a6a5a, accent: 0xe8d8b0, hair: 0x4a3a30, hairStyle: 'bun', scale: 0.95, robe: true, legs: 0x9a6a5a },
  /** 父（仮） */
  father: { body: 0x5a6a4a, accent: 0xc8b890, hair: 0x3a3028, hairStyle: 'cropped', width: 1.05 },
  /** ミオ: 十四歳、小柄、肩までの黒髪、薬草の緑 */
  mio: { body: 0x5a7a44, accent: 0xd8d0a0, hair: 0x15151a, hairStyle: 'long', scale: 0.84, width: 0.88 },
  /** パン屋のおかみ（仮） */
  baker: { body: 0xc87a4a, accent: 0xf4f1e8, hair: 0x5a3a22, hairStyle: 'bun', width: 1.15, robe: true, legs: 0xc87a4a },
  /** 薬屋の老婆（仮） */
  apothecary: { body: 0x6a5a7a, accent: 0xd8c8a8, hair: 0xe0e0e0, hairStyle: 'bun', scale: 0.86, robe: true, legs: 0x6a5a7a },
  /** 商会の売り子（仮） */
  vendor: { body: 0xc8a030, accent: 0xa02a2a, hair: 0x3a2a1a, hairStyle: 'short', hat: 'cap' },
  /** 堰の番兵（仮）。槍 */
  guard: { body: 0x6a6a5a, accent: 0x9a8a5a, hat: 'helm', weapon: 'spear' },
  /** 堰の番兵（仮）。弓 */
  guardBow: { body: 0x6a6a5a, accent: 0x9a8a5a, hat: 'hood', weapon: 'bow' },
  /** 丘の衛士（仮）。氏族の兵 */
  sentinel: { body: 0x7a4a3a, accent: 0xc8b890, hat: 'helm', weapon: 'spear' },
  /** 堰を積む男たち・氏族の人々・都の人（仮。色違い） */
  worker: { body: 0x9a8a6a, accent: 0x6a5a3a, hair: 0x3a2a1a, hairStyle: 'cropped', width: 1.08 },
  clanA: { body: 0x8a5a3a, accent: 0xd8c070, hair: 0x2a2018, hairStyle: 'short' },
  clanB: { body: 0x4a6a5a, accent: 0xc8a8a0, hair: 0x4a3a2a, hairStyle: 'long', robe: true },
  clanC: { body: 0x6a4a6a, accent: 0xe0d0a0, hair: 0x1a1a1a, hairStyle: 'braid' },
  clanD: { body: 0x9a7a4a, accent: 0x5a3a2a, hair: 0x6a4a2a, hairStyle: 'cropped', width: 1.1 },
  /** 家までの道の見知らぬ男（店を持てた礼を言う。仮） */
  stranger: { body: 0x7a5a4a, accent: 0xe8c070, hair: 0x2a2018, hairStyle: 'short', width: 1.04, legs: 0x4a3a2a },
  townsman: { body: 0x7a6a5a, accent: 0xd8c8a8, hair: 0x3a3028, hairStyle: 'short' },
  // ---- 物語の土台の試しの場面の人物（今は使っていない） ----
  instructor: { body: 0x4a5a7a, accent: 0xf2c14e, hair: 0x8a8a8a, hairStyle: 'short' },
  apprentice: { body: 0x7a9a5a, accent: 0xe8d8b0, hair: 0x5a3a20, hairStyle: 'messy' },
};

/** ここにない人物のふつうの見た目 */
export const DEFAULT_LOOK: LookDefinition = { body: 0x8a7a6a, accent: 0xd8c8a8, hair: 0x3a3028, hairStyle: 'short' };
