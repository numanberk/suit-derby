/* Gambler's Night UI. Screens: setup, the book (call the order), the race (card by card), the backroom, night over, Reputation. */
(function () {
  'use strict';
  var G = Gamble, GM = G.Meta, U = window.__ui, I = I18n, T = I.t, TP = I.tp, CFG = G.CFG;
  var $ = function (s, r) { return (r || document).querySelector(s); };
  var $$ = function (s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); };
  var money = U.money, ord = U.ord, go = U.go, onEnter = U.onEnter;

  var GS = { meta: GM.load(), run: null, len: 5, tool: null, recall: null, auto: 0, timer: null, log: [], prevP: null, last: null, tree: { sel: null, seen: null }, recorded: false, doneShown: false, resetArm: 0 };
  var KEY = 'suitderby.grun', SV = 1;

  /* ---------- save and resume ---------- */
  function saveRun() {
    var R = GS.run; if (!R || R.phase === 'over') return;
    try { localStorage.setItem(KEY, JSON.stringify({ v: SV, run: G.pack(R), len: GS.len, log: GS.log.slice(-8) })); } catch (e) {}
  }
  function clearRun() { try { localStorage.removeItem(KEY); } catch (e) {} }
  function loadRun() {
    try { var d = JSON.parse(localStorage.getItem(KEY)); if (d && d.v === SV && d.run && d.run.race && d.run.phase !== 'over') return d; } catch (e) {}
    return null;
  }
  document.addEventListener('visibilitychange', function () { if (document.hidden) saveRun(); });
  window.addEventListener('pagehide', saveRun);

  /* ---------- small helpers ---------- */
  function sn(i) { return T(G.SUITS[i].name); }
  function gl(i) { return '<span class="g s' + i + '">' + G.SUITS[i].glyph + '</span>'; }
  function lab(c) { var l = G.label(c); return I.lang === 'tr' ? ({ J: 'V', Q: 'K', K: 'P' }[l] || l) : l; }
  function cardHTML(c, cls) { return '<span class="gc s' + c.s + (c.r >= 11 ? ' fc' : '') + (cls ? ' ' + cls : '') + '"><b>' + lab(c) + '</b><i>' + G.SUITS[c.s].glyph + '</i></span>'; }
  function oddsTxt(o) { return '×' + I.n(o.toFixed(2)); }
  function pct(p) { return I.n(Math.round(p * 100)) + '%'; }
  function f1(x) { return I.n(x.toFixed(1)); }
  function toolName(id) { return T(G.TOOLS[id].name); }
  var PLACES = ['1st', '2nd', '3rd', '4th'];
  function placeName(pl) { return ord(pl + 1); }
  function log(text) { GS.log.push(text); if (GS.log.length > 40) GS.log.shift(); }
  function bankHTML(R) {
    return '<div class="cashchip gbank" title="' + T('Your bankroll. What is left at the end of the night is your score.') + '">' + money(R.cash) + (R.debt ? '<small>' + T('owe {m}', { m: money(R.debt) }) + '</small>' : '') + '</div>';
  }
  function heatHTML(R) {
    var cap = G.heatCap(R), h = R.heat, w = Math.min(100, h / cap * 100), warn = CFG.warnHeat / cap * 100;
    var st = h < 3 ? 'Calm' : h < CFG.warnHeat ? 'Warm' : h < cap - 2 ? 'The stewards are watching' : 'Danger';
    var ins = G.inspectChance(R);
    return '<div class="gheat st-' + (h < 3 ? 0 : h < CFG.warnHeat ? 1 : h < cap - 2 ? 2 : 3) + '"><span class="lbl">' + T('Heat') + '</span><div class="hbar" role="img" aria-label="' + T('Heat {h} of {c}', { h: f1(h), c: cap }) + '"><i style="width:' + w.toFixed(1) + '%"></i><u style="left:' + warn.toFixed(1) + '%"></u></div><b class="mono">' + f1(h) + ' / ' + cap + '</b><small>' + T(st) + (ins > 0 ? ' · ' + T('{p} inspection chance', { p: pct(ins) }) : '') + '</small></div>';
  }
  function quit() {
    stopAuto(); saveRun(); go('menu');
  }

  /* ---------- menu hooks ---------- */
  var prevMenu = onEnter.menu;
  onEnter.menu = function () {
    prevMenu();
    $('#menu-rp').textContent = T('Permanent upgrades · {n} RP', { n: GS.meta.sp });
    $('#menu-stats').textContent = GS.meta.nights ? T('{n} nights · best {p}', { n: GS.meta.nights, p: money(GS.meta.best, true) }) : T('No nights yet.');
    var sv = loadRun(), b = $('#gResume'); b.hidden = !sv;
    if (sv) { var r = sv.run; $('#gresume-sub').textContent = T('Race {n} of {m}', { n: r.raceNo, m: r.races }) + ' · ' + money(r.cash) + (r.phase === 'back' || r.phase === 'result' ? ' · ' + T('in the backroom') : ''); }
  };
  $('#gResume').addEventListener('click', function () {
    var sv = loadRun(); if (!sv) return;
    GS.run = G.unpack(sv.run); GS.len = sv.len || 5; GS.log = sv.log || []; GS.tool = null; GS.recall = null; GS.recorded = false; GS.doneShown = !!GS.run.race.done; GS.prevP = null;
    show();
  });

  /* ---------- phase router ---------- */
  function show() {
    var R = GS.run, ph = R.phase;
    go(ph === 'book' ? 'gbook' : ph === 'race' ? 'grace' : ph === 'over' ? 'gover' : 'gback');
  }

  /* ---------- setup ---------- */
  onEnter.gsetup = function () { renderSetup(); U.guideOnce(); };
  function renderSetup() {
    var fx = GM.effects(GS.meta), el = $('#s-gsetup');
    if (GS.len === CFG.nightLong && !fx.longNight) GS.len = CFG.night;
    var sv = loadRun();
    el.innerHTML = '<header class="bar"><button type="button" class="backbtn" data-go="menu">&larr; <span>' + T('Menu') + '</span></button><h2>' + T('Gambler’s Night') + '</h2><div class="cashchip sp">' + T('{n} RP', { n: GS.meta.sp }) + '</div></header>' +
      '<p class="lede">' + T('You are not an owner tonight. You are a gambler with a pocket full of tricks. Call the order all four horses will finish in, then bend the deck and the track your way. Do not get caught.') + '</p>' +
      '<div class="gsteps">' +
      '<div class="gstep"><b>1 · ' + T('Read') + '</b><p>' + T('Study the deck sheet and the board. The book prices every race from a flawed view of the deck, and it tells you which flaw. Beat it.') + '</p></div>' +
      '<div class="gstep"><b>2 · ' + T('Call') + '</b><p>' + T('Pick a horse for each place and size each stake, add a head-to-head or two, then lock your slip before the first card.') + '</p></div>' +
      '<div class="gstep"><b>3 · ' + T('Rig') + '</b><p>' + T('Cards are time. Between draws, spend cash on tools that nudge the deck or the track.') + '</p></div>' +
      '<div class="gstep"><b>4 · ' + T('Stay clean') + '</b><p>' + T('Every trick adds Heat. Too much and the stewards inspect you, fine you, or throw out your slip.') + '</p></div></div>' +
      '<details class="gtl"><summary>' + T('All tools and Heat') + '</summary><ul>' + G.TOOL_ORDER.map(function (id) {
        var t = G.TOOLS[id], open = fx.tools.indexOf(id) >= 0;
        return '<li' + (open ? '' : ' class="dim"') + '><b>' + (open ? '' : '🔒 ') + toolName(id) + '</b> <span class="mono">' + money(t.cost) + (t.heat ? ' · ' + T('Heat +{h}', { h: t.heat }) : '') + ' · ' + (t.night ? T('once a night') : T('{n} per race', { n: t.uses })) + '</span><br><small>' + T(t.blurb) + '</small></li>';
      }).join('') + '</ul><p class="note">' + T('Heat cools a little with every card drawn without a trick, and between races. From {w} Heat every trick risks a steward inspection: a fine, and the tool is taken away. At {c} Heat you are caught: your slip is void and you are fined.', { w: CFG.warnHeat, c: G.heatCap({ fx: fx }) }) + '</p></details>' +
      '<h3 class="lbl">' + T('Length of the night') + '</h3><div class="pills" role="radiogroup" aria-label="' + T('Length of the night') + '">' +
      [CFG.night, CFG.nightLong].map(function (n) {
        var lock = n === CFG.nightLong && !fx.longNight;
        return '<label class="pill"><input type="radio" name="glen" value="' + n + '"' + (n === GS.len ? ' checked' : '') + (lock ? ' disabled' : '') + '><b>' + TP(n, '{n} race', '{n} races') + '</b><span>' + (lock ? T('Unlock “Long Night” in Reputation') : n === CFG.night ? T('A short night') : T('A long night')) + '</span></label>';
      }).join('') + '</div>' +
      '<p class="note">' + T('You start with {m}. What you hold at the end of the night, minus any debt, is your score, and it earns Reputation Points (RP).', { m: money(fx.startCash) }) + '</p>' +
      (sv ? '<p class="note warn">' + T('Starting a new night replaces your saved night.') + '</p>' : '') +
      '<div class="actions"><button type="button" class="btn primary" id="gStart">' + T('Start the night') + '</button><button type="button" class="btn" data-go="grep">' + T('Reputation') + '</button></div>';
  }
  $('#s-gsetup').addEventListener('change', function (e) { if (e.target.name === 'glen') GS.len = +e.target.value; });
  $('#s-gsetup').addEventListener('click', function (e) {
    if (!e.target.closest('#gStart')) return;
    Sfx.click(); startNight();
  });
  function startNight() {
    stopAuto();
    GS.run = G.newNight({ meta: GM.effects(GS.meta), races: GS.len });
    GS.log = []; GS.tool = null; GS.recall = null; GS.recorded = false; GS.doneShown = false; GS.prevP = null; GS.last = null;
    saveRun(); show();
  }

  /* ---------- the book: read the deck, call the order ---------- */
  onEnter.gbook = renderBook;
  function deckSheet(R) {
    var r = R.race;
    return r.comp.map(function (c, s) {
      var steps = c.n + c.f * 2;
      return '<div class="dsr s' + s + '"><span class="dsn">' + gl(s) + ' <b>' + sn(s) + '</b></span><span class="dsc">' + T('{n} plain', { n: c.n }) + ' · ' + T('{n} face', { n: c.f }) + '</span><span class="dss mono">' + TP(steps, '{n} step in the deck', '{n} steps in the deck') + '</span><i class="dsbar" style="--w:' + Math.round(steps / 15 * 100) + '%"></i></div>';
    }).join('');
  }
  function topHTML(R) {
    var r = R.race;
    if (!r.pk || !r.deck.length) return '';
    return '<div class="gtop"><span class="lbl">' + T('Top of the deck') + '</span>' + r.deck.slice(0, r.pk).map(function (c) { return cardHTML(c); }).join('') + '</div>';
  }
  function quirkHTML(r) {
    var id = G.quirkOf(r), q = G.QUIRKS[id];
    return '<div class="gqk q-' + id + '"><span class="lbl">' + T('Tonight’s book') + '</span><b>' + T(q.name) + '</b><p>' + T(q.blurb) + '</p></div>';
  }
  /* Bookie's Tell: a mark where the book's price is off. Level 2 also shows by how many points. */
  function tellHTML(R, c) {
    var m = G.tellMark(R, c); if (!m) return '';
    var pts = Math.round(Math.abs(c.d) * 100);
    return '<i class="gtell ' + (m > 0 ? 'up' : 'dn') + '" title="' + T(m > 0 ? 'The book undersells this.' : 'The book oversells this.') + '">' + (m > 0 ? '▲' : '▼') + (R.fx.tell > 1 ? pts : '') + '</i>';
  }
  function pickLines(R) {
    var r = R.race, du = G.duelsOf(R), html = '';
    function line(kind, idx, label, odds, stake) {
      return '<div class="gpick"><span class="gpn">' + label + '</span><span class="mono dim">' + oddsTxt(odds) + '</span><span class="gps"><button type="button" class="gpb" data-gstep="' + kind + ',' + idx + ',-1" aria-label="' + T('Smaller stake') + '"' + (stake <= R.fx.chips[0] ? ' disabled' : '') + '>−</button><b class="mono">' + money(stake) + '</b><button type="button" class="gpb" data-gstep="' + kind + ',' + idx + ',1" aria-label="' + T('Bigger stake') + '"' + (stake >= R.fx.chips[R.fx.chips.length - 1] ? ' disabled' : '') + '>+</button></span></div>';
    }
    var b = G.board(R), db = r.dbets.some(Boolean) ? G.duelBoard(R) : [];
    r.slip.forEach(function (s, pl) { if (s) html += line('p', pl, '<b class="mono">' + placeName(pl) + '</b>' + gl(s.h) + ' ' + sn(s.h), b[s.h][pl].odds, s.stake); });
    r.dbets.forEach(function (d, i) { if (d && du[i]) { var row = db[i], over = du[i][0] === d.h ? du[i][1] : du[i][0]; html += line('d', i, gl(d.h) + ' ' + T('{s} ahead of {o}', { s: sn(d.h), o: sn(over) }), d.h === row.a ? row.oa : row.ob, d.stake); } });
    return html ? '<div class="gpicks">' + html + '</div>' : '';
  }
  function duelsHTML(R) {
    var r = R.race, rows = G.duelBoard(R);
    return '<h3 class="lbl gduh">' + T('Head to head') + '</h3><div class="gduels">' + rows.map(function (d, i) {
      var cur = r.dbets[i];
      function btn(h, other, o, p, t) {
        var on = cur && cur.h === h, c = { d: t - p };
        return '<button type="button" class="gcell gdbtn s' + h + (on ? ' on' : '') + '" data-gduel="' + i + ',' + h + '" aria-pressed="' + on + '">' + '<span class="gdn">' + gl(h) + ' ' + T('{s} ahead', { s: sn(h) }) + '</span><b class="mono">' + oddsTxt(o) + '</b><small class="mono">' + pct(p) + '</small>' + tellHTML(R, c) + '</button>';
      }
      return '<div class="gduel">' + btn(d.a, d.b, d.oa, d.pa, d.ta) + '<span class="gvs mono">' + T('vs') + '</span>' + btn(d.b, d.a, d.ob, d.pb, d.tb) + '</div>';
    }).join('') + '</div>';
  }
  function renderBook() {
    var R = GS.run; if (!R) return; var r = R.race, el = $('#s-gbook'), b = G.board(R), n = r.slip.filter(Boolean).length, nd = r.dbets.filter(Boolean).length;
    var full = n === 4, order = full ? r.slip.map(function (s) { return s.h; }) : null;
    var placeTotal = r.slip.reduce(function (a, s) { return a + (s ? s.stake : 0); }, 0), total = G.staked(R);
    var pm = full ? G.perfectMult(R, order) : 0, pc = full ? G.orderChance(R, order) : 0;
    var rows = '<div class="gboard" role="group" aria-label="' + T('Call the order') + '"><span class="gb-h"></span>' + [0, 1, 2, 3].map(function (pl) { return '<span class="gb-h mono">' + placeName(pl) + '</span>'; }).join('');
    for (var h = 0; h < 4; h++) {
      rows += '<span class="gb-n s' + h + '">' + gl(h) + ' ' + sn(h) + '</span>';
      for (var pl = 0; pl < 4; pl++) {
        var on = r.slip[pl] && r.slip[pl].h === h, c = b[h][pl];
        rows += '<button type="button" class="gcell s' + h + (on ? ' on' : '') + '" data-gcell="' + pl + ',' + h + '" aria-pressed="' + on + '"><b class="mono">' + oddsTxt(c.odds) + '</b><small class="mono">' + pct(c.p) + '</small>' + tellHTML(R, c) + '</button>';
      }
    }
    rows += '</div>';
    var chips = R.fx.chips.map(function (v) { return '<button type="button" class="gchip' + (R.chip === v ? ' on' : '') + '" data-gchip="' + v + '"' + (v > R.cash ? ' disabled' : '') + '>' + money(v) + '</button>'; }).join('');
    var pk = G.toolState(R, 'peek');
    el.innerHTML = '<header class="bar gbar"><button type="button" class="backbtn" data-gquit>&larr; <span>' + T('Menu') + '</span></button><h2>' + T('Race {n} of {m}', { n: R.raceNo, m: R.races }) + '</h2>' + bankHTML(R) + '</header>' +
      heatHTML(R) +
      '<div class="gcols"><div><h3 class="lbl">' + T('The deck') + '</h3><div class="dsheet">' + deckSheet(R) + '</div>' +
      '<p class="note">' + T('First to {n} steps crosses the line. A plain card moves its horse 1 step, a face card 2. The race ends when 3 horses have crossed. The order of the cards is the only secret.', { n: CFG.track }) + '</p>' +
      '<p class="note">' + T('The board is the book’s opinion. The deck sheet is the truth. Compare them.') + '</p>' + topHTML(R) + '</div>' +
      '<div>' + quirkHTML(r) + '<h3 class="lbl">' + T('Call the order') + '</h3>' + rows + duelsHTML(R) +
      '<div class="gslipbar"><span class="lbl">' + T('Stake for every pick') + '</span><div class="gchips">' + chips + '</div></div>' + pickLines(R) +
      '<p class="gsum">' + (n + nd ? T('{n} bets · {m} at stake', { n: n + nd, m: money(total) }) : T('Pick a horse for each place you want to back. A horse can hold one place.')) +
      (total > R.cash ? '<br><span class="neg">' + T('Not enough cash for that. Pick a smaller chip or back fewer places.') + '</span>' : '') +
      (full ? '<br><span class="gold">' + T('Perfect order: {c} chance, pays {m} extra', { c: pc < 0.01 ? '&lt;1%' : pct(pc), m: money(Math.round(placeTotal * pm)) }) + '</span>' : '') + '</p>' +
      '<div class="actions gact"><button type="button" class="btn" data-gbest' + (n === 4 ? ' disabled' : '') + '>' + T('Back the board’s favorite') + '</button>' +
      '<button type="button" class="btn" data-gtool="peek"' + (pk.ok ? '' : ' disabled') + '>' + T('Peek · {m}', { m: money(pk.cost) }) + ' <small>' + pk.left + '/' + pk.max + '</small></button>' +
      '<button type="button" class="btn primary" data-glock' + (G.canLock(R) ? '' : ' disabled') + '>' + T('Lock in your call') + '</button></div>' +
      '<p class="note">' + T('Odds lock when you do. After that you can still change a pick, for a fee, at the odds of that moment.') + '</p>' +
      (R.cash < R.fx.chips[0] ? '<div class="gbanner bad">' + T('You are broke: not enough for even the smallest chip. Borrow in the backroom next time, or walk out now.') + '</div>' : '') +
      '<div class="actions"><button type="button" class="btn ghost small" data-gwalk>' + T('Walk out with {m}', { m: money(R.cash - R.debt) }) + '</button></div></div></div>';
  }
  $('#s-gbook').addEventListener('click', function (e) {
    var R = GS.run; if (!R) return; var t = e.target;
    var c = t.closest('[data-gcell]');
    if (c) { var p = c.dataset.gcell.split(','); if (G.pick(R, +p[0], +p[1])) { Sfx.pick(); saveRun(); renderBook(); } return; }
    c = t.closest('[data-gduel]'); if (c) { var d = c.dataset.gduel.split(','); if (G.duelPick(R, +d[0], +d[1])) { Sfx.pick(); saveRun(); renderBook(); } return; }
    c = t.closest('[data-gstep]'); if (c) { var q = c.dataset.gstep.split(','); if (G.stepStake(R, q[0], +q[1], +q[2])) { Sfx.chip(); saveRun(); renderBook(); } else Sfx.deny(); return; }
    c = t.closest('[data-gchip]'); if (c) { if (G.setChip(R, +c.dataset.gchip)) { Sfx.chip(); saveRun(); renderBook(); } return; }
    if (t.closest('[data-gbest]')) { if (G.pickFavorite(R)) { Sfx.pick(); saveRun(); renderBook(); } else Sfx.deny(); return; }
    c = t.closest('[data-gtool]'); if (c) { runTool(c.dataset.gtool); return; }
    if (t.closest('[data-glock]')) {
      if (G.lock(R)) { Sfx.chip(); GS.last = null; GS.prevP = null; GS.doneShown = false; GS.auto = 0; log(T('Slip locked. The race is on.')); saveRun(); show(); } else Sfx.deny();
      return;
    }
    if (t.closest('[data-gwalk]')) { if (G.walkOut(R)) { saveRun(); overHook(); show(); } return; }
    if (t.closest('[data-gquit]')) quit();
  });

  /* ---------- the race ---------- */
  onEnter.grace = function () { buildRace(); renderRace(); updateLanes(true); };
  function buildRace() {
    var el = $('#s-grace');
    el.innerHTML = '<header class="bar gbar"><button type="button" class="backbtn" data-gquit>&larr; <span>' + T('Menu') + '</span></button><h2 id="gr-title"></h2><div id="gr-bank"></div></header>' +
      '<div id="gr-heat"></div>' +
      '<div class="glanes" id="glanes">' + [0, 1, 2, 3].map(function (i) {
        return '<div class="gl s' + i + '" id="gl' + i + '"><div class="glname">' + gl(i) + '<b>' + sn(i) + '</b></div><div class="gtrack"><i class="gfin"></i><div class="gh" id="gh' + i + '">' + U.horseSVG(i) + '</div><span class="gfx" id="gfx' + i + '"></span><span class="gplace mono" id="gpl' + i + '"></span><span class="gtags" id="gtg' + i + '"></span><span class="gstep mono" id="gst' + i + '"></span></div></div>';
      }).join('') + '</div>' +
      '<div class="gmid"><div class="gcardbox"><span class="lbl">' + T('Last card') + '</span><div id="glast" class="glast"><span class="gc bk"><b>·</b></span></div></div>' +
      '<div class="gcardbox"><span class="lbl">' + T('Top of the deck') + '</span><div id="gnext" class="glast"></div></div>' +
      '<div class="gdeck" id="gdeck"></div></div>' +
      '<div class="gctl" id="gctl"></div>' +
      '<div class="gbanner" id="gbanner" hidden></div>' +
      '<div class="gcols gr"><div><h3 class="lbl">' + T('Your slip') + '</h3><div id="gslip"></div></div>' +
      '<div><h3 class="lbl">' + T('Tools') + '</h3><div id="gtarget"></div><div class="gtools" id="gtools"></div></div></div>' +
      '<h3 class="lbl">' + T('Track talk') + '</h3><ul class="glog" id="glog"></ul>';
  }
  function renderRace() {
    var R = GS.run; if (!R || R.phase !== 'race' && R.phase !== 'result') return;
    var r = R.race;
    $('#gr-title').textContent = T('Race {n} of {m}', { n: R.raceNo, m: R.races }) + ' · ' + TP(r.draws, '{n} card drawn', '{n} cards drawn');
    $('#gr-bank').innerHTML = bankHTML(R); $('#gr-heat').innerHTML = heatHTML(R);
    renderControls(); renderDeckRace(); renderSlip(); renderTools(); renderLog(); renderNext();
    var bn = $('#gbanner');
    if (r.caught) { bn.hidden = false; bn.className = 'gbanner bad'; bn.textContent = T('Caught! Your slip is void for this race. The cards are still going to run it out.'); }
    else bn.hidden = true;
  }
  function renderControls() {
    var R = GS.run, r = R.race, el = $('#gctl');
    if (r.done) { el.innerHTML = '<button type="button" class="btn primary gbig" data-gresult>' + T('See the result') + '</button>'; return; }
    el.innerHTML = '<button type="button" class="btn primary gbig" data-gdraw' + (GS.auto ? ' disabled' : '') + '>' + T('Draw a card') + '</button>' +
      '<button type="button" class="btn" data-gauto>' + (GS.auto === 1 ? T('Stop') : T('Auto')) + '</button>' +
      '<button type="button" class="btn" data-gfast>' + (GS.auto === 2 ? T('Stop') : T('Fast')) + '</button>';
  }
  function renderNext() {
    var R = GS.run, r = R.race, el = $('#gnext'), last = $('#glast');
    el.innerHTML = r.pk && r.deck.length ? r.deck.slice(0, r.pk).map(function (c) { return cardHTML(c); }).join('') : '<span class="gc bk"><b>?</b></span>';
    if (GS.last) last.innerHTML = cardHTML(GS.last.card, 'gpp') + '<small class="mono">' + (GS.last.steps ? '+' + GS.last.steps : '0') + '</small>';
  }
  function renderDeckRace() {
    var R = GS.run, r = R.race, n = [0, 0, 0, 0], f = [0, 0, 0, 0], steps = 0;
    r.deck.forEach(function (c) { if (c.r >= 11) f[c.s]++; else n[c.s]++; steps += G.stepOf(c); });
    $('#gdeck').innerHTML = '<span class="lbl">' + TP(r.deck.length, '{n} card left', '{n} cards left') + '</span><div class="dk">' + [0, 1, 2, 3].map(function (s) {
      return '<span class="dkc s' + s + '">' + gl(s) + '<b class="mono">' + n[s] + '</b><small class="mono">+' + f[s] + '</small></span>';
    }).join('') + '</div>';
  }
  function updateLanes(instant) {
    var R = GS.run; if (!R) return; var r = R.race;
    for (var i = 0; i < 4; i++) {
      var h = $('#gh' + i); if (!h) return;
      var pos = Math.min(1, r.prog[i] / CFG.track);
      h.style.left = (pos * 86).toFixed(1) + '%';
      $('#gst' + i).textContent = Math.min(r.prog[i], CFG.track) + '/' + CFG.track;
      var l = r.lane[i], fx = '';
      if (l.mud) fx += '<em class="mud" title="' + T('Mud') + '">🟤' + l.mud + '</em>';
      if (l.wind) fx += '<em class="wind" title="' + T('Tailwind') + '">💨' + l.wind + '</em>';
      if (l.hurdle) fx += '<em class="hur" title="' + T('Hurdle') + '">🚧</em>';
      $('#gfx' + i).innerHTML = fx;
      var pi = r.finished.indexOf(i);
      $('#gpl' + i).textContent = pi >= 0 ? ord(pi + 1) : '';
      $('#gl' + i).classList.toggle('fin', pi >= 0);
      var tags = '';
      r.slip.forEach(function (s, pl) { if (s && s.h === i) tags += '<span class="gtag' + (r.finished.length > pl ? (r.order && r.order[pl] === i || r.finished[pl] === i ? ' hit' : ' miss') : '') + '">' + placeName(pl) + '</span>'; });
      $('#gtg' + i).innerHTML = tags;
    }
  }
  function renderSlip() {
    var R = GS.run, r = R.race, b = G.board(R), html = '';
    for (var pl = 0; pl < 4; pl++) {
      var s = r.slip[pl], settled = r.finished.length > pl || (r.done && r.order);
      if (!s) { html += '<div class="gsl empty"><b class="mono">' + placeName(pl) + '</b><span class="dim">' + T('no bet') + '</span></div>'; continue; }
      var live = b[s.h][pl], res = '';
      if (settled) {
        var actual = r.order ? r.order[pl] : r.finished[pl], hit = actual === s.h;
        res = '<span class="gres ' + (hit ? 'pos' : 'neg') + '">' + (r.caught ? T('void') : hit ? '✓ ' + money(Math.round(s.stake * s.odds), true) : '✗ ' + gl(actual)) + '</span>';
      } else {
        res = '<span class="glive mono">' + T('now {p}', { p: pct(live.p) }) + '</span>' + (!r.caught && !r.done && r.finished.length <= pl ? '<button type="button" class="btn small" data-grecall="' + pl + '">' + (GS.recall === pl ? T('Cancel') : T('Change')) + '</button>' : '');
      }
      html += '<div class="gsl s' + s.h + '"><b class="mono">' + placeName(pl) + '</b>' + gl(s.h) + '<span class="gsn">' + sn(s.h) + '</span><span class="mono dim">' + oddsTxt(s.odds) + ' · ' + money(s.stake) + '</span>' + res + '</div>';
      if (GS.recall === pl && !settled) {
        var fee = G.recallFee(R, pl);
        html += '<div class="grc"><span class="note">' + T('Change place {p} for a {f} fee, at the odds of now:', { p: placeName(pl), f: money(fee) }) + '</span>' + [0, 1, 2, 3].filter(function (h) { return h !== s.h && G.canRecall(R, pl, h); }).map(function (h) {
          return '<button type="button" class="gcell s' + h + '" data-grecall-to="' + pl + ',' + h + '"' + (R.cash < fee ? ' disabled' : '') + '>' + gl(h) + ' <b class="mono">' + oddsTxt(b[h][pl].odds) + '</b><small class="mono">' + pct(b[h][pl].p) + '</small></button>';
        }).join('') + '</div>';
      }
    }
    (r.duels || []).forEach(function (du, i) {
      var d = r.dbets[i]; if (!d) return;
      var over = du[0] === d.h ? du[1] : du[0], fa = r.finished.indexOf(d.h), fb = r.finished.indexOf(over), settled = r.done || fa >= 0 || fb >= 0, res;
      if (settled) {
        var hit = r.done && r.order ? r.order.indexOf(d.h) < r.order.indexOf(over) : (fa >= 0 && (fb < 0 || fa < fb));
        res = '<span class="gres ' + (hit && !r.caught ? 'pos' : 'neg') + '">' + (r.caught ? T('void') : hit ? '✓ ' + money(Math.round(d.stake * d.odds), true) : '✗') + '</span>';
      } else res = '<span class="glive mono dim">' + T('pending') + '</span>';
      html += '<div class="gsl gduelrow s' + d.h + '"><b class="mono">⇄</b>' + gl(d.h) + '<span class="gsn">' + T('{s} ahead of {o}', { s: sn(d.h), o: sn(over) }) + '</span><span class="mono dim">' + oddsTxt(d.odds) + ' · ' + money(d.stake) + '</span>' + res + '<span></span></div>';
    });
    html += '<p class="note">' + T('Cash {m} · slip {s} · re-calls cost a fee each', { m: money(R.cash), s: money(G.staked(R)) }) + '</p>';
    $('#gslip').innerHTML = html;
  }
  var WHY = { locked: 'Not unlocked yet. Open it in Reputation.', caught: 'You are out of this race.', confiscated: 'The stewards took it.', uses: 'No uses left this race.', night: 'Used up for tonight.', cash: 'Not enough cash.', phase: 'Not now.', none: 'No such card left.', top: 'It is already on top.', same: 'Both cards are the same suit.', finished: 'That horse has already finished.', lead: 'That horse is already in front.', empty: 'The deck is empty.', target: 'Pick a target first.' };
  function renderTools() {
    var R = GS.run, html = '';
    G.TOOL_ORDER.forEach(function (id) {
      var T0 = G.TOOLS[id], ts = G.toolState(R, id), lock = ts.why === 'locked';
      html += '<button type="button" class="gtool k-' + T0.kind + (GS.tool === id ? ' on' : '') + (lock ? ' lock' : '') + '" data-gtool="' + id + '"' + (ts.ok ? '' : ' aria-disabled="true"') + ' title="' + T(T0.blurb) + '"><b>' + (lock ? '🔒 ' : '') + toolName(id) + '</b><span class="mono">' + money(ts.cost) + (ts.heat ? ' · ' + T('Heat +{h}', { h: ts.heat }) : '') + '</span><small>' + (lock ? T('locked') : TP(ts.left, '{n} use left', '{n} uses left')) + '</small></button>';
    });
    $('#gtools').innerHTML = html;
    var tg = GS.tool, el = $('#gtarget');
    if (!tg) { el.innerHTML = ''; return; }
    var tt = G.TOOLS[tg];
    el.innerHTML = '<div class="gtgt"><span><b>' + toolName(tg) + '</b> · ' + T(tt.blurb) + '</span><div>' + [0, 1, 2, 3].map(function (h) {
      return '<button type="button" class="gcell s' + h + '" data-gtarget="' + h + '"' + (R.race.finished.indexOf(h) >= 0 && tt.target === 'horse' ? ' disabled' : '') + '>' + gl(h) + ' ' + sn(h) + '</button>';
    }).join('') + '<button type="button" class="btn small" data-gtarget="x">' + T('Cancel') + '</button></div></div>';
  }
  function renderLog() { $('#glog').innerHTML = GS.log.slice(-6).reverse().map(function (t) { return '<li>' + t + '</li>'; }).join(''); }

  /* tools */
  function runTool(id, arg) {
    var R = GS.run, T0 = G.TOOLS[id]; stopAuto();
    var ts = G.toolState(R, id);
    if (!ts.ok) { Sfx.deny(); log(T(WHY[ts.why] || 'Not now.')); refreshAny(); return; }
    if (T0.target && arg == null) { GS.tool = GS.tool === id ? null : id; Sfx.pick(); refreshAny(); return; }
    var res = G.useTool(R, id, arg);
    GS.tool = null;
    if (!res.ok) { Sfx.deny(); log(T(WHY[res.why] || 'Not now.')); refreshAny(); return; }
    res.events.forEach(function (ev) {
      if (ev.t === 'tool') {
        var s = arg != null ? sn(arg) : '';
        var m = { peek: 'You peek at the top of the deck.', burn: 'A card goes in the bin.', swap: 'The top two cards swap places.', stack: 'A {s} card is on top now.', shave: 'A plain {s} card quietly disappears.', riffle: 'The deck is reshuffled.', mud: 'Mud in the {s} lane.', wind: 'A tailwind for {s}.', hurdle: 'A hurdle in front of {s}.', lane: '{s} slips past {o}.' }[id];
        log(T(m, { s: s, o: ev.msg != null ? sn(ev.msg) : '' }));
        if (id === 'peek') Sfx.peek(); else if (id === 'burn') Sfx.burn(); else if (G.TOOLS[id].kind === 'deck') Sfx.shuffle(); else Sfx.trap();
      } else if (ev.t === 'inspect') {
        log(T('Steward inspection! Fine {m}, and the {t} is confiscated.', { m: money(ev.fine), t: toolName(ev.id) })); Sfx.warn(); FX.banner(T('INSPECTION'), null, 'big'); FX.shake(0.6);
      } else if (ev.t === 'caught') {
        log(T('CAUGHT! Disqualified, fined {m}. Your slip is void.', { m: money(ev.fine) }) + (ev.refund ? ' ' + T('Your alibi returns {m}.', { m: money(ev.refund) }) : '')); Sfx.warn(); Sfx.miss(); FX.banner(T('CAUGHT'), null, 'big'); FX.shake(1);
      }
    });
    saveRun(); refreshAny();
  }
  function refreshAny() {
    var R = GS.run; if (!R) return;
    if (R.phase === 'book') renderBook(); else if (R.phase === 'race') { renderRace(); updateLanes(); }
  }

  /* drawing cards */
  function slipHorses(R) { var m = {}; R.race.slip.forEach(function (s) { if (s) m[s.h] = 1; }); return m; }
  function livePs(R) {
    var b = G.board(R), out = [];
    R.race.slip.forEach(function (s, pl) { out.push(s && R.race.finished.length <= pl ? b[s.h][pl].p : null); });
    return out;
  }
  function doDraw(auto) {
    var R = GS.run; if (!R || R.phase !== 'race' || R.race.done) return null;
    var before = GS.prevP || livePs(R), mine = slipHorses(R);
    var ev = G.draw(R); if (!ev) return null;
    GS.last = ev;
    Sfx.draw(ev.horse, !!mine[ev.horse], ev.card.r);
    var stop = false, why = null, r = R.race;
    if (ev.note === 'hurdle') log(T('{s} wastes a card on the hurdle.', { s: sn(ev.horse) }));
    if (ev.place) {
      var picked = !!mine[ev.horse];
      log(T('{s} crosses the line: {p}.', { s: sn(ev.horse), p: ord(ev.place) })); Sfx.finish(ev.place, picked); stop = true; why = 'cross';
      var sl = r.slip[ev.place - 1];
      if (sl) { if (sl.h === ev.horse && !r.caught) Sfx.hit(1); else Sfx.miss(); }
    }
    var now = livePs(R);
    for (var i = 0; i < now.length; i++) if (before[i] != null && now[i] != null && Math.abs(now[i] - before[i]) >= 0.15) { stop = true; why = why || 'odds'; }
    if (ev.done) { stop = true; GS.doneShown = true; log(T('The race is over.')); }
    if (stop) GS.prevP = now; else GS.prevP = before;
    if (GS.auto === 2 && !ev.done) stop = false;
    if (stop && GS.auto) { stopAuto(); if (why === 'odds') log(T('Auto stopped: the odds moved.')); }
    saveRun();
    renderRace(); updateLanes();
    return ev;
  }
  function tick() {
    GS.timer = null;
    if (!GS.auto) return;
    var ev = doDraw(true);
    if (ev && GS.auto && !ev.done) GS.timer = setTimeout(tick, GS.auto === 2 ? 70 : 420);
  }
  function startAuto(mode) { stopAuto(); GS.auto = mode; GS.prevP = livePs(GS.run); renderControls(); GS.timer = setTimeout(tick, 120); }
  function stopAuto() { GS.auto = 0; if (GS.timer) { clearTimeout(GS.timer); GS.timer = null; } if (GS.run && GS.run.phase === 'race' && $('#gctl')) renderControls(); }

  $('#s-grace').addEventListener('click', function (e) {
    var R = GS.run; if (!R) return; var t = e.target, c;
    if (t.closest('[data-gquit]')) { quit(); return; }
    if (t.closest('[data-gdraw]')) { GS.prevP = livePs(R); doDraw(false); return; }
    if (t.closest('[data-gauto]')) { if (GS.auto === 1) stopAuto(); else startAuto(1); return; }
    if (t.closest('[data-gfast]')) { if (GS.auto === 2) stopAuto(); else startAuto(2); return; }
    if (t.closest('[data-gresult]')) { toResult(); return; }
    c = t.closest('[data-gtool]'); if (c) { runTool(c.dataset.gtool); return; }
    c = t.closest('[data-gtarget]'); if (c) { if (c.dataset.gtarget === 'x') { GS.tool = null; refreshAny(); } else runTool(GS.tool, +c.dataset.gtarget); return; }
    c = t.closest('[data-grecall]'); if (c) { var pl = +c.dataset.grecall; GS.recall = GS.recall === pl ? null : pl; stopAuto(); renderSlip(); return; }
    c = t.closest('[data-grecall-to]');
    if (c) { var p = c.dataset.grecallTo.split(','); stopAuto(); if (G.recall(R, +p[0], +p[1])) { Sfx.chip(); log(T('Place {p} switched to {s}.', { p: placeName(+p[0]), s: sn(+p[1]) })); GS.recall = null; GS.prevP = null; saveRun(); renderRace(); updateLanes(); } else Sfx.deny(); }
  });
  document.addEventListener('keydown', function (e) {
    if (GS_screen() !== 'grace' || e.repeat || e.ctrlKey || e.metaKey || /INPUT|TEXTAREA|SELECT/.test(e.target.tagName)) return;
    if (e.code === 'Space' || e.code === 'Enter') { if (e.target.closest && e.target.closest('button')) return; e.preventDefault(); var R = GS.run; if (R && R.race.done) toResult(); else if (!GS.auto) { GS.prevP = livePs(R); doDraw(false); } }
  });
  function GS_screen() { var s = $('.screen:not([hidden])'); return s ? s.id.replace('s-', '') : ''; }

  function toResult() {
    var R = GS.run; stopAuto();
    var res = G.settle(R); if (!res) { show(); return; }
    GS.recall = null; GS.tool = null;
    saveRun(); go('gback');
    if (res.perfect) { Sfx.champion(); FX.confetti(innerWidth / 2, innerHeight * 0.3, 90); FX.banner(T('PERFECT ORDER'), null, 'big'); }
    if (res.pay + res.bonus > 0 && !res.caught) FX.win(res.pay + res.bonus, innerWidth / 2, innerHeight * 0.35);
  }

  /* ---------- result + backroom ---------- */
  onEnter.gback = renderBack;
  function renderBack() {
    var R = GS.run; if (!R) return; var res = R.result || R.results[R.results.length - 1], el = $('#s-gback');
    var html = '<header class="bar gbar"><button type="button" class="backbtn" data-gquit>&larr; <span>' + T('Menu') + '</span></button><h2>' + T('Race {n} of {m}', { n: res.raceNo, m: R.races }) + ' · ' + T('Result') + '</h2>' + bankHTML(R) + '</header>';
    if (res.caught) html += '<div class="gbanner bad">' + T('Caught and disqualified: your slip was void.') + '</div>';
    html += '<div class="gcols"><div><h3 class="lbl">' + T('Finishing order') + '</h3><div class="gfinal">' + res.order.map(function (h, pl) {
      var b = res.bets.filter(function (x) { return x.pl === pl; })[0];
      return '<div class="gfr s' + h + '"><b class="mono">' + placeName(pl) + '</b>' + gl(h) + '<span class="gsn">' + sn(h) + '</span>' + (b ? '<span class="mono ' + (b.hit && !res.caught ? 'pos' : 'dim') + '">' + (b.sharp ? '★ ' : '') + (b.hit && !res.caught ? T('called ×{o}', { o: I.n(b.odds.toFixed(2)) }) : T('you had {s}', { s: sn(b.h) })) + '</span><span class="mono ' + (b.pay ? 'pos' : 'neg') + '">' + (b.pay ? money(b.pay, true) : '−' + money(b.stake)) + '</span>' : '<span class="dim">' + T('no bet') + '</span><span></span>') + '</div>';
    }).join('') + '</div>' + (res.sharp ? '<p class="note gold">' + TP(res.sharp, '★ Sharp call: a long shot landed. Bonus Reputation tonight.', '★ Sharp calls: long shots landed. Bonus Reputation tonight.') + '</p>' : '') +
      (res.duels && res.duels.length ? '<h3 class="lbl sect-h">' + T('Head to head') + '</h3><div class="gfinal">' + res.duels.map(function (d) {
        return '<div class="gfr s' + d.h + '"><b class="mono">⇄</b>' + gl(d.h) + '<span class="gsn">' + T('{s} ahead of {o}', { s: sn(d.h), o: sn(d.over) }) + '</span><span class="mono ' + (d.hit && !res.caught ? 'pos' : 'dim') + '">' + oddsTxt(d.odds) + '</span><span class="mono ' + (d.pay ? 'pos' : 'neg') + '">' + (d.pay ? money(d.pay, true) : '−' + money(d.stake)) + '</span></div>';
      }).join('') + '</div>' : '') + '</div><div><h3 class="lbl">' + T('Your night so far') + '</h3><div class="stmt">';
    function line(label, v, cls) { return '<div class="row' + (cls ? ' ' + cls : '') + '"><span>' + label + '</span><b class="mono ' + (v > 0 ? 'pos' : v < 0 ? 'neg' : 'dim') + '">' + money(v, true) + '</b></div>'; }
    html += line(T('Winning calls'), res.pay);
    if (res.bonus) html += line(T('Perfect order'), res.bonus);
    if (res.insured) html += line(T('Safety net'), res.insured);
    html += line(T('Stakes'), -res.stakes);
    if (res.spent) html += line(T('Tools'), -res.spent);
    if (res.fees) html += line(T('Re-call fees'), -res.fees);
    if (res.fines) html += line(T('Fines'), -res.fines);
    if (res.alibi) html += line(T('Alibi'), res.alibi);
    html += '<div class="row total"><span>' + T('Net this race') + '</span><b class="mono ' + (res.net >= 0 ? 'gold' : 'neg') + '">' + money(res.net, true) + '</b></div></div></div></div>';
    if (R.phase === 'result') {
      html += '<div class="actions"><button type="button" class="btn primary" data-gnext>' + (R.raceNo >= R.races ? T('Count up the night') : T('To the backroom')) + '</button></div>';
    } else if (R.phase === 'back') {
      var b = R.back;
      html += '<h3 class="lbl sect-h">' + T('The backroom') + '</h3><p class="note">' + T('Between races the fixers sell favors that last the whole night. You may buy one favor. Everything costs cash, and cash is your score.') + '</p><div class="offers">' +
        b.offers.map(function (id) {
          var f = G.favorById(id), price = G.favorPrice(R, id), can = !b.bought && R.cash >= price;
          return '<div class="offer"><span class="kindlbl">' + T('Favor') + '</span><h4>' + T(f.name) + '</h4><p>' + T(f.blurb) + '</p><div class="offer-foot"><b class="mono gold">' + money(price) + '</b><button type="button" class="btn small primary" data-gfavor="' + id + '"' + (can ? '' : ' disabled') + '>' + T('Buy') + '</button></div></div>';
        }).join('') + '</div>' +
        '<h3 class="lbl sect-h">' + T('Services') + '</h3><div class="offers">' +
        '<div class="offer"><span class="kindlbl">' + T('Service') + '</span><h4>' + T('Cool off') + '</h4><p>' + T('Slip out for a while. Heat drops by {n}.', { n: CFG.coolAmt }) + '</p><div class="offer-foot"><b class="mono gold">' + money(CFG.coolPrice) + '</b><button type="button" class="btn small" data-gcool' + (R.heat > 0 && R.cash >= CFG.coolPrice ? '' : ' disabled') + '>' + T('Cool off') + '</button></div></div>' +
        '<div class="offer"><span class="kindlbl">' + T('Service') + '</span><h4>' + T('Loan shark') + '</h4><p>' + T('Borrow {a} now, owe {o} when the night ends. Twice a night at most.', { a: money(CFG.loan), o: money(R.fx.loanOwe) }) + '</p><div class="offer-foot"><b class="mono gold">' + T('owe {m}', { m: money(R.fx.loanOwe) }) + '</b><button type="button" class="btn small" data-gloan' + (G.canLoan(R) ? '' : ' disabled') + '>' + T('Borrow') + '</button></div></div></div>' +
        (R.favors.length ? '<p class="note">' + T('Your favors:') + ' ' + R.favors.map(function (id) { return T(G.favorById(id).name); }).join(', ') + '</p>' : '') +
        heatHTML(R) +
        '<div class="actions"><button type="button" class="btn primary" data-gnext>' + T('Start race {n}', { n: R.raceNo + 1 }) + '</button></div>';
    }
    el.innerHTML = html;
  }
  $('#s-gback').addEventListener('click', function (e) {
    var R = GS.run; if (!R) return; var t = e.target, c;
    if (t.closest('[data-gquit]')) { quit(); return; }
    if (t.closest('[data-gnext]')) {
      if (R.phase === 'result') { G.toBackroom(R); saveRun(); if (R.phase === 'over') { overHook(); } show(); }
      else if (R.phase === 'back') { G.nextRace(R); GS.log = []; GS.last = null; GS.prevP = null; GS.doneShown = false; saveRun(); show(); }
      return;
    }
    c = t.closest('[data-gfavor]'); if (c) { if (G.buyFavor(R, c.dataset.gfavor)) { Sfx.buy(); saveRun(); renderBack(); } else Sfx.deny(); return; }
    if (t.closest('[data-gcool]')) { if (G.coolOff(R)) { Sfx.buy(); saveRun(); renderBack(); } else Sfx.deny(); return; }
    if (t.closest('[data-gloan]')) { if (G.takeLoan(R)) { Sfx.chip(); saveRun(); renderBack(); } else Sfx.deny(); }
  });

  /* ---------- night over ---------- */
  function overHook() {
    if (GS.recorded) return; GS.recorded = true;
    GM.record(GS.meta, GS.run.over); GM.save(GS.meta); clearRun();
  }
  onEnter.gover = function () {
    var R = GS.run; if (!R) return; overHook(); var o = R.over, el = $('#s-gover');
    el.innerHTML = '<header class="bar"><h2>' + T('Night over') + '</h2><div class="cashchip sp">' + T('{n} RP', { n: GS.meta.sp }) + '</div></header>' +
      '<div class="gover"><div class="gbig ' + (o.profit >= 0 ? 'pos' : 'neg') + '">' + money(o.profit, true) + '</div><p class="lede">' + (o.profit > 0 ? T('You walked out ahead.') : o.profit === 0 ? T('You broke even.') : T('The house had a good night.')) + '</p></div>' +
      '<div class="stmt gstats">' +
      '<div class="row"><span>' + T('Cash at the end') + '</span><b class="mono">' + money(R.cash) + '</b></div>' +
      (R.debt ? '<div class="row"><span>' + T('Debt repaid') + '</span><b class="mono neg">−' + money(R.debt) + '</b></div>' : '') +
      '<div class="row"><span>' + T('Final bankroll') + '</span><b class="mono gold">' + money(o.final) + '</b></div>' +
      '<div class="row"><span>' + T('Places called right') + '</span><b class="mono">' + o.hits + ' / ' + (R.stats.races * 4) + '</b></div>' +
      '<div class="row"><span>' + T('Perfect orders') + '</span><b class="mono">' + o.perfects + '</b></div>' +
      '<div class="row"><span>' + T('Sharp calls (long shots that landed)') + '</span><b class="mono">' + (o.sharp || 0) + '</b></div>' +
      '<div class="row"><span>' + T('Tools used') + '</span><b class="mono">' + R.stats.tools + '</b></div>' +
      '<div class="row"><span>' + T('Times caught · inspections') + '</span><b class="mono">' + o.caught + ' · ' + R.stats.inspections + '</b></div>' +
      '<div class="row total"><span>' + T('Reputation earned') + '</span><b class="mono gold">+' + o.rp + ' RP</b></div></div>' +
      '<div class="actions"><button type="button" class="btn primary" data-go="gsetup">' + T('Another night') + '</button><button type="button" class="btn" data-go="grep">' + T('Reputation') + '</button><button type="button" class="btn ghost" data-go="menu">' + T('Menu') + '</button></div>';
    if (o.profit > 0) { Sfx.champion(); FX.confetti(innerWidth / 2, innerHeight * 0.3, 80); }
  };

  /* ---------- Reputation: the skill tree ---------- */
  var ICONS = { t_swap: '🔀', t_wind: '💨', t_shave: '🪒', t_hurdle: '🚧', t_riffle: '🂠', t_lane: '🌀', t_belt: '🧰', n_cool: '🧊', n_skin: '🦏', n_watch: '👀', n_law: '⚖️', n_palm: '🤝', n_alibi: '🕵️', p_deep: '👛', p_chips: '🎰', p_haggle: '🏷️', p_night: '🌙', p_shark: '🦈', p_safe: '🛟', e_sharp: '🎯', e_view: '🔭', e_perf: '🏆', e_net: '📇', e_calls: '☎️', e_tip: '💡', e_tell: '👁️' };
  var NS = 'http://www.w3.org/2000/svg';
  function npos(n) { var a = n.a * Math.PI / 180, r = [0, 135, 245, 345, 440][n.r]; return { x: 500 + r * Math.cos(a), y: 500 + r * Math.sin(a) }; }
  function brOf(n) { return GM.BRANCHES.filter(function (b) { return b.id === n.br; })[0]; }
  function nstate(n) {
    var st = GS.meta;
    if (GM.owned(st, n.id) && GM.costOf(st, n.id) == null) return 'max';
    if (GM.owned(st, n.id)) return 'own';
    if (!GM.isOpen(st, n.id)) return 'locked';
    return GM.canBuy(st, n.id) ? 'aff' : 'open';
  }
  onEnter.grep = function () {
    $('#s-grep').innerHTML = '<header class="bar"><button type="button" class="backbtn" data-go="gsetup">&larr; <span>' + T('Back') + '</span></button><h2>' + T('Reputation') + '</h2><div class="cashchip sp" id="grp-sp"></div></header>' +
      '<p class="lede sm">' + T('Reputation Points come from your nights. Spend them on a skill tree that grows as you buy: new tools, a cooler head, a fatter bankroll, a better book.') + '</p>' +
      '<div class="treewrap" id="gtreewrap"><svg id="gtree" viewBox="0 0 1000 1000" role="group" aria-label="' + T('Skill tree') + '"></svg></div><div class="nodeinfo" id="gnodeinfo"></div>' +
      '<div class="actions"><button type="button" class="btn ghost small" id="gReset"></button></div>';
    GS.tree.seen = null; renderRep();
    var w = $('#gtreewrap'); w.scrollLeft = (w.scrollWidth - w.clientWidth) / 2; w.scrollTop = (w.scrollHeight - w.clientHeight) / 2;
  };
  function renderRep() {
    var st = GS.meta, html = '', seen2 = {};
    $('#grp-sp').textContent = T('{n} RP', { n: st.sp });
    [135, 245, 345, 440].forEach(function (r) { html += '<circle class="ring" cx="500" cy="500" r="' + r + '"/>'; });
    var vis = function (n) { return GM.owned(st, n.id) || GM.isOpen(st, n.id); };
    GM.NODES.forEach(function (n) {
      if (!vis(n)) return; var p = npos(n);
      n.parents.forEach(function (pid) {
        var pp = pid === 'root' ? { x: 500, y: 500 } : npos(GM.nodeById(pid));
        if (pid !== 'root' && !vis(GM.nodeById(pid))) return;
        html += '<line class="edge' + (GM.owned(st, n.id) && GM.owned(st, pid) ? ' on' : '') + '" x1="' + pp.x.toFixed(1) + '" y1="' + pp.y.toFixed(1) + '" x2="' + p.x.toFixed(1) + '" y2="' + p.y.toFixed(1) + '" style="--c:' + brOf(n).color + '"/>';
      });
    });
    html += '<g class="nd root" transform="translate(500 500)"><circle r="40"/><text class="ic" y="10" text-anchor="middle">🃏</text></g>';
    GM.NODES.forEach(function (n) {
      if (!vis(n)) return;
      var p = npos(n), s = nstate(n), lv = GM.level(st, n.id), mx = GM.maxOf(n), pips = '';
      if (mx > 1) for (var k = 0; k < mx; k++) pips += '<circle class="pip' + (k < lv ? ' on' : '') + '" cx="' + ((k - (mx - 1) / 2) * 9).toFixed(1) + '" cy="35" r="3"/>';
      var fresh = GS.tree.seen && !GS.tree.seen[n.id]; seen2[n.id] = 1;
      html += '<g class="nd st-' + s + (fresh ? ' new' : '') + (GS.tree.sel === n.id ? ' sel' : '') + '" data-gnode="' + n.id + '" transform="translate(' + p.x.toFixed(1) + ' ' + p.y.toFixed(1) + ')" style="--c:' + brOf(n).color + '" tabindex="0" role="button" aria-label="' + T(n.name) + '"><circle r="26"/><text class="ic" y="9" text-anchor="middle">' + (ICONS[n.id] || '•') + '</text>' + pips + '</g>';
    });
    $('#gtree').innerHTML = html; GS.tree.seen = seen2;
    var box = $('#gnodeinfo'), n = GS.tree.sel ? GM.nodeById(GS.tree.sel) : null;
    if (!n || n.id === 'root') {
      box.innerHTML = '<p class="note" style="margin:0">' + T('Tap a node to see what it does. You start in the middle and the tree grows as you buy: new nodes appear next to the ones you own.') + '</p><div class="legend">' + GM.BRANCHES.map(function (b) { return '<span style="--c:' + b.color + '"><i></i>' + T(b.name) + '</span>'; }).join('') + '</div>';
    } else {
      var s2 = nstate(n), lv2 = GM.level(st, n.id), mx2 = GM.maxOf(n), cost = GM.costOf(st, n.id), br = brOf(n), pp = '';
      for (var q = 0; q < mx2; q++) pp += '<i class="' + (q < lv2 ? 'on' : '') + '"></i>';
      var btn = s2 === 'max' ? '<button type="button" class="btn small" disabled>' + T('Maxed') + '</button>' : s2 === 'locked' ? '<button type="button" class="btn small" disabled>' + T('Open a neighbouring node first') + '</button>' : '<button type="button" class="btn small primary" data-gbuy="' + n.id + '"' + (s2 === 'aff' ? '' : ' disabled') + '>' + T('Buy · {c} RP', { c: cost }) + '</button>';
      box.innerHTML = '<div class="ni"><span class="nic" aria-hidden="true">' + (ICONS[n.id] || '•') + '</span><div class="nt"><h4>' + T(n.name) + '</h4><span class="nb" style="--c:' + br.color + '">' + T(br.name) + '</span></div></div><p>' + T(n.blurb) + '</p><div class="row"><div class="pips" aria-hidden="true">' + pp + '</div><span class="lv">' + (mx2 > 1 ? T('Level {n} / {m}', { n: lv2, m: mx2 }) : (lv2 ? T('Owned') : T('Not owned'))) + '</span>' + btn + '</div>';
    }
    $('#gReset').textContent = GS.resetArm ? T('Really reset everything?') : T('Reset Reputation');
  }
  $('#s-grep').addEventListener('click', function (e) {
    var g = e.target.closest('[data-gnode]');
    if (g) { GS.tree.sel = g.dataset.gnode; Sfx.pick(); renderRep(); return; }
    var b = e.target.closest('[data-gbuy]');
    if (b) { if (GM.buy(GS.meta, b.dataset.gbuy)) { GM.save(GS.meta); Sfx.buy(); renderRep(); } else Sfx.deny(); return; }
    if (e.target.closest('#gReset')) {
      if (!GS.resetArm) { GS.resetArm = 1; renderRep(); setTimeout(function () { GS.resetArm = 0; if (GS_screen() === 'grep') renderRep(); }, 4000); return; }
      GS.resetArm = 0; GS.meta = GM.reset(); GS.tree.sel = null; renderRep();
    }
  });
  $('#s-grep').addEventListener('keydown', function (e) { if (e.code === 'Enter' || e.code === 'Space') { var g = e.target.closest('[data-gnode]'); if (g) { e.preventDefault(); GS.tree.sel = g.dataset.gnode; Sfx.pick(); renderRep(); } } });

  /* language switch: rebuild whatever is on screen */
  I.onChange(function () {
    var s = GS_screen();
    if (s === 'gsetup') renderSetup(); else if (s === 'gbook') renderBook(); else if (s === 'grace') { buildRace(); renderRace(); updateLanes(true); } else if (s === 'gback') renderBack(); else if (s === 'gover') onEnter.gover(); else if (s === 'grep') renderRepAll();
  });
  function renderRepAll() { onEnter.grep(); }
  window.__gamble = { GS: GS, G: G, show: show, doDraw: doDraw };
  onEnter.menu();   // the menu was drawn before this file loaded: draw it again so the Continue button shows up
})();
