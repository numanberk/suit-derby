// Balance simulation: node sim.js
const E = require('./src/engine.js');
const M = require('./src/meta.js');

// what a reasonably greedy buyer wants, best first
const PRIORITY = ['flush','takeover','jackpot','ticket','fake','joker','aces','court','stack','draft','sling','stride','wind','marked','retread','horseshoe','dice','chaos','sand','rich','interest','penny','spare','lens','insure','haggler','bookie','roller','coin','slam','sabotage','headstart','cut','double','slip','allin'];

function placeBets(run, stakeEach) {
  const used = new Set([run.me]);
  run.calls = [{ h: run.me, stake: stakeEach }, null, null, null];
  for (let pl = 1; pl < 4; pl++) {
    let best = -1, bp = -1;
    for (let h = 0; h < 4; h++) if (!used.has(h) && run.quote.p[h][pl] > bp) { bp = run.quote.p[h][pl]; best = h; }
    if (E.spendable(run) < stakeEach) break;
    used.add(best);
    run.calls[pl] = { h: best, stake: stakeEach };
  }
}
function shopGreedy(run) {
  let guard = 0;
  while (guard++ < 40) {
    let best = null;
    run.shop.forEach((o, i) => {
      if (o.sold || E.priceOf(run, o.id) > E.spendable(run)) return;
      const p = PRIORITY.indexOf(o.id);
      if (!best || p < best.p) best = { i, p };
    });
    if (!best) break;
    E.buy(run, best.i);
  }
}
function playRun({ laps, buy, bet, metaLevels = {}, seed, me = 0 }) {
  E.CFG.quoteSims = bet ? 90 : 2;
  const meta = M.effects({ levels: metaLevels });
  const run = E.newRun({ me, laps, meta, seed });
  const places = [];
  while (run.phase !== 'over') {
    if (bet) placeBets(run, bet); else run.calls = [null, null, null, null];
    E.startLap(run);
    let spent = 0;
    while (!run.lap.done) {
      E.stepLap(run, 0.05);
      if (run.lap.spurs > 0 && run.lap.t > 1.0 + spent * 6) { E.spur(run); spent++; }
    }
    const res = E.endLap(run);
    places.push(res.place);
    if (run.phase === 'shop' && buy) shopGreedy(run);
  }
  return { run, places };
}
function stats(label, opt, n = opt.bet ? 100 : 250) {
  let champ = 0, pl = 0, lp = 0, sp = 0, earned = 0, staked = 0, ret = 0, hits = 0, calls = 0, cash = 0;
  const rk = [0, 0, 0, 0];
  for (let i = 0; i < n; i++) {
    const { run, places } = playRun({ ...opt, seed: 1000 + i });
    const r = run.result;
    champ += r.champion; sp += r.sp; rk[r.rank - 1]++; earned += run.cashEarned; cash += run.cash;
    places.forEach(p => { pl += p; lp++; });
    run.history.forEach(h => { staked += h.staked; ret += h.betReturn; hits += h.hits; calls += h.calls.length; });
  }
  console.log(label.padEnd(30), 'champ', (champ / n).toFixed(2), 'lapPlace', (pl / lp).toFixed(2), 'SP', (sp / n).toFixed(1), 'earned$', (earned / n).toFixed(0), 'left$', (cash / n).toFixed(0),
    staked ? ('| bets hit ' + (hits / calls * 100).toFixed(0) + '% return/stake ' + (ret / staked).toFixed(2)) : '', '| ranks', rk.map(x => (x / n).toFixed(2)).join('/'));
}
const maxed = { deep: 5, winnings: 5, loaded: 5, training: 5, shrewd: 5, slots: 2, reroll: 2, owners: 1, purse: 3, lucky: 3, sharp: 4 };
if (process.argv[2] !== 'iso') {
  for (const laps of [5, 10]) {
    console.log('--- ' + laps + ' laps');
    stats('no buy, no bets', { laps });
    stats('bets only ($10/slot)', { laps, bet: 10 });
    stats('bets only ($25/slot)', { laps, bet: 25 });
    stats('greedy buy', { laps, buy: true });
    stats('greedy buy + $10 bets', { laps, buy: true, bet: 10 });
    stats('greedy + max meta', { laps, buy: true, metaLevels: maxed });
  }
}
if (process.argv[2] === 'iso' || process.argv[2] === 'all') {
  // value of each permanent upgrade on its own: lap-place change vs. a bare horse, 5 laps, rivals upgrade as normal
  E.CFG.quoteSims = 2;
  console.log('--- isolated (one copy owned from lap 1, 5-lap runs); lower lapPlace is better');
  const base = (() => { let pl = 0, lp = 0; for (let i = 0; i < 300; i++) { const run = E.newRun({ me: 0, laps: 5, seed: 7000 + i }); while (run.phase !== 'over') { E.startLap(run); while (!run.lap.done) E.stepLap(run, 0.5); pl += E.endLap(run).place; lp++; } } return pl / lp; })();
  console.log('bare'.padEnd(12), base.toFixed(3));
  for (const u of E.UPGRADES.filter(u => u.kind !== 'lap' && u.kind !== 'cash' && u.kind !== 'bet')) {
    let pl = 0, lp = 0;
    for (let i = 0; i < 300; i++) {
      const run = E.newRun({ me: 0, laps: 5, seed: 7000 + i });
      const me = run.horses[0]; u.apply(run, me); me.up[u.id] = 1;
      while (run.phase !== 'over') { E.startLap(run); while (!run.lap.done) { E.stepLap(run, 0.05); if (run.lap.spurs > 0 && run.lap.t > 1) E.spur(run); } pl += E.endLap(run).place; lp++; }
    }
    console.log((u.tier[0].toUpperCase() + ' ' + u.id).padEnd(14), (pl / lp).toFixed(3), 'delta', ((pl / lp) - base).toFixed(3));
  }
}
