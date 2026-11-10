// バランス確認（npm run balance）。画面を使わず、core だけで AI 同士を多数回戦わせて集計する。
//
// AI の動かし方は3通り:
// - 通常: 攻撃できない時は、敵の攻撃が届かないぎりぎりで止まる（にらみ合いが続くと前進）
// - 前に出る: 攻撃できない時は、敵の攻撃範囲を気にせず近づく（改良前の動き）
// - 待つ: 攻撃できない時は、その場から動かない
//
// 組み合わせ「A 対 B」は、A を味方側にして半分、A を敵側にして半分を戦わせ、A の勝率を数える。
// 素早さが同じユニットは並び順で先に動く側が決まるなど、陣営による有利・不利があるため、両側を入れ替えて打ち消す。
//
// 1戦の見込み時間は、手番ごとの目安の秒数から計算する（下の SECONDS）。
//
// 使い方: npm run balance -- --battles=200
import { createServer } from 'vite';

const args = Object.fromEntries(
  process.argv.slice(2).map((a) => {
    const [k, v] = a.replace(/^--/, '').split('=');
    return [k, v ?? 'true'];
  }),
);
/** 1つの組み合わせで戦わせる数（半分ずつ両側で） */
const BATTLES = Number(args.battles ?? 200);
const FIRST_SEED = Number(args.seed ?? 1);
const ONLY = args.only;

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
  const { firstBattle } = await load('/src/data/battles/firstBattle.ts');
  const { jobs } = await load('/src/data/jobs.ts');
  const { spells } = await load('/src/data/spells.ts');
  const { battleRules } = await load('/src/data/battleRules.ts');
  const { aiConfig } = await load('/src/data/aiConfig.ts');

  const play = (seed, player, enemy) => {
    const start = startBattle(firstBattle, jobs, battleRules, seed, spells).state;
    return runAutoBattle(start, 2000, { player, enemy });
  };

  const stances = {
    通常: aiConfig,
    '前に出る': { ...aiConfig, stance: 'advance' },
    '待つ': { ...aiConfig, stance: 'hold' },
  };
  const matchups = [
    ['通常', '通常'],
    ['前に出る', '通常'],
    ['待つ', '通常'],
    ['待つ', '前に出る'],
    ['前に出る', '前に出る'],
  ].filter(([a, b]) => !ONLY || `${a}-${b}` === ONLY);

  console.log(`AI 同士の対戦（1つの組み合わせにつき ${BATTLES} 戦。シード値 ${FIRST_SEED}〜${FIRST_SEED + BATTLES / 2 - 1} を両側で）`);
  console.log(`見込み時間の目安: 味方の手番 ${SECONDS.playerTurn}秒、敵の手番 ${SECONDS.enemyTurn}秒、魔法の発動 ${SECONDS.spell}秒`);
  for (const [a, b] of matchups) {
    const runs = [];
    for (let i = 0; i < BATTLES / 2; i++) {
      runs.push({ side: 'player', ...play(FIRST_SEED + i, stances[a], stances[b]) });
      runs.push({ side: 'enemy', ...play(FIRST_SEED + i, stances[b], stances[a]) });
    }
    const n = runs.length;
    const winsOf = (side) => runs.filter((r) => r.side === side && r.state.winner === side).length;
    const undecided = runs.filter((r) => !r.state.winner).length;
    const turns = runs.map((r) => r.state.turnNumber);
    const minutes = [];
    const casts = { fire: 0, wind: 0, heal: 0 };
    const between = { fire: [], wind: [], heal: [] };
    let fizzled = 0;
    let alliesHit = 0;
    for (const { state, events } of runs) {
      let playerTurns = 0;
      let enemyTurns = 0;
      let spellCount = 0;
      const pending = new Map();
      const teamOf = new Map(state.units.map((u) => [u.id, u.team]));
      for (const e of events) {
        if (e.type === 'turnStarted') {
          if (teamOf.get(e.unitId) === 'player') playerTurns++;
          else enemyTurns++;
          for (const [caster, p] of pending) if (caster !== e.unitId) p.count++;
        } else if (e.type === 'castStarted') {
          casts[e.spellId]++;
          pending.set(e.casterId, { spellId: e.spellId, count: 0 });
        } else if (e.type === 'spellResolved') {
          spellCount++;
          const p = pending.get(e.casterId);
          if (p) between[p.spellId].push(p.count);
          pending.delete(e.casterId);
          if (e.effect === 'damage') {
            const casterTeam = teamOf.get(e.casterId);
            alliesHit += e.results.filter((r) => teamOf.get(r.unitId) === casterTeam).length;
          }
        } else if (e.type === 'spellFizzled' || e.type === 'castInterrupted') {
          fizzled++;
          pending.delete(e.casterId);
        }
      }
      minutes.push((playerTurns * SECONDS.playerTurn + enemyTurns * SECONDS.enemyTurn + spellCount * SECONDS.spell) / 60);
    }
    const avg = (xs) => (xs.length ? xs.reduce((s, x) => s + x, 0) / xs.length : 0);
    const pct = (x, total) => `${((x * 100) / total).toFixed(1)}%`;
    const sorted = [...turns].sort((x, y) => x - y);
    // A が勝った数（A が味方側なら味方の勝ち、A が敵側なら敵の勝ち）
    const aAsPlayer = winsOf('player');
    const aAsEnemy = winsOf('enemy');
    console.log('');
    console.log(`■ 「${a}」対「${b}」`);
    if (a === b) {
      console.log(`  味方側の勝率 ${pct(aAsPlayer, n / 2)}（同じ動かし方どうし。陣営による有利・不利を見るため）、未決着 ${undecided}`);
    } else {
      console.log(
        `  「${a}」の勝率 ${pct(aAsPlayer + aAsEnemy, n)}（「${a}」が味方側の時 ${pct(aAsPlayer, n / 2)}、敵側の時 ${pct(aAsEnemy, n / 2)}）、未決着 ${undecided}`,
      );
    }
    console.log(`  手番数 平均 ${avg(turns).toFixed(1)} / 中央 ${sorted[Math.floor(n / 2)]} / 最小 ${sorted[0]} / 最大 ${sorted[n - 1]}`);
    console.log(
      `  見込み時間 平均 ${avg(minutes).toFixed(1)}分（最短 ${Math.min(...minutes).toFixed(1)}分、最長 ${Math.max(...minutes).toFixed(1)}分）`,
    );
    console.log(
      `  魔法（1戦あたり）: 炎 ${(casts.fire / n).toFixed(1)}回 / 風 ${(casts.wind / n).toFixed(1)}回 / 癒し ${(casts.heal / n).toFixed(1)}回、` +
        `不発・中断 ${(fizzled / n).toFixed(2)}回、攻撃魔法で巻き込んだ味方 ${(alliesHit / n).toFixed(2)}体`,
    );
    console.log(
      `  指定から発動までに入ったほかのユニットの手番（平均）: 炎 ${avg(between.fire).toFixed(1)}回 / 風 ${avg(between.wind).toFixed(1)}回 / 癒し ${avg(between.heal).toFixed(1)}回`,
    );
  }
  await server.close();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
