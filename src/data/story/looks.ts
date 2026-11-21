/**
 * 人物の見た目（部品を組み合わせた人形。src/render/puppet.ts）。髪の形と色・肌の色・服の形と色・持ち物・体の大きさをデータで書く。
 * 約25人を同じ絵柄でそろえるための土台（序章の場面4の見本の PR で、箱の人形から作り直し、その2回目で、落ち着いた大人の体つき・土の色・衣装の部品に作り替えた）。トウマ・ユナ・父・母は作り込んだ組み合わせ、
 * ほかの人物は同じ仕組みの仮の組み合わせ。
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
  readonly hat?: 'helm' | 'hood' | 'wizard' | 'cap' | 'brim';
  /** 帽子の色（省くと、帽子の種類ごとの決まりの色） */
  readonly hatColor?: number;
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
  /** 腰から下が長い服（外套・長衣）。色は body と同じ（outfit: 'robe' と同じ。古い書き方） */
  readonly robe?: boolean;
  /**
   * 服の形。tunic 短い上着（省いた時）・robe 足もとまでの長衣・coat 前の開いた外套・dress 広がる裾・apron 前掛けつきの作業着
   */
  readonly outfit?: 'tunic' | 'robe' | 'coat' | 'dress' | 'apron';
  /** 肌の色（省くと標準の肌） */
  readonly skin?: number;
  /** 前掛けの色（省くと前掛けなし。outfit が apron なら帯の色） */
  readonly apron?: number;
  /** 目の色（見た目の見本の2回目から使っていない。目はどの人物も同じ暗い色） */
  readonly eyes?: number;
  /** 靴の色（省くと濃い茶） */
  readonly shoes?: number;
  /** ひげの色 */
  readonly beard?: number;
  // ---- 衣装の部品（見た目の見本の2回目。職業と立場が輪郭で分かるように） ----
  /** 背中のマントの色（省くとなし） */
  readonly cloak?: number;
  /** マントの長さ（short 腰まで・省くと膝まで・long 足もとまで） */
  readonly cloakLength?: 'short' | 'long';
  /** 肩掛け（短い肩のマント）の色 */
  readonly mantle?: number;
  /** 頭巾（up かぶる・down 首の後ろに下ろす）。色はマントか肩掛けの色 */
  readonly hood?: 'up' | 'down';
  /** 肩当ての色（革や鉄。省くとなし） */
  readonly pauldrons?: number;
  /** ベルトの色（省くと濃い革） */
  readonly belt?: number;
  /** 腰の袋 */
  readonly pouch?: boolean;
  /** 長靴の色（省くと shoes の色か濃い革） */
  readonly boots?: number;
  /** 手袋の色（省くと素手） */
  readonly gloves?: number;
  /** 袖（rolled まくった袖。前腕が見える） */
  readonly sleeves?: 'rolled';
  /** 襟巻き・襟の色（省くと差し色） */
  readonly scarf?: number;
}

// 色は、彩度を落とした土の色（布・革・くすんだ金属）。人形は描く時にさらに彩度を落とす（puppet.ts の muted）。
// 人物ごとの差し色（accent）は1色まで。ほかの部品（革・鉄・生成り）は、だれも同じ色の帯から選ぶ。
const NAVY = 0x2b3346;
const LEATHER = 0x5e4430;
const LEATHER_DARK = 0x35271d;
const LINEN = 0xc6b898;
const WOOL = 0x6a5e4c;
const IRON = 0x6f7272;

export const LOOKS: Readonly<Record<string, LookDefinition>> = {
  // ---- 隊（操作する仲間） ----
  /** トウマ: 二十歳前後、中背の細身、黒の短髪、時守の濃紺の外套。革の肩当てと手袋、長靴、腰の剣。下ろした頭巾。差し色は襟の鈍い青緑 */
  touma: {
    body: NAVY,
    accent: 0x5c7f80,
    hair: 0x1b1a1e,
    hairStyle: 'messy',
    skin: 0xbd9e88,
    width: 0.96,
    weapon: 'sword',
    outfit: 'coat',
    legs: 0x2e2c2c,
    boots: LEATHER_DARK,
    gloves: LEATHER_DARK,
    pauldrons: LEATHER,
    hood: 'down',
    pouch: true,
  },
  /** ゴード: 大柄、茶の短髪、鈍い赤。鉄の肩当て。背に真鍮の測り棒 */
  gord: {
    body: 0x7a3e34,
    accent: 0x8f7a4c,
    hair: 0x4a3222,
    hairStyle: 'cropped',
    scale: 1.12,
    width: 1.2,
    weapon: 'sword',
    pauldrons: IRON,
    gloves: LEATHER,
    items: [{ model: 'measuringRod', slot: 'back' }],
  },
  /** キリ: 細身、後ろで束ねた髪、深い緑。弓と短いマント */
  kiri: { body: 0x3a5440, accent: 0x7a8a5a, hair: 0x2a2018, hairStyle: 'tied', width: 0.9, weapon: 'bow', cloak: 0x4a4a38, cloakLength: 'short', gloves: LEATHER },
  /** フェン: 小柄、白髪まじり、黒。杖と頭巾つきの長衣 */
  fen: { body: 0x2e2c30, accent: 0x6a5a7a, hair: 0x9a9890, hairStyle: 'short', scale: 0.9, weapon: 'staff', outfit: 'robe', mantle: 0x3a3634, hood: 'down' },
  /** ノノ: ふくよか、栗色の巻き髪、生成り。杖と薬箱 */
  nono: {
    body: LINEN,
    accent: 0x6a8a5a,
    hair: 0x6a4228,
    hairStyle: 'curly',
    width: 1.2,
    weapon: 'staff',
    outfit: 'robe',
    mantle: WOOL,
    items: [{ model: 'medicineBox', slot: 'waist' }],
  },
  // ---- 操作しない人物 ----
  /** ユナ: 十六歳、小柄、黒髪をひとつに結ぶ、油の染みた生成りの作業着。袖をまくり、革の前掛けと腰の袋。差し色は結い紐の赤茶 */
  yuna: {
    body: 0xc9bb9b,
    accent: 0x9a4a32,
    hair: 0x18151a,
    hairStyle: 'tied',
    skin: 0xc6a790,
    scale: 0.86,
    width: 0.92,
    outfit: 'apron',
    apron: 0x5a4230,
    legs: 0x54463a,
    boots: 0x45342a,
    sleeves: 'rolled',
    pouch: true,
    scarf: LEATHER_DARK,
  },
  /** テオ: 十七歳、小柄、柔らかい茶髪、時守の濃紺に白い襟 */
  teo: { body: NAVY, accent: 0xd8d2c0, hair: 0x7a5e44, hairStyle: 'messy', scale: 0.9, width: 0.92, outfit: 'robe', boots: LEATHER_DARK },
  /** イェルマ: 背の高い女、銀の長い髪、塔の白と灰（像に見えないよう、帯と肩掛けは濃い青、髪は服より暗い銀。序章の演出の直し） */
  yelma: { body: 0xd8d0be, accent: 0x34405e, hair: 0x5e5e66, hairStyle: 'long', scale: 1.08, outfit: 'robe', legs: 0x4a5274, mantle: 0x4a4e5e },
  /** ハルド: がっしり、刈り込んだ灰茶の髪、時守の濃紺に銀の留め具。肩当て */
  hald: { body: NAVY, accent: 0x9aa0a8, hair: 0x6a5c4e, hairStyle: 'cropped', width: 1.16, scale: 1.04, outfit: 'coat', pauldrons: IRON, gloves: LEATHER_DARK, boots: LEATHER_DARK },
  /** トウマ（ユナの灯を受け取った後）: 腰に真鍮の灯 */
  toumaLamp: {
    body: NAVY,
    accent: 0x5c7f80,
    hair: 0x1b1a1e,
    hairStyle: 'messy',
    skin: 0xbd9e88,
    width: 0.96,
    weapon: 'sword',
    outfit: 'coat',
    legs: 0x2e2c2c,
    boots: LEATHER_DARK,
    gloves: LEATHER_DARK,
    pauldrons: LEATHER,
    hood: 'down',
    items: [{ model: 'lampSmall', slot: 'waist' }],
  },
  /** ガレス（丘。誓いの剣を手に持つ。折れると「折れた剣」に持ち替える） */
  garethOath: {
    body: 0x8a4038,
    accent: 0x8f7a4c,
    hair: 0xa8905a,
    hairStyle: 'short',
    hat: 'helm',
    scale: 1.12,
    width: 1.15,
    pauldrons: IRON,
    cloak: 0x6a3a32,
    gloves: LEATHER,
    items: [{ model: 'sword', slot: 'hand' }],
  },
  /** ガレス（丘。二十歳過ぎ）: 長身で肩幅が広い、くすんだ金髪、色あせた緋。古い剣と兜、マント */
  gareth: { body: 0x8a4038, accent: 0x8f7a4c, hair: 0xa8905a, hairStyle: 'short', hat: 'helm', scale: 1.12, width: 1.15, weapon: 'sword', pauldrons: IRON, cloak: 0x6a3a32, gloves: LEATHER },
  /** 母: 落ち着いた臙脂の長い服に、生成りの前掛けと毛織の肩掛け。髪は後ろでまとめる。差し色は襟の茜 */
  mother: {
    body: 0x6b4a42,
    accent: 0x8a5040,
    hair: 0x3a2a22,
    hairStyle: 'bun',
    skin: 0xc2a18a,
    scale: 0.95,
    outfit: 'dress',
    apron: 0xbdb091,
    legs: 0x4a3530,
    mantle: 0x6a604e,
    sleeves: 'rolled',
  },
  /** 父: がっしりした体に、苔色の上着と革の帯。袖をまくり、短い髪と短く刈ったひげ。差し色は首の黄土の布 */
  father: {
    body: 0x515a3e,
    accent: 0x8a7040,
    hair: 0x2e261e,
    hairStyle: 'cropped',
    beard: 0x34291f,
    skin: 0xb5937c,
    width: 1.14,
    scale: 1.04,
    legs: 0x4a3e30,
    boots: LEATHER,
    sleeves: 'rolled',
    belt: LEATHER,
    pouch: true,
  },
  /** ミオ: 十四歳、小柄、肩までの黒髪、薬草の緑 */
  mio: { body: 0x56704a, accent: 0xc8c09a, hair: 0x16151a, hairStyle: 'long', scale: 0.84, width: 0.9, sleeves: 'rolled', pouch: true },
  /** パン屋のおかみ（仮） */
  baker: { body: 0xa8724c, accent: 0xd8d0b8, hair: 0x4e3422, hairStyle: 'bun', width: 1.15, outfit: 'dress', apron: LINEN, sleeves: 'rolled' },
  /** 薬屋の老婆（仮） */
  apothecary: { body: 0x5e5468, accent: 0xb8aa8c, hair: 0xc8c6c0, hairStyle: 'bun', scale: 0.86, outfit: 'robe', mantle: WOOL },
  /** 商会の売り子（仮） */
  vendor: { body: 0xa88a3a, accent: 0x8a3a30, hair: 0x3a2a1a, hairStyle: 'short', hat: 'cap', apron: LEATHER },
  /** 堰の番兵（仮）。槍 */
  guard: { body: 0x5e5e50, accent: 0x7a6a48, hat: 'helm', weapon: 'spear', pauldrons: IRON, gloves: LEATHER, cloak: 0x4a4a3e, cloakLength: 'short' },
  /** 堰の番兵（仮）。弓 */
  guardBow: { body: 0x5e5e50, accent: 0x7a6a48, hat: 'hood', hatColor: 0x4a4a3e, weapon: 'bow', gloves: LEATHER },
  /** 丘の衛士（仮）。氏族の兵 */
  sentinel: { body: 0x6a4a3a, accent: 0xa89878, hat: 'helm', weapon: 'spear', pauldrons: LEATHER, cloak: 0x5a4a3a, cloakLength: 'short' },
  /** 堰を積む男たち・氏族の人々・都の人（仮。色違い） */
  worker: { body: 0x847660, accent: 0x5e4e36, hair: 0x3a2a1a, hairStyle: 'cropped', width: 1.08, sleeves: 'rolled' },
  clanA: { body: 0x7a5238, accent: 0xa8905a, hair: 0x2a2018, hairStyle: 'short', mantle: WOOL },
  clanB: { body: 0x4a6052, accent: 0xa8908a, hair: 0x4a3a2a, hairStyle: 'long', outfit: 'robe' },
  clanC: { body: 0x5e4a5e, accent: 0xb8a882, hair: 0x1a1a1a, hairStyle: 'braid', cloak: WOOL, cloakLength: 'short' },
  clanD: { body: 0x86704a, accent: 0x5a3a2a, hair: 0x6a4a2a, hairStyle: 'cropped', width: 1.1, sleeves: 'rolled' },
  /** 家までの道の見知らぬ男（店を持てた礼を言う。仮） */
  stranger: { body: 0x6a5244, accent: 0xa8905a, hair: 0x2a2018, hairStyle: 'short', width: 1.04, legs: 0x4a3a2a, hat: 'brim', apron: LEATHER },
  townsman: { body: 0x6a5e50, accent: 0xb8aa8c, hair: 0x3a3028, hairStyle: 'short' },
  // ---- 物語の土台の試しの場面の人物（今は使っていない） ----
  instructor: { body: 0x4a5468, accent: 0xa8905a, hair: 0x8a8a8a, hairStyle: 'short' },
  apprentice: { body: 0x6a8050, accent: 0xc8bc9a, hair: 0x5a3a20, hairStyle: 'messy' },
};

/** ここにない人物のふつうの見た目 */
export const DEFAULT_LOOK: LookDefinition = { body: 0x7a6c5c, accent: 0xa89a80, hair: 0x3a3028, hairStyle: 'short' };
