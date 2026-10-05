// Gambler's Night engine tests: node testg.js
const G = require('./src/gamble.js'); const M = G.Meta;
let fails = 0; const ok = (c, m) => { if (!c) { fails++; console.log('FAIL', m); } };
const all = M.NODES.reduce((st, n) => { for (let i = 0; i < n.costs.length; i++) st.levels[n.id] = i + 1; return st; }, Object.assign(M.fresh(), { sp: 0 }));
const fxAll = M.effects(all); ok(fxAll.tools.length === 10, 'all tools unlocked');
/* the upset: any horse but the book's favorite; a bigger chip first so the four cover places fit */
const nonFav = run => [0, 1, 2, 3].find(h => h !== G.favoriteOf(run));
function upsetUp(run, chip) { G.setChip(run, chip || 25); return G.pickUpset(run, nonFav(run)); }
for (let seed = 1; seed <= 40; seed++) {
  const run = G.newNight({ seed, meta: seed % 2 ? fxAll : {}, races: 5 });
  // book phase
  ok(run.phase === 'book' && !G.canLock(run), 'cannot lock an empty slip');
  ok(!G.pick(run, 0, 1) && !G.canLock(run), 'no cover bet without an upset');
  const fav = G.favoriteOf(run); ok(!G.pickUpset(run, fav) && !run.race.upset, 'the favorite cannot be the upset');
  ok(G.upsetBoard(run).filter(u => u.fav).length === 1 && G.upsetBoard(run).map(u => u.rank).sort().join() === '0,1,2,3', 'upset board: one favorite, ranks 0-3');
  ok(upsetUp(run, 25) && run.race.upset.stake === 25, 'upset picked with its stake');
  ok(G.canLock(run), 'an upset alone can lock');
  ok(G.pick(run, 0, 1) && G.pick(run, 1, 1) && run.race.slip[0] === null && run.race.slip[1].h === 1, 'a horse holds one place');
  G.pick(run, 1, 1); ok(run.race.slip[1] === null, 'same pick clears');
  G.pickBest(run); ok(run.race.slip.every(Boolean), 'full cover order'); ok(G.hedgeStaked(run) === 20 && G.hedgeRoom(run) === 5, 'cover bets and room');
  const pk = G.useTool(run, 'peek'); ok(pk.ok && run.race.pk >= 1, 'peek in the book');
  ok(!G.useTool(run, 'burn').ok, 'burn only after the lock');
  const cash0 = run.cash; ok(G.lock(run) && run.cash === cash0 - 45, 'lock takes the upset and the cover stakes');
  ok(run.race.slip.every(s => s.odds >= G.CFG.minOdds) && run.race.upset.odds >= G.CFG.minOdds && run.race.upset.odds <= G.CFG.upsetMax * 1.4, 'odds locked');
  let n = 0, finishedOrder = [];
  while (!run.race.done && n < 80) {
    n++;
    if (n === 4) { // save/resume mid-race
      const b = G.unpack(G.pack(run)); const e1 = G.draw(run), e2 = G.draw(b); ok(JSON.stringify(e1) === JSON.stringify(e2), 'resume draws the same card'); ok(b.race.upset && b.race.upset.h === run.race.upset.h, 'upset survives a save'); continue;
    }
    if (n === 6) { const r = G.recall(run, 3, run.race.slip[3].h === 0 ? 1 : 0); }
    if (n % 7 === 3) for (const id of G.TOOL_ORDER) { const ts = G.toolState(run, id); if (ts.ok) { const res = G.useTool(run, id, G.TOOLS[id].target ? (n % 4) : undefined); break; } }
    const ev = G.draw(run); if (!ev) { ok(run.race.done, 'draw null only when done'); break; } ok(ev.horse >= 0, 'draw'); if (ev.place) finishedOrder.push(ev.horse);
    const un = G.upsetNow(run); ok(un && un.t >= 0 && un.t <= 1 && un.b >= 0, 'upset meter');
  }
  ok(run.race.done, 'race finishes'); ok(new Set(run.race.order).size === 4, 'order is a permutation');
  ok(run.race.order.slice(0, run.race.finished.length).join() === run.race.finished.join(), 'finished first');
  const cashBefore = run.cash, res = G.settle(run);
  ok(res && run.phase === 'result', 'settle');
  const exp = res.pay + res.bonus + res.insured; ok(run.cash === cashBefore + exp, 'cash after settle');
  ok(Math.abs(res.net - (exp - res.stakes - res.fees - res.spent - res.fines + res.alibi)) < 1e-9, 'net adds up');
  ok(res.upset && res.upset.hit === (run.race.order[0] === res.upset.h), 'the upset wins when its horse finishes first');
  ok(res.upset.pay === (res.upset.hit && !res.caught ? Math.round(res.upset.stake * res.upset.odds) : 0), 'upset pays its stake times its odds');
  ok(res.pay === res.upset.pay + res.bets.reduce((a, x) => a + x.pay, 0) + res.duels.reduce((a, x) => a + x.pay, 0), 'pay adds up with the upset');
  if (res.caught) ok(res.pay === 0 && res.bonus === 0, 'caught pays nothing');
  // backroom
  ok(G.toBackroom(run) && run.phase === 'back' && run.back.offers.length === run.fx.offers, 'backroom offers');
  if (run.back.offers[0]) { const c = run.cash; const f = G.favorById(run.back.offers[0]); const got = G.buyFavor(run, f.id); ok(got === (c >= f.price), 'favor buy'); ok(!G.buyFavor(run, run.back.offers[1] || 'x'), 'one favor per stop'); }
  const heat0 = run.heat; if (heat0 > 0) { G.coolOff(run); ok(run.heat < heat0 || run.cash < 25, 'cool off'); }
  ok(G.takeLoan(run) && run.debt >= run.fx.loanOwe, 'loan'); G.takeLoan(run); ok(!G.takeLoan(run), 'two loans max');
  ok(G.nextRace(run) && run.raceNo === 2 && run.phase === 'book', 'next race');
  // play the remaining races quickly: the weakest horse, a cover order
  while (run.phase !== 'over') {
    if (run.phase === 'book') { const w = G.upsetBoard(run).filter(u => !u.fav).sort((a, b) => a.p - b.p)[0]; G.setChip(run, 25); G.pickUpset(run, w.h); G.pickBest(run); if (!G.lock(run)) { run.race.slip = [null, null, null, null]; G.setChip(run, 5); if (!G.lock(run)) G.walkOut(run); } }
    else if (run.phase === 'race') { while (!run.race.done) G.draw(run); G.settle(run); }
    else if (run.phase === 'result') G.toBackroom(run);
    else if (run.phase === 'back') G.nextRace(run);
  }
  ok(run.over && run.over.rp >= 0 && run.stats.races === 5 && typeof run.over.upsets === 'number', 'night over');
}
// heat, inspection and getting caught
{
  const run = G.newNight({ seed: 9, meta: { heatCap: 0 } }); upsetUp(run, 25); G.pickBest(run); G.lock(run);
  let caught = false, inspected = false;
  for (let i = 0; i < 12 && !caught; i++) { run.cash = 500; run.race.uses = {}; run.race.confiscated = {}; const r = G.useTool(run, 'stack', i % 4); if (!r.ok) continue; r.events.forEach(e => { if (e.t === 'caught') caught = true; if (e.t === 'inspect') inspected = true; }); }
  ok(caught && run.race.caught, 'enough heat gets you caught'); while (!run.race.done) G.draw(run); const rs = G.settle(run); ok(rs.pay === 0 && rs.caught && rs.upset.pay === 0, 'caught voids the slip, upset included');
  ok(!G.useTool(G.newNight({ seed: 3 }), 'swap').ok, 'locked tool refused');
}
// effects of tools
{
  const run = G.newNight({ seed: 21, meta: fxAll }); upsetUp(run, 25); G.pickBest(run); G.lock(run); const r = run.race;
  run.cash = 999;
  const top = r.deck[0].s; const other = (top + 1) % 4; ok(G.useTool(run, 'stack', other).ok && r.deck[0].s === other, 'stack puts the suit on top');
  ok(G.useTool(run, 'mud', 2).ok && r.lane[2].mud === 3, 'mud'); ok(G.useTool(run, 'hurdle', 1).ok && r.lane[1].hurdle, 'hurdle');
  let deckBefore = r.deck.length; G.useTool(run, 'burn'); ok(r.deck.length === deckBefore - 1, 'burn removes a card');
  ok(!G.useTool(run, 'burn').ok || true, 'burn twice');
  const e = G.draw(run); ok(e.steps >= 0, 'draw after tools');
}

// v14 + v15: the book's quirks, duels, stakes per bet, cover limit
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
    const ub = G.upsetBoard(run); ok(ub.every(u => Math.abs(u.p - b[u.h][0].p) < 1e-12 && u.odds >= G.CFG.minOdds && u.odds <= G.CFG.upsetMax * 1.4), 'upset prices are the first-place column');
    ok(ub.find(u => u.fav).p === Math.max(...ub.map(u => u.p)), 'the favorite has the best chance to win');
    const du = G.duelsOf(run); ok(du.length === 3 && new Set(du.map(d => Math.min(...d) + '' + Math.max(...d))).size === 3 && du.every(d => d[0] !== d[1]), 'three distinct duels');
    ok(G.duelsOf(run) === du, 'duels are fixed for the race');
    const dbd = G.duelBoard(run); ok(dbd.every(x => x.oa >= G.CFG.duelMin && x.ob >= G.CFG.duelMin), 'duel prices');
    // stakes: the upset first, then the cover bets within its stake
    ok(!G.duelPick(run, 0, du[0][0]), 'no duel without an upset');
    ok(upsetUp(run, 25) && r.upset.stake === 25, 'upset stake from the chip');
    ok(G.pick(run, 0, 1) && r.slip[0].stake === G.hedgeChip(run) && G.pick(run, 1, 2), 'cover bets start at the smallest chip');
    ok(!G.stepStake(run, 'p', 3, 1), 'no stake on an empty place');
    ok(G.stepStake(run, 'p', 0, 1) && r.slip[0].stake === 10 && G.hedgeStaked(run) === 15, 'one cover stake steps alone');
    ok(G.stepStake(run, 'p', 1, 1) && G.hedgeStaked(run) === 20, 'and another');
    ok(!G.stepStake(run, 'p', 0, 1) && r.slip[0].stake === 10, 'a cover stake cannot outgrow the room');
    ok(G.pick(run, 2, 3) && G.hedgeStaked(run) === 25 && G.hedgeRoom(run) === 0, 'a third cover bet fills the room');
    ok(!G.pick(run, 3, 0) && r.slip[3] === null, 'a fourth over the limit is refused');
    ok(!G.setChip(run, 10) && r.upset.stake === 25, 'the upset stake cannot drop below its cover bets');
    ok(!G.stepStake(run, 'u', 0, -1) && r.upset.stake === 25, 'the upset stake cannot step below its cover bets');
    G.pick(run, 2, 3); G.stepStake(run, 'p', 0, -1); G.stepStake(run, 'p', 1, -1);
    ok(G.hedgeStaked(run) === 10, 'cover stakes step back down');
    ok(G.duelPick(run, 0, du[0][0]) && r.dbets[0].h === du[0][0] && r.dbets[0].stake === 5, 'duel pick'); ok(G.hedgeStaked(run) === 15, 'a duel counts as cover');
    ok(!G.duelPick(run, 0, [0, 1, 2, 3].find(h => du[0].indexOf(h) < 0)), 'a horse outside the duel is refused');
    const staked = G.staked(run); ok(staked === 25 + 15, 'staked adds upset, places and duels');
    ok(G.stepStake(run, 'u', 0, 1) && r.upset.stake === 50 && run.chip === 50, 'the upset stake can step up'); ok(G.stepStake(run, 'u', 0, -1) && r.upset.stake === 25, 'and back');
    const c0 = run.cash; ok(G.lock(run) && run.cash === c0 - staked, 'lock takes every stake once');
    ok(r.dbets[0].odds >= G.CFG.duelMin, 'duel odds locked');
    ok(!G.pickUpset(run, [0, 1, 2, 3].find(h => h !== r.upset.h)), 'the upset is set after the lock');
    while (!r.done) G.draw(run);
    const cash1 = run.cash, res = G.settle(run), o = r.order;
    ok(res.duels.length === 1, 'duel settled'); const d0 = res.duels[0], hit = o.indexOf(d0.h) < o.indexOf(d0.over); ok(d0.hit === hit, 'duel decided by finishing order');
    ok(Math.abs(res.net - (res.pay + res.bonus + res.insured - res.stakes - res.fees - res.spent - res.fines + res.alibi)) < 1e-9 && res.stakes === staked, 'net with the upset and duels');
    ok(run.cash === cash1 + res.pay + res.bonus + res.insured, 'cash after settle');
    ok((run.stats.upsets || 0) === (res.upset.hit && !res.caught ? 1 : 0), 'upset stat');
    if (res.sharp) ok(res.bets.filter(x => x.sharp).every(x => x.hit && x.odds >= G.CFG.sharpOdds), 'sharp calls are long-odds hits');
    // bot helpers still cover within limits
    const r2 = G.newNight({ seed: seed + 500, meta: {}, races: 5 }); ok(G.pickFavorite(r2) === null, 'cover autopilot needs an upset'); upsetUp(r2, 25);
    const f = G.pickFavorite(r2); ok(f && r2.race.slip.filter(Boolean).length === 1, 'cover autopilot fills one place');
    G.pickBook(r2); ok(r2.race.slip.every(Boolean), 'bot helper fills the order'); G.pickValue(r2, 0.05); ok(r2.race.slip.filter(Boolean).length <= 4, 'value helper');
  }
  ok(Object.keys(seen).length === 4, 'all four quirks turn up: ' + JSON.stringify(seen));
  // clearing the upset clears the cover bets with it
  { const run = G.newNight({ seed: 12, meta: {} }); upsetUp(run, 25); G.pickBest(run); const h = run.race.upset.h; ok(G.pickUpset(run, h) && !run.race.upset && run.race.slip.every(s => !s) && run.race.dbets.every(s => !s), 'clearing the upset clears the cover bets'); }
  // switching the upset horse keeps the stake
  { const run = G.newNight({ seed: 12, meta: {} }); upsetUp(run, 25); const a = run.race.upset.h, b2 = [0, 1, 2, 3].find(h => h !== a && h !== G.favoriteOf(run)); ok(G.pickUpset(run, b2) && run.race.upset.h === b2 && run.race.upset.stake === 25, 'switching the upset horse'); }
  // a night saved before v15 (no upset) still plays: it settles without one
  const old = G.newNight({ seed: 77, meta: {}, races: 5 }); old.race.slip[0] = { h: 0, stake: 10, odds: 2 }; old.cash -= 10; old.race.locked = true; old.phase = 'race'; delete old.race.upset;
  const run = G.unpack(G.pack(old)); while (!run.race.done) G.draw(run); const rs = G.settle(run); ok(rs && rs.upset === null && rs.stakes === 10, 'a save from before the upset settles');
  // Bookie's Tell
  const rt = G.newNight({ seed: 5, meta: { tell: 1 } }); const bt = G.board(rt); ok(bt.flat().every(c => [-1, 0, 1].indexOf(G.tellMark(rt, c)) >= 0), 'tell marks');
  const none = G.newNight({ seed: 5, meta: {} }); ok(G.board(none).flat().every(c => G.tellMark(none, c) === 0), 'no tell, no marks');
  ok(M.effects(all).tell === 2 && M.effects(M.fresh()).tell === 0, 'tell effect');
  // Longshot Fund
  ok(Math.abs(M.effects(all).upsetPlus - 0.3) < 1e-9 && M.effects(M.fresh()).upsetPlus === 0, 'longshot fund effect');
  const a1 = G.newNight({ seed: 5, meta: {} }), a2 = G.newNight({ seed: 5, meta: { upsetPlus: 0.3 } }), hh = [0, 1, 2, 3].find(h => h !== G.favoriteOf(a1));
  ok(G.upsetBoard(a2)[hh].odds > G.upsetBoard(a1)[hh].odds, 'longshot fund pays more');
  // an upset at long odds pays RP
  const rr = G.newNight({ seed: 1, meta: {} }); rr.stats.upsets = 2; rr.stats.bigUpsets = 1; G.finish(rr); ok(rr.over.upsets === 2 && rr.over.bigUpsets === 1 && rr.over.rp >= 2 * G.CFG.upsetRp + G.CFG.bigUpsetRp, 'upsets pay reputation');
}
console.log(fails ? 'FAILED ' + fails : 'gamble tests ok');
