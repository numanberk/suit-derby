/* Suit Derby engine. Pure game logic, no DOM. A run is N laps; every lap is a full
   race between four suit horses driven by cards drawn from one shared deck.
   Between laps: results, rivals upgrade, you call the finishing order, shop, gamble. */
const Engine = (() => {
  const CFG = {
    lapLen: 150,        // distance of one lap (one full race)
    drawEvery: 2.4,     // seconds between cards
    firstDraw: 1.2,
    base: 1.6,          // cruising speed
    decay: 0.5,         // how fast a surge fades
    par: 64,            // race seconds that earn no speed bonus
    sub: 0.05,
    prizes: [140, 90, 50, 20],
    points: [4, 3, 2, 1],
    bonusPerSec: 2.5,
    divPerValue: 4.5,
    copies: 1,          // copies of each rank in the run deck
    minRank: 5,         // ranks minRank..Ace: 10 cards per suit, 40 in all (a small deck runs dry fast)
    surgeBase: 1.0,     // a card's surge is surgeBase + rank * surgeVal
    surgeVal: 0.29,
    minSuit: 5,         // burning can never thin a suit below this
    shopSlots: 4,
    rerollBase: 15,
    rerollStep: 10,
    spurBoost: 6.5,     // surge of a Spur at full stamina; less stamina, much less surge (see spurCurve)
    staStart: 25, staRate: 2.5, spurMin: 15, spurCurve: 1.7,
    // hazards: every horse meets this many per lap
    hazards: 3, hzWindow: 9, hzPerfect: 2.6, hzBoost: 1.0, perfectCash: 8, stumbleT: 3.0, stumbleF: 0.25,
    aiClear: 0.6, aiPerfect: 0.12, autoClear: 0.8, autoPerfect: 0.3,
    // next-card bets (live, during the race)
    cardStakes: [5, 10, 25], cardEdge: 0.92, cardRound: 60, streakSta: 4,
    // the underdog fund: a suit under this share of the deck gets free cards at every pit stop
    underdog: 0.22, underdogMax: 5,
    sabotage: 0.6,
    headStart: 25,
    aiChance: 1.0,      // chance per stop that each rival gets a free upgrade
    aiExtra: 0.5,       // chance of a second one
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
    horseshoe: 0.08, horseshoeBoost: 1.6, jackpot: 0.02, jackpotCash: 150,
    chaosBoost: 5, chaosCash: 25, coinHeads: 2, coinTails: -0.8,
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
  const boostOf = (c, h) => (CFG.surgeBase + val(c) * CFG.surgeVal) * h.mult * h.temp;

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
    U('stack', 'common', 'deck', true, 'Stacked Deck', 5, 'Shuffle 2 extra cards of your suit into the deck.',
      (run, h) => { add(run, 2, () => ({ s: h.i, r: rnd(run, CFG.minRank, 14) })); return 'added 2 cards to ' + G(h.i); }),
    U('wind', 'common', 'horse', true, 'Second Wind', 5, 'Cruising speed +0.07 for the rest of the run.',
      (run, h) => { h.base += 0.07; return 'cruises faster'; }),
    U('spare', 'common', 'horse', true, 'Deep Lungs', 3, 'Stamina refills 25% faster, so your Spur is ready sooner.',
      (run, h) => { h.staRate *= 1.25; return 'refills stamina faster'; }),
    U('hooves', 'common', 'horse', true, 'Sure Hooves', 3, 'Stumbles over hazards last half as long.',
      (run, h) => { h.stumbleMult *= 0.5; return 'steadier over hazards'; }),
    U('penny', 'common', 'cash', false, 'Lucky Penny', 5, 'Earn an extra $20 at the end of every lap.'),
    U('lens', 'common', 'gear', false, 'Scout Lens', 2, 'Before every card, one suit that will NOT come next is marked (two with two lenses). Safer next-card bets.'),
    U('sand', 'common', 'deck', true, 'Sand Trap', 4, 'Remove 5 cards of the points leader from the deck.',
      (run, h) => { const t = pointsLeader(run, h); const out = takeSuit(run, t.i, 5); return 'burned ' + out.length + ' ' + G(t.i); }),
    U('retread', 'common', 'deck', true, 'Retread', 3, 'Swap your 3 lowest cards for fresh cards of rank 8 to Queen.',
      (run, h) => { const d = lowest(run, h.i, 3); d.forEach(c => run.cards.splice(run.cards.indexOf(c), 1)); d.forEach(() => run.cards.push({ s: h.i, r: rnd(run, 8, 12) })); return 'retreaded three low ' + G(h.i); }),
    U('bookie', 'common', 'bet', false, 'Bookie’s Friend', 4, 'Every bet you win pays 5% more.'),
    // ---- rare
    U('aces', 'rare', 'deck', true, 'Aces High', 4, 'Add two of your Aces, the biggest normal surge.',
      (run, h) => { add(run, 2, () => ({ s: h.i, r: 14 })); return 'added two Aces to ' + G(h.i); }),
    U('stride', 'rare', 'horse', true, 'Long Stride', 4, 'Surges fade 10% slower, so speed carries further.',
      (run, h) => { h.k *= 0.9; return 'holds surges longer'; }),
    U('court', 'rare', 'deck', true, 'Court Cards', 3, 'Add a Queen and a King of your suit.',
      (run, h) => { [12, 13].forEach(r => run.cards.push({ s: h.i, r })); return 'added a Queen and a King to ' + G(h.i); }),
    U('draft', 'rare', 'horse', true, 'Slipstream', 3, 'Whenever a rival’s card is drawn, you get a small surge of +0.18.',
      (run, h) => { h.draft += 0.18; return 'draws speed from rivals'; }),
    U('marked', 'rare', 'deck', true, 'Marked Cards', 3, 'Your 4 lowest cards each gain 6 ranks, up to Ace.',
      (run, h) => { lowest(run, h.i, 4).forEach(c => { c.r = Math.min(14, c.r + 6); }); return 'raised four low ' + G(h.i); }),
    U('hurdler', 'rare', 'gear', false, 'Hurdler', 2, 'Your horse takes the first hazard of every lap with a perfect jump by itself (two with two).'),
    U('adrenal', 'rare', 'horse', true, 'Adrenaline', 2, 'After a Spur you keep 25% of your stamina (50% with two).',
      (run, h) => { h.keep += 0.25; return 'keeps stamina after a Spur'; }),
    U('horseshoe', 'rare', 'luck', false, 'Lucky Horseshoe', 3, 'Every card drawn has an 8% chance to also surge your horse by +1.6, whatever its suit.'),
    U('insure', 'rare', 'bet', false, 'Insurance Policy', 3, 'Get 25% of every lost stake back.'),
    U('haggler', 'rare', 'cash', false, 'Haggler', 3, 'Every shop price is 10% lower.'),
    // ---- epic
    U('fake', 'epic', 'deck', true, 'Counterfeit', 3, 'Turn 3 cards of the points leader into your suit.',
      (run, h) => { const t = pointsLeader(run, h); const out = takeSuit(run, t.i, 3); out.forEach(c => run.cards.push({ ...c, s: h.i })); return 'turned ' + out.length + ' ' + G(t.i) + ' into ' + G(h.i); }),
    U('joker', 'epic', 'deck', true, 'Wild Joker', 3, 'Add two Jokers in your colours. Each surges harder than an Ace.',
      (run, h) => { add(run, 2, () => ({ s: h.i, r: 15, joker: true })); return 'added two Jokers to ' + G(h.i); }),
    U('dice', 'epic', 'luck', false, 'Loaded Dice', 2, 'At the start of every lap roll 1 to 3: that many cards of rank 9 to Ace join your suit for the lap.'),
    U('chaos', 'epic', 'luck', false, 'Chaos Cards', 3, 'Shuffle in 2 Chaos cards. When drawn, one surges a random horse by +5 and pays you $25.',
      (run, h) => { add(run, 2, () => ({ s: h.i, r: 2, chaos: true })); return 'shuffled in 2 Chaos cards'; }),
    U('sling', 'epic', 'horse', true, 'Slingshot', 3, 'Whenever a rival surges you gain 5% of that surge.',
      (run, h) => { h.sling += 0.05; return 'slingshots off rival surges'; }),
    U('roller', 'epic', 'bet', false, 'High Roller', 2, 'Correct 2nd, 3rd and 4th calls pay 40% more.'),
    U('rich', 'epic', 'cash', false, 'Deep Vault', 3, 'All cash you win from races is 25% higher.'),
    U('interest', 'epic', 'cash', false, 'Interest', 3, 'Unspent cash earns 8% at the end of every lap.'),
    // ---- legendary
    U('flush', 'legendary', 'deck', true, 'Royal Flush', 2, 'Add a 10, Jack, Queen, King and Ace of your suit.',
      (run, h) => { [10, 11, 12, 13, 14].forEach(r => run.cards.push({ s: h.i, r })); return 'added a royal flush to ' + G(h.i); }),
    U('coin', 'legendary', 'luck', false, 'Coin of Fate', 1, 'Flip a coin at the start of every lap: heads +2 cruising speed, tails −0.8.'),
    U('ticket', 'legendary', 'cash', false, 'Golden Ticket', 1, 'Your speed bonus and dividends are doubled.'),
    U('jackpot', 'legendary', 'luck', false, 'Jackpot Deck', 2, 'Every card drawn has a 2% chance to pay you $150.'),
    U('takeover', 'legendary', 'deck', true, 'Hostile Takeover', 2, 'Turn 5 cards of the points leader into your suit.',
      (run, h) => { const t = pointsLeader(run, h); const out = takeSuit(run, t.i, 5); out.forEach(c => run.cards.push({ ...c, s: h.i })); return 'seized ' + out.length + ' ' + G(t.i); }),
    U('slam', 'legendary', 'bet', false, 'Grand Slam', 1, 'Combo bonuses on correct calls grow: 2 right ×1.3, 3 right ×1.8, 4 right ×3.'),
    // ---- next lap only
    U('cut', 'common', 'lap', false, 'Cut the Deck', 2, 'Your 3 best cards start on top of the deck next lap.'),
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
    // every suit starts level: 10 cards each, identical horses
    for (let c = 0; c < CFG.copies; c++) for (let s = 0; s < 4; s++) for (let r = CFG.minRank; r <= 14; r++) run.cards.push({ s, r });
    for (let i = 0; i < 4; i++) {
      run.horses.push({ i, pos: 0, ex: 0, base: CFG.base, k: CFG.decay, mult: 1, temp: 1, tb: 0, draft: 0, sling: 0, up: {},
        sta: CFG.staStart, staRate: CFG.staRate, keep: 0, stumbleMult: 1, slowT: 0, hzi: 0, spurThr: 75,
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
    topUp(run);
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


  /* ---------- the underdog fund: no suit is ever starved out of the deck ---------- */
  function topUp(run) {
    run.topUps = [];
    for (let s = 0; s < 4; s++) {
      let added = 0;
      while (added < CFG.underdogMax) {
        const tot = run.cards.filter(c => !c.chaos).length;
        if (suitCount(run, s) >= Math.ceil(CFG.underdog * tot)) break;
        run.cards.push({ s, r: rnd(run, 7, 11), gift: true });
        added++;
      }
      if (added) run.topUps.push({ horse: s, n: added });
    }
  }

  /* ---------- Scout Lens: marks suits that will NOT come next ---------- */
  function updateHint(run) {
    const L = run.lap;
    L.elim = [];
    if (!L.elimN || L.sim || !L.deck.length) return;
    const top = L.deck[L.deck.length - 1];
    const pool = [0, 1, 2, 3].filter(s => top.chaos || s !== top.s);
    shuffle(pool, run.rng);
    L.elim = pool.slice(0, L.elimN);
  }

  /* ---------- next-card bets: odds are the exact chance from the cards left in the deck ---------- */
  function betOdds(run) {
    const L = run.lap, cnts = [0, 0, 0, 0];
    let chaos = 0;
    L.deck.forEach(c => { if (c.chaos) chaos++; else cnts[c.s]++; });
    const m = L.elim.length;
    const fS = m ? 1 / 3 : 1, fC = m ? 1 / (m === 1 ? 4 : 6) : 1;
    const w = cnts.map((n, s) => (L.elim.includes(s) ? 0 : n * fS));
    const tot = w.reduce((a, b) => a + b, 0) + chaos * fC;
    return w.map((x, s) => {
      const p = tot > 0 ? x / tot : 0;
      return { s, p, n: cnts[s], out: L.elim.includes(s), open: p > 0 && !L.done && L.deck.length > 0,
        odds: p > 0 ? Math.min(20, Math.round(CFG.cardEdge / p * 100) / 100) : 0 };
    });
  }
  const betTotal = L => L.bets.reduce((a, b) => a + b, 0);
  function placeBet(run, suit, stake) {
    const L = run.lap;
    if (!L || L.done || L.sim || !CFG.cardStakes.includes(stake) || run.cash < stake) return false;
    if (betTotal(L) + stake > CFG.cardRound) return false;
    const o = betOdds(run)[suit];
    if (!o || !o.open) return false;
    L.bets[suit] += stake; run.cash -= stake; L.g.staked += stake;
    return true;
  }
  function resolveBets(run, c, bo) {
    const L = run.lap, me = meOf(run), total = betTotal(L);
    if (!total) return;
    if (c.chaos) {
      run.cash += total; L.g.staked -= total; L.bets = [0, 0, 0, 0];
      run.events.push({ type: 'bet', void: true, refund: total });
      return;
    }
    const stake = L.bets[c.s];
    const m = 1 + 0.05 * cnt(me, 'bookie') + run.fx.sharp;
    const pay = stake ? Math.round(stake * bo[c.s].odds * m) : 0;
    L.g.n++;
    if (pay) {
      run.cash += pay; L.g.ret += pay; L.g.hits++; L.streak++;
      L.g.best = Math.max(L.g.best, L.streak);
      if (!me.fin) me.sta = Math.min(100, me.sta + CFG.streakSta * Math.min(L.streak, 5));
    } else L.streak = 0;
    run.events.push({ type: 'bet', hit: !!pay, suit: c.s, stake: total, pay, net: pay - total, streak: L.streak, odds: stake ? bo[c.s].odds : 0 });
    L.bets = [0, 0, 0, 0];
  }

  /* ---------- hazards and the stamina Spur ---------- */
  function makeHazards(run, L) {
    L.hz = run.horses.map(() => {
      const arr = [];
      for (let k = 0; k < CFG.hazards; k++) {
        const base = (k + 1) / (CFG.hazards + 1);
        arr.push({ x: CFG.lapLen * (base + (run.rng() - 0.5) * 0.10), type: run.rng() < 0.5 ? 'hurdle' : 'puddle', state: 'ahead' });
      }
      return arr;
    });
  }
  function resolveHz(run, h, nx, res, auto) {
    const L = run.lap, isMe = h.i === run.me;
    nx.state = res;
    if (res === 'stumble') h.slowT = CFG.stumbleT * h.stumbleMult;
    if (res === 'perfect') h.ex += CFG.hzBoost * h.mult * h.temp;
    if (isMe && !L.sim) {
      L.hzStats[res]++;
      if (res === 'perfect') { run.cash += CFG.perfectCash; L.windfall += CFG.perfectCash; }
    }
    run.events.push({ type: 'hz', horse: h.i, res, auto: !!auto, kind: nx.type });
  }
  function hazardStep(run, h, manual) {
    const L = run.lap, nx = L.hz[h.i][h.hzi];
    if (!nx) return;
    const isMe = h.i === run.me;
    if (manual) {
      if (nx.state === 'ahead' && h.pos >= nx.x - CFG.hzWindow) {
        if (L.hurdles > 0) { L.hurdles--; resolveHz(run, h, nx, 'perfect', true); h.hzi++; return; }
        nx.state = 'open'; run.events.push({ type: 'hz_open', horse: h.i });
      }
      if (h.pos >= nx.x) { resolveHz(run, h, nx, 'stumble'); h.hzi++; }
    } else if (h.pos >= nx.x) {
      let res;
      if (isMe && L.hurdles > 0) { L.hurdles--; res = 'perfect'; }
      else {
        const r = run.rng();
        const pp = isMe ? CFG.autoPerfect : CFG.aiPerfect, pc = isMe ? CFG.autoClear : CFG.aiClear;
        res = r < pp ? 'perfect' : r < pc ? 'clear' : 'stumble';
      }
      resolveHz(run, h, nx, res);
      h.hzi++;
    }
  }
  function brace(run) {
    const L = run.lap, h = meOf(run);
    if (!L || L.done || h.fin) return null;
    const nx = L.hz[h.i][h.hzi];
    if (!nx || nx.state !== 'open') return null;
    const res = h.pos >= nx.x - CFG.hzPerfect ? 'perfect' : 'clear';
    resolveHz(run, h, nx, res);
    h.hzi++;
    return res;
  }
  const spurPower = h => CFG.spurBoost * Math.pow(h.sta / 100, CFG.spurCurve) * h.mult * h.temp;
  function doSpur(run, h) {
    const power = spurPower(h), pct = h.sta;
    h.ex += power;
    h.sta = h.sta * h.keep;
    run.events.push({ type: 'spur', horse: h.i, power, pct });
  }

  /* ---------- building a lap (also used by the bookie's simulations) ---------- */
  function buildLap(run, live) {
    const me = meOf(run);
    run.horses.forEach(h => { h.pos = 0; h.ex = 0; h.fin = false; h.finT = null; h.place = null; h.temp = 1; h.tb = 0; h.drawn = 0;
      h.sta = CFG.staStart; h.slowT = 0; h.hzi = 0; h.spurThr = 55 + run.rng() * 40; });
    const q = run.queue;
    let cards = run.cards.map(c => ({ ...c }));
    const L = { t: 0, drawTimer: CFG.drawEvery - CFG.firstDraw, deck: null, discard: [], divs: [], placeCount: 0, done: false, drawCount: 0,
      elimN: 0, elim: [], hurdles: cnt(me, 'hurdler'), bets: [0, 0, 0, 0], g: { staked: 0, ret: 0, n: 0, hits: 0, best: 0 }, streak: 0,
      hzStats: { perfect: 0, clear: 0, stumble: 0 }, divMult: 1, sabotaged: null, sim: !live, windfall: 0, calls: [], coin: null, dice: 0 };
    if (live) {
      for (let k = 0; k < cnt(me, 'dice'); k++) {
        const n = rnd(run, 1, 3);
        L.dice += n;
        for (let j = 0; j < n; j++) cards.push({ s: me.i, r: rnd(run, 9, 14), temp: true });
      }
      if (cnt(me, 'coin')) {
        const heads = run.rng() < 0.5;
        me.tb = heads ? CFG.coinHeads : CFG.coinTails;
        L.coin = heads ? 'heads' : 'tails';
      }
      L.elimN = Math.min(2, cnt(me, 'lens'));
      L.divMult = (q.double ? 2 : 1) * (cnt(me, 'ticket') ? 2 : 1);
    } else {
      cards = cards.filter(c => !c.chaos);
    }
    const deck = shuffle(cards, run.rng);
    if (live && q.cut) {
      const mineIdx = deck.map((c, i) => i).filter(i => deck[i].s === run.me && !deck[i].chaos);
      const best = mineIdx.sort((a, b) => val(deck[b]) - val(deck[a])).slice(0, 3 * q.cut).sort((a, b) => b - a);
      const picked = best.map(i => deck.splice(i, 1)[0]);
      picked.sort((a, b) => val(a) - val(b));
      picked.forEach(c => deck.push(c));
    }
    L.deck = deck;
    makeHazards(run, L);
    if (live) {
      if (q.sabotage) { const t = pointsLeader(run, me); t.temp = CFG.sabotage; L.sabotaged = t.i; }
      if (q.headstart) me.pos = CFG.headStart * q.headstart;
      L.allin = !!q.allin; L.slip = !!q.slip;
    }
    run.lap = L;
    if (live) updateHint(run);
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
        horses: run.horses.map(h => ({ ...h, up: { ...h.up } })), queue: QUEUE(), events: [], rivalLog: [], auto: true };
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
    const bo = L.sim ? null : betOdds(run);
    const c = L.deck.pop();
    L.discard.push(c);
    L.drawCount++;
    if (!L.sim) resolveBets(run, c, bo);
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
    if (!L || L.done || h.fin || h.sta < CFG.spurMin) return false;
    doSpur(run, h);
    return true;
  }

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
        const manual = h.i === run.me && !L.sim && !run.auto;
        h.sta = Math.min(100, h.sta + h.staRate * d);
        if (!manual && (h.sta >= h.spurThr || (h.pos > CFG.lapLen * 0.8 && h.sta >= 35))) doSpur(run, h);
        hazardStep(run, h, manual);
        const e = Math.exp(-h.k * d);
        const cruise = h.base + h.tb;
        const f = h.slowT > 0 ? CFG.stumbleF : 1;
        if (h.slowT > 0) h.slowT = Math.max(0, h.slowT - d);
        h.pos += f * (cruise * d + h.ex * (1 - e) / h.k);
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
      while (L.drawTimer >= CFG.drawEvery - 1e-9) { L.drawTimer -= CFG.drawEvery; drawCard(run); if (!L.sim) updateHint(run); }
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
    const pend = betTotal(L);
    if (pend) { run.cash += pend; L.g.staked -= pend; L.bets = [0, 0, 0, 0]; }
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
      dice: L.dice, coin: L.coin, gamble: { ...L.g, net: L.g.ret - L.g.staked }, hz: { ...L.hzStats },
      order: run.horses.slice().sort((a, b) => a.place - b.place).map(h => ({ i: h.i, t: h.finT, place: h.place }))
    };
    run.history.push(res);
    run.rivalLog = [];
    if (run.lapNo >= run.laps) { run.phase = 'over'; run.result = finalize(run); }
    else {
      run.horses.forEach(h => { if (h.i === run.me) return; if (run.rng() < CFG.aiChance) aiUpgrade(run, h); if (run.rng() < CFG.aiExtra) aiUpgrade(run, h); });
      run.phase = 'shop'; run.shopStop = { rerolls: 0, paid: 0 };
      run.table = { hands: 0, cur: null, last: null };
      topUp(run);
      res.topUps = run.topUps;
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
    newRun, startLap, stepLap, spur, endLap, lapOrder, runOrder, deckCounts, chaosCount,
    quote, setCall, lockSelf, cycleStake, placeBet, betOdds, brace, spurPower, topUp, reserved, spendable, comboOf, callPayout,
    owned, available, priceOf, shopSlots, makeShop, reroll, rerollCost, freeRerolls, buy, cnt, fxCash,
    tierOdds, tableOdds, tableDeal, tableGuess };
})();
if (typeof module !== 'undefined') module.exports = Engine;
