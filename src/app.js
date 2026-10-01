/* Suit Derby UI. Screens: menu, setup, game, pit stop, run over, Stable, rules. */
(function () {
  'use strict';
  var E = Engine, M = Meta, CFG = E.CFG, SUITS = E.SUITS;
  var $ = function (s, r) { return (r || document).querySelector(s); };
  var $$ = function (s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); };
  var reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var VARS = ['--hearts', '--diamonds', '--clubs', '--spades'];
  var I = I18n, T = I.t, TP = I.tp;
  function f1(x) { return I.n(x.toFixed(1)); }
  I.init();

  var S = {
    screen: 'menu', me: 0, laps: 5, run: null, meta: M.load(),
    gphase: 'idle', speed: 1, paused: false, cd: 0, goT: 0, endDelay: 0,
    hist: [], ticker: [], diff: 0, daily: 0, photoState: 0, photoT: 0, slowV: 1, finT: {}, peekCard: null, newStuff: null, guideAt: 0, quitArm: 0, resetArm: 0, lastRes: null, recorded: false, crewView: null, tstake: 10, cstake: 10, roundBets: [], lastBets: null, quiet: false, flash: null
  };

  /* ---------- save and resume: the run is stored after every pit action and every few seconds in a lap ---------- */
  var RK = 'suitderby.run', SAVE_V = 2;
  function saveRun() {
    var R = S.run;
    if (!R || R.phase === 'over' || (S.screen !== 'game' && S.screen !== 'pit')) return;
    try {
      var d = E.pack(R);
      if (R.phase !== 'lap') d.lap = null;
      localStorage.setItem(RK, JSON.stringify({ v: SAVE_V, run: d, res: S.lastRes, daily: S.daily, cs: S.cstake, ts: S.tstake }));
    } catch (e) {}
  }
  function clearSave() { try { localStorage.removeItem(RK); } catch (e) {} }
  function loadSave() {
    try { var d = JSON.parse(localStorage.getItem(RK)); if (d && d.v === SAVE_V && d.run && d.run.phase !== 'over' && d.run.horses) return d; } catch (e) {}
    return null;
  }
  document.addEventListener('visibilitychange', function () { if (document.hidden) saveRun(); });
  window.addEventListener('pagehide', saveRun);

  function money(n, sign) {
    var a = Math.abs(Math.round(n)).toLocaleString(I.locale());
    if (n < 0) return '−$' + a;
    return (sign && n > 0 ? '+' : '') + '$' + a;
  }
  function ord(n) { return I.lang === 'tr' ? n + '.' : n + (['th', 'st', 'nd', 'rd'][(n % 100 > 10 && n % 100 < 14) ? 0 : (n % 10 < 4 ? n % 10 : 0)]); }
  function sn(i) { return T(SUITS[i].name); }
  function lab(c) { var l = E.label(c); return I.lang === 'tr' ? ({ J: 'V', Q: 'K', K: 'P' }[l] || l) : l; }
  function fmtT(t) { var m = Math.floor(t / 60); var s = (t - m * 60).toFixed(1); return m + ':' + I.n((s.length < 4 ? '0' : '') + s); }
  function odds(o) { return '×' + I.n(o.toFixed(2)); }
  function mname(id) { return T(E.MODS[id].name); }
  function cardTxt(c) { return c.chaos ? '★' : lab(c) + SUITS[c.s].glyph; }
  var PHOTO = { gap: 0.4, zone: 7, slow: 0.35, max: 5 };
  var STAKE_NAMES = ['Standard', 'Tough', 'Hard', 'Brutal', 'Legend'];
  function dailySeed() { var d = new Date(); return d.getFullYear() * 10000 + (d.getMonth() + 1) * 100 + d.getDate(); }
  function dailyLabel(seed) { var t = String(seed); return t.slice(6) + '.' + t.slice(4, 6) + '.' + t.slice(0, 4); }

  /* ---------- horse markup ---------- */
  function horseSVG(i) {
    return '<svg class="horse" viewBox="0 0 120 90" aria-hidden="true"><g class="bob">' +
      '<path class="fill" d="M28 36 C14 32 4 44 8 66 C14 54 20 48 32 46Z"/>' +
      '<g class="leg far bf" style="transform-origin:36px 52px"><path d="M36 52 L30 70 L33 82"/></g>' +
      '<g class="leg far ff" style="transform-origin:76px 52px"><path d="M76 52 L82 68 L79 82"/></g>' +
      '<path class="fill" d="M34 30 H80 Q90 30 90 42 Q90 56 78 56 H38 Q26 56 26 44 Q26 30 34 30Z"/>' +
      '<path class="fill" d="M74 36 L86 8 L98 12 L94 48 L80 48Z"/>' +
      '<ellipse class="fill" cx="104" cy="22" rx="13" ry="6.5" transform="rotate(38 104 22)"/>' +
      '<path class="fill" d="M88 9 L91 0 L96 10Z"/>' +
      '<circle cx="101" cy="17" r="1.7" fill="#0d110c"/>' +
      '<path d="M86 8 C80 20 78 30 76 40" fill="none" stroke="#0d110c" stroke-opacity=".35" stroke-width="4" stroke-linecap="round"/>' +
      '<g class="leg bn" style="transform-origin:44px 52px"><path d="M44 52 L38 70 L41 82"/></g>' +
      '<g class="leg fn" style="transform-origin:84px 52px"><path d="M84 52 L90 68 L87 82"/></g>' +
      '<rect class="ink" x="50" y="31" width="20" height="17" rx="3"/>' +
      '<text x="60" y="44.5" text-anchor="middle" font-size="14" font-weight="700" fill="#0d110c" font-family="Hanken Grotesk, system-ui, sans-serif">' + SUITS[i].glyph + '</text>' +
      '<path class="ink" d="M52 31 L59 17 L67 19 L66 32Z"/>' +
      '<path d="M65 21 L77 29" stroke="#ece8da" stroke-width="3" stroke-linecap="round"/>' +
      '<circle class="fill" cx="62" cy="12" r="5.5"/>' +
      '</g></svg>';
  }

  /* ---------- navigation ---------- */
  var onEnter = {};
  function go(name) {
    S.screen = name;
    $$('.screen').forEach(function (el) { el.hidden = el.id !== 's-' + name; });
    window.scrollTo(0, 0);
    Sfx.music.mode(name === 'game' ? (S.run && S.run.mod === 'derby' ? 'final' : 'race') : 'chill');
    if (onEnter[name]) onEnter[name]();
  }
  document.addEventListener('click', function (e) {
    var b = e.target.closest('[data-go]');
    if (b) go(b.dataset.go);
  });
  /* sound: starts on the first tap, a soft tick on buttons that have no sound of their own, M mutes */
  document.addEventListener('pointerdown', function () { Sfx.unlock(); }, { passive: true });
  document.addEventListener('click', function (e) {
    var b = e.target.closest('button');
    if (b && !b.matches('#spur,#brace,#trap,#peek,#burn,[data-bet],[data-buy],#reroll,[data-deal],[data-tg],[data-perk],#snd,#sndMenu,#mus,#musMenu,[data-cell],[data-chip]')) Sfx.click();
  });
  document.addEventListener('keydown', function (e) {
    if (e.repeat || e.ctrlKey || e.metaKey || /INPUT|TEXTAREA|SELECT/.test(e.target.tagName)) return;
    if (e.code === 'KeyM') Sfx.toggle();
    else if (e.code === 'KeyN') Sfx.music.toggle();
  });
  var ICON_ON = '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M11 5 6 9H3v6h3l5 4z" fill="currentColor"/><path d="M15.5 8.5a5 5 0 0 1 0 7M18.5 5.5a9 9 0 0 1 0 13"/></svg>';
  var NOTE_ON = '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3" fill="currentColor"/><circle cx="18" cy="16" r="3" fill="currentColor"/></svg>';
  var NOTE_OFF = '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3" fill="currentColor"/><circle cx="18" cy="16" r="3" fill="currentColor"/><path d="M3 3l18 18" stroke-width="2.4"/></svg>';
  var ICON_OFF = '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M11 5 6 9H3v6h3l5 4z" fill="currentColor"/><path d="M16 9l6 6M22 9l-6 6"/></svg>';
  function renderSnd() {
    $$('.sndbtn').forEach(function (b) {
      var mus = b.dataset.snd === 'music', on = mus ? Sfx.music.on : Sfx.on;
      b.innerHTML = mus ? (on ? NOTE_ON : NOTE_OFF) : (on ? ICON_ON : ICON_OFF);
      b.setAttribute('aria-pressed', String(on));
      b.setAttribute('aria-label', T(mus ? (on ? 'Music on' : 'Music off') : (on ? 'Sound on' : 'Sound off')));
      b.title = T(mus ? (on ? 'Music on' : 'Music off') : (on ? 'Sound on' : 'Sound off')) + (mus ? ' (N)' : ' (M)');
    });
  }
  $$('.sndbtn').forEach(function (b) { b.addEventListener('click', function () { if (b.dataset.snd === 'music') Sfx.music.toggle(); else Sfx.toggle(); }); });
  Sfx.onChange(renderSnd);

  /* ---------- menu ---------- */
  $('#lineup').innerHTML = SUITS.map(function (s, i) { return '<div class="lu s' + i + '">' + horseSVG(i) + '</div>'; }).join('');
  onEnter.menu = function () {
    $('#menu-sp').textContent = T('Permanent upgrades · {n} Stable Points', { n: S.meta.sp });
    $('#menu-stats').textContent = S.meta.runs
      ? T('{runs} runs · {champs} won · best {pts} pts', { runs: S.meta.runs, champs: S.meta.champs, pts: S.meta.bestPts })
      : T('No runs yet.');
    var sv = loadSave(), rb = $('#resumeBtn');
    rb.hidden = !sv;
    if (sv) {
      var sr = sv.run;
      $('#resume-sub').textContent = (sv.daily ? T('Daily') + ' · ' : '') + (sr.phase === 'lap' ? T('Lap {n} of {m} in progress', { n: sr.lapNo, m: sr.laps }) : sr.phase === 'prep' ? T('Before lap 1') : T('Pit stop after lap {n} of {m}', { n: sr.lapNo, m: sr.laps })) + ' · ' + sn(sr.me) + ' · ' + money(sr.cash);
    }
    var ds = dailySeed(), dd = S.meta.daily;
    $('#daily-sub').textContent = dd && dd.date === ds
      ? T('Today: {o} overall, {p} pts. Ride again?', { o: dd.champion ? T('Champion') : ord(dd.rank), p: dd.pts })
      : T('Same deck for everyone today · you ride {s} · 5 laps', { s: sn(ds % 4) });
    renderLang(); renderSnd();
  };
  $('#dailyBtn').addEventListener('click', function () { Sfx.click(); S.daily = dailySeed(); begin({ me: S.daily % 4, laps: 5, seed: S.daily, meta: M.effects(M.fresh()), diff: 0, jockey: 'rookie' }); });
  /* language switch: the choice is saved, and every screen is rebuilt in the new language */
  function renderLang() {
    $('#langsw').innerHTML = I.LANGS.map(function (l) {
      return '<button type="button" data-lang="' + l.id + '" lang="' + l.html + '" aria-pressed="' + (l.id === I.lang) + '">' + l.name + '</button>';
    }).join('');
  }
  $('#langsw').addEventListener('click', function (e) {
    var b = e.target.closest('[data-lang]'); if (!b || b.dataset.lang === I.lang) return;
    I.set(b.dataset.lang);
  });
  I.onChange(function () {
    buildSetup(); buildStyles(); buildRules(); onEnter.menu(); renderSnd();
    $('#quit').textContent = T('Quit'); $('#pause').textContent = T('Pause');
    if (S.screen === 'stable') renderStable();
  });

  /* ---------- setup ---------- */
  function buildSetup() {
    $('#picks').innerHTML = SUITS.map(function (s, i) {
      return '<label class="pick s' + i + '"><input type="radio" name="horse" value="' + i + '"' + (i === S.me ? ' checked' : '') + '>' +
        '<span class="g">' + s.glyph + '</span><span class="n">' + T(s.name) + '</span><span class="trait"><b>' + T(E.TRAITS[i].name) + '</b>' + T(E.TRAITS[i].blurb) + '</span><span class="you">' + T('You') + '</span></label>';
    }).join('');
    $('#lapPills').innerHTML = CFG.lapChoices.map(function (n) {
      return '<label class="pill"><input type="radio" name="laps" value="' + n + '"' + (n === S.laps ? ' checked' : '') + '><b>' + T('{n} laps', { n: n }) + '</b><span>' + T('about {m} minutes', { m: Math.round(n * 1.3) }) + '</span></label>';
    }).join('');
    if (S.diff > S.meta.maxStake) S.diff = S.meta.maxStake;
    $('#stakePills').innerHTML = STAKE_NAMES.map(function (nm, k) {
      var lock = k > S.meta.maxStake;
      var sub = lock ? T('Win a run on {s} to unlock', { s: T(STAKE_NAMES[k - 1]) }) : k ? T('rivals buy more · prizes −{p}% · SP +{s}%', { p: Math.round(CFG.diffPrize * k * 100), s: Math.round(CFG.diffSp * k * 100) }) : T('the normal rules');
      return '<label class="pill"><input type="radio" name="stake" value="' + k + '"' + (k === S.diff ? ' checked' : '') + (lock ? ' disabled' : '') + '><b>' + T(nm) + '</b><span>' + sub + '</span></label>';
    }).join('');
  }
  var SKIN_DOT = { classic: '#9ba593', gold: '#e2bb52', midnight: '#1f2a52', neon: '#5ef0ff', ghost: '#dfe8f2', candy: '#ff9ec7' };
  var THEME_DOT = { stadium: 'linear-gradient(#0d1322,#33271b)', dusk: 'linear-gradient(#a8454a,#f2a65a)', turf: 'linear-gradient(#8fc2ea,#2f6b3a)', snow: 'linear-gradient(#c9d6e3,#eef3f8)', neon: 'linear-gradient(#3b0a5e,#c2287f)' };
  function styleName(kind, id) {
    var n = M.COSMETICS.filter(function (x) { return x[kind] === id; })[0];
    return n ? T(n.name) : T(kind === 'skin' ? 'Classic' : 'Stadium');
  }
  function buildStyles() {
    var fx = M.effects(S.meta), sel = fx.sel;
    $('#jockeyPick').innerHTML = E.JOCKEYS.map(function (j) {
      var own = fx.jockeys.indexOf(j.id) >= 0, on = sel.jockey === j.id;
      return '<button type="button" class="jk' + (on ? ' on' : '') + (own ? '' : ' lock') + '" data-jockey="' + j.id + '"' + (own ? '' : ' disabled') + ' aria-pressed="' + on + '"><span class="jg" aria-hidden="true">' + (own ? j.glyph : '🔒') + '</span><b>' + T(j.name) + '</b><small>' + (own ? T(j.blurb) : T('Unlock in the Stable, Jockey Club branch.')) + '</small></button>';
    }).join('');
    function pills(list, kind, dot) {
      return list.map(function (id) {
        var own = (kind === 'skin' ? fx.skins : fx.themes).indexOf(id) >= 0, on = sel[kind] === id;
        return '<button type="button" class="sp' + (on ? ' on' : '') + '" data-style="' + kind + ':' + id + '"' + (own ? '' : ' disabled') + ' aria-pressed="' + on + '"><i style="background:' + dot[id] + '"></i>' + (own ? '' : '🔒 ') + styleName(kind, id) + '</button>';
      }).join('');
    }
    $('#skinPick').innerHTML = pills(M.SKINS, 'skin', SKIN_DOT);
    $('#themePick').innerHTML = pills(M.THEMES, 'theme', THEME_DOT);
    renderRivalBox();
  }
  function renderRivalBox() {
    $('#rivalBox').innerHTML = '<h3 class="lbl">' + T('Your rival jockeys') + '</h3><div class="rvgrid">' + E.RIVALS.filter(function (r) { return r.suit !== S.me; }).map(function (r) {
      return '<div class="rvj s' + r.suit + '"><span class="g">' + SUITS[r.suit].glyph + '</span><div><b>' + T(r.name) + ' <em>“' + T(r.nick) + '”</em></b><small>' + T(r.bio) + '</small></div></div>';
    }).join('') + '</div>';
  }
  $('#jockeyPick').addEventListener('click', function (e) { var b = e.target.closest('[data-jockey]'); if (b && M.select(S.meta, 'jockey', b.dataset.jockey)) { M.save(S.meta); Sfx.pick(); buildStyles(); } });
  $('#s-setup .styles').addEventListener('click', function (e) { var b = e.target.closest('[data-style]'); if (!b) return; var p = b.dataset.style.split(':'); if (M.select(S.meta, p[0], p[1])) { M.save(S.meta); Sfx.pick(); buildStyles(); } });
  $('#stakePills').addEventListener('change', function (e) { S.diff = +e.target.value; });
  $('#picks').addEventListener('change', function (e) { S.me = +e.target.value; renderRivalBox(); });
  $('#lapPills').addEventListener('change', function (e) { S.laps = +e.target.value; });
  onEnter.setup = function () {
    buildSetup(); buildStyles();
    if (!S.meta.guide) openGuide();
    var fx = M.effects(S.meta), bits = [];
    if (fx.startCash > 90) bits.push(T('start with {m}', { m: money(fx.startCash) }));
    if (fx.loaded) bits.push(TP(fx.loaded, '{n} extra card in your suit', '{n} extra cards in your suit'));
    if (fx.baseSpeed) bits.push(T('+{v} cruising speed', { v: f1(fx.baseSpeed) }));
    if (fx.cashMult > 1) bits.push(T('+{p}% winnings', { p: Math.round((fx.cashMult - 1) * 100) }));
    if (fx.discount) bits.push(T('{p}% cheaper shop', { p: Math.round(fx.discount * 100) }));
    if (fx.slots) bits.push(TP(fx.slots, '+{n} shop slot', '+{n} shop slots'));
    if (fx.freeRerolls) bits.push(TP(fx.freeRerolls, '{n} free reroll', '{n} free rerolls'));
    if (fx.fit) bits.push(T('+{n} starting stamina', { n: fx.fit * 4 }));
    if (fx.farrier) bits.push(T('stumbles {p}% shorter', { p: fx.farrier * 8 }));
    if (fx.gadgetSlots) bits.push(T('a third gadget slot'));
    if (fx.hand) bits.push(T('a hand of 4 round cards'));
    if (fx.crewExtra) bits.push(T('two pit crews per stop'));
    if (fx.pickN > 3) bits.push(T('4 starting picks'));
    if (fx.edge) bits.push(T('{p}% fairer odds', { p: Math.round(fx.edge * 100) }));
    if (fx.refund) bits.push(T('{p}% refund on lost calls', { p: Math.round(fx.refund * 100) }));
    if (fx.peekDisc) bits.push(T('cheaper peek and burn'));
    if (fx.luck) bits.push(T('better shop rarity'));
    if (fx.sharp) bits.push(T('+{p}% bet payouts', { p: Math.round(fx.sharp * 100) }));
    $('#setup-save').hidden = !loadSave();
    $('#setup-perks').textContent = T('Every run starts level: 10 cards per suit and no rival upgrades before lap 1. Each horse has its own trait.') + ' ' +
      (bits.length ? T('Your Stable perks: {list}.', { list: bits.join(', ') }) : T('No Stable perks yet. Finish a run to earn Stable Points.'));
  };
  function applyStyle() { var sel = M.effects(S.meta).sel; scene.setStyle(sel.skin, sel.theme); }
  function begin(opts) {
    opts.jockey = opts.jockey || M.effects(S.meta).sel.jockey;
    S.run = E.newRun(opts); applyStyle(); S.crewView = null;
    S.recorded = false; S.lastRes = null; S.tstake = 10; S.cstake = 10; S.lastBets = null; S.roundBets = []; S.newStuff = null; S.peekCard = null;
    renderPit(); go('pit'); saveRun();
  }
  function resumeRun() {
    var d = loadSave(); if (!d) return;
    try {
      S.run = E.unpack(d.run); applyStyle(); S.crewView = S.run.crew; S.lastRes = d.res || null; S.daily = d.daily || 0; S.me = S.run.me;
      S.recorded = false; S.newStuff = null; S.peekCard = null; S.cstake = d.cs || 10; S.tstake = d.ts || 10; S.lastBets = null; S.roundBets = [];
      var R = S.run;
      if (R.phase === 'lap' && R.lap) {
        if (R.lap.done) { finishLap(); return; }
        S.ticker = []; S.hist = []; lastMod = ''; lastAb = ''; S.endDelay = 0; S.quiet = false; S.photoState = 0; S.slowV = 1; S.finT = {};
        go('game'); measure(); scene.setMe(R.me); scene.reset();
        $('#hzcall').hidden = true; $('#hist').innerHTML = ''; $('#dname').textContent = T('Back on the track'); $('#dline').textContent = T('Press Resume to carry on.');
        $('#face').className = 'face'; $('#cardin').style.transform = 'rotateY(180deg)';
        renderDeck('#deckbar', '#deckleg', E.deckCounts(R, true), R.me, E.chaosCount(R, true)); renderPts(); renderCalls(); renderTicker();
        syncHud(); setSpeedUI();
        S.gphase = 'racing'; S.paused = true;
        $('#ovtxt').textContent = T('Paused'); $('#ovtxt').className = 'big sm'; $('#overlay').hidden = false; $('#pause').textContent = T('Resume');
        renderBets(); renderActions();
      } else { renderPit(); go('pit'); }
    } catch (e) { clearSave(); S.run = null; go('menu'); }
  }
  $('#resumeBtn').addEventListener('click', function () { Sfx.click(); resumeRun(); });
  $('#startRun').addEventListener('click', function () {
    S.daily = 0;
    begin({ me: S.me, laps: S.laps, meta: M.effects(S.meta), diff: S.diff });
  });

  /* ---------- track: the canvas scene ---------- */
  var scene = Scene.create($('#stage'), { glyphs: SUITS.map(function (s) { return s.glyph; }), lapLen: CFG.lapLen, lapOrder: E.lapOrder });
  function measure() { scene.resize(); }
  window.addEventListener('resize', measure);
  function renderScene(dt) {
    var R = S.run;
    scene.update(dt, R, { paused: S.paused, racing: S.gphase === 'racing' || S.gphase === 'ending' });
    scene.draw(R, {});
  }
  function setGamePhase(p) {
    S.gphase = p;
    if (S.run && S.run.lap) { renderBets(); renderActions(); }
  }

  /* ---------- game HUD ---------- */
  function renderDeck(target, legTarget, counts, meIdx, chaos) {
    var tot = counts.reduce(function (a, b) { return a + b; }, 0) || 1;
    var bar = $(target), leg = $(legTarget);
    if (bar.children.length !== 4) bar.innerHTML = SUITS.map(function (s, i) { return '<i class="s' + i + '"></i>'; }).join('');
    counts.forEach(function (n, i) { bar.children[i].style.flexGrow = n; bar.children[i].style.flexBasis = '0'; });
    leg.innerHTML = counts.map(function (n, i) {
      return '<span class="s' + i + (i === meIdx ? ' me' : '') + '"><b>' + SUITS[i].glyph + '</b> ' + n + ' · ' + Math.round(n / tot * 100) + '%</span>';
    }).join('') + '<span>' + T('{n} cards', { n: tot }) + (chaos ? ' + ' + T('{n} chaos', { n: chaos }) : '') + '</span>';
  }
  function renderPts() {
    var R = S.run;
    $('#pts').innerHTML = R.horses.map(function (h) {
      return '<span class="s' + h.i + (h.i === R.me ? ' me' : '') + '"><b>' + SUITS[h.i].glyph + '</b>' + h.points + '</span>';
    }).join('') + '<span>' + T('pts') + '</span>';
  }
  function openHazard() {
    var R = S.run, me = R.horses[R.me], z = R.lap.hz[R.me][me.hzi];
    return z && z.state === 'open' ? z : null;
  }
  var lastSub = '', lastBsub = '', lastTsub = '', lastGrit = '', lastMod = '';
  function renderActions() {
    var R = S.run, L = R.lap, me = R.horses[R.me];
    var live = S.gphase === 'racing' && !S.paused && !me.fin && !L.done;
    var sp = $('#spur'), pct = Math.max(0, Math.min(100, me.sta));
    sp.disabled = !(live && me.sta >= CFG.spurMin);
    $('#spfill').style.width = pct.toFixed(1) + '%';
    sp.classList.toggle('full', live && pct >= 98);
    var sub = me.fin ? T('home') : pct >= 98 ? T('FULL CHARGE · surge +{v}', { v: f1(E.spurPower(me)) }) : me.sta >= CFG.spurMin ? T('now +{v} · wait for more', { v: f1(E.spurPower(me)) }) : T('charging {p}%', { p: Math.round(pct) });
    if (sub !== lastSub) { $('#spsub').textContent = sub; lastSub = sub; }
    var tk = L.traps || 0, tb = $('#trap');
    tb.disabled = !(live && tk > 0);
    var ts = tk ? TP(tk, '{n} token', '{n} tokens') : T('none');
    if (ts !== lastTsub) { $('#trapsub').textContent = ts; lastTsub = ts; }
    var gp = $('#gritpill'), gv = me.grit || 0, gt = live && gv > 0.03 ? T('GRIT +{p}% stamina refill', { p: Math.round(gv * 100) }) : '';
    if (gt !== lastGrit) { gp.textContent = gt; gp.hidden = !gt; lastGrit = gt; }
    renderAbilities();
    var nx = live ? openHazard() : null, br = $('#brace');
    br.disabled = !nx; br.classList.toggle('hot', !!nx);
    var bs = nx ? T('NOW!') : T('no hazard near');
    if (bs !== lastBsub) { $('#bracesub').textContent = bs; lastBsub = bs; }
    $('#hzcall').hidden = !nx;
    if (nx) $('#hzfill').style.width = (Math.max(0, Math.min(1, 1 - (nx.x - me.pos) / E.hzWin(R))) * 100).toFixed(1) + '%';
  }

  /* ---------- gadgets and round cards ---------- */
  var AB_KEYS = { banana: 'Q', cutg: 'W', draftg: 'E', veto: 'R', wild: 'T', dupe: 'Y' };
  var AB_ICON = { banana: '🍌', cutg: '✂️', draftg: '💨', veto: '🚫', wild: '🃏', dupe: '✌️' };
  var lastAb = '';
  function renderAbilities() {
    var R = S.run, L = R.lap, box = $('#abrow'); if (!R || !L) return;
    var live = S.gphase === 'racing' && !S.paused && !R.horses[R.me].fin && !L.done;
    var items = [];
    E.UPGRADES.forEach(function (u) { if (u.kind === 'gadget' && L.gadMax[u.id]) items.push({ id: u.id, g: true, n: L.gad[u.id], max: L.gadMax[u.id], ok: live && E.gadgetReady(R, u.id) }); });
    ['veto', 'wild', 'dupe'].forEach(function (id) {
      var n = R.hand.filter(function (x) { return x === id; }).length, armed = (id === 'wild' && L.wild) || (id === 'dupe' && L.dupe) || (id === 'veto' && L.veto);
      if (n || armed) items.push({ id: id, g: false, n: n, ok: live && n > 0 && E.cardReady(R, id), armed: armed });
    });
    var sig = I.lang + '|' + items.map(function (x) { return [x.id, x.n, x.ok ? 1 : 0, x.armed ? 1 : 0].join(':'); }).join(',');
    if (sig === lastAb) return;
    lastAb = sig;
    box.hidden = !items.length;
    box.innerHTML = items.map(function (x) {
      var u = E.upgradeById(x.id), sub = x.g ? (x.n + '/' + x.max) : x.armed ? T('armed') : '×' + x.n;
      return '<button type="button" class="btn ab ' + (x.g ? 'gad' : 'crd') + (x.armed ? ' armed' : '') + '" data-ab="' + x.id + '"' + (x.ok ? '' : ' disabled') + ' title="' + T(u.blurb) + '"><i class="abk mono">' + AB_KEYS[x.id] + '</i><span class="abi" aria-hidden="true">' + AB_ICON[x.id] + '</span><span class="a-t">' + T(u.name) + '</span><span class="a-s mono">' + sub + '</span></button>';
    }).join('');
  }
  function doAbility(id) {
    var R = S.run;
    if (S.screen !== 'game' || S.gphase !== 'racing' || S.paused || !R) return;
    var u = E.upgradeById(id), r = u.kind === 'gadget' ? E.useGadget(R, id) : E.useCard(R, id);
    if (r) { handleEvents(); lastAb = ''; renderAbilities(); renderBets(); renderDeck('#deckbar', '#deckleg', E.deckCounts(R, true), R.me, E.chaosCount(R, true)); } else Sfx.deny();
  }
  $('#abrow').addEventListener('click', function (e) { var b = e.target.closest('[data-ab]'); if (b) doAbility(b.dataset.ab); });

  /* ---------- next-card bets ---------- */
  var CHIPS = CFG.cardStakes;
  function renderBets() {
    var R = S.run, L = R.lap; if (!L) return;
    var bo = E.betOdds(R), best = -1, bp = 0;
    var canBet = (S.gphase === 'countdown' || S.gphase === 'racing') && !S.paused && !L.done;
    bo.forEach(function (o) { if (o.open && o.p > bp) { bp = o.p; best = o.s; } });
    if (bo.filter(function (o) { return o.open && o.p > bp - 0.001; }).length > 1) best = -1;
    if (R.cash < S.cstake) { var aff = CHIPS.filter(function (c) { return c <= R.cash; }); if (aff.length) S.cstake = aff[aff.length - 1]; }
    var box = $('#bets');
    if (box.children.length !== 4) {
      box.innerHTML = [0, 1, 2, 3].map(function (i) {
        return '<button type="button" class="bbtn s' + i + '" data-bet="' + i + '"><span class="stk"></span><span class="tag"></span><span class="g">' + SUITS[i].glyph + '</span><span class="o"></span><span class="p"></span><i class="pb"></i></button>';
      }).join('');
      $('#chips').innerHTML = CHIPS.map(function (c) { return '<button type="button" class="sk" data-chip="' + c + '">' + money(c) + '</button>'; }).join('');
    }
    bo.forEach(function (o) {
      var b = box.children[o.s], st = L.bets[o.s], pc = Math.round(o.p * 100);
      b.disabled = !canBet || !o.open || R.cash < S.cstake;
      b.classList.toggle('has', !!st); b.classList.toggle('out', !!o.out); b.classList.toggle('dry', !o.n);
      b.querySelector('.stk').textContent = st ? money(st) : '';
      b.querySelector('.tag').textContent = o.out ? T('not next') : (o.s === best && o.open ? T('likeliest') : '');
      b.querySelector('.o').textContent = o.p > 0 ? odds(o.odds) : '–';
      b.querySelector('.p').textContent = T('{p}% · {n} left', { p: pc, n: o.n });
      b.querySelector('.pb').style.setProperty('--p', pc + '%');
    });
    $$('#chips .sk').forEach(function (c) { var v = +c.dataset.chip; c.setAttribute('aria-pressed', String(v === S.cstake)); c.disabled = R.cash < v; });
    if (S.flash) {
      var fb = box.children[S.flash.s], cls = S.flash.hit ? 'win' : 'lose'; S.flash = null;
      fb.classList.remove('win', 'lose'); void fb.offsetWidth; fb.classList.add(cls);
      setTimeout(function () { fb.classList.remove(cls); }, 750);
    }
    var tot = L.bets.reduce(function (x, y) { return x + y; }, 0);
    var pk = $('#peek'), bn = $('#burn'), pd = $('#peeked');
    pk.textContent = T('Peek {m}', { m: money(E.peekCost(R)) }); bn.textContent = T('Burn {m}', { m: money(E.burnCost(R)) });
    pk.disabled = !(canBet && !L.peeked && !tot && R.cash >= E.peekCost(R) && L.deck.length > 0);
    bn.disabled = !(canBet && L.peeked && L.burns < CFG.burnMax && R.cash >= E.burnCost(R));
    pd.classList.toggle('on', !!(L.peeked && S.peekCard));
    pd.innerHTML = L.peeked && S.peekCard ? T('Next card:') + ' ' + mini(S.peekCard) : T('See the next card first');
    $('#betinfo').textContent = L.peeked ? T('You know the next card. Bets are closed until it is drawn.') : tot ? T('{m} on the next card. Pays stake × odds if it lands.', { m: money(tot) }) : T('Odds are the exact chance from the cards left. A hit streak fills your Spur.');
    var sk = $('#streak');
    sk.textContent = L.streak ? T('Streak ×{n} · next hit +{s} stamina', { n: L.streak, s: Math.min(L.streak + 1, 5) * CFG.streakSta }) : T('Streak 0');
    sk.classList.toggle('on', L.streak > 0);
    $('#rebet').disabled = !canBet || !S.lastBets || !S.lastBets.length || tot > 0;
  }
  function placeBet(suit) {
    var R = S.run;
    if (S.screen !== 'game' || !R) return false;
    if (S.gphase !== 'countdown' && S.gphase !== 'racing') return false;
    if (S.paused) return false;
    if (E.placeBet(R, suit, S.cstake)) { S.roundBets.push([suit, S.cstake]); Sfx.chip(); renderBets(); syncHud(); return true; }
    return false;
  }
  $('#bets').addEventListener('click', function (e) { var b = e.target.closest('[data-bet]'); if (b) placeBet(+b.dataset.bet); });
  $('#chips').addEventListener('click', function (e) { var b = e.target.closest('[data-chip]'); if (b) { S.cstake = +b.dataset.chip; Sfx.pick(); renderBets(); } });
  $('#rebet').addEventListener('click', function () {
    (S.lastBets || []).forEach(function (x) { S.cstake = x[1]; placeBet(x[0]); });
  });

  function callState(c) {
    var R = S.run, h = R.horses[c.horse];
    if (h.fin) return h.place === c.place ? 'hit' : 'miss';
    if (R.lap.placeCount >= c.place) return 'miss';
    return 'pend';
  }
  function renderCalls() {
    var R = S.run, el = $('#calls'), cs = R.lap.calls;
    if (!cs.length) { el.hidden = true; return; }
    el.hidden = false;
    el.innerHTML = '<span style="border:0;padding-left:0">' + T('Your calls') + '</span>' + cs.map(function (c) {
      return '<span class="s' + c.horse + ' ' + callState(c) + '">' + ord(c.place) + ' <b>' + SUITS[c.horse].glyph + '</b> ' + odds(c.odds) + ' ' + money(c.stake) + '</span>';
    }).join('');
  }
  function renderTicker() {
    $('#ticker').innerHTML = S.ticker.slice(-3).map(function (t) {
      return '<span class="t s' + t.i + '"><b>' + (t.i >= 0 ? SUITS[t.i].glyph : '★') + '</b> ' + t.text + '</span>';
    }).join('');
  }
  function syncHud() {
    var R = S.run, L = R.lap, me = R.horses[R.me];
    $('#glap').textContent = T('Lap {n} / {m}', { n: R.lapNo, m: R.laps });
    $('#gclock').textContent = fmtT(L.t);
    $('#gcash').textContent = money(R.cash);
    $('#tick').style.transform = 'scaleX(' + Math.min(1, L.drawTimer / L.drawEvery).toFixed(3) + ')';
    var gm = $('#gmod'), mk = (R.mod || '') + I.lang;
    if (mk !== lastMod) {
      lastMod = mk; gm.hidden = !R.mod;
      if (R.mod) { gm.textContent = R.mod === 'derby' ? T('FINAL LAP · ×2 pts') : mname(R.mod); gm.className = 'gmod mono' + (R.mod === 'derby' ? ' derby' : ''); gm.title = T(E.MODS[R.mod].blurb); }
    }
    $('#skip').disabled = !me.fin || L.done;
  }

  function showCard(ev) {
    S.peekCard = null;
    var c = ev.card, s = c.s, lb = lab(c), face = $('#face'), chaos = !!c.chaos;
    var col = chaos ? 'var(--gold)' : 'var(' + VARS[s] + ')', g = chaos ? '★' : SUITS[s].glyph;
    face.style.setProperty('--c', col);
    face.className = 'face' + (chaos ? ' chaosface' : '');
    face.innerHTML = '<span class="cr tl">' + lb + '<i>' + g + '</i></span><span class="mid">' + g + '</span><span class="cr br">' + lb + '<i>' + g + '</i></span>';
    var inner = $('#cardin');
    inner.style.transform = 'rotateY(0deg)';
    if (!reduce && inner.animate) inner.animate([{ transform: 'rotateY(180deg)' }, { transform: 'rotateY(0deg)' }], { duration: 400, easing: 'cubic-bezier(.2,.8,.2,1)' });
    var names = { 11: T('Jack'), 12: T('Queen'), 13: T('King'), 14: T('Ace') };
    var R = S.run, line;
    if (chaos) {
      $('#dname').textContent = T('Chaos card');
      line = ev.horse >= 0 ? T('{s} surges +{b}. You collect {m}.', { s: sn(ev.horse), b: CFG.chaosBoost, m: money(ev.cash, true) }) : T('Nobody left to surge. You collect {m}.', { m: money(ev.cash, true) });
    } else {
      $('#dname').textContent = c.joker ? T('Joker of {s}', { s: sn(s) }) : T('{r} of {s}', { r: names[c.r] || c.r, s: sn(s) });
      if (ev.fin) line = s === R.me ? T('Home already. Dividend {m}.', { m: money(ev.div, true) }) : T('{s} already finished.', { s: sn(s) });
      else line = T(s === R.me ? '{s} surges +{b}. That one is yours.' : '{s} surges +{b}.', { s: sn(s), b: f1(ev.boost) });
    }
    $('#dline').textContent = line;
    S.hist.unshift({ s: chaos ? -1 : s, lab: lb });
    S.hist = S.hist.slice(0, 10);
    $('#hist').innerHTML = S.hist.map(function (h) { return h.s < 0 ? '<span class="chip" style="--c:var(--gold)">?</span>' : '<span class="chip s' + h.s + '">' + h.lab + SUITS[h.s].glyph + '</span>'; }).join('');
  }
  /* a rival jockey's line, picked by a stable hash (never the run's random numbers) */
  function taunt(i, kind) {
    var r = E.RIVALS[i], R = S.run; if (!r || !R || i === R.me) return '';
    var arr = r[kind], k = (R.lapNo * 7 + i * 3 + (R.history.length)) % arr.length;
    return ' · ' + T(r.name.split(' ')[0]) + ': “' + T(arr[k]) + '”';
  }
  function surge(i) { if (i >= 0) scene.surge(i); }
  function floatMoney(i, txt) { scene.say(i, txt, '#e9cf73'); }
  function suitBtn(s) { var b = document.querySelector('[data-bet="' + s + '"]'); if (!b) return { x: innerWidth / 2, y: innerHeight * 0.6 }; var r = b.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; }

  /* a photo finish: when two horses reach the line almost together, the game drops into slow motion */
  function photoCheck(dt) {
    var R = S.run, L = R.lap;
    if (S.photoState === 0 && !L.done && L.placeCount === 0) {
      var u = R.horses.filter(function (h) { return !h.fin; }).sort(function (a, b) { return b.pos - a.pos; });
      if (u.length > 1 && u[0].pos >= CFG.lapLen - PHOTO.zone && u[0].pos - u[1].pos < PHOTO.gap) {
        S.photoState = 1; S.photoT = 0; scene.photo = 1;
        Sfx.photo(); scene.cheer(0.6);
        FX.banner(T('PHOTO FINISH'), null, 'big');
      }
    } else if (S.photoState === 1) {
      S.photoT += dt;
      if (L.placeCount >= 2 || L.done || S.photoT > PHOTO.max) { S.photoState = 2; scene.photo = 0; }
    }
    S.slowV += ((S.photoState === 1 ? PHOTO.slow : 1) - S.slowV) * Math.min(1, dt * 6);
  }
  function handleEvents() {
    var R = S.run, evs = R.events.splice(0), lastCard = -1, redraw = false, quiet = S.quiet;
    evs.forEach(function (ev, k) { if (ev.type === 'draw' || ev.type === 'chaos') lastCard = k; });
    evs.forEach(function (ev, k) {
      if (ev.type === 'draw') {
        if (k === lastCard) showCard(ev);
        surge(ev.horse); scene.cheer(0.06 + ev.boost * 0.012);
        if (!quiet) { Sfx.draw(ev.horse, ev.horse === R.me, ev.card.r || 14); Sfx.cheer(ev.boost * 0.07); }
        if (ev.div > 0) floatMoney(ev.horse, money(ev.div, true));
        redraw = true;
      } else if (ev.type === 'chaos') {
        if (k === lastCard) showCard(ev);
        surge(ev.horse);
        if (!quiet) Sfx.chaos();
        floatMoney(R.me, money(ev.cash, true));
        S.ticker.push({ i: -1, text: ev.horse >= 0 ? T('Chaos card: {s} surges, you collect {m}', { s: sn(ev.horse), m: money(ev.cash) }) : T('Chaos card, you collect {m}', { m: money(ev.cash) }) });
        redraw = true;
      } else if (ev.type === 'bet') {
        S.lastBets = S.roundBets.length ? S.roundBets : S.lastBets; S.roundBets = [];
        redraw = true;
        if (ev.void) { if (!quiet) Sfx.refund(); S.ticker.push({ i: -1, text: T('Chaos card: your next-card bets are refunded') }); return; }
        var pos = suitBtn(ev.suit);
        S.flash = { s: ev.suit, hit: ev.hit };
        if (ev.hit) {
          S.ticker.push({ i: ev.suit, text: T('Next-card hit {o} · {m}', { o: odds(ev.odds), m: money(ev.net, true) }) + (ev.streak > 1 ? T(' · streak ×{n}', { n: ev.streak }) : '') });
          if (!quiet) {
            Sfx.hit(ev.streak);
            var tier = FX.win(ev.pay, pos.x, pos.y);
            if (!tier || tier === 'nice') { if (ev.streak >= 3) FX.banner(T('HOT STREAK ×{n}', { n: ev.streak }), null, 'big'); }
            var a = scene.anchor(R.me, R);
            if (ev.streak >= 2) { scene.say(R.me, T('STREAK ×{n}', { n: ev.streak }), '#ffe07a'); scene.spur(R.me); }
            FX.sparks(a.x, a.y, 10 + ev.streak * 3);
            $('#gcash').classList.remove('bump'); void $('#gcash').offsetWidth; $('#gcash').classList.add('bump');
          }
        } else {
          if (!quiet) Sfx.miss();
          S.ticker.push({ i: ev.suit, text: T('Next card was {s} · {m}', { s: sn(ev.suit), m: money(ev.net) }) });
        }
      } else if (ev.type === 'spur') {
        scene.spur(ev.horse);
        if (!quiet && (ev.horse === R.me || ev.pct >= 85)) Sfx.spur(ev.pct, ev.horse === R.me);
        if (ev.horse === R.me) { scene.say(R.me, T('SPUR +{v}', { v: f1(ev.power) }), '#ffe07a', true); if (!quiet) { var b2 = scene.anchor(R.me, R); FX.ring(b2.x, b2.y, '#ffe07a'); FX.sparks(b2.x, b2.y, 12); } S.ticker.push({ i: R.me, text: T('Spur at {p}% stamina: surge +{v}', { p: Math.round(ev.pct), v: f1(ev.power) }) }); }
        else if (ev.pct >= 85) S.ticker.push({ i: ev.horse, text: T('unleashes a full-charge Spur') });
      } else if (ev.type === 'hz_open') {
        if (!quiet && ev.horse === R.me) Sfx.warn();
      } else if (ev.type === 'hz' && ev.trap) {
        if (ev.res === 'stumble') {
          scene.stumble(ev.horse); scene.say(ev.horse, T('TRIPPED!'), '#ff9a82', true); scene.spark(ev.horse, '#ff9a82', 14);
          if (!quiet) Sfx.trapHit();
          S.ticker.push({ i: ev.horse, text: ev.horse === R.me ? T('stumbles in your own trap') : T('trips over your trap!') + taunt(ev.horse, 'trap') });
        } else { scene.say(ev.horse, T('DODGED'), '#9ba593'); S.ticker.push({ i: ev.horse, text: T('dodges the trap') }); }
      } else if (ev.type === 'hz') {
        var me = ev.horse === R.me;
        if (!quiet) { if (ev.res === 'stumble') { if (me || Math.random() < 0.3) Sfx.stumble(me); } else if (me) Sfx[ev.res === 'perfect' ? 'perfect' : 'clear'](); }
        if (ev.res === 'stumble') { scene.stumble(ev.horse); if (me) S.ticker.push({ i: R.me, text: T('stumbles over the hazard') }); }
        else if (ev.res === 'perfect') {
          scene.say(ev.horse, me ? T('PERFECT +{m}', { m: money(CFG.perfectCash) }) : T('PERFECT'), '#ffe07a'); scene.spark(ev.horse, '#ffe07a', 16);
          if (me) { if (!quiet) { var a3 = scene.anchor(R.me, R); FX.win(CFG.perfectCash, a3.x, a3.y); } S.ticker.push({ i: R.me, text: T('perfect jump {m}', { m: money(CFG.perfectCash, true) }) }); }
        } else if (me) scene.say(R.me, T('CLEAR'), '#9ba593');
      } else if (ev.type === 'luck') {
        var lk = { horseshoe: 'lucky', coin: 'coinFlip', dice: 'dice', echo: 'lucky' }[ev.kind]; if (lk && !quiet) Sfx[lk]();
        if (ev.kind === 'horseshoe') { surge(R.me); scene.say(R.me, T('HORSESHOE'), '#ffe07a'); S.ticker.push({ i: R.me, text: T('Lucky Horseshoe: bonus surge') }); }
        else if (ev.kind === 'jackpot') {
          surge(R.me); floatMoney(R.me, money(ev.cash, true)); S.ticker.push({ i: -1, text: T('JACKPOT {m}', { m: money(ev.cash, true) }) });
          if (!quiet) FX.win(ev.cash, innerWidth / 2, innerHeight * 0.4, T('JACKPOT'));
        }
        else if (ev.kind === 'coin') S.ticker.push({ i: R.me, text: T('Coin of Fate landed {c}: {v} cruising this lap', { c: T(ev.text), v: I.n((ev.text === 'heads' ? '+' + CFG.coinHeads : CFG.coinTails).toString().replace('-', '−')) }) });
        else if (ev.kind === 'echo') { scene.say(R.me, T('ECHO'), '#ffe07a'); S.ticker.push({ i: R.me, text: T('Echo Chamber: your card goes back in the deck') }); }
        else if (ev.kind === 'dice') S.ticker.push({ i: R.me, text: T('Loaded Dice: {n} extra cards this lap', { n: ev.n }) });
      } else if (ev.type === 'peek') {
        S.peekCard = ev.card; if (!quiet) Sfx.peek();
        S.ticker.push({ i: -1, text: T('Peek: the next card is {c}', { c: cardTxt(ev.card) }) });
        redraw = true;
      } else if (ev.type === 'burn') {
        S.peekCard = null; if (!quiet) Sfx.burn();
        S.ticker.push({ i: -1, text: T('Burned the {c}. Peek again to see the new top card.', { c: cardTxt(ev.card) }) });
        redraw = true;
      } else if (ev.type === 'gadget') {
        var gn = T(E.upgradeById(ev.id).name);
        if (!quiet) Sfx.gadget(ev.id);
        if (ev.id === 'banana') { scene.stumble(ev.horse); scene.say(ev.horse, '🍌', '#ffe07a', true); scene.spark(ev.horse, '#ffe07a', 12); S.ticker.push({ i: ev.horse, text: T('slips on your banana peel') }); }
        else if (ev.id === 'draftg') { surge(R.me); scene.spur(R.me); scene.say(R.me, T('DRAFT'), '#8fb8ee', true); S.ticker.push({ i: R.me, text: T('Draft behind {s}: surge +{v}', { s: sn(ev.horse), v: f1(CFG.draftSurge) }) }); }
        else { scene.say(R.me, T('CUT'), '#c79bf0'); S.ticker.push({ i: R.me, text: T('Cut: your {c} jumps to the top of the deck', { c: cardTxt(ev.card) }) }); }
        redraw = true;
      } else if (ev.type === 'card') {
        if (!quiet) Sfx.card(ev.id);
        if (ev.id === 'veto') { scene.say(R.me, T('VETO'), '#ff9a82'); S.ticker.push({ i: -1, text: T('Veto armed: the next rival card is thrown away') }); }
        else if (ev.id === 'wild') { scene.say(R.me, T('WILD'), '#c79bf0', true); S.ticker.push({ i: R.me, text: T('Wild card armed: the next rival card is yours') }); }
        else { scene.say(R.me, T('DOUBLE UP'), '#ffe07a', true); S.ticker.push({ i: R.me, text: T('Double Up armed: your next card surges twice') }); }
        redraw = true;
      } else if (ev.type === 'vetohit') {
        S.peekCard = null; scene.say(R.me, T('VETOED'), '#ff9a82', true); if (!quiet) Sfx.burn();
        S.ticker.push({ i: -1, text: T('Veto: the {c} is thrown away', { c: cardTxt(ev.card) }) });
        redraw = true;
      } else if (ev.type === 'wildhit') {
        scene.say(R.me, T('STOLEN'), '#c79bf0', true); S.ticker.push({ i: R.me, text: T('Wild: a {s} card surges you instead', { s: sn(ev.from) }) });
      } else if (ev.type === 'dupehit') {
        scene.say(R.me, T('×2'), '#ffe07a', true); scene.spark(R.me, '#ffe07a', 14); S.ticker.push({ i: R.me, text: T('Double Up: that card surged twice') });
      } else if (ev.type === 'trap') {
        if (!quiet) Sfx.trap();
        scene.say(ev.horse, T('TRAP!'), '#ff9a82', true);
        S.ticker.push({ i: ev.horse, text: T('a trap lies ahead of {s}', { s: sn(ev.horse) }) });
      } else if (ev.type === 'phoenix') {
        scene.say(ev.horse, T('PHOENIX'), '#ffb347', true); surge(ev.horse);
        if (!quiet) { Sfx.phoenix(); var pa = scene.anchor(ev.horse, R); FX.ring(pa.x, pa.y, '#ffb347'); FX.sparks(pa.x, pa.y, 24); }
        S.ticker.push({ i: ev.horse, text: T('rises like a Phoenix: surge and full stamina') });
      } else if (ev.type === 'mod') {
        if (!quiet) { if (ev.id === 'derby') { Sfx.final(); FX.banner(T('DERBY DAY'), null, 'big'); } else FX.banner(mname(ev.id), null, 'big'); }
        S.ticker.push({ i: -1, text: mname(ev.id) + ': ' + T(E.MODS[ev.id].blurb) });
      } else if (ev.type === 'sabotage') {
        S.ticker.push({ i: ev.horse, text: T('is sabotaged and surges 40% less this lap') });
      } else if (ev.type === 'finish') {
        S.ticker.push({ i: ev.horse, text: T(ev.horse === R.me ? 'you finish {o}' : 'finishes {o}', { o: ord(ev.place) }) });
        if (!quiet) { Sfx.finish(ev.place, ev.horse === R.me); Sfx.cheer(ev.place === 1 ? 1.2 : 0.6); }
        S.finT[ev.place] = ev.time;
        if (ev.place === 1 && S.photoState === 1 && !quiet) { Sfx.shutter(); FX.flash('#ffffff'); }
        if (ev.place === 2 && S.finT[1] != null && ev.time - S.finT[1] < 0.6 && !quiet) {
          var wh = R.horses.filter(function (h) { return h.place === 1; })[0];
          if (wh) { FX.banner(T('{s} wins by {t}s', { s: sn(wh.i), t: I.n((ev.time - S.finT[1]).toFixed(2)) }), null, 'big'); S.ticker.push({ i: wh.i, text: T('photo finish: {t}s apart', { t: I.n((ev.time - S.finT[1]).toFixed(2)) }) }); scene.cheer(0.8); }
        }
        scene.say(ev.horse, ord(ev.place), ev.place === 1 ? '#ffe07a' : '#ece8da', true);
        if (ev.place === 1 || ev.horse === R.me) scene.finishFlash();
        if (ev.horse === R.me && ev.place === 1 && !quiet) { FX.confetti(innerWidth / 2, innerHeight * 0.3, 70); FX.banner(T('WINNER'), null, 'big'); FX.shake(1); }
        redraw = true;
      }
    });
    if (redraw) {
      renderDeck('#deckbar', '#deckleg', E.deckCounts(R, true), R.me, E.chaosCount(R, true));
      renderBets(); renderCalls(); syncHud();
    }
    renderTicker();
  }

  /* ---------- lap flow ---------- */
  function beginLap() {
    var R = S.run;
    S.ticker = []; S.hist = []; S.peekCard = null; lastMod = ''; lastAb = ''; S.photoState = 0; S.slowV = 1; S.finT = {}; S.paused = false; S.endDelay = 0; S.quiet = false; S.roundBets = [];
    E.startLap(R);
    scene.setMe(R.me); scene.reset(); $('#hzcall').hidden = true;
    $('#hist').innerHTML = ''; $('#dname').textContent = T('Shuffling'); $('#dline').textContent = T('First card comes out soon.');
    $('#face').className = 'face'; $('#cardin').style.transform = 'rotateY(180deg)';
    $('#pause').textContent = T('Pause');
    go('game');
    measure(); scene.setMe(R.me); scene.reset();
    handleEvents();
    renderDeck('#deckbar', '#deckleg', E.deckCounts(R, true), R.me, E.chaosCount(R, true)); renderPts(); renderCalls(); renderTicker();
    syncHud(); setSpeedUI();
    S.cd = 2.4; S.goT = 0;
    $('#overlay').hidden = false;
    setGamePhase('countdown'); renderBets(); renderActions();
    saveRun();
  }
  function finishLap() {
    var R = S.run;
    S.lastRes = E.endLap(R);
    setGamePhase('idle');
    if (R.phase === 'over') { renderOver(); go('over'); celebrateOver(); }
    else { renderPit(); go('pit'); celebrate(S.lastRes); }
  }
  function setSpeedUI() { $$('[data-sp]').forEach(function (b) { b.setAttribute('aria-pressed', String(+b.dataset.sp === S.speed)); }); }

  $('.ctrls').addEventListener('click', function (e) {
    var b = e.target.closest('button'); if (!b) return;
    var R = S.run;
    if (b.dataset.sp) { S.speed = +b.dataset.sp; setSpeedUI(); }
    else if (b.id === 'pause') {
      if (S.gphase !== 'racing') return;
      S.paused = !S.paused; b.textContent = S.paused ? T('Resume') : T('Pause');
      $('#ovtxt').textContent = T('Paused'); $('#ovtxt').className = 'big sm'; $('#overlay').hidden = !S.paused;
      renderBets(); renderActions();
    } else if (b.id === 'skip') {
      if (!R.horses[R.me].fin) return;
      var g = 0; while (!R.lap.done && g++ < 5000) E.stepLap(R, 0.1);
      S.quiet = true; handleEvents(); S.quiet = false; syncHud(); renderCalls();
      S.endDelay = 0.4; setGamePhase('ending');
    }
  });
  function doSpur() {
    var R = S.run;
    if (S.screen !== 'game' || S.gphase !== 'racing' || S.paused) return;
    if (E.spur(R)) { handleEvents(); renderActions(); }
  }
  function doBrace() {
    var R = S.run;
    if (S.screen !== 'game' || S.gphase !== 'racing' || S.paused) return;
    if (E.brace(R)) { handleEvents(); renderActions(); }
  }
  function doTrap() {
    var R = S.run;
    if (S.screen !== 'game' || S.gphase !== 'racing' || S.paused) return;
    if (E.trap(R) != null) { handleEvents(); renderActions(); } else Sfx.deny();
  }
  function inBetting() { return S.screen === 'game' && (S.gphase === 'racing' || S.gphase === 'countdown') && !S.paused; }
  $('#trap').addEventListener('click', doTrap);
  $('#peek').addEventListener('click', function () { if (inBetting() && E.peek(S.run)) { handleEvents(); renderBets(); } else Sfx.deny(); });
  $('#burn').addEventListener('click', function () { if (inBetting() && E.burn(S.run)) { handleEvents(); renderBets(); } else Sfx.deny(); });
  $('#spur').addEventListener('click', doSpur);
  $('#brace').addEventListener('click', doBrace);
  document.addEventListener('keydown', function (e) {
    if (S.screen !== 'game' || e.repeat) return;
    if (e.code === 'Space') { e.preventDefault(); if (S.run && openHazard()) doBrace(); else doSpur(); }
    else if (e.code === 'KeyB') doBrace();
    else if (e.code === 'KeyS') doSpur();
    else if (e.code === 'KeyX') doTrap();
    else if (e.code === 'KeyQ') doAbility('banana');
    else if (e.code === 'KeyW') doAbility('cutg');
    else if (e.code === 'KeyE') doAbility('draftg');
    else if (e.code === 'KeyR') doAbility('veto');
    else if (e.code === 'KeyT') doAbility('wild');
    else if (e.code === 'KeyY') doAbility('dupe');
    else if (e.code >= 'Digit1' && e.code <= 'Digit4') placeBet(+e.code.slice(5) - 1);
  });

  $('#quit').addEventListener('click', function () {
    var b = $('#quit');
    if (!S.quitArm) { S.quitArm = 1; b.textContent = T('Save and quit?'); setTimeout(function () { S.quitArm = 0; b.textContent = T('Quit'); }, 3000); return; }
    S.quitArm = 0; b.textContent = T('Quit'); saveRun(); S.run = null; S.gphase = 'idle'; go('menu');
  });

  /* ---------- pit stop ---------- */
  function renderPit() {
    var R = S.run, res = S.lastRes, me = R.horses[R.me], prep = R.phase === 'prep';
    $('#pit-title').textContent = prep ? T('Before lap 1') : T('Lap {n} of {m} complete', { n: res.lapNo, m: R.laps });
    $('#pit-stand-h').textContent = prep ? T('On the line') : T('Championship');
    var pl = $('#pit-place'), stmt = $('#pit-stmt');
    if (prep) {
      pl.textContent = T('Level start'); pl.style.color = 'var(--ink)';
      stmt.innerHTML = '<p class="note" style="margin:0">' + T('Every suit has the same 10 cards and nobody has an upgrade yet, so the odds below are close to even. Call the order and place your first bets, then start the lap.') + '</p>';
    } else {
      pl.textContent = T('{o} this lap', { o: ord(res.place) }); pl.style.color = res.place === 1 ? 'var(--gold)' : 'var(--ink)';
      var rows = [[T('Prize'), res.prize], [res.secs > 0 ? T('Speed bonus, {s}s under par', { s: f1(res.secs) }) : T('Speed bonus, {s}s over par', { s: f1(Math.abs(res.secs)) }), res.bonus],
        [TP(res.divCount, 'Dividends, {n} card', 'Dividends, {n} cards'), res.divs]];
      if (res.interest) rows.push([T('Interest'), res.interest]);
      if (res.penny) rows.push([T('Lucky Penny'), res.penny]);
      if (res.sponsor) rows.push([T('Sponsor'), res.sponsor]);
      var hzCash = (res.hz ? res.hz.perfect : 0) * CFG.perfectCash;
      if (res.hz && (res.hz.perfect + res.hz.clear + res.hz.stumble)) rows.push([T('Hazards: {p} perfect, {c} clear, {s} stumbled', { p: res.hz.perfect, c: res.hz.clear, s: res.hz.stumble }), hzCash]);
      if (res.windfall - hzCash > 0) rows.push([T('Luck windfalls'), res.windfall - hzCash]);
      var gm = res.gamble;
      if (gm && gm.n) rows.push([T('Next-card bets, {h} of {n} hit', { h: gm.hits, n: gm.n }) + (gm.best > 1 ? T(' (best streak {n})', { n: gm.best }) : ''), gm.net]);
      var html = rows.map(function (r, k) { return '<div class="row' + (r[1] > 0 ? ' pop' : '') + '" style="animation-delay:' + (k * 0.08) + 's"><span>' + r[0] + '</span><b class="' + (r[1] > 0 ? 'pos' : r[1] < 0 ? 'neg' : 'dim') + '">' + money(r[1], true) + '</b></div>'; }).join('');
      if (res.calls.length) {
        html += '<div class="row"><span>' + T('Bets, {h} of {n} right', { h: res.hits, n: res.calls.length }) + (res.combo > 1 ? T(' (combo ×{c})', { c: I.n(String(res.combo)) }) : '') + '</span><b class="' + (res.betNet >= 0 ? 'pos' : 'neg') + '">' + money(res.betNet, true) + '</b></div>';
        html += res.calls.map(function (c) {
          return '<div class="row sub"><span class="s' + c.horse + '">' + ord(c.place) + ' <b style="color:var(--c)">' + SUITS[c.horse].glyph + '</b> ' + odds(c.odds) + ' ' + T('on {m}', { m: money(c.stake) }) + '</span><b class="' + (c.hit ? 'pos' : 'neg') + '">' + (c.hit ? money(c.win, true) : T('miss')) + '</b></div>';
        }).join('');
      }
      var race = res.total - res.betReturn;
      res.net = race + res.betNet + (gm ? gm.net : 0);
      html += '<div class="row total"><span>' + T('Net this lap') + '</span><b class="gold" id="netb">' + money(res.net, true) + '</b></div>';
      stmt.innerHTML = html;
    }
    var order = E.runOrder(R);
    $('#pit-standings').innerHTML = order.map(function (i, k) {
      var h = R.horses[i], lp = res ? res.order.filter(function (o) { return o.i === i; })[0] : null;
      return '<tr class="s' + i + (i === R.me ? ' me' : '') + '"><td class="mono">' + (prep ? '–' : ord(k + 1)) + '</td><td><span class="g">' + SUITS[i].glyph + '</span> ' + sn(i) + (i === R.me ? ' <span class="dim">' + T('(you)') + '</span>' : ' <span class="dim">' + T(E.RIVALS[i].name.split(' ')[0]) + '</span>') + (lp ? ' <span class="dim mono">+' + CFG.points[lp.place - 1] * res.pm + '</span>' : '') + '</td><td class="num">' + h.points + '</td></tr>';
    }).join('');
    renderRivals(); renderIntel(); renderRecap();
    S.crewView = R.crew; S.crewMsg = null;
    setPitTab(prep ? 'crew' : 'result');
    S.skipCrew = 0;
    renderPitState();
  }
  function ufLine() {
    var res = S.lastRes;
    if (!res || !res.topUps || !res.topUps.length) return '';
    return '<p class="uf"><b>' + T('Underdog fund') + '</b> ' + T('(no suit is starved out of the deck):') + ' ' + res.topUps.map(function (u) { return SUITS[u.horse].glyph + ' ' + TP(u.n, '+{n} card', '+{n} cards'); }).join(', ') + '.</p>';
  }
  var PTABS = ['result', 'crew', 'bets'];
  function setPitTab(t) {
    S.pitTab = t;
    PTABS.forEach(function (k) {
      var on = k === t;
      $('#tab-' + k).setAttribute('aria-selected', String(on));
      $('[data-pane="' + k + '"]').hidden = !on;
    });
    renderPitTabs();
  }
  function renderPitTabs() {
    var R = S.run; if (!R) return;
    var prep = R.phase === 'prep', cb = $('#badge-crew'), bb = $('#badge-bets');
    $('#tab-crew-l').textContent = prep ? T('Starting pick') : T('Pit crew');
    cb.hidden = S.pitTab === 'crew' || !(prep ? !!R.startPicks : !R.crewsUsed.length); cb.textContent = '!';
    var c = R.calls.filter(Boolean).length;
    bb.hidden = S.pitTab === 'bets'; bb.textContent = c + '/4';
  }
  $('#ptabs').addEventListener('click', function (e) { var b = e.target.closest('[data-ptab]'); if (b) { Sfx.pick(); setPitTab(b.dataset.ptab); } });
  function renderStrip() {
    var R = S.run, res = S.lastRes, h = '';
    if (R.phase !== 'prep' && res) {
      if (R.nextMod) { var m = E.MODS[R.nextMod]; h += '<span class="nchip mod' + (m.final ? ' derby' : '') + '" title="' + T(m.blurb) + '"><b>' + (m.final ? T('Final lap') : T('Next lap')) + '</b>' + T(m.name) + ' · ' + T(m.blurb) + '</span>'; }
      var d = res.draft;
      if (d && (d.slots || d.rerolls)) h += '<span class="nchip draft"><b>' + T('Underdog draft') + '</b>' + [d.slots ? TP(d.slots, '{n} extra shop slot', '{n} extra shop slots') : '', d.rerolls ? TP(d.rerolls, '{n} free reroll', '{n} free rerolls') : ''].filter(Boolean).join(' + ') + '</span>';
      if (R.traps > 0) h += '<span class="nchip trapc"><b>' + T('Trap tokens') + '</b>' + R.traps + '</span>';
    }
    $('#nextstrip').innerHTML = h;
  }
  function renderIntel() {
    var R = S.run, res = S.lastRes, h = '', box = $('#intel');
    renderStrip();
    if (R.phase === 'prep' || !res) { box.innerHTML = ''; return; }
    var d = res.draft;
    if (d && (d.slots || d.rerolls)) {
      var bits = [];
      if (d.slots) bits.push(TP(d.slots, '{n} extra shop slot', '{n} extra shop slots'));
      if (d.rerolls) bits.push(TP(d.rerolls, '{n} free reroll', '{n} free rerolls'));
      h += '<div class="card2 draft"><h4>' + T('Underdog draft') + '</h4><p>' + T('You are {o} in the standings, so this stop gives you {list}.', { o: ord(res.rank), list: bits.join(' + ') }) + '</p></div>';
    }
    if (R.traps > 0 || res.trapsEarned) {
      h += '<div class="card2 trapc"><h4>' + T('Trap tokens') + '</h4><p>' + (res.trapsEarned ? T('You earned {n} for finishing {o}. ', { n: res.trapsEarned, o: ord(res.place) }) : '') +
        (R.traps > 0 ? T('{n} ready: press Trap (X) in the next lap to drop one in front of the leading rival.', { n: R.traps }) : '') + '</p></div>';
    }
    box.innerHTML = h;
  }
  function renderRecap() {
    var R = S.run, res = S.lastRes, box = $('#recap');
    if (R.phase === 'prep' || !res || !res.stats) { box.hidden = true; return; }
    var ls = res.stats, me = R.me, lines = [], dv = res.mineDrawn - res.expectedMine, pr = { n: res.mineDrawn, e: f1(res.expectedMine) };
    lines.push(dv >= 1.5 ? T('Cards: your suit came up <b>{n}</b> times (about {e} expected). The deck was kind.', pr) : dv <= -1.5 ? T('Cards: your suit came up only <b>{n}</b> times (about {e} expected). A cold deck.', pr) : T('Cards: your suit came up <b>{n}</b> times, about what the deck promised.', pr));
    if (res.hz.stumble) lines.push(TP(res.hz.stumble, 'Hazards: <b>{n}</b> stumble, and each one costs seconds.', 'Hazards: <b>{n}</b> stumbles, and each one costs seconds.'));
    else if (res.hz.perfect >= 2) lines.push(T('Hazards: <b>{n}</b> perfect jumps, clean riding.', { n: res.hz.perfect }));
    var sc = ls.spurs[me];
    if (!sc) lines.push(T('Spur: you never used it, so the stamina went to waste.'));
    else {
      var avg = ls.spurPct.reduce(function (a, b) { return a + b; }, 0) / ls.spurPct.length;
      lines.push(avg < 50 ? T('Spur: {n} uses at {p}% charge on average. Waiting for more charge pays off.', { n: sc, p: Math.round(avg) }) : T('Spur: {n} uses at {p}% charge on average. Good timing.', { n: sc, p: Math.round(avg) }));
    }
    if (ls.traps) lines.push(T('Traps: <b>{h}</b> of {n} tripped a rival.', { h: ls.trapHits, n: ls.traps }));
    else if (res.place > 1) { var wi = res.order[0].i; lines.push(T('{s} took the lap with <b>{n}</b> cards of its suit drawn.', { s: sn(wi), n: ls.drawn[wi] })); }
    box.hidden = false;
    box.innerHTML = '<h4>' + (res.place === 1 ? T('How you won') : T('Why {o}?', { o: ord(res.place) })) + '</h4><ul>' + lines.map(function (l) { return '<li>' + l + '</li>'; }).join('') + '</ul>';
  }
  function renderSets() {
    var R = S.run, me = R.horses[R.me], h = '';
    Object.keys(E.SETS).forEach(function (k) {
      var cnt = E.setLevel(me, k); if (!cnt) return;
      var tier = E.setTier(me, k), t = E.SETS[k], nx = t[tier];
      h += '<div class="set' + (tier ? ' on' : '') + '"><b>' + T(E.KIND_LABEL[k]) + ' ' + cnt + '/' + (nx ? nx[0] : t[t.length - 1][0]) + '</b><small>' + (tier ? T(t[tier - 1][2]) : '') + (nx ? (tier ? ' · ' : '') + T('Next ({n}): ', { n: nx[0] }) + T(nx[2]) : '') + '</small></div>';
    });
    $('#sets').innerHTML = h;
  }
  function rivalQuote() {
    var R = S.run, res = S.lastRes; if (R.phase === 'prep' || !res) return '';
    var w = res.order[0].i, l = res.order[3].i, who = w !== R.me ? w : l !== R.me ? l : -1, kind = w !== R.me ? 'win' : 'lose';
    if (who < 0) return '';
    var r = E.RIVALS[who], arr = r[kind], line = arr[(res.lapNo + who) % arr.length];
    return '<div class="rq s' + who + '"><span class="g">' + SUITS[who].glyph + '</span><div><b>' + T(r.name) + ' <em>“' + T(r.nick) + '”</em></b><span>“' + T(line) + '”</span></div></div>';
  }
  function renderRivals() {
    var R = S.run, box = $('#rivals');
    if (R.phase === 'prep' || !R.rivalLog.length) {
      box.innerHTML = R.phase === 'prep' ? '' : rivalQuote() + '<h3 class="lbl">' + T('Rivals at the stop') + '</h3><p class="note" style="margin:0">' + T('Nobody upgraded this time.') + '</p>' + ufLine();
      return;
    }
    box.innerHTML = rivalQuote() + '<h3 class="lbl">' + T('Rivals upgraded during the stop') + '</h3><div class="rvlist">' + R.rivalLog.map(function (r) {
      return '<span class="rv s' + r.horse + ' t-' + r.tier + '"><span class="g">' + SUITS[r.horse].glyph + '</span>' + T(r.name) + ' <em>' + T(E.TIER_NAME[r.tier]) + '</em></span>';
    }).join('') + '</div>' + ufLine();
  }
  // everything that changes when cash, odds, bets or offers change
  function renderPitState() {
    var R = S.run, prep = R.phase === 'prep';
    var av = E.spendable(R), rs = E.reserved(R);
    $('#pit-cash').textContent = money(av);
    $('#pit-cash-sub').textContent = rs ? T('cash {c} · {r} on bets', { c: money(R.cash), r: money(rs) }) : T('to spend');
    renderBoard();
    renderCrew();
    renderKit(); renderSets(); renderPitTabs();
    $('#nextLap').disabled = prep && !!R.startPicks;
    $('#nextLap').textContent = S.skipCrew && !R.crewsUsed.length && !prep ? T('No pit crew yet: start anyway') : R.nextMod === 'derby' ? T('Start the final lap · ×2 points') : T('Start lap {n} of {m}', { n: R.lapNo + 1, m: R.laps });
    renderDeck('#pit-deckbar', '#pit-deckleg', E.deckCounts(R, false), R.me, E.chaosCount(R, false));
    saveRun();
  }

  /* --- call the order --- */
  function renderBoard() {
    var R = S.run, q = R.quote, used = {};
    R.calls.forEach(function (c) { if (c) used[c.h] = true; });
    var ord4 = [R.me].concat([0, 1, 2, 3].filter(function (x) { return x !== R.me; }));
    var html = '<div class="brow bhead"><span></span>' + ord4.map(function (h) {
      return '<span class="bh s' + h + (h === R.me ? ' you' : '') + '">' + (h === R.me ? T('You') : sn(h)) + '</span>';
    }).join('') + '<span></span></div>';
    for (var pl = 0; pl < 4; pl++) {
      var c = R.calls[pl];
      html += '<div class="brow"><span class="bplace">' + ord(pl + 1) + (pl === 0 ? '<i class="lockmark" title="' + T('Your horse is locked in for 1st') + '">' + T('Locked') + '</i>' : '') + '</span>';
      for (var hi = 0; hi < 4; hi++) {
        var h = ord4[hi];
        var on = c && c.h === h, dis = pl === 0 ? true : (!on && used[h]);
        html += '<button type="button" class="cell s' + h + (on ? ' on' : '') + (h === R.me ? ' mine' : '') + (pl === 0 ? ' locked' : '') + '" data-cell="' + pl + ',' + h + '"' + (dis ? ' disabled' : '') +
          ' title="' + T('{s} for {o}: {p}% chance', { s: sn(h), o: ord(pl + 1), p: Math.round(q.p[h][pl] * 100) }) + '"><span class="g">' + SUITS[h].glyph + '</span><span class="o">' + odds(q.o[h][pl]) + '</span></button>';
      }
      if (c) {
        var win = Math.round(E.callPayout(R, { stake: c.stake, odds: q.o[c.h][pl], place: pl + 1 }, false));
        html += '<button type="button" class="stakebtn on" data-stake="' + pl + '" title="' + T('Change stake') + '">' + money(c.stake) + '<small>' + T('wins {m}', { m: money(win) }) + '</small></button>';
      } else html += '<button type="button" class="stakebtn" disabled>–</button>';
      html += '</div>';
    }
    $('#board').innerHTML = html;
    var cm = CFG.combo, slam = E.cnt(R.horses[R.me], 'slam');
    if (slam) cm = CFG.comboSlam;
    var n = R.calls.filter(Boolean).length;
    $('#boardfoot').innerHTML = (n ? TP(n, '<b>{m}</b> staked on {n} call. ', '<b>{m}</b> staked on {n} calls. ', { m: money(E.reserved(R)) }) : T('You are locked in for 1st. Tap a horse to call 2nd, 3rd and 4th. ')) +
      T('A wrong call loses its stake. Combo on total winnings: 2 right ×{a}, 3 right ×{b}, 4 right ×{c}. Every correct call also earns 1 Stable Point. You are locked in for 1st, and your horse is the first column.', { a: I.n(String(cm[2])), b: I.n(String(cm[3])), c: I.n(String(cm[4])) });
  }
  $('#board').addEventListener('click', function (e) {
    var R = S.run, b = e.target.closest('button'); if (!b) return;
    if (b.dataset.cell) {
      var p = b.dataset.cell.split(',');
      if (E.setCall(R, +p[0], +p[1])) Sfx.pick(); else Sfx.deny();
    } else if (b.dataset.stake) E.cycleStake(R, +b.dataset.stake);
    renderPitState();
  });

  /* --- pit crews: starting pick, crew choice, and one pane per crew --- */
  function offerHTML(o) {
    return '<article class="offer s' + S.run.me + ' t-' + (o.tier || 'common') + (o.sold ? ' sold' : '') + '"><div class="otop"><span class="tag">' + o.tag + '</span><span class="own">' + (o.own || '') + '</span></div>' +
      '<h4>' + o.name + '</h4><span class="kindlbl">' + o.kind + '</span><p>' + o.blurb + '</p><div class="obuy"><span class="price' + (o.short && !o.sold ? ' short' : '') + '">' + o.price + '</span>' +
      '<button type="button" class="btn small primary" ' + o.attr + (o.sold || o.short || o.off ? ' disabled' : '') + '>' + o.btn + '</button></div></article>';
  }
  function upOffer(R, id, extra) {
    var u = E.upgradeById(id), sp = E.spendable(R);
    var own = u.kind === 'card' ? T('In hand {n}/{m}', { n: E.owned(R, id), m: E.handMax(R) }) : u.kind === 'gadget' ? T('Gadget slots {n}/{m}', { n: E.gadgetList(R).length, m: E.gadgetSlots(R) }) : T('Owned {n}/{m}', { n: E.owned(R, id), m: u.max });
    return Object.assign({ tier: u.tier, tag: T(E.TIER_NAME[u.tier]), own: own, name: T(u.name), kind: T(E.KIND_LABEL[u.kind]), blurb: T(u.blurb), sp: sp }, extra);
  }
  function renderCrew() {
    var R = S.run, prep = R.phase === 'prep', head = $('#crewhead'), secs = $$('#crewbody .csect');
    if (prep) {
      secs.forEach(function (s) { s.hidden = true; });
      if (R.startPicks) {
        head.innerHTML = '<div class="shophead"><h3 class="lbl">' + T('Starting pick') + '</h3></div><p class="note" style="margin-top:0">' + T('Take one upgrade for free before lap 1. Pick the start you want to build on.') + '</p><div class="offers" id="spick">' +
          R.startPicks.map(function (id, k) { return offerHTML(upOffer(R, id, { price: T('Free'), btn: T('Take it'), attr: 'data-spick="' + k + '"' })); }).join('') + '</div>';
      } else {
        var u = E.upgradeById(R.startPick);
        head.innerHTML = '<div class="shophead"><h3 class="lbl">' + T('Starting pick') + '</h3></div><p class="note" style="margin:0">' + T('You took {u}. Now call the order and place your first bets on the Bets tab, then start the lap.', { u: '<b>' + T(u.name) + '</b>' }) + '</p>';
      }
      return;
    }
    var used = R.crewsUsed, left = E.crewPicks(R) - used.length;
    var h = '<div class="shophead"><h3 class="lbl">' + T('Pit crew') + '</h3><span class="hint mono">' + (left > 0 ? TP(left, '{n} pick left this stop', '{n} picks left this stop') : T('crew chosen')) + '</span></div>';
    if (!used.length) h += '<p class="note" style="margin-top:0">' + T('Pick one crew for this stop. Every crew is a way to spend your cash, so choose what the next lap needs.') + '</p>';
    h += '<div class="crews">' + R.crews.map(function (id) {
      var c = E.CREWS[id], isUsed = used.indexOf(id) >= 0, viewing = isUsed && S.crewView === id, off = !isUsed && left <= 0;
      return '<button type="button" class="crewcard' + (isUsed ? ' used' : '') + (viewing ? ' view' : '') + '" data-crewpick="' + id + '"' + (off ? ' disabled' : '') + '><span class="cg" aria-hidden="true">' + c.glyph + '</span><b>' + T(c.name) + '</b><small>' + T(c.blurb) + '</small></button>';
    }).join('') + '</div>';
    if (S.crewMsg) h += '<p class="crewmsg">' + S.crewMsg + '</p>';
    head.innerHTML = h;
    secs.forEach(function (s) { s.hidden = s.dataset.crew !== S.crewView; });
    if (S.crewView === 'shop') renderShop();
    else if (S.crewView === 'market') renderMarket();
    else if (S.crewView === 'train') renderDrills();
    else if (S.crewView === 'den') { renderWheel(); renderTable(); }
    else if (S.crewView === 'event') renderEvent();
  }
  function renderShop() {
    var R = S.run, sp = E.spendable(R);
    $('#tiers').innerHTML = T('Rarity odds this stop: ') + E.tierOdds(R).map(function (o) {
      return '<span class="t-' + o.tier + '"><b>' + T(E.TIER_NAME[o.tier]) + '</b> ' + Math.round(o.pct) + '%</span>';
    }).join('');
    $('#offers').innerHTML = R.shop.map(function (o, idx) {
      var price = E.priceOf(R, o.id), u = E.upgradeById(o.id);
      return offerHTML(upOffer(R, o.id, { price: money(price), short: sp < price, sold: o.sold, off: !o.sold && !E.available(R, o.id), btn: o.sold ? T('Bought') : T('Buy'), attr: 'data-buy="' + idx + '"' }));
    }).join('');
    var rc = E.rerollCost(R), rb = $('#reroll');
    rb.textContent = rc === 0 ? T('Reroll (free)') : T('Reroll {m}', { m: money(rc) });
    rb.disabled = sp < rc;
  }
  function renderMarket() {
    var R = S.run, sp = E.spendable(R);
    $('#market').innerHTML = (R.market || []).map(function (o, idx) {
      var m = E.marketBy(o.id), price = E.marketPrice(R, o.id);
      return offerHTML({ tier: 'rare', tag: T('Deal'), own: '', name: T(m.name), kind: T('Black Market'), blurb: T(m.blurb), price: money(price), short: sp < price, sold: o.sold, off: !o.sold && !m.ok(R), btn: o.sold ? T('Bought') : T('Buy'), attr: 'data-mbuy="' + idx + '"' });
    }).join('') || '<p class="note">' + T('Nothing on offer this time.') + '</p>';
  }
  function renderDrills() {
    var R = S.run, sp = E.spendable(R);
    $('#drills').innerHTML = E.DRILLS.map(function (d) {
      var n = E.drillN(R, d.id), price = E.drillPrice(R, d.id), maxed = n >= d.max;
      return offerHTML({ tier: 'common', tag: T('Drill'), own: T('Done {n}/{m}', { n: n, m: d.max }), name: T(d.name), kind: T('Training Gallop'), blurb: T(d.blurb), price: maxed ? '–' : money(price), short: !maxed && sp < price, off: maxed, btn: maxed ? T('Maxed') : T('Train'), attr: 'data-drill="' + d.id + '"' });
    }).join('');
  }
  function renderWheel() {
    var R = S.run, w = R.wheel, sp = E.spendable(R);
    $('#wheel-hint').textContent = TP(CFG.wheelLimit - w.spins, '{n} spin left this stop', '{n} spins left this stop');
    var odds = E.WHEEL.map(function (x) { return '<span>' + Math.round(x.p * 100) + '% ' + (x.m ? '×' + I.n(String(x.m)) : T('bust')) + '</span>'; }).join('');
    var html = '<div class="wheelodds mono">' + odds + '</div><div class="tctl">' + CFG.wheelStakes.map(function (s) {
      return '<button type="button" class="btn small primary" data-spin="' + s + '"' + (w.spins >= CFG.wheelLimit || sp < s ? ' disabled' : '') + '>' + T('Spin {m}', { m: money(s) }) + '</button>';
    }).join('') + '</div>';
    if (w.last) html += '<div class="tmsg">' + (w.last.m ? '<b class="win">' + T('Won {m} (×{x})', { m: money(w.last.pay - w.last.stake, true), x: I.n(String(w.last.m)) }) + '</b>' : '<b class="lose">' + T('Bust: lost {m}', { m: money(w.last.stake) }) + '</b>') + '</div>';
    else html += '<div class="tmsg">' + T('Pay a stake, spin the wheel. The payout table is above and the house keeps a small edge.') + '</div>';
    $('#wheel').innerHTML = html;
  }
  function renderEvent() {
    var R = S.run, ev = R.event, box = $('#event'), sp = E.spendable(R); if (!ev) { box.innerHTML = ''; return; }
    var d = E.eventBy(ev.id);
    var h = '<div class="evhead"><span class="cg" aria-hidden="true">❓</span><div><h4>' + T(d.name) + '</h4><p>' + T(d.text) + '</p></div></div>';
    if (ev.done) h += '<p class="evdone">' + (ev.done.opt === 'walk' ? T('You walk away.') : T(ev.done.text) + (ev.done.gift ? ': ' + T(ev.done.gift) : '') + '.') + '</p>';
    else {
      h += '<div class="evopts">' + d.opts.map(function (o) {
        var off = (o.ok && !o.ok(R)) || sp < o.cost;
        return '<button type="button" class="evopt" data-evt="' + o.id + '"' + (off ? ' disabled' : '') + '><b>' + T(o.label) + '</b><small>' + T(o.blurb) + '</small><span class="price' + (sp < o.cost ? ' short' : '') + '">' + money(o.cost) + '</span></button>';
      }).join('') + '<button type="button" class="evopt walk" data-evt="walk"><b>' + T('Walk away') + '</b><small>' + T('Keep your cash.') + '</small><span class="price">' + money(0) + '</span></button></div>';
    }
    box.innerHTML = h;
  }
  function renderKit() {
    var R = S.run, me = R.horses[R.me], chips = [], gad = [];
    E.UPGRADES.forEach(function (u) {
      var n = E.cnt(me, u.id); if (!n) return;
      if (u.kind === 'gadget') gad.push('<span class="gchip t-' + u.tier + '">' + (AB_ICON[u.id] || '') + ' ' + T(u.name) + (n > 1 ? ' ×' + n : '') + (R.phase === 'shop' ? ' <button type="button" class="scrap" data-scrap="' + u.id + '" title="' + T('Sell this gadget back to free its slot') + '">' + T('Scrap +{m}', { m: money(Math.floor(CFG.scrap * CFG.tierPrice[u.tier] / 5) * 5 * n) }) + '</button>' : '') + '</span>');
      else chips.push('<span class="t-' + u.tier + '">' + T(u.name) + (n > 1 ? ' ×' + n : '') + '</span>');
    });
    E.UPGRADES.forEach(function (u) { if (u.kind === 'lap' && R.queue[u.id]) chips.push('<span class="q t-' + u.tier + '">' + T('Next lap: ') + T(u.name) + (R.queue[u.id] > 1 ? ' ×' + R.queue[u.id] : '') + '</span>'); });
    [['boost', 'Energy Tonic'], ['hurdle', 'Hurdle Shoes']].forEach(function (q) { if (R.queue[q[0]]) chips.push('<span class="q">' + T('Next lap: ') + T(q[1]) + (R.queue[q[0]] > 1 ? ' ×' + R.queue[q[0]] : '') + '</span>'); });
    var hand = R.hand.map(function (id) { return '<span class="cchip t-' + E.upgradeById(id).tier + '">' + AB_ICON[id] + ' ' + T(E.upgradeById(id).name) + '</span>'; });
    var h = '';
    h += '<div class="kitrow"><b>' + T('Gadgets {n}/{m}', { n: E.gadgetList(R).length, m: E.gadgetSlots(R) }) + '</b>' + (gad.join('') || '<span class="dim">' + T('none') + '</span>') + '</div>';
    h += '<div class="kitrow"><b>' + T('Hand {n}/{m}', { n: R.hand.length, m: E.handMax(R) }) + '</b>' + (hand.join('') || '<span class="dim">' + T('no round cards') + '</span>') + '</div>';
    h += '<div class="kitrow"><b>' + T('Upgrades') + '</b>' + (chips.join('') || '<span class="dim">' + T('No upgrades yet.') + '</span>') + '</div>';
    $('#kit').innerHTML = h;
  }
  $('#crewhead').addEventListener('click', function (e) {
    var R = S.run, b = e.target.closest('button'); if (!b) return;
    if (b.dataset.spick != null) { if (E.pickStart(R, +b.dataset.spick)) { Sfx.buy(); renderPitState(); setPitTab('bets'); } else Sfx.deny(); }
    else if (b.dataset.crewpick) {
      var id = b.dataset.crewpick;
      if (R.crewsUsed.indexOf(id) >= 0) { S.crewView = id; Sfx.pick(); renderPitState(); }
      else if (E.chooseCrew(R, id)) { S.crewView = id; S.crewMsg = null; Sfx.pick(); renderPitState(); }
      else Sfx.deny();
    }
  });
  function crewDone(msg) { S.crewMsg = msg || null; renderPitState(); }
  $('#offers').addEventListener('click', function (e) {
    var b = e.target.closest('[data-buy]'); if (!b) return;
    var o = S.run.shop[+b.dataset.buy], nm = o ? T(E.upgradeById(o.id).name) : '';
    if (E.buy(S.run, +b.dataset.buy)) { Sfx.buy(); crewDone(T('Bought {u}.', { u: '<b>' + nm + '</b>' })); } else Sfx.deny();
  });
  $('#market').addEventListener('click', function (e) {
    var b = e.target.closest('[data-mbuy]'); if (!b) return;
    var o = S.run.market[+b.dataset.mbuy], r = E.marketBuy(S.run, +b.dataset.mbuy);
    if (r) { Sfx.buy(); crewDone('<b>' + T(E.marketBy(o.id).name) + '</b>: ' + T(r.text) + '.'); } else Sfx.deny();
  });
  $('#drills').addEventListener('click', function (e) {
    var b = e.target.closest('[data-drill]'); if (!b) return;
    var r = E.drill(S.run, b.dataset.drill);
    if (r) { Sfx.buy(); crewDone('<b>' + T(E.drillBy(r.id).name) + '</b>: ' + T(E.drillBy(r.id).blurb)); } else Sfx.deny();
  });
  $('#wheel').addEventListener('click', function (e) {
    var b = e.target.closest('[data-spin]'); if (!b) return;
    var r = E.wheelSpin(S.run, +b.dataset.spin);
    if (r) { Sfx.wheel(r.m > 0); crewDone(null); } else Sfx.deny();
  });
  $('#event').addEventListener('click', function (e) {
    var b = e.target.closest('[data-evt]'); if (!b) return;
    var r = E.eventChoose(S.run, b.dataset.evt);
    if (r) { if (r.opt !== 'walk') Sfx.buy(); crewDone(null); } else Sfx.deny();
  });
  $('#kit').addEventListener('click', function (e) {
    var b = e.target.closest('[data-scrap]'); if (!b) return;
    var r = E.scrap(S.run, b.dataset.scrap);
    if (r) { Sfx.buy(); crewDone(T('Scrapped a gadget for {m}.', { m: money(r) })); }
  });
  $('#reroll').addEventListener('click', function () { if (E.reroll(S.run)) { Sfx.shuffle(); renderPitState(); } else Sfx.deny(); });
  $('#nextLap').addEventListener('click', function () {
    var R = S.run;
    if (R.phase === 'shop' && !R.crewsUsed.length && !S.skipCrew) { S.skipCrew = 1; Sfx.deny(); setPitTab('crew'); renderPitState(); return; }
    S.skipCrew = 0; beginLap();
  });

  /* --- card table: higher or lower --- */
  function mini(c, hidden) {
    if (hidden) return '<div class="mc q"></div>';
    return '<div class="mc s' + c.s + '"><b>' + lab({ r: c.r }) + '</b><i>' + SUITS[c.s].glyph + '</i></div>';
  }
  var TSTAKES = [10, 25, 50];
  function renderTable() {
    var R = S.run, t = R.table, el = $('#table'), av = E.spendable(R);
    $('#table-hint').textContent = T('Ties lose · ') + TP(E.tableLimit(R) - t.hands, '{n} hand left this stop', '{n} hands left this stop');
    var html = '';
    if (t.cur) {
      var od = E.tableOdds(t.cur.r);
      html = '<div class="tcards">' + mini(t.cur) + mini(null, true) + '</div><div class="tctl">' +
        '<button type="button" class="btn small primary" data-tg="higher"' + (od.higher ? '' : ' disabled') + '>' + T('Higher') + ' ' + (od.higher ? odds(od.higher) : '') + '</button>' +
        '<button type="button" class="btn small primary" data-tg="lower"' + (od.lower ? '' : ' disabled') + '>' + T('Lower') + ' ' + (od.lower ? odds(od.lower) : '') + '</button>' +
        '<span class="dim mono">' + T('{m} at stake', { m: money(t.cur.stake) }) + '</span></div>';
    } else {
      var opts = TSTAKES.filter(function (s) { return s <= av; });
      if (opts.length && opts.indexOf(S.tstake) < 0) S.tstake = opts[opts.length - 1];
      var can = t.hands < E.tableLimit(R) && opts.length > 0;
      html = '<div class="tcards">' + (t.last ? mini(t.last.first) + mini(t.last.second) : mini(null, true) + mini(null, true)) + '</div><div class="tctl">' +
        '<button type="button" class="btn small" data-tstake' + (can && opts.length > 1 ? '' : ' disabled') + '>' + T('Stake {m}', { m: money(S.tstake) }) + '</button>' +
        '<button type="button" class="btn small primary" data-deal' + (can ? '' : ' disabled') + '>' + T('Deal') + '</button></div>';
      if (t.last) html += '<div class="tmsg">' + T('Second card was {w}. You called {d}: ', { w: T(t.last.second.r > t.last.first.r ? 'higher' : t.last.second.r < t.last.first.r ? 'lower' : 'a tie'), d: T(t.last.dir) }) +
        (t.last.win ? '<b class="win">' + T('won {m}', { m: money(t.last.pay - t.last.stake, true) }) + '</b>' : '<b class="lose">' + T('lost {m}', { m: money(t.last.stake) }) + '</b>') + '.</div>';
      else html += '<div class="tmsg">' + T('A card is dealt face up. Call whether the next one is higher or lower. The payout follows the real chance.') + '</div>';
    }
    el.innerHTML = html;
  }
  $('#table').addEventListener('click', function (e) {
    var R = S.run, b = e.target.closest('button'); if (!b) return;
    if (b.hasAttribute('data-tstake')) {
      var opts = TSTAKES.filter(function (s) { return s <= E.spendable(R); });
      S.tstake = opts[(opts.indexOf(S.tstake) + 1) % opts.length];
    } else if (b.hasAttribute('data-deal')) { if (E.tableDeal(R, S.tstake)) Sfx.flip(); }
    else if (b.dataset.tg) { var tg = E.tableGuess(R, b.dataset.tg); if (tg) { Sfx.flip(); if (tg.win) Sfx.hit(2); else Sfx.miss(); } }
    renderPitState();
  });

  /* ---------- the pop after a lap and after a run ---------- */
  function celebrate(res) {
    if (!res) return;
    var net = res.net || 0, w = innerWidth, h = innerHeight;
    var nb = $('#netb'); if (nb) { FX.countUp(nb, net, 1100, '$', true); Sfx.tally(1.1, net > 0); }
    if (res.place === 1) { FX.confetti(w / 2, h * 0.28, 90); FX.shake(1); }
    if (res.hits > 0) FX.coins(w * 0.3, h * 0.45, 8 + res.hits * 8);
    if (net >= 40) FX.win(net, w / 2, h * 0.3, res.place === 1 ? T('WINNER') : T('NICE LAP'));
    else if (res.place === 1) FX.banner(T('1ST PLACE'), null, 'big');
  }
  function celebrateOver() {
    var r = S.run.result;
    if (S.newStuff && (S.newStuff.ach.length || S.newStuff.stake)) setTimeout(function () { Sfx.achieve(); }, r.champion ? 2200 : 600);
    if (r.champion) { Sfx.champion(); FX.banner(T('CHAMPION'), null, 'mega'); FX.confetti(0, 0, 160, { rain: true }); FX.confetti(innerWidth / 2, innerHeight * 0.35, 100); FX.shake(2); }
    else if (r.rank === 2) { Sfx.podium(); FX.confetti(innerWidth / 2, innerHeight * 0.3, 50); } else Sfx.settle();
  }

  /* ---------- run over ---------- */
  function renderOver() {
    var R = S.run, r = R.result;
    if (!S.recorded) {
      M.record(S.meta, r.sp, r.champion, r.points);
      S.newStuff = M.evaluate(S.meta, r, { daily: !!S.daily, maxDiff: CFG.maxDiff });
      if (S.daily) { var od = S.meta.daily; if (!od || od.date !== S.daily || r.points >= od.pts) S.meta.daily = { date: S.daily, pts: r.points, rank: r.rank, champion: r.champion }; }
      M.save(S.meta); S.recorded = true; clearSave();
    }
    var ot = $('#over-rank');
    ot.textContent = r.champion ? T('Champion') : T('{o} overall', { o: ord(r.rank) });
    ot.style.color = r.champion ? 'var(--gold)' : 'var(--ink)';
    $('#over-sub').textContent = r.champion ? T('Your suit took the run after {n} laps.', { n: R.laps }) : T('{s} took the run after {n} laps.', { s: sn(r.order[0]), n: R.laps });
    $('#over-standings').innerHTML = r.order.map(function (i, k) {
      return '<tr class="s' + i + (i === R.me ? ' me' : '') + '"><td class="mono">' + ord(k + 1) + '</td><td><span class="g">' + SUITS[i].glyph + '</span> ' + sn(i) + (i === R.me ? ' <span class="dim">' + T('(you)') + '</span>' : '') + '</td><td class="num">' + R.horses[i].points + '</td></tr>';
    }).join('');
    var rows = [[T('Lap points'), r.points]];
    if (r.bonus) rows.push([r.rank === 1 ? T('Champion bonus') : T('Runner-up bonus'), r.bonus]);
    rows.push([T('Correct calls'), r.correct]);
    var extra = r.sp - (r.points + r.bonus + r.correct);
    if (extra > 0) rows.push([T('Winner’s Purse'), extra]);
    $('#over-stmt').innerHTML = rows.map(function (x) { return '<div class="row"><span>' + x[0] + '</span><b class="pos">+' + x[1] + '</b></div>'; }).join('') +
      '<div class="row total"><span>' + T('Stable Points') + '</span><b class="gold">+' + r.sp + '</b></div>';
    var st = r.stats, cells = [[T('Laps won'), st.lapsWon], [T('Best lap'), money(st.bestLap)], [T('Cash earned'), money(r.cashEarned)], [T('Perfect jumps'), st.perfects], [T('Stumbles'), st.stumbles], [T('Spurs'), st.spurs], [T('Traps tripped'), st.trapHits + ' / ' + st.traps], [T('Peeks / burns'), st.peeks + ' / ' + st.burns], [T('Gadgets / cards used'), st.gadgets + ' / ' + st.cards], [T('Best streak'), st.bestStreak]];
    $('#over-stats').innerHTML = cells.map(function (c) { return '<div><b>' + c[1] + '</b><span>' + c[0] + '</span></div>'; }).join('');
    var nw = S.newStuff, nh = '';
    if (nw) {
      nw.ach.forEach(function (id) {
        var a = M.ACH.filter(function (x) { return x.id === id; })[0];
        nh += '<div class="got"><div><b>' + T('Trophy') + ': ' + T(a.name) + '</b><br><span>' + T(a.blurb) + (a.unlocks ? ' ' + T('Unlocked in the shop: {u}.', { u: T(E.upgradeById(a.unlocks).name) }) : '') + '</span></div></div>';
      });
      if (nw.stake) nh += '<div class="got"><div><b>' + T('Stakes unlocked') + ': ' + T(STAKE_NAMES[nw.stake]) + '</b><br><span>' + T('A harder run that pays more Stable Points.') + '</span></div></div>';
    }
    $('#over-new').hidden = !nh; $('#over-new').innerHTML = nh;
    $('#over-share').hidden = !S.daily;
    if (S.daily) { $('#sharetxt').textContent = shareText(); $('#shareBtn').textContent = T('Copy result'); }
    $('#over-forfeit').innerHTML = r.forfeited > 0 ? T('Unspent run cash <s>{m}</s> is lost. Run cash never carries over.', { m: money(r.forfeited) }) : T('Run cash never carries over.');
  }

  function shareText() {
    var R = S.run, r = R.result, medals = ['🥇', '🥈', '🥉', '⬛'];
    return 'Suit Derby · Daily ' + dailyLabel(S.daily) + '\n' + SUITS[R.me].glyph + ' ' + R.history.map(function (h) { return medals[h.place - 1]; }).join('') + '\n' +
      (r.champion ? T('Champion') : T('{o} overall', { o: ord(r.rank) })) + ' · ' + r.points + ' ' + T('pts');
  }
  $('#shareBtn').addEventListener('click', function () {
    var txt = $('#sharetxt').textContent, b = $('#shareBtn');
    function fallback() {
      try { var rg = document.createRange(); rg.selectNodeContents($('#sharetxt')); var sl = getSelection(); sl.removeAllRanges(); sl.addRange(rg); } catch (e) {}
      b.textContent = T('Selected: copy it now');
    }
    try { navigator.clipboard.writeText(txt).then(function () { b.textContent = T('Copied'); }, fallback); } catch (e) { fallback(); }
  });

  /* ---------- the Stable: a skill tree ---------- */
  var ICONS = { deep: '💰', winnings: '🏆', shrewd: '🏷️', purse: '👛', slots: '🛒', training: '🏇', loaded: '🃏', fit: '👟', farrier: '🧲', sharp: '🎯', odds: '📈', safety: '🛟',
    belt: '🧰', hand: '🖐️', crew2: '👥', pickmore: '🚪', cx_wild: '🌈', cx_cut: '✂️', cx_dupe: '✌️', cx_sharp: '🎴', cx_draft: '💨', cx_bank: '🏦', cx_luck: '🍀', cx_crowd: '📣', cx_bets: '🎰', cx_hostile: '🦈',
    jk_gambler: '🎲', jk_trainer: '🏋️', jk_banker: '🏦', jk_saboteur: '🪤', jk_collector: '🗝️', jk_daredevil: '🔥',
    sk_gold: '🥇', sk_midnight: '🌙', sk_neon: '💜', sk_ghost: '👻', sk_candy: '🍬', th_dusk: '🌇', th_turf: '🌿', th_snow: '❄️', th_neon: '🌆', lucky: '🍀', reroll: '🔄', eagle: '🦅' };
  var TREE = { sel: null, built: false };
  var NS = 'http://www.w3.org/2000/svg';
  function npos(n) { var a = n.a * Math.PI / 180, r = [0, 135, 245, 345, 440][n.r]; return { x: 500 + r * Math.cos(a), y: 500 + r * Math.sin(a) }; }
  function nodeState(n) {
    if (M.owned(S.meta, n.id) && M.costOf(S.meta, n.id) == null) return 'max';
    if (M.owned(S.meta, n.id)) return 'own';
    if (!M.isOpen(S.meta, n.id)) return 'locked';
    return M.canBuy(S.meta, n.id) ? 'aff' : 'open';
  }
  function branchOf(n) { return M.BRANCHES.filter(function (b) { return b.id === n.br; })[0]; }
  function renderTree() {
    var svg = $('#tree'), html = ''; TREE.seen2 = {};
    [135, 245, 345, 440].forEach(function (r) { html += '<circle class="ring" cx="500" cy="500" r="' + r + '"/>'; });
    var vis = function (n) { return M.owned(S.meta, n.id) || M.isOpen(S.meta, n.id); };
    M.NODES.forEach(function (n) {
      if (!vis(n)) return;
      var p = npos(n);
      n.parents.forEach(function (pid) {
        var pn = M.nodeById(pid), pp = pid === 'root' ? { x: 500, y: 500 } : npos(pn);
        var on = M.owned(S.meta, n.id) && M.owned(S.meta, pid);
        html += '<line class="edge' + (on ? ' on' : '') + '" x1="' + pp.x.toFixed(1) + '" y1="' + pp.y.toFixed(1) + '" x2="' + p.x.toFixed(1) + '" y2="' + p.y.toFixed(1) + '" style="--c:' + branchOf(n).color + '"/>';
      });
    });
    html += '<g class="nd root" data-node="root" transform="translate(500 500)"><circle r="40"/><text class="ic" y="10" text-anchor="middle">🐴</text></g>';
    M.NODES.forEach(function (n) {
      if (!vis(n)) return;
      var p = npos(n), st = nodeState(n), lv = M.level(S.meta, n.id), mx = M.maxOf(n), br = branchOf(n);
      var pips = '';
      if (mx > 1) for (var k = 0; k < mx; k++) pips += '<circle class="pip' + (k < lv ? ' on' : '') + '" cx="' + ((k - (mx - 1) / 2) * 9).toFixed(1) + '" cy="35" r="3"/>';
      var fresh = TREE.seen && !TREE.seen[n.id]; TREE.seen2[n.id] = 1;
      html += '<g class="nd st-' + st + (fresh ? ' new' : '') + (TREE.sel === n.id ? ' sel' : '') + '" data-node="' + n.id + '" transform="translate(' + p.x.toFixed(1) + ' ' + p.y.toFixed(1) + ')" style="--c:' + br.color + '" tabindex="0" role="button" aria-label="' + T(n.name) + '"><circle r="26"/><text class="ic" y="9" text-anchor="middle">' + (ICONS[n.id] || '•') + '</text>' + pips + '</g>';
    });
    svg.innerHTML = html; TREE.seen = TREE.seen2;
  }
  function renderNodeInfo() {
    var n = TREE.sel ? M.nodeById(TREE.sel) : null, box = $('#nodeinfo');
    if (!n || n.id === 'root') {
      box.innerHTML = '<p class="note" style="margin:0">' + T('Tap a node to see what it does. You start in the middle and the tree grows as you buy: new nodes appear next to the ones you own.') + '</p>' +
        '<div class="legend">' + M.BRANCHES.map(function (b) { return '<span style="--c:' + b.color + '"><i></i>' + T(b.name) + '</span>'; }).join('') + '</div>';
      return;
    }
    var st = nodeState(n), lv = M.level(S.meta, n.id), mx = M.maxOf(n), cost = M.costOf(S.meta, n.id), br = branchOf(n);
    var pips = ''; for (var k = 0; k < mx; k++) pips += '<i class="' + (k < lv ? 'on' : '') + '"></i>';
    var typ = { perk: 'Perk', codex: 'Codex', jockey: 'Jockey' }[n.type];
    var extra = '';
    if (n.unlocks) extra = '<p class="nx">' + T('Adds to the shop: {list}.', { list: n.unlocks.map(function (u) { return T(E.upgradeById(u).name); }).join(', ') }) + '</p>';
    var btn = st === 'max' ? '<button type="button" class="btn small" disabled>' + T('Maxed') + '</button>'
      : st === 'locked' ? '<button type="button" class="btn small" disabled>' + T('Open a neighbouring node first') + '</button>'
      : '<button type="button" class="btn small primary" data-buynode="' + n.id + '"' + (st === 'aff' ? '' : ' disabled') + '>' + T('Buy · {c} SP', { c: cost }) + '</button>';
    box.innerHTML = '<div class="ni"><span class="nic" aria-hidden="true">' + (ICONS[n.id] || '•') + '</span><div class="nt"><h4>' + T(n.name) + '</h4><span class="nb" style="--c:' + br.color + '">' + T(br.name) + ' · ' + T(typ) + '</span></div></div><p>' + T(n.blurb) + '</p>' + extra +
      '<div class="row"><div class="pips" aria-hidden="true">' + pips + '</div><span class="lv">' + (mx > 1 ? T('Level {n} / {m}', { n: lv, m: mx }) : (lv ? T('Owned') : T('Not owned'))) + '</span>' + btn + '</div>';
  }
  function renderWardrobe() {
    var sel = M.effects(S.meta).sel;
    function card(n) {
      var kind = n.skin ? 'skin' : 'theme', val = n[kind], own = M.owned(S.meta, n.id), cur = own && sel[kind] === val, cost = M.costOf(S.meta, n.id);
      var btn = own ? '<button type="button" class="btn small' + (cur ? '' : ' primary') + '" data-wear="' + kind + ':' + val + '"' + (cur ? ' disabled' : '') + '>' + (cur ? T('In use') : T('Use')) + '</button>'
        : '<button type="button" class="btn small primary" data-buynode="' + n.id + '"' + (M.canBuy(S.meta, n.id) ? '' : ' disabled') + '>' + T('Buy · {c} SP', { c: cost }) + '</button>';
      return '<div class="wcard' + (own ? ' own' : '') + (cur ? ' cur' : '') + '"><span class="wic" aria-hidden="true">' + (ICONS[n.id] || '•') + '</span><div class="wt"><h4>' + T(n.name) + '</h4><p>' + T(n.blurb) + '</p></div>' + btn + '</div>';
    }
    var def = function (kind, name, blurb, val) { var cur = sel[kind] === val; return '<div class="wcard own' + (cur ? ' cur' : '') + '"><span class="wic" aria-hidden="true">' + (kind === 'skin' ? '🐴' : '🏟️') + '</span><div class="wt"><h4>' + T(name) + '</h4><p>' + T(blurb) + '</p></div><button type="button" class="btn small' + (cur ? '' : ' primary') + '" data-wear="' + kind + ':' + val + '"' + (cur ? ' disabled' : '') + '>' + (cur ? T('In use') : T('Use')) + '</button></div>'; };
    $('#wardrobe').innerHTML = '<h3 class="lbl sect-h">' + T('Horse coat') + '</h3><div class="wgrid">' + def('skin', 'Classic', 'The plain suit-coloured coat.', 'classic') + M.COSMETICS.filter(function (n) { return n.skin; }).map(card).join('') + '</div>' +
      '<h3 class="lbl sect-h">' + T('Track') + '</h3><div class="wgrid">' + def('theme', 'Stadium', 'The floodlit stadium.', 'stadium') + M.COSMETICS.filter(function (n) { return n.theme; }).map(card).join('') + '</div>';
  }
  function setStab(t) {
    S.stab = t;
    $$('[data-stab]').forEach(function (b) { b.setAttribute('aria-selected', b.dataset.stab === t ? 'true' : 'false'); });
    $$('[data-stabpane]').forEach(function (p) { p.hidden = p.dataset.stabpane !== t; });
    if (t === 'tree') { var w = $('#treewrap'); w.scrollLeft = (w.scrollWidth - w.clientWidth) / 2; w.scrollTop = (w.scrollHeight - w.clientHeight) / 2; }
  }
  $('#stabs').addEventListener('click', function (e) { var b = e.target.closest('[data-stab]'); if (b) { Sfx.pick(); setStab(b.dataset.stab); } });
  $('#wardrobe').addEventListener('click', function (e) {
    var w = e.target.closest('[data-wear]');
    if (w) { var p = w.dataset.wear.split(':'); if (M.select(S.meta, p[0], p[1])) { M.save(S.meta); Sfx.pick(); renderWardrobe(); } return; }
    var b = e.target.closest('[data-buynode]');
    if (b && M.buy(S.meta, b.dataset.buynode)) { var n = M.nodeById(b.dataset.buynode); M.select(S.meta, n.skin ? 'skin' : 'theme', n.skin || n.theme); M.save(S.meta); Sfx.buy(); renderStable(); }
  });
  function renderStable() {
    $('#stable-sp').textContent = T('{n} SP', { n: S.meta.sp }); renderWardrobe();
    if (!TREE.sel) { var first = M.NODES.filter(function (n) { return nodeState(n) === 'aff'; })[0]; TREE.sel = first ? first.id : 'deep'; }
    renderTree(); renderNodeInfo();
    var fx = M.effects(S.meta);
    $('#codex-sub').textContent = T('{n} of {m} codex upgrades unlocked. Codex nodes in the tree add them to the shop pool.', { n: E.LOCKED.filter(function (id) { return fx.unlocked.indexOf(id) >= 0; }).length, m: E.LOCKED.length });
    $('#codex').innerHTML = E.LOCKED.map(function (id) {
      var u = E.upgradeById(id), on = fx.unlocked.indexOf(id) >= 0, node = M.NODES.filter(function (n) { return n.unlocks && n.unlocks.indexOf(id) >= 0; })[0], tr = Object.keys(E.UNLOCK).indexOf(id) >= 0;
      return '<span class="cx t-' + u.tier + (on ? ' on' : '') + '" title="' + T(u.blurb) + '"><b>' + T(u.name) + '</b><small>' + (on ? T('unlocked') : tr ? T('trophy') : node ? T(node.name) : '') + '</small></span>';
    }).join('');
    $('#trophy-sub').textContent = T('Trophies are earned once and kept. Some unlock new upgrades in the shop. Highest stakes open: {s}.', { s: T(STAKE_NAMES[S.meta.maxStake]) });
    $('#trophies').innerHTML = M.ACH.map(function (a) {
      var on = M.has(S.meta, a.id);
      return '<div class="troph' + (on ? ' on' : '') + '"><h4>' + T(a.name) + '</h4><p>' + T(a.blurb) + '</p>' + (a.unlocks ? '<em>' + (on ? T('Unlocked: {u}', { u: T(E.upgradeById(a.unlocks).name) }) : T('Unlocks: {u}', { u: T(E.upgradeById(a.unlocks).name) })) + '</em>' : '') + '</div>';
    }).join('');
    $('#resetMeta').textContent = S.resetArm ? T('Really reset everything?') : T('Reset all progress');
  }
  onEnter.stable = function () {
    TREE.seen = null; renderStable(); setStab(S.stab || 'tree');
  };
  function pickNode(id) { TREE.sel = id; Sfx.pick(); renderTree(); renderNodeInfo(); }
  $('#tree').addEventListener('click', function (e) { var g = e.target.closest('[data-node]'); if (g) pickNode(g.dataset.node); });
  $('#tree').addEventListener('keydown', function (e) { if (e.code === 'Enter' || e.code === 'Space') { var g = e.target.closest('[data-node]'); if (g) { e.preventDefault(); pickNode(g.dataset.node); } } });
  $('#nodeinfo').addEventListener('click', function (e) {
    var b = e.target.closest('[data-buynode]'); if (!b) return;
    if (M.buy(S.meta, b.dataset.buynode)) { M.save(S.meta); Sfx.buy(); renderStable(); }
  });
  $('#resetMeta').addEventListener('click', function () {
    if (!S.resetArm) { S.resetArm = 1; renderStable(); setTimeout(function () { S.resetArm = 0; if (S.screen === 'stable') renderStable(); }, 4000); return; }
    S.resetArm = 0; S.meta = M.reset(); TREE.sel = null; renderStable();
  });

  /* ---------- first-run guide ---------- */
  var GUIDE = [
    { h: 'The race', g: '♥ ♦ ♣ ♠', p: ['Four horses, one per suit. Every few seconds a card is drawn and the horse of that suit surges. You ride one suit and always back it to win.', 'Every lap is a race. Points for the place: 4, 3, 2, 1. Most points after the last lap wins the run.'] },
    { h: 'Your hands', g: 'S · Space · X', p: ['<b>Spur</b> (S) spends stamina for a surge: a full bar is worth much more than a half bar.', '<b>Brace</b> (Space) when a hazard lights up: tap in the gold zone for a perfect jump.', '<b>Trap</b> (X) drops a trap in front of the leading rival. You earn tokens by finishing 3rd or 4th.'] },
    { h: 'Money', g: '$ $ $', p: ['You win cash for your place, for cards of your suit after you finish, and for bets. Spend it on upgrades at the pit stop. <b>Cash left at the end of the run is lost.</b>', 'Bet on the next card. <b>Peek</b> shows it first, <b>Burn</b> throws it away.'] },
    { h: 'Crews and gadgets', g: '🛒 🍌 🃏', p: ['At every pit stop you pick <b>one crew</b>: the Shop, Black Market, Training Gallop, Gambler’s Den or a Trackside Event. Every crew is a way to spend your cash.', '<b>Gadgets</b> are permanent, recharge every lap and sit in 2 slots (keys Q, W, E). <b>Round cards</b> are one-time and wait in your hand (keys R, T, Y).', 'Before lap 1 you get a free <b>starting pick</b>. Stable Points grow a skill tree of perks, upgrades, jockeys, coats and tracks.'] },
    { h: 'Never out of it', g: '★', p: ['Trailing charges your <b>Grit</b>: stamina refills faster the further you are behind. Last in the standings? The shop gets bigger.', 'The final lap is <b>Derby Day</b>: every place is worth double points, so nothing is settled until the end.'] }
  ];
  function renderGuide() {
    var g = GUIDE[S.guideAt];
    $('#gdots').innerHTML = GUIDE.map(function (x, k) { return '<i class="' + (k <= S.guideAt ? 'on' : '') + '"></i>'; }).join('');
    $('#gbody').innerHTML = '<div class="mglyph">' + g.g + '</div><h3>' + T(g.h) + '</h3>' + g.p.map(function (x) { return '<p>' + T(x) + '</p>'; }).join('');
    $('#gnext').textContent = S.guideAt === GUIDE.length - 1 ? T('Got it') : T('Next');
    $('#gskip').hidden = S.guideAt === GUIDE.length - 1;
  }
  function openGuide() { S.guideAt = 0; renderGuide(); $('#guide').hidden = false; }
  function closeGuide() { $('#guide').hidden = true; if (!S.meta.guide) { S.meta.guide = true; M.save(S.meta); } }
  $('#gnext').addEventListener('click', function () { if (S.guideAt >= GUIDE.length - 1) closeGuide(); else { S.guideAt++; renderGuide(); } });
  $('#gskip').addEventListener('click', closeGuide);
  $('#openGuide').addEventListener('click', openGuide);
  document.addEventListener('keydown', function (e) { if (e.code === 'Escape' && !$('#guide').hidden) closeGuide(); });
  I.onChange(function () { if (!$('#guide').hidden) renderGuide(); });

  /* ---------- rules ---------- */
  function buildRules() {
    var C = CFG, tp = C.tierPrice;
    var alt = I.rules[I.lang];
    if (alt) { $('#rules').innerHTML = alt(C); return; }
    $('#rules').innerHTML =
      '<section><h3>A run</h3><p>Pick a suit and a length: <b>5 or 10 laps</b>. Every lap is one full race across the track between four horses, one per suit. Finishing 1st, 2nd, 3rd or 4th earns <b>' + C.points.join(', ') + ' points</b>. Whoever has the most points after the last lap is the champion.</p><p>Every run starts <b>level</b>: 10 cards per suit and no rival upgrades before lap 1. Your Stable perks are the only head start.</p></section>' +
      '<section><h3>The draw</h3><p>Every ' + C.drawEvery + ' seconds one card is drawn. The horse of that suit gets a <b>surge</b> that fades over a few seconds. Higher cards surge harder, but each card is a small push, so races run about a minute. Horses that have finished ignore surges.</p>' +
      '<div class="vals"><span>2–10 pips</span><span>J 11</span><span>Q 12</span><span>K 13</span><span>A 14</span><span>Joker 17</span></div></section>' +
      '<section><h3>The deck</h3><p>The deck is small: <b>' + (C.copies * 4 * (15 - C.minRank)) + ' cards</b>, ' + (C.copies * (15 - C.minRank)) + ' per suit, ranks ' + C.minRank + ' to Ace. Cards are drawn without being put back, so a suit that has come up a lot runs low and the horses that have been unlucky become more likely to get the next cards. Leaders fade and losers get their chance. Upgrades change it for the <b>whole run</b>: add your cards, raise them, or burn and steal a rival’s (never below ' + C.minSuit + ' cards per suit). At the start of every lap all cards are gathered and <b>reshuffled</b>.</p><p><b>Underdog fund:</b> at every pit stop, a suit holding less than ' + Math.round(C.underdog * 100) + '% of the deck gets free cards (up to ' + C.underdogMax + ') until it is back above that line, so no horse gets starved out of the run.</p><p>After every lap the rivals collect free upgrades too, and you can see which ones at the pit stop.</p></section>' +
      '<section><h3>Stamina and the Spur</h3><p>Every horse, yours and the rivals’, has a <b>stamina</b> bar that refills all lap. A <b>Spur</b> (tap the button, or press <b>S</b>) spends all of it for an instant surge, and the surge grows much faster than the stamina: a full bar is worth about ' + Math.round(1 / Math.pow(0.5, C.spurCurve)) + ' times a half bar. Wait for more, or go early and go twice. Rivals spur too, some patiently, some at once, and all of them sprint in the last stretch. A full bar stops refilling, so do not sit on it forever.</p></section>' +
      '<section><h3>Hazards</h3><p>Every horse meets ' + C.hazards + ' hazards per lap: hurdles and puddles in its own lane. When one comes within reach the game slows down and <b>BRACE</b> lights up (tap it, press <b>Space</b> or <b>B</b>). Tap in the gold end of the bar for a <b>perfect jump</b>: a small surge and ' + '$' + C.perfectCash + '. Tap in the orange middle for a safe clear, but not too soon: the first ' + Math.round(C.hzEarly * 100) + '% of the bar makes the horse jump badly and stumble. Miss it and your horse <b>stumbles</b> and loses most of its speed for about ' + C.stumbleT + ' seconds. Rivals clear about ' + Math.round(C.aiClear * 100) + '% of theirs.</p></section>' +
      '<section><h3>Next-card bets</h3><p>During the race you can bet on the <b>suit of the next card</b>. The odds are the exact chance from the cards still in the deck (shown as a percentage), so they change as the deck thins and you can play the numbers: back the likeliest suit for small wins, or a long shot for a big pop. Bet on several suits to hedge. The house keeps ' + Math.round((1 - C.cardEdge) * 100) + '%, but a <b>hit streak</b> refills your Spur stamina, and Scout Lens marks suits that will <b>not</b> come next. Stakes: ' + C.cardStakes.map(function (s) { return '$' + s; }).join(', ') + '. Press 1 to 4 to bet on a suit. A Chaos card refunds every bet.</p></section>' +
      '<section><h3>Calling the order</h3><p>Before every lap you call which horse finishes <b>1st, 2nd, 3rd and 4th</b>, and put a stake on each call. Your own horse is <b>locked in for 1st</b>: you always back yourself to win, and you can only change that stake. The other three places are yours to pick or skip. The bookie simulates the lap hundreds of times and shows odds for every horse in every place, so a longshot pays more. Odds move when you buy upgrades and <b>lock when the lap starts</b>.</p><p>A correct call pays stake × odds. A wrong call loses the stake. Get several right and the whole payout is multiplied by a <b>combo</b> (' + C.combo[2] + '× for two, ' + C.combo[3] + '× for three, ' + C.combo[4] + '× for all four). Every correct call also adds <b>1 Stable Point</b> to your run. The bookie does not price in your one-lap items, Spurs or luck upgrades, which is where an edge comes from.</p></section>' +
      '<section><h3>Money</h3><p>You earn <b>run cash</b> after every lap: a prize for your finishing place (' + C.prizes.map(function (p) { return '$' + p; }).join(', ') + '), a speed bonus of $' + C.bonusPerSec + ' for every second under ' + C.par + ' seconds, and <b>dividends</b>: once your horse has crossed the line, every card of your suit still drawn pays ' + C.divPerValue + '× its value. Bets are paid on top.</p><p>Spend cash on upgrades, rerolls, bets and the card table. <b>Whatever is left when the run ends is lost.</b></p></section>' +
      '<section><h3>Pit shop and tiers</h3><p>When you pick the Shop crew at a pit stop it offers ' + C.shopSlots + ' upgrades. Every upgrade belongs to a tier and <b>every upgrade of a tier costs the same</b>: Common $' + tp.common + ', Rare $' + tp.rare + ', Epic $' + tp.epic + ', Legendary $' + tp.legendary + '. The shop shows the chance of each rarity, and rarer upgrades show up more often as the run goes on. You can reroll for a fee.</p><p>Upgrade types: Deck, Horse, Money, Betting, Gear (like Scout Lens and Hurdler), Luck (random surges, cash windfalls, dice, a coin flip), Gadgets and Round cards (see below), and Next lap items that are used once. Some upgrades stay out of the shop until the Stable’s Codex unlocks them.</p></section>' +
      '<section><h3>Pit crews</h3><p>At every pit stop you pick <b>one crew</b> out of three (the Shop is always one of them). <b>Black Market:</b> four shady deals, a little cheaper than the shop: round cards, traps, extra deck cards and next-lap boosts. <b>Training Gallop:</b> drills that permanently improve your horse (speed, stamina, jumping, a fitter start); each drill costs more every time. <b>Gambler’s Den:</b> the card table and the Wheel of Fortune (' + C.wheelLimit + ' spins per stop). <b>Trackside Event:</b> a stranger with a proposition and a price: pick one of the paid options, or walk away. Before lap 1 you get a free <b>starting pick</b>: one upgrade out of three.</p></section>' +
      '<section><h3>Gadgets and round cards</h3><p><b>Gadgets</b> are permanent upgrades that take one of your <b>' + C.gadgetSlots + ' gadget slots</b>. Each copy gives one use per lap. <b>Banana Peel</b> (Q) trips the horse just ahead of you, <b>Cut</b> (W) moves your best card among the next ' + C.cutWindow + ' to the top of the deck, <b>Draft</b> (E) gives a +' + C.draftSurge + ' surge when a horse is up to ' + C.draftRange + ' units ahead. You can scrap a gadget at a pit stop for half its price. <b>Round cards</b> are used once and wait in a hand of ' + C.handMax + ': <b>Veto</b> (R) throws away the next rival card that would be drawn, <b>Wild</b> (T) makes the next rival card surge you instead, <b>Double Up</b> (Y) makes your next card surge twice. Unused cards carry over to the next lap.</p></section>' +
      '<section><h3>Jockeys</h3><p>Before a run you choose your <b>jockey</b>: Rookie (longer brace window), Gambler, Trainer, Saboteur, Banker, Daredevil or Collector, each with a passive edge. All but the Rookie are unlocked in the Stable. The three <b>rival jockeys</b> have a little character too: Rosa Valentine spurs early, Duke Carat rarely stumbles, Clover Quinn builds grit fastest and Silas Vane saves a huge late spur. You can also pick a horse coat and a track theme.</p></section>' +
      '<section><h3>Card table</h3><p>The Gambler’s Den has a table where you can play up to ' + C.denHands + ' hands of <b>higher or lower</b> per stop. A card is dealt, you call whether the next is higher or lower, and ties lose. The payout follows the true chance with a small house edge.</p></section>' +
      '<section><h3>Catching up</h3><p>Nobody should be out of a run by lap 3. <b>Grit:</b> the further your horse trails the leader in a lap, the faster its stamina refills (up to +' + Math.round(C.gritMax * 100) + '%), so a horse that is behind can build a big Spur. <b>Traps:</b> finish 3rd (1 token) or 4th (2 tokens) and you keep them for the next lap, up to ' + C.trapCap + '. Press <b>Trap</b> (X) to drop one in front of the leading rival: it trips it about ' + Math.round(C.trapHit * 100) + '% of the time. <b>Underdog draft:</b> last in the standings at a pit stop gives you an extra shop slot and a free reroll, 3rd gives a free reroll. <b>Derby Day:</b> the final lap is worth <b>double points</b>.</p></section>' +
      '<section><h3>Lap modifiers</h3><p>Most laps after the first carry a modifier that is announced at the pit stop, and the bookie prices it in: Mud Run (4 hazards, longer stumbles), Quickdraw (a card every 1.8 seconds), Headwind (slower cruising), Clear Track (no hazards, faster cruising), Golden Lap (prizes ×1.5) and Chaos Night (4 Chaos cards in the deck).</p></section>' +
      '<section><h3>Peek and burn</h3><p>During a lap you can <b>Peek</b> for $' + C.peekCost + ' to see the card on top of the deck. The draw waits a moment so you can react, and next-card bets are closed until it is drawn. You can only peek when no next-card bet is open. After a peek you can <b>Burn</b> the card for $' + C.burnCost + ' (up to ' + C.burnMax + ' times per lap) and peek again.</p></section>' +
      '<section><h3>Horse traits and sets</h3><p>Every suit’s horse has its own trait: ' + E.TRAITS.map(function (t, i) { return SUITS[i].glyph + ' ' + t.name + ' (' + t.blurb.replace(/\.$/, '') + ')'; }).join('; ') + '. Upgrades also form <b>sets</b>: own different upgrades of one type (Deck, Horse, Money, Betting, Luck, Gear) and the set pays a bonus, shown at the pit stop.</p></section>' +
      '<section><h3>Trophies, stakes and the Daily</h3><p><b>Trophies</b> are earned once for feats like a three-bet streak, three trapped rivals or a comeback win, and some of them unlock new upgrades (Echo Chamber, Trap Master, Phoenix, Grit Amplifier). Win a run to open the next <b>stakes</b> level: rivals buy more upgrades and prizes shrink, but Stable Points grow by ' + Math.round(C.diffSp * 100) + '% per level. The <b>Daily Derby</b> is a five-lap run on the same seed and horse for everyone that day, with no Stable perks, and gives a result you can copy and share.</p></section>' +
      '<section><h3>The Stable</h3><p>At the end of a run you earn <b>Stable Points</b>: lap points, correct calls, and a bonus of 2 per lap for the champion or 1 per lap for the runner-up. The Stable is a <b>skill tree</b>: you start in the middle and nodes stay hidden until a node next to them (towards the centre) is owned, so the tree grows as you buy. Seven branches lead out: Treasury (cash and prices), Training Yard (horse), Betting Ring, Workshop (gadget slots, hand size, a second crew), Codex (unlocks upgrades for the shop), Jockey Club (new jockeys) and Luck Alley. Coats and tracks have their own <b>Cosmetics</b> tab. Progress is saved in this browser.</p></section>';
  }

  /* ---------- loop ---------- */
  var last = performance.now();
  function frame(now) {
    var dt = Math.min((now - last) / 1000, 0.1); last = now;
    if (S.screen === 'game' && S.run) {
      var R = S.run, L = R.lap, ov = $('#ovtxt');
      if (S.gphase === 'countdown') {
        S.cd -= dt;
        var txt = S.cd > 0 ? String(Math.ceil(S.cd / 0.8)) : T('GO');
        if (ov.textContent !== txt) { ov.textContent = txt; ov.className = 'big'; Sfx.count(S.cd > 0 ? txt : 'GO'); }
        if (S.cd <= 0) { setGamePhase('racing'); S.goT = 0.6; }
      } else if (S.gphase === 'racing' || S.gphase === 'ending') {
        if (S.goT > 0) { S.goT -= dt; if (S.goT <= 0 && !S.paused) $('#overlay').hidden = true; }
        if (S.gphase === 'racing' && !S.paused) {
          photoCheck(dt);
          var mult = (openHazard() ? Math.min(S.speed, 0.6) : S.speed) * S.slowV;
          E.stepLap(R, dt * mult);
          handleEvents();
          if (L.done) { S.endDelay = 1.4; setGamePhase('ending'); renderCalls(); }
        } else if (S.gphase === 'ending') {
          S.endDelay -= dt;
          if (S.endDelay <= 0) finishLap();
        }
        if (S.gphase !== 'idle') renderActions();
        S.saveT = (S.saveT || 0) + dt; if (S.saveT > 3 && S.gphase === 'racing' && !S.paused) { S.saveT = 0; saveRun(); }
      }
      if (S.screen === 'game') { renderScene(dt); syncHud(); }
    }
    var live = S.screen === 'game' && S.run && S.run.lap && !S.paused;
    var mh = live && S.gphase === 'racing' ? S.run.horses[S.run.me] : null;
    Sfx.crowd(!!(live && (S.gphase === 'racing' || S.gphase === 'ending')));
    Sfx.music.dim(S.screen === 'game' && S.paused ? 0.25 : 1);
    var mp = live && S.gphase !== 'countdown' ? S.run.horses[S.run.me].pos / CFG.lapLen : 0;
    Sfx.music.level(mp > 0.85 ? 3 : mp > 0.55 ? 2 : mp > 0.18 ? 1 : 0);
    Sfx.music.swell(1 + 0.35 * Math.max(0, Math.min(1, (mp - 0.25) / 0.65)));
    Sfx.hooves(mh && !mh.fin ? (mh.base + mh.tb + mh.ex) * (mh.slowT > 0 ? 0.4 : 1) * (openHazard() ? 0.5 : 1) * (1 + (S.speed - 1) * 0.3) : 0);
    requestAnimationFrame(frame);
  }

  buildSetup(); buildRules();
  onEnter.menu();
  Sfx.music.mode('chill');
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(measure);
  requestAnimationFrame(frame);
  window.__derby = { S: S, E: E, M: M, go: go, scene: scene, FX: FX };
})();
