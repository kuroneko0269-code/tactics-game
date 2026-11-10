/**
 * 戦闘マップ（マス目と高低差）の型と、基本的な操作。
 * 描画には一切関わらない。座標は x（横）と z（奥行き）、高さは「段」で数える。
 */

/** 地形の種類。見た目や移動コストの違いは今後ここに紐づける */
export type Terrain = 'grass' | 'dirt' | 'stone' | 'water';

export interface Tile {
  readonly x: number;
  readonly z: number;
  /** 高さ（段数）。0 が最も低い */
  readonly height: number;
  readonly terrain: Terrain;
}

export interface BattleMap {
  readonly id: string;
  readonly name: string;
  readonly width: number;
  readonly depth: number;
  /** tiles[z * width + x] */
  readonly tiles: readonly Tile[];
}

/** src/data に置くマップ定義の形 */
export interface MapDefinition {
  readonly id: string;
  readonly name: string;
  /** heights[z][x] = 高さ（段数） */
  readonly heights: readonly (readonly number[])[];
  /** terrain[z] の各文字が1マス。凡例は legend で指定 */
  readonly terrain: readonly string[];
  readonly legend: Readonly<Record<string, Terrain>>;
}

export function createMap(def: MapDefinition): BattleMap {
  const depth = def.heights.length;
  const width = def.heights[0]?.length ?? 0;
  if (depth === 0 || width === 0) {
    throw new Error(`マップ ${def.id}: heights が空です`);
  }
  if (def.terrain.length !== depth) {
    throw new Error(`マップ ${def.id}: terrain の行数が heights と一致しません`);
  }

  const tiles: Tile[] = [];
  for (let z = 0; z < depth; z++) {
    const heightRow = def.heights[z]!;
    const terrainRow = def.terrain[z]!;
    if (heightRow.length !== width || terrainRow.length !== width) {
      throw new Error(`マップ ${def.id}: ${z} 行目の幅が ${width} ではありません`);
    }
    for (let x = 0; x < width; x++) {
      const height = heightRow[x]!;
      if (!Number.isInteger(height) || height < 0) {
        throw new Error(`マップ ${def.id}: (${x}, ${z}) の高さ ${height} が不正です`);
      }
      const symbol = terrainRow[x]!;
      const terrain = def.legend[symbol];
      if (!terrain) {
        throw new Error(`マップ ${def.id}: 地形記号 "${symbol}" が legend にありません`);
      }
      tiles.push({ x, z, height, terrain });
    }
  }
  return { id: def.id, name: def.name, width, depth, tiles };
}

export function isInBounds(map: BattleMap, x: number, z: number): boolean {
  return Number.isInteger(x) && Number.isInteger(z) && x >= 0 && z >= 0 && x < map.width && z < map.depth;
}

export function getTile(map: BattleMap, x: number, z: number): Tile | undefined {
  return isInBounds(map, x, z) ? map.tiles[z * map.width + x] : undefined;
}
