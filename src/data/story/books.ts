import type { BookDefinition } from '../../core/story';

/**
 * 物語の本。「これまで」（recap）は3行以内。物語の内容は docs/story/ が正で、ここに書く文もそこから取る。
 * 場面の recap は、その場面から再開した時の「これまで」（後の場面で書くまで続く）。章の recap は、章の冒頭（2つ目の章から）に出す。
 */

/** 本編『消された暦』 */
export const mainBook: BookDefinition = {
  id: 'main',
  chapters: [
    {
      id: 'prologue',
      recap: ['時守のトウマの隊は、過去へ渡って歴史を書き換える。', '十二回目の任務から帰ると、妹のユナは「最初からいなかった」ことになっていた。'],
      scenes: [
        { kind: 'dialogue', id: 'open', scriptId: 'prologueOpen', stageId: 'stage-home' },
        {
          kind: 'dialogue',
          id: 'weir-intro',
          scriptId: 'prologueWeirIntro',
          stageId: 'stage-weir',
          recap: ['一日前。時守のトウマの隊は、過去の谷の外れに来た。', '百年後の長雨で崩れて下流の村を沈める堰を、今日のうちに崩す。'],
        },
        { kind: 'battle', id: 'weir', battleId: 'prologue-weir', partyId: 'prologue' },
        {
          kind: 'dialogue',
          id: 'tower',
          scriptId: 'prologueTower',
          stageId: 'stage-tower',
          recap: ['隊は堰を崩し、帰りの門をくぐって塔へ帰った。', '時守が帰りの門をくぐる時、世界は書き換わる。'],
        },
        {
          kind: 'dialogue',
          id: 'home',
          scriptId: 'prologueHome',
          stageId: 'stage-home',
          recap: ['塔で、明日の指示書が広げられた。アスタルの丘で、戴冠の前にガレスを討つ。', '弟がいなくなったと泣く若い時守テオに、トウマは「残像だ。手放せ」と言った。'],
        },
        {
          kind: 'interactive',
          id: 'city',
          scriptId: 'prologueCity',
          stageId: 'stage-city',
          recap: ['家では、妹のユナが「おかえり」と迎えた。', 'その夜、ユナは鼻歌を歌いながら、真鍮の灯のねじを巻いていた。'],
        },
        {
          kind: 'dialogue',
          id: 'gate',
          scriptId: 'prologueGate',
          stageId: 'stage-tower',
          recap: ['翌朝、ユナと都を歩き、橋の上で真鍮の灯を受け取った。', '隊は、十二回目の任務へ向かう。'],
        },
        {
          kind: 'dialogue',
          id: 'hill-intro',
          scriptId: 'prologueHillIntro',
          stageId: 'stage-hill',
          recap: ['隊は時の門をくぐり、アスタルの丘へ降りた。', '戴冠の前に、若い王ガレスの誓いの剣を折る。'],
        },
        {
          kind: 'battle',
          id: 'hill',
          battleId: 'prologue-hill',
          partyId: 'prologue',
          recap: ['丘では七つの氏族が、ユナの鼻歌と同じ節を歌っていた。終わりの三つの音だけが聞こえなかった。', '若い王ガレスの、誓いの剣を折る。'],
        },
        {
          kind: 'dialogue',
          id: 'return',
          scriptId: 'prologueReturn',
          stageId: 'stage-tower',
          recap: ['誓いの剣は折れ、ガレスは帰りの門の光の中へ落ちた。', '隊は塔へ帰った。'],
        },
        { kind: 'interactive', id: 'way-home', scriptId: 'prologueWayHome', stageId: 'stage-city', recap: ['任務を終え、トウマは家へ帰る。'] },
        { kind: 'interactive', id: 'end', scriptId: 'prologueEnd', stageId: 'stage-home' },
      ],
    },
  ],
};

export const books: readonly BookDefinition[] = [mainBook];
