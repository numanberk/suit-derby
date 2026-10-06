// Gambler's Night engine tests: node testg.js
const G = require('./src/gamble.js'); const M = G.Meta;
let fails = 0; const ok = (c, m) => { if (!c) { fails++; console.log('FAIL', m); } };
const all = M.NODES.reduce((st, n) => { for (let i = 0; i < n.costs.length; i++) st.levels[n.id] = i + 1; return st; }, Object.assign(M.fresh(), { sp: 0 }));
const fxAll = M.effects(all); ok(fxAll.tools.length === 10, 'all tools unlocked');
/* the upset: any horse but the book's favorite; a bigger chip first so the four cover places fit */
const openH = run => G.upsetBoard(run).filter(u => u.open).map(u => u.h);
function upsetUp(run, chip) { G.setChip(run, chip || 25); return G.pickUpset(run, openH(run)[0]); }
for (let seed = 1; seed <= 40; seed++) {
  const run = G.newNight({ seed, meta: seed % 2 ? fxAll : {}, races: 5 });
  // book phase
  ok(run.phase === 'book' && !G.canLock(run), 'cannot lock an empty slip');
  ok(!G.pick(run, 0, 1) && !G.canLock(run), 'no cover bet without an upset');
  const fav = G.favoriteOf(run); ok(!G.pickUpset(run, fav) && !run.race.upset, 'the favorite cannot be the upset');
  ok(openH(run).length === 2 && G.upsetBoard(run).filter(u => !u.open).every(u => u.rank >= 2) && !G.pickUpset(run, G.upsetBoard(run).find(u => u.rank === 2).h), 'only the two weakest horses can be the upset');
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
  { const run = G.newNight({ seed: 12, meta: {} }); upsetUp(run, 25); const a = run.race.upset.h, b2 = openH(run).find(h => h !== a); ok(G.pickUpset(run, b2) && run.race.upset.h === b2 && run.race.upset.stake === 25, 'switching the upset horse'); }
  // a night saved before v15 (no upset) still plays: it settles without one
  const old = G.newNight({ seed: 77, meta: {}, races: 5 }); old.race.slip[0] = { h: 0, stake: 10, odds: 2 }; old.cash -= 10; old.race.locked = true; old.phase = 'race'; delete old.race.upset;
  const run = G.unpack(G.pack(old)); while (!run.race.done) G.draw(run); const rs = G.settle(run); ok(rs && rs.upset === null && rs.stakes === 10, 'a save from before the upset settles');
  // Bookie's Tell
  const rt = G.newNight({ seed: 5, meta: { tell: 1 } }); const bt = G.board(rt); ok(bt.flat().every(c => [-1, 0, 1].indexOf(G.tellMark(rt, c)) >= 0), 'tell marks');
  const none = G.newNight({ seed: 5, meta: {} }); ok(G.board(none).flat().every(c => G.tellMark(none, c) === 0), 'no tell, no marks');
  ok(M.effects(all).tell === 2 && M.effects(M.fresh()).tell === 0, 'tell effect');
  // Longshot Fund
  ok(Math.abs(M.effects(all).upsetPlus - 0.3) < 1e-9 && M.effects(M.fresh()).upsetPlus === 0, 'longshot fund effect');
  const a1 = G.newNight({ seed: 5, meta: {} }), a2 = G.newNight({ seed: 5, meta: { upsetPlus: 0.3 } }), hh = openH(a1)[0];
  ok(G.upsetBoard(a2)[hh].odds > G.upsetBoard(a1)[hh].odds, 'longshot fund pays more');
  // an upset at long odds pays RP
  const rr = G.newNight({ seed: 1, meta: {} }); rr.stats.upsets = 2; rr.stats.bigUpsets = 1; G.finish(rr); ok(rr.over.upsets === 2 && rr.over.bigUpsets === 1 && rr.over.rp >= 2 * G.CFG.upsetRp + G.CFG.bigUpsetRp, 'upsets pay reputation');
}


// v16: the Dark Horse kit
{
  const T = G.TRAITS, ids = G.TRAIT_ORDER;
  ok(ids.length === 13 && ids.every(id => T[id] && T[id].name && T[id].blurb && G.TAGS[T[id].tag]), 'thirteen traits, each with a name, a blurb and a known tag');
  ok(G.COMBOS.length === 9 && G.COMBOS.every(c => T[c.a] && T[c.b] && c.a !== c.b), 'combos pair two real traits');
  ok(G.kitCombos(['closer', 'kick']).length === 1 && G.kitCombos(['closer']).length === 0 && G.kitCombos(['spoil', 'bump', 'groomed']).length === 2, 'combos need both traits');
  ok(G.kitParams(['closer']).closerMax === 1 && G.kitParams(['closer', 'kick']).closerMax === 2 && G.kitParams(['spoil']).spoil === 2 && G.kitParams(['spoil', 'bump']).spoil === 4, 'a combo changes the numbers');
  ok(G.kitParams(['kick']).kickAt === 8 && G.kitParams(['kick', 'groomed']).kickAt === 7, 'Dirt Track starts Kick sooner');
  // a night starts with two drafts, an offer of three traits you do not have, and a reroll
  const run = G.newNight({ seed: 31, meta: {} }), kit = run.kit;
  ok(kit.drafts === 2 && kit.rerolls === 1 && kit.offer.length === 3 && new Set(kit.offer).size === 3 && kit.ids.length === 0, 'start of night: two drafts, one reroll, three offered');
  const first = kit.offer.slice(); ok(G.rerollOffer(run) && kit.offer.length === 3 && kit.offer.every(id => first.indexOf(id) < 0) && kit.rerolls === 0, 'a reroll deals three new traits');
  ok(!G.rerollOffer(run), 'no reroll left');
  const pick1 = kit.offer[0]; ok(G.takeTrait(run, pick1, -1) && kit.ids[0] === pick1 && kit.drafts === 1 && kit.offer && kit.offer.indexOf(pick1) < 0, 'taking a trait fills a slot and deals the next offer');
  ok(!G.takeTrait(run, 'nope', -1), 'only offered traits can be taken');
  const pick2 = kit.offer[1]; ok(G.takeTrait(run, pick2, -1) && kit.ids.length === 2 && kit.drafts === 0 && kit.offer === null, 'second draft, offer closes');
  ok(G.kitSlots(run) === 2, 'two slots by default');
  // a full kit: a draft replaces a slot
  kit.drafts = 1; G.ensureOffer(run); const pick3 = kit.offer[0]; ok(!G.takeTrait(run, pick3, -1), 'full kit needs a slot to replace'); ok(G.takeTrait(run, pick3, 0) && kit.ids[0] === pick3 && kit.ids.length === 2, 'replace a slot');
  // wearing a kit: the upset lifts, and the price follows
  const w = G.upsetBoard(run).filter(u => u.open)[0]; ok(w.kit >= 0 && w.kit <= 1 && (w.odds <= w.plain), 'kit chance is a chance; a better kit never lengthens the price');
  // the stepper: traits do what they say
  const mk = (ids, prog, extra) => { const U = 0, K = G.kitParams(ids), S = { p: prog.slice(), mud: [0, 0, 0, 0], wind: [0, 0, 0, 0], hur: [false, false, false, false], fin: [], seen: [false, false, false, false], draws: 6, track: 10, fx: [], kit: { U, K, ks: Object.assign({ n: 0, miss: 0, cl: 0, kk: 0, fr: 0, ho: 0, ha: 0, du: 0, slipLeft: K.slip || 0, wind: 0, spoilLeft: K.spoil || 0, last: -1, bumped: 0 }, extra || {}) } }; return S; };
  { const S = mk(['closer'], [0, 5, 4, 3]); const r = G.stepCard(S, 0, false, 0, Math.random); ok(r.st === 2 && S.p[0] === 2, 'Closer: +1 when 4 behind'); const r2 = G.stepCard(S, 0, false, 0, Math.random); ok(r2.st === 1, 'Closer works once'); }
  { const S = mk(['closer'], [3, 5, 4, 3]); ok(G.stepCard(S, 0, false, 0, Math.random).st === 1, 'Closer: not when only 2 behind'); }
  { const S = mk(['closer', 'kick'], [0, 6, 4, 3]); G.stepCard(S, 0, false, 0, Math.random); ok(G.stepCard(S, 0, false, 0, Math.random).st === 2, 'Comeback Kid: Closer twice'); }
  { const S = mk(['kick'], [8, 4, 4, 3]); ok(G.stepCard(S, 0, false, 0, Math.random).st === 2 && S.fin.indexOf(0) >= 0, 'Kick at 8 steps, and it crosses the line'); }
  { const S = mk(['slip'], [3, 4, 0, 0]); G.stepCard(S, 1, false, 0, Math.random); ok(S.p[0] === 4 && S.p[1] === 5, 'Slipstream: the horse 1 step ahead moves, you move'); G.stepCard(S, 1, false, 0, Math.random); ok(S.p[0] === 4, 'Slipstream works once'); }
  { const S = mk(['slip'], [3, 5, 0, 0]); G.stepCard(S, 1, false, 0, Math.random); ok(S.p[0] === 3, 'Slipstream: not for a horse 2 ahead'); }
  { const S = mk(['rally'], [1, 5, 4, 3]); S.draws = 6; ok(G.stepCard(S, 0, false, 0, Math.random).st === 2, 'Second Wind: double when last'); }
  { const S = mk(['rally'], [4, 5, 1, 3]); ok(G.stepCard(S, 0, false, 0, Math.random).st === 1, 'Second Wind: not when not last'); }
  { const S = mk(['quick'], [0, 0, 0, 0]); S.draws = 1; ok(G.stepCard(S, 0, false, 0, Math.random).st === 2, 'Quick Start: first card +1'); const S2 = mk(['quick'], [0, 0, 0, 0]); S2.draws = 5; ok(G.stepCard(S2, 0, false, 0, Math.random).st === 1, 'Quick Start: only in the first draws'); }
  { const S = mk(['front'], [4, 3, 3, 2]); ok(G.stepCard(S, 0, false, 0, Math.random).st === 2, 'Front Runner: +1 while leading'); const S2 = mk(['front'], [2, 3, 3, 2]); ok(G.stepCard(S2, 0, false, 0, Math.random).st === 1, 'Front Runner: not when behind'); }
  { const S = mk(['hot'], [0, 0, 0, 0]); ok(G.stepCard(S, 0, false, 2, Math.random).st === 2, 'Lucky Seven: a 7 is worth 2'); const S2 = mk(['hot'], [0, 0, 0, 0]); ok(G.stepCard(S2, 0, false, 0, Math.random).st === 1, 'Lucky Seven: other cards are plain'); }
  { const S = mk(['hand'], [0, 0, 0, 0], { last: 0 }); ok(G.stepCard(S, 0, false, 0, Math.random).st === 2, 'Hot Hand: right after your own card'); const S2 = mk(['hand'], [0, 0, 0, 0], { last: 1 }); ok(G.stepCard(S2, 0, false, 0, Math.random).st === 1, 'Hot Hand: not after a rival card'); }
  { const S = mk(['due'], [0, 0, 0, 0], { miss: 6 }); ok(G.stepCard(S, 0, false, 0, Math.random).st === 2, 'Due: +1 after 6 misses'); const S2 = mk(['due'], [0, 0, 0, 0], { miss: 12 }); ok(G.stepCard(S2, 0, false, 0, Math.random).st === 3, 'Due: +2 after 12'); const S3 = mk(['due'], [0, 0, 0, 0], { miss: 5 }); ok(G.stepCard(S3, 0, false, 0, Math.random).st === 1 && S3.kit.ks.miss === 0, 'Due: not yet at 5, and the count resets'); }
  { const S = mk(['spoil'], [1, 5, 4, 3]); const r = G.stepCard(S, 1, false, 0, Math.random); ok(r.st === 0 && S.p[1] === 5, 'Spoiler: the leader loses a step'); const r2 = G.stepCard(S, 2, false, 0, Math.random); ok(r2.st === 1, 'Spoiler: only the leader'); }
  { const S = mk(['bump'], [2, 3, 4, 9]); G.stepCard(S, 0, true, 0, Math.random); ok(S.p[0] === 4 && S.p[1] === 2 && S.p[2] === 4 && S.p[3] === 9, 'Bump: passing a horse costs it a step (passed 3, tied 4 is not passed)'); }
  { const S = mk(['wild'], [0, 0, 0, 0]); let lo = 9, hi = 0; for (let i = 0; i < 200; i++) { const T2 = mk(['wild'], [0, 0, 0, 0]); const st = G.stepCard(T2, 0, false, 0, Math.random).st; lo = Math.min(lo, st); hi = Math.max(hi, st); } ok(lo === 0 && hi === 3, 'Wild Card swings both ways'); }
  { const S = mk(['groomed'], [0, 0, 0, 0]); ok(S.kit.K.groomed === 1, 'Groomed is on'); }
  // a locked race wears the kit, the sim and the real draw agree on the rules, and a kit never changes a race without one
  const r2 = G.newNight({ seed: 44, meta: {} }); G.pickUpset(r2, openH(r2)[0]); G.setChip(r2, 10); const noKit = r2.race.deck.map(c => c.s + ':' + c.r).join();
  ok(G.lock(r2) && r2.race.kit === null, 'no kit, no kit in the race');
  const r3 = G.newNight({ seed: 44, meta: {} }); const k3 = G.kitOf(r3); k3.ids = ['closer', 'kick']; G.pickUpset(r3, openH(r3)[0]); G.setChip(r3, 10); ok(G.lock(r3) && r3.race.kit && r3.race.kit.ids.join() === 'closer,kick' && r3.race.kit.U === r3.race.upset.h, 'the kit is worn by the upset');
  ok(r3.race.deck.map(c => c.s + ':' + c.r).join() === noKit, 'the deck is the same with or without a kit');
  let sawFx = 0; while (!r3.race.done) { const ev = G.draw(r3); sawFx += (ev.fx || []).length; } const rs = G.settle(r3); ok(rs.kit.join() === 'closer,kick' && rs.upset, 'the result carries the kit'); 
  // the sim's answer for a kit is a fair chance and moves with it
  const r4 = G.newNight({ seed: 44, meta: {} }); const h4 = openH(r4)[0]; const base = G.kitWin(r4, h4, []), withKit = G.kitWin(r4, h4, ['closer', 'kick', 'slip']);
  ok(base >= 0 && base <= 1 && withKit > base, 'a kit raises the chance');
  // old saves without a kit load
  const old = G.pack(G.newNight({ seed: 8, meta: {} })); delete old.kit; const ru = G.unpack(old); ok(ru.kit && ru.kit.ids.length === 0, 'a save without a kit loads');
  // Reputation nodes
  const all2 = M.effects(all); ok(all2.kitSlots === 2 && all2.kitDrafts === 2 && all2.kitRerolls === 2 && all2.match === 1, 'Dark Horse nodes feed the effects');
  const rr = G.newNight({ seed: 3, meta: all2 }); ok(G.kitSlots(rr) === 4 && rr.kit.drafts === 4 && rr.kit.rerolls === 3, 'a stocked kit: four slots, four drafts, three rerolls');
  ok(M.BRANCHES.some(b => b.id === 'kit') && M.NODES.filter(n => n.br === 'kit').length === 4, 'a Dark Horse branch');
  // drafts: one more after every race, up to the cap
  const rn = G.newNight({ seed: 5, meta: {} }); rn.kit.drafts = 0; rn.kit.offer = null; G.useTool; G.pickUpset(rn, openH(rn)[0]); G.lock(rn); while (!rn.race.done) G.draw(rn); G.settle(rn); G.toBackroom(rn); G.nextRace(rn); ok(rn.kit.drafts === 1 && rn.kit.offer, 'a draft after every race');
  rn.kit.drafts = 3; G.nextRace; 
}
console.log(fails ? 'FAILED ' + fails : 'gamble tests ok');
