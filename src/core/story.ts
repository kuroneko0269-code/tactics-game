/**
 * 物語の流れ（物語の土台）: 物語（本）を「章」と、その中の「場面」の列として、データで書けるようにする。
 * 場面の種類は 会話・戦闘・操作の場面・拠点 の4つ。分岐はない（場面は順に1本道で進む）。
 *
 * - 進み具合（StoryProgress）は「今の章と場面の番号」。場面の区切り（場面を終えた時）で進めて保存する。
 *   開き直すと、今の場面の始めから続ける（会話の途中で閉じたら、その会話の始めから）。戦闘の途中は、戦闘の途中保存から再開する。
 * - 再開した時に出す「これまで」は、章のデータに3行以内で書く。
 */

/**
 * 場面。recap を書くと、その場面から再開した時の「これまで」になる（後の場面で recap を書くまで続く。
 * 章の中で recap を書いた場面がまだなければ、章の recap）
 */
export type SceneDefinition = (
  /** 会話（戦闘をしない小さなマップの上で、台本を進める） */
  | { readonly kind: 'dialogue'; readonly id: string; readonly scriptId: string; readonly stageId: string }
  /** 操作の場面（台本の中に、押し続ける・歩かせる の段がある会話。見せ方は会話と同じ） */
  | { readonly kind: 'interactive'; readonly id: string; readonly scriptId: string; readonly stageId: string }
  /**
   * 戦闘（出撃前の配置から）。partyId を書くと、部隊の代わりに、その章のために決めた部隊（ジョブと装備）で戦う
   * （育てた部隊の強さに左右されない。戦闘の結果は部隊に入れない）
   */
  | { readonly kind: 'battle'; readonly id: string; readonly battleId: string; readonly partyId?: string }
  /** 拠点（編成と店。「物語を進める」で次の場面へ） */
  | { readonly kind: 'base'; readonly id: string }
) & { readonly recap?: readonly string[] };

export interface ChapterDefinition {
  readonly id: string;
  /** 再開した時に出す「これまで」（3行以内） */
  readonly recap: readonly string[];
  readonly scenes: readonly SceneDefinition[];
}

/** 物語（本）。今は本編の1つだけ（物語の土台では、仕組みを確かめる試しの場面も別の本として持っていた） */
export interface BookDefinition {
  readonly id: string;
  readonly chapters: readonly ChapterDefinition[];
}

/** 進み具合。finished なら最後まで終えた */
export interface StoryProgress {
  readonly chapter: number;
  readonly scene: number;
  readonly finished: boolean;
}

export const RECAP_MAX_LINES = 3;

export const STORY_START: StoryProgress = { chapter: 0, scene: 0, finished: false };

/** 本の定義の書き間違いの一覧（章・場面がない、id の重複、「これまで」が長すぎる） */
export function validateBook(book: BookDefinition): string[] {
  const errors: string[] = [];
  if (book.chapters.length === 0) errors.push(`本 ${book.id}: 章がありません`);
  const ids = new Set<string>();
  for (const c of book.chapters) {
    if (c.scenes.length === 0) errors.push(`章 ${c.id}: 場面がありません`);
    if (c.recap.length > RECAP_MAX_LINES) errors.push(`章 ${c.id}: 「これまで」は ${RECAP_MAX_LINES} 行以内にします`);
    for (const s of c.scenes) {
      if (s.recap && s.recap.length > RECAP_MAX_LINES) errors.push(`場面 ${c.id}/${s.id}: 「これまで」は ${RECAP_MAX_LINES} 行以内にします`);
      const key = `${c.id}/${s.id}`;
      if (ids.has(key)) errors.push(`場面 ${key} が重複しています`);
      ids.add(key);
    }
  }
  return errors;
}

/** 今の章と場面（終えていれば undefined） */
export function currentScene(book: BookDefinition, progress: StoryProgress): { chapter: ChapterDefinition; scene: SceneDefinition } | undefined {
  if (progress.finished) return undefined;
  const chapter = book.chapters[progress.chapter];
  const scene = chapter?.scenes[progress.scene];
  return chapter && scene ? { chapter, scene } : undefined;
}

/** 今の場面を終えた: 次の場面へ（章の最後なら次の章の最初、本の最後なら終わり） */
export function advanceScene(book: BookDefinition, progress: StoryProgress): StoryProgress {
  if (progress.finished) return progress;
  const chapter = book.chapters[progress.chapter];
  if (!chapter) return { ...progress, finished: true };
  if (progress.scene + 1 < chapter.scenes.length) return { ...progress, scene: progress.scene + 1 };
  if (progress.chapter + 1 < book.chapters.length) return { chapter: progress.chapter + 1, scene: 0, finished: false };
  return { ...progress, finished: true };
}

/**
 * 再開した時に出す「これまで」（3行以内）。本の最初の場面からなら、まだ何も起きていないので出さない。
 * 終えた本も出さない
 */
export function recapFor(book: BookDefinition, progress: StoryProgress): readonly string[] {
  if (progress.finished || (progress.chapter === 0 && progress.scene === 0)) return [];
  const chapter = book.chapters[progress.chapter];
  if (!chapter) return [];
  // 今の場面か、それより前で recap を書いた最後の場面（なければ章の recap）
  for (let i = Math.min(progress.scene, chapter.scenes.length - 1); i >= 0; i--) {
    const r = chapter.scenes[i]!.recap;
    if (r) return r.slice(0, RECAP_MAX_LINES);
  }
  return chapter.recap.slice(0, RECAP_MAX_LINES);
}

/**
 * 章の冒頭に出す「これまで」（序章の回答 4: 章の冒頭と、再開した時の両方で出す）。
 * 本の最初の章には、それまでの話がないので出さない。章の recap を出す
 */
export function chapterStartRecap(book: BookDefinition, progress: StoryProgress): readonly string[] {
  if (progress.finished || progress.scene !== 0 || progress.chapter === 0) return [];
  return (book.chapters[progress.chapter]?.recap ?? []).slice(0, RECAP_MAX_LINES);
}

/** 保存してあった進み具合を、今の本の定義に合わせる（章や場面が減っていたら、その章の最初から） */
export function normalizeProgress(book: BookDefinition, progress: StoryProgress | undefined): StoryProgress {
  if (!progress || !Number.isInteger(progress.chapter) || !Number.isInteger(progress.scene)) return STORY_START;
  if (progress.finished) return { chapter: progress.chapter, scene: progress.scene, finished: true };
  const chapter = book.chapters[progress.chapter];
  if (!chapter) return STORY_START;
  if (!chapter.scenes[progress.scene]) return { chapter: progress.chapter, scene: 0, finished: false };
  return { chapter: progress.chapter, scene: progress.scene, finished: false };
}
