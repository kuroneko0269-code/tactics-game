/**
 * 画面に出す文言をまとめた場所。
 * 文言はここ以外に書かない（将来の翻訳と表記の統一のため）。
 * core は文言を作らず、出来事や状態（例: 地形 'grass'、向き 'back'）だけを返す。それを文言に変えるのがここの役割。
 */
import type { Team } from '../core/battleTypes';
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
  } as Readonly<Record<string, string>>,

  /** 行動順の欄に出す、ジョブの1文字の略 */
  jobShort: {
    warrior: '戦',
    archer: '弓',
  } as Readonly<Record<string, string>>,

  teams: {
    player: '味方',
    enemy: '敵',
  } satisfies Record<Team, string>,

  /** ユニットの名前。id で引く */
  unitNames: {
    'p-warrior-1': '戦士A',
    'p-warrior-2': '戦士B',
    'p-archer-1': '弓使いA',
    'p-archer-2': '弓使いB',
    'e-warrior-1': '敵の戦士A',
    'e-warrior-2': '敵の戦士B',
    'e-archer-1': '敵の弓使いA',
    'e-archer-2': '敵の弓使いB',
  } as Readonly<Record<string, string>>,

  /** 攻撃対象から見た、攻撃側の位置 */
  sides: {
    front: '正面',
    side: '側面',
    back: '背面',
  } satisfies Record<RelativeSide, string>,

  buttons: {
    attack: '攻撃',
    wait: '待機',
    undoMove: '移動を戻す',
    back: '戻る',
    confirm: '確定',
    decide: '決定',
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

  /** カメラの高さの段階（低い → 標準 → 高い） */
  cameraHeights: ['低い', '標準', '高い'] as readonly string[],

  hints: {
    playerTurn: '青いマスをタップで移動',
    afterMove: '「攻撃」か「待機」を選ぶ',
    chooseTarget: '赤く光る敵をタップ',
    noTarget: '攻撃できる相手がいません',
    chooseFacing: '矢印かマスをタップして向きを選び「決定」',
    enemyTurn: '敵の手番',
  },

  preview: {
    title: '攻撃の予測',
    hit: '命中率',
    damage: 'ダメージ',
    height: '高低差',
    direction: '向き',
    /** 高低差の補正（%）の表示。0 なら「なし」 */
    heightPercent: (percent: number) => (percent === 0 ? 'なし' : `${percent > 0 ? '+' : ''}${percent}%`),
  },

  hp: 'HP',
  miss: 'ミス',
  turnOrder: '行動順',
  turnNumber: (n: number) => `${n}手番目`,
  stats: {
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
