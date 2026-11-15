import * as THREE from 'three';
import type { ActorState, StageState } from '../core/dialogue';
import type { Coord, Direction } from '../core/geometry';
import type { MapView, TileCoord } from './mapView';
import { createPropModel } from './props';
import { createPuppet, YAW_OF, type Puppet, type PuppetLook, type PuppetPose } from './puppet';
import { createTweens, easeInOut } from './tweens';

/**
 * 会話の場面の舞台（物語の土台）: 戦闘をしない小さなマップの上に、人物の人形と物を置いて動かす。
 * 舞台の様子は core（dialogue.ts）が計算した StageState をそのまま見せるだけにし、ここでは動きの見せ方だけを持つ。
 */
export interface GestureMotion {
  readonly seconds: number;
  readonly frames: readonly (PuppetPose & { readonly t: number; readonly turn?: number })[];
}

export interface SceneView {
  /** 舞台の様子に、すべての人形と物を即座にそろえる（スキップの後や、場面の始め） */
  sync(stage: StageState): void;
  enter(name: string, actor: ActorState): Promise<void>;
  exit(name: string): Promise<void>;
  /** 道順（始めのマスを含む）に沿って歩く */
  walk(name: string, path: readonly Coord[]): Promise<void>;
  turn(name: string, facing: Direction): Promise<void>;
  gesture(name: string, motion: GestureMotion): Promise<void>;
  putProp(name: string, kind: string, c: Coord): Promise<void>;
  removeProp(name: string): Promise<void>;
  changeProp(name: string, kind: string): Promise<void>;
  /** 人物の頭上のあたりの位置（カメラを向ける先） */
  actorPoint(name: string): THREE.Vector3 | undefined;
  /** 歩かせる時に、進めるマスを色分けする（空なら消す） */
  setWalkTargets(tiles: readonly Coord[], goal?: Coord): void;
  /** 動きの速さ（早送りの時に上げる） */
  setSpeed(multiplier: number): void;
  pickTargets(): THREE.Object3D[];
  coordOf(object: THREE.Object3D): TileCoord | undefined;
  /** 自動テスト用: 人物とマスの画面座標 */
  actorScreen(name: string): { x: number; y: number } | undefined;
  tileScreen(x: number, z: number): { x: number; y: number };
  update(deltaSeconds: number, elapsedSeconds: number): void;
  dispose(): void;
}

const STEP_SECONDS = 0.28;

export function createSceneView(options: {
  scene: THREE.Scene;
  mapView: MapView;
  camera: () => THREE.Camera;
  canvas: HTMLCanvasElement;
  /** 人物の名前 → 人形の見た目 */
  lookOf: (name: string) => PuppetLook;
  /** 物の種類の名前（台本の名前）→ 見た目の id */
  propModelOf: (kind: string) => string;
}): SceneView {
  const { scene, mapView } = options;
  const tweens = createTweens();
  let speed = 1;
  const actors = new Map<string, { puppet: Puppet; coord: Coord }>();
  const props = new Map<string, { model: Puppet; kind: string; coord: Coord }>();

  const place = (obj: THREE.Object3D, c: Coord) => {
    obj.position.copy(mapView.tileTop(c.x, c.z));
    obj.userData.tileCoord = { x: c.x, z: c.z } satisfies TileCoord;
  };
  const makeActor = (name: string, a: ActorState) => {
    const puppet = createPuppet(options.lookOf(name));
    scene.add(puppet.group);
    place(puppet.group, a);
    puppet.setFacing(a.facing);
    actors.set(name, { puppet, coord: { x: a.x, z: a.z } });
    return puppet;
  };
  const makeProp = (name: string, kind: string, c: Coord) => {
    const model = createPropModel(options.propModelOf(kind));
    scene.add(model.group);
    place(model.group, c);
    props.set(name, { model, kind, coord: { x: c.x, z: c.z } });
    return model;
  };
  const dropActor = (name: string) => {
    const a = actors.get(name);
    if (!a) return;
    scene.remove(a.puppet.group);
    actors.delete(name);
  };
  const dropProp = (name: string) => {
    const p = props.get(name);
    if (!p) return;
    scene.remove(p.model.group);
    props.delete(name);
  };
  const play = (seconds: number, fn: (t: number) => void) => tweens.play(seconds / speed, fn);

  const screenOf = (world: THREE.Vector3) => {
    const p = world.clone().project(options.camera());
    const rect = options.canvas.getBoundingClientRect();
    return { x: rect.left + ((p.x + 1) / 2) * rect.width, y: rect.top + ((1 - p.y) / 2) * rect.height };
  };

  return {
    sync(stage) {
      for (const name of [...actors.keys()]) if (!stage.actors[name]) dropActor(name);
      for (const [name, a] of Object.entries(stage.actors)) {
        const v = actors.get(name);
        const puppet = v?.puppet ?? makeActor(name, a);
        place(puppet.group, a);
        puppet.setFacing(a.facing);
        puppet.setOpacity(1);
        puppet.setPose?.({});
        actors.set(name, { puppet, coord: { x: a.x, z: a.z } });
      }
      for (const name of [...props.keys()]) {
        const want = stage.props[name];
        if (!want || want.prop !== props.get(name)!.kind) dropProp(name);
      }
      for (const [name, p] of Object.entries(stage.props)) {
        const v = props.get(name);
        if (v) place(v.model.group, p);
        else makeProp(name, p.prop, p);
      }
    },
    async enter(name, a) {
      dropActor(name);
      const puppet = makeActor(name, a);
      await play(0.35, (t) => {
        puppet.setOpacity(t);
        puppet.body.position.y = 0.2 * (1 - t);
      });
      puppet.body.position.y = 0;
    },
    async exit(name) {
      const a = actors.get(name);
      if (!a) return;
      await play(0.35, (t) => a.puppet.setOpacity(1 - t));
      dropActor(name);
    },
    async walk(name, path) {
      const a = actors.get(name);
      if (!a) return;
      for (let i = 1; i < path.length; i++) {
        const from = mapView.tileTop(path[i - 1]!.x, path[i - 1]!.z);
        const to = mapView.tileTop(path[i]!.x, path[i]!.z);
        const dx = path[i]!.x - path[i - 1]!.x;
        const dz = path[i]!.z - path[i - 1]!.z;
        const facing: Direction = dx > 0 ? 'east' : dx < 0 ? 'west' : dz > 0 ? 'south' : 'north';
        a.puppet.setFacing(facing);
        const hop = Math.abs(to.y - from.y) > 0.01 ? 0.25 : 0.06;
        await play(STEP_SECONDS, (t) => {
          a.puppet.group.position.lerpVectors(from, to, t);
          a.puppet.group.position.y += Math.sin(Math.PI * t) * hop;
        });
        place(a.puppet.group, path[i]!);
        a.coord = { x: path[i]!.x, z: path[i]!.z };
      }
    },
    async turn(name, facing) {
      const a = actors.get(name);
      if (!a) return;
      const from = a.puppet.yaw;
      let to = YAW_OF[facing];
      while (to - from > Math.PI) to -= Math.PI * 2;
      while (to - from < -Math.PI) to += Math.PI * 2;
      if (Math.abs(to - from) < 0.001) return;
      await play(0.2, (t) => a.puppet.setYaw(from + (to - from) * t));
      a.puppet.setFacing(facing);
    },
    async gesture(name, motion) {
      const a = actors.get(name);
      if (!a) return;
      const frames = motion.frames;
      const baseYaw = a.puppet.yaw;
      const value = (key: keyof PuppetPose | 'turn', t: number) => {
        let prev = frames[0]!;
        for (const f of frames) {
          if (f.t <= t) prev = f;
          else {
            const span = f.t - prev.t || 1;
            const k = easeInOut((t - prev.t) / span);
            return (prev[key] ?? 0) + ((f[key] ?? 0) - (prev[key] ?? 0)) * k;
          }
        }
        return prev[key] ?? 0;
      };
      await play(motion.seconds, (t) => {
        a.puppet.setPose?.({
          bow: value('bow', t),
          head: value('head', t),
          headTurn: value('headTurn', t),
          armL: value('armL', t),
          armR: value('armR', t),
          drop: value('drop', t),
          lift: value('lift', t),
        });
        a.puppet.setYaw(baseYaw + value('turn', t));
      });
      a.puppet.setPose?.({});
    },
    async putProp(name, kind, c) {
      dropProp(name);
      const model = makeProp(name, kind, c);
      await play(0.3, (t) => {
        model.setOpacity(t);
        model.body.scale.setScalar(0.6 + 0.4 * t);
      });
    },
    async removeProp(name) {
      const p = props.get(name);
      if (!p) return;
      await play(0.3, (t) => p.model.setOpacity(1 - t));
      dropProp(name);
    },
    async changeProp(name, kind) {
      const p = props.get(name);
      if (!p) return;
      dropProp(name);
      const model = makeProp(name, kind, p.coord);
      const glow = new THREE.Color(0xffffff);
      await play(0.35, (t) => model.setGlow(glow, 1 - t));
      model.setGlow(glow, 0);
    },
    actorPoint(name) {
      const a = actors.get(name);
      return a ? mapView.tileTop(a.coord.x, a.coord.z).add(new THREE.Vector3(0, 0.6, 0)) : undefined;
    },
    setWalkTargets(tiles, goal) {
      // 次に進めるマスは黄色で目立たせ、行き先は青で示す
      const next = tiles.map((t) => ({ x: t.x, z: t.z, kind: 'selected' as const }));
      const showGoal = goal && !tiles.some((t) => t.x === goal.x && t.z === goal.z);
      mapView.setMarks([...(showGoal ? [{ x: goal.x, z: goal.z, kind: 'move' as const }] : []), ...next]);
    },
    setSpeed(multiplier) {
      speed = Math.max(0.1, multiplier);
    },
    pickTargets: () => [mapView.group, ...[...actors.values()].map((a) => a.puppet.group)],
    coordOf(object) {
      for (let o: THREE.Object3D | null = object; o; o = o.parent) {
        const c = o.userData.tileCoord as TileCoord | undefined;
        if (c) return c;
      }
      return mapView.coordOf(object);
    },
    actorScreen(name) {
      const a = actors.get(name);
      return a ? screenOf(mapView.tileTop(a.coord.x, a.coord.z).add(new THREE.Vector3(0, 0.45, 0))) : undefined;
    },
    tileScreen: (x, z) => screenOf(mapView.tileTop(x, z)),
    update(dt, elapsed) {
      tweens.update(dt);
      for (const a of actors.values()) a.puppet.update(elapsed);
    },
    dispose() {
      for (const name of [...actors.keys()]) dropActor(name);
      for (const name of [...props.keys()]) dropProp(name);
      mapView.setMarks([]);
    },
  };
}
