/**
 * 画面に出す文言をまとめた場所。
 * 文言はここ以外に書かない（将来の翻訳と表記の統一のため）。
 * core は文言を作らず、出来事や状態（例: 地形 'grass'、向き 'back'）だけを返す。それを文言に変えるのがここの役割。
 */
import type { ArmorType, EquipmentEffect, EquipSlot, GrowthStat, PassiveSlot, SpellElement, Side, StatusId, Team, UnitStats, WeaponType } from '../core/battleTypes';
import type { EquipRefusal } from '../core/equipment';
import type { BuyRefusal, SellRefusal } from '../core/shop';
import type { LearnRefusal } from '../core/progression';
import type { RelativeSide } from '../core/geometry';
import type { Terrain } from '../core/map';

export const TEXT = {
  /** ブラウザのタブに出す題名（index.html にも同じ文言がある） */
  appTitle: 'Tactics Game（開発中）',

  mapNames: {
    'twin-hills': 'ふたつの丘',
    'ruins-entrance': '入口',
    'ruins-corridor': '崩れた回廊',
    'ruins-altar': '祭壇の間',
    'prologue-weir': '谷の外れの堰',
    'prologue-hill': 'アスタルの丘',
    'stage-room': '室内',
    'stage-yard': '野外',
    'stage-home': 'トウマの家',
    'stage-tower': '暦の塔',
    'stage-hearing': '話を聞く部屋',
    'stage-city': '都',
    'stage-weir': '谷の外れの堰',
    'stage-hill': 'アスタルの丘',
  } as Readonly<Record<string, string>>,

  /** 物語の本の名前（物語の土台） */
  books: {
    main: '消された暦',
  } as Readonly<Record<string, string>>,

  /** 題名の画面（物語の土台） */
  title: {
    name: '消された暦',
    sub: '（仮・開発中）',
    story: '物語',
    storyHelp: '序章（約10分の会話と2つの戦闘）',
    /** 物語を選んだ後の画面（進み具合がある時と、確認用の機能が入の時） */
    storyMenuTitle: '物語',
    continue: 'つづきから',
    restart: 'はじめから',
    restartHelp: '部隊・装備・ゴールド・記録は残ります',
    confirmRestart:
      '物語の進み具合を消して、最初から始めます。育てた部隊・装備・ゴールド・訓練と遺跡の記録は残ります。一度見た手ほどきも、もう一度出ます。',
    confirmRestartYes: 'はじめから始める',
    back: '戻る',
    play: '訓練と遺跡',
    playHelp: '訓練戦と、はじまりの遺跡（部隊は物語と共通）',
    toTitle: 'タイトルへ',
  },

  /** 物語の流れ（物語の土台） */
  story: {
    recapTitle: 'これまで',
    recapContinue: '続ける',
    finished: (title: string) => `${title}を最後まで見ました`,
    /** 序章を終えた時（第1章はまだない） */
    nextChapterSoon: '第1章は準備中です',
    nextChapterNote: '序章を最後まで遊んでいただき、ありがとうございました。「物語」から、もう一度序章を遊べます。',
    next: '物語を進める',
    retry: 'やり直す',
    battleWon: '勝利！ 物語を進めます',
    battleLost: '敗北……',
    lostNote: 'この戦闘を始めからやり直せます',
    baseNote: '編成と店を使えます。準備ができたら「物語を進める」',
    /** 章の名前（章の id で引く） */
    chapters: { prologue: '序章' } as Readonly<Record<string, string>>,
    /** 場面の名前（ゲーム脚本の場面の名前。場面の id で引く。脚本の1つの場面を2つに分けたものは「・戦闘の前」「・戦闘」を添える） */
    scenes: {
      open: '冒頭の先出し',
      'weir-intro': '堰・戦闘の前',
      weir: '堰・戦闘',
      tower: '暦の塔・門と報告の部屋',
      hall: '暦の塔・円卓の広間',
      home: '家・夕食と工房の夜',
      city: '都と橋',
      gate: '塔の門',
      'hill-intro': '建国の丘・戦闘の前',
      hill: '建国の丘・戦闘',
      return: '塔へ帰る',
      end: '家までの道と物置',
    } as Readonly<Record<string, string>>,
    /** 場面の札（例: 序章 場面4 家・夕食と工房の夜） */
    sceneLabel: (chapter: string, n: number | undefined, name: string) => `${chapter}${n === undefined ? '' : ` 場面${n}`} ${name}`,
  },

  /** 確認用の機能（発注者と物語の作者が、場面を手早く確かめるための機能。設定で入にした時だけ使える） */
  check: {
    badge: '確認用の機能: 入',
    sceneSelect: '場面を選ぶ',
    sceneSelectHelp: '選んだ場面から始めます',
    sceneSelectTitle: '場面を選ぶ',
    sceneSelectNote: '経験値・JP・ゴールド・戦利品は得ません',
    winBattle: '勝ったことにする',
    winTitle: '勝ったことにしますか？',
    winNote: '戦闘の前の手ほどきと演出も飛ばして、勝った後の場面へ進みます。経験値・JP・ゴールド・戦利品は得ません。',
    winYes: '勝ったことにして進む',
    winNo: 'やめる',
  },

  /** 会話の枠（物語の土台） */
  dialogue: {
    fast: '早送り',
    backlog: '読み返し',
    backlogTitle: '読み返し',
    skip: 'スキップ',
    skipTitle: 'この会話を飛ばしますか？',
    skipNote: '操作の場面も飛ばして、会話の終わりまで進みます。',
    skipYes: '飛ばす',
    skipNo: 'やめる',
    close: '閉じる',
    holdDefault: '押し続ける',
    holdHint: 'ボタンを押し続けると、少しずつ進みます。指を離すと止まります。',
    walkHint: '光っているマスを押すと、1マスずつ歩きます。',
    /** 物をタップする操作（戸を開ける・石を拾う） */
    tapHint: '光っている所を押します。',
    /** 耳に当てて聞く操作（押している間だけ鳴る） */
    listenHint: '押している間だけ、音が聞こえます。指を離すと止まり、押し直すと節の頭から聞こえます。',
    listenDefault: '耳に当てる',
    /** 章の題の画面で、次へ進むための案内 */
    titleNext: 'タップで進む',
  },

  /** 音（序章に足りない仕組み）。音がなくても伝わるように、鳴っている間は画面に印を出す */
  sound: {
    /** 旋律が鳴っている間の印（音色の名前ごと。台本で文を添えた時はそちら） */
    melodyMark: (label: string) => `♪ ${label}`,
    timbres: { 鼻歌: '鼻歌', 石: '石の音', 歌声: '歌声' } as Readonly<Record<string, string>>,
    /** 台本の効果音のうち、画面にも短く出すもの */
    effectMarks: {
      gate: '光の音',
      chime: '石の鳴る音',
      water: '水の音',
      break: '折れる音',
      crack: '石の割れる音',
      collapse: '崩れる音',
      waterSoft: '水の音',
      waterMid: '水の音',
      bell: '鐘の音',
      windUp: 'ねじを巻く音',
    } as Readonly<Record<string, string>>,
    /** 耳に当てて聞く間の、貝殻のような音の印 */
    shellMark: '♪ かすかな音',
  },

  /** 設定（序章に足りない仕組み） */
  settings: {
    open: '設定',
    title: '設定',
    volume: (v: number) => `音量 ${v}`,
    volumeDown: '音量を下げる',
    volumeUp: '音量を上げる',
    mute: '消音にする',
    unmute: '消音をやめる',
    mutedNote: '消音中です（音で伝える事柄は、画面にも ♪ の印で出ます）',
    tutorialOn: '見た手ほどきは出さない: はい',
    tutorialOff: '見た手ほどきは出さない: いいえ',
    tutorialNote: '「いいえ」にすると、手ほどきのある戦闘で毎回出します',
    checkOn: '確認用の機能: 入',
    checkOff: '確認用の機能: 切',
    checkNote: '入にすると、物語の場面を選んで始めたり、物語の戦闘を勝ったことにしたりできます（物語を確かめるための機能です）',
    close: '閉じる',
  },

  /** 戦闘の手ほどき（序章に足りない仕組み）。段の id で引く */
  tutorial: {
    skip: '手ほどきを飛ばす',
    label: '手ほどき',
    steps: {
      'weir-move': '光っているマスを押すと、そこへ移動します。積み石の合わせ目（◆）を3つ壊せば勝ちです。',
      'weir-attack': '移動したら「攻撃」を押します。',
      'weir-target': '赤く光っている相手を押して選びます。届く相手がいなければ「戻る」。',
      'weir-confirm': '当たる見込みとダメージを確かめて「確定」を押します。',
      'weir-facing': '最後に向きを選んで「手番を終える」。背中から攻撃されると、大きな痛手になります。',
      'weir-gord': 'ゴードは前へ。番兵を引きつけます。',
      'weir-kiri': 'キリは崖の上へ。光っているマスから登れます。',
      /** 崖の上に立った時、測り棒の札の文字をもう一度出す（ゲーム脚本の序章 1-9） */
      'weir-high': '測り棒の札「高い所から撃つ矢は、遠くまで届く。兄さんは高い所が好きでしょう。」',
      'weir-fen': 'フェンの「攻撃魔法」の「炎」で、合わせ目を割ります。唱えてから発動するまで、少し時間がかかります。',
      'hill-finisher': '最後の一撃は、トウマで',
    } as Readonly<Record<string, string>>,
  },

  /** ダンジョンの名前（名称は仮） */
  dungeons: {
    ruins: 'はじまりの遺跡',
  } as Readonly<Record<string, string>>,

  /** 勝敗条件の表示（フェーズ2-2） */
  objectives: {
    title: '勝敗条件',
    open: '勝敗条件を見る',
    close: '閉じる',
    victory: '勝利',
    defeat: '敗北',
    notes: 'ほか',
    /** 常に出す短い文の先頭 */
    summaryVictory: (text: string) => `勝利: ${text}`,
    defeatAll: '敵をすべて退ける',
    defeatUnit: (name: string) => `${name}を退ける`,
    reachTile: '味方のだれかが光る輪のマスに到達',
    reachTileShort: '光る輪のマスに到達',
    surviveTurns: (n: number) => `${n}手番を耐える`,
    /** 対象物をすべて壊す（物語の土台）。left は残りの数 */
    destroyObjects: (names: string, left: number, total: number) => `${names}をすべて壊す（${total - left} / ${total}）`,
    destroyObjectsShort: (left: number, total: number) => `物を壊す ${total - left}/${total}`,
    /** 正面以外から攻撃を当てる（物語の土台） */
    hitUnit: (label: string, name: string, count: number, times: number) => `${name}の${label}に、正面以外から攻撃を ${times} 回当てる（${Math.min(count, times)} / ${times}）`,
    hitUnitShort: (label: string, count: number, times: number) => `${label} ${Math.min(count, times)}/${times}`,
    hitUnitDefaultLabel: '体',
    /** 頭上に出す、数えた回数 */
    tallyPop: (count: number, times: number) => `${Math.min(count, times)} / ${times}`,
    /** 対象物の情報の欄の札 */
    objectTag: '◆ 壊す物',
    /** HP の尽きないユニットの情報の欄の札（序章に足りない仕組み） */
    unbreakableTag: '◇ HP が尽きない（一定より下がらない）',
    /** 最後の1回を当てられるユニットが決まっている時（序章の丘の誓いの剣。PR の回答 4） */
    finisherNote: (name: string) => `。最後の一撃は${name}だけが当てられる（剣を折るのは、${name}の務め）`,
    finisherShort: (name: string) => `（最後は${name}）`,
    /** ほかの仲間が最後の1回を当てた時に、頭上と画面の上に出す理由 */
    finisherPop: (name: string) => `最後は${name}`,
    finisherMessage: (name: string) => `剣を折る最後の一撃は、${name}の務め（ほかの仲間の攻撃では回数が進まない）`,
    allDefeated: '味方が全員戦闘不能になる',
    unitDefeated: (name: string) => `${name}が戦闘不能になる`,
    turnLimit: (n: number) => `${n}手番を過ぎる`,
    /** 手番数の条件の残り（今の手番を含む） */
    turnsLeft: (n: number) => `残り ${n} 手番`,
    /** 増援の予告（after: 何手番後に現れるか。0 ならこの手番の後） */
    reinforcement: (count: number, after: number) =>
      after <= 0 ? `増援 ${count} 体: この手番の後に現れる（赤い枠のマス）` : `増援 ${count} 体: ${after} 手番後に現れる（赤い枠のマス）`,
    reinforcementShort: (after: number) => (after <= 0 ? '増援 まもなく' : `増援 あと ${after} 手番`),
    /** 退ける対象の敵の情報の欄に出す札 */
    targetTag: '★ 退ける対象',
    /** 頭上の札 */
    targetBadge: '★',
    /** 敵をすべて退ければ常に勝利、味方が全員戦闘不能なら常に敗北 */
    alwaysNote: '敵をすべて退けても勝利、味方が全員戦闘不能になると敗北です',
    /** 敵をすべて退けても勝ちにならない戦闘（序章の堰） */
    alwaysNoteNoWipe: '敵をすべて退けても、勝利の条件を満たすまで続きます。味方が全員戦闘不能になると敗北です',
    /** 膠着（フェーズ2-6） */
    stalemate: (n: number) => `膠着まで残り ${n} 手番（ダメージ・回復・状態変化がないまま過ぎると、HP の割合が高い側の勝ち）`,
    stalemateShort: (n: number) => `膠着まで ${n} 手番`,
    stalemateResult: '膠着（HP の割合で決着）',
  },

  /** 対象物が壊れた時の頭上の文字 */
  objectBroken: '壊れた！',
  /** 対象物の名前（種類の id で引く。物語の土台） */
  objectNames: {
    seam: '積み石の合わせ目',
    pillar: '結界の柱',
    crate: '木箱',
    oathSword: '誓いの剣',
  } as Readonly<Record<string, string>>,

  /** 罠（フェーズ2-2） */
  traps: {
    rockfall: '落石',
    mud: 'ぬかるみ',
    drain: '体から力が抜けた',
  } as Readonly<Record<string, string>>,
  /** 脱力の罠でレベルが変わった時の表示 */
  levelChange: (from: number, to: number) => `Lv ${from} → ${to}`,
  appeared: '増援',

  /** 出撃前の配置の画面（フェーズ2-2） */
  deploy: {
    hint: '味方を2人続けてタップすると、位置を入れ替えます',
    selected: (name: string) => `${name}と入れ替える味方をタップ`,
    start: '戦闘開始',
    back: '戻る',
  },

  terrain: {
    grass: '草地',
    dirt: '土',
    stone: '岩場',
    water: '水辺',
    wood: '板張り',
  } satisfies Record<Terrain, string>,

  jobs: {
    warrior: '戦士',
    archer: '弓使い',
    mage: '魔道士',
    healer: '治癒師',
    timekeeper: '時守',
    knight: '騎士',
    monk: '格闘家',
    thief: '盗賊',
    timeMage: '時魔道士',
    summoner: '召喚士',
    magicKnight: '魔法剣士',
  } as Readonly<Record<string, string>>,

  /** 行動順の欄に出す、ジョブの1文字の略 */
  jobShort: {
    warrior: '戦',
    archer: '弓',
    mage: '魔',
    healer: '治',
    timekeeper: '時',
    knight: '騎',
    monk: '拳',
    thief: '盗',
    timeMage: '刻',
    summoner: '召',
    magicKnight: '剣',
  } as Readonly<Record<string, string>>,

  /** ジョブのコマンド（行動アビリティのまとまり）の名前。ジョブの id で引く */
  commands: {
    warrior: '武技',
    archer: '弓術',
    mage: '攻撃魔法',
    healer: '回復魔法',
    timekeeper: '時の業',
    knight: '破壊術',
    monk: '拳法',
    thief: '盗術',
    timeMage: '時魔法',
    summoner: '召喚',
    magicKnight: '魔法剣',
  } as Readonly<Record<string, string>>,

  /** アビリティ（行動アビリティと、受動的なアビリティ）の名前。id で引く */
  abilities: {
    fire: '炎',
    wind: '風',
    thunder: '雷',
    heal: '癒し',
    bigHeal: '大癒し',
    revive: '蘇生',
    aimedShot: '狙い撃ち',
    powerStrike: '強打',
    knockback: '突き飛ばし',
    slowArrow: '足止めの矢',
    seal: '封じ',
    protectPrayer: '守りの祈り',
    inferno: '業火',
    counter: '反撃',
    evade: '身かわし',
    magicShell: '魔力の殻',
    meditate: '瞑想',
    heavyArmor: '重装',
    focus: '集中',
    quickCast: '早口',
    thrift: '節約',
    quickStep: '早足',
    lightFoot: '身軽',
    sweep: '斬り分け',
    rewind: '引き戻し',
    gateSwap: '門渡り',
    timeDelay: '時送り',
    endure: '踏みとどまる',
    timekeeperWisdom: '時守の心得',
    breakWeapon: '武器破壊',
    breakArmor: '鎧破壊',
    breakSpeed: '速度破壊',
    breakMagic: '魔力破壊',
    cover: 'かばう',
    backGuard: '背水',
    doubleStrike: '連撃',
    chakra: '気功',
    earthWave: '地走り',
    shout: '喝',
    parry: '見切り',
    ironFist: '鍛えた拳',
    stealGold: 'ゴールドを盗む',
    stealGear: '装備を盗む',
    blindStrike: '目くらまし',
    backstab: '不意打ち',
    flee: '逃げ足',
    swiftFeet: '俊足',
    ice: '氷',
    earth: '土',
    haste: '加速',
    decelerate: '減速',
    stop: '停止',
    quicken: '早送り',
    fireSpirit: '炎の精霊',
    iceSpirit: '氷の精霊',
    thunderSpirit: '雷の精霊',
    earthSpirit: '土の精霊',
    healSpirit: '癒しの精霊',
    fireBlade: '炎の剣',
    iceBlade: '氷の剣',
    thunderBlade: '雷の剣',
    sealBlade: '魔封剣',
    criticalHaste: '危機の加速',
    teleport: '瞬間移動',
    spiritWard: '精霊の守り',
    manaBlade: '魔力の刃',
  } as Readonly<Record<string, string>>,

  /** 行動順の欄に出す、詠唱のある魔法・技の1文字の略 */
  abilityShort: {
    fire: '炎',
    wind: '風',
    thunder: '雷',
    heal: '癒',
    bigHeal: '大',
    aimedShot: '狙',
    seal: '封',
    protectPrayer: '守',
    inferno: '業',
    revive: '蘇',
    ice: '氷',
    earth: '土',
    haste: '加',
    decelerate: '減',
    stop: '止',
    quicken: '早',
    fireSpirit: '炎',
    iceSpirit: '氷',
    thunderSpirit: '雷',
    earthSpirit: '土',
    healSpirit: '癒',
  } as Readonly<Record<string, string>>,

  /** 行動アビリティの短い説明（編成の画面で、習得する前に見る） */
  abilityHelp: {
    fire: '範囲（5マス）の攻撃魔法。詠唱は遅い',
    wind: '単体の攻撃魔法。詠唱は速い',
    thunder: '単体の強い攻撃魔法。詠唱はとても遅い',
    heal: '範囲（5マス）の回復魔法。詠唱は速い',
    bigHeal: '単体の大きな回復魔法',
    revive: '戦闘不能のユニット1体を、最大 HP の 25% で復帰させる（退場した後は効かない）。詠唱は遅い',
    aimedShot: '狙いを付けてから撃つ。必ず当たり、攻撃力の1.5倍（向きと高低差の補正あり）、射程 3〜6。弓が必要',
    powerStrike: 'ダメージ1.5倍、命中率 -15%。剣か杖が必要',
    knockback: '隣の相手に小さなダメージを与え、1マス押し出す。低い所へ落とすと落下ダメージ、押し出せない時は追加のダメージ。詠唱を中断させる。剣か杖が必要',
    slowArrow: '小さなダメージを与え、鈍足（移動力 -2、2手番）を付ける。弓が必要',
    seal: '単体に沈黙（魔法を使えない、2手番）を付ける。詠唱中の魔法は中断される。詠唱は速い',
    protectPrayer: '範囲（5マス）に守り（受けるダメージ -25%、3手番）を付ける。敵も範囲にいれば付く。詠唱は速い',
    counter: '隣のマスから近接攻撃を受けて生き残った時、通常攻撃で反撃する（反撃に反撃は起きない）',
    evade: '正面と側面からの、武器による攻撃の命中率 -20',
    magicShell: '魔法で受けるダメージ -20%',
    meditate: 'ダメージを受けて生き残った時、MP を 6 回復する',
    heavyArmor: '最大 HP +15%',
    focus: '武器による攻撃の命中率 +10',
    quickCast: '詠唱の速さ +25%',
    thrift: '消費 MP -25%',
    quickStep: '移動力 +1',
    lightFoot: 'ジャンプ力 +1',
    sweep: '正面のマスと、その左右のマスにいる敵をまとめて斬る（通常攻撃の 70%。1体ずつ命中を判定）。剣が必要',
    rewind: '味方ひとりの HP を、その味方の前回の手番が始まった時の値に戻す（今の方が高い時は何も起きない）。射程 3、詠唱なし',
    gateSwap: '射程 3 の中にいる味方ひとりと、位置を入れ替える。詠唱なし',
    timeDelay: '敵ひとりの CT を 40 減らし、次の行動を遅らせる。射程 3、詠唱なし',
    endure: 'HP が 0 になるダメージを受けた時、1戦に1度だけ HP 1 で耐える',
    timekeeperWisdom: '待機した時に残る CT +20（40 → 60）',
    breakWeapon: '通常攻撃の 60% のダメージ。当たると攻撃力低下（-25%、3手番）。剣が必要',
    breakArmor: '通常攻撃の 60% のダメージ。当たると最大 HP 低下（-20%、3手番）。剣が必要',
    breakSpeed: '通常攻撃の 60% のダメージ。当たると素早さ低下（-25%、3手番）。剣が必要',
    breakMagic: '通常攻撃の 60% のダメージ。当たると魔力低下（-25%、3手番）。剣が必要',
    cover: '隣の味方の HP が半分以下の時、その味方への武器による攻撃を代わりに受ける',
    backGuard: '背面から攻撃された時の、ダメージの増加を受けない',
    doubleStrike: '素手で2回攻撃する（1回は通常攻撃の 60%。1回ごとに命中を判定）。素手が必要',
    chakra: '自分か隣の味方の HP を回復する（攻撃力ぶん）。詠唱なし',
    earthWave: '正面の直線 3 マスの敵にダメージ（攻撃力の 80%。必ず当たる）。高さの差が 1 を超えるマスで止まる。詠唱なし',
    shout: '自分か隣の味方の状態変化をすべて解く。詠唱なし',
    parry: '正面からの、武器による攻撃の命中率 -20',
    ironFist: '素手の時の攻撃力 +3',
    stealGold: 'ゴールドを盗む（成功すると、戦闘の後に増える）。成功率は背面が高く、正面が低い',
    stealGear: '敵の装備をひとつ盗む（武器 → 防具 → 装飾品の順）。ボスの専用の装備は盗めない。成功率は背面が高く、正面が低い',
    blindStrike: '通常攻撃の 50% のダメージ。当たると目くらまし（武器による攻撃の命中率 -30、3手番）。短剣が必要',
    backstab: '背面から攻撃した時だけ、通常攻撃の 2 倍のダメージ。短剣が必要',
    flee: '武器による攻撃を受けて生き残った時、攻撃した相手から1マス離れる',
    swiftFeet: '移動力 +2',
    ice: '単体の攻撃魔法。威力は炎と風の間',
    earth: '単体の攻撃魔法。相手が自分より低い位置にいるほど威力が上がる（1 段ごとに +25%）',
    haste: '中心と上下左右の5マスにいる全員（敵も味方も）に加速（素早さ +50%、4手番）を付ける。詠唱は速い',
    decelerate: '中心と上下左右の5マスにいる全員（敵も味方も）に素早さ低下（-35%、3手番）を付ける。詠唱は速い',
    stop: '単体に停止（次の手番が何もできずに過ぎる）を付ける。詠唱は長い',
    quicken: '味方ひとりの CT を満たし、すぐに行動させる。消費 MP が大きい',
    fireSpirit: '中心から 2 マス以内の、敵だけにダメージ。詠唱は長い',
    iceSpirit: '中心から 2 マス以内の、敵だけにダメージ。詠唱は長い',
    thunderSpirit: '中心から 2 マス以内の、敵だけにダメージ。詠唱は長い',
    earthSpirit: '中心から 2 マス以内の、敵だけにダメージ。詠唱は長い',
    healSpirit: '中心から 2 マス以内の、味方だけを回復。詠唱は長い',
    fireBlade: '隣の敵に剣で攻撃（攻撃力と魔力の合計の 70%）。炎属性。MP 6',
    iceBlade: '隣の敵に剣で攻撃（攻撃力と魔力の合計の 70%）。氷属性。MP 6',
    thunderBlade: '隣の敵に剣で攻撃（攻撃力と魔力の合計の 70%）。雷属性。MP 6',
    sealBlade: '通常攻撃の 60% のダメージ。当たると沈黙を付ける。MP 6',
    criticalHaste: 'ダメージを受けて HP が 1/4 以下になった時、自分に加速が付く',
    teleport: '段差とほかのユニットを無視して移動する（距離は移動力と同じ）',
    spiritWard: '詠唱中に受けるダメージが増えない',
    manaBlade: '魔力の 40% を攻撃力に加える',
  } as Readonly<Record<string, string>>,

  /** 状態変化の名前 */
  statuses: {
    protect: '守り',
    slow: '鈍足',
    silence: '沈黙',
    attackDown: '攻撃力低下',
    magicDown: '魔力低下',
    speedDown: '素早さ低下',
    maxHpDown: '最大 HP 低下',
    blind: '目くらまし',
    stop: '停止',
    haste: '加速',
  } satisfies Record<StatusId, string>,

  /** 頭上に出す、状態変化の1文字の目印 */
  statusShort: {
    protect: '守',
    slow: '鈍',
    silence: '沈',
    attackDown: '攻',
    magicDown: '魔',
    speedDown: '速',
    maxHpDown: '体',
    blind: '暗',
    stop: '止',
    haste: '加',
  } satisfies Record<StatusId, string>,
  /** 頭上の目印が多い時に、残りの数を出す（「+2」） */
  statusMore: (n: number) => `+${n}`,
  statusMoreTitle: '情報の欄ですべて見られます',

  /** 状態変化の短い説明（情報の欄） */
  statusHelp: {
    protect: '受けるダメージ -25%',
    slow: '移動力 -2',
    silence: '魔法を使えない',
    attackDown: '攻撃力 -25%',
    magicDown: '魔力 -25%',
    speedDown: '素早さ -25%',
    maxHpDown: '最大 HP -20%',
    blind: '武器による攻撃の命中率 -30',
    stop: '次の手番は何もできない',
    haste: '素早さ +50%',
  } satisfies Record<StatusId, string>,

  /** 受動的なアビリティの枠の名前 */
  passiveSlots: {
    reaction: 'リアクション',
    support: 'サポート',
    movement: 'ムーブ',
  } satisfies Record<PassiveSlot, string>,

  /** 属性の名前 */
  elements: {
    fire: '炎',
    wind: '風',
    thunder: '雷',
    light: '光',
    ice: '氷',
    earth: '土',
    none: '無',
  } satisfies Record<SpellElement, string>,

  /** 武器の種類 */
  weapons: {
    sword: '剣',
    bow: '弓',
    staff: '杖',
    dagger: '短剣',
  } satisfies Record<WeaponType, string>,
  /** 武器の枠が空（素手）。アビリティに必要な武器の指定にも使う */
  unarmed: '素手',

  /** 防具の種類（フェーズ2-4） */
  armors: {
    heavy: '鎧',
    light: '軽装',
    robe: 'ローブ',
  } satisfies Record<ArmorType, string>,

  /** 装備の枠 */
  equipSlots: {
    weapon: '武器',
    armor: '防具',
    accessory: '装飾品',
  } satisfies Record<EquipSlot, string>,

  /** 装備の名前と説明（id で引く。名称は仮） */
  equipment: {
    'sword-1': { name: '旅人の剣', help: '旅人が腰に下げる、扱いやすい剣' },
    'sword-2': { name: '鋼の剣', help: 'よく鍛えられた剣' },
    'sword-3': { name: '白銀の剣', help: '名工の打った、鋭い剣' },
    'bow-1': { name: '狩人の弓', help: '扱いやすい短い弓' },
    'bow-2': { name: '長弓', help: '遠くまで力強く射られる弓' },
    'bow-3': { name: '風切りの弓', help: '風を裂いて飛ぶ、名工の弓' },
    'staff-1': { name: '樫の杖', help: '魔力を通しやすい木の杖' },
    'staff-2': { name: '水晶の杖', help: '先の水晶が魔力を集める' },
    'staff-3': { name: '星詠みの杖', help: '星の力を宿すという杖' },
    'dagger-1': { name: '小刀', help: '軽くて扱いやすい短い刃' },
    'dagger-2': { name: '鋼の短剣', help: 'よく研がれた短剣。身のこなしが軽くなる' },
    'dagger-3': { name: '影縫いの短剣', help: '影のように素早く振るえる短剣' },
    'heavy-1': { name: '鉄の鎧', help: '重いが頼れる鎧' },
    'heavy-2': { name: '鋼の鎧', help: '厚い鋼の鎧' },
    'heavy-3': { name: '白銀の鎧', help: '軽くて硬い、名工の鎧' },
    'light-1': { name: '革の服', help: '動きやすい革の服' },
    'light-2': { name: '硬革の服', help: '要所を硬い革で守る服' },
    'light-3': { name: '銀糸の服', help: '銀の糸を織り込んだ服' },
    'robe-1': { name: '麻のローブ', help: '魔法使いの普段着' },
    'robe-2': { name: '絹のローブ', help: '魔力をためやすい絹のローブ' },
    'robe-3': { name: '月光のローブ', help: '月の光を織ったというローブ' },
    'swift-boots': { name: '疾風の靴', help: '移動力が 1 上がる' },
    'spring-boots': { name: '跳ね靴', help: 'ジャンプ力が 1 上がる' },
    'quick-ring': { name: '早駆けの指輪', help: '素早さが 1 上がる' },
    'mana-charm': { name: '魔力の首飾り', help: '最大 MP が 10 上がる' },
    'quiet-amulet': { name: '静寂よけの護符', help: '沈黙にならない' },
    'steady-bangle': { name: '不動の腕輪', help: '詠唱中に受けるダメージが増えない' },
    'altar-crown': { name: '主の宝冠', help: '祭壇の主が戴いていた冠。店では手に入らない' },
  } as Readonly<Record<string, { name: string; help: string }>>,

  /** 装備の値の短い名前（「攻撃力 +3」のように使う） */
  equipStatNames: {
    maxHp: 'HP',
    maxMp: 'MP',
    attack: '攻撃力',
    magic: '魔力',
    speed: '素早さ',
    move: '移動',
    jump: 'ジャンプ',
  } satisfies Record<keyof UnitStats, string>,

  /** 装備の特別な効果 */
  equipmentEffect: (effect: EquipmentEffect, statusName: (id: StatusId) => string): string =>
    effect.kind === 'statusImmunity' ? `${statusName(effect.status)}を防ぐ` : '詠唱中の被ダメージ増加を打ち消す',
  /** 戦闘中、装備で状態変化を防いだ時 */
  equipmentBlocked: (item: string, status: string) => `${item}: ${status}を防いだ`,
  /** 情報の欄の装備 */
  equipmentInfo: (names: readonly string[]) => `装備: ${names.join('・')}`,
  gold: (n: number) => `${n} G`,

  teams: {
    player: '味方',
    enemy: '敵',
    neutral: '物',
  } satisfies Record<Team, string>,

  /** ユニットの名前。id で引く（最初の部隊の5人は人物の id。フェーズ2-6 で物語の確定に合わせて名前を変えた） */
  unitNames: {
    touma: 'トウマ',
    gord: 'ゴード',
    kiri: 'キリ',
    fen: 'フェン',
    nono: 'ノノ',
    'e-warrior-1': '敵の戦士A',
    'e-warrior-2': '敵の戦士B',
    'e-archer-1': '敵の弓使い',
    'e-mage-1': '敵の魔道士',
    'e-healer-1': '敵の治癒師',
    'e-knight-1': '敵の騎士',
    'e-thief-1': '敵の盗賊',
    'e-magicKnight-1': '敵の魔法剣士',
    'e-monk-1': '敵の格闘家',
    'e-timeMage-1': '敵の時魔道士',
    'e-summoner-1': '敵の召喚士',
    'r3-boss': '祭壇の主',
  } as Readonly<Record<string, string>>,

  /** 攻撃対象から見た、攻撃側の位置 */
  sides: {
    front: '正面',
    side: '側面',
    back: '背面',
  } satisfies Record<RelativeSide, string>,

  buttons: {
    attack: '攻撃',
    targetUnit: 'ユニットを狙う',
    targetTile: 'マスを狙う',
    interrupt: '詠唱をやめる',
    keepCasting: 'やめない',
    wait: '待機',
    undoMove: '移動をやり直す',
    back: '戻る',
    confirm: '確定',
    /** 向きを決めて手番を終える */
    endTurn: '確定',
    retry: 'もう一度',
    rotateLeft: '左に回す',
    rotateRight: '右に回す',
    zoomIn: '拡大',
    zoomOut: '縮小',
    resetView: '視点を戻す',
    /** 「視点を戻す」ボタンの中に出す短い表記 */
    resetViewShort: '戻す',
    cameraHeight: 'カメラの高さ',
    /** 「カメラの高さ」ボタンの中に出す短い表記 */
    cameraHeightShort: '高さ',
  },

  /** 手番の終わりの向きを選ぶボタン（画面上の置き場所で呼ぶ。方角名は使わない） */
  facing: {
    slots: {
      upRight: '右上を向く',
      downRight: '右下を向く',
      downLeft: '左下を向く',
      upLeft: '左上を向く',
    },
  },

  /** 画面の隅に出す版（ビルドした日時）と、新しい版の案内 */
  version: {
    label: (builtAt: string) => `版 ${builtAt}`,
    dev: '版 開発中',
    update: '新しい版があります。更新',
  },

  /** カメラの高さの段階（低い → 標準 → 高い） */
  cameraHeights: ['低い', '標準', '高い'] as readonly string[],

  hints: {
    playerTurn: '青いマスをタップで移動',
    afterMove: '行動か「待機」を選ぶ',
    chooseTarget: '赤く光る敵をタップ',
    noTarget: '攻撃できる相手がいません',
    chooseFacing: '最も近い敵の方を向いています。よければ「確定」（変える時は矢印）',
    enemyTurn: '敵の手番',
    chooseAbility: (mp: number, maxMp: number) => (maxMp > 0 ? `使うものを選ぶ（残り MP ${mp} / ${maxMp}）` : '使うものを選ぶ'),
    chooseStrikeTarget: (name: string) => `「${name}」: 赤く光る敵をタップ`,
    chooseSpellTarget: '紫のマスから、狙う場所をタップ',
    chooseReviveTarget: '射程の中の、戦闘不能のユニットをタップ',
    chooseAllyTarget: '射程の中の味方をタップ',
    chooseEnemyTarget: '射程の中の敵をタップ',
    chooseTargetKind: 'ユニットを追いかけて狙うか、そのマスに撃つかを選ぶ',
    targetKindHelp: 'ユニット: 動いても追いかける ／ マス: 動かれると外れる',
    charging: (spell: string) => `「${spell}」を詠唱中。「待機」で詠唱を続ける`,
    confirmInterrupt: (spell: string) => `「${spell}」の詠唱を中断しますか？ MP は戻りません`,
  },

  spellPreview: {
    title: (spell: string) => `「${spell}」の予測`,
    damage: 'ダメージ',
    heal: '回復',
    /** 発動が行動順の何番目か（今の手番を 1 番目として数える） */
    timing: (n: number) => `発動: 行動順の ${n} 番目`,
    targetUnit: (name: string) => `狙い: ${name}（動いても追いかける）`,
    targetTile: '狙い: このマス（動かれると外れる）',
    nobody: '今のままでは誰もいません',
    note: '今のまま誰も動かなかった場合',
    allyWarning: (n: number) => `⚠ 味方 ${n} 体を巻き込みます`,
    enemyHealWarning: (n: number) => `⚠ 敵 ${n} 体も回復します`,
    /** 蘇生の予測（フェーズ2-5）: 復帰した後の HP */
    revive: (hp: number, maxHp: number) => `復帰後の HP ${hp} / ${maxHp}`,
    reviveNobody: '戦闘不能の味方がいません',
    enemyReviveWarning: (n: number) => `⚠ 敵 ${n} 体を復帰させます`,
    mp: (cost: number, mp: number) => `MP ${cost} 消費（残り ${mp - cost}）`,
    status: (status: string) => `${status}を付ける`,
    interrupt: '（詠唱を中断）',
    reduced: (names: string) => `（${names}で軽減）`,
    /** 向きと高低差の補正が掛かる技（狙い撃ち）の、相手ごとの補正 */
    angle: (side: string, height: string) => `（${side}・高低差 ${height}）`,
    /** 詠唱のない業（時守。フェーズ2-6） */
    instant: '詠唱なし（すぐに発動）',
    /** 敵だけ・味方だけに効く（召喚。フェーズ2-6） */
    affects: { enemies: '敵だけに効く（赤い範囲）', allies: '味方だけに効く（緑の範囲）' } as const,
    rewind: (before: number, after: number) => `HP ${before} → ${after}（前回の手番の始め）`,
    /** 詠唱のない業の狙い（追いかける必要がないので、相手の名前だけ） */
    targetInstant: (name: string) => `相手: ${name}`,
    rewindNone: '今の HP の方が高いので、変わらない',
    delay: (ct: number, from: number, to: number) => `CT -${ct}（行動順 ${from} → ${to} 番目）`,
    delayNone: 'CT が 0 なので、変わらない',
    swap: '位置を入れ替える',
    /** 踏みとどまるで耐える時 */
    endures: (name: string) => `（「${name}」で HP 1 残る）`,
  },

  /** 行動順の欄の、魔法の発動の説明 */
  spellTiming: (caster: string, spell: string) => `${caster}の「${spell}」が発動`,
  /** 詠唱中のユニットの説明 */
  chargingInfo: (spell: string) => `詠唱中: ${spell}`,
  /** 戦闘不能（フェーズ2-5） */
  knockout: {
    /** 頭上の札（残りのカウント） */
    badge: (count: number) => `退 ${count}`,
    /** 退場しないユニットの頭上の札（戦闘で人は死なない決まり） */
    badgeStay: '膝',
    badgeTitle: '戦闘不能（数字は退場までの残りのカウント）',
    /** 情報の欄 */
    info: (count: number) => `戦闘不能: 残りカウント ${count}（0 で戦場から退く。それまでなら蘇生できる）`,
    infoStay: '戦闘不能（この戦闘では退場しない。蘇生できる）',
    retiredInfo: '退場（この戦闘では蘇生できません）',
    /** 浮かぶ文言 */
    down: '戦闘不能',
    count: (count: number) => `カウント ${count}`,
    retired: '退場',
    /** 種類ごとの、退場の時に浮かぶ文言（戦闘で人は死なない決まり） */
    retiredByKind: { human: '退場', beast: '退いた', shade: '石に戻った' } as Readonly<Record<string, string>>,
    revived: '復帰！',
  },
  /** ジョブのマスター（フェーズ2-5） */
  mastery: {
    /** 戦闘中に頭上に出す */
    pop: (job: string) => `${job} マスター！`,
    /** 戦闘中の帯 */
    banner: (name: string, job: string) => `${name}: ${job}をマスター！`,
    /** 編成の画面のジョブに付ける印 */
    mark: '★',
    markTitle: 'マスター',
    /** 編成で習得してマスターした時の知らせ */
    toast: (job: string, bonus: number) => `${job}をマスターした！ 成長の上限 +${bonus}`,
    /** 結果の画面の札 */
    reportTag: (job: string) => `${job} マスター！`,
    /** 能力のタブの、成長の上限の内訳 */
    capNote: (n: number, bonus: number) => `マスター ${n} 個で上限 +${bonus}`,
  },
  /** 情報の欄の、状態変化（残りの手番数つき） */
  statusInfo: (name: string, help: string, turns: number) => `${name}（${help}）残り ${turns} 手番`,
  /** 情報の欄の、付けている受動的なアビリティ */
  passiveInfo: (slot: string, name: string) => `${slot}: ${name}`,
  fizzled: '不発',
  /** 停止で手番が過ぎた（フェーズ2-6） */
  turnSkipped: '停止中',
  ctDelayed: (n: number) => `CT -${n}`,
  swapped: '入れ替わった',
  /** 盗み（フェーズ2-6） */
  stole: {
    gold: (n: number) => `+${n} G`,
    item: (name: string) => `${name}を奪った`,
    failed: '盗めなかった',
    /** 盗んだ時に画面の上に出す（PR #17 の回答: 勝った時だけ持ち帰れる） */
    keepGold: (n: number) => `${n} G を盗んだ（勝てば持ち帰れる）`,
    keepItem: (name: string) => `${name}を盗んだ（勝てば持ち帰れる）`,
  },
  cleared: '状態変化が解けた',
  interrupted: '中断',

  /** アビリティのボタンに添える、使えない理由 */
  abilityBlocked: {
    weapon: (weapon: string) => `${weapon}が必要`,
    silence: '沈黙中',
    noDowned: '戦闘不能の味方なし',
  },

  preview: {
    title: '攻撃の予測',
    strikeTitle: (name: string) => `「${name}」の予測`,
    hit: '命中率',
    damage: 'ダメージ',
    height: '高低差',
    direction: '向き',
    /** 相手が詠唱中で、受けるダメージが増える時 */
    charging: (percent: number) => `詠唱中のため ×${percent / 100}`,
    /** 高低差の補正（%）の表示。0 なら「なし」 */
    heightPercent: (percent: number) => (percent === 0 ? 'なし' : `${percent > 0 ? '+' : ''}${percent}%`),
    /** 補正の内訳 */
    evade: (name: string, n: number) => `相手の「${name}」で命中 -${n}`,
    focus: (name: string, n: number) => `「${name}」で命中 +${n}`,
    protect: (percent: number) => `相手は守り: ダメージ ×${percent / 100}`,
    knockback: '押し出し',
    knockbackTo: (fall: number) => (fall > 0 ? `光る先へ押し出す（落下 ${fall}）` : '光る先へ押し出す'),
    knockbackBlocked: (reason: string, damage: number) => `押し出せない（${reason}）。追加 ${damage}`,
    knockbackReasons: { edge: 'マップの端', unit: 'ユニットがいる', cliff: '高い段差' } as Readonly<Record<string, string>>,
    /** 当たって HP が尽きない時の合計 */
    total: (damage: number, hp: number) => `合計 ${damage}（HP → ${hp}）`,
    inflicts: (status: string) => `当たると${status}を付ける`,
    /** 相手の装備で状態変化を防がれる時 */
    blocked: (item: string, status: string) => `${status}は「${item}」で防がれる`,
    interrupts: '当たると詠唱を中断させる',
    counter: '反撃あり',
    counterDetail: (damage: number, hit: number) => `受ける見込み ${damage}（命中 ${hit}%）`,
    counterNote: '当たって相手の HP が尽きなければ',
    /** 斬り分けで巻き込む敵（フェーズ2-6） */
    sweepLabel: '巻き込む',
    sweepTarget: (name: string, damage: number, hit: number) => `${name} ${damage}（命中 ${hit}%）`,
    blind: (n: number) => `目くらましで命中 -${n}`,
    /** フェーズ2-6: 騎士・格闘家・盗賊 */
    parry: (name: string, n: number) => `相手の「${name}」で命中 -${n}`,
    cover: (name: string, ability: string) => `${name}が「${ability}」で代わりに受ける`,
    hits: (n: number) => `${n}回攻撃（1回ごとに命中を判定）`,
    stealTitle: (name: string) => `「${name}」の予測`,
    stealPercent: '成功率',
    stealGold: (gold: number) => `成功すると ${gold} G（勝てば持ち帰れる）`,
    stealItem: (item: string) => `成功すると「${item}」を奪う（勝てば持ち帰れる）`,
    stealNothing: '盗める装備がありません',
    backstabNote: '背面からなら 2 倍',
    endures: (name: string) => `相手の「${name}」で HP 1 残る`,
  },

  hp: 'HP',
  miss: 'ミス',
  turnOrder: '行動順',
  turnNumber: (n: number) => `${n}手番目`,
  mp: 'MP',
  stats: {
    magic: '魔力',
    attack: '攻撃',
    move: '移動',
    jump: 'ジャンプ',
    speed: '素早さ',
  },

  result: {
    player: '勝利',
    enemy: '敗北',
  } satisfies Record<Side, string>,
  resultDetail: (turns: number) => `${turns}手番で決着`,

  /** 能力値の名前（編成の画面） */
  statNames: {
    maxHp: 'HP',
    maxMp: 'MP',
    attack: '攻撃力',
    magic: '魔力',
    speed: '素早さ',
  } satisfies Record<GrowthStat, string>,

  /** 敵の強さの段階（level は敵のレベル） */
  tiers: {
    easy: { name: 'やさしい', help: (level: number) => `敵は Lv ${level}。最初の部隊と同じ強さ` },
    normal: { name: 'ふつう', help: (level: number) => `敵は Lv ${level}。技を1つずつ覚えている` },
    hard: { name: 'むずかしい', help: (level: number) => `敵は Lv ${level}。すべての技と魔法を覚えている` },
  } as Readonly<Record<string, { name: string; help: (level: number) => string }>>,

  /** 拠点の画面 */
  base: {
    title: '拠点',
    sortie: '出撃',
    roster: '編成',
    shop: '店',
    gold: (n: number) => `所持金 ${n} G`,
    newGame: 'はじめから',
    confirmNewGame: '部隊の育成の記録をすべて消して、はじめからにしますか？ 元には戻せません',
    confirmNewGameYes: '消して、はじめから',
    cancel: 'やめる',
    chooseTier: (mapName: string) => `${mapName}で戦う。敵の強さを選ぶ`,
    /** 出撃先の選択 */
    chooseSortie: 'どこへ出撃しますか',
    training: '訓練戦',
    trainingHelp: (mapName: string) => `${mapName}で、敵の強さを選んで戦う`,
    dungeon: (name: string) => name,
    dungeonHelp: '3連戦。戦闘ごとに目的が違う',
    /** ダンジョンの画面 */
    dungeonIntro: '3連戦。戦闘の間に全回復し、編成を変えられます。進み具合は自動で保存されます',
    battleLabel: (n: number, mapName: string) => `第${n}戦「${mapName}」`,
    battleHelp: (objective: string) => `勝利: ${objective}`,
    challenge: '挑む',
    resume: (n: number, mapName: string) => `第${n}戦「${mapName}」から再開`,
    restart: '第1戦から挑み直す',
    confirmRestart: '今の挑戦をやめて、第1戦から挑み直しますか？（得た経験値と JP はそのまま）',
    confirmRestartYes: '第1戦から挑み直す',
    inProgress: (n: number) => `挑戦中: 次は第${n}戦`,
    clears: (n: number) => (n > 0 ? `クリア ${n} 回` : 'まだクリアしていません'),
    clearedBadge: (name: string, n: number) => `${name}: クリア済み（${n} 回）`,
    back: '戻る',
    saved: '部隊の状態は、この端末に自動で保存されます',
    /** 途中の戦闘（フェーズ2-5） */
    suspendedTraining: (tier: string) => `途中の戦闘: 訓練戦（${tier}）`,
    suspendedStory: (book: string) => `途中の戦闘: ${book}`,
    suspendedDungeon: (name: string, n: number, mapName: string) => `途中の戦闘: ${name} 第${n}戦「${mapName}」`,
    suspendedNote: '戦闘の途中です。編成と店は、戦闘を終えると使えます',
    resumeBattle: '戦闘を再開',
    resumeBattleHelp: '閉じた時の続きから',
    retreatBattle: '撤退する',
    retreatBattleHelp: '得た経験値と JP は持ち帰れます',
    confirmRetreat: 'この戦闘から撤退しますか？ 負けとして扱います（得た経験値と JP は持ち帰れます。ゴールドと戦利品はありません。ダンジョンなら挑戦も終わります）',
    confirmRetreatYes: '撤退する',
  },

  /** 戦闘中の経験値・JP・レベルアップの表示（フェーズ2-3） */
  gain: {
    exp: (n: number) => `+${n} EXP`,
    jp: (n: number) => `+${n} JP`,
    levelUp: 'レベルアップ！',
    levelUpShort: (level: number) => `Lv ${level}↑`,
    levelUpBanner: (name: string, level: number) => `${name} Lv ${level}`,
    jobLevelUp: (job: string, level: number) => `${job} Lv ${level}`,
    /** 情報の欄 */
    expToNext: (n: number) => `次まで ${n} EXP`,
    maxLevel: 'Lv 上限',
    jpHave: (n: number) => `JP ${n}`,
  },

  /** 戦闘の結果の画面（フェーズ2-3: 得た合計と、レベルが上がったユニットのまとめ） */
  report: {
    keep: '負けても、得た経験値と JP は持ち帰れます',
    totalsTitle: 'この戦闘で得た合計',
    levelUpsTitle: 'レベルアップ・新しいジョブ',
    exp: (n: number) => `${n} EXP`,
    jp: (n: number) => `${n} JP`,
    bonus: (jp: number) => `勝利ボーナス: 全員に経験値と ${jp} JP`,
    levelChip: (name: string, from: number, to: number) => `${name} Lv ${from}→${to}`,
    jobLevelTag: (job: string, level: number) => `${job} Lv ${level}`,
    /** 脱力の罠でレベルが下がった（成長値の仕組みは説明しない） */
    levelDown: (name: string, n: number) => `${name} 体から力が抜けた（Lv −${n}）`,
    canLearnTag: '習得可',
    toBase: '拠点へ戻る',
    /** ダンジョンの戦闘の間 */
    dungeonTitle: (n: number, mapName: string) => `第${n}戦「${mapName}」`,
    healed: '次の戦闘の前に全員が全回復します',
    next: (n: number, mapName: string) => `第${n}戦「${mapName}」へ進む`,
    editRoster: '編成を変える',
    suspend: '拠点へ戻る（続きは次回）',
    retry: 'この戦闘をやり直す',
    retreat: '撤退して拠点へ戻る',
    lostNote: 'やり直しても撤退しても、得た経験値と JP は持ち帰れます',
    /** 途中の戦闘から撤退した（フェーズ2-5） */
    retreatTitle: '撤退しました',
    retreatNote: 'それまでに得た経験値と JP は持ち帰りました',
    retreatDungeonNote: 'それまでに得た経験値と JP は持ち帰りました。ダンジョンの挑戦は終わりです',
    /** クリアの画面 */
    clearTitle: (name: string) => `${name} クリア！`,
    firstClear: '初めてのクリア！',
    reward: (jp: number) => `報酬: 全員の今のジョブに JP +${jp}`,
    /** ゴールドと戦利品（フェーズ2-4） */
    spoilsTitle: '手に入れた物',
    goldGain: (n: number, total: number) => `+${n} G（所持金 ${total} G）`,
    noSpoils: 'なし（負けた時は、ゴールドと戦利品は得られません）',
    bossItem: (name: string) => `祭壇の主から「${name}」を手に入れた！`,
    /** 戦利品の欄で、ボスからの初回の報酬に付ける印 */
    specialItem: (name: string) => `★ ${name}（祭壇の主から）`,
    /** 盗賊が盗んだ装備（フェーズ2-6） */
    stolenItem: (name: string) => `盗んだ ${name}`,
  },

  /** 店（フェーズ2-4） */
  shop: {
    title: '店',
    back: '戻る',
    close: '閉じる',
    tabs: { buy: '買う', sell: '売る' } as Readonly<Record<string, string>>,
    empty: '売れる物がありません',
    price: (n: number) => `${n} G`,
    sellPrice: (n: number) => `売値 ${n} G`,
    wornBy: (name: string) => `${name}が装備中`,
    owned: (n: number) => `持っている数 ${n}`,
    whoCanEquip: '部隊のだれが装備できるか（付け替えた時の能力値）',
    cannotEquip: '装備できない',
    sameAsNow: '今と同じ',
    buy: (n: number) => `買う（${n} G）`,
    sell: (n: number) => `売る（+${n} G）`,
    bought: (name: string) => `${name}を買いました。編成の「装備」で付けられます`,
    sold: (name: string, n: number) => `${name}を売りました（+${n} G）`,
    buyRefusal: {
      notInStock: '品切れ',
      notEnoughGold: 'ゴールドが足りません',
    } satisfies Record<BuyRefusal, string>,
    sellRefusal: {
      notOwned: '持っていません',
      equipped: '装備中の物は売れません（編成で外すと売れます）',
    } satisfies Record<SellRefusal, string>,
    newStock: '品ぞろえは、ダンジョンのクリアや訓練戦の勝利で増えます',
  },

  /** 編成の画面（フェーズ2-3 で作り直し。項目名と数値で伝わる所には、説明の文を置かない） */
  roster: {
    title: '編成',
    back: '戻る',
    close: '閉じる',
    level: (lv: number) => `Lv ${lv}`,
    tabs: { stats: '能力', job: 'ジョブ', abilities: 'アビリティ', learn: '習得', equip: '装備' } as Readonly<Record<string, string>>,
    // 能力
    expToNext: (n: number) => `次のレベルまで ${n} EXP`,
    maxLevel: 'レベルの上限',
    legendBase: '基本',
    legendGrowth: '成長値',
    legendEquip: '装備',
    growthTotal: '成長の合計',
    moveJump: (move: number, jump: number) => `移動 ${move} ・ ジャンプ ${jump}`,
    weapon: (w: string) => `武器 ${w}`,
    // ジョブ
    jobLevel: (lv: number) => `ジョブ Lv ${lv}`,
    jobLevelOf: (job: string, lv: number) => `${job} Lv ${lv}`,
    jp: (n: number) => `JP ${n}`,
    jpToNext: (n: number) => `次のジョブ Lv まで ${n} JP`,
    jobMaxLevel: 'ジョブ Lv の上限',
    current: '今のジョブ',
    locked: 'まだ就けません',
    unlockNeeds: (job: string, lv: number) => `${job} Lv ${lv} が必要`,
    unlockNeedsMastery: (job: string) => `${job}のマスターが必要`,
    /** 解放条件と今の達成の具合（フェーズ2-6） */
    unlockProgress: (job: string, lv: number, now: number) => `${job} Lv ${lv}（今 ${now}）`,
    unlockMasteryProgress: (job: string, done: boolean) => `${job}をマスター（${done ? '済み' : 'まだ'}）`,
    lockedTitle: (job: string) => `${job}の解放条件`,
    lockedNote: '条件をすべて満たすと、このジョブに就けます',
    /** 専用ジョブの札（特定の人物だけが就ける） */
    exclusive: '専用',
    exclusiveNote: (name: string) => `${name}だけが就ける専用ジョブ`,
    /** 解放条件を満たした瞬間の知らせ */
    unlockToast: (name: string, job: string) => `${name}が「${job}」に就けるようになった！`,
    /** 結果の画面の札 */
    unlockChip: (parts: string) => `解放: ${parts}`,
    unlockPart: (name: string, jobs: string) => `${name} ${jobs}`,
    changeJobTitle: (job: string) => `${job}に変える`,
    compareNow: '今',
    compareAfter: '変更後',
    rateTitle: '成長率（1レベルごと）',
    becomeJob: (job: string) => `${job}になる`,
    /** ジョブを変えると外れる装備（フェーズ2-4） */
    willRemove: (names: string) => `外れる装備: ${names}（新しいジョブでは付けられません）`,
    removed: (unit: string, names: string) => `${unit}の${names}が外れました（新しいジョブでは付けられません）`,
    // 装備（フェーズ2-4）
    autoEquip: 'おまかせ',
    autoEquipHelp: '持っている物から、今のジョブに合う最も強い組み合わせを付けます',
    chooseEquip: (slot: string) => `${slot}を選ぶ`,
    noEquipChoices: '付けられる物を持っていません（店で買えます）',
    wornByOther: (name: string) => `${name}が装備中（付け替えます）`,
    wearing: '装備中',
    equipRefusal: {
      notOwned: '持っていません',
      wrongSlot: '枠が違います',
      cannotEquip: 'このジョブでは付けられません',
    } satisfies Record<EquipRefusal, string>,
    // アビリティ
    mainCommand: '主コマンド',
    subCommand: '副コマンド',
    none: 'なし',
    mainCommandNote: '主コマンドは今のジョブで決まります',
    toJobTab: 'ジョブを変える',
    chooseFor: (slot: string) => `${slot}を選ぶ`,
    remove: '外す',
    noChoices: '付けられるものがまだありません',
    noneLearned: '習得済みのものがありません',
    // 習得
    learnGroups: {
      action: '行動',
      reaction: 'リアクション',
      support: 'サポート',
      movement: 'ムーブ',
    } as Readonly<Record<string, string>>,
    learned: '習得済み',
    jpCost: (cost: number) => `${cost} JP`,
    starterCost: '就くと覚える',
    learnButton: (cost: number) => `習得する（${cost} JP）`,
    equip: '付ける',
    unequip: '外す',
    equipped: '付けている',
    condJob: (job: string) => `${job}で習得`,
    condJp: (job: string, cost: number, have: number) => `${job}の JP ${cost}（今 ${have}）`,
    condJobLevel: (job: string, lv: number, now: number) => `${job} Lv ${lv} 以上（今 ${now}）`,
    condStarter: (job: string) => `${job}に就くと覚える`,
    refusal: {
      unknownAbility: '覚えられません',
      alreadyLearned: '習得済み',
      notEnoughJp: 'JP が足りません',
      jobLocked: 'ジョブが解放されていません',
      jobLevelTooLow: 'ジョブのレベルが足りません',
    } satisfies Record<LearnRefusal, string>,
  },
} as const;

export function unitName(id: string, jobId: string): string {
  if (jobId.startsWith(OBJECT_JOB_PREFIX)) return TEXT.objectNames[jobId.slice(OBJECT_JOB_PREFIX.length)] ?? id;
  return TEXT.unitNames[id] ?? TEXT.jobs[jobId] ?? id;
}

/** 対象物（物語の土台）の名前を unitName で引くための、ジョブの欄の書き方（`object:種類`） */
export const OBJECT_JOB_PREFIX = 'object:';
/** 対象物の名前（ジョブの欄を `object:種類` にして unitName に渡す） */
export const objectJobId = (kind: string) => `${OBJECT_JOB_PREFIX}${kind}`;
