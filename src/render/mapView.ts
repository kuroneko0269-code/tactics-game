import * as THREE from 'three';
import type { BattleMap, Terrain, Tile } from '../core/map';
import { BASE_THICKNESS, HEIGHT_STEP } from './constants';

/** マス座標 */
export interface TileCoord {
  readonly x: number;
  readonly z: number;
}

/**
 * マップを3Dで表示する部品。
 * 各マスを「高さぶんの柱」として並べ、タップ判定用にマス座標を覚えさせておく。
 */
export interface MapView {
  readonly group: THREE.Group;
  /** マス座標 → そのマスの上面中央のワールド座標 */
  tileTop(x: number, z: number): THREE.Vector3;
  /** 3D オブジェクト → それが表すマス座標（マス以外なら undefined） */
  coordOf(object: THREE.Object3D): TileCoord | undefined;
  /** 選択表示を切り替える。undefined で選択解除 */
  setSelected(coord: TileCoord | undefined): void;
  update(elapsedSeconds: number): void;
  readonly center: THREE.Vector3;
  readonly radius: number;
  readonly heightRange: number;
}

const TOP_COLORS: Record<Terrain, number> = {
  grass: 0x6dbb4f,
  dirt: 0xb8925a,
  stone: 0x9a9a9a,
  water: 0x3f8fd8,
};
const SIDE_COLORS: Record<Terrain, number> = {
  grass: 0x7a5a3a,
  dirt: 0x8a6a40,
  stone: 0x6e6e72,
  water: 0x3a6a9a,
};

const COORD_KEY = 'tileCoord';

export function createMapView(map: BattleMap): MapView {
  const group = new THREE.Group();
  const offsetX = -map.width / 2 + 0.5;
  const offsetZ = -map.depth / 2 + 0.5;
  const maxHeight = Math.max(...map.tiles.map((t) => t.height));

  const geometryCache = new Map<number, THREE.BoxGeometry>();
  const edgeMaterial = new THREE.LineBasicMaterial({ color: 0x1d1d1d, transparent: true, opacity: 0.35 });

  const tileTop = (x: number, z: number): THREE.Vector3 => {
    const tile = map.tiles[z * map.width + x];
    const h = tile ? tile.height : 0;
    return new THREE.Vector3(x + offsetX, h * HEIGHT_STEP, z + offsetZ);
  };

  for (const tile of map.tiles) {
    const columnHeight = tile.height * HEIGHT_STEP + BASE_THICKNESS;
    let geometry = geometryCache.get(tile.height);
    if (!geometry) {
      geometry = new THREE.BoxGeometry(1, columnHeight, 1);
      geometryCache.set(tile.height, geometry);
    }
    const mesh = new THREE.Mesh(geometry, materialsFor(tile));
    const top = tileTop(tile.x, tile.z);
    mesh.position.set(top.x, top.y - columnHeight / 2, top.z);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    mesh.userData[COORD_KEY] = { x: tile.x, z: tile.z } satisfies TileCoord;

    const edges = new THREE.LineSegments(new THREE.EdgesGeometry(geometry), edgeMaterial);
    mesh.add(edges);
    group.add(mesh);
  }

  // 選択表示：マスの上面に重ねる、光る枠と半透明の板
  const highlight = new THREE.Group();
  const plate = new THREE.Mesh(
    new THREE.PlaneGeometry(0.96, 0.96).rotateX(-Math.PI / 2),
    new THREE.MeshBasicMaterial({ color: 0xffe14d, transparent: true, opacity: 0.7, depthWrite: false }),
  );
  const frame = new THREE.LineSegments(
    new THREE.EdgesGeometry(new THREE.PlaneGeometry(0.98, 0.98).rotateX(-Math.PI / 2)),
    new THREE.LineBasicMaterial({ color: 0xffffff }),
  );
  highlight.add(plate, frame);
  highlight.visible = false;
  highlight.renderOrder = 1;
  group.add(highlight);

  const radius = Math.hypot(map.width, map.depth) / 2;
  const heightRange = maxHeight * HEIGHT_STEP + BASE_THICKNESS;

  return {
    group,
    tileTop,
    coordOf(object) {
      for (let o: THREE.Object3D | null = object; o; o = o.parent) {
        const coord = o.userData[COORD_KEY] as TileCoord | undefined;
        if (coord) return coord;
      }
      return undefined;
    },
    setSelected(coord) {
      if (!coord) {
        highlight.visible = false;
        return;
      }
      const top = tileTop(coord.x, coord.z);
      highlight.position.set(top.x, top.y + 0.01, top.z);
      highlight.visible = true;
    },
    update(elapsed) {
      if (highlight.visible) {
        (plate.material as THREE.MeshBasicMaterial).opacity = 0.6 + 0.25 * Math.sin(elapsed * 5);
      }
    },
    center: new THREE.Vector3(0, (maxHeight * HEIGHT_STEP) / 2, 0),
    radius,
    heightRange,
  };
}

/** マスごとに少しだけ色を揺らして、のっぺりしないようにする（座標から決まるので毎回同じ） */
function materialsFor(tile: Tile): THREE.Material[] {
  const jitter = (((tile.x * 73856093) ^ (tile.z * 19349663)) & 0xff) / 255 - 0.5;
  const top = new THREE.Color(TOP_COLORS[tile.terrain]).offsetHSL(0, 0, jitter * 0.06);
  const topMaterial = new THREE.MeshLambertMaterial({ color: top });
  const sideMaterial = new THREE.MeshLambertMaterial({ color: SIDE_COLORS[tile.terrain] });
  // BoxGeometry の面の順番: +x, -x, +y(上), -y(下), +z, -z
  return [sideMaterial, sideMaterial, topMaterial, sideMaterial, sideMaterial, sideMaterial];
}
