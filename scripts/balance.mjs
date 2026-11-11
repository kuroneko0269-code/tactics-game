// バランス確認（npm run balance）。画面を使わず、core だけで AI 同士を多数回戦わせて集計する。
//
// 1. 敵の3段階それぞれに対して、「育てていない部隊」（最初の5人）と「十分に育てた部隊」で戦わせた勝率、
//    1戦の手番数と見込み時間、使われたアビリティとリアクションの回数
//    （味方も敵と同じ AI で動かす。人が操作すると、たいてい AI より勝ちやすい）
// 2. 育成の速さ: 最初の部隊から続けて戦い（部隊の平均レベル以下で最も強い段階を選ぶ）、得た経験値と JP で
//    すぐ覚えられるアビリティを覚えながら（受動的なアビリティは覚えたら付ける）、全員がレベル 50 になるまで進めた時の、
//    ユニット（ジョブ）ごとのレベル 50 までの戦闘数、初めての習得、ジョブのレベル 8 までの戦闘数
// 3. 成長率の違い: 同じジョブだけでレベル 50 まで育てた場合と、能力ごとに成長率の良いジョブを選んで育てた場合の差
//
// 4. ダンジョン「はじまりの遺跡」（フェーズ2-2）: 3つの戦闘それぞれの勝率・手番数・見込み時間（育てていない部隊と、
//    レベル 5 前後の部隊）、第2戦で味方が「待つ」動かし方をした時と「進む」（通常）動かし方をした時の勝率、
//    ダンジョン全体の見込み時間、封じの回数（陣営ごと）
//
// 1戦の見込み時間は、手番ごとの目安の秒数から計算する（下の SECONDS）。
//
// 使い方: npm run balance -- --battles=40 --trained-level=30 --campaign=400
//         npm run balance -- --dungeon-only   ダンジョンだけ（約1分）
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
/** 育成の速さを確かめる時に、続けて戦う数の上限（全員がレベル 50 になったら止める） */
const CAMPAIGN = Number(args.campaign ?? 400);
/** 段階ごとの勝率だけを見る（育成の速さと成長率を省く） */
const TIERS_ONLY = args['tiers-only'] === 'true';
/** ダンジョンだけを見る */
const DUNGEON_ONLY = args['dungeon-only'] === 'true';
/** 「レベル 5 前後の部隊」のレベルと、今のジョブに足す JP（「やさしい」を数回こなした程度） */
const MID_LEVEL = Number(args['mid-level'] ?? 5);
const MID_JP = Number(args['mid-jp'] ?? 600);

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
  const { ruinsDungeon } = await load('/src/data/battles/ruins/index.ts');
  const { jobs } = await load('/src/data/jobs.ts');
  const { spells, strikes } = await load('/src/data/abilities.ts');
  const { passives } = await load('/src/data/passives.ts');
  const E = await load('/src/data/equipment.ts');
  const { battleRules } = await load('/src/data/battleRules.ts');
  const { aiConfig } = await load('/src/data/aiConfig.ts');
  const { progressionRules: rules } = await load('/src/data/progression.ts');
  const { initialRoster } = await load('/src/data/roster.ts');
  const catalog = { jobs, spells, strikes, passives, equipment: E.equipment };

  const play = (seed, tierId, roster) => {
    const setup = buildSortie(twinHillsBattle, tierId, roster, catalog, rules);
    const start = startBattle(setup, jobs, battleRules, seed, spells, strikes, passives).state;
    return runAutoBattle(start, 2000, { player: aiConfig, enemy: aiConfig });
  };

  /** 覚えられるアビリティを安い順にすぐ覚え、受動的なアビリティは空いている枠に付ける */
  const learnAll = (u0, onLearn = () => {}) => {
    let u = u0;
    const job = P.findJob(catalog, u.jobId);
    const entries = [...(job.abilities ?? []), ...(job.passives ?? [])].sort((x, y) => x.jpCost - y.jpCost);
    for (const a of entries) {
      if (P.learnRefusal(u, job.id, a.id, catalog, rules) === null) {
        u = P.learnAbility(u, job.id, a.id, catalog, rules);
        onLearn(a.id);
      }
    }
    for (const slot of P.PASSIVE_SLOTS) {
      const choices = P.passiveChoices(u, slot, catalog);
      if (u.slots[slot] === null && choices.length > 0) u = P.setPassive(u, slot, choices[0], catalog);
    }
    return u;
  };

  /** 十分に育てた部隊: 全員が今のジョブで TRAINED_LEVEL まで上がり、今のジョブのアビリティをすべて覚えて、受動的なアビリティを付けている */
  const trainedRoster = {
    ...initialRoster,
    units: initialRoster.units.map((u0) => {
      let u = u0;
      while (u.level < TRAINED_LEVEL) u = P.levelUp(u, catalog, rules);
      u = P.gainJp(u, u.jobId, 5000);
      return learnAll(u);
    }),
  };

  /** 1戦の見込み時間（分） */
  const minutesOf = ({ state, events }) => {
    const teamOf = new Map(state.units.map((u) => [u.id, u.team]));
    let sec = 0;
    for (const e of events) {
      if (e.type === 'turnStarted') sec += teamOf.get(e.unitId) === 'player' ? SECONDS.playerTurn : SECONDS.enemyTurn;
      if (e.type === 'spellResolved') sec += SECONDS.spell;
    }
    return sec / 60;
  };
  /** 封じの回数（1戦あたり、陣営ごと） */
  const sealUse = (runs) => {
    const n = { player: 0, enemy: 0 };
    for (const { state, events } of runs) {
      const teamOf = new Map(state.units.map((u) => [u.id, u.team]));
      for (const e of events) if (e.type === 'castStarted' && e.spellId === 'seal') n[teamOf.get(e.casterId)]++;
    }
    return `味方 ${(n.player / runs.length).toFixed(2)} / 敵 ${(n.enemy / runs.length).toFixed(2)}`;
  };

  /** ダンジョン「はじまりの遺跡」の3つの戦闘 */
  function dungeonReport() {
    const midRoster = {
      ...initialRoster,
      units: initialRoster.units.map((u0) => {
        let u = u0;
        while (u.level < MID_LEVEL) u = P.levelUp(u, catalog, rules);
        return learnAll(P.gainJp(u, u.jobId, MID_JP));
      }),
    };
    const playDungeon = (site, seed, roster, playerAi = aiConfig) => {
      const setup = buildSortie(site, 'main', roster, catalog, rules);
      const start = startBattle(setup, jobs, battleRules, seed, spells, strikes, passives).state;
      return runAutoBattle(start, 2000, { player: playerAi, enemy: aiConfig });
    };
    console.log('');
    console.log(`■ ダンジョン「はじまりの遺跡」（1つの組み合わせにつき ${BATTLES} 戦）`);
    console.log(`  レベル ${MID_LEVEL} の部隊: 全員 Lv ${MID_LEVEL}（今のジョブだけで育てた成長値）、今のジョブに ${MID_JP} JP を足して覚えられるものを覚えた`);
    const totals = {};
    for (const [label, roster] of [
      ['育てていない部隊', initialRoster],
      [`レベル ${MID_LEVEL} の部隊`, midRoster],
    ]) {
      totals[label] = 0;
      for (const [i, site] of ruinsDungeon.battles.entries()) {
        const runs = [];
        for (let k = 0; k < BATTLES; k++) runs.push(playDungeon(site, FIRST_SEED + k, roster));
        const wins = runs.filter((r) => r.state.winner === 'player').length;
        const turns = runs.map((r) => r.state.turnNumber);
        const minutes = runs.map(minutesOf);
        const reasons = {};
        for (const r of runs) {
          const end = r.events.find((e) => e.type === 'battleEnded');
          if (end) reasons[`${end.winner}:${end.reason}`] = (reasons[`${end.winner}:${end.reason}`] ?? 0) + 1;
        }
        const appeared = avg(runs.map((r) => r.events.filter((e) => e.type === 'unitAppeared').length));
        const traps = avg(runs.map((r) => r.events.filter((e) => e.type === 'trapTriggered').length));
        totals[label] += avg(minutes);
        console.log(
          `  ${label} 第${i + 1}戦 ${site.id}: 勝率 ${pct(wins, runs.length)}、未決着 ${runs.filter((r) => !r.state.winner).length}、` +
            `手番数 平均 ${avg(turns).toFixed(1)}（最大 ${Math.max(...turns)}）、見込み時間 平均 ${avg(minutes).toFixed(1)}分（最大 ${Math.max(...minutes).toFixed(1)}分）`,
        );
        console.log(
          `          決着の内訳: ${Object.entries(reasons).map(([k, v]) => `${k} ${v}`).join(' / ')}、増援 ${appeared.toFixed(1)}体、罠の発動 ${traps.toFixed(1)}回、封じ ${sealUse(runs)}`,
        );
      }
      console.log(`  ${label}: ダンジョン全体の見込み時間（3戦の平均の合計） ${totals[label].toFixed(1)}分`);
    }
    // 連戦: 育てていない部隊で第1戦から続けて戦い、戦闘の後に得た経験値と JP で覚えられるものを覚える（負けてもそのまま次へ）
    {
      const chainWins = ruinsDungeon.battles.map(() => 0);
      const levels = ruinsDungeon.battles.map(() => []);
      let cleared = 0;
      for (let k = 0; k < BATTLES; k++) {
        let roster = initialRoster;
        let all = true;
        for (const [i, site] of ruinsDungeon.battles.entries()) {
          levels[i].push(avg(roster.units.map((u) => u.level)));
          const { state } = playDungeon(site, 5000 + k * 10 + i, roster);
          if (state.winner === 'player') chainWins[i]++;
          else all = false;
          roster = { ...roster, units: P.applyBattleResult(roster, state, catalog, rules).roster.units.map((u) => learnAll(u)) };
        }
        if (all) cleared++;
      }
      console.log(
        `  連戦（育てていない部隊で第1戦から続けて。戦闘の後に覚えられるものを覚える）: ` +
          ruinsDungeon.battles.map((_, i) => `第${i + 1}戦 勝率 ${pct(chainWins[i], BATTLES)}（開始時の平均 Lv ${avg(levels[i]).toFixed(1)}）`).join('、') +
          `、3戦とも勝った ${pct(cleared, BATTLES)}`,
      );
    }
    // 第2戦: 待つ（攻撃できない時は動かない）と、進む（通常。到達するマスへ前進する）
    const corridor = ruinsDungeon.battles[1];
    for (const [label, roster] of [
      ['育てていない部隊', initialRoster],
      [`レベル ${MID_LEVEL} の部隊`, midRoster],
    ]) {
      const rate = (stance) => {
        const runs = [];
        for (let k = 0; k < BATTLES; k++) runs.push(playDungeon(corridor, FIRST_SEED + k, roster, { ...aiConfig, stance }));
        return `${pct(runs.filter((r) => r.state.winner === 'player').length, runs.length)}（手番数 ${avg(runs.map((r) => r.state.turnNumber)).toFixed(0)}）`;
      };
      console.log(`  第2戦の動かし方（${label}）: 待つ ${rate('hold')}、進む ${rate('normal')}`);
    }
  }

  if (DUNGEON_ONLY) {
    dungeonReport();
    return server.close();
  }

  console.log(`AI 同士の対戦（1つの組み合わせにつき ${BATTLES} 戦。シード値 ${FIRST_SEED}〜${FIRST_SEED + BATTLES - 1}）`);
  console.log(`見込み時間の目安: 味方の手番 ${SECONDS.playerTurn}秒、敵の手番 ${SECONDS.enemyTurn}秒、魔法の発動 ${SECONDS.spell}秒`);
  console.log(
    `十分に育てた部隊: 全員 Lv ${TRAINED_LEVEL}（今のジョブだけで育てた成長値）、今のジョブのアビリティをすべて習得し、受動的なアビリティを付けている`,
  );

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
      const minutes = runs.map(minutesOf);
      const abilityUse = {};
      const reactionUse = {};
      for (const { events } of runs) {
        for (const e of events) {
          const id = e.type === 'attacked' && !e.counter ? e.abilityId : e.type === 'castStarted' ? e.spellId : null;
          if (id) abilityUse[id] = (abilityUse[id] ?? 0) + 1;
          if (e.type === 'reaction') reactionUse[e.abilityId] = (reactionUse[e.abilityId] ?? 0) + 1;
        }
      }
      const per = (o) =>
        Object.entries(o)
          .map(([id, n]) => `${id} ${(n / runs.length).toFixed(1)}`)
          .join(' / ') || 'なし';
      console.log(
        `  ${tier.id.padEnd(6)}: 勝率 ${pct(wins, runs.length)}、未決着 ${undecided}、手番数 平均 ${avg(turns).toFixed(1)}（最大 ${Math.max(...turns)}）、` +
          `見込み時間 平均 ${avg(minutes).toFixed(1)}分（最大 ${Math.max(...minutes).toFixed(1)}分）`,
      );
      console.log(`          使われた行動アビリティ（1戦あたり、両軍）: ${per(abilityUse)}`);
      console.log(`          発動したリアクション（1戦あたり、両軍）: ${per(reactionUse)}`);
      console.log(`          封じ（1戦あたり）: ${sealUse(runs)}`);
    }
  }
  if (TIERS_ONLY) return server.close();
  dungeonReport();

  // ---- 育成の速さ（続けて戦う） ----
  console.log('');
  console.log(
    `■ 育成の速さ（最初の部隊から、全員がレベル 50 になるまで続けて戦う（上限 ${CAMPAIGN} 戦）。` +
      '部隊の平均レベル以下で最も強い段階を選び、覚えられるアビリティはすぐ覚えて付ける）',
  );
  let roster = initialRoster;
  const firstLearn = {};
  const jobLv8 = {};
  const reached = {};
  const perBattle = [];
  const tierCount = {};
  const expByUnit = Object.fromEntries(initialRoster.units.map((u) => [u.id, []]));
  const actionsByUnit = Object.fromEntries(initialRoster.units.map((u) => [u.id, []]));
  for (let b = 1; b <= CAMPAIGN; b++) {
    const avgLevel = avg(roster.units.map((u) => u.level));
    const tier = [...twinHillsBattle.tiers].reverse().find((t) => t.units[0].level <= avgLevel) ?? twinHillsBattle.tiers[0];
    tierCount[tier.id] = (tierCount[tier.id] ?? 0) + 1;
    const { state } = play(10000 + b, tier.id, roster);
    const result = P.applyBattleResult(roster, state, catalog, rules);
    roster = result.roster;
    perBattle.push({ tier: tier.id, ...result.report, exp: avg(result.report.units.map((u) => u.exp)), jp: avg(result.report.units.map((u) => u.jp)) });
    for (const r of result.report.units) {
      expByUnit[r.unitId].push(r.exp);
      actionsByUnit[r.unitId].push(r.actions);
    }
    roster = {
      ...roster,
      units: roster.units.map((u0) => {
        const u = learnAll(u0, () => {
          firstLearn[u0.id] ??= b;
        });
        if (P.jobLevel(u, u.jobId, rules) >= 8) jobLv8[u.id] ??= b;
        if (u.level >= rules.maxLevel) reached[u.id] ??= b;
        return u;
      }),
    };
    if ([1, 5, 10, 20, 30, 50, 75, 100, 150, 200, 300, 400].includes(b)) {
      console.log(
        `  ${String(b).padStart(3)}戦目まで: レベル ${roster.units.map((u) => u.level).join('・')}、` +
          `ジョブのレベル ${roster.units.map((u) => P.jobLevel(u, u.jobId, rules)).join('・')}、` +
          `勝ち ${perBattle.filter((x) => x.victory).length}`,
      );
    }
    if (roster.units.every((u) => reached[u.id])) {
      console.log(`  ${b}戦目で全員がレベル 50 になった`);
      break;
    }
  }
  const expPerBattle = avg(perBattle.map((x) => x.exp));
  const jpPerBattle = avg(perBattle.map((x) => x.jp));
  console.log(
    `  選んだ段階: ${Object.entries(tierCount).map(([k, v]) => `${k} ${v}戦`).join(' / ')}、勝率 ${pct(perBattle.filter((x) => x.victory).length, perBattle.length)}`,
  );
  console.log(`  1人あたり1戦の平均: 経験値 ${expPerBattle.toFixed(0)}、JP ${jpPerBattle.toFixed(0)}`);
  console.log(
    `  1戦あたりの行動の回数と経験値: ${roster.units
      .map((u) => `${u.id}(${u.jobId}) ${avg(actionsByUnit[u.id]).toFixed(1)}回・${avg(expByUnit[u.id]).toFixed(0)}`)
      .join(' / ')}`,
  );
  console.log(`  初めて何かを習得した戦闘: ${roster.units.map((u) => `${u.id} ${firstLearn[u.id] ?? '-'}戦目`).join(' / ')}`);
  console.log(`  ジョブのレベルが 8 になった戦闘: ${roster.units.map((u) => `${u.id}(${u.jobId}) ${jobLv8[u.id] ?? '-'}戦目`).join(' / ')}`);
  // レベル 50 までの戦闘数（届かなかったユニットは、最後の 20 戦の経験値の平均で残りを見積もる）
  const total50 = (() => {
    let t = 0;
    for (let lv = 1; lv < rules.maxLevel; lv++) t += P.expToNext(lv, rules);
    return t;
  })();
  const battlesTo50 = roster.units.map((u) => {
    if (reached[u.id]) return { u, n: reached[u.id], estimated: false };
    const gained = expByUnit[u.id].reduce((s, x) => s + x, 0);
    const recent = avg(expByUnit[u.id].slice(-20));
    return { u, n: Math.round(perBattle.length + (total50 - gained) / Math.max(1, recent)), estimated: true };
  });
  console.log(
    `  レベル 50 までの戦闘数: ${battlesTo50.map(({ u, n, estimated }) => `${u.id}(${u.jobId}) ${n}戦${estimated ? '（見積もり）' : ''}`).join(' / ')}`,
  );
  const ns = battlesTo50.map((x) => x.n);
  console.log(`  最も遅いユニット ÷ 最も早いユニット = ${(Math.max(...ns) / Math.min(...ns)).toFixed(2)} 倍（目標 1.3 倍以内）`);
  const byTier = {};
  for (const x of perBattle) (byTier[x.tier] ??= []).push(x.exp);
  console.log(`  段階ごとの1人あたり1戦の経験値の平均: ${Object.entries(byTier).map(([k, v]) => `${k} ${avg(v).toFixed(0)}`).join(' / ')}`);

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
    const diff = Math.floor(((best.growth[stat] - worst.growth[stat]) * 49) / 100);
    console.log(`  ${stat.padEnd(6)}: 成長率の最も良い ${best.id} と最も悪い ${worst.id} の差は、Lv 50 で ${diff}`);
  }
  await server.close();
}

const avg = (xs) => (xs.length ? xs.reduce((s, x) => s + x, 0) / xs.length : 0);
const pct = (x, total) => `${((x * 100) / total).toFixed(1)}%`;

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
