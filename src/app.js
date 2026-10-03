/* Suit Derby shell: navigation, sound buttons, language switch, menu, rules and the first-run guide.
   The game itself lives in gamble.js (engine) and gamble_ui.js (screens). */
(function () {
  'use strict';
  var G = Gamble, SUITS = G.SUITS, C = G.CFG;
  var $ = function (s, r) { return (r || document).querySelector(s); };
  var $$ = function (s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); };
  var I = I18n, T = I.t;
  I.init();

  var S = { screen: 'menu', guideAt: 0 };
  var GUIDE_KEY = 'suitderby.gguide';
  try { localStorage.removeItem('suitderby.run'); } catch (e) {}   // a saved run of the old horse mode can never be resumed

  function money(n, sign) {
    var a = Math.abs(Math.round(n)).toLocaleString(I.locale());
    if (n < 0) return '−$' + a;
    return (sign && n > 0 ? '+' : '') + '$' + a;
  }
  function ord(n) { return I.lang === 'tr' ? n + '.' : n + (['th', 'st', 'nd', 'rd'][(n % 100 > 10 && n % 100 < 14) ? 0 : (n % 10 < 4 ? n % 10 : 0)]); }

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
    Sfx.music.mode(name === 'grace' ? 'race' : 'chill');
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
    if (b && !b.matches('#snd,#sndMenu,#mus,#musMenu')) Sfx.click();
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
  onEnter.menu = function () { renderLang(); renderSnd(); };
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
  I.onChange(function () { buildRules(); onEnter.menu(); renderSnd(); });

  /* ---------- first-run guide: opens once, the first time Gambler's Night is entered; Rules has it again ---------- */
  var GUIDE = [
    { h: 'One deck, four horses', g: '♥ ♦ ♣ ♠', p: ['You own no horse tonight. Four horses, one per suit, race through one shuffled deck. Every card drawn moves the horse of that suit one step, or two on a face card.', 'There is no clock. Time only moves when a card is drawn.'] },
    { h: 'Call the order', g: '1 · 2 · 3 · 4', p: ['Before the first card, pick which horse finishes in each place and put chips on it. The odds come from the cards left in the deck, so read the deck sheet.', 'Lock your slip and the odds are fixed. A perfect order pays a big bonus.'] },
    { h: 'Rig the race', g: '🃏 🤫', p: ['While the cards fall you can spend cash on tools: peek at the next card, burn it, stack the deck, soak a lane in mud, give a horse a tailwind.', 'Every trick costs money, and most of them cost Heat.'] },
    { h: 'Mind the Heat', g: '🔥 👮', p: ['Heat cools a little with every clean card. Past the warning mark, each trick can bring a steward inspection: a fine, and the tool is taken.', 'Reach the cap and you are caught: that race’s slip is void.'] },
    { h: 'Back room, back home', g: '$ → RP', p: ['Between races you can buy a favor, cool off or borrow. What you hold when the night ends is your score.', 'Every night earns Reputation Points for permanent upgrades. Your night is saved after every move.'] }
  ];
  function renderGuide() {
    var g = GUIDE[S.guideAt];
    $('#gdots').innerHTML = GUIDE.map(function (x, k) { return '<i class="' + (k <= S.guideAt ? 'on' : '') + '"></i>'; }).join('');
    $('#gbody').innerHTML = '<div class="mglyph">' + g.g + '</div><h3>' + T(g.h) + '</h3>' + g.p.map(function (x) { return '<p>' + T(x) + '</p>'; }).join('');
    $('#gnext').textContent = S.guideAt === GUIDE.length - 1 ? T('Got it') : T('Next');
    $('#gskip').hidden = S.guideAt === GUIDE.length - 1;
  }
  function openGuide() { S.guideAt = 0; renderGuide(); $('#guide').hidden = false; }
  function closeGuide() { $('#guide').hidden = true; try { localStorage.setItem(GUIDE_KEY, '1'); } catch (e) {} }
  function guideOnce() { var seen = false; try { seen = !!localStorage.getItem(GUIDE_KEY); } catch (e) {} if (!seen) openGuide(); }
  $('#gnext').addEventListener('click', function () { if (S.guideAt >= GUIDE.length - 1) closeGuide(); else { S.guideAt++; renderGuide(); } });
  $('#gskip').addEventListener('click', closeGuide);
  $('#openGuide').addEventListener('click', openGuide);
  document.addEventListener('keydown', function (e) { if (e.code === 'Escape' && !$('#guide').hidden) closeGuide(); });
  I.onChange(function () { if (!$('#guide').hidden) renderGuide(); });

  /* ---------- rules ---------- */
  function sec(h, ps) { return '<section><h3>' + T(h) + '</h3>' + ps.map(function (p) { return '<p>' + p + '</p>'; }).join('') + '</section>'; }
  function buildRules() {
    var chips = C.chips.map(function (c) { return money(c); }).join(', ');
    var tools = '<ul class="toolrules">' + G.TOOL_ORDER.map(function (id) {
      var t = G.TOOLS[id];
      return '<li><b>' + T(t.name) + '</b> <span class="mono">' + money(t.cost) + (t.heat ? ' · ' + T('Heat +{h}', { h: t.heat }) : '') + ' · ' + (t.night ? T('once a night') : T('{n} per race', { n: t.uses })) + (t.open ? '' : ' · ' + T('unlock in Reputation')) + '</span><br>' + T(t.blurb) + '</li>';
    }).join('') + '</ul>';
    $('#rules').innerHTML =
      sec('A night', [T('You own no horse. Tonight you are a gambler: a night is a few races, and for each one you call the order all four horses will finish in, stake chips on it, and then run the race card by card. You start with {m}. What you hold when the night ends, minus any debt, is your score, and it earns Reputation Points.', { m: money(C.startCash) })]) +
      sec('Cards are time', [T('There is no clock. Time only moves when a card is drawn: the horse of that suit steps forward once, or twice on a face card (J, Q, K, A). The track is {t} steps long and the race is over when three horses have crossed the line; the fourth is placed by how far it got.', { t: C.track })]) +
      sec('The deck', [T('Every race has its own shuffled deck, and drawn cards are never put back. Each suit holds 8 to 11 plain cards and 1 or 2 face cards. The deck sheet on the call screen shows what is left, so you can read which horses the deck favors.')]) +
      sec('Calling the order', [T('Choose a horse for each place you want to back, and a chip size ({c}). The odds are the exact chance from the cards still in the deck, minus the book’s cut of about {cut}%, so safe picks pay little and long shots pay a lot.', { c: chips, cut: Math.round((1 - C.edge) * 100) }), T('Back all four places and get them all right and a <b>perfect order</b> bonus is paid on top: the longer the shot, the bigger it is. <b>Fill with the likeliest order</b> picks the most probable finish for you.')]) +
      sec('Locking and re-calls', [T('Lock your slip before the first card: the stakes are paid and the odds are fixed. You can still change a pick while the race runs, but every re-call costs {f}% of that slip’s stake and is priced at the odds of that moment. A place that is already decided cannot be changed.', { f: Math.round(C.recallFee * 100) })]) +
      sec('Tools', [T('Between cards you can spend cash on tools that bend the deck or the track. Every tool has a price, a limit per race and a Heat cost. More tools unlock in Reputation.'), tools]) +
      sec('Heat and the stewards', [T('Every trick adds Heat. It cools a little with every card drawn clean and between races. From {w} Heat each trick can bring a steward inspection: a fine, and the tool is taken away. At {c} Heat you are caught: that race’s slip is void and you are fined. Tools that only look add no Heat.', { w: C.warnHeat, c: C.heatMax })]) +
      sec('The backroom', [T('After every race you visit the backroom. Buy one <b>favor</b> from the offers (it lasts the whole night: cheaper tools, faster cooling, better odds and more), pay {p} to cool off by {a} Heat, or take a loan of {l} that you repay with {o} at the end of the night (two loans at most).', { p: money(C.coolPrice), a: C.coolAmt, l: money(C.loan), o: money(C.loanOwe) })]) +
      sec('Reputation', [T('When the night ends you earn Reputation Points: for your profit, for every place you called right, and a big bonus for each perfect order. Spend them in the Reputation tree on new tools, more chips, a bigger bankroll, cooler nerves and a sharper eye on the book. Nothing in it is lost between nights.')]) +
      sec('Walking out and coming back', [T('Between races, before you lock a slip, you can walk out and keep what you have. The night is saved after every move: close the page and press Continue night on the menu.')]);
  }
  buildRules();

  onEnter.menu();
  Sfx.music.mode('chill');
  window.__ui = { go: go, onEnter: onEnter, money: money, ord: ord, horseSVG: horseSVG, guideOnce: guideOnce };
})();
