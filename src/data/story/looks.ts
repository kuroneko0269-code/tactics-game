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
  /**
   * KayKit の体で作る時の見た目（KayKit の人形の試し。src/render/kaykit.ts）。書いた人物だけが、設定の「人形：KayKit」で KayKit の体になる。
   * 今は序章の場面4の4人だけ
   */
  readonly kaykit?: KayKitLook;
}

/** KayKit の土台の体（素材の5人のうち、服の形が違う3人の体。docs/KAYKIT.md） */
export type KayKitBase = 'rogue' | 'mage' | 'barbarian';
/** KayKit の頭（素材の4人の頭。knight 短い髪・rogue 中くらいの長さの髪・mage 長い髪・barbarian はげ頭とひげ） */
export type KayKitHead = 'knight' | 'barbarian' | 'rogue' | 'mage';

/**
 * KayKit の体で作る人物の見た目。体・骨・動きは KayKit のまま使い、髪・かぶり物・マント・肩掛け・前掛けと色だけを自作する。
 * 色は、彩度を落とした土の色に寄せる（描く時にさらに彩度を落とす）。人物ごとの差し色（accent）は1色まで
 */
export interface KayKitLook {
  /** 土台の体（rogue 短い上着と革の籠手・mage 膝までの長衣・barbarian がっしりした体と毛皮の縁） */
  readonly base: KayKitBase;
  /** 顔の頭（knight・rogue・mage は髪と一体の頭、barbarian ひげのはげ頭。省くと knight） */
  readonly head?: KayKitHead;
  /** 背丈の倍率（1 が大人。体を小さくする時は、頭も同じ割合で小さくなる） */
  readonly height?: number;
  /** 頭の大きさの倍率（1 がふつう。小さくすると、頭と体の比が大人に近づく） */
  readonly headScale?: number;
  /** 肩幅の倍率（1 がふつう） */
  readonly width?: number;
  /** 肌の色 */
  readonly skin: number;
  /** 服の主な色 */
  readonly cloth: number;
  /** 服の2つ目の色（襟・袖。省くと服の色を少し暗く） */
  readonly cloth2?: number;
  /** 縁取りの色（裾・毛皮の縁。省くと生成り） */
  readonly trim?: number;
  /** 革（帯・籠手）の色 */
  readonly leather?: number;
  /** ズボンの色 */
  readonly pants?: number;
  /** 靴の色 */
  readonly boots?: number;
  /** 髪の形と色（束のある形。short 短い・tied 後ろで結ぶ・bun まとめ髪・cropped 刈り込み）。ひげの頭では、ひげも同じ色 */
  readonly hair: {
    /** 作者が頭と一体で作った髪のどれを使うか（knight 短い・rogue 中くらいの長さ・mage 長い） */
    readonly kit: Exclude<KayKitHead, 'barbarian'>;
    readonly color: number;
    /**
     * 自作で足す、なめらかな大きな塊（bun 後ろのまとめ・twinTails 二つ結びのおさげ・ponytail 後ろで1つに結んだ房・forelock 垂れた前髪の1房（うつむくと垂れる）・
     * flicks 寝かせた毛先（耳の後ろと後ろ頭の裾の、毛先だけ少し跳ねる平たい房）・flareUp 跳ねた短い髪（見比べ用の仮の頭だけ）・
     * pin 前髪の横の丸い金具の髪留め・bows 結び目の小さなリボン・flower 耳の上の小さな花の髪飾り・goggles 頭に上げた作業用の眼鏡（帯は前掛けの色、枠は accentB））
     */
    readonly extras?: readonly ('bun' | 'twinTails' | 'ponytail' | 'forelock' | 'flicks' | 'flareUp' | 'pin' | 'bows' | 'flower' | 'goggles')[];
    /** 作者の髪の形を変える（長さ・量・前髪・分け目・立たせる） */
    readonly shape?: KayKitHairShape;
    /** 二つ結びの房の形（twinTails の時。省くと胸の前へ下ろす元の形） */
    readonly tails?: KayKitTails;
  };
  /** かぶり物（hood 頭巾・hat 帽子） */
  readonly headwear?: { readonly kind: 'hood' | 'hat'; readonly color: number };
  /** 背のマント・外套（long 足もとまで・knee 膝まで・short 腰まで）。hoodDown で首の後ろに下ろした頭巾を付ける。edge で襟と裾に細い縁（色は accentB）。front で前にも身頃を付ける（前の開きに縁） */
  readonly cloak?: { readonly color: number; readonly length: 'long' | 'knee' | 'short'; readonly hoodDown?: boolean; readonly edge?: boolean; readonly front?: boolean };
  /** 肩掛けの色 */
  readonly mantle?: number;
  /** 前掛け（bib で胸当てつき） */
  readonly apron?: { readonly color: number; readonly bib?: boolean };
  /** 差し色（結い紐・襟巻き・首の布。1色まで） */
  readonly accent?: number;
  /** 2つ目の差し色（外套の細い縁・胸の印・髪飾りの金具） */
  readonly accentB?: number;
  /** 首に巻いた小さな三角の布（差し色。前で結ぶ） */
  readonly neckerchief?: boolean;
  /** 胸か肩の丸い印（色は accentB） */
  readonly emblem?: 'chest' | 'shoulder';
  /** スカート（腰から膝の上まで。脚の動きに付いてくる） */
  readonly skirt?: { readonly color: number };
  /** 袖をまくる（rogue の体だけ。肘から先を肌にし、肘にまくった袖の帯を見せる） */
  readonly sleeves?: 'rolled';
  /** 手の色（rogue の体だけ。省くと革の手袋。素手の時は、肌の色に油の汚れを混ぜた色にする） */
  readonly hands?: number;
  /** 服と手の油染み（色の画像の、服・ズボン・手の区画に、暗い染みを描く） */
  readonly stains?: boolean;
  /** 腰の工具（腰の帯に下げた革の袋と、金槌・ねじ回し） */
  readonly tools?: boolean;
  /**
   * 顔（目と眉は顔の面に沿わせて描く。省くと落ち着いた大人の目と、ふつうの太さの眉）。eyes: 'large' で少し大きくまつ毛のある目、'narrow' で切れ長の目、iris で瞳の色、
   * round で輪郭を丸く、slim で目より下を細く（0.1 で 1 割）、blush で頬の赤み、brows で眉の太さ、browLift で眉の高さ
   */
  readonly face?: {
    readonly eyes?: 'large' | 'narrow';
    readonly iris?: number;
    readonly round?: boolean;
    readonly slim?: number;
    readonly blush?: boolean;
    readonly brows?: 'thin' | 'normal' | 'thick';
    /** 眉の高さ（負で目に近づける。素材の頭の座標で） */
    readonly browLift?: number;
  };
}

/** 作者の髪の形の変え方（src/render/kaykit.ts の reshapeHair） */
export interface KayKitHairShape {
  /** 耳の上より下の長さの割合（1 がそのまま。前髪は変えない） */
  readonly length?: number;
  /** 量（頭の中心から外へふくらませる割合。1 がそのまま） */
  readonly volume?: number;
  /** 前髪の長さの割合（1 がそのまま。1 より大きいと額へ下ろす） */
  readonly fringe?: number;
  /** 分け目を左右反対にする */
  readonly mirror?: boolean;
  /** 立たせる量（頭のてっぺんの髪を上へ伸ばす。0 がそのまま） */
  readonly lift?: number;
  /**
   * 向きごとの長さ（length の代わり。[向き（度。0 が正面、90 が左の耳）, 長さの割合] の組を、ぐるりと補って使う）。
   * 耳の上を短く、もみあげとえり足を長くして、縁の高さを不ぞろいにする（0〜360 度をぐるりと書くので、左右を変えられる）
   */
  readonly hem?: readonly (readonly [number, number])[];
  /** 生え際から毛先へ向かう浅い溝（[向き, 高さ]（度）の点の列・深さ・幅（度）） */
  readonly grooves?: readonly { readonly path: readonly (readonly [number, number])[]; readonly depth: number; readonly width: number }[];
  /**
   * 大きな塊に分ける段差。面（向き・高さ（度）で表す向きの、頭の中心からの平面）より下の側を、step だけ内へ下げる。
   * wave で境目を波打たせる（[振れ幅（度）, 回数]）
   */
  readonly steps?: readonly { readonly az: number; readonly el: number; readonly offset: number; readonly step: number; readonly wave?: readonly [number, number] }[];
  /** 形を細かくする回数（溝と段差を出すため。0〜2） */
  readonly subdivide?: number;
}

/** 二つ結びの房の形（右の房で書く。左は左右を反対にする） */
export interface KayKitTails {
  /** 結び目の位置（縮める前の頭の座標） */
  readonly tie: readonly [number, number, number];
  /** 結び目から先の房の通り道（頭を縮めた後の体の座標） */
  readonly path: readonly (readonly [number, number, number])[];
  /** 根もとの太さ・いちばん太い所の太さ（根もとからの増え）・先の細り（1 で先がほぼ点） */
  readonly root: number;
  readonly bulge?: number;
  readonly taper?: number;
  /** 断面のつぶれ（1 で丸） */
  readonly flat?: number;
  /** 結び目のひもの垂れ（長さ。0 で輪だけ） */
  readonly strings?: number;
  /** 胸の骨に付けるか（肩より下まで垂れる時） */
  readonly chest?: boolean;
}

// 色は、彩度を落とした土の色（布・革・くすんだ金属）。人形は描く時にさらに彩度を落とす（puppet.ts の muted）。
// 人物ごとの差し色（accent）は1色まで。ほかの部品（革・鉄・生成り）は、だれも同じ色の帯から選ぶ。
const NAVY = 0x2b3346;
const LEATHER = 0x5e4430;
const LEATHER_DARK = 0x35271d;
const LINEN = 0xc6b898;
const WOOL = 0x6a5e4c;
const IRON = 0x6f7272;

/** トウマの KayKit の見た目: 時守の濃紺の外套（足もとまで。首の後ろに下ろした頭巾）、黒の短髪。差し色は襟の鈍い青緑 */
const TOUMA_KAYKIT: KayKitLook = {
  base: 'rogue',
  // 顔は髪と同じ rogue の頭（knight の頭は rogue の髪より頭頂が高く、髪から肌が透けるため）
  head: 'rogue',
  skin: 0xbd9e88,
  cloth: 0x2e3546,
  cloth2: 0x262c3a,
  trim: 0x3a4152,
  leather: LEATHER_DARK,
  pants: 0x2e2c2c,
  boots: LEATHER_DARK,
  // 青年らしく（場面4の顔の直し。設計書「二十歳前後・中背の細身・黒の短髪」）: 作者の中くらいの長さの髪（rogue）を、横と後ろを短くし、
  // 分け目をユナと反対にして使う（前髪が額にかかり、生え際が下がる）。色は、外套と分かれて見えるように、真っ黒より明るく暖かい黒。
  // 垂れた前髪の1房は、うつむくと目元にかかる（気持ちを見せる手段）。毛先は立てずに寝かせ、横と後ろの裾だけ少し跳ねる
  // （2026-11-22 物語の担当の決定。立った毛先は元気で熱い主人公に見えやすく、後で作るジンの跳ねた髪ともかぶるため）
  // 色は黒に寄せた（観客の検査: 5人とも茶色と答えた）。外套の濃紺より暗く、暖かい黒
  hair: { kit: 'rogue', color: 0x2a2224, shape: { length: 0.22, mirror: true }, extras: ['forelock', 'flicks'] },
  // 切れ長の目と、目に近いまっすぐな眉（怒った角度にしない）。あごを細く
  face: { eyes: 'narrow', brows: 'normal', browLift: -0.01, slim: 0.1 },
  width: 0.9,
  // 外套は、今の人形の濃紺より少し明るく（夜の部屋で、髪と外套が1つの黒い塊に見えないように。観客の検査）
  cloak: { color: 0x34405a, length: 'long', hoodDown: true },
  accent: 0x5c7f80,
};

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
    kaykit: TOUMA_KAYKIT,
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
  /** ユナ: 十六歳、小柄、黒髪の二つ結びのおさげ、油の染みた生成りの作業着。袖をまくり、革の前掛けと腰の工具。差し色は結い紐の赤茶 */
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
    kaykit: {
      base: 'rogue',
      head: 'rogue',
      // 十代半ばに見えるように（10歳前後に見えないように）: 背丈を少し高く（トウマ 1・母 0.97 より低いまま）、頭を少し小さく（頭と体の比をほかの3人に近づける）
      height: 0.9,
      headScale: 0.93,
      width: 0.94,
      skin: 0xc8a993,
      // 生成りの作業着（上着もズボンも生成り。スカートはやめた）。袖をまくり、素手。服と手に油染み。腰に工具
      cloth: 0xd2c3a3,
      cloth2: 0xb9a888,
      leather: 0x6a4e38,
      pants: 0xb4a284,
      boots: 0x4e3a2e,
      sleeves: 'rolled',
      hands: 0xbc9c84,
      stains: true,
      tools: true,
      // 二つ結びのおさげ（2026-11-22 ゲームの人形で決定）。肩より下まで下ろす
      // 前髪は少し短く（観客の検査: 夕食の画で、前髪が片目にかかって眠そう・無表情に見えた）
      hair: { kit: 'rogue', color: 0x1e1a1e, shape: { fringe: 0.8 }, extras: ['twinTails'] },
      apron: { color: 0x6e5038 },
      accent: 0xa4503a,
      // 少し大きい目とまつ毛（可愛さは残す）。輪郭は丸すぎないように（丸い輪郭はやめ、ほんの少し細く）
      face: { eyes: 'large', iris: 0x553624, slim: 0.03, blush: true, brows: 'thin', browLift: 0.012 },
    },
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
    kaykit: TOUMA_KAYKIT,
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
    kaykit: {
      base: 'mage',
      head: 'mage',
      height: 0.97,
      skin: 0xc2a18a,
      cloth: 0x6b4a42,
      cloth2: 0x5a3e38,
      trim: 0x8a5040,
      leather: 0x4a3530,
      pants: 0x4a3530,
      boots: 0x3e2e26,
      hair: { kit: 'mage', color: 0x3a2a22, extras: ['bun'] },
      face: { brows: 'thin' },
      mantle: 0x6a604e,
      apron: { color: 0xbdb091, bib: true },
    },
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
    kaykit: {
      base: 'barbarian',
      head: 'barbarian',
      height: 1.03,
      width: 1.06,
      skin: 0xb5937c,
      // 観客の検査: 後ろ姿のトウマと見分けられるよう、トウマより明るい苔色・茶の髪にした
      cloth: 0x6e7a4c,
      cloth2: 0x5a6440,
      trim: 0x9a8a6e,
      leather: LEATHER,
      pants: 0x4a3e30,
      boots: LEATHER_DARK,
      hair: { kit: 'knight', color: 0x5a4430 },
      accent: 0x8a7040,
    },
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

/**
 * KayKit の人形を試す場面（物語の場面の id。KayKit の人形の試し）。設定が「KayKit」の時、この場面だけ、
 * 見た目に kaykit がある人物を KayKit の人形にする。序章全体と戦闘の駒には、まだ広げない
 */
export const KAYKIT_TRIAL_SCENES: readonly string[] = ['home'];

/** ここにない人物のふつうの見た目 */
export const DEFAULT_LOOK: LookDefinition = { body: 0x7a6c5c, accent: 0xa89a80, hair: 0x3a3028, hairStyle: 'short' };
