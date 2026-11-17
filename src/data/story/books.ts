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
      // ゲーム脚本（docs/story/game-script-prologue.md）の10場面。場面1と場面7は、戦闘の前の会話・戦闘（勝った後の台本を含む）の2つに分ける
      scenes: [
        // 場面0: 冒頭の先出し
        { kind: 'dialogue', id: 'open', scriptId: 'prologueOpen', stageId: 'stage-home' },
        // 場面1: 堰（戦闘の前・戦闘・勝った後）
        {
          kind: 'dialogue',
          id: 'weir-intro',
          scriptId: 'prologueWeirIntro',
          stageId: 'stage-weir',
          recap: ['一日前。時守のトウマの隊は、過去の谷の外れに来た。', '百年後の長雨で崩れて下流の村を沈める堰を、今日のうちに崩す。'],
        },
        { kind: 'battle', id: 'weir', battleId: 'prologue-weir', partyId: 'prologue' },
        // 場面2: 暦の塔・門と報告の部屋
        {
          kind: 'dialogue',
          id: 'tower',
          scriptId: 'prologueTower',
          stageId: 'stage-tower',
          recap: ['隊は堰を崩し、帰りの門をくぐって塔へ帰った。', '時守が帰りの門をくぐる時、世界は書き換わる。'],
        },
        // 場面3: 暦の塔・円卓の広間
        {
          kind: 'dialogue',
          id: 'hall',
          scriptId: 'prologueHall',
          stageId: 'stage-tower',
          recap: ['任務から帰ったトウマに、ハルドは「良い仕事だ」と言った。', '塔の広間では、明日の指示書が広げられる。'],
        },
        // 場面4: 家・夕食と工房の夜
        {
          kind: 'dialogue',
          id: 'home',
          scriptId: 'prologueHome',
          stageId: 'stage-home',
          recap: ['明日の任務は、アスタルの丘で、戴冠の前にガレスを討つこと。', '弟がいなかったと言う若い時守テオに、トウマは「残像だ。手放せ」と言った。'],
        },
        // 場面5: 都と橋（始めに、ユナの後について歩く）
        {
          kind: 'interactive',
          id: 'city',
          scriptId: 'prologueCity',
          stageId: 'stage-city',
          recap: ['家では、妹のユナが「おかえり」と迎えた。', 'その夜、ユナは鼻歌を歌いながら、真鍮の灯のねじを巻いていた。'],
        },
        // 場面6: 塔の門
        {
          kind: 'dialogue',
          id: 'gate',
          scriptId: 'prologueGate',
          stageId: 'stage-tower',
          recap: ['翌朝、ユナと都を歩き、橋の上で真鍮の灯を受け取った。', '隊は、十二回目の任務へ向かう。'],
        },
        // 場面7: 建国の丘（戦闘の前・戦闘・勝った後）
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
          recap: ['丘の人々は、ユナの鼻歌と同じ節を歌っていた。終わりの三つの音だけがなかった。', '若い王ガレスの、誓いの剣を折る。'],
        },
        // 場面8: 塔へ帰る（門と話を聞く部屋）
        {
          kind: 'dialogue',
          id: 'return',
          scriptId: 'prologueReturn',
          stageId: 'stage-tower',
          recap: ['誓いの剣は折れ、ガレスは帰りの門の光の中へ落ちた。', '隊は塔へ帰った。'],
        },
        // 場面9: 家までの道と物置（プレイヤーの手で進める）
        { kind: 'interactive', id: 'end', scriptId: 'prologueEnd', stageId: 'stage-city', recap: ['任務を終え、トウマは家へ帰る。'] },
      ],
    },
  ],
};

export const books: readonly BookDefinition[] = [mainBook];
