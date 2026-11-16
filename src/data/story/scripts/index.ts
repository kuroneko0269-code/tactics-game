import * as battleLines from './battleLines';
import * as prologue from './prologue';

/**
 * 台本の一覧（台本の id → 台本のテキスト）。章のデータと、マップ上のイベントの「会話」から id で引く。
 * 台本を足したら、ここに足す（台本のファイルで export した名前が、そのまま台本の id になる）。
 */
export const scriptTexts: Readonly<Record<string, string>> = { ...battleLines, ...prologue };
