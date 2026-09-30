/* Suit Derby UI. Screens: menu, setup, game, pit stop, run over, Stable, rules. */
(function () {
  'use strict';
  var E = Engine, M = Meta, CFG = E.CFG, SUITS = E.SUITS;
  var $ = function (s, r) { return (r || document).querySelector(s); };
  var $$ = function (s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); };
  var reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var VARS = ['--hearts', '--diamonds', '--clubs', '--spades'];
  var PLACES = ['1st', '2nd', '3rd', '4th'];

  var S = {
    screen: 'menu', me: 0, laps: 5, run: null, meta: M.load(),
    gphase: 'idle', speed: 1, paused: false, cd: 0, goT: 0, endDelay: 0,
    hist: [], ticker: [], quitArm: 0, resetArm: 0, lastRes: null, recorded: false, tstake: 10, cstake: 10, roundBets: [], lastBets: null, quiet: false, flash: null
  };

  function money(n, sign) {
    var a = Math.abs(Math.round(n)).toLocaleString('en-US');
    if (n < 0) return '−$' + a;
    return (sign && n > 0 ? '+' : '') + '$' + a;
  }
  function ord(n) { return n + (['th', 'st', 'nd', 'rd'][(n % 100 > 10 && n % 100 < 14) ? 0 : (n % 10 < 4 ? n % 10 : 0)]); }
  function fmtT(t) { var m = Math.floor(t / 60); var s = (t - m * 60).toFixed(1); return m + ':' + (s.length < 4 ? '0' : '') + s; }
  function odds(o) { return '×' + o.toFixed(2); }

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
    if (onEnter[name]) onEnter[name]();
  }
  document.addEventListener('click', function (e) {
    var b = e.target.closest('[data-go]');
    if (b) go(b.dataset.go);
  });

  /* ---------- menu ---------- */
  $('#lineup').innerHTML = SUITS.map(function (s, i) { return '<div class="lu s' + i + '">' + horseSVG(i) + '</div>'; }).join('');
  onEnter.menu = function () {
    $('#menu-sp').textContent = 'Permanent upgrades · ' + S.meta.sp + ' Stable Points';
    $('#menu-stats').textContent = S.meta.runs
      ? S.meta.runs + ' runs · ' + S.meta.champs + ' won · best ' + S.meta.bestPts + ' pts'
      : 'No runs yet.';
  };

  /* ---------- setup ---------- */
  function buildSetup() {
    $('#picks').innerHTML = SUITS.map(function (s, i) {
      return '<label class="pick s' + i + '"><input type="radio" name="horse" value="' + i + '"' + (i === S.me ? ' checked' : '') + '>' +
        '<span class="g">' + s.glyph + '</span><span class="n">' + s.name + '</span><span class="you">You</span></label>';
    }).join('');
    $('#lapPills').innerHTML = CFG.lapChoices.map(function (n) {
      return '<label class="pill"><input type="radio" name="laps" value="' + n + '"' + (n === S.laps ? ' checked' : '') + '><b>' + n + ' laps</b><span>about ' + Math.round(n * 1.3) + ' minutes</span></label>';
    }).join('');
    $('#picks').addEventListener('change', function (e) { S.me = +e.target.value; });
    $('#lapPills').addEventListener('change', function (e) { S.laps = +e.target.value; });
  }
  onEnter.setup = function () {
    var fx = M.effects(S.meta), bits = [];
    if (fx.startCash > 90) bits.push('start with ' + money(fx.startCash));
    if (fx.loaded) bits.push(fx.loaded + ' extra cards in your suit');
    if (fx.baseSpeed) bits.push('+' + fx.baseSpeed.toFixed(1) + ' cruising speed');
    if (fx.cashMult > 1) bits.push('+' + Math.round((fx.cashMult - 1) * 100) + '% winnings');
    if (fx.discount) bits.push(Math.round(fx.discount * 100) + '% cheaper shop');
    if (fx.slots) bits.push('+' + fx.slots + ' shop slot' + (fx.slots > 1 ? 's' : ''));
    if (fx.freeRerolls) bits.push(fx.freeRerolls + ' free reroll' + (fx.freeRerolls > 1 ? 's' : ''));
    if (fx.owners) bits.push('a free starting upgrade');
    if (fx.luck) bits.push('better shop rarity');
    if (fx.sharp) bits.push('+' + Math.round(fx.sharp * 100) + '% bet payouts');
    $('#setup-perks').textContent = 'Every run starts level: 10 cards per suit, identical horses, no rival upgrades before lap 1. ' +
      (bits.length ? 'Your Stable perks: ' + bits.join(', ') + '.' : 'No Stable perks yet. Finish a run to earn Stable Points.');
  };
  $('#startRun').addEventListener('click', function () {
    S.run = E.newRun({ me: S.me, laps: S.laps, meta: M.effects(S.meta) });
    S.recorded = false; S.lastRes = null; S.tstake = 10; S.cstake = 10; S.lastBets = null; S.roundBets = [];
    renderPit(); go('pit');
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
    }).join('') + '<span>' + tot + ' cards' + (chaos ? ' + ' + chaos + ' chaos' : '') + '</span>';
  }
  function renderPts() {
    var R = S.run;
    $('#pts').innerHTML = R.horses.map(function (h) {
      return '<span class="s' + h.i + (h.i === R.me ? ' me' : '') + '"><b>' + SUITS[h.i].glyph + '</b>' + h.points + '</span>';
    }).join('') + '<span>pts</span>';
  }
  function openHazard() {
    var R = S.run, me = R.horses[R.me], z = R.lap.hz[R.me][me.hzi];
    return z && z.state === 'open' ? z : null;
  }
  var lastSub = '', lastBsub = '';
  function renderActions() {
    var R = S.run, L = R.lap, me = R.horses[R.me];
    var live = S.gphase === 'racing' && !S.paused && !me.fin && !L.done;
    var sp = $('#spur'), pct = Math.max(0, Math.min(100, me.sta));
    sp.disabled = !(live && me.sta >= CFG.spurMin);
    $('#spfill').style.width = pct.toFixed(1) + '%';
    sp.classList.toggle('full', live && pct >= 98);
    var sub = me.fin ? 'home' : pct >= 98 ? 'FULL CHARGE · surge +' + E.spurPower(me).toFixed(1) : me.sta >= CFG.spurMin ? 'now +' + E.spurPower(me).toFixed(1) + ' · wait for more' : 'charging ' + Math.round(pct) + '%';
    if (sub !== lastSub) { $('#spsub').textContent = sub; lastSub = sub; }
    var nx = live ? openHazard() : null, br = $('#brace');
    br.disabled = !nx; br.classList.toggle('hot', !!nx);
    var bs = nx ? 'NOW!' : 'no hazard near';
    if (bs !== lastBsub) { $('#bracesub').textContent = bs; lastBsub = bs; }
    $('#hzcall').hidden = !nx;
    if (nx) $('#hzfill').style.width = (Math.max(0, Math.min(1, 1 - (nx.x - me.pos) / CFG.hzWindow)) * 100).toFixed(1) + '%';
  }

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
      b.querySelector('.tag').textContent = o.out ? 'not next' : (o.s === best && o.open ? 'likeliest' : '');
      b.querySelector('.o').textContent = o.p > 0 ? odds(o.odds) : '–';
      b.querySelector('.p').textContent = pc + '% · ' + o.n + ' left';
      b.querySelector('.pb').style.setProperty('--p', pc + '%');
    });
    $$('#chips .sk').forEach(function (c) { var v = +c.dataset.chip; c.setAttribute('aria-pressed', String(v === S.cstake)); c.disabled = R.cash < v; });
    if (S.flash) {
      var fb = box.children[S.flash.s], cls = S.flash.hit ? 'win' : 'lose'; S.flash = null;
      fb.classList.remove('win', 'lose'); void fb.offsetWidth; fb.classList.add(cls);
      setTimeout(function () { fb.classList.remove(cls); }, 750);
    }
    var tot = L.bets.reduce(function (x, y) { return x + y; }, 0);
    $('#betinfo').textContent = tot ? money(tot) + ' on the next card. Pays stake × odds if it lands.' : 'Odds are the exact chance from the cards left. A hit streak fills your Spur.';
    var sk = $('#streak');
    sk.textContent = L.streak ? 'Streak ×' + L.streak + ' · next hit +' + (Math.min(L.streak + 1, 5) * CFG.streakSta) + ' stamina' : 'Streak 0';
    sk.classList.toggle('on', L.streak > 0);
    $('#rebet').disabled = !canBet || !S.lastBets || !S.lastBets.length || tot > 0;
  }
  function placeBet(suit) {
    var R = S.run;
    if (S.screen !== 'game' || !R) return false;
    if (S.gphase !== 'countdown' && S.gphase !== 'racing') return false;
    if (S.paused) return false;
    if (E.placeBet(R, suit, S.cstake)) { S.roundBets.push([suit, S.cstake]); renderBets(); syncHud(); return true; }
    return false;
  }
  $('#bets').addEventListener('click', function (e) { var b = e.target.closest('[data-bet]'); if (b) placeBet(+b.dataset.bet); });
  $('#chips').addEventListener('click', function (e) { var b = e.target.closest('[data-chip]'); if (b) { S.cstake = +b.dataset.chip; renderBets(); } });
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
    el.innerHTML = '<span style="border:0;padding-left:0">Your calls</span>' + cs.map(function (c) {
      return '<span class="s' + c.horse + ' ' + callState(c) + '">' + PLACES[c.place - 1] + ' <b>' + SUITS[c.horse].glyph + '</b> ' + odds(c.odds) + ' ' + money(c.stake) + '</span>';
    }).join('');
  }
  function renderTicker() {
    $('#ticker').innerHTML = S.ticker.slice(-3).map(function (t) {
      return '<span class="t s' + t.i + '"><b>' + (t.i >= 0 ? SUITS[t.i].glyph : '★') + '</b> ' + t.text + '</span>';
    }).join('');
  }
  function syncHud() {
    var R = S.run, L = R.lap, me = R.horses[R.me];
    $('#glap').textContent = 'Lap ' + R.lapNo + ' / ' + R.laps;
    $('#gclock').textContent = fmtT(L.t);
    $('#gcash').textContent = money(R.cash);
    $('#tick').style.transform = 'scaleX(' + Math.min(1, L.drawTimer / CFG.drawEvery).toFixed(3) + ')';
    $('#skip').disabled = !me.fin || L.done;
  }

  function showCard(ev) {
    var c = ev.card, s = c.s, lab = E.label(c), face = $('#face'), chaos = !!c.chaos;
    var col = chaos ? 'var(--gold)' : 'var(' + VARS[s] + ')', g = chaos ? '★' : SUITS[s].glyph;
    face.style.setProperty('--c', col);
    face.className = 'face' + (chaos ? ' chaosface' : '');
    face.innerHTML = '<span class="cr tl">' + lab + '<i>' + g + '</i></span><span class="mid">' + g + '</span><span class="cr br">' + lab + '<i>' + g + '</i></span>';
    var inner = $('#cardin');
    inner.style.transform = 'rotateY(0deg)';
    if (!reduce && inner.animate) inner.animate([{ transform: 'rotateY(180deg)' }, { transform: 'rotateY(0deg)' }], { duration: 400, easing: 'cubic-bezier(.2,.8,.2,1)' });
    var names = { 11: 'Jack', 12: 'Queen', 13: 'King', 14: 'Ace' };
    var R = S.run, line;
    if (chaos) {
      $('#dname').textContent = 'Chaos card';
      line = ev.horse >= 0 ? SUITS[ev.horse].name + ' surges +' + CFG.chaosBoost + '. You collect ' + money(ev.cash, true) + '.' : 'Nobody left to surge. You collect ' + money(ev.cash, true) + '.';
    } else {
      $('#dname').textContent = c.joker ? 'Joker of ' + SUITS[s].name : (names[c.r] || c.r) + ' of ' + SUITS[s].name;
      if (ev.fin) line = s === R.me ? 'Home already. Dividend ' + money(ev.div, true) + '.' : SUITS[s].name + ' already finished.';
      else line = SUITS[s].name + ' surges +' + ev.boost.toFixed(1) + (s === R.me ? '. That one is yours.' : '.');
    }
    $('#dline').textContent = line;
    S.hist.unshift({ s: chaos ? -1 : s, lab: lab });
    S.hist = S.hist.slice(0, 10);
    $('#hist').innerHTML = S.hist.map(function (h) { return h.s < 0 ? '<span class="chip" style="--c:var(--gold)">?</span>' : '<span class="chip s' + h.s + '">' + h.lab + SUITS[h.s].glyph + '</span>'; }).join('');
  }
  function surge(i) { if (i >= 0) scene.surge(i); }
  function floatMoney(i, txt) { scene.say(i, txt, '#e9cf73'); }
  function suitBtn(s) { var b = document.querySelector('[data-bet="' + s + '"]'); if (!b) return { x: innerWidth / 2, y: innerHeight * 0.6 }; var r = b.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; }

  function handleEvents() {
    var R = S.run, evs = R.events.splice(0), lastCard = -1, redraw = false, quiet = S.quiet;
    evs.forEach(function (ev, k) { if (ev.type === 'draw' || ev.type === 'chaos') lastCard = k; });
    evs.forEach(function (ev, k) {
      if (ev.type === 'draw') {
        if (k === lastCard) showCard(ev);
        surge(ev.horse); scene.cheer(0.06 + ev.boost * 0.012);
        if (ev.div > 0) floatMoney(ev.horse, money(ev.div, true));
        redraw = true;
      } else if (ev.type === 'chaos') {
        if (k === lastCard) showCard(ev);
        surge(ev.horse);
        floatMoney(R.me, money(ev.cash, true));
        S.ticker.push({ i: -1, text: 'Chaos card' + (ev.horse >= 0 ? ': ' + SUITS[ev.horse].name + ' surges' : '') + ', you collect ' + money(ev.cash) });
        redraw = true;
      } else if (ev.type === 'bet') {
        S.lastBets = S.roundBets.length ? S.roundBets : S.lastBets; S.roundBets = [];
        redraw = true;
        if (ev.void) { S.ticker.push({ i: -1, text: 'Chaos card: your next-card bets are refunded' }); return; }
        var pos = suitBtn(ev.suit);
        S.flash = { s: ev.suit, hit: ev.hit };
        if (ev.hit) {
          S.ticker.push({ i: ev.suit, text: 'Next-card hit ' + odds(ev.odds) + ' · ' + money(ev.net, true) + (ev.streak > 1 ? ' · streak ×' + ev.streak : '') });
          if (!quiet) {
            var tier = FX.win(ev.pay, pos.x, pos.y);
            if (!tier || tier === 'nice') { if (ev.streak >= 3) FX.banner('HOT STREAK ×' + ev.streak, null, 'big'); }
            var a = scene.anchor(R.me, R);
            if (ev.streak >= 2) { scene.say(R.me, 'STREAK ×' + ev.streak, '#ffe07a'); scene.spur(R.me); }
            FX.sparks(a.x, a.y, 10 + ev.streak * 3);
            $('#gcash').classList.remove('bump'); void $('#gcash').offsetWidth; $('#gcash').classList.add('bump');
          }
        } else {
          S.ticker.push({ i: ev.suit, text: 'Next card was ' + SUITS[ev.suit].name + ' · ' + money(ev.net) });
        }
      } else if (ev.type === 'spur') {
        scene.spur(ev.horse);
        if (ev.horse === R.me) { scene.say(R.me, 'SPUR +' + ev.power.toFixed(1), '#ffe07a', true); if (!quiet) { var b2 = scene.anchor(R.me, R); FX.ring(b2.x, b2.y, '#ffe07a'); FX.sparks(b2.x, b2.y, 12); } S.ticker.push({ i: R.me, text: 'Spur at ' + Math.round(ev.pct) + '% stamina: surge +' + ev.power.toFixed(1) }); }
        else if (ev.pct >= 85) S.ticker.push({ i: ev.horse, text: 'unleashes a full-charge Spur' });
      } else if (ev.type === 'hz') {
        var me = ev.horse === R.me;
        if (ev.res === 'stumble') { scene.stumble(ev.horse); if (me) S.ticker.push({ i: R.me, text: 'stumbles over the hazard' }); }
        else if (ev.res === 'perfect') {
          scene.say(ev.horse, me ? 'PERFECT +' + money(CFG.perfectCash) : 'PERFECT', '#ffe07a'); scene.spark(ev.horse, '#ffe07a', 16);
          if (me) { if (!quiet) { var a3 = scene.anchor(R.me, R); FX.win(CFG.perfectCash, a3.x, a3.y); } S.ticker.push({ i: R.me, text: 'perfect jump ' + money(CFG.perfectCash, true) }); }
        } else if (me) scene.say(R.me, 'CLEAR', '#9ba593');
      } else if (ev.type === 'luck') {
        if (ev.kind === 'horseshoe') { surge(R.me); scene.say(R.me, 'HORSESHOE', '#ffe07a'); S.ticker.push({ i: R.me, text: 'Lucky Horseshoe: bonus surge' }); }
        else if (ev.kind === 'jackpot') {
          surge(R.me); floatMoney(R.me, money(ev.cash, true)); S.ticker.push({ i: -1, text: 'JACKPOT ' + money(ev.cash, true) });
          if (!quiet) FX.win(ev.cash, innerWidth / 2, innerHeight * 0.4, 'JACKPOT');
        }
        else if (ev.kind === 'coin') S.ticker.push({ i: R.me, text: 'Coin of Fate landed ' + ev.text + ': ' + (ev.text === 'heads' ? '+' + CFG.coinHeads : CFG.coinTails).toString().replace('-', '−') + ' cruising this lap' });
        else if (ev.kind === 'dice') S.ticker.push({ i: R.me, text: 'Loaded Dice: ' + ev.n + ' extra cards this lap' });
      } else if (ev.type === 'sabotage') {
        S.ticker.push({ i: ev.horse, text: 'is sabotaged and surges 40% less this lap' });
      } else if (ev.type === 'finish') {
        S.ticker.push({ i: ev.horse, text: (ev.horse === R.me ? 'you finish ' : 'finishes ') + ord(ev.place) });
        scene.say(ev.horse, ord(ev.place), ev.place === 1 ? '#ffe07a' : '#ece8da', true);
        if (ev.place === 1 || ev.horse === R.me) scene.finishFlash();
        if (ev.horse === R.me && ev.place === 1 && !quiet) { FX.confetti(innerWidth / 2, innerHeight * 0.3, 70); FX.banner('WINNER', null, 'big'); FX.shake(1); }
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
    S.ticker = []; S.hist = []; S.paused = false; S.endDelay = 0; S.quiet = false; S.roundBets = [];
    E.startLap(R);
    scene.setMe(R.me); scene.reset(); $('#hzcall').hidden = true;
    $('#hist').innerHTML = ''; $('#dname').textContent = 'Shuffling'; $('#dline').textContent = 'First card comes out soon.';
    $('#face').className = 'face'; $('#cardin').style.transform = 'rotateY(180deg)';
    $('#pause').textContent = 'Pause';
    go('game');
    measure(); scene.setMe(R.me); scene.reset();
    handleEvents();
    renderDeck('#deckbar', '#deckleg', E.deckCounts(R, true), R.me, E.chaosCount(R, true)); renderPts(); renderCalls(); renderTicker();
    syncHud(); setSpeedUI();
    S.cd = 2.4; S.goT = 0;
    $('#overlay').hidden = false;
    setGamePhase('countdown'); renderBets(); renderActions();
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
      S.paused = !S.paused; b.textContent = S.paused ? 'Resume' : 'Pause';
      $('#ovtxt').textContent = 'Paused'; $('#ovtxt').className = 'big sm'; $('#overlay').hidden = !S.paused;
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
  $('#spur').addEventListener('click', doSpur);
  $('#brace').addEventListener('click', doBrace);
  document.addEventListener('keydown', function (e) {
    if (S.screen !== 'game' || e.repeat) return;
    if (e.code === 'Space') { e.preventDefault(); if (S.run && openHazard()) doBrace(); else doSpur(); }
    else if (e.code === 'KeyB') doBrace();
    else if (e.code === 'KeyS') doSpur();
    else if (e.code >= 'Digit1' && e.code <= 'Digit4') placeBet(+e.code.slice(5) - 1);
  });

  $('#quit').addEventListener('click', function () {
    var b = $('#quit');
    if (!S.quitArm) { S.quitArm = 1; b.textContent = 'Quit run?'; setTimeout(function () { S.quitArm = 0; b.textContent = 'Quit'; }, 3000); return; }
    S.quitArm = 0; b.textContent = 'Quit'; S.run = null; S.gphase = 'idle'; go('menu');
  });

  /* ---------- pit stop ---------- */
  function renderPit() {
    var R = S.run, res = S.lastRes, me = R.horses[R.me], prep = R.phase === 'prep';
    $('#pit-title').textContent = prep ? 'Before lap 1' : 'Lap ' + res.lapNo + ' of ' + R.laps + ' complete';
    $('#pit-stand-h').textContent = prep ? 'On the line' : 'Championship';
    var pl = $('#pit-place'), stmt = $('#pit-stmt');
    if (prep) {
      pl.textContent = 'Level start'; pl.style.color = 'var(--ink)';
      stmt.innerHTML = '<p class="note" style="margin:0">Every suit has the same 10 cards and the same horse. Nobody has an upgrade yet, so the odds below are even. Call the order and place your first bets, then start the lap.</p>';
    } else {
      pl.textContent = ord(res.place) + ' this lap'; pl.style.color = res.place === 1 ? 'var(--gold)' : 'var(--ink)';
      var rows = [['Prize', res.prize], [res.secs > 0 ? 'Speed bonus, ' + res.secs.toFixed(1) + 's under par' : 'Speed bonus, ' + Math.abs(res.secs).toFixed(1) + 's over par', res.bonus],
        ['Dividends, ' + res.divCount + (res.divCount === 1 ? ' card' : ' cards'), res.divs]];
      if (res.interest) rows.push(['Interest', res.interest]);
      if (res.penny) rows.push(['Lucky Penny', res.penny]);
      var hzCash = (res.hz ? res.hz.perfect : 0) * CFG.perfectCash;
      if (res.hz && (res.hz.perfect + res.hz.clear + res.hz.stumble)) rows.push(['Hazards: ' + res.hz.perfect + ' perfect, ' + res.hz.clear + ' clear, ' + res.hz.stumble + ' stumbled', hzCash]);
      if (res.windfall - hzCash > 0) rows.push(['Luck windfalls', res.windfall - hzCash]);
      var gm = res.gamble;
      if (gm && gm.n) rows.push(['Next-card bets, ' + gm.hits + ' of ' + gm.n + ' hit' + (gm.best > 1 ? ' (best streak ' + gm.best + ')' : ''), gm.net]);
      var html = rows.map(function (r, k) { return '<div class="row' + (r[1] > 0 ? ' pop' : '') + '" style="animation-delay:' + (k * 0.08) + 's"><span>' + r[0] + '</span><b class="' + (r[1] > 0 ? 'pos' : r[1] < 0 ? 'neg' : 'dim') + '">' + money(r[1], true) + '</b></div>'; }).join('');
      if (res.calls.length) {
        html += '<div class="row"><span>Bets, ' + res.hits + ' of ' + res.calls.length + ' right' + (res.combo > 1 ? ' (combo ×' + res.combo + ')' : '') + '</span><b class="' + (res.betNet >= 0 ? 'pos' : 'neg') + '">' + money(res.betNet, true) + '</b></div>';
        html += res.calls.map(function (c) {
          return '<div class="row sub"><span class="s' + c.horse + '">' + PLACES[c.place - 1] + ' <b style="color:var(--c)">' + SUITS[c.horse].glyph + '</b> ' + odds(c.odds) + ' on ' + money(c.stake) + '</span><b class="' + (c.hit ? 'pos' : 'neg') + '">' + (c.hit ? money(c.win, true) : 'miss') + '</b></div>';
        }).join('');
      }
      var race = res.total - res.betReturn;
      res.net = race + res.betNet + (gm ? gm.net : 0);
      html += '<div class="row total"><span>Net this lap</span><b class="gold" id="netb">' + money(res.net, true) + '</b></div>';
      stmt.innerHTML = html;
    }
    var order = E.runOrder(R);
    $('#pit-standings').innerHTML = order.map(function (i, k) {
      var h = R.horses[i], lp = res ? res.order.filter(function (o) { return o.i === i; })[0] : null;
      return '<tr class="s' + i + (i === R.me ? ' me' : '') + '"><td class="mono">' + (prep ? '–' : ord(k + 1)) + '</td><td><span class="g">' + SUITS[i].glyph + '</span> ' + SUITS[i].name + (i === R.me ? ' <span class="dim">(you)</span>' : '') + (lp ? ' <span class="dim mono">+' + CFG.points[lp.place - 1] + '</span>' : '') + '</td><td class="num">' + h.points + '</td></tr>';
    }).join('');
    renderRivals();
    $('#nextLap').textContent = 'Start lap ' + (R.lapNo + 1) + ' of ' + R.laps;
    $('#shopclosed').hidden = !prep;
    $('#offers').hidden = prep; $('#tiers').hidden = prep; $('#reroll').hidden = prep;
    renderPitState();
  }
  function ufLine() {
    var res = S.lastRes;
    if (!res || !res.topUps || !res.topUps.length) return '';
    return '<p class="uf"><b>Underdog fund</b> (no suit is starved out of the deck): ' + res.topUps.map(function (t) { return SUITS[t.horse].glyph + ' +' + t.n + ' card' + (t.n > 1 ? 's' : ''); }).join(', ') + '.</p>';
  }
  function renderRivals() {
    var R = S.run, box = $('#rivals');
    if (R.phase === 'prep' || !R.rivalLog.length) {
      box.innerHTML = R.phase === 'prep' ? '' : '<h3 class="lbl">Rivals at the stop</h3><p class="note" style="margin:0">Nobody upgraded this time.</p>' + ufLine();
      return;
    }
    box.innerHTML = '<h3 class="lbl">Rivals upgraded during the stop</h3><div class="rvlist">' + R.rivalLog.map(function (r) {
      return '<span class="rv s' + r.horse + ' t-' + r.tier + '"><span class="g">' + SUITS[r.horse].glyph + '</span>' + r.name + ' <em>' + E.TIER_NAME[r.tier] + '</em></span>';
    }).join('') + '</div>' + ufLine();
  }
  // everything that changes when cash, odds, bets or offers change
  function renderPitState() {
    var R = S.run, prep = R.phase === 'prep';
    var av = E.spendable(R), rs = E.reserved(R);
    $('#pit-cash').textContent = money(av);
    $('#pit-cash-sub').textContent = rs ? 'cash ' + money(R.cash) + ' · ' + money(rs) + ' on bets' : 'to spend';
    renderBoard();
    if (!prep) renderShop();
    renderTable();
    renderKit();
    renderDeck('#pit-deckbar', '#pit-deckleg', E.deckCounts(R, false), R.me, E.chaosCount(R, false));
  }

  /* --- call the order --- */
  function renderBoard() {
    var R = S.run, q = R.quote, used = {};
    R.calls.forEach(function (c) { if (c) used[c.h] = true; });
    var ord4 = [R.me].concat([0, 1, 2, 3].filter(function (x) { return x !== R.me; }));
    var html = '<div class="brow bhead"><span></span>' + ord4.map(function (h) {
      return '<span class="bh s' + h + (h === R.me ? ' you' : '') + '">' + (h === R.me ? 'You' : SUITS[h].name) + '</span>';
    }).join('') + '<span></span></div>';
    for (var pl = 0; pl < 4; pl++) {
      var c = R.calls[pl];
      html += '<div class="brow"><span class="bplace">' + PLACES[pl] + (pl === 0 ? '<i class="lockmark" title="Your horse is locked in for 1st">Locked</i>' : '') + '</span>';
      for (var hi = 0; hi < 4; hi++) {
        var h = ord4[hi];
        var on = c && c.h === h, dis = pl === 0 ? true : (!on && used[h]);
        html += '<button type="button" class="cell s' + h + (on ? ' on' : '') + (h === R.me ? ' mine' : '') + (pl === 0 ? ' locked' : '') + '" data-cell="' + pl + ',' + h + '"' + (dis ? ' disabled' : '') +
          ' title="' + SUITS[h].name + ' for ' + PLACES[pl] + ': ' + Math.round(q.p[h][pl] * 100) + '% chance"><span class="g">' + SUITS[h].glyph + '</span><span class="o">' + odds(q.o[h][pl]) + '</span></button>';
      }
      if (c) {
        var win = Math.round(E.callPayout(R, { stake: c.stake, odds: q.o[c.h][pl], place: pl + 1 }, false));
        html += '<button type="button" class="stakebtn on" data-stake="' + pl + '" title="Change stake">' + money(c.stake) + '<small>wins ' + money(win) + '</small></button>';
      } else html += '<button type="button" class="stakebtn" disabled>–</button>';
      html += '</div>';
    }
    $('#board').innerHTML = html;
    var cm = CFG.combo, slam = E.cnt(R.horses[R.me], 'slam');
    if (slam) cm = CFG.comboSlam;
    var n = R.calls.filter(Boolean).length;
    $('#boardfoot').innerHTML = (n ? '<b>' + money(E.reserved(R)) + '</b> staked on ' + n + ' call' + (n > 1 ? 's' : '') + '. ' : 'You are locked in for 1st. Tap a horse to call 2nd, 3rd and 4th. ') +
      'A wrong call loses its stake. Combo on total winnings: 2 right ×' + cm[2] + ', 3 right ×' + cm[3] + ', 4 right ×' + cm[4] + '. Every correct call also earns 1 Stable Point. You are locked in for 1st, and your horse is the first column.';
  }
  $('#board').addEventListener('click', function (e) {
    var R = S.run, b = e.target.closest('button'); if (!b) return;
    if (b.dataset.cell) {
      var p = b.dataset.cell.split(',');
      E.setCall(R, +p[0], +p[1]);
    } else if (b.dataset.stake) E.cycleStake(R, +b.dataset.stake);
    renderPitState();
  });

  /* --- shop --- */
  function renderShop() {
    var R = S.run, me = R.horses[R.me], sp = E.spendable(R);
    $('#tiers').innerHTML = 'Rarity odds this stop: ' + E.tierOdds(R).map(function (t) {
      return '<span class="t-' + t.tier + '"><b>' + E.TIER_NAME[t.tier] + '</b> ' + Math.round(t.pct) + '%</span>';
    }).join('');
    $('#offers').innerHTML = R.shop.map(function (o, idx) {
      var u = E.upgradeById(o.id), price = E.priceOf(R, o.id), short = sp < price;
      var own = 'Owned ' + E.owned(R, o.id) + '/' + u.max;
      return '<article class="offer s' + R.me + ' t-' + u.tier + (o.sold ? ' sold' : '') + '"><div class="otop"><span class="tag">' + E.TIER_NAME[u.tier] + '</span><span class="own">' + own + '</span></div>' +
        '<h4>' + u.name + '</h4><span class="kindlbl">' + E.KIND_LABEL[u.kind] + '</span><p>' + u.blurb + '</p><div class="obuy"><span class="price' + (short && !o.sold ? ' short' : '') + '">' + money(price) + '</span>' +
        '<button type="button" class="btn small primary" data-buy="' + idx + '"' + (o.sold || short ? ' disabled' : '') + '>' + (o.sold ? 'Bought' : 'Buy') + '</button></div></article>';
    }).join('');
    var rc = E.rerollCost(R), rb = $('#reroll');
    rb.textContent = rc === 0 ? 'Reroll (free)' : 'Reroll ' + money(rc);
    rb.disabled = sp < rc;
  }
  function renderKit() {
    var R = S.run, me = R.horses[R.me], chips = [];
    E.UPGRADES.forEach(function (u) { var n = E.cnt(me, u.id); if (n) chips.push('<span class="t-' + u.tier + '">' + u.name + (n > 1 ? ' ×' + n : '') + '</span>'); });
    E.UPGRADES.forEach(function (u) { if (u.kind === 'lap' && R.queue[u.id]) chips.push('<span class="q t-' + u.tier + '">Next lap: ' + u.name + (R.queue[u.id] > 1 ? ' ×' + R.queue[u.id] : '') + '</span>'); });
    $('#kit').innerHTML = chips.length ? chips.join('') : '<span class="dim">No upgrades yet.</span>';
  }
  $('#offers').addEventListener('click', function (e) {
    var b = e.target.closest('[data-buy]'); if (!b) return;
    if (E.buy(S.run, +b.dataset.buy)) renderPitState();
  });
  $('#reroll').addEventListener('click', function () { if (E.reroll(S.run)) renderPitState(); });
  $('#nextLap').addEventListener('click', beginLap);

  /* --- card table: higher or lower --- */
  function mini(c, hidden) {
    if (hidden) return '<div class="mc q"></div>';
    return '<div class="mc s' + c.s + '"><b>' + E.label({ r: c.r }) + '</b><i>' + SUITS[c.s].glyph + '</i></div>';
  }
  var TSTAKES = [10, 25, 50];
  function renderTable() {
    var R = S.run, t = R.table, el = $('#table'), av = E.spendable(R);
    $('#table-hint').textContent = 'Ties lose · ' + (CFG.tableLimit - t.hands) + ' hand' + (CFG.tableLimit - t.hands === 1 ? '' : 's') + ' left this stop';
    var html = '';
    if (t.cur) {
      var od = E.tableOdds(t.cur.r);
      html = '<div class="tcards">' + mini(t.cur) + mini(null, true) + '</div><div class="tctl">' +
        '<button type="button" class="btn small primary" data-tg="higher"' + (od.higher ? '' : ' disabled') + '>Higher ' + (od.higher ? odds(od.higher) : '') + '</button>' +
        '<button type="button" class="btn small primary" data-tg="lower"' + (od.lower ? '' : ' disabled') + '>Lower ' + (od.lower ? odds(od.lower) : '') + '</button>' +
        '<span class="dim mono">' + money(t.cur.stake) + ' at stake</span></div>';
    } else {
      var opts = TSTAKES.filter(function (s) { return s <= av; });
      if (opts.length && opts.indexOf(S.tstake) < 0) S.tstake = opts[opts.length - 1];
      var can = t.hands < CFG.tableLimit && opts.length > 0;
      html = '<div class="tcards">' + (t.last ? mini(t.last.first) + mini(t.last.second) : mini(null, true) + mini(null, true)) + '</div><div class="tctl">' +
        '<button type="button" class="btn small" data-tstake' + (can && opts.length > 1 ? '' : ' disabled') + '>Stake ' + money(S.tstake) + '</button>' +
        '<button type="button" class="btn small primary" data-deal' + (can ? '' : ' disabled') + '>Deal</button></div>';
      if (t.last) html += '<div class="tmsg">Second card was ' + (t.last.second.r > t.last.first.r ? 'higher' : t.last.second.r < t.last.first.r ? 'lower' : 'a tie') + '. You called ' + t.last.dir + ': ' +
        (t.last.win ? '<b class="win">won ' + money(t.last.pay - t.last.stake, true) + '</b>' : '<b class="lose">lost ' + money(t.last.stake) + '</b>') + '.</div>';
      else html += '<div class="tmsg">A card is dealt face up. Call whether the next one is higher or lower. The payout follows the real chance.</div>';
    }
    el.innerHTML = html;
  }
  $('#table').addEventListener('click', function (e) {
    var R = S.run, b = e.target.closest('button'); if (!b) return;
    if (b.hasAttribute('data-tstake')) {
      var opts = TSTAKES.filter(function (s) { return s <= E.spendable(R); });
      S.tstake = opts[(opts.indexOf(S.tstake) + 1) % opts.length];
    } else if (b.hasAttribute('data-deal')) E.tableDeal(R, S.tstake);
    else if (b.dataset.tg) E.tableGuess(R, b.dataset.tg);
    renderPitState();
  });

  /* ---------- the pop after a lap and after a run ---------- */
  function celebrate(res) {
    if (!res) return;
    var net = res.net || 0, w = innerWidth, h = innerHeight;
    var nb = $('#netb'); if (nb) FX.countUp(nb, net, 1100, '$', true);
    if (res.place === 1) { FX.confetti(w / 2, h * 0.28, 90); FX.shake(1); }
    if (res.hits > 0) FX.coins(w * 0.3, h * 0.45, 8 + res.hits * 8);
    if (net >= 40) FX.win(net, w / 2, h * 0.3, res.place === 1 ? 'WINNER' : 'NICE LAP');
    else if (res.place === 1) FX.banner('1ST PLACE', null, 'big');
  }
  function celebrateOver() {
    var r = S.run.result;
    if (r.champion) { FX.banner('CHAMPION', null, 'mega'); FX.confetti(0, 0, 160, { rain: true }); FX.confetti(innerWidth / 2, innerHeight * 0.35, 100); FX.shake(2); }
    else if (r.rank === 2) FX.confetti(innerWidth / 2, innerHeight * 0.3, 50);
  }

  /* ---------- run over ---------- */
  function renderOver() {
    var R = S.run, r = R.result;
    if (!S.recorded) { M.record(S.meta, r.sp, r.champion, r.points); M.save(S.meta); S.recorded = true; }
    var t = $('#over-rank');
    t.textContent = r.champion ? 'Champion' : ord(r.rank) + ' overall';
    t.style.color = r.champion ? 'var(--gold)' : 'var(--ink)';
    $('#over-sub').textContent = r.champion ? 'Your suit took the run after ' + R.laps + ' laps.' : SUITS[r.order[0]].name + ' took the run after ' + R.laps + ' laps.';
    $('#over-standings').innerHTML = r.order.map(function (i, k) {
      return '<tr class="s' + i + (i === R.me ? ' me' : '') + '"><td class="mono">' + ord(k + 1) + '</td><td><span class="g">' + SUITS[i].glyph + '</span> ' + SUITS[i].name + (i === R.me ? ' <span class="dim">(you)</span>' : '') + '</td><td class="num">' + R.horses[i].points + '</td></tr>';
    }).join('');
    var rows = [['Lap points', r.points]];
    if (r.bonus) rows.push([r.rank === 1 ? 'Champion bonus' : 'Runner-up bonus', r.bonus]);
    rows.push(['Correct calls', r.correct]);
    var extra = r.sp - (r.points + r.bonus + r.correct);
    if (extra > 0) rows.push(['Winner’s Purse', extra]);
    $('#over-stmt').innerHTML = rows.map(function (x) { return '<div class="row"><span>' + x[0] + '</span><b class="pos">+' + x[1] + '</b></div>'; }).join('') +
      '<div class="row total"><span>Stable Points</span><b class="gold">+' + r.sp + '</b></div>';
    $('#over-forfeit').innerHTML = r.forfeited > 0 ? 'Unspent run cash <s>' + money(r.forfeited) + '</s> is lost. Run cash never carries over.' : 'Run cash never carries over.';
  }

  /* ---------- the Stable ---------- */
  function renderStable() {
    $('#stable-sp').textContent = S.meta.sp + ' SP';
    $('#perks').innerHTML = M.ITEMS.map(function (it) {
      var lv = M.level(S.meta, it.id), max = M.maxOf(it), cost = M.costOf(S.meta, it.id);
      var pips = ''; for (var k = 0; k < max; k++) pips += '<i class="' + (k < lv ? 'on' : '') + '"></i>';
      return '<article class="perk"><h4>' + it.name + '</h4><p>' + it.blurb + '</p><div class="pips" aria-hidden="true">' + pips + '</div>' +
        '<div class="row"><span class="lv">Level ' + lv + ' / ' + max + '</span>' +
        (cost == null ? '<button type="button" class="btn small" disabled>Maxed</button>' :
          '<button type="button" class="btn small primary" data-perk="' + it.id + '"' + (S.meta.sp < cost ? ' disabled' : '') + '>Buy · ' + cost + ' SP</button>') + '</div></article>';
    }).join('');
    $('#resetMeta').textContent = S.resetArm ? 'Really reset everything?' : 'Reset all progress';
  }
  onEnter.stable = renderStable;
  $('#perks').addEventListener('click', function (e) {
    var b = e.target.closest('[data-perk]'); if (!b) return;
    if (M.buy(S.meta, b.dataset.perk)) { M.save(S.meta); renderStable(); }
  });
  $('#resetMeta').addEventListener('click', function () {
    if (!S.resetArm) { S.resetArm = 1; renderStable(); setTimeout(function () { S.resetArm = 0; if (S.screen === 'stable') renderStable(); }, 4000); return; }
    S.resetArm = 0; S.meta = M.reset(); renderStable();
  });

  /* ---------- rules ---------- */
  function buildRules() {
    var C = CFG, tp = C.tierPrice;
    $('#rules').innerHTML =
      '<section><h3>A run</h3><p>Pick a suit and a length: <b>5 or 10 laps</b>. Every lap is one full race across the track between four horses, one per suit. Finishing 1st, 2nd, 3rd or 4th earns <b>' + C.points.join(', ') + ' points</b>. Whoever has the most points after the last lap is the champion.</p><p>Every run starts <b>level</b>: 10 cards per suit, identical horses, and no rival upgrades before lap 1. Your Stable perks are the only head start.</p></section>' +
      '<section><h3>The draw</h3><p>Every ' + C.drawEvery + ' seconds one card is drawn. The horse of that suit gets a <b>surge</b> that fades over a few seconds. Higher cards surge harder, but each card is a small push, so races run about a minute. Horses that have finished ignore surges.</p>' +
      '<div class="vals"><span>2–10 pips</span><span>J 11</span><span>Q 12</span><span>K 13</span><span>A 14</span><span>Joker 17</span></div></section>' +
      '<section><h3>The deck</h3><p>The deck is small: <b>' + (C.copies * 4 * (15 - C.minRank)) + ' cards</b>, ' + (C.copies * (15 - C.minRank)) + ' per suit, ranks ' + C.minRank + ' to Ace. Cards are drawn without being put back, so a suit that has come up a lot runs low and the horses that have been unlucky become more likely to get the next cards. Leaders fade and losers get their chance. Upgrades change it for the <b>whole run</b>: add your cards, raise them, or burn and steal a rival’s (never below ' + C.minSuit + ' cards per suit). At the start of every lap all cards are gathered and <b>reshuffled</b>.</p><p><b>Underdog fund:</b> at every pit stop, a suit holding less than ' + Math.round(C.underdog * 100) + '% of the deck gets free cards (up to ' + C.underdogMax + ') until it is back above that line, so no horse gets starved out of the run.</p><p>After every lap the rivals collect free upgrades too, and you can see which ones at the pit stop.</p></section>' +
      '<section><h3>Stamina and the Spur</h3><p>Every horse, yours and the rivals’, has a <b>stamina</b> bar that refills all lap. A <b>Spur</b> (tap the button, or press <b>S</b>) spends all of it for an instant surge, and the surge grows much faster than the stamina: a full bar is worth about ' + Math.round(1 / Math.pow(0.5, C.spurCurve)) + ' times a half bar. Wait for more, or go early and go twice. Rivals spur too, some patiently, some at once, and all of them sprint in the last stretch. A full bar stops refilling, so do not sit on it forever.</p></section>' +
      '<section><h3>Hazards</h3><p>Every horse meets ' + C.hazards + ' hazards per lap: hurdles and puddles in its own lane. When one comes within reach the game slows down and <b>BRACE</b> lights up (tap it, press <b>Space</b> or <b>B</b>). Tap in the gold end of the bar for a <b>perfect jump</b>: a small surge and ' + '$' + C.perfectCash + '. Tap early for a safe clear. Miss it and your horse <b>stumbles</b> and loses most of its speed for about ' + C.stumbleT + ' seconds. Rivals clear about ' + Math.round(C.aiClear * 100) + '% of theirs.</p></section>' +
      '<section><h3>Next-card bets</h3><p>During the race you can bet on the <b>suit of the next card</b>. The odds are the exact chance from the cards still in the deck (shown as a percentage), so they change as the deck thins and you can play the numbers: back the likeliest suit for small wins, or a long shot for a big pop. Bet on several suits to hedge. The house keeps ' + Math.round((1 - C.cardEdge) * 100) + '%, but a <b>hit streak</b> refills your Spur stamina, and Scout Lens marks suits that will <b>not</b> come next. Stakes: ' + C.cardStakes.map(function (s) { return '$' + s; }).join(', ') + '. Press 1 to 4 to bet on a suit. A Chaos card refunds every bet.</p></section>' +
      '<section><h3>Calling the order</h3><p>Before every lap you call which horse finishes <b>1st, 2nd, 3rd and 4th</b>, and put a stake on each call. Your own horse is <b>locked in for 1st</b>: you always back yourself to win, and you can only change that stake. The other three places are yours to pick or skip. The bookie simulates the lap hundreds of times and shows odds for every horse in every place, so a longshot pays more. Odds move when you buy upgrades and <b>lock when the lap starts</b>.</p><p>A correct call pays stake × odds. A wrong call loses the stake. Get several right and the whole payout is multiplied by a <b>combo</b> (' + C.combo[2] + '× for two, ' + C.combo[3] + '× for three, ' + C.combo[4] + '× for all four). Every correct call also adds <b>1 Stable Point</b> to your run. The bookie does not price in your one-lap items, Spurs or luck upgrades, which is where an edge comes from.</p></section>' +
      '<section><h3>Money</h3><p>You earn <b>run cash</b> after every lap: a prize for your finishing place (' + C.prizes.map(function (p) { return '$' + p; }).join(', ') + '), a speed bonus of $' + C.bonusPerSec + ' for every second under ' + C.par + ' seconds, and <b>dividends</b>: once your horse has crossed the line, every card of your suit still drawn pays ' + C.divPerValue + '× its value. Bets are paid on top.</p><p>Spend cash on upgrades, rerolls, bets and the card table. <b>Whatever is left when the run ends is lost.</b></p></section>' +
      '<section><h3>Pit shop and tiers</h3><p>The shop opens after lap 1 and offers ' + C.shopSlots + ' upgrades. Every upgrade belongs to a tier and <b>every upgrade of a tier costs the same</b>: Common $' + tp.common + ', Rare $' + tp.rare + ', Epic $' + tp.epic + ', Legendary $' + tp.legendary + '. The shop shows the chance of each rarity, and rarer upgrades show up more often as the run goes on. You can reroll for a fee.</p><p>Upgrade types: Deck, Horse, Money, Betting, Gear (like Scout Lens and Hurdler), Luck (random surges, cash windfalls, dice, a coin flip), and Next lap items that are used once.</p></section>' +
      '<section><h3>Card table</h3><p>At every pit stop you can play up to ' + C.tableLimit + ' hands of <b>higher or lower</b>. A card is dealt, you call whether the next is higher or lower, and ties lose. The payout follows the true chance with a small house edge.</p></section>' +
      '<section><h3>The Stable</h3><p>At the end of a run you earn <b>Stable Points</b>: lap points, correct calls, and a bonus of 2 per lap for the champion or 1 per lap for the runner-up. Spend them in The Stable on permanent perks: starting cash, extra cards, faster cruising, cheaper shops, better rarity odds and better bet payouts. Progress is saved in this browser.</p></section>';
  }

  /* ---------- loop ---------- */
  var last = performance.now();
  function frame(now) {
    var dt = Math.min((now - last) / 1000, 0.1); last = now;
    if (S.screen === 'game' && S.run) {
      var R = S.run, L = R.lap, ov = $('#ovtxt');
      if (S.gphase === 'countdown') {
        S.cd -= dt;
        var txt = S.cd > 0 ? String(Math.ceil(S.cd / 0.8)) : 'GO';
        if (ov.textContent !== txt) { ov.textContent = txt; ov.className = 'big'; }
        if (S.cd <= 0) { setGamePhase('racing'); S.goT = 0.6; }
      } else if (S.gphase === 'racing' || S.gphase === 'ending') {
        if (S.goT > 0) { S.goT -= dt; if (S.goT <= 0 && !S.paused) $('#overlay').hidden = true; }
        if (S.gphase === 'racing' && !S.paused) {
          var mult = openHazard() ? Math.min(S.speed, 0.4) : S.speed;
          E.stepLap(R, dt * mult);
          handleEvents();
          if (L.done) { S.endDelay = 1.4; setGamePhase('ending'); renderCalls(); }
        } else if (S.gphase === 'ending') {
          S.endDelay -= dt;
          if (S.endDelay <= 0) finishLap();
        }
        if (S.gphase !== 'idle') renderActions();
      }
      if (S.screen === 'game') { renderScene(dt); syncHud(); }
    }
    requestAnimationFrame(frame);
  }

  buildSetup(); buildRules();
  onEnter.menu();
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(measure);
  requestAnimationFrame(frame);
  window.__derby = { S: S, E: E, M: M, go: go, scene: scene, FX: FX };
})();
