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
    minOdds: 1.05, maxOdds: 12,
    mc: 480,              // simulations behind every quote
    chips: [5, 10, 25, 50, 100],
    perfectK: 0.06, perfectMin: 0.1, perfectMax: 30,   // a perfect order pays total stake x clamp(K / its chance): long shots pay big
    recallFee: 0.2,       // of the stake of the place you change
    heatMax: 10, warnHeat: 5,
    coolDraw: 0.06, coolRace: 1.5,
    fineBase: 15, fineHeat: 3, dqFine: 40,
    effectLen: 3,         // draws a mud / tailwind lasts for the horse
    inspectPer: 0.12,     // chance per heat point above 4
    loan: 100, loanOwe: 130, coolPrice: 25, coolAmt: 3, favorOffers: 3,
    minSteps: 10, stepSpan: 6, plainMin: 7, plainMax: 11, faceMax: 3,   // a suit is worth 10-15 steps in all (7-11 plain cards, 0-3 face cards worth 2 each): some decks are lopsided, none is hopeless
    quirkGamma: 1.25,     // "loves a favorite": the book raises every chance to this power, then renormalises
    midFlat: 0.55, stepsBlur: 0.8,         // "shrugs at the middle": 2nd and 3rd are pulled this far towards an even split
    hintMin: [0.08, 0.05],  // Bookie's Tell: how far (in chance) the book must be off before a cell is marked, by level
    duels: 3, duelMin: 1.05, // head-to-head offers per race, and their lowest price
    sharpOdds: 4, sharpRp: 2, // a place that hits at these odds or longer is a sharp call and pays extra Reputation
    upsetMax: 25,         // the upset call pays the book's price for the horse to WIN, up to this
    hedgeShare: 1,        // cover bets (places and head-to-heads) may add up to this many times the upset stake
    upsetRp: 3, bigUpset: 6, bigUpsetRp: 5   // Reputation for pulling an upset off, and extra when it paid this much or more
  };

  /* ---------- the book's quirk: every race, the book prices from a flawed view of the deck, and says so ---------- */
  const QUIRKS = {
    steps: { name: 'Counts cards, not steps', blurb: 'Tonight’s book counts cards, not steps. It underrates suits with extra face cards and overrates suits without.', w: 3 },
    fav:   { name: 'Loves a favorite', blurb: 'Tonight’s book loves a favorite: short odds on the favorites, fat odds on the long shots.', w: 3 },
    mid:   { name: 'Shrugs at the middle', blurb: 'Tonight’s book shrugs at the middle: 2nd and 3rd are priced too evenly.', w: 3 },
    sharp: { name: 'A sharp book', blurb: 'A sharp book tonight: no mistakes, fair prices. Look for an edge with your tools instead.', w: 1 }
  };
  const QUIRK_ORDER = ['steps', 'fav', 'mid', 'sharp'];
  function pickQuirk(rng, last) {
    const pool = QUIRK_ORDER.filter(id => id !== last);
    let x = rng() * pool.reduce((a, id) => a + QUIRKS[id].w, 0);
    for (const id of pool) { x -= QUIRKS[id].w; if (x < 0) return id; }
    return pool[0];
  }
  const quirkOf = race => race.quirk || 'sharp';

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
    const fx = Object.assign({ disc: 0, cool: 0, watch: 0, peekN: 1, edge: 0, perfectPlus: 0, recallMul: 1, extraUse: 0, greased: 0, tip: 0, insure: 0, fineMul: 0, heatCap: 0, tools: ['peek', 'burn', 'stack', 'mud'], chips: [5, 10, 25, 50], startCash: CFG.startCash, loanOwe: CFG.loanOwe, offers: CFG.favorOffers, alibi: 0, tell: 0, upsetPlus: 0 }, base || {});
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
      const S = CFG.minSteps + Math.floor(rng() * CFG.stepSpan);
      const fLo = Math.max(0, Math.ceil((S - CFG.plainMax) / 2)), fHi = Math.min(CFG.faceMax, Math.floor((S - CFG.plainMin) / 2));
      const f = fLo + Math.floor(rng() * (fHi - fLo + 1)), n = S - 2 * f;
      comp.push({ n, f });
      for (let k = 0; k < n; k++) deck.push({ s, r: 2 + Math.floor(rng() * 9) });
      for (let k = 0; k < f; k++) deck.push({ s, r: 11 + Math.floor(rng() * 3) });
    }
    shuffle(deck, rng);
    const quirk = pickQuirk(rng, run.lastQuirk); run.lastQuirk = quirk;
    return {
      quirk, upset: null, duels: null, dbets: [null, null, null],
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
  function unpack(o) { const run = JSON.parse(JSON.stringify(o)); run.rng = mulberry32(o.rngState); if (run.race && !run.race.dbets) run.race.dbets = [null, null, null]; return run; }

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
  const zeros = () => [0, 1, 2, 3].map(() => [0, 0, 0, 0]);
  /* what a book that only counts cards sees: every suit holds the deck's average share of face cards */
  function bookCodes(race) {
    const cnt = [0, 0, 0, 0], fc = [0, 0, 0, 0]; let faces = 0;
    race.deck.forEach(c => { cnt[c.s]++; if (c.r >= 11) { faces++; fc[c.s]++; } });
    const share = race.deck.length ? faces / race.deck.length : 0, codes = [];
    for (let s = 0; s < 4; s++) {
      const f = Math.min(cnt[s], Math.round(CFG.stepsBlur * cnt[s] * share + (1 - CFG.stepsBlur) * fc[s]));
      for (let k = 0; k < cnt[s]; k++) codes.push(s * 2 + (k < f ? 1 : 0));
    }
    return codes;
  }
  /* returns { P[h][pl], H[x][y], orders, n } (the truth for the cards still in the deck) plus B and HB: the same two tables as
     the book sees them tonight (its quirk), which are the ones it prices from */
  function quote(run) {
    const r = run.race, qk = quirkOf(r);
    const key = qk + '|' + r.prog.join(',') + '|' + r.lane.map(l => l.mud + ':' + l.wind + ':' + (l.hurdle ? 1 : 0)).join(',') + '|' + r.deck.length + '|' + remainingCodes(r).reduce((a, c) => a + c, 0) + '|' + r.finished.join('');
    if (run._q && run._q.key === key) return run._q.q;
    const seed0 = (run.seed ^ Math.imul(run.raceNo, 2654435761) ^ Math.imul(r.draws + 1, 40503) ^ (r.deck.length * 977)) >>> 0;
    const N = CFG.mc, orders = {};
    function sims(codes, keep) {
      const rng = mulberry32(seed0), P = zeros(), H = zeros();
      for (let i = 0; i < N; i++) {
        const o = simulate(r.prog, r.lane, codes, CFG.track, rng, r.finished);
        for (let pl = 0; pl < 4; pl++) P[o[pl]][pl]++;
        for (let a = 0; a < 4; a++) for (let b = a + 1; b < 4; b++) H[o[a]][o[b]]++;
        if (keep) { const k = o.join(''); orders[k] = (orders[k] || 0) + 1; }
      }
      for (let h = 0; h < 4; h++) { for (let pl = 0; pl < 4; pl++) P[h][pl] /= N; for (let y = 0; y < 4; y++) H[h][y] /= N; }
      return { P, H };
    }
    const T = sims(remainingCodes(r), true);
    let B = T.P, HB = T.H;
    if (qk === 'steps') { const b = sims(bookCodes(r), false); B = b.P; HB = b.H; }
    else if (qk === 'fav') {
      const g = CFG.quirkGamma; B = zeros(); HB = zeros();
      for (let pl = 0; pl < 4; pl++) { let s = 0; for (let h = 0; h < 4; h++) s += Math.pow(T.P[h][pl], g); for (let h = 0; h < 4; h++) B[h][pl] = s > 0 ? Math.pow(T.P[h][pl], g) / s : 0; }
      for (let x = 0; x < 4; x++) for (let y = 0; y < 4; y++) if (x !== y) { const a = Math.pow(T.H[x][y], g), b = Math.pow(T.H[y][x], g); HB[x][y] = a + b > 0 ? a / (a + b) : 0.5; }
    } else if (qk === 'mid') {
      const lam = CFG.midFlat, el = [0, 1, 2, 3].filter(h => r.finished.indexOf(h) < 0);
      B = T.P.map(row => row.slice());
      for (let pl = 1; pl <= 2; pl++) if (pl >= r.finished.length && el.length) for (let h = 0; h < 4; h++) B[h][pl] = el.indexOf(h) >= 0 ? (1 - lam) * T.P[h][pl] + lam / el.length : 0;
    }
    const q = { P: T.P, H: T.H, orders, n: N, B, HB };
    run._q = { key, q };
    return q;
  }
  function oddsFor(run, p) {
    if (p <= 0.0005) return CFG.maxOdds;
    return Math.round(Math.max(CFG.minOdds, Math.min(CFG.maxOdds, edgeOf(run) / p)) * 100) / 100;
  }
  /* the board the player sees: the book's chance and price for every horse and place. t and d are the truth and the book's mistake (d = truth - book) */
  function board(run) { const q = quote(run); return q.B.map((row, h) => row.map((p, pl) => ({ p, odds: oddsFor(run, p), t: q.P[h][pl], d: q.P[h][pl] - p }))); }
  /* the mark Bookie's Tell puts on a cell: +1 the book undersells it, -1 it oversells it, 0 nothing (or no Tell) */
  function tellMark(run, cell) {
    const lv = run.fx.tell | 0; if (!lv) return 0;
    const m = CFG.hintMin[Math.min(lv, CFG.hintMin.length) - 1];
    return cell.d >= m ? 1 : cell.d <= -m ? -1 : 0;
  }
  /* head-to-head offers: which suit finishes ahead of which. Picked once per race from the pairs the book is not sure about */
  const PAIRS = [[0, 1], [0, 2], [0, 3], [1, 2], [1, 3], [2, 3]];
  function duelsOf(run) {
    const r = run.race; if (r.duels) return r.duels;
    if (r.locked || r.draws > 0) return [];
    const q = quote(run), rng = mulberry32((run.seed ^ Math.imul(run.raceNo, 40503) ^ 0x9e3779b9) >>> 0);
    const ok = PAIRS.filter(([x, y]) => q.HB[x][y] >= 0.2 && q.HB[x][y] <= 0.8);
    const pool = shuffle((ok.length >= CFG.duels ? ok : PAIRS).slice(), rng).slice(0, CFG.duels);
    r.duels = pool.map(([x, y]) => (rng() < 0.5 ? [y, x] : [x, y]));
    return r.duels;
  }
  const duelOdds = (run, p) => Math.round(Math.max(CFG.duelMin, Math.min(CFG.maxOdds, edgeOf(run) / Math.max(p, 0.0005))) * 100) / 100;
  /* one row per duel: horse a and horse b, with the book's chance and price that each finishes ahead, and the truth */
  function duelBoard(run) {
    const q = quote(run);
    return duelsOf(run).map(([a, b]) => ({ a, b, pa: q.HB[a][b], pb: q.HB[b][a], oa: duelOdds(run, q.HB[a][b]), ob: duelOdds(run, q.HB[b][a]), ta: q.H[a][b], tb: q.H[b][a] }));
  }
  /* chance that a whole order comes in, e.g. [2,0,1,3] = horse 2 first, 0 second ... */
  function orderChance(run, order) { const q = quote(run); return (q.orders[order.join('')] || 0) / q.n; }
  /* what a complete, correct order would pay on top, as a multiple of the total stake */
  function perfectMult(run, order) {
    const p = Math.max(0.004, orderChance(run, order));
    return Math.round((Math.max(CFG.perfectMin, Math.min(CFG.perfectMax, CFG.perfectK / p)) + (run.fx.perfectPlus || 0)) * 100) / 100;
  }
  /* the most likely complete order right now */
  function bestOrder(run) { const q = quote(run); let b = null, c = -1; for (const k in q.orders) if (q.orders[k] > c) { c = q.orders[k]; b = k.split('').map(Number); } return b; }

  /* ---------- the upset: the call every race is about ---------- */
  /* the book's favorite to win (among the horses still running): it cannot be the upset */
  function favoriteOf(run) {
    const q = quote(run), r = run.race; let best = -1;
    for (let h = 0; h < 4; h++) if (r.finished.indexOf(h) < 0 && (best < 0 || q.B[h][0] > q.B[best][0])) best = h;
    return best;
  }
  const upsetOdds = (run, p) => Math.round(Math.max(CFG.minOdds, Math.min(CFG.upsetMax, edgeOf(run) / Math.max(p, 0.0005)) * (1 + (run.fx.upsetPlus || 0))) * 100) / 100;
  /* one row per horse: the book's chance and price for it to win, the truth, whether it is the favorite, and its rank (0 = the longest shot) */
  function upsetBoard(run) {
    const q = quote(run), fav = favoriteOf(run);
    const rows = [0, 1, 2, 3].map(h => ({ h, p: q.B[h][0], odds: upsetOdds(run, q.B[h][0]), t: q.P[h][0], d: q.P[h][0] - q.B[h][0], fav: h === fav, rank: 0 }));
    rows.slice().sort((a, b) => a.p - b.p || a.h - b.h).forEach((x, i) => { x.rank = i; });
    return rows;
  }
  /* what the upset horse's chance to win is right now (the truth, from the cards still in the deck) and what it was priced at */
  function upsetNow(run) {
    const u = run.race.upset; if (!u) return null;
    const q = quote(run), r = run.race;
    return { h: u.h, t: r.done && r.order ? (r.order[0] === u.h ? 1 : 0) : q.P[u.h][0], b: q.B[u.h][0] };
  }
  /* ---------- the slip ---------- */
  const hedgeStaked = run => run.race.slip.reduce((a, b) => a + (b ? b.stake : 0), 0) + (run.race.dbets || []).reduce((a, b) => a + (b ? b.stake : 0), 0);
  const staked = run => hedgeStaked(run) + (run.race.upset ? run.race.upset.stake : 0);
  /* cover bets default to the smallest chip and may add up to hedgeShare times the upset stake */
  const hedgeChip = run => run.fx.chips[0];
  const hedgeRoom = run => (run.race.upset ? Math.max(0, Math.floor(run.race.upset.stake * CFG.hedgeShare) - hedgeStaked(run)) : 0);
  const hedgeOk = run => !!run.race.upset && hedgeStaked(run) <= Math.floor(run.race.upset.stake * CFG.hedgeShare);
  function undoSlip(r, snap) { const o = JSON.parse(snap); o.slip.forEach((s, i) => { r.slip[i] = s; }); o.dbets.forEach((s, i) => { r.dbets[i] = s; }); }
  const snapSlip = r => JSON.stringify({ slip: r.slip, dbets: r.dbets || [null, null, null] });
  /* choose the upset horse (not the book's favorite); the same pick again clears it, and the cover bets with it */
  function pickUpset(run, h) {
    const r = run.race; if (run.phase !== 'book' || r.locked || !(h >= 0 && h < 4)) return false;
    if (r.upset && r.upset.h === h) { r.upset = null; r.slip = [null, null, null, null]; r.dbets = [null, null, null]; return true; }
    if (h === favoriteOf(run)) return false;
    if (r.upset) { r.upset.h = h; return true; }
    const ch = run.fx.chips, stake = ch.indexOf(run.chip) >= 0 ? run.chip : ch[0];
    r.upset = { h, stake, odds: 0 };
    return true;
  }
  /* the chip button sets the stake of the upset */
  function setChip(run, v) {
    if (run.fx.chips.indexOf(v) < 0 || run.race.locked) return false;
    const r = run.race;
    if (r.upset && Math.floor(v * CFG.hedgeShare) < hedgeStaked(run)) return false;
    run.chip = v; if (r.upset) r.upset.stake = v;
    return true;
  }
  /* step the stake of one bet up or down the chip list. kind 'u' = the upset, 'p' = a cover place (idx 0-3), 'd' = a head-to-head (idx = duel) */
  function stepStake(run, kind, idx, dir) {
    const r = run.race; if (run.phase !== 'book' || r.locked) return false;
    const s = kind === 'u' ? r.upset : kind === 'd' ? (r.dbets || [])[idx] : r.slip[idx]; if (!s) return false;
    const ch = run.fx.chips, i = ch.indexOf(s.stake), j = Math.max(0, Math.min(ch.length - 1, (i < 0 ? 0 : i) + dir));
    if (ch[j] === s.stake) return false;
    const old = s.stake; s.stake = ch[j];
    if (!hedgeOk(run)) { s.stake = old; return false; }
    if (kind === 'u') run.chip = s.stake;
    return true;
  }
  function duelPick(run, i, h) {
    const r = run.race; if (run.phase !== 'book' || r.locked || !r.upset) return false;
    const d = duelsOf(run)[i]; if (!d || d.indexOf(h) < 0) return false;
    if (!r.dbets) r.dbets = [null, null, null];
    const snap = snapSlip(r);
    r.dbets[i] = r.dbets[i] && r.dbets[i].h === h ? null : { h, stake: hedgeChip(run), odds: 0 };
    if (!hedgeOk(run)) { undoSlip(r, snap); return false; }
    return true;
  }
  /* before the lock: a cover bet on a place (a horse can only hold one place); the same pick again clears it */
  function pick(run, pl, h) {
    const r = run.race; if (run.phase !== 'book' || r.locked || !r.upset) return false;
    if (r.slip[pl] && r.slip[pl].h === h) { r.slip[pl] = null; return true; }
    const snap = snapSlip(r);
    for (let i = 0; i < 4; i++) if (r.slip[i] && r.slip[i].h === h) r.slip[i] = null;
    r.slip[pl] = { h, stake: hedgeChip(run), odds: 0 };
    if (!hedgeOk(run)) { undoSlip(r, snap); return false; }
    return true;
  }
  /* the true likeliest order: a bot's helper, the screen does not offer it */
  function pickBest(run) { const o = bestOrder(run); o.forEach((h, pl) => { run.race.slip[pl] = { h, stake: hedgeChip(run), odds: 0 }; }); }
  /* bot helper: cover one place with the board's biggest favorite among the places still empty (needs an upset first and room) */
  function pickFavorite(run) {
    const r = run.race; if (run.phase !== 'book' || r.locked || !r.upset) return null;
    const b = board(run); let best = null;
    for (let pl = 0; pl < 4; pl++) if (!r.slip[pl]) for (let h = 0; h < 4; h++) if (!r.slip.some(s => s && s.h === h) && (!best || b[h][pl].p > best.p)) best = { h, pl, p: b[h][pl].p };
    if (best && !pick(run, best.pl, best.h)) return null;
    return best;
  }
  const PERMS = (() => { const out = []; (function go(a, rest) { if (!rest.length) { out.push(a); return; } rest.forEach((h, i) => go(a.concat(h), rest.filter((_, j) => j !== i))); })([], [0, 1, 2, 3]); return out; })();
  /* bot helper: the order the BOARD says is likeliest (what a player who just follows the percentages would call) */
  function pickBook(run) {
    const q = quote(run); let best = null, bs = -1;
    PERMS.forEach(o => { const s = o.reduce((a, h, pl) => a * Math.max(1e-6, q.B[h][pl]), 1); if (s > bs) { bs = s; best = o; } });
    best.forEach((h, pl) => { run.race.slip[pl] = { h, stake: hedgeChip(run), odds: 0 }; });
  }
  /* bot helper: back the cells and duels whose true value beats the book's price by at least `min` (a share of the stake) */
  function pickValue(run, min) {
    const r = run.race, q = quote(run), b = board(run); min = min == null ? 0.05 : min;
    let best = { v: 0, a: [null, null, null, null] };
    (function go(pl, used, a, v) {
      if (pl === 4) { if (v > best.v) best = { v, a: a.slice() }; return; }
      go(pl + 1, used, a.concat(null), v);
      for (let h = 0; h < 4; h++) if (!(used & (1 << h))) { const ev = q.P[h][pl] * b[h][pl].odds - 1; if (ev >= min) go(pl + 1, used | (1 << h), a.concat(h), v + ev); }
    })(0, 0, [], 0);
    best.a.forEach((h, pl) => { r.slip[pl] = h == null ? null : { h, stake: hedgeChip(run), odds: 0 }; });
    duelsOf(run).forEach(([x, y], i) => {
      const row = duelBoard(run)[i], ea = row.ta * row.oa - 1, eb = row.tb * row.ob - 1;
      if (Math.max(ea, eb) >= min) r.dbets[i] = { h: ea >= eb ? x : y, stake: hedgeChip(run), odds: 0 };
    });
  }
  function canLock(run) {
    const r = run.race;
    return run.phase === 'book' && !r.locked && !!r.upset && hedgeOk(run) && staked(run) <= run.cash;
  }
  function lock(run) {
    if (!canLock(run)) return false;
    const r = run.race, b = board(run), db = (r.dbets || []).some(Boolean) ? duelBoard(run) : [];
    r.upset.odds = upsetBoard(run)[r.upset.h].odds; run.cash -= r.upset.stake;
    r.slip.forEach((s, pl) => { if (s) { s.odds = b[s.h][pl].odds; run.cash -= s.stake; } });
    (r.dbets || []).forEach((d, i) => { if (d) { const row = db[i]; d.odds = d.h === row.a ? row.oa : row.ob; run.cash -= d.stake; } });
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
    else if (id === 'burn') { if (r.deck.length <= 1) return { ok: false, why: 'empty', events: ev }; r.burned = (r.burned || 0) + 1; r.deck.shift(); r.pk = 0; }
    else if (id === 'swap') { if (r.deck.length < 2 || r.deck[0].s === r.deck[1].s) return { ok: false, why: 'same', events: ev }; const t = r.deck[0]; r.deck[0] = r.deck[1]; r.deck[1] = t; r.pk = 0; }
    else if (id === 'stack') { const i = r.deck.findIndex(c => c.s === arg); if (i < 0) return { ok: false, why: 'none', events: ev }; if (i === 0) return { ok: false, why: 'top', events: ev }; const c = r.deck.splice(i, 1)[0]; r.deck.unshift(c); r.pk = 0; }
    else if (id === 'shave') { if (r.deck.length <= 2) return { ok: false, why: 'empty', events: ev }; const idx = []; r.deck.forEach((c, i) => { if (c.s === arg && c.r < 11) idx.push(i); }); if (!idx.length) return { ok: false, why: 'none', events: ev }; r.deck.splice(idx[Math.floor(run.rng() * idx.length)], 1); r.pk = 0; r.shaved = (r.shaved || 0) + 1; r.comp[arg].n--; }
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
      if (run.fx.alibi) { let back = r.upset ? Math.round(r.upset.stake * 0.5) : 0; r.slip.forEach(s => { if (s) back += Math.round(s.stake * 0.5); }); run.cash += back; r.alibi = back; ev[ev.length - 1].refund = back; }
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
    const bets = [], duels = [];
    let pay = 0, stakes = 0, placeStakes = 0, hits = 0, sharp = 0, all = true, up = null;
    if (r.upset) {
      const u = r.upset, hit = r.order[0] === u.h, p = hit && !r.caught ? Math.round(u.stake * u.odds) : 0;
      stakes += u.stake; pay += p;
      up = { h: u.h, stake: u.stake, odds: u.odds, hit, pay: p, won: r.order[0], big: hit && !r.caught && u.odds >= CFG.bigUpset };
    }
    for (let pl = 0; pl < 4; pl++) {
      const s = r.slip[pl];
      if (!s) { all = false; continue; }
      const hit = r.order[pl] === s.h;
      const p = hit && !r.caught ? Math.round(s.stake * s.odds) : 0;
      stakes += s.stake; placeStakes += s.stake; pay += p; if (hit) hits++; else all = false;
      const sh = hit && !r.caught && s.odds >= CFG.sharpOdds; if (sh) sharp++;
      bets.push({ pl, h: s.h, stake: s.stake, odds: s.odds, hit, pay: p, actual: r.order[pl], sharp: sh });
    }
    (r.duels || []).forEach(([x, y], i) => {
      const d = (r.dbets || [])[i]; if (!d) return;
      const w = d.h === x ? y : x, hit = r.order.indexOf(d.h) < r.order.indexOf(w);
      const p = hit && !r.caught ? Math.round(d.stake * d.odds) : 0;
      stakes += d.stake; pay += p;
      duels.push({ h: d.h, over: w, stake: d.stake, odds: d.odds, hit, pay: p });
    });
    const perfect = all && !r.caught && bets.length === 4;
    const bonus = perfect ? Math.round(placeStakes * r.pmult) : 0;
    const insured = !hits && !(up && up.hit) && !r.caught && run.fx.insure ? Math.round((placeStakes + (up ? up.stake : 0)) * run.fx.insure) : 0;
    run.cash += pay + bonus + insured;
    const net = pay + bonus + insured - stakes - r.fees - r.spent - r.fines + (r.alibi || 0);
    const res = { raceNo: run.raceNo, order: r.order.slice(), upset: up, bets, duels, pay, bonus, insured, stakes, fees: r.fees, spent: r.spent, fines: r.fines, alibi: r.alibi || 0, net, perfect, caught: r.caught, hits, sharp, draws: r.draws, quirk: quirkOf(r) };
    run.result = res; run.results.push(res);
    run.stats.races++; if (up && up.hit && !r.caught) { run.stats.upsets = (run.stats.upsets || 0) + 1; if (up.big) run.stats.bigUpsets = (run.stats.bigUpsets || 0) + 1; } run.stats.hits += hits; run.stats.sharp = (run.stats.sharp || 0) + sharp; if (perfect) run.stats.perfects++; run.stats.bestNet = Math.max(run.stats.bestNet, net);
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
    const sharp = run.stats.sharp || 0;
    const ups = run.stats.upsets || 0, big = run.stats.bigUpsets || 0;
    const rp = Math.max(0, Math.round(profit / 10)) + run.stats.hits + run.stats.perfects * 6 + sharp * CFG.sharpRp + ups * CFG.upsetRp + big * CFG.bigUpsetRp + (profit > 0 ? 5 : 0);
    run.over = { final, profit, rp, hits: run.stats.hits, perfects: run.stats.perfects, caught: run.stats.caught, sharp, upsets: ups, bigUpsets: big };
    run.phase = 'over';
    return true;
  }
  /* leave the table early, between races */
  function walkOut(run) { if (run.phase !== 'book' || run.race.locked) return false; return finish(run); }
  /* a bot-friendly helper: expected payout of the locked slip in the current state (uses the quote's sims) */
  function expected(run) {
    const q = quote(run), r = run.race; let e = 0;
    if (r.upset) e += q.P[r.upset.h][0] * r.upset.stake * r.upset.odds;
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
      N('e_tip', 'eye', 'Tip-off', 'The top card of every deck is shown before you call.', [40], ['e_calls'], 180, 4),
      N('e_under', 'eye', 'Longshot Fund', 'Your upset pays 10% more.', [25, 40, 55], ['e_net'], 212, 3),
      N('e_tell', 'eye', 'Bookie’s Tell', 'The board marks the cells where the book is wrong: ▲ it undersells, ▼ it oversells. A second level catches smaller mistakes.', [30, 50], ['e_perf'], 150, 3)
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
        extraUse: L('t_belt'), tell: L('e_tell'), upsetPlus: 0.1 * L('e_under')
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
    QUIRKS, quirkOf, tellMark, duelsOf, duelBoard, stepStake, duelPick, pickFavorite, pickBook, pickValue,
    favoriteOf, upsetBoard, upsetNow, upsetOdds, pickUpset, hedgeStaked, hedgeRoom, hedgeChip,
    quote, board, orderChance, perfectMult, bestOrder, oddsFor, staked, setChip, pick, pickBest, canLock, lock, recallFee, canRecall, recall, draw,
    toolState, toolCost, toolMax, heatCap, inspectChance, useTool, settle, toBackroom, buyFavor, coolOff, takeLoan, canLoan, nextRace, finish,
    expected, walkOut, stepOf, label, favorPrice, edgeOf, simulate, remainingCodes };
})();
if (typeof module !== 'undefined') module.exports = Gamble;
