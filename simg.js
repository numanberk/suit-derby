// Gambler's Night balance: node simg.js [plain|rig|all] [nights]
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
function playNight(seed, policy, opt) {
  opt = opt || {};
  const run = G.newNight({ seed, meta: opt.meta || {}, races: opt.races || 5 });
  while (run.phase !== 'over') {
    if (run.phase === 'book') {
      G.setChip(run, opt.chip || 10);
      G.pickBest(run); G.lock(run);
    } else if (run.phase === 'race') {
      while (!run.race.done) {
        if (policy === 'rig') rigStep(run, opt);
        G.draw(run);
      }
      G.settle(run);
    } else if (run.phase === 'result') G.toBackroom(run);
    else if (run.phase === 'back') {
      if (opt.favors) { const b = run.back; if (b.offers.length) G.buyFavor(run, b.offers[0]); }
      G.nextRace(run);
    }
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
        // after a deck tool the first card is (roughly) known: stack puts suit a on top
        const fixed = id === 'stack' ? 1 : (id === 'swap' ? 2 : 0);
        const v = evalFixed(c, fixed, EV_SIMS) - base - ts.cost - ts.heat * (opt.heatPen == null ? 3 : opt.heatPen);
        if (!best || v > best.v) best = { id, a, v };
      }
    }
    if (!best || best.v < (opt.min == null ? 4 : opt.min)) return;
    G.useTool(run, best.id, best.a);
    if (r.caught) return;
  }
}
function report(name, runs) {
  const n = runs.length, roi = runs.reduce((a, r) => a + r.over.profit, 0) / n;
  const st = runs.reduce((a, r) => a + r.results.reduce((x, y) => x + y.stakes, 0), 0) / n;
  const hit = runs.reduce((a, r) => a + r.stats.hits, 0) / n, per = runs.reduce((a, r) => a + r.stats.perfects, 0) / n, cg = runs.reduce((a, r) => a + r.stats.caught, 0) / n, tl = runs.reduce((a, r) => a + r.stats.tools, 0) / n;
  const rp = runs.reduce((a, r) => a + r.over.rp, 0) / n, ins = runs.reduce((a, r) => a + r.stats.inspections, 0) / n;
  console.log(name.padEnd(24), 'profit', roi.toFixed(1).padStart(7), 'staked', st.toFixed(0), 'ROI', (roi / st * 100).toFixed(1) + '%', '| hits', hit.toFixed(1), 'perfect', per.toFixed(2), 'caught', cg.toFixed(2), 'insp', ins.toFixed(2), 'tools', tl.toFixed(1), 'RP', rp.toFixed(1), 'broke', (runs.filter(r => r.over.final <= 0).length / n * 100).toFixed(0) + '%');
}
const arr = (f) => Array.from({ length: N }, (_, i) => f(1000 + i));
if (process.argv[4]) G.CFG.perfectK = +process.argv[4];
if (mode === 'plain' || mode === 'all') report('plain (modal order)', arr(s => playNight(s, 'plain')));
if (mode === 'rig' || mode === 'all') { report('rig, heat<=6', arr(s => playNight(s, 'rig'))); }
if (mode === 'rigmax') { for (const mh of [4, 6, 8]) report('rig heat<=' + mh, arr(s => playNight(s, 'rig', { maxHeat: mh }))); }
if (mode === 'ceil') { for (const [mh, mn, hp] of [[10, 1, 0], [8, 1, 1], [6, 2, 2]]) report('rig heat<=' + mh + ' min' + mn + ' pen' + hp, arr(s => playNight(s, 'rig', { maxHeat: mh, min: mn, heatPen: hp }))); }
