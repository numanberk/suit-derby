// Gambler's Night balance (v15, the Upset game): node simg.js [weak|value|weakrig|valuerig|hedge|all] [nights]
//   weak       backs the longest shot to win, no tricks                       (a reckless player)
//   value      backs the candidate whose true chance beats its price best, no tricks   (reads the deck perfectly)
//   weakrig    longest shot + careful rigging (heat <= 6)
//   valuerig   best-value candidate + careful rigging (heat <= 6)
//   hedge      valuerig + one cover place on the board's favorite
const G = require('./src/gamble.js');
const mode = process.argv[2] || 'all', N = +process.argv[3] || 100;
function clone(run) { return G.unpack(G.pack(run)); }
/* expected payout of the upset (and the cover bets) if the first `fixed` cards of the deck are known and the rest is random */
function evalFixed(run, fixed, sims) {
  const r = run.race, rng = G.mulberry32(run.seed ^ (r.draws * 7919) ^ r.deck.length);
  const all = G.remainingCodes(r), top = all.slice(0, fixed), rest = all.slice(fixed);
  const P = [0, 1, 2, 3].map(() => [0, 0, 0, 0]);
  for (let i = 0; i < sims; i++) {
    const o = G.simulate(r.prog, r.lane, rest, G.CFG.track, rng, r.finished, top, r.kit ? { U: r.kit.U, K: G.kitParams(r.kit.ids), ks: r.kit.ks, draws: r.draws } : null);
    for (let pl = 0; pl < 4; pl++) P[o[pl]][pl]++;
  }
  let e = r.upset ? P[r.upset.h][0] / sims * r.upset.stake * r.upset.odds : 0;
  r.slip.forEach((s, pl) => { if (s) e += P[s.h][pl] / sims * s.stake * s.odds; });
  return e;
}
/* draft: take the offered trait (and slot) that lifts the best candidate's chance of winning the most; 'none' skips the kit */
function draftKit(run, o) {
  if (o.nokit) return;
  const kit = G.kitOf(run);
  for (let guard = 0; guard < 4 && kit.drafts > 0; guard++) {
    G.ensureOffer(run); if (!kit.offer) return;
    const cand = G.upsetBoard(run).filter(x => x.open).map(x => x.h);
    const score = ids => Math.max.apply(null, cand.map(h => { const row = G.upsetBoard(run)[h]; return G.kitWin(run, h, ids) * row.odds; }));
    let best = null;
    for (const id of kit.offer) {
      const slots = G.kitSlots(run);
      if (kit.ids.length < slots) { const v = score(kit.ids.concat(id)); if (!best || v > best.v) best = { id, slot: -1, v }; }
      else for (let s = 0; s < kit.ids.length; s++) { const ids = kit.ids.slice(); ids[s] = id; const v = score(ids); if (!best || v > best.v) best = { id, slot: s, v }; }
    }
    const cur = kit.ids.length ? score(kit.ids) : 0;
    if (kit.rerolls > 0 && best.v < cur * 1.15 && G.rerollOffer(run)) continue;
    if (kit.ids.length >= G.kitSlots(run) && best.v <= cur) { kit.drafts--; kit.offer = null; G.ensureOffer(run); continue; }
    G.takeTrait(run, best.id, best.slot);
  }
}
function chooseUpset(run, how) {
  const rows = G.upsetBoard(run).filter(x => x.open);
  let pick;
  if (how === 'weak') pick = rows.slice().sort((a, b) => a.p - b.p)[0];
  else pick = rows.slice().sort((a, b) => (b.kit * b.odds) - (a.kit * a.odds))[0];
  return G.pickUpset(run, pick.h);
}
function playNight(seed, o) {
  o = o || {};
  const run = G.newNight({ seed, meta: o.meta || {}, races: o.races || 5 });
  while (run.phase !== 'over') {
    if (run.phase === 'book') {
      G.setChip(run, o.chip || 10);
      draftKit(run, o);
      chooseUpset(run, o.pick);
      if (o.hedge) G.pickFavorite(run);
      if (!G.lock(run)) { G.walkOut(run); }
    } else if (run.phase === 'race') {
      while (!run.race.done) {
        if (o.rig) rigStep(run, o);
        G.draw(run);
      }
      G.settle(run);
    } else if (run.phase === 'result') G.toBackroom(run);
    else if (run.phase === 'back') G.nextRace(run);
  }
  return run;
}
const EV_SIMS = 220;
function rigStep(run, opt) {
  const r = run.race;
  if (r.caught) return;
  const maxHeat = +(process.env.MAXHEAT || (opt.maxHeat == null ? 6 : opt.maxHeat));
  for (let guard = 0; guard < 4; guard++) {
    const base = evalFixed(run, r.pk, EV_SIMS);
    let best = null;
    for (const id of G.TOOL_ORDER) {
      const ts = G.toolState(run, id); if (!ts.ok || id === 'peek') continue;
      if (run.heat + ts.heat > maxHeat) continue;
      const args = G.TOOLS[id].target ? [0, 1, 2, 3] : [null];
      for (const a of args) {
        const c = clone(run); const res = G.useTool(c, id, a); if (!res.ok) continue;
        const fixed = id === 'stack' ? 1 : (id === 'swap' ? 2 : 0);
        const v = evalFixed(c, fixed, EV_SIMS) - base - ts.cost - ts.heat * (opt.heatPen == null ? 3 : opt.heatPen);
        if (!best || v > best.v) best = { id, a, v };
      }
    }
    if (!best || best.v < +(process.env.MIN2 || (opt.min2 == null ? 4 : opt.min2))) return;
    G.useTool(run, best.id, best.a);
    if (r.caught) return;
  }
}
function report(name, runs) {
  const n = runs.length, roi = runs.reduce((a, r) => a + r.over.profit, 0) / n;
  const st = runs.reduce((a, r) => a + r.results.reduce((x, y) => x + y.stakes, 0), 0) / n;
  const races = n * runs[0].races, ups = runs.reduce((a, r) => a + (r.stats.upsets || 0), 0), big = runs.reduce((a, r) => a + (r.stats.bigUpsets || 0), 0);
  const cg = runs.reduce((a, r) => a + r.stats.caught, 0) / n, tl = runs.reduce((a, r) => a + r.stats.tools, 0) / n, ins = runs.reduce((a, r) => a + r.stats.inspections, 0) / n;
  const rp = runs.reduce((a, r) => a + r.over.rp, 0) / n, spent = runs.reduce((a, r) => a + r.results.reduce((x, y) => x + y.spent, 0), 0) / n;
  const q = {}; runs.forEach(r => r.results.forEach(x => { const k = x.quirk; q[k] = q[k] || { net: 0, st: 0 }; q[k].net += x.net; q[k].st += x.stakes; }));
  const neg = runs.filter(r => r.over.profit < 0).length / n;
  console.log(name.padEnd(14), 'profit', roi.toFixed(1).padStart(7), 'staked', st.toFixed(0), 'ROI', (roi / st * 100).toFixed(1) + '%', '| upsets', (ups / races * 100).toFixed(0) + '%', 'big', (big / races * 100).toFixed(0) + '%', 'caught', cg.toFixed(2), 'insp', ins.toFixed(2), 'tools', tl.toFixed(1), 'toolcash', spent.toFixed(0), 'RP', rp.toFixed(0), 'losing nights', (neg * 100).toFixed(0) + '%');
  console.log(' '.repeat(14), 'ROI by quirk', Object.keys(q).sort().map(k => k + ' ' + (q[k].net / Math.max(1, q[k].st) * 100).toFixed(0) + '%').join('  '));
}
const arr = (f) => Array.from({ length: N }, (_, i) => f(1000 + i));
if (mode === 'nokit' || mode === 'all') report('value, no kit', arr(s => playNight(s, { pick: 'value', nokit: true })));
if (mode === 'weak' || mode === 'all') report('weak', arr(s => playNight(s, { pick: 'weak' })));
if (mode === 'value' || mode === 'all') report('value', arr(s => playNight(s, { pick: 'value' })));
if (mode === 'weakrig' || mode === 'all') report('weak + rig', arr(s => playNight(s, { pick: 'weak', rig: true })));
if (mode === 'valuerig' || mode === 'all') report('value + rig', arr(s => playNight(s, { pick: 'value', rig: true })));
if (mode === 'hedge') report('value+rig+hedge', arr(s => playNight(s, { pick: 'value', rig: true, hedge: true })));
