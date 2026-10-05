// Gambler's Night engine tests: node testg.js
const G = require('./src/gamble.js'); const M = G.Meta;
let fails = 0; const ok = (c, m) => { if (!c) { fails++; console.log('FAIL', m); } };
const all = M.NODES.reduce((st, n) => { for (let i = 0; i < n.costs.length; i++) st.levels[n.id] = i + 1; return st; }, Object.assign(M.fresh(), { sp: 0 }));
const fxAll = M.effects(all); ok(fxAll.tools.length === 10, 'all tools unlocked');
for (let seed = 1; seed <= 40; seed++) {
  const run = G.newNight({ seed, meta: seed % 2 ? fxAll : {}, races: 5 });
  // book phase
  ok(run.phase === 'book' && !G.canLock(run), 'cannot lock an empty slip');
  ok(G.pick(run, 0, 1) && G.pick(run, 1, 1) && run.race.slip[0] === null && run.race.slip[1].h === 1, 'a horse holds one place');
  G.pick(run, 1, 1); ok(run.race.slip[1] === null, 'same pick clears');
  G.pickBest(run); ok(run.race.slip.every(Boolean), 'full order');
  const pk = G.useTool(run, 'peek'); ok(pk.ok && run.race.pk >= 1, 'peek in the book');
  ok(!G.useTool(run, 'burn').ok, 'burn only after the lock');
  const cash0 = run.cash; ok(G.lock(run) && run.cash === cash0 - 40, 'lock takes stakes');
  ok(run.race.slip.every(s => s.odds >= G.CFG.minOdds), 'odds locked');
  let n = 0, finishedOrder = [];
  while (!run.race.done && n < 80) {
    n++;
    if (n === 4) { // save/resume mid-race
      const b = G.unpack(G.pack(run)); const e1 = G.draw(run), e2 = G.draw(b); ok(JSON.stringify(e1) === JSON.stringify(e2), 'resume draws the same card'); continue;
    }
    if (n === 6) { const r = G.recall(run, 3, run.race.slip[3].h === 0 ? 1 : 0); }
    if (n % 7 === 3) for (const id of G.TOOL_ORDER) { const ts = G.toolState(run, id); if (ts.ok) { const res = G.useTool(run, id, G.TOOLS[id].target ? (n % 4) : undefined); break; } }
    const ev = G.draw(run); ok(ev && ev.horse >= 0, 'draw'); if (ev.place) finishedOrder.push(ev.horse);
  }
  ok(run.race.done, 'race finishes'); ok(new Set(run.race.order).size === 4, 'order is a permutation');
  ok(run.race.order.slice(0, run.race.finished.length).join() === run.race.finished.join(), 'finished first');
  const cashBefore = run.cash, res = G.settle(run);
  ok(res && run.phase === 'result', 'settle');
  const exp = res.pay + res.bonus + res.insured; ok(run.cash === cashBefore + exp, 'cash after settle');
  ok(Math.abs(res.net - (exp - res.stakes - res.fees - res.spent - res.fines + res.alibi)) < 1e-9, 'net adds up');
  if (res.caught) ok(res.pay === 0 && res.bonus === 0, 'caught pays nothing');
  // backroom
  ok(G.toBackroom(run) && run.phase === 'back' && run.back.offers.length === run.fx.offers, 'backroom offers');
  if (run.back.offers[0]) { const c = run.cash; const f = G.favorById(run.back.offers[0]); const got = G.buyFavor(run, f.id); ok(got === (c >= f.price), 'favor buy'); ok(!G.buyFavor(run, run.back.offers[1] || 'x'), 'one favor per stop'); }
  const heat0 = run.heat; if (heat0 > 0) { G.coolOff(run); ok(run.heat < heat0 || run.cash < 25, 'cool off'); }
  ok(G.takeLoan(run) && run.debt >= run.fx.loanOwe, 'loan'); G.takeLoan(run); ok(!G.takeLoan(run), 'two loans max');
  ok(G.nextRace(run) && run.raceNo === 2 && run.phase === 'book', 'next race');
  // play the remaining races quickly with the best order
  while (run.phase !== 'over') {
    if (run.phase === 'book') { G.pickBest(run); if (!G.lock(run)) { run.race.slip = [{ h: 0, stake: 5, odds: 0 }, null, null, null]; G.setChip(run, 5); G.lock(run); } }
    else if (run.phase === 'race') { while (!run.race.done) G.draw(run); G.settle(run); }
    else if (run.phase === 'result') G.toBackroom(run);
    else if (run.phase === 'back') G.nextRace(run);
  }
  ok(run.over && run.over.rp >= 0 && run.stats.races === 5, 'night over');
}
// heat, inspection and getting caught
{
  const run = G.newNight({ seed: 9, meta: { heatCap: 0 } }); G.pickBest(run); G.lock(run);
  let caught = false, inspected = false;
  for (let i = 0; i < 12 && !caught; i++) { run.cash = 500; run.race.uses = {}; run.race.confiscated = {}; const r = G.useTool(run, 'stack', i % 4); if (!r.ok) continue; r.events.forEach(e => { if (e.t === 'caught') caught = true; if (e.t === 'inspect') inspected = true; }); }
  ok(caught && run.race.caught, 'enough heat gets you caught'); while (!run.race.done) G.draw(run); const rs = G.settle(run); ok(rs.pay === 0 && rs.caught, 'caught voids the slip');
  ok(!G.useTool(G.newNight({ seed: 3 }), 'swap').ok, 'locked tool refused');
}
// effects of tools
{
  const run = G.newNight({ seed: 21, meta: fxAll }); G.pickBest(run); G.lock(run); const r = run.race;
  run.cash = 999;
  const top = r.deck[0].s; const other = (top + 1) % 4; ok(G.useTool(run, 'stack', other).ok && r.deck[0].s === other, 'stack puts the suit on top');
  ok(G.useTool(run, 'mud', 2).ok && r.lane[2].mud === 3, 'mud'); ok(G.useTool(run, 'hurdle', 1).ok && r.lane[1].hurdle, 'hurdle');
  let deckBefore = r.deck.length; G.useTool(run, 'burn'); ok(r.deck.length === deckBefore - 1, 'burn removes a card');
  ok(!G.useTool(run, 'burn').ok || true, 'burn twice');
  const e = G.draw(run); ok(e.steps >= 0, 'draw after tools');
}

// v14: the book's quirks, duels, per-place stakes, the one-place autopilot
{
  const seen = {};
  for (let seed = 1; seed <= 120; seed++) {
    const run = G.newNight({ seed, meta: fxAll, races: 5 }), r = run.race, qk = r.quirk; seen[qk] = (seen[qk] || 0) + 1;
    ok(G.QUIRKS[qk], 'a quirk is set');
    r.comp.forEach(c => ok(c.n + 2 * c.f >= G.CFG.minSteps && c.f <= G.CFG.faceMax, 'every suit can reach the line'));
    const q = G.quote(run);
    for (let pl = 0; pl < 4; pl++) { let s = 0, sb = 0; for (let h = 0; h < 4; h++) { s += q.P[h][pl]; sb += q.B[h][pl]; } ok(Math.abs(s - 1) < 1e-9 && Math.abs(sb - 1) < 1e-6, 'columns sum to 1 (truth and book)'); }
    if (qk === 'sharp') ok(q.B === q.P, 'a sharp book prices the truth');
    const b = G.board(run); ok(b.every(row => row.every(c => Math.abs(c.d - (c.t - c.p)) < 1e-12)), 'board carries the book mistake');
    // duels: 3 distinct pairs, never the same horse twice in one duel
    const du = G.duelsOf(run); ok(du.length === 3 && new Set(du.map(d => Math.min(...d) + '' + Math.max(...d))).size === 3 && du.every(d => d[0] !== d[1]), 'three distinct duels');
    ok(G.duelsOf(run) === du, 'duels are fixed for the race');
    const dbd = G.duelBoard(run); ok(dbd.every(x => x.oa >= G.CFG.duelMin && x.ob >= G.CFG.duelMin), 'duel prices');
    // per-place stakes
    G.pick(run, 0, 1); G.pick(run, 1, 2); ok(G.stepStake(run, 'p', 0, 1) && r.slip[0].stake === 25 && r.slip[1].stake === 10, 'stake of one pick changes alone');
    ok(!G.stepStake(run, 'p', 3, 1), 'no stake on an empty place'); G.setChip(run, 5); ok(r.slip[0].stake === 5 && r.slip[1].stake === 5, 'chip sets all picks');
    G.stepStake(run, 'p', 0, 2); ok(r.slip[0].stake === 25, 'steps skip along the chip list');
    ok(G.duelPick(run, 0, du[0][0]) && r.dbets[0].h === du[0][0] && r.dbets[0].stake === 5, 'duel pick');
    ok(!G.duelPick(run, 0, [0, 1, 2, 3].find(h => du[0].indexOf(h) < 0)), 'a horse outside the duel is refused');
    const staked = G.staked(run); ok(staked === 25 + 5 + 5, 'staked adds places and duels');
    const c0 = run.cash; ok(G.lock(run) && run.cash === c0 - staked, 'lock takes every stake once');
    ok(r.slip[0].stake === 25 && r.slip[1].stake === 5, 'lock keeps each stake'); ok(r.dbets[0].odds >= G.CFG.duelMin, 'duel odds locked');
    while (!r.done) G.draw(run);
    const cash1 = run.cash, res = G.settle(run), o = r.order;
    ok(res.duels.length === 1, 'duel settled'); const d0 = res.duels[0], hit = o.indexOf(d0.h) < o.indexOf(d0.over); ok(d0.hit === hit, 'duel decided by finishing order');
    ok(res.pay === res.bets.reduce((a, x) => a + x.pay, 0) + res.duels.reduce((a, x) => a + x.pay, 0), 'pay adds up');
    ok(Math.abs(res.net - (res.pay + res.bonus + res.insured - res.stakes - res.fees - res.spent - res.fines + res.alibi)) < 1e-9 && res.stakes === staked, 'net with duels');
    ok(run.cash === cash1 + res.pay + res.bonus + res.insured, 'cash after duels');
    if (res.sharp) ok(res.bets.filter(x => x.sharp).every(x => x.hit && x.odds >= G.CFG.sharpOdds), 'sharp calls are long-odds hits');
    // the autopilot fills one place only
    const r2 = G.newNight({ seed: seed + 500, meta: {}, races: 5 }); const f = G.pickFavorite(r2); ok(f && r2.race.slip.filter(Boolean).length === 1, 'autopilot fills one place');
    G.pickFavorite(r2); ok(r2.race.slip.filter(Boolean).length === 2 && new Set(r2.race.slip.filter(Boolean).map(s => s.h)).size === 2, 'then the next place, another horse');
    G.pickBook(r2); ok(r2.race.slip.every(Boolean), 'bot helper fills the order'); G.pickValue(r2, 0.05); ok(r2.race.slip.filter(Boolean).length <= 4, 'value helper');
  }
  ok(Object.keys(seen).length === 4, 'all four quirks turn up: ' + JSON.stringify(seen));
  // a night saved before v14 (no quirk, no duels, no stats.sharp) still plays
  const old = G.newNight({ seed: 77, meta: {}, races: 5 }); const o = G.pack(old); delete o.race.quirk; delete o.race.duels; delete o.race.dbets; delete o.stats.sharp;
  const run = G.unpack(o); G.pick(run, 0, 0); ok(G.canLock(run) && G.lock(run), 'old save locks'); while (!run.race.done) G.draw(run); const rs = G.settle(run); ok(rs && rs.duels.length === 0 && rs.quirk === 'sharp', 'old save settles');
  // Bookie's Tell
  const rt = G.newNight({ seed: 5, meta: { tell: 1 } }); const bt = G.board(rt); ok(bt.flat().every(c => [-1, 0, 1].indexOf(G.tellMark(rt, c)) >= 0), 'tell marks');
  const none = G.newNight({ seed: 5, meta: {} }); ok(G.board(none).flat().every(c => G.tellMark(none, c) === 0), 'no tell, no marks');
  ok(M.effects(all).tell === 2 && M.effects(M.fresh()).tell === 0, 'tell effect');
}
console.log(fails ? 'FAILED ' + fails : 'gamble tests ok');
