import * as THREE from 'three';
import type { BattleEvent, BattleState, SpellElement, Team } from '../core/battleTypes';
import { DIRECTION_VECTORS, DIRECTIONS, type Coord, type Direction } from '../core/geometry';
import type { MapView, ReservedTile, TileCoord, TileMark } from './mapView';
import { createPuppet, YAW_OF, type Puppet, type PuppetLook } from './puppet';
import { createTweens, easeInOut, easeOutCubic } from './tweens';

/**
 * 戦闘中のユニットの見た目と動き。
 * 戦闘の結果は計算せず、core が返した出来事（イベント）と状態をそのまま見せるだけにする。
 */
export interface BattleView {
  /** タップ判定の対象 */
  pickTargets(): THREE.Object3D[];
  /** タップされた物 → マス座標（マス・ユニット・向きの矢印） */
  coordOf(object: THREE.Object3D): TileCoord | undefined;
  /** タップされた物が向きの矢印なら、その向き */
  directionOf(object: THREE.Object3D): Direction | undefined;
  /** 状態に合わせて、すべてのユニットの位置・向き・表示を即座にそろえる */
  sync(state: BattleState): void;
  setMarks(marks: readonly TileMark[]): void;
  /** 詠唱中の魔法が予約している範囲を、属性の色で薄く表示する */
  setReserved(tiles: readonly { x: number; z: number; element: SpellElement }[]): void;
  /** 詠唱中のユニットに、属性の色の目印（回る輪）を付ける。element が undefined なら外す */
  setCharging(unitId: string, element: SpellElement | undefined): void;
  /** 魔法を指定した時の動き（詠唱者が杖を掲げて、属性の色に光る） */
  animateCast(event: Extract<BattleEvent, { type: 'castStarted' }>, element: SpellElement): Promise<void>;
  /** 魔法が発動した時の演出。範囲のマスに属性の色の光の柱を立てる。光った瞬間に onImpact を呼ぶ */
  animateSpell(event: Extract<BattleEvent, { type: 'spellResolved' }>, onImpact: () => void): Promise<void>;
  /** 手番のユニットの頭上に目印を出す */
  setActive(unitId: string | undefined): void;
  /** 向きを選ぶための矢印をユニットの周りに出す（undefined で消す） */
  showFacingArrows(unitId: string | undefined, selected?: Direction): void;
  turnTo(unitId: string, facing: Direction): Promise<void>;
  animateMove(unitId: string, path: readonly Coord[]): Promise<void>;
  /** 攻撃の動き。当たった（または外れた）瞬間に onImpact を呼ぶ */
  animateAttack(event: Extract<BattleEvent, { type: 'attacked' }>, onImpact: () => void): Promise<void>;
  animateDefeat(unitId: string): Promise<void>;
  wait(seconds: number): Promise<void>;
  /** 各ユニットの頭上の画面座標（px） */
  unitAnchors(): { id: string; x: number; y: number; visible: boolean }[];
  /** マスの上面中央の画面座標（px）。自動テスト用 */
  tileScreenPosition(x: number, z: number): { x: number; y: number };
  /** マスの上面の中央と、その周り8か所の画面座標（px）。奥のマスの見えている部分を探すため。自動テスト用 */
  tileScreenPoints(x: number, z: number): { x: number; y: number }[];
  /** ユニットの体の中ほどの画面座標（px）。自動テスト用 */
  unitScreenPosition(unitId: string): { x: number; y: number };
  /** 向き選びの矢印の画面座標（px）。矢印が出ていなければ undefined。自動テスト用 */
  arrowScreenPosition(direction: Direction): { x: number; y: number } | undefined;
  update(deltaSeconds: number, elapsedSeconds: number): void;
}

const TEAM_COLORS: Record<Team, { body: number; ring: number }> = {
  player: { body: 0x2f6fe0, ring: 0x58a6ff },
  enemy: { body: 0xc8352e, ring: 0xff5a4f },
};
const JOB_LOOKS: Record<string, Omit<PuppetLook, 'body'>> = {
  warrior: { accent: 0xf2c14e, weapon: 'sword' },
  archer: { accent: 0x8fd66b, weapon: 'bow' },
  mage: { accent: 0x8a5cf0, weapon: 'staff' },
  healer: { accent: 0xf4f1e8, weapon: 'staff' },
};
/** 属性の色（仮） */
export const ELEMENT_COLORS: Record<SpellElement, number> = {
  fire: 0xff5a1f,
  wind: 0x3fd69a,
  holy: 0xffe56b,
};
const HEAD_HEIGHT = 1.05;
const STEP_SECONDS = 0.2;

interface UnitVisual {
  readonly puppet: Puppet;
  coord: Coord;
  alive: boolean;
  /** 詠唱中の目印（属性の色の輪） */
  readonly chargeRing: THREE.Mesh<THREE.TorusGeometry, THREE.MeshBasicMaterial>;
}

export function createBattleView(options: {
  scene: THREE.Scene;
  mapView: MapView;
  initial: BattleState;
  camera: () => THREE.Camera;
  canvas: HTMLCanvasElement;
}): BattleView {
  const { scene, mapView } = options;
  const tweens = createTweens();
  const visuals = new Map<string, UnitVisual>();

  for (const unit of options.initial.units) {
    const look = JOB_LOOKS[unit.jobId] ?? JOB_LOOKS.warrior!;
    const puppet = createPuppet({ ...look, body: TEAM_COLORS[unit.team].body });
    puppet.group.add(teamRing(TEAM_COLORS[unit.team].ring));
    puppet.group.add(facingPointer(TEAM_COLORS[unit.team].ring));
    puppet.group.userData.unitId = unit.id;
    const chargeRing = new THREE.Mesh(
      new THREE.TorusGeometry(0.42, 0.035, 6, 28).rotateX(Math.PI / 2),
      new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.9, depthWrite: false }),
    );
    chargeRing.visible = false;
    chargeRing.renderOrder = 3;
    // 目印は上下に動くので、タップの判定から外す（動きのせいで隣のマスや矢印のタップを横取りしないように）
    chargeRing.raycast = () => {};
    puppet.group.add(chargeRing);
    scene.add(puppet.group);
    visuals.set(unit.id, { puppet, coord: { x: unit.x, z: unit.z }, alive: true, chargeRing });
  }

  // 魔法の発動の光の柱（マスごとに使い回す）
  const burstGeometry = new THREE.CylinderGeometry(0.42, 0.42, 1, 12, 1, true);
  const bursts: THREE.Mesh<THREE.CylinderGeometry, THREE.MeshBasicMaterial>[] = [];
  const burstAt = (i: number) => {
    while (bursts.length <= i) {
      const m = new THREE.Mesh(
        burstGeometry,
        new THREE.MeshBasicMaterial({ transparent: true, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending }),
      );
      m.visible = false;
      m.renderOrder = 4;
      scene.add(m);
      bursts.push(m);
    }
    return bursts[i]!;
  };

  const visual = (id: string): UnitVisual => {
    const v = visuals.get(id);
    if (!v) throw new Error(`ユニット ${id} の見た目がありません`);
    return v;
  };
  const place = (v: UnitVisual, c: Coord) => {
    v.coord = { x: c.x, z: c.z };
    v.puppet.group.position.copy(mapView.tileTop(c.x, c.z));
    v.puppet.group.userData.tileCoord = { x: c.x, z: c.z } satisfies TileCoord;
  };

  // 手番のユニットの頭上で上下する目印
  const activeMarker = new THREE.Mesh(
    new THREE.ConeGeometry(0.13, 0.24, 4).rotateX(Math.PI),
    new THREE.MeshBasicMaterial({ color: 0xffe14d }),
  );
  activeMarker.visible = false;
  scene.add(activeMarker);
  let activeId: string | undefined;

  // 向きを選ぶための4つの矢印
  const arrowGroup = new THREE.Group();
  arrowGroup.visible = false;
  scene.add(arrowGroup);
  const arrows = DIRECTIONS.map((dir) => {
    const material = new THREE.MeshBasicMaterial({
      color: 0xffffff,
      transparent: true,
      opacity: 0.85,
      side: THREE.DoubleSide,
      depthTest: false,
    });
    const mesh = new THREE.Mesh(arrowShape(), material);
    const v = DIRECTION_VECTORS[dir];
    mesh.position.set(v.x * 0.85, 0.08, v.z * 0.85);
    mesh.rotation.y = YAW_OF[dir];
    mesh.userData.direction = dir;
    arrowGroup.add(mesh);
    return { dir, mesh, material };
  });

  const projectile = new THREE.Mesh(
    new THREE.BoxGeometry(0.03, 0.03, 0.34),
    new THREE.MeshBasicMaterial({ color: 0x5a3a1a }),
  );
  projectile.visible = false;
  scene.add(projectile);

  const turnTo = async (unitId: string, facing: Direction) => {
    const { puppet } = visual(unitId);
    const from = puppet.yaw;
    let to = YAW_OF[facing];
    // 近い回り方で回す
    while (to - from > Math.PI) to -= Math.PI * 2;
    while (to - from < -Math.PI) to += Math.PI * 2;
    if (Math.abs(to - from) < 0.001) return;
    await tweens.play(0.12, (t) => puppet.setYaw(from + (to - from) * t));
    puppet.setFacing(facing);
  };

  const screenOf = (world: THREE.Vector3) => {
    const p = world.clone().project(options.camera());
    const rect = options.canvas.getBoundingClientRect();
    return {
      x: rect.left + ((p.x + 1) / 2) * rect.width,
      y: rect.top + ((1 - p.y) / 2) * rect.height,
      onScreen: p.z > -1 && p.z < 1,
    };
  };

  return {
    pickTargets: () => [mapView.group, ...[...visuals.values()].filter((v) => v.alive).map((v) => v.puppet.group), arrowGroup],
    coordOf(object) {
      for (let o: THREE.Object3D | null = object; o; o = o.parent) {
        if (o.userData.direction && activeId) {
          const c = visual(activeId).coord;
          const v = DIRECTION_VECTORS[o.userData.direction as Direction];
          return { x: c.x + v.x, z: c.z + v.z };
        }
        const coord = o.userData.tileCoord as TileCoord | undefined;
        if (coord) return coord;
      }
      return undefined;
    },
    directionOf(object) {
      for (let o: THREE.Object3D | null = object; o; o = o.parent) {
        if (o.userData.direction) return o.userData.direction as Direction;
      }
      return undefined;
    },
    sync(state) {
      for (const unit of state.units) {
        const v = visual(unit.id);
        place(v, unit);
        v.puppet.setFacing(unit.facing);
        v.alive = unit.hp > 0;
        v.puppet.group.visible = v.alive;
        v.puppet.setOpacity(1);
        v.puppet.setFlash(0);
        v.puppet.body.position.set(0, 0, 0);
        v.puppet.body.rotation.set(0, 0, 0);
        const spell = unit.charging && unit.spells.find((sp) => sp.id === unit.charging!.spellId);
        v.chargeRing.visible = Boolean(spell) && v.alive;
        if (spell) v.chargeRing.material.color.setHex(ELEMENT_COLORS[spell.element]);
      }
    },
    setMarks: (marks) => mapView.setMarks(marks),
    setReserved(tiles) {
      mapView.setReserved(tiles.map((t): ReservedTile => ({ x: t.x, z: t.z, color: ELEMENT_COLORS[t.element] })));
    },
    setCharging(unitId, element) {
      const v = visual(unitId);
      v.chargeRing.visible = element !== undefined;
      if (element) v.chargeRing.material.color.setHex(ELEMENT_COLORS[element]);
    },
    async animateCast(event, element) {
      const caster = visual(event.casterId);
      await turnTo(event.casterId, event.casterFacing);
      const color = new THREE.Color(ELEMENT_COLORS[element]);
      await tweens.play(0.45, (t) => {
        const k = Math.sin(Math.PI * t);
        caster.puppet.body.position.y = 0.12 * k;
        caster.puppet.setGlow(color, k);
      });
      caster.puppet.body.position.y = 0;
      caster.puppet.setGlow(color, 0);
    },
    async animateSpell(event, onImpact) {
      const color = ELEMENT_COLORS[event.element];
      const caster = visual(event.casterId);
      // 詠唱者が光ってから、範囲に光の柱が立つ
      const casterColor = new THREE.Color(color);
      await tweens.play(0.3, (t) => caster.puppet.setGlow(casterColor, Math.sin(Math.PI * t)));
      caster.puppet.setGlow(casterColor, 0);
      const columns = event.tiles.map((t, i) => {
        const m = burstAt(i);
        m.material.color.setHex(color);
        m.position.copy(mapView.tileTop(t.x, t.z));
        m.visible = true;
        return m;
      });
      let impacted = false;
      await tweens.play(0.7, (t) => {
        const height = 0.2 + 1.6 * easeOutCubic(Math.min(1, t * 2));
        for (const m of columns) {
          m.scale.set(1 - 0.3 * t, height, 1 - 0.3 * t);
          m.position.y = m.position.y - (m.userData.lastHalf ?? 0) + height / 2;
          m.userData.lastHalf = height / 2;
          m.material.opacity = 0.75 * (1 - t * t);
        }
        if (!impacted && t >= 0.35) {
          impacted = true;
          onImpact();
        }
        for (const r of event.results) {
          const target = visual(r.unitId);
          target.puppet.setGlow(casterColor, event.effect === 'heal' ? 1 - t : 0);
          if (event.effect === 'damage') target.puppet.setFlash(t < 0.35 ? 0 : 1 - t);
        }
      });
      if (!impacted) onImpact();
      for (const m of columns) {
        m.visible = false;
        m.userData.lastHalf = 0;
      }
      for (const r of event.results) {
        const target = visual(r.unitId);
        target.puppet.setGlow(casterColor, 0);
        target.puppet.setFlash(0);
      }
    },
    setActive(unitId) {
      activeId = unitId;
      activeMarker.visible = unitId !== undefined;
    },
    showFacingArrows(unitId, selected) {
      arrowGroup.visible = unitId !== undefined;
      if (!unitId) return;
      arrowGroup.position.copy(mapView.tileTop(visual(unitId).coord.x, visual(unitId).coord.z));
      for (const a of arrows) {
        a.material.color.setHex(a.dir === selected ? 0xffd23d : 0xffffff);
        a.material.opacity = a.dir === selected ? 1 : 0.8;
        a.mesh.scale.setScalar(a.dir === selected ? 1.6 : 1.25);
      }
    },
    turnTo,
    async animateMove(unitId, path) {
      const v = visual(unitId);
      for (let i = 1; i < path.length; i++) {
        const a = path[i - 1]!;
        const b = path[i]!;
        const dir: Direction = b.x > a.x ? 'east' : b.x < a.x ? 'west' : b.z > a.z ? 'south' : 'north';
        await turnTo(unitId, dir);
        const from = mapView.tileTop(a.x, a.z);
        const to = mapView.tileTop(b.x, b.z);
        const hop = 0.12 + Math.abs(to.y - from.y) * 0.6;
        await tweens.play(STEP_SECONDS, (t) => {
          v.puppet.group.position.lerpVectors(from, to, t);
          v.puppet.group.position.y = from.y + (to.y - from.y) * t + Math.sin(Math.PI * t) * hop;
        });
        place(v, b);
      }
    },
    async animateAttack(event, onImpact) {
      const attacker = visual(event.attackerId);
      const target = visual(event.targetId);
      await turnTo(event.attackerId, event.attackerFacing);
      const from = mapView.tileTop(attacker.coord.x, attacker.coord.z);
      const to = mapView.tileTop(target.coord.x, target.coord.z);
      const local = new THREE.Vector3(0, 0, 1); // 人形の正面

      const isRanged = Math.abs(attacker.coord.x - target.coord.x) + Math.abs(attacker.coord.z - target.coord.z) > 1;
      if (isRanged) {
        // 弓を引くように少し下がり、矢を放つ
        await tweens.play(0.18, (t) => attacker.puppet.body.position.copy(local).multiplyScalar(-0.08 * t));
        const start = from.clone().add(new THREE.Vector3(0, 0.55, 0));
        const end = to.clone().add(new THREE.Vector3(0, 0.5, 0));
        const arc = 0.6 + start.distanceTo(end) * 0.12;
        const prev = start.clone();
        projectile.visible = true;
        attacker.puppet.body.position.set(0, 0, 0);
        await tweens.play(0.38, (t) => {
          projectile.position.lerpVectors(start, end, t);
          projectile.position.y += Math.sin(Math.PI * t) * arc;
          if (t > 0) projectile.lookAt(prev.clone().lerp(projectile.position, 2));
          prev.copy(projectile.position);
        });
        projectile.visible = false;
      } else {
        // 踏み込んで斬りつける
        await tweens.play(0.14, (t) => attacker.puppet.body.position.copy(local).multiplyScalar(0.32 * easeOutCubic(t)));
      }

      onImpact();
      if (event.hit) {
        await tweens.play(0.3, (t) => {
          target.puppet.setFlash(1 - t);
          target.puppet.body.position.x = Math.sin(t * Math.PI * 6) * 0.05 * (1 - t);
        });
        target.puppet.body.position.x = 0;
      } else {
        // 身をかわす
        await tweens.play(0.3, (t) => {
          target.puppet.body.position.x = Math.sin(Math.PI * t) * 0.25;
        });
      }
      if (!isRanged) {
        await tweens.play(0.14, (t) =>
          attacker.puppet.body.position.copy(local).multiplyScalar(0.32 * (1 - easeInOut(t))),
        );
      }
      attacker.puppet.body.position.set(0, 0, 0);
      target.puppet.body.position.set(0, 0, 0);
    },
    async animateDefeat(unitId) {
      const v = visual(unitId);
      await tweens.play(0.6, (t) => {
        v.puppet.body.rotation.x = -(Math.PI / 2) * easeOutCubic(t);
        v.puppet.setOpacity(1 - t * t);
      });
      v.alive = false;
      v.puppet.group.visible = false;
      v.chargeRing.visible = false;
    },
    wait: (seconds) => tweens.wait(seconds),
    unitAnchors() {
      return [...visuals.entries()].map(([id, v]) => {
        const world = v.puppet.group.position.clone().add(new THREE.Vector3(0, HEAD_HEIGHT, 0));
        const s = screenOf(world);
        return { id, x: s.x, y: s.y, visible: v.alive && s.onScreen };
      });
    },
    tileScreenPosition(x, z) {
      const s = screenOf(mapView.tileTop(x, z));
      return { x: s.x, y: s.y };
    },
    tileScreenPoints(x, z) {
      const top = mapView.tileTop(x, z);
      const offsets = [0, 0.3, -0.3];
      return offsets.flatMap((dx) =>
        offsets.map((dz) => {
          const s = screenOf(top.clone().add(new THREE.Vector3(dx, 0, dz)));
          return { x: s.x, y: s.y };
        }),
      );
    },
    unitScreenPosition(unitId) {
      const s = screenOf(visual(unitId).puppet.group.position.clone().add(new THREE.Vector3(0, 0.5, 0)));
      return { x: s.x, y: s.y };
    },
    arrowScreenPosition(direction) {
      const arrow = arrows.find((a) => a.dir === direction);
      if (!arrowGroup.visible || !arrow) return undefined;
      // 矢印の頭（三角の部分）の内側の点。原点は三角と軸の境目にあり、タップの判定が当たりにくいため
      const s = screenOf(arrow.mesh.localToWorld(new THREE.Vector3(0, 0, 0.12)));
      return { x: s.x, y: s.y };
    },
    update(dt, elapsed) {
      tweens.update(dt);
      for (const v of visuals.values()) {
        v.puppet.update(elapsed);
        if (v.chargeRing.visible) {
          v.chargeRing.rotation.y = elapsed * 3;
          v.chargeRing.position.y = 0.45 + Math.sin(elapsed * 4) * 0.12;
        }
      }
      if (activeId && activeMarker.visible) {
        activeMarker.position
          .copy(visual(activeId).puppet.group.position)
          .add(new THREE.Vector3(0, HEAD_HEIGHT + 0.25 + Math.abs(Math.sin(elapsed * 3)) * 0.12, 0));
        activeMarker.rotation.y = elapsed * 2;
      }
    },
  };
}

/** 足もとの、陣営の色の輪 */
function teamRing(color: number): THREE.Mesh {
  const ring = new THREE.Mesh(
    new THREE.RingGeometry(0.3, 0.4, 24).rotateX(-Math.PI / 2),
    new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.9, depthWrite: false }),
  );
  ring.position.y = 0.02;
  ring.renderOrder = 2;
  return ring;
}

/** 足もとの、向いている方向を示す小さな三角 */
function facingPointer(color: number): THREE.Mesh {
  const shape = new THREE.Shape();
  shape.moveTo(0, 0.2);
  shape.lineTo(-0.12, 0);
  shape.lineTo(0.12, 0);
  shape.closePath();
  const mesh = new THREE.Mesh(
    new THREE.ShapeGeometry(shape).rotateX(Math.PI / 2),
    new THREE.MeshBasicMaterial({ color, side: THREE.DoubleSide, depthWrite: false }),
  );
  mesh.position.set(0, 0.025, 0.38);
  mesh.renderOrder = 2;
  return mesh;
}

/** 向き選び用の大きな矢印（+z 向き） */
function arrowShape(): THREE.BufferGeometry {
  const shape = new THREE.Shape();
  shape.moveTo(0, 0.3);
  shape.lineTo(-0.26, 0);
  shape.lineTo(-0.1, 0);
  shape.lineTo(-0.1, -0.2);
  shape.lineTo(0.1, -0.2);
  shape.lineTo(0.1, 0);
  shape.lineTo(0.26, 0);
  shape.closePath();
  return new THREE.ShapeGeometry(shape).rotateX(Math.PI / 2);
}
