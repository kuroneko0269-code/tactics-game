import * as THREE from 'three';
import type { ActorState, LightState, StageState } from '../core/dialogue';
import type { Coord, Direction } from '../core/geometry';
import type { MapView, TileCoord } from './mapView';
import { createLightPillar, playGesture, type GestureMotion, type LightPillar } from './motion';
import { createPropModel, refreshPropShadows } from './props';
import { createPuppet, YAW_OF, type Puppet, type PuppetLook, type PuppetPose } from './puppet';
import { headTop } from './speakerMark';
import { createTweens } from './tweens';

export type { GestureMotion } from './motion';

/**
 * 会話の場面の舞台（物語の土台）: 戦闘をしない小さなマップの上に、人物の人形と物を置いて動かす。
 * 舞台の様子は core（dialogue.ts）が計算した StageState をそのまま見せるだけにし、ここでは動きの見せ方だけを持つ。
 */
export interface SceneView {
  /** 舞台の様子に、すべての人形と物を即座にそろえる（スキップの後や、場面の始め） */
  sync(stage: StageState): void;
  enter(name: string, actor: ActorState): Promise<void>;
  exit(name: string): Promise<void>;
  /** 道順（始めのマスを含む）に沿って歩く。speed は速さの倍率（1 がふつう） */
  walk(name: string, path: readonly Coord[], speed?: number): Promise<void>;
  turn(name: string, facing: Direction): Promise<void>;
  gesture(name: string, motion: GestureMotion): Promise<void>;
  /** 人物の口を seconds 秒だけ動かす（台詞の間）。0 で止める */
  talk(name: string, seconds: number): void;
  putProp(name: string, kind: string, c: Coord): Promise<void>;
  removeProp(name: string): Promise<void>;
  changeProp(name: string, kind: string): Promise<void>;
  /** 物を、そのマスへ seconds 秒かけて動かす（遠くの人々が後ずさる・丘を下りる） */
  moveProp(name: string, c: Coord, seconds: number): Promise<void>;
  /** 物をタップする操作: その物を光らせ、マスを色分けする（null で消す） */
  setTapTarget(name: string | null): Coord | undefined;
  /** 持ち物を付け替える（ActorState の items と同じ形） */
  setItems(name: string, items: ActorState['items']): void;
  /** 続く姿勢（座る など）。undefined で立つ */
  setPosture(name: string, posture: string | undefined): Promise<void>;
  /** 光を立てる・消す */
  setLight(name: string, light: LightState | undefined): Promise<void>;
  /** 人物の頭上のあたりの位置（カメラを向ける先） */
  actorPoint(name: string): THREE.Vector3 | undefined;
  /** 物の位置（カメラを向ける先） */
  propPoint(name: string): THREE.Vector3 | undefined;
  /** 物の形のいちばん上の少し上（物の名前の札を出す所。札が物を隠さないように） */
  propTop(name: string): THREE.Vector3 | undefined;
  /** 人物の持ち物の付く所（手・左手・腰・背）の位置（持っている物の名前の札を出す所） */
  actorSlot(name: string, slot: 'hand' | 'handL' | 'waist' | 'back'): THREE.Vector3 | undefined;
  /** 人物の頭のてっぺんの位置（話者の印を出す所。歩いている途中も追う） */
  actorHead(name: string): THREE.Vector3 | undefined;
  /** 歩かせる時に、進めるマスを色分けする（空なら消す） */
  setWalkTargets(tiles: readonly Coord[], goal?: Coord): void;
  /** 押す場所の上の目印が出ているか（自動テスト用） */
  beaconVisible(): boolean;
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
  /** 人形の作り方（省くと今の人形。KayKit の人形の試しで、場面4だけ KayKit の人形にする） */
  makePuppet?: (look: PuppetLook) => Puppet;
  /** 物の種類の名前（台本の名前）→ 見た目の id */
  propModelOf: (kind: string) => string;
  /** 続く姿勢の名前 → 姿勢 */
  postureOf: (name: string) => PuppetPose | undefined;
  /** 光の色の名前 → 色 */
  lightColorOf: (name: string) => number;
}): SceneView {
  const { scene, mapView } = options;
  const tweens = createTweens();
  let speed = 1;
  const actors = new Map<string, { puppet: Puppet; coord: Coord; posture: PuppetPose }>();
  const props = new Map<string, { model: Puppet; kind: string; coord: Coord }>();
  const lights = new Map<string, { pillar: LightPillar; light: LightState }>();
  /** タップを待っている物（光らせる） */
  let tapTarget: string | null = null;
  /**
   * 押す場所の目印: 押すマスや物の上で、上下に揺れる下向きの矢印（文字の案内を出さない場面でも、押す所が迷わず分かるように）
   */
  const beacon = new THREE.Group();
  {
    const mat = new THREE.MeshBasicMaterial({ color: 0xffd34d, transparent: true, opacity: 0.95, depthTest: false });
    const cone = new THREE.Mesh(new THREE.ConeGeometry(0.13, 0.26, 4), mat);
    cone.rotation.x = Math.PI;
    const ring = new THREE.Mesh(new THREE.TorusGeometry(0.17, 0.025, 6, 20), mat);
    ring.rotation.x = Math.PI / 2;
    ring.position.y = 0.2;
    beacon.add(cone, ring);
    beacon.renderOrder = 999;
    for (const c of beacon.children) c.renderOrder = 999;
  }
  beacon.visible = false;
  scene.add(beacon);
  /** 目印の土台の位置（揺れはこの上で） */
  const beaconBase = new THREE.Vector3();
  const setBeacon = (at: THREE.Vector3 | undefined) => {
    beacon.visible = at !== undefined;
    if (at) beaconBase.copy(at);
  };
  /** 台本の持ち物（物の種類の名前）を、見た目の id にして人形に付ける */
  const applyItems = (puppet: Puppet, items: ActorState['items']) => {
    const models: Record<string, string> = {};
    for (const [slot, kind] of Object.entries(items ?? {})) models[slot] = kind ? options.propModelOf(kind) : '';
    puppet.setItems?.(models);
  };
  const postureOf = (name: string | undefined): PuppetPose => (name ? (options.postureOf(name) ?? {}) : {});
  const placeLight = (entry: { pillar: LightPillar; light: LightState }) => {
    const l = entry.light;
    const a = l.actor ? actors.get(l.actor) : undefined;
    const c = a ? a.coord : l.x !== undefined && l.z !== undefined ? { x: l.x, z: l.z } : undefined;
    if (c) entry.pillar.group.position.copy(mapView.tileTop(c.x, c.z));
    entry.pillar.group.visible = c !== undefined;
  };
  const dropLight = (name: string) => {
    lights.get(name)?.pillar.dispose();
    lights.delete(name);
  };
  const makeLight = (name: string, light: LightState) => {
    dropLight(name);
    const pillar = createLightPillar(options.lightColorOf(light.color));
    scene.add(pillar.group);
    const entry = { pillar, light };
    lights.set(name, entry);
    placeLight(entry);
    return entry;
  };

  const place = (obj: THREE.Object3D, c: Coord) => {
    obj.position.copy(mapView.tileTop(c.x, c.z));
    obj.userData.tileCoord = { x: c.x, z: c.z } satisfies TileCoord;
  };
  const makeActor = (name: string, a: ActorState) => {
    const look = options.lookOf(name);
    const puppet = options.makePuppet?.(look) ?? createPuppet(look);
    scene.add(puppet.group);
    place(puppet.group, a);
    puppet.setFacing(a.facing);
    applyItems(puppet, a.items);
    const posture = postureOf(a.posture);
    puppet.setPose?.(posture);
    actors.set(name, { puppet, coord: { x: a.x, z: a.z }, posture });
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
        applyItems(puppet, a.items);
        const posture = postureOf(a.posture);
        puppet.setPose?.(posture);
        actors.set(name, { puppet, coord: { x: a.x, z: a.z }, posture });
      }
      for (const name of [...lights.keys()]) if (!stage.lights?.[name]) dropLight(name);
      for (const [name, l] of Object.entries(stage.lights ?? {})) {
        const entry = lights.get(name);
        if (entry && entry.light.color === l.color) {
          entry.light = l;
          placeLight(entry);
        } else makeLight(name, l);
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
      refreshPropShadows(scene);
    },
    // 現れる・消える時は、体を薄く透かさない（半分透けた人影に見えたため。初見の検査）。
    // 白く光った姿が足もとから伸びて現れ、消える時は白く光ってから足もとへ縮む
    async enter(name, a) {
      dropActor(name);
      const puppet = makeActor(name, a);
      const white = new THREE.Color(0xffffff);
      puppet.setGlow(white, 1);
      await play(0.35, (t) => puppet.group.scale.set(1, Math.max(0.01, t), 1));
      puppet.group.scale.set(1, 1, 1);
      await play(0.25, (t) => puppet.setGlow(white, 1 - t));
      puppet.setGlow(white, 0);
    },
    async exit(name) {
      const a = actors.get(name);
      if (!a) return;
      const white = new THREE.Color(0xffffff);
      await play(0.2, (t) => a.puppet.setGlow(white, t));
      await play(0.3, (t) => a.puppet.group.scale.set(1, Math.max(0.01, 1 - t), 1));
      dropActor(name);
    },
    async walk(name, path, pace = 1) {
      const a = actors.get(name);
      if (!a) return;
      const seconds = STEP_SECONDS / Math.max(0.2, pace);
      // 歩く間は足と腕を振る（終わったら止める）
      a.puppet.setMoving?.(true);
      try {
        for (let i = 1; i < path.length; i++) {
          const from = mapView.tileTop(path[i - 1]!.x, path[i - 1]!.z);
          const to = mapView.tileTop(path[i]!.x, path[i]!.z);
          const dx = path[i]!.x - path[i - 1]!.x;
          const dz = path[i]!.z - path[i - 1]!.z;
          const facing: Direction = dx > 0 ? 'east' : dx < 0 ? 'west' : dz > 0 ? 'south' : 'north';
          a.puppet.setFacing(facing);
          const hop = Math.abs(to.y - from.y) > 0.01 ? 0.25 : 0.015;
          await play(seconds, (t) => {
            a.puppet.group.position.lerpVectors(from, to, t);
            a.puppet.group.position.y += Math.sin(Math.PI * t) * hop;
          });
          place(a.puppet.group, path[i]!);
          a.coord = { x: path[i]!.x, z: path[i]!.z };
        }
      } finally {
        a.puppet.setMoving?.(false);
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
      // 振り向く: 回る角度が大きいほど、少しゆっくり回る（人形劇のように、ぱっと向きが変わらないように）
      // 見た目の見本の2回目で、さらにゆっくりにした（重さのある動きに）
      const seconds = 0.34 + 0.36 * (Math.abs(to - from) / Math.PI);
      await play(seconds, (t) => a.puppet.setYaw(from + (to - from) * (t * t * (3 - 2 * t))));
      a.puppet.setFacing(facing);
    },
    async gesture(name, motion) {
      const a = actors.get(name);
      if (!a) return;
      await playGesture(tweens, a.puppet, motion, a.posture, speed);
    },
    talk(name, seconds) {
      actors.get(name)?.puppet.talk?.(seconds);
    },
    async putProp(name, kind, c) {
      dropProp(name);
      const model = makeProp(name, kind, c);
      await play(0.3, (t) => {
        model.setOpacity(t);
        model.body.scale.setScalar(0.6 + 0.4 * t);
      });
      refreshPropShadows(scene);
    },
    async removeProp(name) {
      const p = props.get(name);
      if (!p) return;
      await play(0.3, (t) => p.model.setOpacity(1 - t));
      dropProp(name);
      refreshPropShadows(scene);
    },
    async moveProp(name, c, seconds) {
      const p = props.get(name);
      if (!p) return;
      const from = p.model.group.position.clone();
      const to = mapView.tileTop(c.x, c.z);
      await play(Math.max(0.05, seconds), (t) => p.model.group.position.lerpVectors(from, to, t));
      place(p.model.group, c);
      p.coord = { x: c.x, z: c.z };
      refreshPropShadows(scene);
    },
    setTapTarget(name) {
      if (tapTarget) props.get(tapTarget)?.model.setGlow(new THREE.Color(0xffffff), 0);
      tapTarget = name;
      const p = name ? props.get(name) : undefined;
      // 押す物のマスは塗らない（物に半分隠れた黄色い板が、大きな三角の目印に見えるため。初見の検査）。押す所は物の弱い光と上の目印で示す
      mapView.setMarks([]);
      setBeacon(p ? mapView.tileTop(p.coord.x, p.coord.z).add(new THREE.Vector3(0, 1.15, 0)) : undefined);
      return p ? { ...p.coord } : undefined;
    },
    async changeProp(name, kind) {
      const p = props.get(name);
      if (!p) return;
      // 前の形と新しい形を、光らせずに入れ替える（白く光ると、開いた戸が白い板に見えるため。序章の演出の直し）
      const old = p.model;
      props.delete(name);
      const model = makeProp(name, kind, p.coord);
      model.setOpacity(0);
      await play(0.3, (t) => {
        model.setOpacity(t);
        old.setOpacity(1 - t);
      });
      scene.remove(old.group);
      refreshPropShadows(scene);
    },
    setItems(name, items) {
      const a = actors.get(name);
      if (a) applyItems(a.puppet, items);
    },
    async setPosture(name, posture) {
      const a = actors.get(name);
      if (!a) return;
      const from = a.posture;
      const to = postureOf(posture);
      a.posture = to;
      await play(0.4, (t) => {
        const mix: Record<string, number> = {};
        for (const k of new Set([...Object.keys(from), ...Object.keys(to)]) as Set<keyof PuppetPose>) {
          mix[k] = (from[k] ?? 0) + ((to[k] ?? 0) - (from[k] ?? 0)) * t;
        }
        a.puppet.setPose?.(mix);
      });
    },
    async setLight(name, light) {
      if (!light) {
        const entry = lights.get(name);
        if (!entry) return;
        await play(0.5, (t) => entry.pillar.setOpacity(1 - t));
        dropLight(name);
        return;
      }
      const entry = makeLight(name, light);
      await play(0.6, (t) => entry.pillar.setOpacity(t));
    },
    actorPoint(name) {
      const a = actors.get(name);
      return a ? mapView.tileTop(a.coord.x, a.coord.z).add(new THREE.Vector3(0, 0.6, 0)) : undefined;
    },
    propPoint(name) {
      const p = props.get(name);
      return p ? mapView.tileTop(p.coord.x, p.coord.z).add(new THREE.Vector3(0, 0.3, 0)) : undefined;
    },
    actorSlot(name, slot) {
      return actors.get(name)?.puppet.itemPoint?.(slot);
    },
    propTop(name) {
      const p = props.get(name);
      if (!p) return undefined;
      const box = new THREE.Box3().setFromObject(p.model.group);
      return box.isEmpty() ? undefined : new THREE.Vector3((box.min.x + box.max.x) / 2, box.max.y + 0.08, (box.min.z + box.max.z) / 2);
    },
    actorHead(name) {
      const a = actors.get(name);
      return a ? headTop(a.puppet.group) : undefined;
    },
    setWalkTargets(tiles, goal) {
      // 次に進めるマスは黄色で目立たせ、行き先は青で示す
      const next = tiles.map((t) => ({ x: t.x, z: t.z, kind: 'selected' as const }));
      const showGoal = goal && !tiles.some((t) => t.x === goal.x && t.z === goal.z);
      mapView.setMarks([...(showGoal ? [{ x: goal.x, z: goal.z, kind: 'move' as const }] : []), ...next]);
      const first = tiles[0];
      setBeacon(first ? mapView.tileTop(first.x, first.z).add(new THREE.Vector3(0, 0.75, 0)) : undefined);
    },
    beaconVisible: () => beacon.visible,
    setSpeed(multiplier) {
      speed = Math.max(0.1, multiplier);
    },
    pickTargets: () => [mapView.group, ...[...actors.values()].map((a) => a.puppet.group), ...[...props.values()].map((p) => p.model.group)],
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
      for (const p of props.values()) p.model.update(elapsed);
      // タップを待っている物は、ゆっくり明滅する
      // 押す物は、形が分かる程度に弱く光らせる（強く光ると、戸が光る板に見えるため。初見の検査）。押す所は上の揺れる目印で示す
      if (tapTarget) props.get(tapTarget)?.model.setGlow(new THREE.Color(0xffe8a0), 0.18 + Math.sin(elapsed * 4) * 0.1);
      if (beacon.visible) {
        beacon.position.copy(beaconBase).add(new THREE.Vector3(0, Math.abs(Math.sin(elapsed * 3)) * 0.18, 0));
        beacon.rotation.y = elapsed * 1.5;
      }
      for (const l of lights.values()) {
        if (l.light.actor) placeLight(l);
        l.pillar.update(elapsed);
      }
    },
    dispose() {
      scene.remove(beacon);
      for (const c of beacon.children) {
        const m = c as THREE.Mesh;
        m.geometry.dispose();
        (m.material as THREE.Material).dispose();
      }
      for (const name of [...lights.keys()]) dropLight(name);
      for (const name of [...actors.keys()]) dropActor(name);
      for (const name of [...props.keys()]) dropProp(name);
      mapView.setMarks([]);
    },
  };
}
