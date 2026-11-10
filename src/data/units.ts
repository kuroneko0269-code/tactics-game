/**
 * 動作確認用の仮ユニット配置。
 * ジョブやアビリティの数値は、今後このフォルダ（src/data）に定義データとして追加していく。
 * コード側に数値を直接書かないこと。
 */
export interface UnitPlacement {
  readonly id: string;
  readonly name: string;
  readonly x: number;
  readonly z: number;
  /** 向き。0=南(手前) 1=東 2=北(奥) 3=西 */
  readonly facing: 0 | 1 | 2 | 3;
  /** 仮人形の配色（16進カラー） */
  readonly colors: { readonly body: number; readonly accent: number };
}

export const testUnits: readonly UnitPlacement[] = [
  { id: 'hero', name: '見習い剣士', x: 3, z: 4, facing: 0, colors: { body: 0x3b6fd8, accent: 0xf2c14e } },
];
