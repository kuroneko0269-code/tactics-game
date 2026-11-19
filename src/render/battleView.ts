import * as THREE from 'three';
import { headTop } from './speakerMark';
import type { BattleEvent, BattleState, SpellElement, Team, TrapKind, UnitKind, UnitState } from '../core/battleTypes';
import { DIRECTION_VECTORS, DIRECTIONS, type Coord, type Direction } from '../core/geometry';
import type { MapView, OverlayTile, ReservedTile, TileCoord, TileMark } from './mapView';
import { createPuppet, YAW_OF, type Puppet, type PuppetLook, type PuppetPose } from './puppet';
import { createPropModel } from './props';
import { createLightPillar, playGesture, type GestureMotion, type LightPillar } from './motion';
import type { BattleMap } from '../core/map';
import { judgeTap, type TapCandidates, type TapHit } from './tapJudge';
import { createTweens, easeInOut, easeOutCubic } from './tweens';

/**
 * 戦闘中のユニットの見た目と動き。
 * 戦闘の結果は計算せず、core が返した出来事（イベント）と状態をそのまま見せるだけにする。
 */
export interface BattleView {
  /** タップ判定の対象 */
  pickTargets(): THREE.Object3D[];
  /** タップされた物 → マス座標（マス・ユニット） */
  coordOf(object: THREE.Object3D): TileCoord | undefined;
  /**
   * 画面上の点 (x, y) をタップした時に選ぶマスの候補を、優先する順に返す（tapJudge.ts の規則）。
   * hitsAt は、画面上の点の下にある物を手前から順に返す関数。
   */
  tapCandidates(hitsAt: (x: number, y: number) => THREE.Intersection[], x: number, y: number): TapCandidates;
  /** 状態に合わせて、すべてのユニットの位置・向き・表示を即座にそろえる */
  sync(state: BattleState): void;
  setMarks(marks: readonly TileMark[]): void;
  /** 詠唱中の魔法が予約している範囲を、属性の色で薄く表示する */
  setReserved(tiles: readonly { x: number; z: number; element: SpellElement; affects?: 'enemies' | 'allies' }[]): void;
  /** 詠唱中のユニットに、属性の色の目印（回る輪）を付ける。element が undefined なら外す */
  setCharging(unitId: string, element: SpellElement | undefined): void;
  /** 魔法を指定した時の動き（詠唱者が杖を掲げて、属性の色に光る） */
  animateCast(event: Extract<BattleEvent, { type: 'castStarted' }>, element: SpellElement): Promise<void>;
  /** 魔法が発動した時の演出。範囲のマスに属性の色の光の柱を立てる。光った瞬間に onImpact を呼ぶ */
  animateSpell(event: Extract<BattleEvent, { type: 'spellResolved' }>, onImpact: () => void): Promise<void>;
  /** 手番のユニットの頭上に目印を出す */
  setActive(unitId: string | undefined): void;
  /** 会話の間は手番の印を隠す（話者の印と見分けがつかないように） */
  setActiveMarkerHidden(hidden: boolean): void;
  /** 選んでいる向きを、ユニットの足もとの矢印で示す（undefined で消す）。矢印はタップの対象ではない */
  showFacingArrows(unitId: string | undefined, selected?: Direction): void;
  /**
   * 向きを選ぶボタンを置くための画面座標（px）: ユニットのマスの中央と、各向きに 1 マス進んだ点。
   * 向きのボタン（src/ui）を、画面上でその向きの側に並べるために使う。
   */
  facingScreen(unitId: string): { center: { x: number; y: number }; dirs: Record<Direction, { x: number; y: number }> };
  turnTo(unitId: string, facing: Direction): Promise<void>;
  animateMove(unitId: string, path: readonly Coord[]): Promise<void>;
  /** 攻撃の動き。当たった（または外れた）瞬間に onImpact を呼ぶ */
  animateAttack(event: Extract<BattleEvent, { type: 'attacked' }>, onImpact: () => void): Promise<void>;
  /** 突き飛ばしで押し出される動き（押し出せない時は、その場で揺れる）。止まった瞬間に onImpact を呼ぶ */
  animateKnockback(event: Extract<BattleEvent, { type: 'knockedBack' }>, onImpact: () => void): Promise<void>;
  /**
   * 戦闘不能になる（戦闘で人は死なない決まり）。人はその場に膝をつき、そのマスに残る。
   * 影と獣は、すぐ後の退場の動きに任せる（ここでは少し揺れるだけ）
   */
  animateDefeat(unitId: string, kind?: UnitKind): Promise<void>;
  /**
   * 退場する（戦闘で人は死なない決まり）。人と獣は立ち上がって、近いマップの端の方へ歩いて退く。
   * 影は石に戻って消える
   */
  animateRetire(unitId: string, kind?: UnitKind): Promise<void>;
  /** 対象物が壊れて消える（物語の土台） */
  animateBreak(unitId: string): Promise<void>;
  /** 地形が変わった（物語の土台）: マスを作り直し、ユニットを新しい高さに置き直す */
  updateMap(map: BattleMap): Promise<void>;
  /** 蘇生で立ち上がる */
  animateRevive(unitId: string): Promise<void>;
  wait(seconds: number): Promise<void>;
  /** 各ユニットの頭上の画面座標（px） */
  unitAnchors(): { id: string; x: number; y: number; visible: boolean }[];
  /** マスの上面中央の画面座標（px）。自動テスト用 */
  tileScreenPosition(x: number, z: number): { x: number; y: number };
  /** マスの上面の中央と、その周り8か所の画面座標（px）。奥のマスの見えている部分を探すため。自動テスト用 */
  tileScreenPoints(x: number, z: number): { x: number; y: number }[];
  /** ユニットの体の中ほどの画面座標（px）。自動テスト用 */
  unitScreenPosition(unitId: string): { x: number; y: number };
  /**
   * ユニットの見た目の様子（自動テスト用）: 見えているか、戦闘不能の姿か、膝をついている度合い（0 立つ〜1 膝をつく）、
   * 見た目の上でいるマスと、体の位置
   */
  poseOf(unitId: string): { visible: boolean; down: boolean; kneel: number; coord: Coord; world: { x: number; z: number } } | undefined;
  update(deltaSeconds: number, elapsedSeconds: number): void;
  /** 戦闘の間ずっと出しておく目印（到達するマス・増援の予告・見えている罠） */
  setOverlays(tiles: readonly OverlayTile[]): void;
  /** 増援が現れる（その場に光りながら浮かび上がる） */
  animateAppear(unit: UnitState): Promise<void>;
  /** 罠が発動する（落石は上から岩が落ち、ぬかるみと脱力の罠はマスとユニットが光る） */
  animateTrap(event: Extract<BattleEvent, { type: 'trapTriggered' }>): Promise<void>;
  /** ユニットや目印をシーンから取り除く（戦闘を終えて拠点へ戻る時） */
  dispose(): void;
  // ---- 戦闘中の会話と、戦闘の後の台本（序章に足りない仕組み。戦闘の結果は変えず、見せ方だけ） ----
  /** ユニットか背景の人の、頭上のあたりの位置（カメラを向ける先）。いなければ undefined */
  actorPoint(id: string): THREE.Vector3 | undefined;
  /** 仕草をさせる */
  gesture(id: string, motion: GestureMotion): Promise<void>;
  /** 向きを変える（背景の人も） */
  turnActor(id: string, facing: Direction): Promise<void>;
  /** 歩かせる（見た目だけ。道順は始めのマスを含む） */
  walkActor(id: string, path: readonly Coord[], speed?: number): Promise<void>;
  /** 人物の頭のてっぺんの位置（会話の話者の印を出す所） */
  actorHead(id: string): THREE.Vector3 | undefined;
  /** 光にさらわれるように消える。fall なら、横から押し流されて、白く光りながら下へ落ちていく（時の外へ落ちる） */
  vanish(id: string, fall?: boolean): Promise<void>;
  /**
   * 攻撃の動きを見せる（見た目だけ。序章の丘の始めの演出）。隣なら踏み込んで斬り、離れていれば矢を放つ。
   * parry は受ける側が武器で払う（白く光る）。当たった瞬間に onImpact を呼ぶ
   */
  strikeActor(attackerId: string, targetId: string, outcome: 'hit' | 'miss' | 'parry', onImpact?: () => void): Promise<void>;
  /** 押し返される（見た目だけ）: 向きを変えずに、滑るように to のマスへ下がる */
  pushBackActor(id: string, to: Coord): Promise<void>;
  /** 物を置く・消す（見た目だけ） */
  putProp(name: string, model: string, c: Coord): Promise<void>;
  removeProp(name: string): Promise<void>;
  /** 物（置き物を含む）の見た目を替える（涸れた谷に水が流れる など） */
  changeProp(name: string, model: string): Promise<void>;
  /** 物（置き物を含む）の位置（物の名前の札を出す所） */
  propPoint(name: string): THREE.Vector3 | undefined;
  /** 物（置き物を含む）を、そのマスへ seconds 秒かけて動かす */
  moveProp(name: string, c: Coord, seconds: number): Promise<void>;
  /** 台本の人物（ユニットか背景の人）の続く姿勢（勝った後の台本の「膝をついたまま」など）。空なら元に戻す */
  setActorPose(id: string, pose: PuppetPose): Promise<void>;
  /** 持ち物を付け替える（model が空なら外す） */
  setItems(id: string, slot: 'hand' | 'handL' | 'waist' | 'back', model: string): void;
  /** 光を立てる（マスかユニットに）・消す */
  setLight(name: string, light: { x?: number; z?: number; actor?: string; color: number } | undefined): Promise<void>;
}

const TEAM_COLORS: Record<Team, { body: number; ring: number }> = {
  player: { body: 0x2f6fe0, ring: 0x58a6ff },
  enemy: { body: 0xc8352e, ring: 0xff5a4f },
  neutral: { body: 0xb0a890, ring: 0xffc857 },
};
const JOB_LOOKS: Record<string, Omit<PuppetLook, 'body'>> = {
  warrior: { accent: 0xf2c14e, weapon: 'sword', hat: 'helm' },
  archer: { accent: 0x8fd66b, weapon: 'bow', hat: 'hood' },
  mage: { accent: 0x8a5cf0, weapon: 'staff', hat: 'wizard' },
  healer: { accent: 0xf4f1e8, weapon: 'staff', hat: 'wizard' },
  // フェーズ2-6 のジョブ（仮の人形は、帽子と武器の形を3種類から選び、色で見分ける）
  timekeeper: { accent: 0x5fd0e0, weapon: 'sword', hat: 'helm' },
  knight: { accent: 0xb8c4d6, weapon: 'sword', hat: 'helm' },
  monk: { accent: 0xe07a3a, weapon: 'bow', hat: 'hood' },
  thief: { accent: 0x5a6a52, weapon: 'bow', hat: 'hood' },
  timeMage: { accent: 0x3fc1c9, weapon: 'staff', hat: 'wizard' },
  summoner: { accent: 0x2f9e5a, weapon: 'staff', hat: 'wizard' },
  magicKnight: { accent: 0xc0404f, weapon: 'sword', hat: 'helm' },
};
/** 属性の色（仮） */
export const ELEMENT_COLORS: Record<SpellElement, number> = {
  fire: 0xff5a1f,
  wind: 0x3fd69a,
  thunder: 0x6f8bff,
  light: 0xffe56b,
  ice: 0x9fe8ff,
  earth: 0xb08a4a,
  none: 0xd9d9d9,
};
/** 罠が発動した時の光の色（ぬかるみは土色、脱力の罠は紫） */
const TRAP_COLORS: Record<TrapKind, number> = { rockfall: 0x8c7b6a, mud: 0x8a5a24, drain: 0xb04df0 };
const HEAD_HEIGHT = 1.05;
/**
 * タップした点の周りで調べる点（px）。指の太さぶんのずれを考え、タップした点のマスが選べない時に、
 * すぐ近くの選べるマスを探すため（tapJudge.ts）。半径 5px と 10px の円の上を 8 方向ずつ。
 */
const TAP_RING: readonly (readonly [number, number])[] = [5, 10].flatMap((r) =>
  [0, 1, 2, 3, 4, 5, 6, 7].map((k) => [Math.round(r * Math.cos((k * Math.PI) / 4)), Math.round(r * Math.sin((k * Math.PI) / 4))] as const),
);
const STEP_SECONDS = 0.2;
/** 戦闘不能の姿（膝をついた姿）の透明度。少しだけ淡くして、立っているユニットと見分ける */
const DOWN_OPACITY = 0.85;
/** 膝をついた姿（戦闘で人は死なない決まり）: 体を沈め、前にかがみ、うつむいて、手を膝の前に下ろす。血や呻き声は出さない */
const KNEEL_POSE: PuppetPose = { drop: 0.2, bow: 0.35, head: 0.45, armL: 0.35, armR: 0.35 };

/** 膝をついた姿にする（t が 0 で立った姿、1 で膝をついた姿） */
function setKneel(puppet: Puppet, t: number): void {
  puppet.group.userData.kneel = t;
  const pose: Record<string, number> = {};
  for (const [k, v] of Object.entries(KNEEL_POSE)) pose[k] = (v as number) * t;
  puppet.setPose?.(pose);
}

interface UnitVisual {
  readonly puppet: Puppet;
  coord: Coord;
  alive: boolean;
  /** 戦闘不能で、倒れた姿でマスに残っている（フェーズ2-5） */
  down: boolean;
  /** 詠唱中の目印（属性の色の輪） */
  readonly chargeRing: THREE.Mesh<THREE.TorusGeometry, THREE.MeshBasicMaterial>;
}

export function createBattleView(options: {
  scene: THREE.Scene;
  mapView: MapView;
  initial: BattleState;
  camera: () => THREE.Camera;
  canvas: HTMLCanvasElement;
  /**
   * ユニットの人物としての見た目（序章に足りない仕組み。部隊の人物と、物語の相手）。
   * undefined なら、ジョブの形と陣営の色の人形
   */
  lookOf?: (unit: Pick<UnitState, 'id' | 'jobId' | 'team'>) => PuppetLook | undefined;
  /** 背景の人の見た目の名前 → 見た目 */
  bystanderLook?: (look: string) => PuppetLook;
  /** 見た目だけの置き物（砦・旗・遠景の大勢の人々。物の見た目の id） */
  decor?: readonly { readonly id: string; readonly model: string; readonly x: number; readonly z: number }[];
}): BattleView {
  const { scene, mapView } = options;
  const tweens = createTweens();
  const visuals = new Map<string, UnitVisual>();

  /** ユニットの見た目を作る（戦闘の開始時と、増援が現れた時） */
  const addVisual = (unit: Pick<UnitState, 'id' | 'jobId' | 'team' | 'x' | 'z' | 'facing'>) => {
    const look = JOB_LOOKS[unit.jobId] ?? JOB_LOOKS.warrior!;
    // 対象物（物語の土台）は、物の見た目に足もとの輪だけを付ける（向きの目印は付けない）
    const isObject = unit.team === 'neutral';
    const personal = isObject ? undefined : options.lookOf?.(unit);
    const puppet = isObject
      ? createPropModel(unit.jobId.replace(/^object:/, ''))
      : createPuppet(personal ?? { ...look, body: TEAM_COLORS[unit.team].body });
    puppet.group.add(teamRing(TEAM_COLORS[unit.team].ring));
    if (!isObject) puppet.group.add(facingPointer(TEAM_COLORS[unit.team].ring));
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
    const v: UnitVisual = { puppet, coord: { x: unit.x, z: unit.z }, alive: true, down: false, chargeRing };
    visuals.set(unit.id, v);
    place(v, unit);
    puppet.setFacing(unit.facing);
    return v;
  };

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

  for (const unit of options.initial.units) addVisual(unit);

  // 戦わない背景の人々（序章に足りない仕組み）: 人形だけを立てる（タップの対象にしない。陣営の輪も付けない）
  const bystanders = new Map<string, { puppet: Puppet; coord: Coord }>();
  for (const b of options.initial.bystanders ?? []) {
    const puppet = createPuppet(options.bystanderLook?.(b.look) ?? { body: 0x8a7a6a, accent: 0xd8c8a8, hair: 0x3a3028 });
    puppet.group.position.copy(mapView.tileTop(b.x, b.z));
    puppet.setFacing(b.facing);
    puppet.group.traverse((o) => (o.raycast = () => {}));
    scene.add(puppet.group);
    bystanders.set(b.id, { puppet, coord: { x: b.x, z: b.z } });
  }
  /** 台本が動かす人形（ユニットか背景の人） */
  const actorPuppet = (id: string): { puppet: Puppet; coord: Coord } | undefined => {
    const v = visuals.get(id);
    if (v) return v;
    return bystanders.get(id);
  };
  const lights = new Map<string, { pillar: LightPillar; actor?: string }>();
  const props = new Map<string, Puppet>();
  for (const d of options.decor ?? []) {
    const p = createPropModel(d.model);
    p.group.position.copy(mapView.tileTop(d.x, d.z));
    p.group.traverse((o) => (o.raycast = () => {}));
    scene.add(p.group);
    props.set(d.id, p);
  }
  const items = new Map<string, Record<string, string>>();
  const dropLight = (name: string) => {
    lights.get(name)?.pillar.dispose();
    lights.delete(name);
  };

  // 落石の岩（使い回す）
  const rock = new THREE.Mesh(new THREE.DodecahedronGeometry(0.22), new THREE.MeshLambertMaterial({ color: 0x7d6f60 }));
  rock.visible = false;
  scene.add(rock);

  // 手番のユニットの頭上で上下する目印
  const activeMarker = new THREE.Mesh(
    new THREE.ConeGeometry(0.13, 0.24, 4).rotateX(Math.PI),
    new THREE.MeshBasicMaterial({ color: 0xffe14d }),
  );
  activeMarker.visible = false;
  let markerHidden = false;
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
    // 足もとの矢印は向きを示すだけ。タップは画面のボタン（src/ui）で受ける
    mesh.raycast = () => {};
    arrowGroup.add(mesh);
    return { dir, mesh, material };
  });

  const projectile = new THREE.Mesh(
    new THREE.BoxGeometry(0.03, 0.03, 0.34),
    new THREE.MeshBasicMaterial({ color: 0x5a3a1a }),
  );
  projectile.visible = false;
  scene.add(projectile);

  const mapWidth = options.initial.map.width;
  const mapDepth = options.initial.map.depth;
  const coordOf = (object: THREE.Object3D): TileCoord | undefined => {
    for (let o: THREE.Object3D | null = object; o; o = o.parent) {
      const coord = o.userData.tileCoord as TileCoord | undefined;
      if (coord) return coord;
    }
    return undefined;
  };
  const isUnit = (object: THREE.Object3D) => {
    for (let o: THREE.Object3D | null = object; o; o = o.parent) if (o.userData.unitId) return true;
    return false;
  };

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
    // 戦闘不能のユニットも、タップして情報（残りのカウント）を見られ、蘇生で狙える
    pickTargets: () => [mapView.group, ...[...visuals.values()].filter((v) => v.alive || v.down).map((v) => v.puppet.group)],
    coordOf,
    tapCandidates(hitsAt, x, y) {
      const toHit = (hits: THREE.Intersection[]): TapHit | undefined => {
        const h = hits[0];
        if (!h) return undefined;
        const coord = coordOf(h.object);
        if (!coord) return undefined;
        if (isUnit(h.object)) return { kind: 'unit', coord };
        // マスの柱の側面（法線が横向き）なら、その側面が面している隣のマスと高さも渡す
        const normal = h.face?.normal;
        if (normal && Math.abs(normal.y) < 0.5 && mapView.coordOf(h.object) === coord) {
          const nx = Math.round(normal.x);
          const nz = Math.round(normal.z);
          const neighbor = { x: coord.x + nx, z: coord.z + nz };
          const inMap = neighbor.x >= 0 && neighbor.z >= 0 && neighbor.x < mapWidth && neighbor.z < mapDepth;
          return {
            kind: 'side',
            coord,
            neighbor: inMap ? neighbor : undefined,
            hitHeight: h.point.y,
            top: mapView.tileTop(coord.x, coord.z).y,
            neighborTop: inMap ? mapView.tileTop(neighbor.x, neighbor.z).y : undefined,
          };
        }
        return { kind: 'top', coord };
      };
      const nearby = TAP_RING.map(([dx, dy]) => toHit(hitsAt(x + dx, y + dy)));
      return judgeTap(toHit(hitsAt(x, y)), nearby);
    },
    sync(state) {
      for (const unit of state.units) {
        const v = visuals.get(unit.id) ?? addVisual(unit);
        place(v, unit);
        v.puppet.setFacing(unit.facing);
        v.alive = unit.hp > 0;
        v.down = unit.hp <= 0 && !unit.retired;
        v.puppet.group.visible = v.alive || v.down;
        v.puppet.setOpacity(v.down ? DOWN_OPACITY : 1);
        v.puppet.setFlash(0);
        v.puppet.body.scale.setScalar(1);
        setKneel(v.puppet, v.down ? 1 : 0);
        const spell = unit.charging && unit.spells.find((sp) => sp.id === unit.charging!.spellId);
        v.chargeRing.visible = Boolean(spell) && v.alive;
        if (spell) v.chargeRing.material.color.setHex(ELEMENT_COLORS[spell.element]);
      }
    },
    setMarks: (marks) => mapView.setMarks(marks),
    setOverlays: (tiles) => mapView.setOverlays(tiles),
    async animateAppear(unit) {
      const v = visuals.get(unit.id) ?? addVisual(unit);
      place(v, unit);
      v.alive = unit.hp > 0;
      v.puppet.group.visible = true;
      const glow = new THREE.Color(0xffffff);
      await tweens.play(0.5, (t) => {
        v.puppet.setOpacity(t);
        v.puppet.body.position.y = 0.4 * (1 - easeOutCubic(t));
        v.puppet.setGlow(glow, 1 - t);
      });
      v.puppet.body.position.y = 0;
      v.puppet.setOpacity(1);
      v.puppet.setGlow(glow, 0);
    },
    async animateTrap(event) {
      const top = mapView.tileTop(event.x, event.z);
      const v = event.unitId ? visual(event.unitId) : undefined;
      if (event.trap === 'rockfall') {
        rock.visible = true;
        await tweens.play(0.35, (t) => {
          rock.position.set(top.x, top.y + 0.5 + 2.2 * (1 - t * t), top.z);
          rock.rotation.set(t * 4, t * 3, 0);
        });
        rock.visible = false;
        if (v) await tweens.play(0.3, (t) => v.puppet.setFlash(1 - t));
        return;
      }
      if (!v) return void (await tweens.wait(0.3));
      const color = new THREE.Color(TRAP_COLORS[event.trap]);
      await tweens.play(0.6, (t) => {
        v.puppet.setGlow(color, Math.sin(Math.PI * t));
        v.puppet.body.position.y = -0.08 * Math.sin(Math.PI * t);
      });
      v.puppet.setGlow(color, 0);
      v.puppet.body.position.y = 0;
    },
    setReserved(tiles) {
      // 敵だけ・味方だけに効く魔法（召喚。フェーズ2-6）は、枠を赤・緑にして見分けられるようにする
      mapView.setReserved(
        tiles.map(
          (t): ReservedTile => ({
            x: t.x,
            z: t.z,
            color: ELEMENT_COLORS[t.element],
            ...(t.affects ? { frame: t.affects === 'enemies' ? 0xff3b3b : 0x3ddc84 } : {}),
          }),
        ),
      );
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
      activeMarker.visible = unitId !== undefined && !markerHidden;
    },
    setActiveMarkerHidden(hidden) {
      markerHidden = hidden;
      activeMarker.visible = activeId !== undefined && !hidden;
    },
    showFacingArrows(unitId, selected) {
      arrowGroup.visible = unitId !== undefined;
      if (!unitId) return;
      arrowGroup.position.copy(mapView.tileTop(visual(unitId).coord.x, visual(unitId).coord.z));
      // 選んでいる向きの矢印だけを、足もとに出す
      for (const a of arrows) {
        a.mesh.visible = a.dir === selected;
        a.material.color.setHex(0xffd23d);
        a.material.opacity = 0.95;
        a.mesh.scale.setScalar(1.3);
      }
    },
    facingScreen(unitId) {
      const c = visual(unitId).coord;
      const top = mapView.tileTop(c.x, c.z);
      const at = (dx: number, dz: number) => {
        const s = screenOf(top.clone().add(new THREE.Vector3(dx, 0, dz)));
        return { x: s.x, y: s.y };
      };
      const dirs = Object.fromEntries(DIRECTIONS.map((d) => [d, at(DIRECTION_VECTORS[d].x, DIRECTION_VECTORS[d].z)]));
      return { center: at(0, 0), dirs: dirs as Record<Direction, { x: number; y: number }> };
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
    async animateKnockback(event, onImpact) {
      const v = visual(event.unitId);
      if (!event.to) {
        // 押し出せない: 壁やユニットにぶつかったように揺れる
        onImpact();
        await tweens.play(0.3, (t) => {
          v.puppet.setFlash(1 - t);
          v.puppet.body.position.x = Math.sin(t * Math.PI * 8) * 0.07 * (1 - t);
        });
        v.puppet.body.position.x = 0;
        return;
      }
      const from = mapView.tileTop(event.from.x, event.from.z);
      const to = mapView.tileTop(event.to.x, event.to.z);
      const drop = Math.max(0, from.y - to.y);
      // 横へ滑ってから、低ければ落ちる
      await tweens.play(0.22 + drop * 0.06, (t) => {
        const k = easeOutCubic(Math.min(1, t * 1.6));
        v.puppet.group.position.x = from.x + (to.x - from.x) * k;
        v.puppet.group.position.z = from.z + (to.z - from.z) * k;
        const fall = t < 0.5 ? 0 : ((t - 0.5) / 0.5) ** 2;
        v.puppet.group.position.y = from.y + 0.08 * Math.sin(Math.PI * Math.min(1, t * 2)) - (from.y - to.y) * fall;
      });
      place(v, event.to);
      onImpact();
      if (event.damage > 0) {
        await tweens.play(0.25, (t) => v.puppet.setFlash(1 - t));
      }
    },
    async animateDefeat(unitId, kind = 'human') {
      const v = visual(unitId);
      v.chargeRing.visible = false;
      if (kind !== 'human') {
        // 影と獣は、すぐに退場の動きへ（ここでは小さく揺れるだけ）
        await tweens.play(0.25, (t) => (v.puppet.body.position.x = Math.sin(t * Math.PI * 4) * 0.05 * (1 - t)));
        v.puppet.body.position.x = 0;
        v.alive = false;
        v.down = true;
        return;
      }
      // 人: その場に膝をつく
      await tweens.play(0.7, (t) => {
        setKneel(v.puppet, easeOutCubic(t));
        v.puppet.setOpacity(1 - (1 - DOWN_OPACITY) * t);
      });
      v.alive = false;
      v.down = true;
    },
    async animateBreak(unitId) {
      const v = visual(unitId);
      const base = v.puppet.group.position.x;
      await tweens.play(0.5, (t) => {
        v.puppet.group.position.x = base + 0.06 * Math.sin(t * 40) * (1 - t);
        v.puppet.setFlash(1 - t);
        v.puppet.body.scale.setScalar(1 - 0.6 * t);
        v.puppet.setOpacity(1 - t);
      });
      v.puppet.group.position.x = base;
      v.alive = false;
      v.down = false;
      v.puppet.group.visible = false;
    },
    async updateMap(map) {
      mapView.setMap(map);
      for (const v of visuals.values()) place(v, v.coord);
      await tweens.wait(0.3);
    },
    async animateRetire(unitId, kind = 'human') {
      const v = visual(unitId);
      v.chargeRing.visible = false;
      if (kind === 'shade') {
        // 影: 灰色に光りながら小さな石の大きさに縮み、消える
        const grey = new THREE.Color(0x9a9a9a);
        await tweens.play(0.8, (t) => {
          v.puppet.setGlow(grey, Math.min(1, t * 2));
          v.puppet.body.scale.setScalar(1 - 0.85 * easeInOut(t));
          v.puppet.setOpacity(t < 0.7 ? 1 : 1 - (t - 0.7) / 0.3);
        });
        v.puppet.setGlow(grey, 0);
        v.puppet.body.scale.setScalar(1);
      } else {
        // 人と獣: 立ち上がり、近いマップの端の方を向いて、歩いて退く（見た目だけ。マスの高さは気にしない）
        if (kind === 'human') {
          await tweens.play(0.5, (t) => {
            setKneel(v.puppet, 1 - easeInOut(t));
            v.puppet.setOpacity(DOWN_OPACITY + (1 - DOWN_OPACITY) * t);
          });
        }
        const toward = exitDirection(v.coord, mapWidth, mapDepth);
        await turnTo(unitId, toward);
        const from = v.puppet.group.position.clone();
        const step = DIRECTION_VECTORS[toward];
        await tweens.play(1.2, (t) => {
          v.puppet.group.position.set(from.x + step.x * 1.6 * t, from.y + Math.abs(Math.sin(t * Math.PI * 6)) * 0.03, from.z + step.z * 1.6 * t);
          v.puppet.setOpacity(t < 0.4 ? 1 : 1 - (t - 0.4) / 0.6);
        });
        v.puppet.group.position.copy(from);
      }
      setKneel(v.puppet, 0);
      v.alive = false;
      v.down = false;
      v.puppet.group.visible = false;
    },
    async animateRevive(unitId) {
      const v = visual(unitId);
      const glow = new THREE.Color(ELEMENT_COLORS.light);
      v.puppet.group.visible = true;
      await tweens.play(0.6, (t) => {
        setKneel(v.puppet, 1 - easeInOut(t));
        v.puppet.setOpacity(DOWN_OPACITY + (1 - DOWN_OPACITY) * t);
        v.puppet.setGlow(glow, 1 - t);
      });
      setKneel(v.puppet, 0);
      v.puppet.setOpacity(1);
      v.puppet.setGlow(glow, 0);
      v.alive = true;
      v.down = false;
    },
    wait: (seconds) => tweens.wait(seconds),
    unitAnchors() {
      return [...visuals.entries()].map(([id, v]) => {
        const world = v.puppet.group.position.clone().add(new THREE.Vector3(0, HEAD_HEIGHT, 0));
        const s = screenOf(world);
        return { id, x: s.x, y: s.y, visible: (v.alive || v.down) && s.onScreen };
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
      const v = visual(unitId);
      // 膝をついた姿なら、少し低い位置（体の中ほど）
      const offset = v.down ? new THREE.Vector3(0, 0.3, 0) : new THREE.Vector3(0, 0.5, 0);
      const s = screenOf(v.puppet.group.position.clone().add(offset));
      return { x: s.x, y: s.y };
    },
    poseOf(unitId) {
      const v = visuals.get(unitId);
      if (!v) return undefined;
      const p = v.puppet.group.position;
      return {
        visible: v.puppet.group.visible,
        down: v.down,
        kneel: (v.puppet.group.userData.kneel as number | undefined) ?? 0,
        coord: { ...v.coord },
        world: { x: p.x, z: p.z },
      };
    },
    actorPoint(id) {
      const a = actorPuppet(id);
      return a ? a.puppet.group.position.clone().add(new THREE.Vector3(0, 0.6, 0)) : undefined;
    },
    async gesture(id, motion) {
      const a = actorPuppet(id);
      // 膝をついたユニット（堰の番兵など）は、膝をついた姿に仕草を重ねる
      const base = visuals.get(id)?.down ? KNEEL_POSE : ({} as PuppetPose);
      if (a) await playGesture(tweens, a.puppet, motion, base);
    },
    async turnActor(id, facing) {
      const a = actorPuppet(id);
      if (!a) return;
      const from = a.puppet.yaw;
      let to = YAW_OF[facing];
      while (to - from > Math.PI) to -= Math.PI * 2;
      while (to - from < -Math.PI) to += Math.PI * 2;
      if (Math.abs(to - from) < 0.001) return;
      await tweens.play(0.2, (t) => a.puppet.setYaw(from + (to - from) * t));
      a.puppet.setFacing(facing);
    },
    actorHead(id) {
      const a = actorPuppet(id);
      return a ? headTop(a.puppet.group) : undefined;
    },
    async walkActor(id, path, pace = 1) {
      const a = actorPuppet(id);
      if (!a) return;
      const seconds = 0.28 / Math.max(0.2, pace);
      for (let i = 1; i < path.length; i++) {
        const from = mapView.tileTop(path[i - 1]!.x, path[i - 1]!.z);
        const to = mapView.tileTop(path[i]!.x, path[i]!.z);
        const dx = path[i]!.x - path[i - 1]!.x;
        const dz = path[i]!.z - path[i - 1]!.z;
        a.puppet.setFacing(dx > 0 ? 'east' : dx < 0 ? 'west' : dz > 0 ? 'south' : 'north');
        await tweens.play(seconds, (t) => a.puppet.group.position.lerpVectors(from, to, t));
        a.coord = { x: path[i]!.x, z: path[i]!.z };
      }
    },
    async vanish(id, fall) {
      const a = actorPuppet(id);
      if (!a) return;
      const glow = new THREE.Color(0xffffff);
      const y0 = a.puppet.body.position.y;
      if (fall) {
        // 光が横からさらう: 横へ流され、傾きながら、白く光って足もとの下へ沈んでいく（2.4 秒。見届けられる長さ）
        const x0 = a.puppet.body.position.x;
        await tweens.play(2.4, (t) => {
          a.puppet.setGlow(glow, Math.min(1, t * 1.6));
          a.puppet.setOpacity(t < 0.6 ? 1 : 1 - (t - 0.6) / 0.4);
          a.puppet.body.position.x = x0 + 0.35 * Math.min(1, t * 2);
          a.puppet.body.rotation.z = -0.9 * t;
          a.puppet.body.position.y = y0 - 1.6 * t * t;
        });
        a.puppet.group.visible = false;
        a.puppet.setGlow(glow, 0);
        a.puppet.body.rotation.z = 0;
        a.puppet.body.position.set(x0, y0, a.puppet.body.position.z);
        return;
      }
      // 門の光へ入っていく: 少しだけ光りながら薄れる（白く光る人影に見えないように）
      await tweens.play(0.9, (t) => {
        a.puppet.setGlow(glow, Math.min(0.35, t));
        a.puppet.setOpacity(1 - t);
        a.puppet.body.position.y = y0 + 0.5 * t * t;
      });
      a.puppet.group.visible = false;
      a.puppet.setGlow(glow, 0);
    },
    async strikeActor(attackerId, targetId, outcome, onImpact) {
      const a = actorPuppet(attackerId);
      const b = actorPuppet(targetId);
      if (!a || !b) return;
      const dx = b.coord.x - a.coord.x;
      const dz = b.coord.z - a.coord.z;
      const facing: Direction = Math.abs(dx) >= Math.abs(dz) ? (dx > 0 ? 'east' : 'west') : dz > 0 ? 'south' : 'north';
      a.puppet.setFacing(facing);
      // 受ける側は攻める側を向く
      b.puppet.setFacing(Math.abs(dx) >= Math.abs(dz) ? (dx > 0 ? 'west' : 'east') : dz > 0 ? 'north' : 'south');
      const local = new THREE.Vector3(0, 0, 1);
      const ranged = Math.abs(dx) + Math.abs(dz) > 1;
      if (ranged) {
        await tweens.play(0.18, (t) => a.puppet.body.position.copy(local).multiplyScalar(-0.08 * t));
        a.puppet.body.position.set(0, 0, 0);
        const start = mapView.tileTop(a.coord.x, a.coord.z).add(new THREE.Vector3(0, 0.55, 0));
        const end = mapView.tileTop(b.coord.x, b.coord.z).add(new THREE.Vector3(0, 0.5, 0));
        const arc = 0.6 + start.distanceTo(end) * 0.12;
        const prev = start.clone();
        projectile.visible = true;
        await tweens.play(0.38, (t) => {
          projectile.position.lerpVectors(start, end, t);
          projectile.position.y += Math.sin(Math.PI * t) * arc;
          if (t > 0) projectile.lookAt(prev.clone().lerp(projectile.position, 2));
          prev.copy(projectile.position);
        });
        projectile.visible = false;
      } else {
        await tweens.play(0.14, (t) => a.puppet.body.position.copy(local).multiplyScalar(0.32 * easeOutCubic(t)));
      }
      onImpact?.();
      const white = new THREE.Color(0xffffff);
      if (outcome === 'parry') {
        // 剣を振って払う（右腕を上げて振り下ろす）。打ち合った所が白く光る
        await tweens.play(0.32, (t) => {
          b.puppet.setPose?.({ armR: 2.2 * Math.sin(Math.PI * t), bow: 0.1 * Math.sin(Math.PI * t) });
          b.puppet.setGlow(white, 0.8 * (1 - t));
        });
        b.puppet.setPose?.({});
        b.puppet.setGlow(white, 0);
      } else if (outcome === 'hit') {
        await tweens.play(0.3, (t) => {
          b.puppet.setFlash(1 - t);
          b.puppet.body.position.x = Math.sin(t * Math.PI * 6) * 0.05 * (1 - t);
        });
      } else {
        await tweens.play(0.3, (t) => (b.puppet.body.position.x = Math.sin(Math.PI * t) * 0.25));
      }
      b.puppet.body.position.set(0, 0, 0);
      if (!ranged) await tweens.play(0.14, (t) => a.puppet.body.position.copy(local).multiplyScalar(0.32 * (1 - easeInOut(t))));
      a.puppet.body.position.set(0, 0, 0);
    },
    async pushBackActor(id, to) {
      const a = actorPuppet(id);
      if (!a) return;
      const from = a.puppet.group.position.clone();
      const end = mapView.tileTop(to.x, to.z);
      const white = new THREE.Color(0xffffff);
      await tweens.play(0.45, (t) => {
        const k = easeOutCubic(t);
        a.puppet.group.position.set(from.x + (end.x - from.x) * k, from.y + (end.y - from.y) * k + Math.sin(Math.PI * t) * 0.08, from.z + (end.z - from.z) * k);
        a.puppet.setGlow(white, 0.5 * (1 - t));
        a.puppet.setPose?.({ bow: -0.2 * Math.sin(Math.PI * t) });
      });
      a.puppet.setPose?.({});
      a.puppet.setGlow(white, 0);
      a.puppet.group.position.copy(end);
      a.coord = { x: to.x, z: to.z };
    },
    async putProp(name, model, c) {
      props.get(name)?.group.removeFromParent();
      const p = createPropModel(model);
      p.group.position.copy(mapView.tileTop(c.x, c.z));
      p.group.traverse((o) => (o.raycast = () => {}));
      scene.add(p.group);
      props.set(name, p);
      await tweens.play(0.3, (t) => p.setOpacity(t));
    },
    async changeProp(name, model) {
      const old = props.get(name);
      if (!old) return;
      const p = createPropModel(model);
      p.group.position.copy(old.group.position);
      p.group.rotation.copy(old.group.rotation);
      p.group.traverse((o) => (o.raycast = () => {}));
      scene.add(p.group);
      props.set(name, p);
      p.setOpacity(0);
      await tweens.play(0.6, (t) => {
        p.setOpacity(t);
        old.setOpacity(1 - t);
      });
      old.group.removeFromParent();
    },
    propPoint(name) {
      const p = props.get(name);
      if (!p) return undefined;
      // 物の形のいちばん上の少し上（物の名前の札が物を隠さないように）。大きな遠景（村など）は、置いた所の少し上
      const box = new THREE.Box3().setFromObject(p.group);
      const top = box.isEmpty() ? 0.3 : Math.min(box.max.y - p.group.position.y + 0.08, 1.2);
      return p.group.position.clone().add(new THREE.Vector3(0, top, 0));
    },
    async removeProp(name) {
      const p = props.get(name);
      if (!p) return;
      await tweens.play(0.3, (t) => p.setOpacity(1 - t));
      p.group.removeFromParent();
      props.delete(name);
    },
    async moveProp(name, c, seconds) {
      const p = props.get(name);
      if (!p) return;
      const from = p.group.position.clone();
      const to = mapView.tileTop(c.x, c.z);
      await tweens.play(Math.max(0.05, seconds), (t) => p.group.position.lerpVectors(from, to, t));
    },
    async setActorPose(id, pose) {
      const a = actorPuppet(id);
      if (!a?.puppet.setPose) return;
      await tweens.play(0.4, (t) => {
        const mix: Record<string, number> = {};
        for (const [k, v] of Object.entries(pose)) mix[k] = (v ?? 0) * t;
        a.puppet.setPose!(mix);
      });
    },
    setItems(id, slot, model) {
      const a = actorPuppet(id);
      if (!a) return;
      const next = { ...items.get(id), [slot]: model };
      items.set(id, next);
      a.puppet.setItems?.(next);
    },
    async setLight(name, light) {
      if (!light) {
        const entry = lights.get(name);
        if (!entry) return;
        await tweens.play(0.5, (t) => entry.pillar.setOpacity(1 - t));
        dropLight(name);
        return;
      }
      dropLight(name);
      const pillar = createLightPillar(light.color);
      const c = light.actor ? actorPuppet(light.actor)?.coord : light.x !== undefined && light.z !== undefined ? { x: light.x, z: light.z } : undefined;
      if (!c) return pillar.dispose();
      pillar.group.position.copy(mapView.tileTop(c.x, c.z));
      scene.add(pillar.group);
      lights.set(name, { pillar, ...(light.actor ? { actor: light.actor } : {}) });
      await tweens.play(0.6, (t) => pillar.setOpacity(t));
    },
    update(dt, elapsed) {
      tweens.update(dt);
      for (const b of bystanders.values()) b.puppet.update(elapsed);
      for (const p of props.values()) p.update(elapsed);
      for (const l of lights.values()) {
        const at = l.actor ? actorPuppet(l.actor) : undefined;
        if (at) l.pillar.group.position.set(at.puppet.group.position.x, l.pillar.group.position.y, at.puppet.group.position.z);
        l.pillar.update(elapsed);
      }
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
    dispose() {
      for (const v of visuals.values()) scene.remove(v.puppet.group);
      for (const b of bystanders.values()) scene.remove(b.puppet.group);
      for (const name of [...lights.keys()]) dropLight(name);
      for (const p of props.values()) p.group.removeFromParent();
      for (const m of bursts) scene.remove(m);
      scene.remove(activeMarker, arrowGroup, projectile, rock);
      mapView.setMarks([]);
      mapView.setReserved([]);
      mapView.setOverlays([]);
    },
  };
}

/** 退場する時に向かう向き: いちばん近いマップの端の方 */
function exitDirection(c: Coord, width: number, depth: number): Direction {
  const d: [Direction, number][] = [
    ['west', c.x],
    ['east', width - 1 - c.x],
    ['north', c.z],
    ['south', depth - 1 - c.z],
  ];
  d.sort((a, b) => a[1] - b[1]);
  return d[0]![0];
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
