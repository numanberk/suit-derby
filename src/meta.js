/* Meta progression: the Stable. Points earned at the end of a run are spent on
   permanent perks. Pure functions over a plain state object, so it can be tested in Node. */
const Meta = (() => {
  const ITEMS = [
    { id: 'deep', name: 'Deep Pockets', blurb: 'Start every run with +$40 more cash.', costs: [10, 18, 28, 40, 55] },
    { id: 'winnings', name: 'Bigger Winnings', blurb: 'All cash you win in a lap is 6% higher.', costs: [15, 25, 38, 55, 75] },
    { id: 'loaded', name: 'Loaded Deck', blurb: 'Start every run with 2 extra cards of your suit in the deck.', costs: [12, 20, 30, 44, 60] },
    { id: 'training', name: 'Paddock Training', blurb: 'Your horse cruises 0.1 faster in every run.', costs: [15, 25, 40, 60, 85] },
    { id: 'shrewd', name: 'Shrewd Buyer', blurb: 'Every shop price is 5% lower.', costs: [12, 20, 30, 42, 56] },
    { id: 'slots', name: 'Wider Shop', blurb: 'One more upgrade on offer at every pit stop.', costs: [30, 60] },
    { id: 'reroll', name: 'Free Reroll', blurb: 'One free shop reroll at every pit stop.', costs: [25, 50] },
    { id: 'owners', name: 'Owner’s Pick', blurb: 'Every run begins with one free random upgrade.', costs: [40] },
    { id: 'purse', name: 'Winner’s Purse', blurb: 'Stable Points earned at the end of a run are 10% higher.', costs: [20, 35, 55] },
    { id: 'lucky', name: 'Lucky Stable', blurb: 'Rarer upgrades show up more often in the shop.', costs: [25, 40, 60] },
    { id: 'sharp', name: 'Bookie’s Pal', blurb: 'Every bet you win pays 4% more.', costs: [15, 25, 40, 55] }
  ];

  const fresh = () => ({ sp: 0, levels: {}, runs: 0, champs: 0, bestPts: 0 });

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
      loaded: 2 * L('loaded'),
      baseSpeed: 0.1 * L('training'),
      discount: 0.05 * L('shrewd'),
      slots: L('slots'),
      freeRerolls: L('reroll'),
      owners: L('owners'),
      spMult: 1 + 0.1 * L('purse'),
      luck: L('lucky'),
      sharp: 0.04 * L('sharp')
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
        if (o && typeof o.sp === 'number') return Object.assign(fresh(), o, { levels: Object.assign({}, o.levels) });
      }
    } catch (e) {}
    return fresh();
  }
  function save(state) { try { localStorage.setItem(KEY, JSON.stringify(state)); } catch (e) {} }
  function reset() { const s = fresh(); save(s); return s; }

  return { ITEMS, fresh, level, maxOf, costOf, buy, effects, record, load, save, reset };
})();
if (typeof module !== 'undefined') module.exports = Meta;
