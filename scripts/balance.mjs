// バランス確認（npm run balance）。画面を使わず、core だけで AI 同士を多数回戦わせて集計する。
//
// 1. 敵の3段階それぞれに対して、「育てていない部隊」（最初の5人）と「十分に育てた部隊」で戦わせた勝率
//    （味方も敵と同じ AI で動かす。人が操作すると、たいてい AI より勝ちやすい）
// 2. 育成の速さ: 最初の部隊から続けて戦い（部隊の平均レベル以下で最も強い段階を選ぶ）、得た経験値と JP で
//    すぐ覚えられるアビリティを覚えながら進めた時の、習得・ジョブのレベル 8・キャラクターのレベルの上がり方。
//    レベル 50 までの戦闘数は、1戦の経験値の平均から計算する
// 3. 成長率の違い: 同じジョブだけでレベル 50 まで育てた場合と、能力ごとに成長率の良いジョブを選んで育てた場合の差
//
// 1戦の見込み時間は、手番ごとの目安の秒数から計算する（下の SECONDS）。
//
// 使い方: npm run balance -- --battles=40 --trained-level=30
import { createServer } from 'vite';

const args = Object.fromEntries(
  process.argv.slice(2).map((a) => {
    const [k, v] = a.replace(/^--/, '').split('=');
    return [k, v ?? 'true'];
  }),
);
/** 1つの組み合わせで戦わせる数 */
const BATTLES = Number(args.battles ?? 40);
const FIRST_SEED = Number(args.seed ?? 1);
/** 「十分に育てた部隊」のレベル */
const TRAINED_LEVEL = Number(args['trained-level'] ?? 30);
/** 育成の速さを確かめる時に、続けて戦う数 */
const CAMPAIGN = Number(args.campaign ?? 60);

/**
 * 見込み時間の目安（秒）。
 * - 味方の手番: 状況を見て、移動・行動・向きを選ぶ時間と、その演出
 * - 敵の手番: 敵が動く演出（間の取り方とカメラの移動を含む）
 * - 魔法の発動: 発動の演出と数字の表示
 */
const SECONDS = { playerTurn: 15, enemyTurn: 5, spell: 2 };

async function main() {
  const server = await createServer({ logLevel: 'warn', server: { middlewareMode: true } });
  const load = (p) => server.ssrLoadModule(p);
  const { startBattle } = await load('/src/core/battle.ts');
  const { runAutoBattle } = await load('/src/core/ai.ts');
  const P = await load('/src/core/progression.ts');
  const { buildSortie } = await load('/src/core/sortie.ts');
  const { twinHillsBattle } = await load('/src/data/battles/twinHillsBattle.ts');
  const { jobs } = await load('/src/data/jobs.ts');
  const { spells, strikes } = await load('/src/data/abilities.ts');
  const { battleRules } = await load('/src/data/battleRules.ts');
  const { aiConfig } = await load('/src/data/aiConfig.ts');
  const { progressionRules: rules } = await load('/src/data/progression.ts');
  const { initialRoster } = await load('/src/data/roster.ts');
  const catalog = { jobs, spells, strikes };

  const play = (seed, tierId, roster) => {
    const setup = buildSortie(twinHillsBattle, tierId, roster, catalog);
    const start = startBattle(setup, jobs, battleRules, seed, spells, strikes).state;
    return runAutoBattle(start, 2000, { player: aiConfig, enemy: aiConfig });
  };

  /** 十分に育てた部隊: 全員が今のジョブで TRAINED_LEVEL まで上がり、今のジョブのアビリティをすべて覚えている */
  const trainedRoster = {
    units: initialRoster.units.map((u0) => {
      let u = u0;
      while (u.level < TRAINED_LEVEL) u = P.levelUp(u, catalog, rules);
      const job = P.findJob(catalog, u.jobId);
      const learned = (job.abilities ?? []).map((a) => a.id);
      return { ...u, jobs: { ...u.jobs, [u.jobId]: { jp: 0, jpTotal: 2000, learned } } };
    }),
  };

  console.log(`AI 同士の対戦（1つの組み合わせにつき ${BATTLES} 戦。シード値 ${FIRST_SEED}〜${FIRST_SEED + BATTLES - 1}）`);
  console.log(`見込み時間の目安: 味方の手番 ${SECONDS.playerTurn}秒、敵の手番 ${SECONDS.enemyTurn}秒、魔法の発動 ${SECONDS.spell}秒`);
  console.log(`十分に育てた部隊: 全員 Lv ${TRAINED_LEVEL}（今のジョブだけで育てた成長値）、今のジョブのアビリティをすべて習得`);

  for (const [label, roster] of [
    ['育てていない部隊', initialRoster],
    ['十分に育てた部隊', trainedRoster],
  ]) {
    console.log('');
    console.log(`■ ${label}`);
    for (const tier of twinHillsBattle.tiers) {
      const runs = [];
      for (let i = 0; i < BATTLES; i++) runs.push(play(FIRST_SEED + i, tier.id, roster));
      const wins = runs.filter((r) => r.state.winner === 'player').length;
      const undecided = runs.filter((r) => !r.state.winner).length;
      const turns = runs.map((r) => r.state.turnNumber);
      const minutes = runs.map(({ state, events }) => {
        const teamOf = new Map(state.units.map((u) => [u.id, u.team]));
        let sec = 0;
        for (const e of events) {
          if (e.type === 'turnStarted') sec += teamOf.get(e.unitId) === 'player' ? SECONDS.playerTurn : SECONDS.enemyTurn;
          if (e.type === 'spellResolved') sec += SECONDS.spell;
        }
        return sec / 60;
      });
      const abilityUse = {};
      for (const { events } of runs) {
        for (const e of events) {
          const id = e.type === 'attacked' ? e.abilityId : e.type === 'castStarted' ? e.spellId : null;
          if (id) abilityUse[id] = (abilityUse[id] ?? 0) + 1;
        }
      }
      console.log(
        `  ${tier.id.padEnd(6)}: 勝率 ${pct(wins, runs.length)}、未決着 ${undecided}、手番数 平均 ${avg(turns).toFixed(1)}、` +
          `見込み時間 平均 ${avg(minutes).toFixed(1)}分`,
      );
      console.log(
        `          使われた行動アビリティ（1戦あたり、両軍）: ${Object.entries(abilityUse)
          .map(([id, n]) => `${id} ${(n / runs.length).toFixed(1)}`)
          .join(' / ')}`,
      );
    }
  }

  // ---- 育成の速さ（続けて戦う） ----
  console.log('');
  console.log(`■ 育成の速さ（最初の部隊から ${CAMPAIGN} 戦続けて戦う。部隊の平均レベル以下で最も強い段階を選び、覚えられるアビリティはすぐ覚える）`);
  let roster = initialRoster;
  const firstLearn = {};
  const jobLv8 = {};
  const perBattle = [];
  const tierCount = {};
  for (let b = 1; b <= CAMPAIGN; b++) {
    const avgLevel = avg(roster.units.map((u) => u.level));
    const tier = [...twinHillsBattle.tiers].reverse().find((t) => t.units[0].level <= avgLevel) ?? twinHillsBattle.tiers[0];
    tierCount[tier.id] = (tierCount[tier.id] ?? 0) + 1;
    const { state } = play(10000 + b, tier.id, roster);
    const result = P.applyBattleResult(roster, state, catalog, rules);
    roster = result.roster;
    perBattle.push({ tier: tier.id, ...result.report, exp: avg(result.report.units.map((u) => u.exp)), jp: avg(result.report.units.map((u) => u.jp)) });
    // 覚えられるアビリティを、安い順にすぐ覚える
    roster = {
      units: roster.units.map((u0) => {
        let u = u0;
        const job = P.findJob(catalog, u.jobId);
        for (const a of [...(job.abilities ?? [])].sort((x, y) => x.jpCost - y.jpCost)) {
          if (P.learnRefusal(u, job.id, a.id, catalog, rules) === null) {
            u = P.learnAbility(u, job.id, a.id, catalog, rules);
            firstLearn[u.id] ??= b;
          }
        }
        if (P.jobLevel(u, u.jobId, rules) >= 8) jobLv8[u.id] ??= b;
        return u;
      }),
    };
    if ([1, 5, 10, 20, 30, 40, 60, 80, 100].includes(b)) {
      console.log(
        `  ${String(b).padStart(3)}戦目まで: レベル ${roster.units.map((u) => u.level).join('・')}、` +
          `ジョブのレベル ${roster.units.map((u) => P.jobLevel(u, u.jobId, rules)).join('・')}、` +
          `勝ち ${perBattle.filter((x) => x.victory).length}`,
      );
    }
  }
  const expPerBattle = avg(perBattle.map((x) => x.exp));
  const jpPerBattle = avg(perBattle.map((x) => x.jp));
  console.log(`  選んだ段階: ${Object.entries(tierCount).map(([k, v]) => `${k} ${v}戦`).join(' / ')}、勝率 ${pct(perBattle.filter((x) => x.victory).length, perBattle.length)}`);
  console.log(`  1人あたり1戦の平均: 経験値 ${expPerBattle.toFixed(0)}、JP ${jpPerBattle.toFixed(0)}`);
  const costs = jobs.flatMap((j) => (j.abilities ?? []).filter((a) => !a.starter).map((a) => `${a.id} ${a.jpCost}`));
  console.log(`  習得の JP: ${costs.join(' / ')}`);
  console.log(`  初めて何かを習得した戦闘: ${roster.units.map((u) => `${u.id} ${firstLearn[u.id] ?? '-'}戦目`).join(' / ')}`);
  console.log(`  ジョブのレベルが 8 になった戦闘: ${roster.units.map((u) => `${u.id} ${jobLv8[u.id] ?? '-'}戦目`).join(' / ')}`);
  let total = 0;
  const battlesTo = {};
  for (let lv = 1; lv < rules.maxLevel; lv++) {
    total += P.expToNext(lv, rules);
    battlesTo[lv + 1] = total / expPerBattle;
  }
  console.log(
    `  キャラクターのレベル（1戦の平均の経験値で計算）: Lv 2 まで ${battlesTo[2].toFixed(1)}戦、Lv 10 まで ${battlesTo[10].toFixed(0)}戦、` +
      `Lv 20 まで ${battlesTo[20].toFixed(0)}戦、Lv 30 まで ${battlesTo[30].toFixed(0)}戦、Lv 50 まで ${battlesTo[50].toFixed(0)}戦`,
  );
  console.log(
    `  1戦で上がるレベル: Lv 1 の頃 ${(expPerBattle / P.expToNext(1, rules)).toFixed(2)}、Lv 10 の頃 ${(expPerBattle / P.expToNext(10, rules)).toFixed(2)}、` +
      `Lv 30 の頃 ${(expPerBattle / P.expToNext(30, rules)).toFixed(2)}、Lv 49 の頃 ${(expPerBattle / P.expToNext(49, rules)).toFixed(2)}`,
  );

  // ---- 成長率の違い ----
  console.log('');
  console.log('■ レベル 50 まで育てた時の成長値（能力値に足される量。49 回レベルが上がる）');
  const grow = (pickJob) => {
    let u = { ...initialRoster.units[0], growth: P.ZERO_GROWTH };
    for (let i = 0; i < 49; i++) {
      u = P.levelUp({ ...u, jobId: pickJob(i) }, catalog, rules);
    }
    return u.growth;
  };
  const show = (g) =>
    P.GROWTH_STATS.map((s) => `${s} +${Math.floor(g[s] / 100)}`).join(' / ') + `（成長の点数 ${P.growthPoints(g, rules)} / ${rules.growthTotalCap}）`;
  for (const j of jobs) console.log(`  ${j.id.padEnd(8)}だけ: ${show(grow(() => j.id))}`);
  for (const stat of P.GROWTH_STATS) {
    const best = [...jobs].sort((a, b) => b.growth[stat] - a.growth[stat])[0];
    const worst = [...jobs].sort((a, b) => a.growth[stat] - b.growth[stat])[0];
    const diff = Math.floor((best.growth[stat] - worst.growth[stat]) * 49 / 100);
    console.log(`  ${stat.padEnd(6)}: 成長率の最も良い ${best.id} と最も悪い ${worst.id} の差は、Lv 50 で ${diff}`);
  }
  // 裏技: 伸びの悪いジョブで下げ、伸びの良いジョブで上げ直すのを、成長値が変わらなくなるまで繰り返す（HP をねらう例）
  let u = { ...initialRoster.units[0], level: 50, growth: grow(() => 'warrior') };
  let cycles = 0;
  for (; cycles < 5000; cycles++) {
    const before = JSON.stringify(u.growth);
    u = P.levelDown({ ...u, jobId: 'mage' }, catalog);
    u = P.levelUp({ ...u, jobId: 'warrior' }, catalog, rules);
    if (JSON.stringify(u.growth) === before) break;
  }
  console.log(
    `  裏技（戦士で Lv 50 にした後、魔術師で下げて戦士で上げ直す）: ${cycles} 回で変わらなくなる → ${show(u.growth)}` +
      `${P.isGrowthCapped(u.growth, rules) ? '' : '（HP と攻撃力は能力ごとの上限、魔力と MP は 0 になり、合計は上限に届かない）'}`,
  );
  await server.close();
}

const avg = (xs) => (xs.length ? xs.reduce((s, x) => s + x, 0) / xs.length : 0);
const pct = (x, total) => `${((x * 100) / total).toFixed(1)}%`;

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
