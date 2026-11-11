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
  /** マスの色分け表示（移動できるマス、攻撃できるマスなど）。渡さなかったマスは表示を消す */
  setMarks(marks: readonly TileMark[]): void;
  /** 詠唱中の魔法が予約している範囲を、属性の色で薄く表示する。渡さなかったマスは表示を消す */
  setReserved(tiles: readonly ReservedTile[]): void;
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

/** マスの色分けの種類（spellRange: 魔法の射程、spellArea: 魔法の範囲、push: 突き飛ばしで押し出す先） */
export type TileMarkKind = 'move' | 'attack' | 'target' | 'selected' | 'spellRange' | 'spellArea' | 'push';

export interface TileMark extends TileCoord {
  readonly kind: TileMarkKind;
}

/** 予約されている魔法の範囲（color は属性の色） */
export interface ReservedTile extends TileCoord {
  readonly color: number;
}

const MARK_STYLE: Record<TileMarkKind, { color: number; opacity: number; pulse: number }> = {
  move: { color: 0x3d8bff, opacity: 0.5, pulse: 0.12 },
  attack: { color: 0xff6a3d, opacity: 0.32, pulse: 0.06 },
  target: { color: 0xff2020, opacity: 0.7, pulse: 0.2 },
  selected: { color: 0xffe14d, opacity: 0.75, pulse: 0.15 },
  spellRange: { color: 0xa45bff, opacity: 0.3, pulse: 0.06 },
  spellArea: { color: 0xff3df0, opacity: 0.7, pulse: 0.2 },
  push: { color: 0xffa21f, opacity: 0.8, pulse: 0.25 },
};
/** 予約されている範囲の濃さ */
const RESERVED_OPACITY = 0.3;

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

  // 色分け表示：マスの上面に重ねる半透明の板と枠。マスごとに1枚ずつ用意して、表示を切り替える
  const markGeometry = new THREE.PlaneGeometry(0.94, 0.94).rotateX(-Math.PI / 2);
  const frameGeometry = new THREE.EdgesGeometry(new THREE.PlaneGeometry(0.94, 0.94).rotateX(-Math.PI / 2));
  const markGroup = new THREE.Group();
  group.add(markGroup);
  const markMeshes = map.tiles.map((tile) => {
    const material = new THREE.MeshBasicMaterial({ transparent: true, depthWrite: false });
    const plate = new THREE.Mesh(markGeometry, material);
    const frameMaterial = new THREE.LineBasicMaterial({ transparent: true, opacity: 0.9 });
    plate.add(new THREE.LineSegments(frameGeometry, frameMaterial));
    const top = tileTop(tile.x, tile.z);
    plate.position.set(top.x, top.y + 0.012, top.z);
    plate.visible = false;
    plate.renderOrder = 1;
    plate.userData[COORD_KEY] = { x: tile.x, z: tile.z } satisfies TileCoord;
    markGroup.add(plate);
    return { plate, material, frameMaterial, kind: undefined as TileMarkKind | undefined };
  });

  // 予約されている魔法の範囲：色分け表示より少し下に、枠だけを目立たせた薄い板を重ねる
  const reservedGroup = new THREE.Group();
  group.add(reservedGroup);
  const reservedMeshes = map.tiles.map((tile) => {
    const material = new THREE.MeshBasicMaterial({ transparent: true, depthWrite: false, opacity: RESERVED_OPACITY });
    const plate = new THREE.Mesh(markGeometry, material);
    const frameMaterial = new THREE.LineBasicMaterial({ transparent: true, opacity: 0.8 });
    const frame = new THREE.LineSegments(frameGeometry, frameMaterial);
    frame.scale.setScalar(0.86);
    plate.add(frame);
    const top = tileTop(tile.x, tile.z);
    plate.position.set(top.x, top.y + 0.006, top.z);
    plate.visible = false;
    plate.renderOrder = 1;
    plate.userData[COORD_KEY] = { x: tile.x, z: tile.z } satisfies TileCoord;
    reservedGroup.add(plate);
    return { plate, material, frameMaterial };
  });

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
    setMarks(marks) {
      for (const m of markMeshes) {
        m.plate.visible = false;
        m.kind = undefined;
      }
      for (const mark of marks) {
        const m = markMeshes[mark.z * map.width + mark.x];
        if (!m) continue;
        const style = MARK_STYLE[mark.kind];
        m.kind = mark.kind;
        m.material.color.setHex(style.color);
        m.frameMaterial.color.setHex(style.color).offsetHSL(0, 0, 0.2);
        m.plate.visible = true;
      }
    },
    setReserved(tiles) {
      for (const m of reservedMeshes) m.plate.visible = false;
      for (const t of tiles) {
        const m = reservedMeshes[t.z * map.width + t.x];
        if (!m) continue;
        m.material.color.setHex(t.color);
        m.frameMaterial.color.setHex(t.color).offsetHSL(0, 0, 0.15);
        m.plate.visible = true;
      }
    },
    update(elapsed) {
      const wave = Math.sin(elapsed * 4);
      for (const m of reservedMeshes) {
        if (m.plate.visible) m.material.opacity = RESERVED_OPACITY + 0.08 * Math.sin(elapsed * 2);
      }
      for (const m of markMeshes) {
        if (!m.kind) continue;
        const style = MARK_STYLE[m.kind];
        m.material.opacity = style.opacity + style.pulse * wave;
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
