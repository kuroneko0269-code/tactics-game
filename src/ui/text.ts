/**
 * 画面に出す文言をまとめた場所。
 * 文言はここ以外に書かない（将来の翻訳と表記の統一のため）。
 * core は文言を作らず、出来事や状態（例: 地形 'grass'、向き 'back'）だけを返す。それを文言に変えるのがここの役割。
 */
import type { GrowthStat, SpellElement, Team, WeaponType } from '../core/battleTypes';
import type { LearnRefusal } from '../core/progression';
import type { RelativeSide } from '../core/geometry';
import type { Terrain } from '../core/map';

export const TEXT = {
  /** ブラウザのタブに出す題名（index.html にも同じ文言がある） */
  appTitle: 'Tactics Game（開発中）',

  mapNames: {
    'twin-hills': 'ふたつの丘',
  } as Readonly<Record<string, string>>,

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

  /** 行動アビリティ（魔法・技）の名前。id で引く */
  abilities: {
    fire: '炎',
    wind: '風',
    thunder: '雷',
    heal: '癒し',
    bigHeal: '大癒し',
    aimedShot: '狙い撃ち',
    powerStrike: '強打',
  } as Readonly<Record<string, string>>,

  /** 行動順の欄に出す、詠唱のある魔法・技の1文字の略 */
  abilityShort: {
    fire: '炎',
    wind: '風',
    thunder: '雷',
    heal: '癒',
    bigHeal: '大',
    aimedShot: '狙',
  } as Readonly<Record<string, string>>,

  /** 行動アビリティの短い説明（編成の画面で、習得する前に見る） */
  abilityHelp: {
    fire: '範囲（5マス）の攻撃魔法。詠唱は遅い',
    wind: '単体の攻撃魔法。詠唱は速い',
    thunder: '単体の強い攻撃魔法。詠唱はとても遅い',
    heal: '範囲（5マス）の回復魔法。詠唱は速い',
    bigHeal: '単体の大きな回復魔法',
    aimedShot: '狙いを付けてから撃つ。攻撃力の1.5倍、射程 3〜6。弓が必要',
    powerStrike: 'ダメージ1.5倍、命中率 -15%。剣か杖が必要',
  } as Readonly<Record<string, string>>,

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
  },

  /** 行動順の欄の、魔法の発動の説明 */
  spellTiming: (caster: string, spell: string) => `${caster}の「${spell}」が発動`,
  /** 詠唱中のユニットの説明 */
  chargingInfo: (spell: string) => `詠唱中: ${spell}`,
  fizzled: '不発',
  interrupted: '中断',

  /** アビリティのボタンに添える、使えない理由 */
  abilityBlocked: {
    weapon: (weapon: string) => `${weapon}が必要`,
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
    newGame: 'はじめから',
    confirmNewGame: '部隊の育成の記録をすべて消して、はじめからにしますか？ 元には戻せません',
    confirmNewGameYes: '消して、はじめから',
    cancel: 'やめる',
    chooseTier: (mapName: string) => `${mapName}で戦う。敵の強さを選ぶ`,
    back: '戻る',
    saved: '部隊の状態は、この端末に自動で保存されます',
  },

  /** 戦闘の結果の画面 */
  report: {
    title: '戦闘の結果',
    keep: '負けても、得た経験値と JP は持ち帰れます',
    exp: (n: number) => `経験値 +${n}`,
    jp: (job: string, n: number) => `${job}の JP +${n}`,
    levelUp: (before: number, after: number) => `レベルアップ！ Lv ${before} → ${after}`,
    jobLevelUp: (job: string, before: number, after: number) => `${job}のレベルアップ！ ${before} → ${after}`,
    toBase: '拠点へ戻る',
    canLearn: '習得できるアビリティがあります',
  },

  /** 編成の画面 */
  roster: {
    title: '編成',
    back: '戻る',
    level: (lv: number) => `Lv ${lv}`,
    expToNext: (n: number) => `次のレベルまで ${n}`,
    maxLevel: 'レベルの上限',
    jobLevel: (job: string, lv: number) => `${job} Lv ${lv}`,
    jp: (n: number) => `JP ${n}`,
    jpToNext: (n: number) => `次のジョブレベルまで ${n} JP`,
    jobMaxLevel: 'ジョブレベルの上限',
    growthCapped: '成長の上限に達しています',
    growthTotal: (points: number, cap: number) => `成長の合計 ${points} / ${cap}`,
    statsTitle: '能力値',
    statHeaders: ['', '能力値', '成長値', '成長率'] as readonly string[],
    moveJump: (move: number, jump: number) => `移動 ${move} ・ ジャンプ ${jump}`,
    weapon: (w: string) => `武器: ${w}`,
    abilitiesTitle: 'アビリティ',
    mainCommand: '主コマンド',
    subCommand: '副コマンド',
    none: 'なし',
    noneLearned: '（習得済みのものがありません）',
    changeJob: 'ジョブを変える',
    learn: 'アビリティを覚える',
    changeSub: '副コマンドを変える',
    jobListTitle: 'ジョブを選ぶ',
    jobListHelp: 'ジョブを選ぶと、能力値と成長率の変化が見られます',
    current: '今のジョブ',
    locked: 'まだ就けません',
    unlockNeeds: (job: string, lv: number) => `${job} Lv ${lv} が必要`,
    compareHeaders: ['', '今', '変更後', '成長率'] as readonly string[],
    becomeJob: (job: string) => `${job}になる`,
    learnTitle: 'アビリティを覚える',
    learnHelp: 'ジョブごとの JP を使って覚えます。JP はそのジョブで戦うと貯まります',
    learnButton: (cost: number) => `覚える（${cost} JP）`,
    learned: '習得済み',
    refusal: {
      unknownAbility: '覚えられません',
      alreadyLearned: '習得済み',
      notEnoughJp: 'JP が足りません',
      jobLocked: 'ジョブが解放されていません',
    } satisfies Record<LearnRefusal, string>,
    subTitle: '副コマンドを選ぶ',
    subHelp: 'ほかのジョブで覚えたアビリティを、1つのジョブぶん使えます',
    subNone: '副コマンドなし',
    noSubChoices: 'ほかのジョブで覚えたアビリティがまだありません',
  },
} as const;

export function unitName(id: string, jobId: string): string {
  return TEXT.unitNames[id] ?? TEXT.jobs[jobId] ?? id;
}
