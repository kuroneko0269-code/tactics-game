import type { BookDefinition } from '../../core/story';

/**
 * 物語の本（物語の土台）。本編は次の作業（序章）から足す。
 * 「これまで」（recap）は3行以内。物語の内容は docs/story/ が正で、ここに書く文もそこから取る。
 */

/** 本編『消された暦』（序章は次の作業で作る。今は章がない） */
export const mainBook: BookDefinition = { id: 'main', chapters: [] };

/** 試しの場面（仕組みを確かめる仮の内容。序章ができたら消す） */
export const trialBook: BookDefinition = {
  id: 'trial',
  chapters: [
    {
      id: 'trial',
      recap: ['試しの場面の途中です。', '会話・操作の場面・戦闘の仕組みを、順に確かめています。'],
      scenes: [
        { kind: 'dialogue', id: 'opening', scriptId: 'trialOpening', stageId: 'stage-room' },
        { kind: 'interactive', id: 'hands', scriptId: 'trialHands', stageId: 'stage-room' },
        { kind: 'dialogue', id: 'battle-intro', scriptId: 'trialBattleIntro', stageId: 'stage-yard' },
        { kind: 'battle', id: 'weir', battleId: 'trial-weir', partyId: 'trial', recap: ['試しの場面の途中です。', '堰の合わせ目を壊す戦闘から続けます。'] },
        { kind: 'dialogue', id: 'closing', scriptId: 'trialClosing', stageId: 'stage-room' },
      ],
    },
  ],
};

export const books: readonly BookDefinition[] = [mainBook, trialBook];
