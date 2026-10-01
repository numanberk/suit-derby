// v11 balance simulation: abilities, pit crews, jockeys.   node sim11.js [quick|jockeys|abilities|crews]
const E = require('./src/engine.js');
const M = require('./src/meta.js');
const PRIORITY = ['flush','takeover','jackpot','ticket','fake','joker','aces','court','stack','draft','sling','stride','wind','marked','retread','horseshoe','dice','chaos','sand','rich','interest','penny','spare','lens','insure','haggler','bookie','roller','coin','slam','sabotage','headstart','cut','double','slip','allin'];
const GADGETS = ['banana', 'cutg', 'draftg'], CARDS = ['wild', 'dupe', 'veto'];
function placeBets(run, stakeEach) {
  const used = new Set([run.me]);
  run.calls = [{ h: run.me, stake: stakeEach }, null, null, null];
  for (let pl = 1; pl < 4; pl++) {
    let best = -1, bp = -1;
    for (let h = 0; h < 4; h++) if (!used.has(h) && run.quote.p[h][pl] > bp) { bp = run.quote.p[h][pl]; best = h; }
    if (E.spendable(run) < stakeEach) break;
    used.add(best); run.calls[pl] = { h: best, stake: stakeEach };
  }
}
function shopGreedy(run, abil) {
  let guard = 0;
  const pr = abil ? GADGETS.concat(CARDS).concat(PRIORITY) : PRIORITY;
  while (guard++ < 40) {
    let best = null;
    run.shop.forEach((o, i) => {
      if (o.sold || !E.available(run, o.id) || E.priceOf(run, o.id) > E.spendable(run)) return;
      const p = pr.indexOf(o.id);
      if (!best || p < best.p) best = { i, p };
    });
    if (!best) break;
    E.buy(run, best.i);
  }
}
function useCrew(run, policy, abil) {
  const pick = policy === 'shop' ? 'shop' : policy === 'random' ? run.crews[Math.floor(run.rng() * 3)] : policy;
  const c = run.crews.includes(pick) ? pick : 'shop';
  E.chooseCrew(run, c);
  if (c === 'shop') shopGreedy(run, abil);
  else if (c === 'market') { for (let k = 0; k < 4; k++) for (let i = 0; i < run.market.length; i++) E.marketBuy(run, i); }
  else if (c === 'train') { for (let k = 0; k < 10; k++) for (const d of ['speed', 'lungs', 'jump', 'fit']) E.drill(run, d); }
  else if (c === 'den') { E.wheelSpin(run, 20); }
  else if (c === 'event') {
    const ev = E.eventBy(run.event.id); let done = false;
    for (const o of ev.opts) if (!done && (!o.ok || o.ok(run)) && E.spendable(run) >= o.cost) { E.eventChoose(run, o.id); done = true; }
    if (!done) E.eventChoose(run, 'walk');
  }
  return c;
}
function playRun({ laps, crew = 'shop', abil = true, jockey = 'rookie', unlocked = [], seed, me = 0, bet = 10, startPick = 'first', metaLevels = {} }) {
  E.CFG.quoteSims = 24;
  const meta = Object.assign(M.effects({ levels: metaLevels }), { unlocked });
  const run = E.newRun({ me, laps, meta, seed, jockey }); run.auto = true;
  const places = [], crews = {};
  if (run.startPicks) {
    let k = 0;
    if (startPick === 'ability') { const j = run.startPicks.findIndex(id => GADGETS.concat(CARDS).includes(id)); k = j < 0 ? 0 : j; }
    E.pickStart(run, k);
  }
  while (run.phase !== 'over') {
    if (bet) placeBets(run, bet); else run.calls = [null, null, null, null];
    E.startLap(run);
    const L = run.lap; let tick = 0;
    while (!L.done) {
      E.stepLap(run, 0.05); tick++;
      if (L.traps > 0 && tick % 60 === 30) E.trap(run);
      if (abil && tick % 10 === 0 && L.t > 4) {
        GADGETS.forEach(id => E.useGadget(run, id));
        CARDS.forEach(id => { if (run.hand.includes(id)) E.useCard(run, id); });
      }
    }
    const res = E.endLap(run);
    places.push(res.place);
    if (run.phase === 'shop') { const c = useCrew(run, crew, abil); crews[c] = (crews[c] || 0) + 1; }
  }
  return { run, places, crews };
}
function stats(label, opt, n = 80) {
  let champ = 0, pl = 0, lp = 0, sp = 0, earned = 0, cash = 0, gad = 0, crd = 0, fin = 0;
  const rk = [0, 0, 0, 0], cr = {};
  for (let i = 0; i < n; i++) {
    const { run, places, crews } = playRun({ ...opt, seed: 1000 + i, me: opt.me != null ? opt.me : i % 4 });
    const r = run.result;
    champ += r.champion; sp += r.sp; rk[r.rank - 1]++; earned += run.cashEarned; cash += run.cash; gad += r.stats.gadgets; crd += r.stats.cards;
    places.forEach(p => { pl += p; lp++; });
    Object.keys(crews).forEach(k => { cr[k] = (cr[k] || 0) + crews[k]; });
  }
  console.log(label.padEnd(34), 'champ', (champ / n).toFixed(2), 'lapPlace', (pl / lp).toFixed(2), 'SP', (sp / n).toFixed(1), 'earned$', (earned / n).toFixed(0), 'left$', (cash / n).toFixed(0), 'uses g/c', (gad / n).toFixed(1) + '/' + (crd / n).toFixed(1), '| ranks', rk.map(x => (x / n).toFixed(2)).join('/'));
  return champ / n;
}
const mode = process.argv[2] || 'quick';
const ALL = E.LOCKED, laps = 5;
if (mode === 'quick' || mode === 'all') {
  console.log('--- baseline (seats rotate), 5 laps, $10 call stakes');
  stats('fresh player: shop only', { laps, abil: true, unlocked: [] });
  stats('all unlocked: shop only', { laps, abil: true, unlocked: ALL });
  stats('all unlocked, no abilities used', { laps, abil: false, unlocked: ALL });
  stats('all unlocked: random crews', { laps, crew: 'random', abil: true, unlocked: ALL });
}
if (mode === 'crews' || mode === 'all') {
  console.log('--- every crew on its own (forced when offered, else shop)');
  ['shop', 'market', 'train', 'den', 'event'].forEach(c => stats('crew ' + c, { laps, crew: c, abil: true, unlocked: ALL }));
}
if (mode === 'jockeys' || mode === 'all') {
  console.log('--- jockeys (all unlocked, random crews)');
  E.JOCKEYS.forEach(j => stats('jockey ' + j.id, { laps, jockey: j.id, crew: 'random', abil: true, unlocked: ALL }, 160));
}
if (mode === 'abilities' || mode === 'all') {
  console.log('--- value of each ability: starting pick forced (grant), bot uses it');
  const base = stats('no ability', { laps, abil: true, unlocked: ALL, startPick: 'first' }, 200);
}
