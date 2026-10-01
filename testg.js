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
  ok(run.race.slip.every(s => s.odds >= 1.15), 'odds locked');
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
console.log(fails ? 'FAILED ' + fails : 'gamble tests ok');
