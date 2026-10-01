/* Gambler's Night: a second game mode. You are not an owner. You are a gambler at the track: call the finishing
   order of all four horses, then nudge the deck and the track towards your call without getting caught.
   Time is card draws: every card drawn moves one horse; there is no clock. Pure JS, no DOM, testable in Node. */
const Gamble = (() => {
  const SUITS = [
    { id: 'hearts', name: 'Hearts', glyph: '♥' }, { id: 'diamonds', name: 'Diamonds', glyph: '♦' },
    { id: 'clubs', name: 'Clubs', glyph: '♣' }, { id: 'spades', name: 'Spades', glyph: '♠' }
  ];
  const CFG = {
    track: 10,            // steps to the line
    night: 5, nightLong: 8,
    startCash: 300,
    edge: 0.88,           // the book keeps 10%
    minOdds: 1.15, maxOdds: 30,
    mc: 480,              // simulations behind every quote
    chips: [5, 10, 25, 50, 100],
    perfectK: 0.06, perfectMin: 0.75, perfectMax: 30,   // a perfect order pays total stake x clamp(K / its chance): long shots pay big
    recallFee: 0.2,       // of the stake of the place you change
    heatMax: 10, warnHeat: 5,
    coolDraw: 0.06, coolRace: 1.5,
    fineBase: 15, fineHeat: 3, dqFine: 40,
    effectLen: 3,         // draws a mud / tailwind lasts for the horse
    inspectPer: 0.12,     // chance per heat point above 4
    loan: 100, loanOwe: 130, coolPrice: 25, coolAmt: 3, favorOffers: 3
  };

  /* ---------- tools ---------- */
  const TOOLS = {
    peek:   { kind: 'read',  name: 'Peek',      blurb: 'Look at the next card before it is drawn. The book does not know it.', cost: 6,  heat: 0, uses: 3, target: null,    open: true },
    burn:   { kind: 'deck',  name: 'Burn',      blurb: 'Throw the next card away. Nobody moves.',                               cost: 12, heat: 2, uses: 2, target: null,    open: true },
    stack:  { kind: 'deck',  name: 'Stack',     blurb: 'Pull the nearest card of a suit to the top of the deck.',               cost: 28, heat: 3, uses: 2, target: 'suit',  open: true },
    mud:    { kind: 'track', name: 'Mud',       blurb: 'Soak a lane: the horse loses 1 step on its next 3 cards.',              cost: 20, heat: 3, uses: 2, target: 'horse', open: true },
    swap:   { kind: 'deck',  name: 'Swap',      blurb: 'Swap the top two cards of the deck.',                                   cost: 10, heat: 2, uses: 2, target: null },
    wind:   { kind: 'track', name: 'Tailwind',  blurb: 'A gust behind a horse: +1 step on its next 3 cards.',                   cost: 20, heat: 3, uses: 2, target: 'horse' },
    shave:  { kind: 'deck',  name: 'Shave',     blurb: 'Quietly remove one plain card of a suit from the deck for good.',       cost: 22, heat: 3, uses: 1, target: 'suit' },
    hurdle: { kind: 'track', name: 'Hurdle',    blurb: 'Drop a hurdle: the horse wastes its next card.',                        cost: 32, heat: 4, uses: 1, target: 'horse' },
    riffle: { kind: 'deck',  name: 'Riffle',    blurb: 'Reshuffle the whole deck. Good when the cards are running against you.', cost: 30, heat: 4, uses: 1, target: null },
    lane:   { kind: 'track', name: 'Lane Swap', blurb: 'The horse trades places with the one just ahead of it. Once a night.',  cost: 70, heat: 6, uses: 1, target: 'horse', night: 1 }
  };
  const TOOL_ORDER = ['peek', 'burn', 'stack', 'mud', 'swap', 'wind', 'shave', 'hurdle', 'riffle', 'lane'];

  /* ---------- backroom favors: bought between races, they last the night ---------- */
  const FAVORS = [
    { id: 'discount', name: 'Tool Discount', blurb: 'Every tool costs 20% less.', price: 40, fx: { disc: 0.2 } },
    { id: 'ice', name: 'Ice Bucket', blurb: 'Heat cools twice as fast.', price: 35, fx: { cool: 1 } },
    { id: 'lookout', name: 'Lookout', blurb: 'The stewards spot you 30% less often.', price: 45, fx: { watch: 0.3 } },
    { id: 'longview', name: 'Binoculars', blurb: 'Peek shows one more card.', price: 40, fx: { peekN: 1 } },
    { id: 'bookie', name: 'Friendly Bookie', blurb: 'Better odds: the book keeps 4% less.', price: 55, fx: { edge: 0.04 } },
    { id: 'jackpot', name: 'High Roller Table', blurb: 'A perfect order pays 1 more times the stake.', price: 50, fx: { perfectPlus: 1 } },
    { id: 'cheapcall', name: 'Late Money', blurb: 'Re-calls cost half as much.', price: 30, fx: { recallMul: 0.5 } },
    { id: 'toolbelt', name: 'Bigger Toolbelt', blurb: 'One more use of every tool each race.', price: 70, fx: { extraUse: 1 } },
    { id: 'palm', name: 'Greased Palm', blurb: 'The first tool you use each race adds no Heat.', price: 45, fx: { greased: 1 } },
    { id: 'tipoff', name: 'Tip-off', blurb: 'The top card of every deck is shown before you call.', price: 50, fx: { tip: 1 } },
    { id: 'safety', name: 'Safety Net', blurb: 'If no place of yours hits, get 30% of your stakes back.', price: 40, fx: { insure: 0.3 } },
    { id: 'lawyer', name: 'Good Lawyer', blurb: 'Fines are 40% smaller.', price: 35, fx: { fineMul: -0.4 } }
  ];
  const favorById = id => FAVORS.find(f => f.id === id);

  /* ---------- the rng (one number of state, so a night can be saved exactly) ---------- */
  function mulberry32(a) {
    const f = function () {
      a |= 0; a = (a + 0x6D2B79F5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
    f.state = () => a | 0;
    return f;
  }
  function shuffle(arr, rng) { for (let i = arr.length - 1; i > 0; i--) { const j = Math.floor(rng() * (i + 1)); const t = arr[i]; arr[i] = arr[j]; arr[j] = t; } return arr; }
  const stepOf = c => (c.r >= 11 ? 2 : 1);
  const label = c => ({ 11: 'J', 12: 'Q', 13: 'K' })[c.r] || String(c.r);

  /* ---------- effects: the base (Reputation tree) plus favors bought this night ---------- */
  function combine(base, favors) {
    const fx = Object.assign({ disc: 0, cool: 0, watch: 0, peekN: 1, edge: 0, perfectPlus: 0, recallMul: 1, extraUse: 0, greased: 0, tip: 0, insure: 0, fineMul: 0, heatCap: 0, tools: ['peek', 'burn', 'stack', 'mud'], chips: [5, 10, 25, 50], startCash: CFG.startCash, loanOwe: CFG.loanOwe, offers: CFG.favorOffers, alibi: 0 }, base || {});
    fx.tools = (fx.tools || []).slice();
    (favors || []).forEach(id => {
      const f = favorById(id); if (!f) return;
      Object.keys(f.fx).forEach(k => { if (k === 'recallMul') fx.recallMul *= f.fx[k]; else fx[k] = (fx[k] || 0) + f.fx[k]; });
    });
    return fx;
  }
  const heatCap = run => CFG.heatMax + (run.fx.heatCap || 0);
  const edgeOf = run => Math.min(0.99, CFG.edge + (run.fx.edge || 0));
  const toolOpen = (run, id) => run.fx.tools.indexOf(id) >= 0;
  const toolCost = (run, id) => Math.max(1, Math.round(TOOLS[id].cost * (1 - Math.min(0.7, run.fx.disc))));
  const toolMax = (run, id) => TOOLS[id].uses + (run.fx.extraUse || 0);

  /* ---------- a race ---------- */
  function makeRace(run) {
    const rng = run.rng, comp = [], deck = [];
    for (let s = 0; s < 4; s++) {
      const n = 8 + Math.floor(rng() * 4), f = 1 + Math.floor(rng() * 2);
      comp.push({ n, f });
      for (let k = 0; k < n; k++) deck.push({ s, r: 2 + Math.floor(rng() * 9) });
      for (let k = 0; k < f; k++) deck.push({ s, r: 11 + Math.floor(rng() * 3) });
    }
    shuffle(deck, rng);
    return {
      deck, comp, prog: [0, 0, 0, 0], reach: [0, 0, 0, 0], finished: [], draws: 0, order: null, done: false,
      lane: [0, 1, 2, 3].map(() => ({ mud: 0, wind: 0, hurdle: false })),
      uses: {}, slip: [null, null, null, null], locked: false, pk: 0, tampered: false, caught: false, confiscated: {},
      spent: 0, fees: 0, fines: 0, last: null, firstTool: true, events: []
    };
  }
  function newNight(o) {
    o = o || {};
    const seed = o.seed == null ? (Math.random() * 4294967296) >>> 0 : o.seed;
    const base = o.meta || {};
    const run = {
      v: 1, seed, rng: mulberry32(seed), base, favors: [], fx: null, phase: 'book', races: o.races || CFG.night, raceNo: 1,
      cash: 0, debt: 0, startCash: 0, heat: 0, chip: 10, race: null, nightUses: {}, back: null, loans: 0,
      stats: { hits: 0, perfects: 0, races: 0, tools: 0, caught: 0, inspections: 0, bestNet: 0, spent: 0 }, results: [], result: null, over: null
    };
    run.fx = combine(base, run.favors);
    run.cash = run.startCash = run.fx.startCash;
    run.chip = run.fx.chips.indexOf(10) >= 0 ? 10 : run.fx.chips[0];
    run.race = makeRace(run);
    if (run.fx.tip) run.race.pk = 1;
    return run;
  }
  function pack(run) { const o = JSON.parse(JSON.stringify(run, (k, v) => (k === '_q' ? undefined : v))); o.rngState = run.rng.state(); return o; }
  function unpack(o) { const run = JSON.parse(JSON.stringify(o)); run.rng = mulberry32(o.rngState); return run; }

  /* ---------- odds: the book simulates the rest of the deck in random order ---------- */
  function remainingCodes(race) { return race.deck.map(c => c.s * 2 + (stepOf(c) - 1)); }
  function simulate(prog, lane, codes, track, rng, finished, top) {
    const p = prog.slice(), mud = lane.map(l => l.mud), wind = lane.map(l => l.wind), hur = lane.map(l => l.hurdle);
    const fin = finished.slice(), seen = [false, false, false, false];
    fin.forEach(h => { seen[h] = true; });
    let d = codes.slice();
    for (let i = d.length - 1; i > 0; i--) { const j = Math.floor(rng() * (i + 1)); const t = d[i]; d[i] = d[j]; d[j] = t; }
    if (top && top.length) d = top.concat(d);
    const n = d.length;
    for (let i = 0; i < n && fin.length < 3; i++) {
      const s = d[i] >> 1; let st = (d[i] & 1) + 1;
      if (hur[s]) { st = 0; hur[s] = false; } else { if (mud[s] > 0) { st = Math.max(0, st - 1); mud[s]--; } if (wind[s] > 0) { st++; wind[s]--; } }
      p[s] += st;
      if (!seen[s] && p[s] >= track) { seen[s] = true; fin.push(s); }
    }
    const rest = [0, 1, 2, 3].filter(h => !seen[h]).sort((a, b) => p[b] - p[a] || a - b);
    return fin.concat(rest);
  }
  /* returns { P[h][pl], orders: Map(code -> count), n } for the current state of the race */
  function quote(run) {
    const r = run.race;
    const key = r.prog.join(',') + '|' + r.lane.map(l => l.mud + ':' + l.wind + ':' + (l.hurdle ? 1 : 0)).join(',') + '|' + r.deck.length + '|' + remainingCodes(r).reduce((a, c) => a + c, 0) + '|' + r.finished.join('');
    if (run._q && run._q.key === key) return run._q.q;
    const rng = mulberry32((run.seed ^ Math.imul(run.raceNo, 2654435761) ^ Math.imul(r.draws + 1, 40503) ^ (r.deck.length * 977)) >>> 0);
    const codes = remainingCodes(r), P = [0, 1, 2, 3].map(() => [0, 0, 0, 0]), orders = {};
    const N = CFG.mc;
    for (let i = 0; i < N; i++) {
      const o = simulate(r.prog, r.lane, codes, CFG.track, rng, r.finished);
      for (let pl = 0; pl < 4; pl++) P[o[pl]][pl]++;
      const k = o.join(''); orders[k] = (orders[k] || 0) + 1;
    }
    for (let h = 0; h < 4; h++) for (let pl = 0; pl < 4; pl++) P[h][pl] /= N;
    const q = { P, orders, n: N };
    run._q = { key, q };
    return q;
  }
  function oddsFor(run, p) {
    if (p <= 0.0005) return CFG.maxOdds;
    return Math.round(Math.max(CFG.minOdds, Math.min(CFG.maxOdds, edgeOf(run) / p)) * 100) / 100;
  }
  function board(run) { const q = quote(run); return q.P.map(row => row.map(p => ({ p, odds: oddsFor(run, p) }))); }
  /* chance that a whole order comes in, e.g. [2,0,1,3] = horse 2 first, 0 second ... */
  function orderChance(run, order) { const q = quote(run); return (q.orders[order.join('')] || 0) / q.n; }
  /* what a complete, correct order would pay on top, as a multiple of the total stake */
  function perfectMult(run, order) {
    const p = Math.max(0.004, orderChance(run, order));
    return Math.round((Math.max(CFG.perfectMin, Math.min(CFG.perfectMax, CFG.perfectK / p)) + (run.fx.perfectPlus || 0)) * 100) / 100;
  }
  /* the most likely complete order right now */
  function bestOrder(run) { const q = quote(run); let b = null, c = -1; for (const k in q.orders) if (q.orders[k] > c) { c = q.orders[k]; b = k.split('').map(Number); } return b; }

  /* ---------- the slip ---------- */
  const staked = run => run.race.slip.reduce((a, b) => a + (b ? b.stake : 0), 0);
  function setChip(run, v) { if (run.fx.chips.indexOf(v) < 0 || run.race.locked) return false; run.chip = v; return true; }
  /* before the lock: choose a horse for a place (a horse can only hold one place); the same pick again clears it */
  function pick(run, pl, h) {
    const r = run.race; if (run.phase !== 'book' || r.locked) return false;
    if (r.slip[pl] && r.slip[pl].h === h) { r.slip[pl] = null; return true; }
    for (let i = 0; i < 4; i++) if (r.slip[i] && r.slip[i].h === h) r.slip[i] = null;
    r.slip[pl] = { h, stake: run.chip, odds: 0 };
    return true;
  }
  function pickBest(run) { const o = bestOrder(run); o.forEach((h, pl) => { run.race.slip[pl] = { h, stake: run.chip, odds: 0 }; }); }
  function canLock(run) { const r = run.race; const n = r.slip.filter(Boolean).length; return run.phase === 'book' && !r.locked && n > 0 && n * run.chip <= run.cash; }
  function lock(run) {
    if (!canLock(run)) return false;
    const r = run.race, b = board(run);
    r.slip.forEach((s, pl) => { if (s) { s.stake = run.chip; s.odds = b[s.h][pl].odds; run.cash -= s.stake; } });
    r.pmult = r.slip.every(Boolean) ? perfectMult(run, r.slip.map(s => s.h)) : 0;
    r.locked = true; run.phase = 'race';
    return true;
  }
  const recallFee = (run, pl) => { const s = run.race.slip[pl]; return s ? Math.max(1, Math.round(s.stake * CFG.recallFee * run.fx.recallMul)) : 0; };
  /* during the race: change the horse you have on a place, for a fee, at the odds of this moment */
  function canRecall(run, pl, h) {
    const r = run.race, s = r.slip[pl];
    if (run.phase !== 'race' || r.done || r.caught || !s) return false;
    if (r.finished.length > pl) return false;                     // that place is already decided
    if (s.h === h || r.finished.indexOf(h) >= 0) return false;      // a horse that has crossed holds its place
    return true;
  }
  function recall(run, pl, h) {
    if (!canRecall(run, pl, h)) return false;
    const r = run.race, s = r.slip[pl];
    // a horse already holding another unsettled place trades places with this one: both pay a fee
    const other = r.slip.findIndex((x, i) => x && i !== pl && x.h === h);
    let fee = recallFee(run, pl);
    if (other >= 0) {
      if (r.finished.length > other) return false;
      fee += recallFee(run, other);
    }
    if (run.cash < fee) return false;
    run.cash -= fee; r.fees += fee;
    const b = board(run);
    if (other >= 0) { const o = r.slip[other]; o.h = s.h; o.odds = b[o.h][other].odds; }
    s.h = h; s.odds = b[h][pl].odds;
    r._recalled = true;
    return true;
  }

  /* ---------- drawing a card: the only way time passes ---------- */
  function draw(run) {
    const r = run.race;
    if (run.phase !== 'race' || r.done) return null;
    const card = r.deck.shift(), s = card.s, ln = r.lane[s];
    let st = stepOf(card), note = null;
    if (ln.hurdle) { st = 0; ln.hurdle = false; note = 'hurdle'; }
    else {
      if (ln.mud > 0) { st = Math.max(0, st - 1); ln.mud--; note = 'mud'; }
      if (ln.wind > 0) { st++; ln.wind--; note = note ? 'both' : 'wind'; }
    }
    r.draws++;
    r.pk = Math.max(0, r.pk - 1);
    const before = r.prog[s];
    r.prog[s] += st;
    const ev = { card, horse: s, steps: st, note, from: before, to: r.prog[s], place: null, done: false, cooled: 0 };
    if (r.finished.indexOf(s) < 0 && r.prog[s] >= CFG.track) { r.finished.push(s); ev.place = r.finished.length; }
    if (st > 0) r.reach[s] = r.draws;
    if (!r.tampered) { const c = CFG.coolDraw * (1 + run.fx.cool); const h0 = run.heat; run.heat = Math.max(0, run.heat - c); ev.cooled = h0 - run.heat; }
    r.tampered = false; r._recalled = false;
    r.last = { s, st, r: card.r };
    if (r.finished.length >= 3 || r.deck.length === 0) {
      const rest = [0, 1, 2, 3].filter(h => r.finished.indexOf(h) < 0).sort((a, b) => r.prog[b] - r.prog[a] || r.reach[a] - r.reach[b] || a - b);
      r.order = r.finished.concat(rest); r.done = true; ev.done = true;
    }
    return ev;
  }

  /* ---------- tools ---------- */
  function toolState(run, id) {
    const T = TOOLS[id], r = run.race, left = toolMax(run, id) - (r.uses[id] || 0);
    let why = null;
    if (!toolOpen(run, id)) why = 'locked';
    else if (r.caught) why = 'caught';
    else if (r.confiscated[id]) why = 'confiscated';
    else if (!(run.phase === 'race' || (run.phase === 'book' && id === 'peek'))) why = 'phase';
    else if (r.done) why = 'phase';
    else if (left <= 0) why = 'uses';
    else if (T.night && (run.nightUses[id] || 0) >= T.night) why = 'night';
    else if (run.cash < toolCost(run, id)) why = 'cash';
    else if (id === 'peek' && r.deck.length === 0) why = 'empty';
    return { id, cost: toolCost(run, id), heat: heatOf(run, id), left, max: toolMax(run, id), ok: !why, why };
  }
  function heatOf(run, id) {
    const h = TOOLS[id].heat;
    return run.race.firstTool && run.fx.greased && h > 0 ? 0 : h;
  }
  function inspectChance(run) {
    if (run.heat < CFG.warnHeat) return 0;
    return Math.max(0, Math.min(0.85, (run.heat - 4) * CFG.inspectPer * (1 - Math.min(0.9, run.fx.watch))));
  }
  function addFine(run, amt) {
    amt = Math.max(1, Math.round(amt * (1 + (run.fx.fineMul || 0))));
    run.race.fines += amt; run.cash -= amt;
    if (run.cash < 0) { run.debt += -run.cash; run.cash = 0; }
    return amt;
  }
  /* returns { ok, why, events:[...] }. arg: suit index or horse index for tools that need a target */
  function useTool(run, id, arg) {
    const T = TOOLS[id], r = run.race, ts = toolState(run, id), ev = [];
    if (!T || !ts.ok) return { ok: false, why: ts.why, events: ev };
    if (T.target && !(arg >= 0 && arg < 4)) return { ok: false, why: 'target', events: ev };
    // effect
    let msg = null;
    if (id === 'peek') { r.pk = Math.min(r.deck.length, Math.max(r.pk, run.fx.peekN)); }
    else if (id === 'burn') { r.burned = (r.burned || 0) + 1; r.deck.shift(); r.pk = 0; }
    else if (id === 'swap') { if (r.deck.length < 2 || r.deck[0].s === r.deck[1].s) return { ok: false, why: 'same', events: ev }; const t = r.deck[0]; r.deck[0] = r.deck[1]; r.deck[1] = t; r.pk = 0; }
    else if (id === 'stack') { const i = r.deck.findIndex(c => c.s === arg); if (i < 0) return { ok: false, why: 'none', events: ev }; if (i === 0) return { ok: false, why: 'top', events: ev }; const c = r.deck.splice(i, 1)[0]; r.deck.unshift(c); r.pk = 0; }
    else if (id === 'shave') { const idx = []; r.deck.forEach((c, i) => { if (c.s === arg && c.r < 11) idx.push(i); }); if (!idx.length) return { ok: false, why: 'none', events: ev }; r.deck.splice(idx[Math.floor(run.rng() * idx.length)], 1); r.pk = 0; r.shaved = (r.shaved || 0) + 1; r.comp[arg].n--; }
    else if (id === 'riffle') { shuffle(r.deck, run.rng); r.pk = 0; }
    else if (id === 'mud') { r.lane[arg].mud += CFG.effectLen; }
    else if (id === 'wind') { r.lane[arg].wind += CFG.effectLen; }
    else if (id === 'hurdle') { if (r.finished.indexOf(arg) >= 0) return { ok: false, why: 'finished', events: ev }; r.lane[arg].hurdle = true; }
    else if (id === 'lane') {
      if (r.finished.indexOf(arg) >= 0) return { ok: false, why: 'finished', events: ev };
      const ahead = [0, 1, 2, 3].filter(h => h !== arg && r.finished.indexOf(h) < 0 && r.prog[h] > r.prog[arg]).sort((a, b) => r.prog[a] - r.prog[b])[0];
      if (ahead == null) return { ok: false, why: 'lead', events: ev };
      const t = r.prog[arg]; r.prog[arg] = r.prog[ahead]; r.prog[ahead] = t; msg = ahead;
    }
    // payment, heat, bookkeeping
    const cost = ts.cost, heat = ts.heat;
    run.cash -= cost; r.spent += cost; r.uses[id] = (r.uses[id] || 0) + 1; if (T.night) run.nightUses[id] = (run.nightUses[id] || 0) + 1;
    run.stats.tools++; run.stats.spent += cost;
    if (T.heat > 0) { r.firstTool = false; r.tampered = true; }
    run.heat = Math.min(heatCap(run), run.heat + heat);
    ev.push({ t: 'tool', id, arg, cost, heat, msg });
    // the stewards
    if (run.heat >= heatCap(run)) {
      r.caught = true; run.stats.caught++;
      const fine = addFine(run, CFG.dqFine);
      run.heat = Math.floor(heatCap(run) / 2);
      ev.push({ t: 'caught', fine, refund: 0 });
      if (run.fx.alibi) { let back = 0; r.slip.forEach(s => { if (s) back += Math.round(s.stake * 0.5); }); run.cash += back; r.alibi = back; ev[ev.length - 1].refund = back; }
    } else if (T.heat > 0 && run.heat >= CFG.warnHeat && run.rng() < inspectChance(run)) {
      run.stats.inspections++;
      const fine = addFine(run, CFG.fineBase + run.heat * CFG.fineHeat);
      r.confiscated[id] = true; run.heat = Math.max(0, run.heat - 2);
      ev.push({ t: 'inspect', fine, id });
    }
    return { ok: true, events: ev };
  }

  /* ---------- settle a finished race ---------- */
  function settle(run) {
    const r = run.race;
    if (!r.done || run.phase !== 'race') return null;
    const bets = [];
    let pay = 0, stakes = 0, hits = 0, all = true;
    for (let pl = 0; pl < 4; pl++) {
      const s = r.slip[pl];
      if (!s) { all = false; continue; }
      const hit = r.order[pl] === s.h;
      const p = hit && !r.caught ? Math.round(s.stake * s.odds) : 0;
      stakes += s.stake; pay += p; if (hit) hits++; else all = false;
      bets.push({ pl, h: s.h, stake: s.stake, odds: s.odds, hit, pay: p, actual: r.order[pl] });
    }
    const perfect = all && !r.caught && bets.length === 4;
    const bonus = perfect ? Math.round(stakes * r.pmult) : 0;
    const insured = !hits && !r.caught && run.fx.insure ? Math.round(stakes * run.fx.insure) : 0;
    run.cash += pay + bonus + insured;
    const net = pay + bonus + insured - stakes - r.fees - r.spent - r.fines + (r.alibi || 0);
    const res = { raceNo: run.raceNo, order: r.order.slice(), bets, pay, bonus, insured, stakes, fees: r.fees, spent: r.spent, fines: r.fines, alibi: r.alibi || 0, net, perfect, caught: r.caught, hits, draws: r.draws };
    run.result = res; run.results.push(res);
    run.stats.races++; run.stats.hits += hits; if (perfect) run.stats.perfects++; run.stats.bestNet = Math.max(run.stats.bestNet, net);
    run.phase = 'result';
    return res;
  }

  /* ---------- the backroom between races ---------- */
  function toBackroom(run) {
    if (run.phase !== 'result') return false;
    if (run.raceNo >= run.races) return finish(run);
    const pool = FAVORS.filter(f => run.favors.indexOf(f.id) < 0).map(f => f.id);
    shuffle(pool, run.rng);
    run.back = { offers: pool.slice(0, run.fx.offers), bought: false, cooled: 0, loaned: 0 };
    run.phase = 'back';
    return true;
  }
  const favorPrice = (run, id) => favorById(id).price;
  function buyFavor(run, id) {
    const b = run.back;
    if (run.phase !== 'back' || b.bought || b.offers.indexOf(id) < 0 || run.cash < favorPrice(run, id)) return false;
    run.cash -= favorPrice(run, id); run.favors.push(id); b.bought = true; run.fx = combine(run.base, run.favors);
    return true;
  }
  function coolOff(run) {
    if (run.phase !== 'back' || run.heat <= 0 || run.cash < CFG.coolPrice) return false;
    run.cash -= CFG.coolPrice; run.heat = Math.max(0, run.heat - CFG.coolAmt); run.back.cooled++;
    return true;
  }
  function canLoan(run) { return run.phase === 'back' && run.loans < 2; }
  function takeLoan(run) {
    if (!canLoan(run)) return false;
    run.cash += CFG.loan; run.debt += run.fx.loanOwe; run.loans++; run.back.loaned++;
    return true;
  }
  function nextRace(run) {
    if (run.phase !== 'back') return false;
    run.raceNo++; run.heat = Math.max(0, run.heat - CFG.coolRace * (1 + run.fx.cool));
    run.race = makeRace(run); run.back = null; run.result = null; run.phase = 'book';
    if (run.fx.tip) run.race.pk = 1;
    return true;
  }
  function finish(run) {
    const final = run.cash - run.debt, profit = final - run.startCash;
    const rp = Math.max(0, Math.round(profit / 10)) + run.stats.hits + run.stats.perfects * 6 + (profit > 0 ? 5 : 0);
    run.over = { final, profit, rp, hits: run.stats.hits, perfects: run.stats.perfects, caught: run.stats.caught };
    run.phase = 'over';
    return true;
  }
  /* leave the table early, between races */
  function walkOut(run) { if (run.phase !== 'book' || run.race.locked) return false; return finish(run); }
  /* a bot-friendly helper: expected payout of the locked slip in the current state (uses the quote's sims) */
  function expected(run) {
    const q = quote(run), r = run.race; let e = 0;
    r.slip.forEach((s, pl) => { if (s) e += q.P[s.h][pl] * s.stake * s.odds; });
    return e;
  }

  /* ---------- Reputation: the permanent skill tree of this mode (its own save, separate from the horse game) ---------- */
  const Meta = (() => {
    const BRANCHES = [
      { id: 'tools', name: 'Toolbox', a: -90, color: '#8fb8ee' },
      { id: 'nerve', name: 'Nerve', a: 0, color: '#ee8b6b' },
      { id: 'purse', name: 'Bankroll', a: 90, color: '#e9cf73' },
      { id: 'eye', name: 'The Book', a: 180, color: '#c79bf0' }
    ];
    const N = (id, br, name, blurb, costs, parents, a, r, extra) => Object.assign({ id, br, name, blurb, costs, parents, a, r }, extra || {});
    const NODES = [
      N('t_swap', 'tools', 'Swap', 'Unlocks the Swap tool: swap the top two cards.', [10], ['root'], -104, 1, { tool: 'swap' }),
      N('t_wind', 'tools', 'Tailwind', 'Unlocks the Tailwind tool: a horse gets +1 step on its next 3 cards.', [10], ['root'], -76, 1, { tool: 'wind' }),
      N('t_shave', 'tools', 'Shave', 'Unlocks the Shave tool: remove a plain card of a suit for good.', [18], ['t_swap'], -110, 2, { tool: 'shave' }),
      N('t_hurdle', 'tools', 'Hurdle', 'Unlocks the Hurdle tool: a horse wastes its next card.', [18], ['t_wind'], -70, 2, { tool: 'hurdle' }),
      N('t_riffle', 'tools', 'Riffle', 'Unlocks the Riffle tool: reshuffle the deck.', [25], ['t_shave'], -104, 3, { tool: 'riffle' }),
      N('t_lane', 'tools', 'Lane Swap', 'Unlocks Lane Swap: a horse trades places with the one just ahead. Once a night.', [35], ['t_hurdle'], -76, 3, { tool: 'lane' }),
      N('t_belt', 'tools', 'Deep Toolbox', 'One more use of every tool in every race.', [40, 70], ['t_riffle', 't_lane'], -90, 4),
      N('n_cool', 'nerve', 'Cool Head', 'Heat cools 25% faster.', [10, 18, 28], ['root'], -16, 1),
      N('n_skin', 'nerve', 'Thick Skin', 'You can carry 1 more Heat before you are caught.', [15, 28, 45], ['root'], 16, 1),
      N('n_watch', 'nerve', 'Friend on the Board', 'Stewards spot you 15% less often.', [18, 30, 45], ['n_cool'], -18, 2),
      N('n_law', 'nerve', 'Lawyer', 'Fines are 20% smaller.', [18, 32], ['n_skin'], 18, 2),
      N('n_palm', 'nerve', 'Greased Palm', 'The first tool you use in each race adds no Heat.', [30], ['n_watch', 'n_law'], 0, 3),
      N('n_alibi', 'nerve', 'Alibi', 'If you are caught, you get half of your stakes back.', [45], ['n_palm'], 0, 4),
      N('p_deep', 'purse', 'Deep Pockets', 'Start every night with $30 more.', [10, 16, 24, 34, 46], ['root'], 74, 1),
      N('p_chips', 'purse', 'High Stakes', 'Unlocks the $100 chip.', [14], ['root'], 106, 1),
      N('p_haggle', 'purse', 'Haggler', 'Every tool costs 5% less.', [14, 22, 32, 44], ['p_deep'], 74, 2),
      N('p_night', 'purse', 'Long Night', 'Lets you choose a night of 8 races.', [30], ['p_chips'], 106, 2),
      N('p_shark', 'purse', 'Shark’s Terms', 'A loan costs $10 less to pay back.', [20, 34], ['p_haggle'], 70, 3),
      N('p_safe', 'purse', 'Safety Net', 'If no place hits, 15% of your stakes come back.', [25, 40], ['p_night'], 110, 3),
      N('e_sharp', 'eye', 'Sharp Eye', 'Better odds: the book keeps 1% less.', [15, 25, 38, 52], ['root'], 164, 1),
      N('e_view', 'eye', 'Binoculars', 'Peek shows one more card.', [15, 28], ['root'], 196, 1),
      N('e_perf', 'eye', 'Perfect Pay', 'A perfect order pays half a stake more.', [20, 35], ['e_sharp'], 164, 2),
      N('e_net', 'eye', 'Backroom Network', 'One more favor on offer in the backroom.', [20, 35], ['e_view'], 196, 2),
      N('e_calls', 'eye', 'Late Money', 'Re-calls cost 25% less.', [25, 40], ['e_perf', 'e_net'], 180, 3),
      N('e_tip', 'eye', 'Tip-off', 'The top card of every deck is shown before you call.', [40], ['e_calls'], 180, 4)
    ];
    const ROOT = { id: 'root', name: 'The Book', costs: [], parents: [] };
    const nodeById = id => (id === 'root' ? ROOT : NODES.find(n => n.id === id));
    const KEY = 'suitderby.g1';
    const fresh = () => ({ sp: 0, levels: {}, nights: 0, best: -9999, v: 1 });
    const level = (st, id) => st.levels[id] || 0;
    const maxOf = n => n.costs.length;
    const owned = (st, id) => id === 'root' || level(st, id) > 0;
    const isOpen = (st, id) => { const n = nodeById(id); return !!n && n.parents.some(p => owned(st, p)); };
    const costOf = (st, id) => { const n = nodeById(id), l = level(st, id); return l >= maxOf(n) ? null : n.costs[l]; };
    const canBuy = (st, id) => { const c = costOf(st, id); return c != null && st.sp >= c && isOpen(st, id); };
    function buy(st, id) { if (!canBuy(st, id)) return false; st.sp -= costOf(st, id); st.levels[id] = level(st, id) + 1; return true; }
    function effects(st) {
      const L = id => level(st, id);
      const tools = ['peek', 'burn', 'stack', 'mud'].concat(NODES.filter(n => n.tool && owned(st, n.id)).map(n => n.tool));
      return {
        tools, chips: [5, 10, 25, 50].concat(L('p_chips') ? [100] : []), longNight: !!L('p_night'),
        startCash: CFG.startCash + 30 * L('p_deep'), disc: 0.05 * L('p_haggle'), cool: 0.25 * L('n_cool'), heatCap: L('n_skin'), watch: 0.15 * L('n_watch'),
        fineMul: -0.2 * L('n_law'), greased: L('n_palm') ? 1 : 0, alibi: L('n_alibi') ? 1 : 0, loanOwe: CFG.loanOwe - 10 * L('p_shark'), insure: 0.15 * L('p_safe'),
        edge: 0.01 * L('e_sharp'), peekN: 1 + L('e_view'), perfectPlus: 0.5 * L('e_perf'), offers: CFG.favorOffers + L('e_net'), recallMul: 1 - 0.25 * L('e_calls'), tip: L('e_tip') ? 1 : 0,
        extraUse: L('t_belt')
      };
    }
    function record(st, over) { st.sp += over.rp; st.nights++; st.best = Math.max(st.best, Math.round(over.profit)); }
    function load() {
      try { const o = JSON.parse(localStorage.getItem(KEY)); if (o && typeof o.sp === 'number') return Object.assign(fresh(), o, { levels: Object.assign({}, o.levels) }); } catch (e) {}
      return fresh();
    }
    function save(st) { try { localStorage.setItem(KEY, JSON.stringify(st)); } catch (e) {} }
    function reset() { const s = fresh(); save(s); return s; }
    return { BRANCHES, NODES, ROOT, nodeById, fresh, level, maxOf, owned, isOpen, costOf, canBuy, buy, effects, record, load, save, reset };
  })();

  return { Meta, SUITS, CFG, TOOLS, TOOL_ORDER, FAVORS, favorById, newNight, pack, unpack, mulberry32, combine, makeRace,
    quote, board, orderChance, perfectMult, bestOrder, oddsFor, staked, setChip, pick, pickBest, canLock, lock, recallFee, canRecall, recall, draw,
    toolState, toolCost, toolMax, heatCap, inspectChance, useTool, settle, toBackroom, buyFavor, coolOff, takeLoan, canLoan, nextRace, finish,
    expected, walkOut, stepOf, label, favorPrice, edgeOf, simulate, remainingCodes };
})();
if (typeof module !== 'undefined') module.exports = Gamble;
