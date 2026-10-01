/* Suit Derby race scene: a night stadium drawn on a canvas.
   A camera follows the pack, the crowd roars on every card, and the four lanes are in
   perspective (your lane is the big one at the front). Pure drawing: it reads the engine state
   and never changes it. */
const Scene = (() => {
  const INK = '#ece8da', DARK = '#0d110c';
  const P = typeof Path2D !== 'undefined' ? {
    tail: new Path2D('M28 36 C14 32 4 44 8 66 C14 54 20 48 32 46Z'),
    body: new Path2D('M34 30 H80 Q90 30 90 42 Q90 56 78 56 H38 Q26 56 26 44 Q26 30 34 30Z'),
    neck: new Path2D('M74 36 L86 8 L98 12 L94 48 L80 48Z'),
    ear: new Path2D('M88 9 L91 0 L96 10Z'),
    mane: new Path2D('M86 8 C80 20 78 30 76 40'),
    jock: new Path2D('M52 31 L59 17 L67 19 L66 32Z'),
    arm: new Path2D('M65 21 L77 29'),
    legBF: new Path2D('M36 52 L30 70 L33 82'), legFF: new Path2D('M76 52 L82 68 L79 82'),
    legBN: new Path2D('M44 52 L38 70 L41 82'), legFN: new Path2D('M84 52 L90 68 L87 82')
  } : null;
  const LEGS = [['legBF', 36, 52, 0.75, true], ['legFF', 76, 52, 0, true], ['legBN', 44, 52, 0.5, false], ['legFN', 84, 52, 0.25, false]];
  const CROWD = ['#f0525e', '#ff9a3d', '#3fc48a', '#8092ff', '#ece8da', '#e9cf73'];
  /* track themes (a palette each) and coats for your own horse; picked at the setup screen */
  const THEMES = {
    stadium: { sky: ['#04060c', '#0d1322', '#1a2034'], stars: 1, flood: true, stand: ['#10141f', '#1b2233'], fog: '10,14,22', lane: ['33271b', '3a2c1f'], grain: 'rgba(255,230,190,.045)', line: 'rgba(255,255,255,.14)' },
    dusk: { sky: ['#2b1038', '#a8454a', '#f2a65a'], stars: 0.15, flood: false, sun: { x: 0.7, y: 0.9, r: 0.2, c: 'rgba(255,214,140,.9)' }, stand: ['#2a1a2a', '#4a2c38'], fog: '60,30,40', lane: ['4a3320', '56392a'], grain: 'rgba(255,200,150,.07)', line: 'rgba(255,230,200,.22)' },
    turf: { sky: ['#5c9fd8', '#8fc2ea', '#cfe8f7'], stars: 0, flood: false, sun: { x: 0.2, y: 0.35, r: 0.08, c: 'rgba(255,248,210,.95)' }, stand: ['#37507a', '#5b79a8'], fog: '120,170,200', lane: ['2f6b3a', '37783f'], grain: 'rgba(210,255,200,.07)', line: 'rgba(255,255,255,.3)' },
    snow: { sky: ['#9fb3c8', '#c9d6e3', '#eef3f8'], stars: 0, flood: false, stand: ['#6d7f93', '#a6b5c5'], fog: '200,214,228', lane: ['b7c4d1', 'c4d0db'], grain: 'rgba(255,255,255,.35)', line: 'rgba(70,90,110,.35)' },
    neon: { sky: ['#12002b', '#3b0a5e', '#c2287f'], stars: 0.9, flood: false, sun: { x: 0.5, y: 0.95, r: 0.22, c: 'rgba(255,90,170,.85)' }, stand: ['#16062e', '#2d0d56'], fog: '40,10,70', lane: ['1a1030', '221540'], grain: 'rgba(80,240,255,.09)', line: 'rgba(80,240,255,.55)' }
  };
  const SKINS = {
    gold: { coat: '#e2bb52', mane: '#fff1b0', glow: '#ffd75e' },
    midnight: { coat: '#1f2a52', mane: '#8fa4ff', glow: null },
    neon: { coat: '#2a1148', mane: '#5ef0ff', glow: '#5ef0ff', legs: '#ff4fd8' },
    ghost: { coat: '#dfe8f2', mane: '#9fb2c8', glow: '#bcd6ff', alpha: 0.72 },
    candy: { coat: '#ff9ec7', mane: '#ffffff', legs: '#8fe8c8', glow: null }
  };

  function shade(hex, f) {
    const n = parseInt(hex.slice(1), 16);
    const r = Math.round(((n >> 16) & 255) * f), g = Math.round(((n >> 8) & 255) * f), b = Math.round((n & 255) * f);
    return 'rgb(' + r + ',' + g + ',' + b + ')';
  }
  const ord = n => (I18n.lang === 'tr' ? n + '.' : n + (['th', 'st', 'nd', 'rd'][(n % 100 > 10 && n % 100 < 14) ? 0 : (n % 10 < 4 ? n % 10 : 0)]));
  const rand = (a, b) => a + Math.random() * (b - a);

  function create(canvas, cfg) {
    const ctx = canvas.getContext('2d');
    const css = getComputedStyle(document.documentElement);
    const col = ['--hearts', '--diamonds', '--clubs', '--spades'].map((v, i) => (css.getPropertyValue(v).trim() || ['#f0525e', '#ff9a3d', '#3fc48a', '#8092ff'][i]));
    const glyph = cfg.glyphs, lapLen = cfg.lapLen;
    const sc = {
      W: 600, H: 300, dpr: 1, cam: -6, ppu: 8, t: 0, crowd: 0.3, flash: 0, photo: 0, photoV: 0, flashCol: '#fff',
      phase: [0, 0, 0, 0], lines: [0, 0, 0, 0], aura: [0, 0, 0, 0], tilt: [0, 0, 0, 0],
      parts: [], texts: [], rows: [0, 1, 2, 3], me: 0, stars: [], hzPulse: 0, theme: 'stadium', skin: 'classic'
    };
    sc.setStyle = (skin, theme) => { sc.skin = SKINS[skin] ? skin : 'classic'; sc.theme = THEMES[theme] ? theme : 'stadium'; };
    for (let i = 0; i < 70; i++) sc.stars.push({ x: Math.random(), y: Math.random() * 0.3, s: Math.random() * 1.4 + 0.3, p: Math.random() * 6 });

    function resize() {
      const r = canvas.getBoundingClientRect();
      sc.dpr = Math.min(2, window.devicePixelRatio || 1);
      sc.W = Math.max(280, r.width); sc.H = Math.max(200, r.height);
      canvas.width = Math.round(sc.W * sc.dpr); canvas.height = Math.round(sc.H * sc.dpr);
    }
    window.addEventListener('resize', resize);

    // row 0 is the far lane, row 3 the near lane; your horse always runs in the near lane
    function setMe(me) {
      sc.me = me;
      const others = [0, 1, 2, 3].filter(i => i !== me);
      sc.rows = [];
      others.forEach((h, r) => { sc.rows[h] = r; });
      sc.rows[me] = 3;
    }
    function geom() {
      const yT = sc.H * 0.33, yB = sc.H * 0.965, tot = yB - yT, w = [0.21, 0.24, 0.27, 0.28];
      const g = []; let y = yT;
      for (let r = 0; r < 4; r++) { const h = tot * w[r]; g.push({ top: y, h, base: y + h * 0.88, k: h * 0.96 / 82 }); y += h; }
      return g;
    }
    function reset() {
      sc.ppu = 15; sc.cam = -120 / sc.ppu; sc.parts = []; sc.texts = []; sc.phase = [0, 0, 0, 0]; sc.lines = [0, 0, 0, 0]; sc.aura = [0, 0, 0, 0]; sc.tilt = [0, 0, 0, 0]; sc.flash = 0; sc.photo = 0; sc.photoV = 0;
    }

    /* ---------- events from the game ---------- */
    sc.cheer = amt => { sc.crowd = Math.min(1.4, sc.crowd + amt); };
    sc.surge = i => { sc.aura[i] = 1; sc.lines[i] = Math.max(sc.lines[i], 0.45); };
    sc.spur = i => { sc.aura[i] = 1.4; sc.lines[i] = 0.9; sc.cheer(0.12); sc.ring(i, col[i]); };
    sc.stumble = i => { sc.tilt[i] = 1; sc.say(i, I18n.t('OOPS'), '#f07272'); };
    sc.say = (i, text, color, big) => { sc.texts.push({ i, text, color: color || '#e9cf73', life: 1.3, age: 0, big: !!big }); };
    sc.ring = (i, color) => { sc.parts.push({ k: 'ring', i, color, life: 0.6, age: 0 }); };
    sc.spark = (i, color, n) => {
      for (let k = 0; k < (n || 14); k++) sc.parts.push({ k: 'spark', i, color, vx: rand(-70, 70), vy: rand(-110, -20), life: rand(0.5, 0.9), age: 0, s: rand(1.5, 3.2) });
    };
    sc.finishFlash = () => { sc.flash = 1; sc.flashCol = '#ffffff'; sc.cheer(0.5); };

    /* ---------- update ---------- */
    function update(dt, run, st) {
      sc.t += dt;
      sc.crowd = Math.max(0.22, sc.crowd - dt * 0.35);
      sc.flash = Math.max(0, sc.flash - dt * 2.4);
      sc.photoV += (sc.photo - sc.photoV) * Math.min(1, dt * 5);
      sc.hzPulse += dt * 7;
      if (run && run.lap) {
        const hs = run.horses;
        let lead = -1e9, last = 1e9;
        hs.forEach(h => { lead = Math.max(lead, h.pos); last = Math.min(last, h.pos); });
        // frame the pack: the last horse stays right of the bibs, the leader stays inside the right edge
        const L0 = 62, R0 = sc.W - 54, D = R0 - L0, span = Math.max(lead - last, 8);
        const wantPpu = Math.max(1.8, Math.min(15, D * 0.85 / span));
        sc.ppu += (wantPpu - sc.ppu) * Math.min(1, dt * 2.5);
        const camA = last - 120 / sc.ppu, camB = lead - (R0 - 0.1 * D) / sc.ppu;
        const hi = lapLen - (sc.W - 70) / sc.ppu;
        const want = Math.min(hi, Math.max(camA, camB));
        sc.cam += (want - sc.cam) * Math.min(1, dt * 3.2);
        hs.forEach(h => {
          const i = h.i, sp = h.base + h.tb + h.ex;
          if (!st.paused && (st.racing || h.fin)) {
            const rate = h.fin ? 1.1 : (h.slowT > 0 ? 1.2 : 2.0 + Math.max(0, sp) * 0.75);
            sc.phase[i] = (sc.phase[i] + dt * rate) % 1;
            // dust kicked up by the hooves
            if (!h.fin && Math.random() < dt * (8 + sp * 3)) sc.parts.push({ k: 'dust', i, wx: h.pos - 1.2, vy: rand(-18, -4), life: rand(0.4, 0.8), age: 0, s: rand(2, 4.5) });
          }
          sc.aura[i] = Math.max(0, sc.aura[i] - dt * 1.6);
          sc.lines[i] = Math.max(0, sc.lines[i] - dt * 1.3);
          sc.tilt[i] = Math.max(0, sc.tilt[i] - dt * 0.55);
        });
      }
      for (let k = sc.parts.length - 1; k >= 0; k--) { const p = sc.parts[k]; p.age += dt; if (p.age >= p.life) sc.parts.splice(k, 1); }
      for (let k = sc.texts.length - 1; k >= 0; k--) { const p = sc.texts[k]; p.age += dt; if (p.age >= p.life) sc.texts.splice(k, 1); }
    }

    /* ---------- drawing ---------- */
    function drawHorse(x, y, k, i, phase, o) {
      const sk = i === sc.me ? SKINS[sc.skin] : null;
      const c = sk ? sk.coat : col[i], far = shade(sk && sk.legs ? sk.legs : c, 0.55), legC = sk && sk.legs ? sk.legs : c;
      ctx.save();
      if (sk && sk.alpha) ctx.globalAlpha = sk.alpha;
      if (sk && sk.glow) { ctx.shadowColor = sk.glow; ctx.shadowBlur = 16; }
      ctx.translate(x - 58 * k, y - 82 * k + (o.bob || 0) * k);
      if (o.tilt) { ctx.translate(58 * k, 82 * k); ctx.rotate(-o.tilt * 0.22); ctx.translate(-58 * k, -82 * k); }
      ctx.scale(k, k);
      ctx.lineCap = 'round'; ctx.lineJoin = 'round';
      ctx.fillStyle = c; ctx.fill(P.tail);
      ctx.lineWidth = 6;
      const leg = L => {
        const a = Math.sin((phase + L[3]) * Math.PI * 2) * 0.49;
        ctx.save(); ctx.translate(L[1], L[2]); ctx.rotate(a); ctx.translate(-L[1], -L[2]);
        ctx.strokeStyle = L[4] ? far : legC; ctx.stroke(P[L[0]]); ctx.restore();
      };
      leg(LEGS[0]); leg(LEGS[1]);
      ctx.fillStyle = c; ctx.fill(P.body); ctx.fill(P.neck);
      ctx.save(); ctx.translate(104, 22); ctx.rotate(0.66); ctx.beginPath(); ctx.ellipse(0, 0, 13, 6.5, 0, 0, Math.PI * 2); ctx.fill(); ctx.restore();
      ctx.fill(P.ear);
      ctx.fillStyle = DARK; ctx.beginPath(); ctx.arc(101, 17, 1.7, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = sk ? sk.mane : 'rgba(13,17,12,.35)'; ctx.lineWidth = 4; ctx.stroke(P.mane);
      ctx.lineWidth = 6;
      leg(LEGS[2]); leg(LEGS[3]);
      ctx.shadowBlur = 0;
      ctx.fillStyle = sk ? col[i] : INK;
      ctx.beginPath(); ctx.roundRect ? ctx.roundRect(50, 31, 20, 17, 3) : ctx.rect(50, 31, 20, 17); ctx.fill();
      ctx.fillStyle = DARK; ctx.font = '700 14px Hanken Grotesk, system-ui, sans-serif'; ctx.textAlign = 'center';
      ctx.fillText(glyph[i], 60, 44.5);
      ctx.fillStyle = INK; ctx.fill(P.jock);
      ctx.strokeStyle = INK; ctx.lineWidth = 3; ctx.stroke(P.arm);
      ctx.fillStyle = c; ctx.beginPath(); ctx.arc(62, 12, 5.5, 0, Math.PI * 2); ctx.fill();
      ctx.restore();
    }

    function drawSky(W, H, yT) {
      const TH = THEMES[sc.theme];
      const g = ctx.createLinearGradient(0, 0, 0, yT);
      g.addColorStop(0, TH.sky[0]); g.addColorStop(0.65, TH.sky[1]); g.addColorStop(1, TH.sky[2]);
      ctx.fillStyle = g; ctx.fillRect(0, 0, W, yT);
      if (TH.sun) {
        const sx0 = W * TH.sun.x, sy0 = yT * TH.sun.y, sr = Math.min(W, yT * 2) * TH.sun.r;
        ctx.fillStyle = TH.sun.c; ctx.beginPath(); ctx.arc(sx0, sy0, sr, 0, Math.PI * 2); ctx.fill();
        if (sc.theme === 'neon') { ctx.fillStyle = TH.sky[1]; for (let k = 1; k < 5; k++) ctx.fillRect(sx0 - sr, sy0 + k * sr * 0.2 - sr * 0.1, sr * 2, k * 1.4); }
      }
      if (TH.stars) sc.stars.forEach(s => {
        ctx.globalAlpha = TH.stars * (0.35 + 0.35 * Math.sin(sc.t * 1.3 + s.p));
        ctx.fillStyle = '#fff'; ctx.fillRect(s.x * W, s.y * H, s.s, s.s);
      });
      ctx.globalAlpha = 1;
      // floodlight cones
      if (TH.flood) [[0.12, 1], [0.88, -1]].forEach(f => {
        const x = f[0] * W, gr = ctx.createLinearGradient(x, 0, x + f[1] * W * 0.22, yT);
        gr.addColorStop(0, 'rgba(255,244,200,0.30)'); gr.addColorStop(1, 'rgba(255,244,200,0)');
        ctx.fillStyle = gr; ctx.beginPath(); ctx.moveTo(x - 6, 0); ctx.lineTo(x + 6, 0); ctx.lineTo(x + f[1] * W * 0.36, yT); ctx.lineTo(x - f[1] * W * 0.05, yT); ctx.closePath(); ctx.fill();
        ctx.fillStyle = '#fff6d0'; ctx.fillRect(x - 9, 0, 18, 4);
      });
    }
    function drawStand(W, H, yT) {
      const top = yT - H * 0.23;
      const TH = THEMES[sc.theme];
      ctx.fillStyle = TH.stand[0]; ctx.fillRect(0, top, W, yT - top);
      ctx.fillStyle = TH.stand[1]; ctx.fillRect(0, top, W, 3);
      const off = sc.cam * sc.ppu * 0.22, step = 11, rows = 5, rh = (yT - top - 8) / rows;
      const cols = Math.ceil(W / step) + 2;
      for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cols; c++) {
          const wi = Math.floor((c * step + off) / step);
          const seed = (wi * 7919 + r * 104729) % 1000;
          const x = c * step - (off % step), bob = Math.max(0, Math.sin(sc.t * (5 + seed % 5) + seed)) * sc.crowd * 5;
          ctx.fillStyle = CROWD[seed % CROWD.length];
          ctx.globalAlpha = 0.45 + 0.4 * ((seed % 7) / 7) + Math.min(0.15, sc.crowd * 0.1);
          ctx.fillRect(x, top + 6 + r * rh + rh * 0.35 - bob, 5, 5 + (seed % 3));
        }
      }
      ctx.globalAlpha = 1;
      // pennants
      for (let c = 0; c < cols; c += 5) {
        const wi = Math.floor((c * step + off) / step), x = c * step - (off % step);
        ctx.fillStyle = col[((wi % 4) + 4) % 4]; ctx.globalAlpha = 0.85;
        ctx.beginPath(); ctx.moveTo(x, top + 3); ctx.lineTo(x + 12, top + 9); ctx.lineTo(x, top + 15); ctx.closePath(); ctx.fill();
      }
      ctx.globalAlpha = 1;
      const fog = ctx.createLinearGradient(0, yT - 18, 0, yT);
      fog.addColorStop(0, 'rgba(' + TH.fog + ',0)'); fog.addColorStop(1, 'rgba(' + TH.fog + ',.8)');
      ctx.fillStyle = fog; ctx.fillRect(0, yT - 18, W, 18);
    }

    function draw(run, st) {
      const W = sc.W, H = sc.H, ppu = sc.ppu, cam = sc.cam, g = geom();
      ctx.setTransform(sc.dpr, 0, 0, sc.dpr, 0, 0);
      ctx.clearRect(0, 0, W, H);
      const yT = g[0].top, yB = g[3].top + g[3].h;
      drawSky(W, H, yT);
      drawStand(W, H, yT);
      const sx = pos => (pos - cam) * ppu;

      // track lanes
      for (let r = 0; r < 4; r++) {
        const L = g[r], gr = ctx.createLinearGradient(0, L.top, 0, L.top + L.h);
        const TH = THEMES[sc.theme], lc = TH.lane[r % 2];
        const a = '#' + lc;
        gr.addColorStop(0, shade('#' + lc, 0.85 + r * 0.06)); gr.addColorStop(1, a);
        ctx.fillStyle = gr; ctx.fillRect(0, L.top, W, L.h);
        // scrolling dirt grain
        ctx.fillStyle = TH.grain;
        const gs = 34 + r * 6, go = (cam * ppu * (0.9 + r * 0.05)) % gs;
        for (let x = -go; x < W; x += gs) ctx.fillRect(x, L.top + L.h * (0.25 + (Math.floor((x + go) / gs) % 3) * 0.22), 14 + r * 3, 2);
        ctx.fillStyle = TH.line; ctx.fillRect(0, L.top, W, sc.theme === 'neon' ? 2 : 1);
      }
      // furlong posts
      ctx.fillStyle = 'rgba(255,255,255,.12)';
      for (let d = 0; d <= lapLen; d += 10) { const x = sx(d); if (x > -4 && x < W + 4) { ctx.fillRect(x, yT, 2, yB - yT); } }
      ctx.font = '600 9px JetBrains Mono, monospace'; ctx.textAlign = 'center'; ctx.fillStyle = 'rgba(255,255,255,.35)';
      for (let d = 10; d < lapLen; d += 10) { const x = sx(d); if (x > 10 && x < W - 10) ctx.fillText(String(Math.round(d / lapLen * 100)) + '%', x, yT + 10); }
      // start line
      const s0 = sx(0);
      if (s0 > -20 && s0 < W + 20) { ctx.fillStyle = '#ece8da'; ctx.fillRect(s0 - 2, yT, 4, yB - yT); ctx.fillStyle = 'rgba(255,255,255,.6)'; ctx.font = '700 10px JetBrains Mono, monospace'; ctx.fillText(I18n.t('START'), s0 + 26, yT + 22); }
      // finish
      const sf = sx(lapLen);
      if (sf > -40 && sf < W + 40) {
        const cs = 9;
        for (let y = yT, n = 0; y < yB; y += cs, n++) for (let c = 0; c < 2; c++) { ctx.fillStyle = (n + c) % 2 ? '#ece8da' : '#131810'; ctx.fillRect(sf + c * cs, y, cs, Math.min(cs, yB - y)); }
        ctx.fillStyle = '#e9cf73'; ctx.fillRect(sf - 3, yT - 26, 4, 26); ctx.fillRect(sf + 2 * cs - 1, yT - 26, 4, 26);
        ctx.fillRect(sf - 3, yT - 30, 2 * cs + 8, 7);
        ctx.fillStyle = DARK; ctx.font = '800 8px JetBrains Mono, monospace'; ctx.fillText(I18n.t('FINISH'), sf + cs, yT - 24);
        ctx.fillStyle = 'rgba(233,207,115,.12)'; ctx.fillRect(sf + 2 * cs, yT, 80, yB - yT);
      }

      // hazards first (under the horses)
      if (run && run.lap && run.lap.hz) {
        const hzs = run.lap.hz;
        for (let i = 0; i < 4; i++) {
          const r = sc.rows[i], L = g[r];
          hzs[i].forEach(z => {
            const x = sx(z.x);
            if (x < -60 || x > W + 60) return;
            const mine = i === sc.me, open = z.state === 'open', done = z.state !== 'ahead' && !open;
            const k = L.k, y = L.base;
            ctx.save();
            ctx.globalAlpha = done ? (z.state === 'stumble' ? 0.55 : 0.4) : 1;
            if (open) {
              const p = 0.5 + 0.5 * Math.sin(sc.hzPulse);
              const gl = ctx.createRadialGradient(x, y - 14 * k, 2, x, y - 14 * k, 70 * k);
              gl.addColorStop(0, 'rgba(255,90,70,' + (0.55 + 0.25 * p) + ')'); gl.addColorStop(1, 'rgba(255,90,70,0)');
              ctx.fillStyle = gl; ctx.fillRect(x - 80 * k, y - 90 * k, 160 * k, 100 * k);
            }
            if (z.type === 'hurdle') {
              ctx.fillStyle = '#d8d2c0'; ctx.fillRect(x - 15 * k, y - 26 * k, 4 * k, 26 * k); ctx.fillRect(x + 11 * k, y - 26 * k, 4 * k, 26 * k);
              for (let s = 0; s < 6; s++) { ctx.fillStyle = s % 2 ? '#fff' : (mine ? '#ff5a46' : '#e38b2c'); ctx.fillRect(x - 15 * k + s * 5 * k, y - 26 * k, 5 * k, 6 * k); }
            } else if (z.type === 'trap') {
              // a bear-trap: jagged teeth on a dark plate, with a pulsing warning mark
              ctx.fillStyle = '#2a1c1c'; ctx.beginPath(); ctx.ellipse(x, y - 2 * k, 24 * k, 6 * k, 0, 0, Math.PI * 2); ctx.fill();
              ctx.fillStyle = '#e8ded0';
              for (let s = 0; s < 6; s++) { const tx = x - 20 * k + s * 8 * k; ctx.beginPath(); ctx.moveTo(tx, y - 3 * k); ctx.lineTo(tx + 4 * k, y - 17 * k); ctx.lineTo(tx + 8 * k, y - 3 * k); ctx.fill(); }
              ctx.strokeStyle = '#c0453a'; ctx.lineWidth = 2 * k; ctx.beginPath(); ctx.ellipse(x, y - 2 * k, 24 * k, 6 * k, 0, 0, Math.PI * 2); ctx.stroke();
              if (z.state === 'ahead') {
                ctx.globalAlpha = 0.6 + 0.4 * Math.sin(sc.t * 6); ctx.fillStyle = '#ff6a55'; ctx.font = '800 ' + Math.max(10, 13 * k * 1.6) + 'px Big Shoulders Display, Impact, sans-serif';
                ctx.textAlign = 'center'; ctx.fillText('⚠', x, y - 24 * k);
              }
            } else {
              const w = ctx.createLinearGradient(x - 24 * k, 0, x + 24 * k, 0);
              w.addColorStop(0, 'rgba(90,170,230,.2)'); w.addColorStop(0.5, 'rgba(140,210,255,.85)'); w.addColorStop(1, 'rgba(90,170,230,.2)');
              ctx.fillStyle = w; ctx.beginPath(); ctx.ellipse(x, y - 2 * k, 26 * k, 7 * k, 0, 0, Math.PI * 2); ctx.fill();
              ctx.strokeStyle = 'rgba(255,255,255,.55)'; ctx.lineWidth = 1; ctx.beginPath(); ctx.ellipse(x + Math.sin(sc.t * 3) * 4 * k, y - 2 * k, 10 * k, 2.5 * k, 0, 0, Math.PI * 2); ctx.stroke();
            }
            if (mine && z.state === 'ahead' && !done) {
              ctx.globalAlpha = 0.55; ctx.fillStyle = '#ffd36b'; ctx.font = '800 ' + Math.max(9, 11 * k * 1.6) + 'px Big Shoulders Display, Impact, sans-serif';
              ctx.textAlign = 'center'; ctx.fillText('!', x, y - 34 * k);
            }
            ctx.restore();
          });
        }
      }

      // lanes back to front: horses, effects, bibs
      for (let r = 0; r < 4; r++) {
        const i = sc.rows.indexOf(r), L = g[r];
        if (i < 0) continue;
        const h = run && run.horses ? run.horses[i] : null;
        const pos = h ? h.pos : 0, x = sx(pos) + 0;
        // lane edge glow for your lane
        if (i === sc.me) {
          ctx.fillStyle = col[i]; ctx.globalAlpha = 0.09; ctx.fillRect(0, L.top, W, L.h); ctx.globalAlpha = 1;
          ctx.fillStyle = col[i]; ctx.fillRect(0, L.top + L.h - 2, W, 2);
        }
        // dust
        sc.parts.forEach(p => {
          if (p.i !== i) return;
          const f = p.age / p.life;
          if (p.k === 'dust') {
            ctx.globalAlpha = (1 - f) * 0.4; ctx.fillStyle = '#c9b48f';
            ctx.beginPath(); ctx.arc(sx(p.wx) - f * 16, L.base - 2 + p.vy * f, p.s * L.k * 1.8 * (1 + f), 0, Math.PI * 2); ctx.fill();
          }
        });
        ctx.globalAlpha = 1;
        // surge aura + speed lines
        if (sc.aura[i] > 0) {
          const a = Math.min(1, sc.aura[i]);
          const gr = ctx.createRadialGradient(x, L.base - 34 * L.k, 4, x, L.base - 34 * L.k, 90 * L.k);
          gr.addColorStop(0, col[i]); gr.addColorStop(1, 'rgba(0,0,0,0)');
          ctx.globalAlpha = 0.5 * a; ctx.fillStyle = gr; ctx.fillRect(x - 100 * L.k, L.base - 130 * L.k, 200 * L.k, 140 * L.k); ctx.globalAlpha = 1;
        }
        if (sc.lines[i] > 0) {
          ctx.strokeStyle = '#fff'; ctx.lineWidth = 1.5; ctx.globalAlpha = Math.min(0.7, sc.lines[i]);
          for (let n = 0; n < 7; n++) {
            const yy = L.base - ((n * 37 + Math.floor(sc.t * 12) * 13) % 70) * L.k * 0.9 - 6 * L.k, len = (40 + ((n * 53) % 50)) * L.k * 1.4;
            ctx.beginPath(); ctx.moveTo(x - 30 * L.k - len, yy); ctx.lineTo(x - 30 * L.k, yy); ctx.stroke();
          }
          ctx.globalAlpha = 1;
        }
        // shadow + horse
        ctx.fillStyle = 'rgba(0,0,0,.35)'; ctx.beginPath(); ctx.ellipse(x, L.base + 1, 46 * L.k, 4.5 * L.k, 0, 0, Math.PI * 2); ctx.fill();
        const fin = h && h.fin;
        const bob = Math.abs(Math.sin(sc.phase[i] * Math.PI * 2)) * -3.2;
        drawHorse(x, L.base, L.k, i, sc.phase[i], { bob: fin ? 0 : bob, tilt: sc.tilt[i] });
        // stumble stars
        if (sc.tilt[i] > 0.3) {
          ctx.fillStyle = '#ffd36b'; ctx.font = '700 ' + 14 * L.k + 'px Hanken Grotesk, sans-serif'; ctx.textAlign = 'center';
          for (let n = 0; n < 3; n++) ctx.fillText('✦', x + 22 * L.k + Math.cos(sc.t * 6 + n * 2.1) * 20 * L.k, L.base - 80 * L.k + Math.sin(sc.t * 6 + n * 2.1) * 6 * L.k);
        }
        // particles in front (sparks, rings)
        sc.parts.forEach(p => {
          if (p.i !== i) return;
          const f = p.age / p.life;
          if (p.k === 'spark') {
            ctx.globalAlpha = 1 - f; ctx.fillStyle = p.color;
            ctx.fillRect(x + 20 * L.k + p.vx * p.age, L.base - 40 * L.k + p.vy * p.age + 140 * p.age * p.age, p.s, p.s);
          } else if (p.k === 'ring') {
            ctx.globalAlpha = (1 - f) * 0.9; ctx.strokeStyle = p.color; ctx.lineWidth = 3;
            ctx.beginPath(); ctx.ellipse(x, L.base - 34 * L.k, (20 + f * 90) * L.k, (12 + f * 55) * L.k, 0, 0, Math.PI * 2); ctx.stroke();
          }
        });
        ctx.globalAlpha = 1;
        // floating labels
        sc.texts.forEach(t => {
          if (t.i !== i) return;
          const f = t.age / t.life;
          ctx.globalAlpha = f < 0.12 ? f / 0.12 : 1 - Math.max(0, (f - 0.6) / 0.4);
          ctx.fillStyle = t.color; ctx.textAlign = 'center';
          ctx.font = '900 ' + (t.big ? 26 : 18) + 'px Big Shoulders Display, Impact, sans-serif';
          ctx.strokeStyle = 'rgba(0,0,0,.75)'; ctx.lineWidth = 4; ctx.lineJoin = 'round';
          const ty = L.base - 88 * L.k - f * 26;
          ctx.strokeText(t.text, x + 20 * L.k, ty); ctx.fillText(t.text, x + 20 * L.k, ty);
        });
        ctx.globalAlpha = 1;
      }

      // bibs: suit, rank, stamina for every horse
      const order = run && run.lap ? cfg.lapOrder(run) : [0, 1, 2, 3];
      for (let r = 0; r < 4; r++) {
        const i = sc.rows.indexOf(r), L = g[r], h = run && run.horses ? run.horses[i] : null;
        const bw = 50, bh = Math.min(L.h - 4, 40), bx = 4, by = L.top + (L.h - bh) / 2;
        ctx.fillStyle = 'rgba(8,11,8,.82)'; ctx.beginPath(); ctx.roundRect ? ctx.roundRect(bx, by, bw, bh, 8) : ctx.rect(bx, by, bw, bh); ctx.fill();
        ctx.strokeStyle = i === sc.me ? col[i] : 'rgba(255,255,255,.14)'; ctx.lineWidth = i === sc.me ? 2 : 1; ctx.stroke();
        ctx.fillStyle = col[i]; ctx.font = '700 ' + Math.min(22, bh * 0.52) + 'px Hanken Grotesk, sans-serif'; ctx.textAlign = 'left';
        ctx.fillText(glyph[i], bx + 6, by + bh * 0.54);
        if (h && run.lap.t > 0) {
          ctx.fillStyle = INK; ctx.font = '700 11px JetBrains Mono, monospace'; ctx.textAlign = 'right';
          ctx.fillText(ord(order.indexOf(i) + 1), bx + bw - 5, by + bh * 0.5);
          // stamina pill
          const sw = bw - 12, sy = by + bh - 9, f = Math.max(0, Math.min(1, h.sta / 100));
          ctx.fillStyle = 'rgba(255,255,255,.14)'; ctx.fillRect(bx + 6, sy, sw, 4);
          ctx.fillStyle = f >= 0.98 ? '#fff' : f > 0.6 ? '#e9cf73' : '#9ba593'; ctx.fillRect(bx + 6, sy, sw * f, 4);
          if (f >= 0.98 && Math.sin(sc.t * 9) > 0) { ctx.fillStyle = 'rgba(255,255,255,.8)'; ctx.fillRect(bx + 6, sy - 1, sw, 6); }
        }
      }
      if (run && run.lap && sc.me >= 0) {
        const L = g[3];
        ctx.fillStyle = col[sc.me]; ctx.font = '800 9px JetBrains Mono, monospace'; ctx.textAlign = 'left';
        ctx.fillText(I18n.t('YOU'), 58, L.top + 11);
      }

      // foreground rail with fast-moving posts (sells the speed)
      ctx.fillStyle = 'rgba(0,0,0,.55)'; ctx.fillRect(0, yB - 5, W, 5);
      const ps = 120, po = (cam * ppu * 1.6) % ps;
      for (let x = -po; x < W; x += ps) { ctx.fillStyle = 'rgba(0,0,0,.6)'; ctx.fillRect(x, yB - 18, 7, 18); ctx.fillStyle = 'rgba(255,255,255,.2)'; ctx.fillRect(x, yB - 18, 2, 18); }
      // vignette
      const vg = ctx.createRadialGradient(W / 2, H * 0.6, H * 0.35, W / 2, H * 0.6, W * 0.75);
      vg.addColorStop(0, 'rgba(0,0,0,0)'); vg.addColorStop(1, 'rgba(0,0,0,.5)');
      ctx.fillStyle = vg; ctx.fillRect(0, 0, W, H);
      if (sc.photoV > 0.01) {
        // photo finish: cinema bars, a tighter vignette and a pulsing label
        const pv = sc.photoV, bh = H * 0.085 * pv;
        const pg = ctx.createRadialGradient(W / 2, H * 0.55, H * 0.2, W / 2, H * 0.55, W * 0.6);
        pg.addColorStop(0, 'rgba(0,0,0,0)'); pg.addColorStop(1, 'rgba(0,0,0,' + (0.55 * pv) + ')');
        ctx.fillStyle = pg; ctx.fillRect(0, 0, W, H);
        ctx.fillStyle = '#000'; ctx.fillRect(0, 0, W, bh); ctx.fillRect(0, H - bh, W, bh);
        ctx.globalAlpha = pv * (0.65 + 0.35 * Math.sin(sc.t * 9)); ctx.fillStyle = '#e9cf73'; ctx.font = '800 ' + Math.max(10, Math.min(14, bh * 0.6)) + 'px JetBrains Mono, monospace'; ctx.textAlign = 'center';
        ctx.fillText(I18n.t('PHOTO FINISH'), W / 2, bh * 0.68); ctx.globalAlpha = 1;
      }
      if (sc.flash > 0) { ctx.globalAlpha = sc.flash * 0.6; ctx.fillStyle = sc.flashCol; ctx.fillRect(0, 0, W, H); ctx.globalAlpha = 1; }
    }

    /* screen position of a horse's centre in page coordinates, for effects that live outside the canvas */
    function anchor(i, run) {
      const g = geom(), L = g[sc.rows[i]], r = canvas.getBoundingClientRect();
      const h = run && run.horses ? run.horses[i] : null;
      return { x: r.left + (h ? (h.pos - sc.cam) * sc.ppu : 60), y: r.top + L.base - 40 * L.k };
    }
    resize(); setMe(0);
    return Object.assign(sc, { resize, reset, setMe, update, draw, anchor });
  }
  return { create, THEMES, SKINS };
})();
