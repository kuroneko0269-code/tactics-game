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
  /**
   * 顔の絵（台詞の枠の顔の丸）。public/portraits/<picture>.webp（発注者の立ち絵から scripts/portraits-prepare.py で切り抜く）。
   * KayKit の人形を見せている場面（序章の場面4）でだけ、人形を写した顔の代わりに使う
   */
  readonly picture?: string;
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
  /** 背丈と肩幅の倍率を体だけに掛ける（頭はどの人物も同じ大きさにし、headScale だけで変える。大柄・小柄でも頭が大きく・小さく見えないように） */
  readonly bodyOnly?: boolean;
  /** 頭の横幅と前後の倍率（1 がふつう。小さくすると顔が細く見える） */
  readonly headWidth?: number;
  /** 腕と脚の太さの倍率（1 がそのまま。骨の軸のまわりで細くする） */
  readonly limbs?: number;
  /** KayKit の体で持つ物（省くと見た目の items。今の人形は武器を weapon で持つので、KayKit の体だけ武器を持ち物で持たせる） */
  readonly items?: readonly { readonly model: string; readonly slot: LookItemSlot }[];
  /** 胴の太さの倍率（1 がそのまま。腰・背骨・胸に付く点を、体の縦の軸のまわりで細くする。胴に付いた外套なども一緒に細くなる） */
  readonly torso?: number;
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
  /** 素材の金具の区画の色（帯の金具・長衣の袖口。省くと鉄の色） */
  readonly metal?: number;
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
  /** 前掛け（bib で胸当てつき・straps で胸当ての肩紐・length で丈（knee 膝の下・ankle 足首の上。省くと腿まで）・tie で前の結び目と垂れた端） */
  readonly apron?: { readonly color: number; readonly bib?: boolean; readonly straps?: boolean; readonly length?: 'knee' | 'ankle'; readonly tie?: boolean };
  /** 差し色（結い紐・襟巻き・首の布。1色まで） */
  readonly accent?: number;
  /** 2つ目の差し色（外套の細い縁・胸の印・髪飾りの金具） */
  readonly accentB?: number;
  /** 首に巻いた小さな三角の布（差し色。前で結ぶ） */
  readonly neckerchief?: boolean;
  /** 胸か肩の丸い印（色は accentB） */
  readonly emblem?: 'chest' | 'shoulder';
  /** スカート（腰から膝の上まで。脚の動きに付いてくる。length: 'ankle' で足首まで） */
  readonly skirt?: { readonly color: number; readonly length?: 'knee' | 'ankle' };
  /** 肩の短い外套（肘までの、前の開いたケープ。edge で裾と前の開きに細い縁（accentB）） */
  readonly capelet?: { readonly color: number; readonly edge?: boolean };
  /** 右の肩から左の腰へ斜めに掛けた革帯（革の色）と、胸の金具（真鍮） */
  readonly baldric?: boolean;
  /** 左の腰に下げた、鞘に入った剣（鞘は革の暗い色、柄と鍔は真鍮） */
  readonly scabbard?: boolean;
  /** 脚の筒（膝の下から足首まで。boots 長靴の筒（cuff で上を折り返す）・wraps 巻き布（帯を重ねた形）） */
  readonly shins?: { readonly color: number; readonly kind: 'boots' | 'wraps'; readonly cuff?: boolean };
  /** 袖のない胴着（前の開いた、腰までの上着） */
  readonly vest?: number;
  /** 腰に巻いた布の帯（前で結んで、端を垂らす。差し色の区画を使う） */
  readonly sash?: number;
  /** 袖をまくる（rogue の体だけ。肘から先を肌にし、肘にまくった袖の帯を見せる） */
  readonly sleeves?: 'rolled';
  /** 手の色（rogue の体だけ。省くと革の手袋。素手の時は、肌の色に油の汚れを混ぜた色にする） */
  readonly hands?: number;
  /** 服と手の油染み（色の画像の、服・ズボン・手の区画に、暗い染みを描く） */
  readonly stains?: boolean;
  /** 腰の工具（腰の帯に下げた革の袋と、金槌・ねじ回し） */
  readonly tools?: boolean;
  /** 肩当て（左右の肩に丸い大きな板。iron 鉄・leather 革（革の色）） */
  readonly pauldrons?: 'iron' | 'leather';
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
  // 色（2026-11-28 人形の工房 その3）: 発注者の立ち絵の画素から拾った色（scripts/portraits-colors.py）。夕食と夜の光で絵に近く見えるように整えた値
  skin: 0xecd0bb,
  // 衣装（2026-11-22 人形の工房で決定。案 T3「濃紺と白と革」）: 濃紺の膝丈の外套の内側に、明るい灰の上着を見せ（暗い場面でも人の形が分かるように）、
  // 帯・手袋・長靴は飴色の革。外套の襟・前の開き・裾に塔の白の細い縁、左胸に門の輪をかたどった丸い印
  cloth: 0xb3afad,
  cloth2: 0x9c9896,
  trim: 0xa8a4a0,
  leather: 0x5e493c,
  pants: 0x4d4847,
  boots: 0x52433c,
  // 黒の短髪（2026-11-22 人形の工房で決定。案 A1）: 作者の中くらいの長さの髪（rogue）を短くし、分け目をユナと反対に。
  // ヘルメットに見えないように、縁の高さを向きごとに変え（もみあげを残し、耳の上を短く、えり足を少し長く）、面に生え際から毛先へ向かう太い溝を3本刻む。
  // 垂れた前髪の1房は、うつむくと目元にかかる。毛先は立てずに寝かせ、横と後ろの裾だけ少し跳ねる（物語の担当の決定）
  hair: {
    kit: 'rogue',
    color: 0x2e2c30,
    shape: {
      mirror: true,
      fringe: 0.88,
      volume: 0.97,
      subdivide: 2,
      hem: [
        [0, 0.3],
        [55, 0.45],
        [92, 0.08],
        [125, 0.2],
        [160, 0.36],
        [180, 0.44],
        [200, 0.36],
        [235, 0.2],
        [268, 0.08],
        [305, 0.45],
      ],
      grooves: [
        { path: [[-15, 28], [-25, 62], [-140, 60], [-168, 22]], depth: 0.085, width: 10 },
        { path: [[35, 30], [55, 60], [125, 52], [150, 18]], depth: 0.085, width: 10 },
        { path: [[-75, 34], [-98, 24], [-114, 6]], depth: 0.07, width: 9 },
      ],
    },
    extras: ['forelock', 'flicks'],
  },
  // 切れ長の目と、目に近いまっすぐな眉（怒った角度にしない）。あごを細く
  face: { eyes: 'narrow', brows: 'normal', browLift: -0.01, slim: 0.1 },
  width: 0.9,
  // 体つき（2026-11-23 人形の工房 その2 で決定。細く見せる案 B）: 胴と腕・脚を細くし、体だけ背を高くする（頭は大きくしない）。頭の横幅を少し細く
  bodyOnly: true,
  height: 1.08,
  headWidth: 0.92,
  torso: 0.8,
  limbs: 0.8,
  // 立ち絵に合わせる（その3）: 膝の下までの濃紺の外套（前の開き・裾・襟に白の縁）、肩の短い外套（肘まで。白の縁と、左胸の門の輪の印）、
  // 右の肩から左の腰への革帯、左の腰の剣、折り返しのある長靴。下ろした頭巾は絵に無いので外した
  cloak: { color: 0x444a5e, length: 'knee', edge: true, front: true },
  capelet: { color: 0x444a5e, edge: true },
  baldric: true,
  scabbard: true,
  shins: { color: 0x5e4636, kind: 'boots', cuff: true },
  // 襟は外套と同じ濃紺（差し色は縁の白に任せる）
  accent: 0x444a5e,
  accentB: 0xd8d6d0,
  emblem: 'chest',
};

/**
 * 隊の4人の服（2026-11-23 人形の工房 その2 で決定。案 B「印と濃紺」）: 服は職業らしい物にし、色の濃紺と左胸の門の輪の印（塔の白）だけをトウマとそろえる。
 * 革・ズボン・靴は土の色
 */
const TEAM_UNIFORM = {
  cloth: 0x34405a,
  cloth2: 0x2a3449,
  trim: 0x8a7a5a,
  leather: 0x5e4430,
  pants: 0x3e342c,
  boots: 0x3a2a20,
  accentB: 0xe2ded2,
  emblem: 'chest',
} as const;

export const LOOKS: Readonly<Record<string, LookDefinition>> = {
  // ---- 隊（操作する仲間） ----
  /** トウマ: 二十歳前後、中背の細身、黒の短髪、時守の濃紺の外套。革の肩当てと手袋、長靴、腰の剣。下ろした頭巾。差し色は襟の鈍い青緑 */
  touma: {
    picture: 'touma',
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
    kaykit: {
      base: 'barbarian',
      head: 'knight',
      // 大柄（体だけ背 1.1・肩幅 1.15。頭は少し小さく、胴と腕・脚は細く）
      height: 1.1,
      width: 1.15,
      bodyOnly: true,
      headScale: 0.92,
      torso: 0.8,
      limbs: 0.8,
      skin: 0xb8967e,
      ...TEAM_UNIFORM,
      hair: { kit: 'knight', color: 0x4a3222, shape: { length: 0.8 } },
      pauldrons: 'iron',
      items: [
        { model: 'sword', slot: 'hand' },
        { model: 'measuringRod', slot: 'back' },
      ],
    },
  },
  /** キリ: 細身、後ろで束ねた髪、深い緑。弓と短いマント */
  kiri: { body: 0x3a5440, accent: 0x7a8a5a, hair: 0x2a2018, hairStyle: 'tied', width: 0.9, weapon: 'bow', cloak: 0x4a4a38, cloakLength: 'short', gloves: LEATHER,
    kaykit: {
      base: 'rogue',
      head: 'rogue',
      width: 0.88,
      skin: 0xbf9f86,
      ...TEAM_UNIFORM,
      hair: { kit: 'rogue', color: 0x2a2018, shape: { length: 0.7 }, extras: ['ponytail'] },
      mantle: 0x2c3650,
      items: [
        { model: 'bow', slot: 'handL' },
        { model: 'quiver', slot: 'back' },
      ],
    },
  },
  /** フェン: 小柄、白髪まじり、黒。杖と頭巾つきの長衣 */
  fen: { body: 0x2e2c30, accent: 0x6a5a7a, hair: 0x9a9890, hairStyle: 'short', scale: 0.9, weapon: 'staff', outfit: 'robe', mantle: 0x3a3634, hood: 'down',
    kaykit: {
      base: 'mage',
      head: 'knight',
      height: 0.9,
      skin: 0xbf9f86,
      ...TEAM_UNIFORM,
      trim: 0x4a4650,
      hair: { kit: 'knight', color: 0x8e8a84 },
      headwear: { kind: 'hat', color: 0x2a3247 },
      // 差し色は帽子の帯の紫
      accent: 0x6a5a7a,
      items: [{ model: 'staff', slot: 'hand' }],
    },
  },
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
    kaykit: {
      base: 'mage',
      head: 'mage',
      // ふくよか（体だけ肩幅 1.2。頭は少し小さく、胴と腕・脚は控えめに細く）
      width: 1.2,
      bodyOnly: true,
      headScale: 0.95,
      torso: 0.88,
      limbs: 0.85,
      skin: 0xc8a890,
      ...TEAM_UNIFORM,
      // 栗色の量の多い髪（巻き髪は、波打つ段差を入れたが細い束を重ねないので、量の多い髪に見える）
      hair: {
        kit: 'mage',
        color: 0x6a4228,
        shape: {
          length: 0.62,
          volume: 1.12,
          subdivide: 1,
          steps: [
            { az: 180, el: -10, offset: 0.1, step: 0.05, wave: [14, 7] },
            { az: 0, el: 20, offset: 0.25, step: 0.03, wave: [10, 6] },
          ],
        },
      },
      face: { brows: 'thin' },
      apron: { color: 0xc6b898, bib: true },
      items: [
        { model: 'staffRing', slot: 'hand' },
        { model: 'medicineBox', slot: 'waist' },
      ],
    },
  },
  // ---- 操作しない人物 ----
  /** ユナ: 十六歳、小柄、黒髪の二つ結びのおさげ、油の染みた生成りの作業着。袖をまくり、革の前掛けと腰の工具。差し色は結い紐の赤茶 */
  yuna: {
    picture: 'yuna',
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
      // 体つき（2026-11-23 人形の工房 その2 で決定。細く見せる案 A）: 胴と腕・脚を細く（背と頭は今のまま）
      torso: 0.8,
      limbs: 0.8,
      skin: 0xf2d4c0,
      // 生成りの作業着（2026-11-22 人形の工房で決定。案 Y1「生成りと錆色」）: 明るい生成りの上着、明るさの違う茶のズボン（全身が1色の塊に見えないように）、
      // 焦げ茶の革の前掛け。差し色は錆色1色（首の布・結い紐）。袖をまくり、素手。服と手に油染み。腰に工具
      cloth: 0xd2bea6,
      cloth2: 0xb39b86,
      leather: 0x674c3c,
      pants: 0x634d40,
      boots: 0x604a3d,
      sleeves: 'rolled',
      hands: 0xbc9c84,
      stains: true,
      tools: true,
      // 二つ結びのおさげ（2026-11-22 ゲームの人形で決定）。人形の工房で、低い位置で結んで肩の外に沿って短めに下ろす形（案 B）に決定
      // （胸の前へ下ろす形は、2本の帯が肩から掛かっているように見えたため）。前髪の横に真鍮の丸い髪留め
      // 前髪は少し短く（観客の検査: 夕食の画で、前髪が片目にかかって眠そう・無表情に見えた）
      hair: {
        kit: 'rogue',
        color: 0x2c2829,
        shape: { fringe: 0.8 },
        extras: ['twinTails', 'pin'],
        tails: {
          tie: [0.48, 1.48, -0.12],
          path: [
            [0.33, 1.3, -0.06],
            [0.37, 1.2, -0.03],
            [0.38, 1.12, -0.02],
          ],
          root: 0.058,
          bulge: 0.3,
          taper: 0.8,
          chest: true,
        },
      },
      // 立ち絵に合わせる（その3）: 胸当てと肩紐のある、膝の下までの革の前掛け
      apron: { color: 0x59473e, bib: true, straps: true, length: 'knee' },
      accent: 0xa8563c,
      accentB: 0xc09a50,
      neckerchief: true,
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
    picture: 'touma',
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
    picture: 'mother',
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
      // 色と形（2026-11-28 人形の工房 その3）: 発注者の立ち絵に合わせる。灰青の着物（足首までの裾）に、足首の上までの生成りの前掛け（胸当てと前の結び目）。
      // 髪は灰の混じった茶で、後ろの低いまとめ髪。肩掛けは絵に無いので外した
      skin: 0xf6d7c1,
      cloth: 0x4e4c58,
      cloth2: 0x43414c,
      trim: 0xb8a898,
      leather: 0x4a3f3a,
      pants: 0x45444a,
      boots: 0x66544a,
      // 長衣の袖口（素材では金具の色）を着物の色に
      metal: 0x43414c,
      hair: { kit: 'mage', color: 0x6e5e58, extras: ['bun'] },
      // 体つき（2026-11-23 人形の工房 その2 で決定）: トウマ・ユナと同じく、胴と腕・脚を細く
      torso: 0.8,
      limbs: 0.8,
      face: { brows: 'thin' },
      skirt: { color: 0x4e4c58, length: 'ankle' },
      apron: { color: 0xceb8a4, bib: true, length: 'ankle', tie: true },
    },
  },
  /** 父: がっしりした体に、苔色の上着と革の帯。袖をまくり、短い髪と短く刈ったひげ。差し色は首の黄土の布 */
  father: {
    picture: 'father',
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
      // 立ち絵に合わせる（2026-11-28 人形の工房 その3）: 袖をまくった生成りのシャツに、茶の胴着、腰に巻いた灰の布の帯（前で結んで垂らす）、
      // 灰の混じった髪とひげ、脚の巻き布。土台の体は、シャツと袖をまくった腕のある rogue にした（barbarian の体は、毛皮の縁と太い帯と斜めの革帯が絵に無いため）
      base: 'rogue',
      head: 'barbarian',
      height: 1.06,
      width: 1.14,
      skin: 0xe4bda3,
      cloth: 0xc8ad98,
      cloth2: 0xb09682,
      trim: 0xb09682,
      leather: 0x5e493c,
      pants: 0x4b403b,
      boots: 0x6e5a4e,
      sleeves: 'rolled',
      hands: 0xd8ae96,
      hair: { kit: 'knight', color: 0x74645e },
      vest: 0x6e5448,
      sash: 0x46423f,
      shins: { color: 0x5e4c44, kind: 'wraps' },
      // 体つき（2026-11-23 人形の工房 その2 で決定）: 胴と腕・脚を細く。背と肩幅の倍率は体だけに掛ける
      bodyOnly: true,
      torso: 0.84,
      limbs: 0.84,
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
