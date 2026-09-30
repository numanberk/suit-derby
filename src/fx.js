/* Suit Derby win effects: the classic casino pop. Coins, confetti, sparks, shockwaves,
   a BIG WIN banner with a counting number, and a screen shake. All of it draws on one
   transparent canvas over the page and stops when there is nothing left to draw. */
const FX = (() => {
  const reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const cv = document.createElement('canvas');
  cv.id = 'fx'; cv.setAttribute('aria-hidden', 'true');
  cv.style.cssText = 'position:fixed;inset:0;width:100%;height:100%;pointer-events:none;z-index:60';
  document.body.appendChild(cv);
  const ctx = cv.getContext('2d');
  let W = 0, H = 0, dpr = 1, parts = [], running = false, last = 0;
  const COL = ['#f0525e', '#ff9a3d', '#3fc48a', '#8092ff', '#e9cf73', '#ece8da'];
  const rand = (a, b) => a + Math.random() * (b - a);

  function size() {
    dpr = Math.min(2, window.devicePixelRatio || 1);
    W = window.innerWidth; H = window.innerHeight;
    cv.width = Math.round(W * dpr); cv.height = Math.round(H * dpr);
  }
  window.addEventListener('resize', size); size();

  function start() { if (!running) { running = true; last = performance.now(); requestAnimationFrame(tick); } }
  function tick(now) {
    const dt = Math.min(0.05, (now - last) / 1000); last = now;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, W, H);
    for (let i = parts.length - 1; i >= 0; i--) {
      const p = parts[i];
      p.age += dt;
      if (p.age >= p.life || p.y > H + 40) { parts.splice(i, 1); continue; }
      p.vy += p.g * dt; p.x += p.vx * dt; p.y += p.vy * dt; p.rot += p.vr * dt;
      if (p.k === 'coin' && p.y > p.floor && p.vy > 0 && p.bounce > 0) { p.y = p.floor; p.vy *= -0.45; p.bounce--; p.vx *= 0.7; }
      const f = p.age / p.life, a = f > 0.75 ? 1 - (f - 0.75) / 0.25 : 1;
      ctx.globalAlpha = Math.max(0, a);
      if (p.k === 'coin') {
        const squash = Math.abs(Math.cos(p.rot * 2));
        ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(p.rot * 0.3);
        ctx.fillStyle = '#c99a1c'; ctx.beginPath(); ctx.ellipse(0, 0, p.s, p.s * (0.25 + 0.75 * squash), 0, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = '#ffd95a'; ctx.beginPath(); ctx.ellipse(0, -0.6, p.s * 0.82, p.s * (0.22 + 0.68 * squash), 0, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = 'rgba(255,255,255,.75)'; ctx.fillRect(-p.s * 0.3, -p.s * 0.35 * squash, p.s * 0.22, p.s * 0.5 * squash);
        ctx.restore();
      } else if (p.k === 'conf') {
        ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(p.rot); ctx.scale(1, Math.cos(p.rot * 1.7));
        ctx.fillStyle = p.c; ctx.fillRect(-p.s, -p.s * 0.5, p.s * 2, p.s); ctx.restore();
      } else if (p.k === 'spark') {
        ctx.fillStyle = p.c; ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(p.rot);
        ctx.fillRect(-p.s / 2, -p.s * 2, p.s, p.s * 4); ctx.fillRect(-p.s * 2, -p.s / 2, p.s * 4, p.s); ctx.restore();
      } else if (p.k === 'ring') {
        ctx.strokeStyle = p.c; ctx.lineWidth = 4 * (1 - f) + 1;
        ctx.beginPath(); ctx.arc(p.x, p.y, p.s + f * p.grow, 0, Math.PI * 2); ctx.stroke();
      }
    }
    ctx.globalAlpha = 1;
    if (parts.length) requestAnimationFrame(tick); else { running = false; ctx.clearRect(0, 0, W, H); }
  }
  const add = p => { parts.push(Object.assign({ age: 0, life: 1.2, vx: 0, vy: 0, g: 0, rot: 0, vr: 0, s: 4, c: '#fff', floor: 1e9, bounce: 0 }, p)); };

  function coins(x, y, n, o) {
    if (reduce) return;
    o = o || {};
    for (let i = 0; i < n; i++) {
      const a = rand(-Math.PI * 0.95, -Math.PI * 0.05), v = rand(220, 560) * (o.power || 1);
      add({ k: 'coin', x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, g: 1100, s: rand(6, 10), rot: rand(0, 6), vr: rand(-14, 14), life: rand(1.3, 2.1), floor: y + rand(90, 200), bounce: 2 });
    }
    start();
  }
  function confetti(x, y, n, o) {
    if (reduce) return;
    o = o || {};
    for (let i = 0; i < n; i++) {
      const a = o.rain ? Math.PI / 2 + rand(-0.4, 0.4) : rand(-Math.PI * 0.95, -Math.PI * 0.05), v = o.rain ? rand(40, 160) : rand(180, 620);
      add({ k: 'conf', x: o.rain ? rand(0, W) : x, y: o.rain ? rand(-60, -5) : y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, g: o.rain ? 220 : 620, s: rand(3, 6), rot: rand(0, 6), vr: rand(-9, 9), life: rand(1.6, 2.8), c: COL[Math.floor(Math.random() * COL.length)] });
    }
    start();
  }
  function sparks(x, y, n, color) {
    if (reduce) return;
    for (let i = 0; i < n; i++) {
      const a = rand(0, Math.PI * 2), v = rand(80, 320);
      add({ k: 'spark', x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, g: 300, s: rand(1.5, 3), rot: rand(0, 3), vr: rand(-6, 6), life: rand(0.5, 1), c: color || '#ffe07a' });
    }
    start();
  }
  function ring(x, y, color) {
    if (reduce) return;
    add({ k: 'ring', x, y, s: 10, grow: 150, life: 0.6, c: color || '#ffd95a' });
    add({ k: 'ring', x, y, s: 4, grow: 90, life: 0.45, c: '#fff' });
    start();
  }
  function shake(level) {
    if (reduce) return;
    const app = document.querySelector('.app');
    if (!app) return;
    app.classList.remove('shake1', 'shake2', 'shake3');
    void app.offsetWidth;
    app.classList.add('shake' + level);
    setTimeout(() => app.classList.remove('shake1', 'shake2', 'shake3'), 620);
  }
  function flash(color) {
    const f = document.getElementById('flashfx');
    if (!f || reduce) return;
    f.style.setProperty('--fc', color || '#ffe07a');
    f.classList.remove('on'); void f.offsetWidth; f.classList.add('on');
  }
  function countUp(el, to, dur, prefix, sign) {
    const fmt = v => (v < 0 ? '−' : sign && v > 0 ? '+' : '') + prefix + Math.abs(Math.round(v)).toLocaleString(I18n.locale());
    if (reduce) { el.textContent = fmt(to); return; }
    const t0 = performance.now();
    (function step(now) {
      const f = Math.min(1, (now - t0) / dur), e = 1 - Math.pow(1 - f, 3);
      el.textContent = fmt(to * e);
      if (f < 1) requestAnimationFrame(step);
    })(t0);
  }
  let bannerTimer = 0;
  function banner(title, amount, tier) {
    const b = document.getElementById('bigwin');
    if (!b) return;
    b.className = 'bigwin t-' + (tier || 'big');
    b.querySelector('.bw-t').textContent = title;
    const amt = b.querySelector('.bw-a');
    amt.textContent = '';
    b.hidden = false;
    void b.offsetWidth;
    b.classList.add('on');
    if (amount != null) countUp(amt, amount, tier === 'mega' || tier === 'jackpot' ? 1300 : 900, '$', true);
    clearTimeout(bannerTimer);
    bannerTimer = setTimeout(() => { b.classList.remove('on'); setTimeout(() => { b.hidden = true; }, 350); }, tier === 'mega' || tier === 'jackpot' ? 2600 : 1900);
  }

  /* one call for "you won this much": scales the show with the size of the win */
  function win(amount, x, y, title) {
    if (amount <= 0) return;
    if (x == null) { x = W / 2; y = H * 0.45; }
    const tier = amount >= 150 ? 'jackpot' : amount >= 90 ? 'mega' : amount >= 40 ? 'big' : 'nice';
    Sfx.win(tier);
    coins(x, y, tier === 'nice' ? 10 : tier === 'big' ? 26 : tier === 'mega' ? 44 : 70);
    sparks(x, y, tier === 'nice' ? 10 : 24);
    ring(x, y, tier === 'nice' ? '#ffe07a' : '#ffd95a');
    if (tier !== 'nice') { confetti(x, y, tier === 'big' ? 40 : 90); shake(tier === 'big' ? 1 : tier === 'mega' ? 2 : 3); flash(); }
    if (tier === 'jackpot') confetti(0, 0, 120, { rain: true });
    if (tier !== 'nice') banner(title || I18n.t(tier === 'big' ? 'BIG WIN' : tier === 'mega' ? 'MEGA WIN' : 'JACKPOT'), amount, tier);
    return tier;
  }
  return { coins, confetti, sparks, ring, shake, flash, banner, countUp, win, size };
})();
