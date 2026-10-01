/* Meta progression: the Stable. Points earned at the end of a run are spent on
   permanent perks. Pure functions over a plain state object, so it can be tested in Node. */
const Meta = (() => {
  /* The Stable is a skill tree. You start in the middle and spend Stable Points to open nodes; a node can be
     bought once any node next to it (its parents) is owned. Branches: Treasury, Training Yard, Betting Ring,
     Workshop, Codex (unlocks upgrades for the shop), Jockey Club and Luck Alley (cosmetics live in their own tab).
     a = angle in degrees on the tree, r = ring (distance from the centre). */
  const BRANCHES = [
    { id: 'treasury', name: 'Treasury', a: -90, color: '#e9cf73' },
    { id: 'yard', name: 'Training Yard', a: -45, color: '#7fd49a' },
    { id: 'ring', name: 'Betting Ring', a: 0, color: '#ee8b6b' },
    { id: 'shop', name: 'Workshop', a: 45, color: '#8fb8ee' },
    { id: 'codex', name: 'Codex', a: 90, color: '#c79bf0' },
    { id: 'club', name: 'Jockey Club', a: 135, color: '#f0a8c8' },
    { id: 'luck', name: 'Luck Alley', a: 225, color: '#8fe0d6' }
  ];
  const N = (id, br, type, name, blurb, costs, parents, a, r, extra) => Object.assign({ id, br, type, name, blurb, costs, parents, a, r }, extra || {});
  const NODES = [
    // ---- Treasury
    N('deep', 'treasury', 'perk', 'Deep Pockets', 'Start every run with +$40 more cash.', [10, 18, 28, 40, 55], ['root'], -90, 1),
    N('winnings', 'treasury', 'perk', 'Bigger Winnings', 'All cash you win in a lap is 6% higher.', [15, 25, 38, 55, 75], ['deep'], -101, 2),
    N('shrewd', 'treasury', 'perk', 'Shrewd Buyer', 'Every shop price is 5% lower.', [12, 20, 30, 42, 56], ['deep'], -79, 2),
    N('purse', 'treasury', 'perk', 'Winner’s Purse', 'Stable Points earned at the end of a run are 10% higher.', [20, 35, 55], ['winnings'], -104, 3),
    N('slots', 'treasury', 'perk', 'Wider Shop', 'One more upgrade on offer at every Shop stop.', [30, 60], ['shrewd'], -77, 3),
    // ---- Training Yard
    N('training', 'yard', 'perk', 'Paddock Training', 'Your horse cruises 0.1 faster in every run.', [15, 25, 40, 60, 85], ['root'], -45, 1),
    N('loaded', 'yard', 'perk', 'Loaded Deck', 'Start every run with 1 extra card of your suit in the deck.', [12, 20, 30, 44, 60], ['training'], -57, 2),
    N('fit', 'yard', 'perk', 'Road Work', 'Start every lap with +4 stamina.', [10, 18, 28], ['training'], -33, 2),
    N('farrier', 'yard', 'perk', 'Farrier', 'Stumbles last 8% shorter.', [20, 32, 48], ['fit'], -30, 3),
    // ---- Betting Ring
    N('sharp', 'ring', 'perk', 'Bookie’s Pal', 'Every bet you win pays 4% more.', [15, 25, 40, 55], ['root'], 0, 1),
    N('odds', 'ring', 'perk', 'Better Odds', 'The bookie’s odds on your order calls are 3% fairer.', [20, 35, 55], ['sharp'], -11, 2),
    N('safety', 'ring', 'perk', 'Safety Net', 'Get 5% of every lost call stake back.', [20, 35], ['sharp'], 11, 2),
    // ---- Workshop
    N('belt', 'shop', 'perk', 'Tool Belt', 'One more gadget slot (3 instead of 2).', [60], ['root'], 45, 1),
    N('hand', 'shop', 'perk', 'Deep Sleeves', 'Hold 4 round cards instead of 3.', [40], ['belt'], 34, 2),
    N('crew2', 'shop', 'perk', 'Second Crew', 'At every pit stop, use two pit crews instead of one.', [120], ['belt'], 56, 2),
    N('pickmore', 'shop', 'perk', 'Open Stable Door', 'Your starting pick shows 4 upgrades instead of 3.', [45], ['hand'], 34, 3),
    // ---- Codex: each node adds upgrades to the shop pool
    N('cx_wild', 'codex', 'codex', 'Wild Card', 'Unlocks the Wild round card in the shop and black market.', [30], ['root'], 90, 1, { unlocks: ['wild'] }),
    N('cx_cut', 'codex', 'codex', 'Cut', 'Unlocks the Cut gadget.', [30], ['cx_wild'], 110, 2, { unlocks: ['cutg'] }),
    N('cx_dupe', 'codex', 'codex', 'Double Up', 'Unlocks the Double Up round card.', [35], ['cx_wild'], 70, 2, { unlocks: ['dupe'] }),
    N('cx_sharp', 'codex', 'codex', 'Card Tricks', 'Unlocks Wild Joker and Chaos Cards.', [35], ['cx_wild'], 90, 2, { unlocks: ['joker', 'chaos'] }),
    N('cx_draft', 'codex', 'codex', 'Draft', 'Unlocks the Draft gadget.', [40], ['cx_cut'], 118, 3, { unlocks: ['draftg'] }),
    N('cx_bank', 'codex', 'codex', 'The Vault', 'Unlocks Interest and Golden Ticket.', [45], ['cx_dupe'], 64, 3, { unlocks: ['interest', 'ticket'] }),
    N('cx_luck', 'codex', 'codex', 'Luck Locker', 'Unlocks Loaded Dice and Coin of Fate.', [45], ['cx_sharp'], 82, 3, { unlocks: ['dice', 'coin'] }),
    N('cx_crowd', 'codex', 'codex', 'Crowd Favourites', 'Unlocks Slingshot and Jackpot Deck.', [40], ['cx_sharp', 'cx_draft'], 100, 3, { unlocks: ['sling', 'jackpot'] }),
    N('cx_bets', 'codex', 'codex', 'High Stakes', 'Unlocks High Roller and Grand Slam.', [45], ['cx_bank', 'cx_luck'], 73, 4, { unlocks: ['roller', 'slam'] }),
    N('cx_hostile', 'codex', 'codex', 'Hostile Takeover', 'Unlocks the Hostile Takeover upgrade.', [60], ['cx_crowd'], 109, 4, { unlocks: ['takeover'] }),
    // ---- Jockey Club: new jockeys to ride as
    N('jk_gambler', 'club', 'jockey', 'Gambler', 'Ride as the Gambler: bets pay 10% more, one extra card-table hand.', [40], ['root'], 135, 1, { jockey: 'gambler' }),
    N('jk_trainer', 'club', 'jockey', 'Trainer', 'Ride as the Trainer: +0.04 speed, Training Gallop always offered and cheaper.', [40], ['jk_gambler'], 150, 2, { jockey: 'trainer' }),
    N('jk_banker', 'club', 'jockey', 'Banker', 'Ride as the Banker: 4% interest on unspent cash, cheaper shops.', [55], ['jk_gambler'], 125, 2, { jockey: 'banker' }),
    N('jk_saboteur', 'club', 'jockey', 'Saboteur', 'Ride as the Saboteur: more traps, earned for 2nd place too.', [50], ['jk_banker', 'jk_trainer'], 135, 3, { jockey: 'saboteur' }),
    N('jk_collector', 'club', 'jockey', 'Collector', 'Ride as the Collector: an extra gadget slot and a bigger hand.', [60], ['jk_trainer'], 148, 3, { jockey: 'collector' }),
    N('jk_daredevil', 'club', 'jockey', 'Daredevil', 'Ride as the Daredevil: huge perfect jumps, longer stumbles.', [70], ['jk_saboteur'], 135, 4, { jockey: 'daredevil' }),
    // ---- Luck Alley
    N('lucky', 'luck', 'perk', 'Lucky Stable', 'Rarer upgrades show up more often in the shop.', [25, 40, 60], ['root'], 225, 1),
    N('reroll', 'luck', 'perk', 'Free Reroll', 'One free shop reroll at every Shop stop.', [25, 50], ['lucky'], 214, 2),
    N('eagle', 'luck', 'perk', 'Eagle Eye', 'Peeking costs $3 less and burning $7 less.', [20, 35, 50], ['lucky'], 236, 2)
  ];
  /* cosmetics are not part of the tree: they are bought in the Stable's Cosmetics tab (always open) */
  const COSMETICS = [
    N('sk_gold', 'paddock', 'skin', 'Golden Coat', 'A golden coat for your horse.', [15], ['root'], 0, 0, { skin: 'gold' }),
    N('sk_midnight', 'paddock', 'skin', 'Midnight Coat', 'A dark coat with a blue shine.', [15], ['root'], 0, 0, { skin: 'midnight' }),
    N('sk_neon', 'paddock', 'skin', 'Neon Glow', 'A glowing neon coat.', [25], ['root'], 0, 0, { skin: 'neon' }),
    N('sk_ghost', 'paddock', 'skin', 'Ghost Coat', 'A pale, see-through coat.', [25], ['root'], 0, 0, { skin: 'ghost' }),
    N('th_dusk', 'paddock', 'theme', 'Dusk Track', 'A golden-hour sunset over the stadium.', [15], ['root'], 0, 0, { theme: 'dusk' }),
    N('th_turf', 'paddock', 'theme', 'Green Turf', 'A grass track under a bright daytime sky.', [25], ['root'], 0, 0, { theme: 'turf' }),
    N('th_snow', 'paddock', 'theme', 'Snow Day', 'A white winter track.', [25], ['root'], 0, 0, { theme: 'snow' }),
    N('sk_candy', 'paddock', 'skin', 'Candy Coat', 'A pastel pink-and-mint coat.', [20], ['root'], 0, 0, { skin: 'candy' }),
    N('th_neon', 'paddock', 'theme', 'Neon City', 'A glowing synthwave track.', [35], ['root'], 0, 0, { theme: 'neon' })
  ];
  const ALL = NODES.concat(COSMETICS);
  const ROOT = { id: 'root', name: 'The Stable', type: 'root', costs: [], parents: [] };
  const nodeById = id => (id === 'root' ? ROOT : ALL.find(n => n.id === id));
  const ITEMS = NODES.filter(n => n.type === 'perk');
  const SKINS = ['classic'].concat(COSMETICS.filter(n => n.skin).map(n => n.skin));
  const THEMES = ['stadium'].concat(COSMETICS.filter(n => n.theme).map(n => n.theme));

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
  const fresh = () => ({ sp: 0, levels: {}, runs: 0, champs: 0, bestPts: 0, ach: {}, maxStake: 0, daily: null, guide: false, sel: { jockey: 'rookie', skin: 'classic', theme: 'stadium' }, v: 3 });
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
  const owned = (state, id) => id === 'root' || level(state, id) > 0;
  /* a node is open when one of its neighbours towards the centre is owned */
  const isOpen = (state, id) => { const n = nodeById(id); return !!n && n.parents.some(p => owned(state, p)); };
  function costOf(state, id) {
    const it = nodeById(id);
    const l = level(state, id);
    return l >= maxOf(it) ? null : it.costs[l];
  }
  function canBuy(state, id) { const c = costOf(state, id); return c != null && state.sp >= c && isOpen(state, id); }
  function buy(state, id) {
    if (!canBuy(state, id)) return false;
    state.sp -= costOf(state, id);
    state.levels[id] = level(state, id) + 1;
    return true;
  }
  function owns(state, kind, id) {
    const n = ALL.find(x => x[kind] === id);
    return !n ? (kind === 'jockey' ? id === 'rookie' : kind === 'skin' ? id === 'classic' : id === 'stadium') : owned(state, n.id);
  }
  function select(state, kind, id) {
    if (!owns(state, kind, id)) return false;
    state.sel = Object.assign({ jockey: 'rookie', skin: 'classic', theme: 'stadium' }, state.sel); state.sel[kind] = id;
    return true;
  }
  function effects(state) {
    const L = id => level(state, id);
    const unlocked = ACH.filter(a => a.unlocks && has(state, a.id)).map(a => a.unlocks);
    NODES.forEach(n => { if (n.unlocks && owned(state, n.id)) n.unlocks.forEach(u => unlocked.push(u)); });
    const sel = Object.assign({ jockey: 'rookie', skin: 'classic', theme: 'stadium' }, state.sel);
    ['jockey', 'skin', 'theme'].forEach(k => { if (!owns(state, k, sel[k])) sel[k] = k === 'jockey' ? 'rookie' : k === 'skin' ? 'classic' : 'stadium'; });
    return {
      startCash: 90 + 40 * L('deep'),
      cashMult: 1 + 0.06 * L('winnings'),
      loaded: L('loaded'),
      baseSpeed: 0.1 * L('training'),
      discount: 0.05 * L('shrewd'),
      slots: L('slots'),
      freeRerolls: L('reroll'),
      spMult: 1 + 0.1 * L('purse'),
      luck: L('lucky'),
      sharp: 0.04 * L('sharp'),
      fit: L('fit'), farrier: L('farrier'), edge: 0.03 * L('odds'), refund: 0.05 * L('safety'), peekDisc: L('eagle'),
      gadgetSlots: L('belt'), hand: L('hand'), crewExtra: L('crew2'), pickN: 3 + L('pickmore'),
      unlocked, sel,
      jockeys: ['rookie'].concat(NODES.filter(n => n.jockey && owned(state, n.id)).map(n => n.jockey)),
      skins: ['classic'].concat(COSMETICS.filter(n => n.skin && owned(state, n.id)).map(n => n.skin)),
      themes: ['stadium'].concat(COSMETICS.filter(n => n.theme && owned(state, n.id)).map(n => n.theme))
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
        if (o && typeof o.sp === 'number') {
          const st = Object.assign(fresh(), o, { levels: Object.assign({}, o.levels), ach: Object.assign({}, o.ach), sel: Object.assign({ jockey: 'rookie', skin: 'classic', theme: 'stadium' }, o.sel) });
          // v11: the Owner's Pick perk is gone: points spent on it are refunded
          if (st.levels.owners) { st.sp += 40 * st.levels.owners; delete st.levels.owners; }
          st.v = 3;
          return st;
        }
      }
    } catch (e) {}
    return fresh();
  }
  function save(state) { try { localStorage.setItem(KEY, JSON.stringify(state)); } catch (e) {} }
  function reset() { const s = fresh(); save(s); return s; }

  return { ITEMS, NODES, COSMETICS, BRANCHES, ROOT, SKINS, THEMES, nodeById, ACH, fresh, level, maxOf, costOf, owned, isOpen, canBuy, buy, owns, select, effects, record, evaluate, has, load, save, reset };
})();
if (typeof module !== 'undefined') module.exports = Meta;
