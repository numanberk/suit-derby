/* Meta progression: the Stable. Points earned at the end of a run are spent on
   permanent perks. Pure functions over a plain state object, so it can be tested in Node. */
const Meta = (() => {
  const ITEMS = [
    { id: 'deep', name: 'Deep Pockets', blurb: 'Start every run with +$40 more cash.', costs: [10, 18, 28, 40, 55] },
    { id: 'winnings', name: 'Bigger Winnings', blurb: 'All cash you win in a lap is 6% higher.', costs: [15, 25, 38, 55, 75] },
    { id: 'loaded', name: 'Loaded Deck', blurb: 'Start every run with 1 extra card of your suit in the deck.', costs: [12, 20, 30, 44, 60] },
    { id: 'training', name: 'Paddock Training', blurb: 'Your horse cruises 0.1 faster in every run.', costs: [15, 25, 40, 60, 85] },
    { id: 'shrewd', name: 'Shrewd Buyer', blurb: 'Every shop price is 5% lower.', costs: [12, 20, 30, 42, 56] },
    { id: 'slots', name: 'Wider Shop', blurb: 'One more upgrade on offer at every pit stop.', costs: [30, 60] },
    { id: 'reroll', name: 'Free Reroll', blurb: 'One free shop reroll at every pit stop.', costs: [25, 50] },
    { id: 'owners', name: 'Owner’s Pick', blurb: 'Every run begins with one free random upgrade.', costs: [40] },
    { id: 'purse', name: 'Winner’s Purse', blurb: 'Stable Points earned at the end of a run are 10% higher.', costs: [20, 35, 55] },
    { id: 'lucky', name: 'Lucky Stable', blurb: 'Rarer upgrades show up more often in the shop.', costs: [25, 40, 60] },
    { id: 'sharp', name: 'Bookie’s Pal', blurb: 'Every bet you win pays 4% more.', costs: [15, 25, 40, 55] }
  ];

  /* trophies: earned once, forever. Some of them unlock an upgrade for the shop. */
  const ACH = [
    { id: 'streak', name: 'Hot Hand', blurb: 'Hit 3 next-card bets in a row in one lap.', unlocks: 'echo' },
    { id: 'saboteur', name: 'Saboteur', blurb: 'Trip rivals with 3 traps in one run.', unlocks: 'trapper' },
    { id: 'comeback', name: 'Comeback Kid', blurb: 'Win a lap right after finishing last.', unlocks: 'phoenix' },
    { id: 'perfectionist', name: 'Perfectionist', blurb: 'Land 6 perfect jumps in one run.', unlocks: 'grit' },
    { id: 'champion', name: 'Champion', blurb: 'Win a run.' },
    { id: 'underdog', name: 'Underdog', blurb: 'Win a run after being last at a pit stop.' },
    { id: 'highroller', name: 'High Roller', blurb: 'Take $300 or more in a single lap.' },
    { id: 'marathon', name: 'Marathon', blurb: 'Finish a 10 lap run.' },
    { id: 'calls4', name: 'Clairvoyant', blurb: 'Call all four places right in one lap.' },
    { id: 'daily', name: 'Daily Rider', blurb: 'Finish a Daily Derby.' }
  ];
  const fresh = () => ({ sp: 0, levels: {}, runs: 0, champs: 0, bestPts: 0, ach: {}, maxStake: 0, daily: null, guide: false });
  const has = (state, id) => !!(state.ach && state.ach[id]);
  /* decide which trophies a finished run earned; returns the new ones and stores them */
  function evaluate(state, r, ctx) {
    ctx = ctx || {};
    const st = r.stats || {}, got = [];
    const ok = {
      streak: st.bestStreak >= 3, saboteur: st.trapHits >= 3, comeback: !!st.comeback, perfectionist: st.perfects >= 6,
      champion: !!r.champion, underdog: !!r.champion && !!st.lastAtStop, highroller: st.bestLap >= 300,
      marathon: r.laps >= 10, calls4: !!st.calls4, daily: !!ctx.daily
    };
    ACH.forEach(a => { if (ok[a.id] && !has(state, a.id)) { state.ach[a.id] = 1; got.push(a.id); } });
    let stake = null;
    if (!ctx.daily && r.champion && r.diff >= state.maxStake && state.maxStake < (ctx.maxDiff || 4)) { state.maxStake = r.diff + 1; stake = state.maxStake; }
    return { ach: got, stake };
  }

  function level(state, id) { return state.levels[id] || 0; }
  function maxOf(item) { return item.costs.length; }
  function costOf(state, id) {
    const it = ITEMS.find(x => x.id === id);
    const l = level(state, id);
    return l >= maxOf(it) ? null : it.costs[l];
  }
  function buy(state, id) {
    const c = costOf(state, id);
    if (c == null || state.sp < c) return false;
    state.sp -= c;
    state.levels[id] = level(state, id) + 1;
    return true;
  }
  function effects(state) {
    const L = id => level(state, id);
    return {
      startCash: 90 + 40 * L('deep'),
      cashMult: 1 + 0.06 * L('winnings'),
      loaded: L('loaded'),
      baseSpeed: 0.1 * L('training'),
      discount: 0.05 * L('shrewd'),
      slots: L('slots'),
      freeRerolls: L('reroll'),
      owners: L('owners'),
      spMult: 1 + 0.1 * L('purse'),
      luck: L('lucky'),
      sharp: 0.04 * L('sharp'),
      unlocked: ACH.filter(a => a.unlocks && has(state, a.id)).map(a => a.unlocks)
    };
  }
  function record(state, sp, champion, pts) {
    state.sp += sp;
    state.runs++;
    if (champion) state.champs++;
    state.bestPts = Math.max(state.bestPts, pts);
  }
  const KEY = 'suitderby.v2';
  function load() {
    try {
      const raw = localStorage.getItem(KEY);
      if (raw) {
        const o = JSON.parse(raw);
        if (o && typeof o.sp === 'number') return Object.assign(fresh(), o, { levels: Object.assign({}, o.levels), ach: Object.assign({}, o.ach) });
      }
    } catch (e) {}
    return fresh();
  }
  function save(state) { try { localStorage.setItem(KEY, JSON.stringify(state)); } catch (e) {} }
  function reset() { const s = fresh(); save(s); return s; }

  return { ITEMS, ACH, fresh, level, maxOf, costOf, buy, effects, record, evaluate, has, load, save, reset };
})();
if (typeof module !== 'undefined') module.exports = Meta;
