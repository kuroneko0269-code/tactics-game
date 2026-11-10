/**
 * 画面に出す文言をまとめた場所。
 * 文言はここ以外に書かない（将来の翻訳と表記の統一のため）。
 * core は文言を作らず、出来事や状態（例: 地形 'grass'、向き 'back'）だけを返す。それを文言に変えるのがここの役割。
 */
import type { SpellElement, Team } from '../core/battleTypes';
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

  /** 魔法の名前。id で引く */
  spells: {
    fire: '炎',
    wind: '風',
    heal: '癒し',
  } as Readonly<Record<string, string>>,

  /** 行動順の欄に出す、魔法の1文字の略 */
  spellShort: {
    fire: '炎',
    wind: '風',
    heal: '癒',
  } as Readonly<Record<string, string>>,

  /** 属性の名前 */
  elements: {
    fire: '炎',
    wind: '風',
    light: '光',
  } satisfies Record<SpellElement, string>,

  teams: {
    player: '味方',
    enemy: '敵',
  } satisfies Record<Team, string>,

  /** ユニットの名前。id で引く */
  unitNames: {
    'p-warrior-1': '戦士A',
    'p-warrior-2': '戦士B',
    'p-archer-1': '弓使い',
    'p-mage-1': '魔術師',
    'p-healer-1': '癒し手',
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
    magic: '魔法',
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
    afterMove: '「攻撃」か「待機」を選ぶ',
    chooseTarget: '赤く光る敵をタップ',
    noTarget: '攻撃できる相手がいません',
    chooseFacing: '最も近い敵の方を向いています。よければ「確定」（変える時は矢印）',
    enemyTurn: '敵の手番',
    chooseSpell: (mp: number, maxMp: number) => `使う魔法を選ぶ（残り MP ${mp} / ${maxMp}）`,
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

  preview: {
    title: '攻撃の予測',
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
} as const;

export function unitName(id: string, jobId: string): string {
  return TEXT.unitNames[id] ?? TEXT.jobs[jobId] ?? id;
}
