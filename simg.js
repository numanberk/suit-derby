// Gambler's Night balance: node simg.js [auto|truth|value|valuerig|rig|all] [nights]
//   auto     follows the board: the book's likeliest order, no tools            (what a lazy player does)
//   truth    the true likeliest order, no tools                                  (needs the deck read perfectly)
//   value    backs only the cells and duels where the truth beats the book's price
//   valuerig value + careful rigging (heat <= 6)
const G = require('./src/gamble.js');
const mode = process.argv[2] || 'all', N = +process.argv[3] || 200;
function clone(run) { return G.unpack(G.pack(run)); }
/* expected payout of the slip if the first `fixed` cards of the deck are known and the rest is random */
function evalFixed(run, fixed, sims) {
  const r = run.race, rng = G.mulberry32(run.seed ^ (r.draws * 7919) ^ r.deck.length);
  const all = G.remainingCodes(r), top = all.slice(0, fixed), rest = all.slice(fixed);
  const P = [0, 1, 2, 3].map(() => [0, 0, 0, 0]);
  for (let i = 0; i < sims; i++) {
    const o = G.simulate(r.prog, r.lane, rest, G.CFG.track, rng, r.finished, top);
    for (let pl = 0; pl < 4; pl++) P[o[pl]][pl]++;
  }
  let e = 0; r.slip.forEach((s, pl) => { if (s) e += P[s.h][pl] / sims * s.stake * s.odds; });
  return e;
}
function playNight(seed, o) {
  o = o || {};
  const run = G.newNight({ seed, meta: o.meta || {}, races: o.races || 5 });
  while (run.phase !== 'over') {
    if (run.phase === 'book') {
      G.setChip(run, o.chip || 10);
      if (o.pick === 'value') G.pickValue(run, o.min == null ? 0.05 : o.min); else if (o.pick === 'truth') G.pickBest(run); else G.pickBook(run);
      if (!G.lock(run)) { run.race.slip = [null, null, null, null]; run.race.dbets = [null, null, null]; G.pickFavorite(run); if (!G.lock(run)) { G.walkOut(run); } }
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
  const maxHeat = opt.maxHeat == null ? 6 : opt.maxHeat;
  for (let guard = 0; guard < 3; guard++) {
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
    if (!best || best.v < (opt.min2 == null ? 4 : opt.min2)) return;
    G.useTool(run, best.id, best.a);
    if (r.caught) return;
  }
}
function report(name, runs) {
  const n = runs.length, roi = runs.reduce((a, r) => a + r.over.profit, 0) / n;
  const st = runs.reduce((a, r) => a + r.results.reduce((x, y) => x + y.stakes, 0), 0) / n;
  const hit = runs.reduce((a, r) => a + r.stats.hits, 0) / n, per = runs.reduce((a, r) => a + r.stats.perfects, 0) / n, cg = runs.reduce((a, r) => a + r.stats.caught, 0) / n, tl = runs.reduce((a, r) => a + r.stats.tools, 0) / n;
  const rp = runs.reduce((a, r) => a + r.over.rp, 0) / n, ins = runs.reduce((a, r) => a + r.stats.inspections, 0) / n, sh = runs.reduce((a, r) => a + (r.stats.sharp || 0), 0) / n;
  const q = {}; runs.forEach(r => r.results.forEach(x => { const k = x.quirk; q[k] = q[k] || { net: 0, st: 0 }; q[k].net += x.net; q[k].st += x.stakes; }));
  console.log(name.padEnd(22), 'profit', roi.toFixed(1).padStart(7), 'staked', st.toFixed(0), 'ROI', (roi / st * 100).toFixed(1) + '%', '| hits', hit.toFixed(1), 'perfect', per.toFixed(2), 'sharp', sh.toFixed(2), 'caught', cg.toFixed(2), 'insp', ins.toFixed(2), 'tools', tl.toFixed(1), 'RP', rp.toFixed(0));
  console.log(' '.repeat(22), 'ROI by quirk', Object.keys(q).sort().map(k => k + ' ' + (q[k].net / Math.max(1, q[k].st) * 100).toFixed(0) + '%').join('  '));
}
const arr = (f) => Array.from({ length: N }, (_, i) => f(1000 + i));
if (process.argv[4]) G.CFG.perfectK = +process.argv[4];
if (mode === 'auto' || mode === 'all') report('auto (board favorites)', arr(s => playNight(s, { pick: 'book' })));
if (mode === 'truth' || mode === 'all') report('truth (true modal)', arr(s => playNight(s, { pick: 'truth' })));
if (mode === 'value' || mode === 'all') { for (const m of [0.0, 0.05, 0.12]) report('value min ' + m, arr(s => playNight(s, { pick: 'value', min: m }))); }
if (mode === 'valuerig' || mode === 'all') report('value + rig, heat<=6', arr(s => playNight(s, { pick: 'value', min: 0.05, rig: true })));
if (mode === 'rig') report('truth + rig, heat<=6', arr(s => playNight(s, { pick: 'truth', rig: true })));
