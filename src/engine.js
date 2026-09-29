/* Suit Derby engine. Pure game logic, no DOM. A run is N laps; every lap is a full
   race between four suit horses driven by cards drawn from one shared deck.
   Between laps: results, rivals upgrade, you call the finishing order, shop, gamble. */
const Engine = (() => {
  const CFG = {
    lapLen: 150,        // distance of one lap (one full race)
    drawEvery: 2,       // seconds between cards
    firstDraw: 1,
    base: 1.6,          // cruising speed
    decay: 0.5,         // how fast a surge fades
    par: 34,            // race seconds that earn no speed bonus
    sub: 0.05,
    prizes: [140, 90, 50, 20],
    points: [4, 3, 2, 1],
    bonusPerSec: 4,
    divPerValue: 3,
    copies: 2,          // standard decks in the run deck (26 cards per suit)
    minSuit: 10,        // burning can never thin a suit below this
    shopSlots: 4,
    rerollBase: 15,
    rerollStep: 10,
    spurBoost: 7,
    sabotage: 0.6,
    headStart: 25,
    aiChance: 0.9,      // chance per stop that each rival gets a free upgrade
    aiExtra: 0.3,       // chance of a second one
    lapChoices: [5, 10],
    // tiers: every upgrade of a tier costs the same
    tierPrice: { common: 50, rare: 110, epic: 210, legendary: 380 },
    tierBase: [55, 28, 12, 5],   // shop odds (%) at the start of a run
    // betting on the finishing order
    stakes: [10, 25, 50, 100],
    edge: 0.85,                  // bookie pays 85% of fair odds
    quoteSims: 480,
    combo: [1, 1, 1.1, 1.25, 1.5],       // multiplier on total winnings by number of correct calls
    comboSlam: [1, 1, 1.3, 1.8, 3],
    // luck
    horseshoe: 0.11, horseshoeBoost: 7, jackpot: 0.02, jackpotCash: 150,
    chaosBoost: 14, chaosCash: 25, coinHeads: 3.5, coinTails: -1.5,
    // higher-or-lower table
    tableLimit: 3, tableEdge: 0.92
  };
  const SUITS = [
    { id: 'H', glyph: '♥︎', name: 'Hearts' },
    { id: 'D', glyph: '♦︎', name: 'Diamonds' },
    { id: 'C', glyph: '♣︎', name: 'Clubs' },
    { id: 'S', glyph: '♠︎', name: 'Spades' }
  ];
  const TIERS = ['common', 'rare', 'epic', 'legendary'];
  const TIER_NAME = { common: 'Common', rare: 'Rare', epic: 'Epic', legendary: 'Legendary' };
  const KIND_LABEL = { deck: 'Deck', horse: 'Horse', cash: 'Money', luck: 'Luck', bet: 'Betting', gear: 'Gear', lap: 'Next lap' };

  function mulberry32(a) {
    return function () {
      a |= 0; a = (a + 0x6D2B79F5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  const val = c => (c.joker ? 17 : c.r);
  const label = c => (c.chaos ? '?' : c.joker ? '★' : ({ 11: 'J', 12: 'Q', 13: 'K', 14: 'A' })[c.r] || String(c.r));
  const boostOf = (c, h) => (3 + val(c) * 0.85) * h.mult * h.temp;

  function shuffle(a, rng) {
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(rng() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  }
  const rnd = (run, lo, hi) => lo + Math.floor(run.rng() * (hi - lo + 1));
  const round5 = n => Math.max(5, Math.round(n / 5) * 5);
  const cnt = (h, id) => h.up[id] || 0;
  const meOf = run => run.horses[run.me];

  /* ---------- deck operations (on the run deck, so they last the whole run) ---------- */
  function suitCount(run, s) { return run.cards.filter(c => c.s === s && !c.chaos).length; }
  function takeSuit(run, s, n) {
    n = Math.min(n, Math.max(0, suitCount(run, s) - CFG.minSuit));
    const out = [];
    while (out.length < n) {
      const idx = [];
      run.cards.forEach((c, i) => { if (c.s === s && !c.chaos) idx.push(i); });
      out.push(run.cards.splice(idx[Math.floor(run.rng() * idx.length)], 1)[0]);
    }
    return out;
  }
  function lowest(run, s, n) {
    return run.cards.filter(c => c.s === s && !c.joker && !c.chaos).sort((a, b) => a.r - b.r).slice(0, n);
  }
  function pointsLeader(run, h) {
    const others = run.horses.filter(o => o !== h);
    const best = Math.max(...others.map(o => o.points));
    const top = others.filter(o => o.points >= best);
    return top[Math.floor(run.rng() * top.length)];
  }
  const add = (run, n, mk) => { for (let k = 0; k < n; k++) run.cards.push(mk(k)); };
  const G = i => SUITS[i].glyph;

  /* ---------- upgrade catalogue ----------
     tier: common / rare / epic / legendary (price depends only on tier).
     kind: deck, horse, cash, luck, bet, gear last the whole run. lap is spent on the next lap only.
     ai: rival horses may also receive it for free at pit stops. */
  const U = (id, tier, kind, ai, name, max, blurb, apply) => ({ id, tier, kind, ai, name, max, blurb, apply: apply || (() => '') });
  const UPGRADES = [
    // ---- common
    U('stack', 'common', 'deck', true, 'Stacked Deck', 5, 'Shuffle 4 extra cards of your suit into the deck.',
      (run, h) => { add(run, 4, () => ({ s: h.i, r: rnd(run, 2, 14) })); return 'added 4 cards to ' + G(h.i); }),
    U('wind', 'common', 'horse', true, 'Second Wind', 5, 'Cruising speed +0.3 for the rest of the run.',
      (run, h) => { h.base += 0.3; return 'cruises faster'; }),
    U('spare', 'common', 'gear', false, 'Spare Spur', 3, 'One more Spur charge every lap. Tap Spur (or press Space) for an instant surge.'),
    U('penny', 'common', 'cash', false, 'Lucky Penny', 5, 'Earn an extra $20 at the end of every lap.'),
    U('lens', 'common', 'gear', false, 'Scout Lens', 3, 'See the next 2 cards of the deck during every lap.'),
    U('sand', 'common', 'deck', true, 'Sand Trap', 4, 'Remove 10 cards of the points leader from the deck.',
      (run, h) => { const t = pointsLeader(run, h); const out = takeSuit(run, t.i, 10); return 'burned ' + out.length + ' ' + G(t.i); }),
    U('retread', 'common', 'deck', true, 'Retread', 3, 'Swap your 6 lowest cards for fresh cards of rank 8 to Queen.',
      (run, h) => { const d = lowest(run, h.i, 6); d.forEach(c => run.cards.splice(run.cards.indexOf(c), 1)); d.forEach(() => run.cards.push({ s: h.i, r: rnd(run, 8, 12) })); return 'retreaded six low ' + G(h.i); }),
    U('bookie', 'common', 'bet', false, 'Bookie’s Friend', 4, 'Every bet you win pays 5% more.'),
    // ---- rare
    U('aces', 'rare', 'deck', true, 'Aces High', 4, 'Add six of your Aces, the biggest normal surge.',
      (run, h) => { add(run, 6, () => ({ s: h.i, r: 14 })); return 'added six Aces to ' + G(h.i); }),
    U('stride', 'rare', 'horse', true, 'Long Stride', 4, 'Surges fade 20% slower, so speed carries further.',
      (run, h) => { h.k *= 0.8; return 'holds surges longer'; }),
    U('court', 'rare', 'deck', true, 'Court Cards', 3, 'Add two each of your Jacks, Queens and Kings.',
      (run, h) => { [11, 12, 13, 11, 12, 13].forEach(r => run.cards.push({ s: h.i, r })); return 'added six court cards to ' + G(h.i); }),
    U('draft', 'rare', 'horse', true, 'Slipstream', 3, 'Whenever a rival’s card is drawn, you get a small surge of +0.9.',
      (run, h) => { h.draft += 0.9; return 'draws speed from rivals'; }),
    U('marked', 'rare', 'deck', true, 'Marked Cards', 3, 'Your 12 lowest cards each gain 6 ranks, up to Ace.',
      (run, h) => { lowest(run, h.i, 12).forEach(c => { c.r = Math.min(14, c.r + 6); }); return 'raised twelve low ' + G(h.i); }),
    U('horseshoe', 'rare', 'luck', false, 'Lucky Horseshoe', 3, 'Every card drawn has an 11% chance to also surge your horse by +7, whatever its suit.'),
    U('insure', 'rare', 'bet', false, 'Insurance Policy', 3, 'Get 25% of every lost stake back.'),
    U('haggler', 'rare', 'cash', false, 'Haggler', 3, 'Every shop price is 10% lower.'),
    // ---- epic
    U('fake', 'epic', 'deck', true, 'Counterfeit', 3, 'Turn 10 cards of the points leader into your suit.',
      (run, h) => { const t = pointsLeader(run, h); const out = takeSuit(run, t.i, 10); out.forEach(c => run.cards.push({ ...c, s: h.i })); return 'turned ' + out.length + ' ' + G(t.i) + ' into ' + G(h.i); }),
    U('joker', 'epic', 'deck', true, 'Wild Joker', 3, 'Add six Jokers in your colours. Each surges harder than an Ace.',
      (run, h) => { add(run, 6, () => ({ s: h.i, r: 15, joker: true })); return 'added six Jokers to ' + G(h.i); }),
    U('dice', 'epic', 'luck', false, 'Loaded Dice', 2, 'At the start of every lap roll two dice: that many cards of rank 9 to Ace join your suit for the lap.'),
    U('chaos', 'epic', 'luck', false, 'Chaos Cards', 3, 'Shuffle in 4 Chaos cards. Drawn, one they surge a random horse by +14 and pay you $25.',
      (run, h) => { add(run, 4, () => ({ s: h.i, r: 2, chaos: true })); return 'shuffled in 4 Chaos cards'; }),
    U('sling', 'epic', 'horse', true, 'Slingshot', 3, 'Whenever a rival surges you gain 12% of that surge.',
      (run, h) => { h.sling += 0.12; return 'slingshots off rival surges'; }),
    U('roller', 'epic', 'bet', false, 'High Roller', 2, 'Correct 2nd, 3rd and 4th calls pay 40% more.'),
    U('rich', 'epic', 'cash', false, 'Deep Vault', 3, 'All cash you win from races is 25% higher.'),
    U('interest', 'epic', 'cash', false, 'Interest', 3, 'Unspent cash earns 8% at the end of every lap.'),
    // ---- legendary
    U('flush', 'legendary', 'deck', true, 'Royal Flush', 2, 'Add 10, Jack, Queen, King and Ace of your suit, three of each.',
      (run, h) => { [10, 11, 12, 13, 14, 10, 11, 12, 13, 14, 10, 11, 12, 13, 14].forEach(r => run.cards.push({ s: h.i, r })); return 'added a triple royal flush to ' + G(h.i); }),
    U('coin', 'legendary', 'luck', false, 'Coin of Fate', 1, 'Flip a coin at the start of every lap: heads +3.5 cruising speed, tails −1.5.'),
    U('ticket', 'legendary', 'cash', false, 'Golden Ticket', 1, 'Your speed bonus and dividends are doubled.'),
    U('jackpot', 'legendary', 'luck', false, 'Jackpot Deck', 2, 'Every card drawn has a 2% chance to pay you $150.'),
    U('takeover', 'legendary', 'deck', true, 'Hostile Takeover', 2, 'Turn 12 cards of the points leader into your suit.',
      (run, h) => { const t = pointsLeader(run, h); const out = takeSuit(run, t.i, 12); out.forEach(c => run.cards.push({ ...c, s: h.i })); return 'seized ' + out.length + ' ' + G(t.i); }),
    U('slam', 'legendary', 'bet', false, 'Grand Slam', 1, 'Combo bonuses on correct calls grow: 2 right ×1.3, 3 right ×1.8, 4 right ×3.'),
    // ---- next lap only
    U('cut', 'common', 'lap', false, 'Cut the Deck', 2, 'Your 5 best cards start on top of the deck next lap.'),
    U('headstart', 'rare', 'lap', false, 'Head Start', 2, 'Begin next lap 25 units down the track.'),
    U('double', 'rare', 'lap', false, 'Double Dividend', 1, 'Dividends are doubled next lap.'),
    U('sabotage', 'epic', 'lap', false, 'Sabotage', 1, 'The points leader surges 40% less next lap.'),
    U('slip', 'epic', 'lap', false, 'Insurance Slip', 1, 'Get 60% of every lost stake back next lap.'),
    U('allin', 'legendary', 'lap', false, 'All In', 1, 'Every bet you win pays double next lap.')
  ];
  const upgradeById = id => UPGRADES.find(u => u.id === id);
  const QUEUE = () => ({ cut: 0, headstart: 0, double: 0, sabotage: 0, slip: 0, allin: 0 });

  /* ---------- run ---------- */
  function newRun({ me = 0, laps = 5, meta = {}, seed } = {}) {
    const rng = seed == null ? Math.random : mulberry32(seed);
    const fx = Object.assign({ startCash: 90, cashMult: 1, loaded: 0, baseSpeed: 0, discount: 0, slots: 0, freeRerolls: 0, owners: 0, spMult: 1, luck: 0, sharp: 0 }, meta);
    const run = {
      rng, me, laps, fx,
      lapNo: 0, phase: 'prep',
      cash: fx.startCash,
      cards: [], horses: [],
      queue: QUEUE(),
      calls: [null, null, null, null],
      table: { hands: 0, cur: null, last: null },
      shop: null, shopStop: { rerolls: 0, paid: 0 }, quote: null,
      lap: null, events: [], rivalLog: [], history: [],
      cashEarned: 0, correct: 0, result: null
    };
    // every suit starts level: 26 cards each, identical horses
    for (let c = 0; c < CFG.copies; c++) for (let s = 0; s < 4; s++) for (let r = 2; r <= 14; r++) run.cards.push({ s, r });
    for (let i = 0; i < 4; i++) {
      run.horses.push({ i, pos: 0, ex: 0, base: CFG.base, k: CFG.decay, mult: 1, temp: 1, tb: 0, draft: 0, sling: 0, up: {},
        fin: false, finT: null, place: null, points: 0, totalT: 0, drawn: 0 });
    }
    const mine = meOf(run);
    mine.base += fx.baseSpeed;
    for (let k = 0; k < fx.loaded; k++) run.cards.push({ s: me, r: rnd(run, 6, 12) });
    for (let k = 0; k < fx.owners; k++) {
      const pool = UPGRADES.filter(u => u.ai && u.tier !== 'legendary' && u.kind !== 'lap');
      const u = pool[Math.floor(rng() * pool.length)];
      u.apply(run, mine); mine.up[u.id] = cnt(mine, u.id) + 1;
    }
    run.quote = quote(run);
    lockSelf(run);
    return run;
  }

  /* ---------- tiers ---------- */
  function tierWeights(run) {
    const N = run.lapNo, L = run.fx.luck;
    const w = [CFG.tierBase[0] - 3.5 * N - 4 * L, CFG.tierBase[1] + 1.5 * N + 2 * L, CFG.tierBase[2] + 1.5 * N + 1.3 * L, CFG.tierBase[3] + 0.5 * N + 0.7 * L];
    w[0] = Math.max(15, w[0]);
    return w;
  }
  function tierOdds(run) {
    const w = tierWeights(run), s = w.reduce((a, b) => a + b, 0);
    return TIERS.map((t, i) => ({ tier: t, pct: w[i] / s * 100 }));
  }
  function pickTier(run, w, has) {
    const opts = TIERS.map((t, i) => (has(t) ? w[i] : 0));
    const sum = opts.reduce((a, b) => a + b, 0);
    if (!sum) return null;
    let x = run.rng() * sum;
    for (let i = 0; i < 4; i++) { x -= opts[i]; if (x < 0) return TIERS[i]; }
    return TIERS[3];
  }

  function aiUpgrade(run, h) {
    const w = tierWeights(run);
    const pool = t => UPGRADES.filter(u => u.ai && u.tier === t && u.kind !== 'lap' && cnt(h, u.id) < u.max);
    const t = pickTier(run, w, x => pool(x).length > 0);
    if (!t) return;
    const p = pool(t), u = p[Math.floor(run.rng() * p.length)];
    const text = u.apply(run, h);
    h.up[u.id] = cnt(h, u.id) + 1;
    run.rivalLog.push({ horse: h.i, name: u.name, tier: u.tier, text });
  }

  /* ---------- building a lap (also used by the bookie's simulations) ---------- */
  function buildLap(run, live) {
    const me = meOf(run);
    run.horses.forEach(h => { h.pos = 0; h.ex = 0; h.fin = false; h.finT = null; h.place = null; h.temp = 1; h.tb = 0; h.drawn = 0; });
    const q = run.queue;
    let cards = run.cards.map(c => ({ ...c }));
    const L = { t: 0, drawTimer: CFG.drawEvery - CFG.firstDraw, deck: null, discard: [], divs: [], placeCount: 0, done: false, drawCount: 0,
      spurs: 0, scout: 0, divMult: 1, sabotaged: null, sim: !live, windfall: 0, calls: [], coin: null, dice: 0 };
    if (live) {
      for (let k = 0; k < cnt(me, 'dice'); k++) {
        const n = rnd(run, 1, 6) + rnd(run, 1, 6);
        L.dice += n;
        for (let j = 0; j < n; j++) cards.push({ s: me.i, r: rnd(run, 9, 14), temp: true });
      }
      if (cnt(me, 'coin')) {
        const heads = run.rng() < 0.5;
        me.tb = heads ? CFG.coinHeads : CFG.coinTails;
        L.coin = heads ? 'heads' : 'tails';
      }
      L.spurs = cnt(me, 'spare');
      L.scout = 2 * cnt(me, 'lens');
      L.divMult = (q.double ? 2 : 1) * (cnt(me, 'ticket') ? 2 : 1);
    } else {
      cards = cards.filter(c => !c.chaos);
    }
    const deck = shuffle(cards, run.rng);
    if (live && q.cut) {
      const mineIdx = deck.map((c, i) => i).filter(i => deck[i].s === run.me && !deck[i].chaos);
      const best = mineIdx.sort((a, b) => val(deck[b]) - val(deck[a])).slice(0, 5 * q.cut).sort((a, b) => b - a);
      const picked = best.map(i => deck.splice(i, 1)[0]);
      picked.sort((a, b) => val(a) - val(b));
      picked.forEach(c => deck.push(c));
    }
    L.deck = deck;
    if (live) {
      if (q.sabotage) { const t = pointsLeader(run, me); t.temp = CFG.sabotage; L.sabotaged = t.i; }
      if (q.headstart) me.pos = CFG.headStart * q.headstart;
      L.allin = !!q.allin; L.slip = !!q.slip;
    }
    run.lap = L;
    return L;
  }

  function startLap(run) {
    run.lapNo++;
    if (!run.quote) run.quote = quote(run);
    const quoted = run.quote;
    const L = buildLap(run, true);
    // lock the calls at the odds the bookie quoted, and put the stakes on the table
    run.calls.forEach((c, pl) => {
      if (!c) return;
      run.cash -= c.stake;
      L.calls.push({ place: pl + 1, horse: c.h, stake: c.stake, odds: quoted.o[c.h][pl], p: quoted.p[c.h][pl], hit: null });
    });
    if (run.calls[0]) run.selfStake = run.calls[0].stake;
    run.calls = [null, null, null, null];
    run.quote = null;
    if (L.sabotaged != null) run.events.push({ type: 'sabotage', horse: L.sabotaged });
    if (L.coin) run.events.push({ type: 'luck', kind: 'coin', text: L.coin });
    if (L.dice) run.events.push({ type: 'luck', kind: 'dice', n: L.dice });
    run.queue = QUEUE();
    run.phase = 'lap'; run.shop = null;
    return L;
  }

  /* ---------- the bookie: Monte-Carlo odds for every horse in every place ---------- */
  function quote(run, n) {
    n = n || CFG.quoteSims;
    let seed = (run.lapNo + 1) * 104729 + run.cards.length * 31;
    run.horses.forEach(h => { seed += Math.round(h.base * 100 + h.k * 1000 + h.mult * 100 + h.draft * 100 + h.sling * 100) + h.points * 7; });
    const rng = mulberry32(seed);
    const counts = [0, 1, 2, 3].map(() => [0, 0, 0, 0]);
    const cards = run.cards.filter(c => !c.chaos);
    for (let s = 0; s < n; s++) {
      const c = { rng, me: run.me, fx: run.fx, lapNo: run.lapNo + 1, cards: cards.map(x => ({ ...x })),
        horses: run.horses.map(h => ({ ...h, up: { ...h.up } })), queue: QUEUE(), events: [], rivalLog: [] };
      buildLap(c, false);
      stepLap(c, 1e6);
      c.horses.forEach(h => { counts[h.i][h.place - 1]++; });
    }
    // shrink a little towards even odds so the board does not jitter
    const p = counts.map(r => r.map(x => 0.9 * (x + 0.5) / (n + 2) + 0.1 * 0.25));
    const o = p.map(r => r.map(x => Math.min(40, Math.max(1.02, Math.round(CFG.edge / x * 100) / 100))));
    return { p, o };
  }

  /* ---------- drawing cards ---------- */
  const fxCash = run => run.fx.cashMult * (1 + 0.25 * cnt(meOf(run), 'rich'));
  function drawCard(run) {
    const L = run.lap, me = meOf(run);
    if (!L.deck.length) { L.deck = shuffle(L.discard.splice(0), run.rng); run.events.push({ type: 'reshuffle' }); }
    const c = L.deck.pop();
    L.discard.push(c);
    L.drawCount++;
    if (c.chaos) {
      const alive = run.horses.filter(h => !h.fin);
      let t = null;
      if (alive.length) { t = alive[Math.floor(run.rng() * alive.length)]; t.ex += CFG.chaosBoost * t.mult * t.temp; }
      if (!L.sim) { run.cash += CFG.chaosCash; L.windfall += CFG.chaosCash; }
      run.events.push({ type: 'chaos', card: c, horse: t ? t.i : -1, cash: CFG.chaosCash });
      return;
    }
    const h = run.horses[c.s];
    let boost = 0, div = 0;
    if (!h.fin) {
      boost = boostOf(c, h);
      h.ex += boost; h.drawn++;
      run.horses.forEach(o => {
        if (o === h || o.fin) return;
        if (o.draft) o.ex += o.draft;
        if (o.sling) o.ex += o.sling * boost;
      });
    } else if (h.i === run.me && !L.sim) {
      div = Math.round(val(c) * CFG.divPerValue * L.divMult * fxCash(run));
      L.divs.push({ c, div });
    }
    run.events.push({ type: 'draw', card: c, boost, div, fin: h.fin, horse: c.s });
    if (!L.sim) {
      const hs = cnt(me, 'horseshoe');
      if (hs && !me.fin && run.rng() < CFG.horseshoe * hs) { me.ex += CFG.horseshoeBoost * me.mult; run.events.push({ type: 'luck', kind: 'horseshoe' }); }
      const jp = cnt(me, 'jackpot');
      if (jp && run.rng() < CFG.jackpot * jp) { run.cash += CFG.jackpotCash; L.windfall += CFG.jackpotCash; run.events.push({ type: 'luck', kind: 'jackpot', cash: CFG.jackpotCash }); }
    }
  }

  function spur(run) {
    const L = run.lap, h = meOf(run);
    if (!L || L.done || L.spurs <= 0 || h.fin) return false;
    L.spurs--; h.ex += CFG.spurBoost;
    run.events.push({ type: 'spur', horse: run.me });
    return true;
  }
  function peek(run, n) { const L = run.lap; return L ? L.deck.slice(-n).reverse() : []; }

  function stepLap(run, dt) {
    const L = run.lap;
    let left = dt;
    while (left > 1e-9 && !L.done) {
      const d = Math.min(left, CFG.sub);
      left -= d;
      const t0 = L.t;
      L.t += d;
      const finishers = [];
      for (const h of run.horses) {
        if (h.fin) continue;
        const before = h.pos;
        const e = Math.exp(-h.k * d);
        const cruise = h.base + h.tb;
        h.pos += cruise * d + h.ex * (1 - e) / h.k;
        h.ex *= e;
        if (h.pos >= CFG.lapLen) {
          const frac = (CFG.lapLen - before) / (h.pos - before);
          h.finT = t0 + Math.min(1, Math.max(0, frac)) * d;
          h.pos = CFG.lapLen; h.fin = true;
          finishers.push(h);
        }
      }
      finishers.sort((a, b) => a.finT - b.finT);
      for (const h of finishers) {
        h.place = ++L.placeCount;
        run.events.push({ type: 'finish', horse: h.i, place: h.place, time: h.finT });
      }
      L.drawTimer += d;
      while (L.drawTimer >= CFG.drawEvery - 1e-9) { L.drawTimer -= CFG.drawEvery; drawCard(run); }
      if (L.placeCount >= 4) L.done = true;
    }
    if (L.sim) run.events.length = 0;
  }

  function lapOrder(run) {
    return run.horses.slice().sort((a, b) => {
      if (a.fin && b.fin) return a.place - b.place;
      if (a.fin) return -1;
      if (b.fin) return 1;
      return b.pos - a.pos;
    }).map(h => h.i);
  }
  function runOrder(run) {
    return run.horses.slice().sort((a, b) => b.points - a.points || a.totalT - b.totalT).map(h => h.i);
  }
  function deckCounts(run, live) {
    const src = live && run.lap ? run.lap.deck : run.cards;
    const n = [0, 0, 0, 0];
    src.forEach(c => { if (!c.chaos) n[c.s]++; });
    return n;
  }
  function chaosCount(run, live) {
    const src = live && run.lap ? run.lap.deck : run.cards;
    return src.filter(c => c.chaos).length;
  }

  /* ---------- calling the order ---------- */
  const reserved = run => run.calls.reduce((a, c) => a + (c ? c.stake : 0), 0);
  const spendable = run => run.cash - reserved(run);
  // The 1st-place call is always your own horse. It is put on the board at every stop
  // and cannot be changed or removed; only its stake can.
  function lockSelf(run) {
    const stake = Math.max(CFG.stakes[0], run.selfStake || 0);
    const room = spendable(run);
    const s = CFG.stakes.filter(x => x <= Math.min(stake, room)).pop();
    run.calls[0] = s ? { h: run.me, stake: s, locked: true } : null;
  }
  function setCall(run, place, horse) {
    if (place === 0) return false;
    const cur = run.calls[place];
    if (cur && cur.h === horse) { run.calls[place] = null; return true; }
    if (run.calls.some((c, i) => c && i !== place && c.h === horse)) return false;
    const room = spendable(run) + (cur ? cur.stake : 0);
    const stake = cur ? Math.min(cur.stake, room) : CFG.stakes[0];
    if (room < CFG.stakes[0]) return false;
    run.calls[place] = { h: horse, stake: Math.max(CFG.stakes[0], stake) };
    return true;
  }
  function cycleStake(run, place) {
    const c = run.calls[place];
    if (!c) return false;
    const room = spendable(run) + c.stake;
    const opts = CFG.stakes.filter(s => s <= room);
    const i = opts.indexOf(c.stake);
    c.stake = opts[(i + 1) % opts.length];
    return true;
  }
  function comboOf(run, hits) { return (cnt(meOf(run), 'slam') ? CFG.comboSlam : CFG.combo)[Math.min(4, hits)]; }
  function callPayout(run, c, allin) {
    const me = meOf(run);
    let m = 1 + 0.05 * cnt(me, 'bookie') + run.fx.sharp + (c.place >= 2 ? 0.4 * cnt(me, 'roller') : 0);
    if (allin) m *= 2;
    return c.stake * c.odds * m;
  }

  /* ---------- lap end: cash, points, bets, rivals, shop ---------- */
  function endLap(run) {
    const L = run.lap, me = meOf(run);
    const cm = fxCash(run);
    const prize = Math.round(CFG.prizes[me.place - 1] * cm);
    const secs = CFG.par - me.finT;
    const bonus = Math.round(Math.max(0, secs) * CFG.bonusPerSec * (cnt(me, 'ticket') ? 2 : 1) * cm);
    const divs = L.divs.reduce((a, d) => a + d.div, 0);
    const interest = Math.floor(run.cash * 0.08 * cnt(me, 'interest'));
    const penny = 20 * cnt(me, 'penny');
    // bets
    let hits = 0, staked = 0, missed = 0;
    L.calls.forEach(c => { c.hit = run.horses[c.horse].place === c.place; staked += c.stake; if (c.hit) hits++; else missed += c.stake; });
    const combo = L.calls.length ? comboOf(run, hits) : 1;
    let wins = 0;
    L.calls.forEach(c => { c.win = c.hit ? Math.round(callPayout(run, c, L.allin)) : 0; wins += c.hit ? callPayout(run, c, L.allin) : 0; });
    const refundPct = Math.min(0.9, 0.25 * cnt(me, 'insure') + (L.slip ? 0.6 : 0));
    const refund = Math.round(missed * refundPct);
    const betReturn = Math.round(wins * combo) + refund;
    run.correct += hits;
    const total = prize + bonus + divs + interest + penny + betReturn;
    run.cash += total; run.cashEarned += total + L.windfall;
    run.horses.forEach(h => { h.points += CFG.points[h.place - 1]; h.totalT += h.finT; });
    const res = {
      lapNo: run.lapNo, place: me.place, finT: me.finT, secs, prize, bonus, divCount: L.divs.length, divs, interest, penny,
      windfall: L.windfall, total: total + L.windfall, points: CFG.points[me.place - 1],
      calls: L.calls.map(c => ({ ...c })), hits, combo, staked, betReturn, refund, betNet: betReturn - staked,
      dice: L.dice, coin: L.coin,
      order: run.horses.slice().sort((a, b) => a.place - b.place).map(h => ({ i: h.i, t: h.finT, place: h.place }))
    };
    run.history.push(res);
    run.rivalLog = [];
    if (run.lapNo >= run.laps) { run.phase = 'over'; run.result = finalize(run); }
    else {
      run.horses.forEach(h => { if (h.i === run.me) return; if (run.rng() < CFG.aiChance) aiUpgrade(run, h); if (run.rng() < CFG.aiExtra) aiUpgrade(run, h); });
      run.phase = 'shop'; run.shopStop = { rerolls: 0, paid: 0 };
      run.table = { hands: 0, cur: null, last: null };
      makeShop(run);
      run.quote = quote(run);
      lockSelf(run);
    }
    return res;
  }

  function finalize(run) {
    const order = runOrder(run), me = meOf(run);
    const rank = order.indexOf(run.me) + 1;
    const bonus = rank === 1 ? run.laps * 2 : rank === 2 ? run.laps : 0;
    const raw = me.points + bonus + run.correct;
    const sp = Math.round(raw * run.fx.spMult);
    return { order, rank, points: me.points, bonus, correct: run.correct, sp, forfeited: run.cash, champion: rank === 1 };
  }

  /* ---------- shop ---------- */
  function owned(run, id) {
    const u = upgradeById(id);
    return u.kind === 'lap' ? run.queue[id] : cnt(meOf(run), id);
  }
  function available(run, id) { return owned(run, id) < upgradeById(id).max; }
  function priceOf(run, id) {
    const u = upgradeById(id);
    const disc = Math.min(0.6, run.fx.discount + 0.1 * cnt(meOf(run), 'haggler'));
    return round5(CFG.tierPrice[u.tier] * (1 - disc));
  }
  function shopSlots(run) { return CFG.shopSlots + run.fx.slots; }
  function makeShop(run) {
    const picks = [];
    const w = tierWeights(run);
    const pool = t => UPGRADES.filter(u => u.tier === t && available(run, u.id) && !picks.includes(u));
    const n = Math.min(shopSlots(run), UPGRADES.filter(u => available(run, u.id)).length);
    while (picks.length < n) {
      const t = pickTier(run, w, x => pool(x).length > 0);
      if (!t) break;
      const p = pool(t);
      picks.push(p[Math.floor(run.rng() * p.length)]);
    }
    run.shop = picks.map(u => ({ id: u.id, sold: false }));
    return run.shop;
  }
  const freeRerolls = run => run.fx.freeRerolls;
  function rerollCost(run) {
    const s = run.shopStop;
    if (s.rerolls < freeRerolls(run)) return 0;
    return CFG.rerollBase + CFG.rerollStep * s.paid;
  }
  function reroll(run) {
    const c = rerollCost(run);
    if (spendable(run) < c) return false;
    run.cash -= c;
    if (c > 0) run.shopStop.paid++;
    run.shopStop.rerolls++;
    makeShop(run);
    return true;
  }
  function buy(run, idx) {
    const o = run.shop && run.shop[idx];
    if (!o || o.sold) return null;
    const u = upgradeById(o.id), price = priceOf(run, o.id), me = meOf(run);
    if (spendable(run) < price || !available(run, o.id)) return null;
    run.cash -= price;
    if (u.kind === 'lap') run.queue[o.id]++;
    else { u.apply(run, me); me.up[o.id] = cnt(me, o.id) + 1; }
    o.sold = true;
    run.quote = quote(run);
    return { id: o.id, price };
  }

  /* ---------- the card table: higher or lower ---------- */
  function tableOdds(r) {
    const ph = (14 - r) / 13, pl = (r - 2) / 13;
    const f = p => (p > 0 ? Math.min(15, Math.round(CFG.tableEdge / p * 10) / 10) : 0);
    return { higher: f(ph), lower: f(pl), ph, pl };
  }
  function tableDeal(run, stake) {
    const t = run.table;
    if (t.cur || t.hands >= CFG.tableLimit || stake > spendable(run) || stake < 1) return false;
    run.cash -= stake;
    t.cur = { r: rnd(run, 2, 14), s: rnd(run, 0, 3), stake };
    t.last = null;
    return true;
  }
  function tableGuess(run, dir) {
    const t = run.table;
    if (!t.cur) return null;
    const o = tableOdds(t.cur.r)[dir];
    if (!o) return null;
    const second = { r: rnd(run, 2, 14), s: rnd(run, 0, 3) };
    const win = dir === 'higher' ? second.r > t.cur.r : second.r < t.cur.r;
    const pay = win ? Math.round(t.cur.stake * o) : 0;
    run.cash += pay;
    t.hands++;
    t.last = { first: t.cur, second, dir, win, pay, stake: t.cur.stake, odds: o };
    t.cur = null;
    return t.last;
  }

  return { CFG, SUITS, TIERS, TIER_NAME, KIND_LABEL, UPGRADES, upgradeById, val, label, boostOf, mulberry32,
    newRun, startLap, stepLap, spur, peek, endLap, lapOrder, runOrder, deckCounts, chaosCount,
    quote, setCall, lockSelf, cycleStake, reserved, spendable, comboOf, callPayout,
    owned, available, priceOf, shopSlots, makeShop, reroll, rerollCost, freeRerolls, buy, cnt, fxCash,
    tierOdds, tableOdds, tableDeal, tableGuess };
})();
if (typeof module !== 'undefined') module.exports = Engine;
