/**
 * 画面に出す文言をまとめた場所。
 * 文言はここ以外に書かない（将来の翻訳と表記の統一のため）。
 * core は文言を作らず、出来事や状態（例: 地形 'grass'、向き 'back'）だけを返す。それを文言に変えるのがここの役割。
 */
import type { ArmorType, EquipmentEffect, EquipSlot, GrowthStat, PassiveSlot, SpellElement, StatusId, Team, UnitStats, WeaponType } from '../core/battleTypes';
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
  } as Readonly<Record<string, string>>,

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
    defeatAll: '敵の全滅',
    defeatUnit: (name: string) => `${name}の撃破`,
    reachTile: '味方のだれかが光る輪のマスに到達',
    reachTileShort: '光る輪のマスに到達',
    surviveTurns: (n: number) => `${n}手番を耐える`,
    allDefeated: '味方の全滅',
    unitDefeated: (name: string) => `${name}が倒れる`,
    turnLimit: (n: number) => `${n}手番を過ぎる`,
    /** 手番数の条件の残り（今の手番を含む） */
    turnsLeft: (n: number) => `残り ${n} 手番`,
    /** 増援の予告（after: 何手番後に現れるか。0 ならこの手番の後） */
    reinforcement: (count: number, after: number) =>
      after <= 0 ? `増援 ${count} 体: この手番の後に現れる（赤い枠のマス）` : `増援 ${count} 体: ${after} 手番後に現れる（赤い枠のマス）`,
    reinforcementShort: (after: number) => (after <= 0 ? '増援 まもなく' : `増援 あと ${after} 手番`),
    /** 撃破の対象の敵の情報の欄に出す札 */
    targetTag: '★ 撃破の対象',
    /** 頭上の札 */
    targetBadge: '★',
    /** 敵の全滅は常に勝利、味方の全滅は常に敗北 */
    alwaysNote: '敵が全滅しても勝利、味方が全滅すると敗北です',
  },

  /** マップ上のイベントのメッセージ（messageId で引く） */
  messages: {
    ruinsEntranceIntro: '遺跡の入口を守る敵がいる。高い所を取って戦おう',
    ruinsCorridorIntro: '回廊の奥の扉を目指せ。後ろから敵が迫ってくる',
    reinforcementBehind: '後ろから足音が近づいてくる……',
    ruinsAltarIntro: '祭壇の主が強力な魔法を唱える。予約された範囲から逃げるか、詠唱を止めよう',
    ruinsAltarRage: '祭壇の主が仲間を呼んだ！',
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
  } satisfies Record<Terrain, string>,

  jobs: {
    warrior: '戦士',
    archer: '弓使い',
    mage: '魔術師',
    healer: '癒し手',
  } as Readonly<Record<string, string>>,

  /** 行動順の欄に出す、ジョブの1文字の略 */
  jobShort: {
    warrior: '戦',
    archer: '弓',
    mage: '魔',
    healer: '癒',
  } as Readonly<Record<string, string>>,

  /** ジョブのコマンド（行動アビリティのまとまり）の名前。ジョブの id で引く */
  commands: {
    warrior: '武技',
    archer: '弓術',
    mage: '攻撃魔法',
    healer: '回復魔法',
  } as Readonly<Record<string, string>>,

  /** アビリティ（行動アビリティと、受動的なアビリティ）の名前。id で引く */
  abilities: {
    fire: '炎',
    wind: '風',
    thunder: '雷',
    heal: '癒し',
    bigHeal: '大癒し',
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
  } as Readonly<Record<string, string>>,

  /** 行動アビリティの短い説明（編成の画面で、習得する前に見る） */
  abilityHelp: {
    fire: '範囲（5マス）の攻撃魔法。詠唱は遅い',
    wind: '単体の攻撃魔法。詠唱は速い',
    thunder: '単体の強い攻撃魔法。詠唱はとても遅い',
    heal: '範囲（5マス）の回復魔法。詠唱は速い',
    bigHeal: '単体の大きな回復魔法',
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
  } as Readonly<Record<string, string>>,

  /** 状態変化の名前 */
  statuses: {
    protect: '守り',
    slow: '鈍足',
    silence: '沈黙',
  } satisfies Record<StatusId, string>,

  /** 頭上に出す、状態変化の1文字の目印 */
  statusShort: {
    protect: '守',
    slow: '鈍',
    silence: '沈',
  } satisfies Record<StatusId, string>,

  /** 状態変化の短い説明（情報の欄） */
  statusHelp: {
    protect: '受けるダメージ -25%',
    slow: '移動力 -2',
    silence: '魔法を使えない',
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
    none: '無',
  } satisfies Record<SpellElement, string>,

  /** 武器の種類 */
  weapons: {
    sword: '剣',
    bow: '弓',
    staff: '杖',
  } satisfies Record<WeaponType, string>,

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
    'sword-1': { name: '銅の剣', help: '手になじむ、基本の剣' },
    'sword-2': { name: '鋼の剣', help: 'よく鍛えられた剣' },
    'sword-3': { name: '白銀の剣', help: '名工の打った、鋭い剣' },
    'bow-1': { name: '狩人の弓', help: '扱いやすい短い弓' },
    'bow-2': { name: '長弓', help: '遠くまで力強く射られる弓' },
    'bow-3': { name: '風切りの弓', help: '風を裂いて飛ぶ、名工の弓' },
    'staff-1': { name: '樫の杖', help: '魔力を通しやすい木の杖' },
    'staff-2': { name: '水晶の杖', help: '先の水晶が魔力を集める' },
    'staff-3': { name: '星詠みの杖', help: '星の力を宿すという杖' },
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
  } satisfies Record<Team, string>,

  /** ユニットの名前。id で引く（hero-1〜5 は最初の部隊の5人） */
  unitNames: {
    'hero-1': 'トウマ',
    'hero-2': 'バルト',
    'hero-3': 'ミレイ',
    'hero-4': 'セイル',
    'hero-5': 'リネ',
    'e-warrior-1': '敵の戦士A',
    'e-warrior-2': '敵の戦士B',
    'e-archer-1': '敵の弓使い',
    'e-mage-1': '敵の魔術師',
    'e-healer-1': '敵の癒し手',
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
    mp: (cost: number, mp: number) => `MP ${cost} 消費（残り ${mp - cost}）`,
    status: (status: string) => `${status}を付ける`,
    interrupt: '（詠唱を中断）',
    reduced: (names: string) => `（${names}で軽減）`,
    /** 向きと高低差の補正が掛かる技（狙い撃ち）の、相手ごとの補正 */
    angle: (side: string, height: string) => `（${side}・高低差 ${height}）`,
  },

  /** 行動順の欄の、魔法の発動の説明 */
  spellTiming: (caster: string, spell: string) => `${caster}の「${spell}」が発動`,
  /** 詠唱中のユニットの説明 */
  chargingInfo: (spell: string) => `詠唱中: ${spell}`,
  /** 情報の欄の、状態変化（残りの手番数つき） */
  statusInfo: (name: string, help: string, turns: number) => `${name}（${help}）残り ${turns} 手番`,
  /** 情報の欄の、付けている受動的なアビリティ */
  passiveInfo: (slot: string, name: string) => `${slot}: ${name}`,
  fizzled: '不発',
  interrupted: '中断',

  /** アビリティのボタンに添える、使えない理由 */
  abilityBlocked: {
    weapon: (weapon: string) => `${weapon}が必要`,
    silence: '沈黙中',
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
    /** 当たって倒れない時の合計 */
    total: (damage: number, hp: number) => `合計 ${damage}（HP → ${hp}）`,
    inflicts: (status: string) => `当たると${status}を付ける`,
    /** 相手の装備で状態変化を防がれる時 */
    blocked: (item: string, status: string) => `${status}は「${item}」で防がれる`,
    interrupts: '当たると詠唱を中断させる',
    counter: '反撃あり',
    counterDetail: (damage: number, hit: number) => `受ける見込み ${damage}（命中 ${hit}%）`,
    counterNote: '当たって相手が倒れなければ',
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
  } satisfies Record<Team, string>,
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
    levelUpsTitle: 'レベルが上がったユニット',
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
    /** クリアの画面 */
    clearTitle: (name: string) => `${name} クリア！`,
    firstClear: '初めてのクリア！',
    reward: (jp: number) => `報酬: 全員の今のジョブに JP +${jp}`,
    /** ゴールドと戦利品（フェーズ2-4） */
    spoilsTitle: '手に入れた物',
    goldGain: (n: number, total: number) => `+${n} G（所持金 ${total} G）`,
    noSpoils: 'なし（負けた時は、ゴールドと戦利品は得られません）',
    bossItem: (name: string) => `祭壇の主から「${name}」を手に入れた！`,
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
  return TEXT.unitNames[id] ?? TEXT.jobs[jobId] ?? id;
}
