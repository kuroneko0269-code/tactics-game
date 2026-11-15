/**
 * 会話の進行（物語の土台）。台本（script.ts）の手順を1つずつ進め、その時点の舞台（人物・物・暗転）の様子と、
 * 読み返し（これまでの台詞）を計算する。画面はこの結果を見せるだけにする（動きの時間や文字の速さは画面の役割）。
 *
 * - 進行の位置（index）は「次に出す手順」の番号。台詞・語り・操作の場面で止まり、指示だけの手順は続けて行う。
 * - 早送り: 画面が台詞を待たずに次々進める（ここでは止まる手順の一覧だけを決める。操作の場面では止まる）。
 * - スキップ: 最後まで飛ばす。舞台は、最後まで指示を行った後の様子になる（操作の場面も飛ばす）。
 */
import type { Direction } from './geometry';
import { isInteractive, plainText, type Directive, type ItemSlot, type RubySegment, type Script, type ScriptStep } from './script';

export interface ActorState {
  readonly x: number;
  readonly z: number;
  readonly facing: Direction;
  /** 持ち物（付ける所 → 物の種類の名前。空の文字なら何も持たない）。省いた所は、見た目の決まりのまま */
  readonly items?: Readonly<Partial<Record<ItemSlot, string>>>;
  /** 続く姿勢（座る など。省くと立っている） */
  readonly posture?: string;
}

/** 立っている光（マスか人物に立てる） */
export interface LightState {
  readonly x?: number;
  readonly z?: number;
  readonly actor?: string;
  readonly color: string;
}

export interface PropState {
  readonly prop: string;
  readonly x: number;
  readonly z: number;
}

/** 舞台の様子（人物・物・暗転）。JSON にそのまま変換できる */
export interface StageState {
  readonly actors: Readonly<Record<string, ActorState>>;
  readonly props: Readonly<Record<string, PropState>>;
  /** 暗転している */
  readonly dark: boolean;
  /** 立っている光（呼び名 → 光）。省くとなし */
  readonly lights?: Readonly<Record<string, LightState>>;
}

export const EMPTY_STAGE: StageState = { actors: {}, props: {}, dark: false };

/** 読み返しの1行 */
export interface BacklogEntry {
  readonly speaker: string | null;
  readonly text: readonly RubySegment[];
}

/** 指示を1つ行った後の舞台。舞台にいない人物・物への指示は、何もしない */
export function applyDirective(stage: StageState, d: Directive): StageState {
  switch (d.kind) {
    case 'enter':
      return { ...stage, actors: { ...stage.actors, [d.actor]: { x: d.x, z: d.z, facing: d.facing } } };
    case 'exit': {
      const actors = { ...stage.actors };
      delete actors[d.actor];
      return { ...stage, actors };
    }
    case 'place':
    case 'walk': {
      const a = stage.actors[d.actor];
      if (!a) return stage;
      // 歩いた時は、最後に進んだ向きを向く
      const facing = d.kind === 'walk' ? facingAfterWalk(a, d) : a.facing;
      return { ...stage, actors: { ...stage.actors, [d.actor]: { ...a, x: d.x, z: d.z, facing } } };
    }
    case 'walkControl': {
      const a = stage.actors[d.actor];
      const last = d.path[d.path.length - 1];
      if (!a || !last) return stage;
      const prev = d.path[d.path.length - 2] ?? a;
      return { ...stage, actors: { ...stage.actors, [d.actor]: { ...a, x: last.x, z: last.z, facing: toward(prev, last, a.facing) } } };
    }
    case 'face': {
      const a = stage.actors[d.actor];
      if (!a) return stage;
      const other = d.toward ? stage.actors[d.toward] : undefined;
      const facing = d.facing ?? (other ? toward(a, other, a.facing) : a.facing);
      return { ...stage, actors: { ...stage.actors, [d.actor]: { ...a, facing } } };
    }
    case 'propPut':
      return { ...stage, props: { ...stage.props, [d.name]: { prop: d.prop, x: d.x, z: d.z } } };
    case 'propRemove': {
      const props = { ...stage.props };
      delete props[d.name];
      return { ...stage, props };
    }
    case 'propChange': {
      const p = stage.props[d.name];
      return p ? { ...stage, props: { ...stage.props, [d.name]: { ...p, prop: d.prop } } } : stage;
    }
    case 'fadeOut':
      return { ...stage, dark: true };
    case 'fadeIn':
      return { ...stage, dark: false };
    case 'gesture': {
      // 背を向ける: 終えた後も、反対の向きのまま
      const a = stage.actors[d.actor];
      if (!d.turnAway || !a) return stage;
      const opposite: Record<Direction, Direction> = { north: 'south', south: 'north', east: 'west', west: 'east' };
      return { ...stage, actors: { ...stage.actors, [d.actor]: { ...a, facing: opposite[a.facing] } } };
    }
    case 'light': {
      const light: LightState = d.actor ? { actor: d.actor, color: d.color } : { x: d.x, z: d.z, color: d.color };
      return { ...stage, lights: { ...stage.lights, [d.name]: light } };
    }
    case 'lightOff': {
      const lights = { ...stage.lights };
      delete lights[d.name];
      return { ...stage, lights };
    }
    case 'carry':
    case 'release': {
      const a = stage.actors[d.actor];
      if (!a) return stage;
      const items = { ...a.items };
      // 外した所は空の文字にする（見た目の決まりで持っている物も外す）
      items[d.slot] = d.kind === 'carry' ? d.item : '';
      return { ...stage, actors: { ...stage.actors, [d.actor]: { ...a, items } } };
    }
    case 'posture': {
      const a = stage.actors[d.actor];
      if (!a) return stage;
      const { posture: _old, ...rest } = a;
      void _old;
      return { ...stage, actors: { ...stage.actors, [d.actor]: d.posture === '立つ' ? rest : { ...rest, posture: d.posture } } };
    }
    case 'camera':
    case 'wait':
    case 'hold':
    case 'melody':
    case 'melodyWait':
    case 'melodyStop':
    case 'sound':
    case 'chapterTitle':
      return stage;
  }
}

/** 手順の指示（台詞の前の指示を含む）を行った後の舞台 */
export function applyStep(stage: StageState, step: ScriptStep): StageState {
  if (step.kind === 'directive') return applyDirective(stage, step.directive);
  return step.directives.reduce(applyDirective, stage);
}

/** index 番目の手順の手前までを行った舞台（index が手順の数なら、最後まで行った舞台） */
export function stageAt(script: Script, index: number, initial: StageState = EMPTY_STAGE): StageState {
  return script.steps.slice(0, index).reduce(applyStep, initial);
}

/** 止まる手順か（台詞・語りと、操作の場面と、章の題） */
export function isStop(step: ScriptStep): boolean {
  return step.kind === 'line' || isInteractive(step.directive) || step.directive.kind === 'chapterTitle';
}

/**
 * index の手順から進めて、次に止まる手順の番号（index 自身が止まる手順なら index）。
 * 止まる手順がなければ手順の数（終わり）
 */
export function nextStop(script: Script, index: number): number {
  for (let i = Math.max(0, index); i < script.steps.length; i++) if (isStop(script.steps[i]!)) return i;
  return script.steps.length;
}

/** 止まっている手順を読み終えた（タップした・操作を終えた）: 次の手順の番号 */
export function advance(script: Script, index: number): number {
  return Math.min(script.steps.length, index + 1);
}

/** 終わったか */
export const isFinished = (script: Script, index: number) => index >= script.steps.length;

/** スキップ: 最後まで飛ばした時の、手順の番号と舞台。飛ばした操作の場面の数も返す */
export function skipToEnd(script: Script, index: number, stage: StageState): { index: number; stage: StageState; skippedInteractive: number } {
  const rest = script.steps.slice(index);
  const skippedInteractive = rest.filter((s) => s.kind === 'directive' && isInteractive(s.directive)).length;
  return { index: script.steps.length, stage: rest.reduce(applyStep, stage), skippedInteractive };
}

/** 読み返し: index の手順より前に出た台詞・語り（index の手順が台詞なら、それも含める＝今出ている行） */
export function backlog(script: Script, index: number): BacklogEntry[] {
  const out: BacklogEntry[] = [];
  const end = Math.min(script.steps.length, index + 1);
  for (let i = 0; i < end; i++) {
    const s = script.steps[i]!;
    if (s.kind === 'line') out.push({ speaker: s.speaker, text: s.text });
  }
  return out;
}

/** 台本に出てくる人物（登場の指示と話者）。画面で人形の見た目を用意するため */
export function castOf(script: Script): string[] {
  const names = new Set<string>();
  for (const s of script.steps) {
    const ds = s.kind === 'line' ? s.directives : [s.directive];
    for (const d of ds) if (d.kind === 'enter') names.add(d.actor);
  }
  return [...names];
}

/** 台本の台詞と語りを、1行ずつの文にしたもの（テストと確認用） */
export const linesOf = (script: Script) =>
  script.steps.flatMap((s) => (s.kind === 'line' ? [`${s.speaker ?? ''}:${plainText(s.text)}`] : []));

function toward(from: { x: number; z: number }, to: { x: number; z: number }, fallback: Direction): Direction {
  const dx = to.x - from.x;
  const dz = to.z - from.z;
  if (dx === 0 && dz === 0) return fallback;
  if (Math.abs(dx) >= Math.abs(dz)) return dx > 0 ? 'east' : 'west';
  return dz > 0 ? 'south' : 'north';
}

/** まっすぐ（縦、横の順に）歩いた後の向き */
function facingAfterWalk(from: ActorState, to: { x: number; z: number }): Direction {
  if (to.x !== from.x) return to.x > from.x ? 'east' : 'west';
  if (to.z !== from.z) return to.z > from.z ? 'south' : 'north';
  return from.facing;
}

/** 歩く指示の道順（縦に進んでから横に進む。始めのマスを含む） */
export function walkPath(from: { x: number; z: number }, to: { x: number; z: number }): { x: number; z: number }[] {
  const path = [{ x: from.x, z: from.z }];
  let { x, z } = from;
  while (z !== to.z) {
    z += Math.sign(to.z - z);
    path.push({ x, z });
  }
  while (x !== to.x) {
    x += Math.sign(to.x - x);
    path.push({ x, z });
  }
  return path;
}
