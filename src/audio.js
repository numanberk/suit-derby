/* Suit Derby sound. Everything is synthesized with WebAudio (no files to load).
   Design rules that make it feel good:
   - every card is a soft mallet note on a pentatonic scale, so the race plays a little tune;
   - a hit streak climbs the scale, so winning streaks literally rise in pitch;
   - wins scale up: coin ping, coin shower, brass fanfare, jackpot siren;
   - misses are a soft low blip, never a harsh buzz;
   - a quiet crowd and a galloping hoofbeat sit under the race and swell when something happens.
   Sound starts after the first tap (browser rule), is saved as on/off, and can never break the game. */
const Sfx = (() => {
  const KEY = 'suitderby.snd';
  const SC = [523.25, 587.33, 659.25, 783.99, 880, 1046.5, 1174.66, 1318.51, 1567.98, 1760];   // C major pentatonic
  const SUIT_NOTE = [0, 2, 3, 4];          // hearts C, diamonds E, clubs G, spades A
  let ctx = null, bus = null, comp = null, master = null, noiseBuf = null, on = true, offline = false;
  const listeners = [];
  try { on = localStorage.getItem(KEY) !== '0'; } catch (e) {}

  function init() {
    comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -16; comp.knee.value = 12; comp.ratio.value = 6; comp.attack.value = 0.003; comp.release.value = 0.2;
    master = ctx.createGain(); master.gain.value = on ? 0.9 : 0;
    bus = ctx.createGain(); bus.gain.value = 1.5;
    bus.connect(comp); comp.connect(master); master.connect(ctx.destination);
    const len = Math.floor(ctx.sampleRate * 2);
    noiseBuf = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = noiseBuf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
  }
  function go() {
    if (!on) return null;
    if (!ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return null;
      try { ctx = new AC(); init(); } catch (e) { ctx = null; return null; }
    }
    if (!offline && ctx.state === 'suspended') { try { ctx.resume(); } catch (e) {} }
    return ctx;
  }
  /* wraps a sound so a failure in audio never reaches the game */
  const S = fn => function () { if (!go()) return; try { fn.apply(null, arguments); } catch (e) {} };

  /* ---------- building blocks ---------- */
  function tone(o) {
    const t0 = ctx.currentTime + (o.at || 0), dur = o.dur || 0.2, vol = o.vol || 0.15, atk = o.atk || 0.004;
    const os = ctx.createOscillator(), g = ctx.createGain();
    os.type = o.type || 'sine';
    os.frequency.setValueAtTime(o.f, t0);
    if (o.to) os.frequency.exponentialRampToValueAtTime(o.to, t0 + dur);
    if (o.det) os.detune.value = o.det;
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(vol, t0 + atk);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    if (o.lp) { const f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = o.lp; os.connect(f); f.connect(g); } else os.connect(g);
    g.connect(o.dest || bus);
    os.start(t0); os.stop(t0 + dur + 0.05);
  }
  function noise(o) {
    const t0 = ctx.currentTime + (o.at || 0), dur = o.dur || 0.1, vol = o.vol || 0.1;
    const s = ctx.createBufferSource(); s.buffer = noiseBuf; s.loop = true;
    const f = ctx.createBiquadFilter(); f.type = o.type || 'bandpass';
    f.frequency.setValueAtTime(o.f || 1000, t0);
    if (o.to) f.frequency.exponentialRampToValueAtTime(o.to, t0 + dur);
    f.Q.value = o.q || 1;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(vol, t0 + (o.atk || 0.004));
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    s.connect(f); f.connect(g); g.connect(o.dest || bus);
    s.start(t0, Math.random() * 1.5); s.stop(t0 + dur + 0.05);
  }
  /* a mallet / coin ping: a sine plus a short bright overtone */
  function ping(f, vol, at, dur) {
    dur = dur || 0.35;
    tone({ f, dur, vol, at, atk: 0.003 });
    tone({ f: f * 2.76, dur: dur * 0.35, vol: vol * 0.3, at, atk: 0.002 });
  }
  function brass(f, at, dur, vol) {
    tone({ f, at, dur, vol: vol * 0.55, type: 'sawtooth', lp: 1700, atk: 0.03 });
    tone({ f: f * 1.006, at, dur, vol: vol * 0.45, type: 'sawtooth', lp: 1500, atk: 0.035 });
    tone({ f: f / 2, at, dur, vol: vol * 0.5, type: 'triangle', atk: 0.03 });
  }
  const rnd = (a, b) => a + Math.random() * (b - a);

  /* ---------- interface ---------- */
  const click = S(() => { tone({ f: 900, to: 620, dur: 0.045, type: 'triangle', vol: 0.11 }); });
  const pick = S(() => { ping(SC[4], 0.12, 0, 0.14); });
  const chip = S(() => {
    noise({ type: 'bandpass', f: 5200, q: 2, dur: 0.025, vol: 0.12 });
    tone({ f: 2500, dur: 0.03, vol: 0.05 });
    noise({ type: 'bandpass', f: 4600, q: 2, dur: 0.025, vol: 0.1, at: 0.04 });
    tone({ f: 2100, dur: 0.03, vol: 0.045, at: 0.04 });
  });
  const shuffle = S(() => { for (let i = 0; i < 7; i++) noise({ type: 'bandpass', f: rnd(2200, 4200), q: 1.2, dur: 0.045, vol: 0.09, at: i * 0.045 }); });
  const flip = S(() => { noise({ type: 'bandpass', f: 2600, to: 4200, q: 0.8, dur: 0.06, vol: 0.1 }); tone({ f: 180, to: 120, dur: 0.05, vol: 0.06 }); });
  const buy = S(() => {          // cha-ching
    noise({ type: 'highpass', f: 6000, dur: 0.05, vol: 0.1 });
    tone({ f: 210, to: 120, dur: 0.09, vol: 0.12 });
    ping(SC[7], 0.13, 0.03, 0.45);
    ping(SC[9], 0.11, 0.11, 0.55);
  });
  const deny = S(() => { tone({ f: 200, to: 150, dur: 0.1, type: 'triangle', vol: 0.11 }); });

  /* ---------- the race ---------- */
  const count = S(n => {
    if (n === 'GO') {
      [0, 2, 4].forEach((k, i) => ping(SC[k] * 2, 0.12, i * 0.02, 0.5));
      tone({ f: 130, to: 65, dur: 0.3, vol: 0.2 });
      noise({ type: 'bandpass', f: 700, to: 3000, q: 0.7, dur: 0.35, vol: 0.09 });
    } else { tone({ f: 660, dur: 0.16, vol: 0.12, type: 'triangle' }); ping(SC[0], 0.06, 0, 0.2); }
  });
  /* every card is a note; your own suit is louder and higher cards ring a little more */
  const draw = S((suit, mine, rank) => {
    flip();
    const f = SC[SUIT_NOTE[suit] || 0] * (mine ? 1 : 0.5);
    ping(f, (mine ? 0.12 : 0.055) * (0.75 + (rank || 8) / 14 * 0.5), 0.02, mine ? 0.45 : 0.3);
  });
  const chaos = S(() => {
    tone({ f: 180, to: 900, dur: 0.35, type: 'square', vol: 0.05, lp: 1800 });
    for (let i = 0; i < 6; i++) ping(rnd(900, 2200), 0.05, 0.05 + i * 0.05, 0.25);
  });
  const surge = S(() => { noise({ type: 'bandpass', f: 400, to: 1700, q: 0.8, dur: 0.22, vol: 0.16 }); });
  const spur = S((pct, mine) => {
    const p = Math.max(0.15, Math.min(1, pct / 100)), v = mine ? 1 : 0.35;
    noise({ type: 'bandpass', f: 300, to: 2400 + 2400 * p, q: 0.7, dur: 0.3 + 0.3 * p, vol: (0.09 + 0.1 * p) * v });
    tone({ f: 120, to: 420 + 700 * p, dur: 0.35 + 0.15 * p, type: 'sawtooth', lp: 1300, vol: 0.05 * v });
    tone({ f: 75, to: 38, dur: 0.3, vol: (0.12 + 0.2 * p) * v });
    if (mine && p > 0.97) [4, 5, 7, 9].forEach((k, i) => ping(SC[k], 0.07, 0.12 + i * 0.05, 0.3));
  });
  const warn = S(() => { tone({ f: 740, dur: 0.08, type: 'triangle', vol: 0.11 }); tone({ f: 740, dur: 0.08, type: 'triangle', vol: 0.11, at: 0.11 }); });
  const perfect = S(() => {
    ping(SC[5], 0.14, 0, 0.4); ping(SC[7], 0.13, 0.06, 0.5); ping(SC[9], 0.1, 0.12, 0.6);
    noise({ type: 'highpass', f: 7000, dur: 0.25, vol: 0.06, at: 0.05 });
  });
  const clear = S(() => { tone({ f: 480, to: 760, dur: 0.11, vol: 0.11, type: 'triangle' }); noise({ type: 'bandpass', f: 1500, q: 0.6, dur: 0.12, vol: 0.08 }); });
  const stumble = S(mine => {
    const v = mine ? 1 : 0.4;
    tone({ f: 230, to: 70, dur: 0.45, type: 'sawtooth', lp: 650, vol: 0.12 * v });
    tone({ f: 340, to: 165, dur: 0.4, type: 'triangle', vol: 0.08 * v, at: 0.04 });
    noise({ type: 'lowpass', f: 420, dur: 0.16, vol: 0.18 * v });
  });
  const lucky = S(() => { [6, 8, 9].forEach((k, i) => ping(SC[k], 0.09, i * 0.06, 0.4)); });
  const coinFlip = S(() => { ping(2100, 0.08, 0, 0.5); ping(2600, 0.05, 0.12, 0.4); });
  const dice = S(() => { for (let i = 0; i < 5; i++) noise({ type: 'bandpass', f: rnd(900, 1800), q: 3, dur: 0.03, vol: 0.15, at: i * 0.05 + rnd(0, 0.02) }); });

  /* ---------- betting on the next card ---------- */
  /* a streak climbs the scale: three notes ending one step higher every time */
  const hit = S(streak => {
    const k = Math.min(SC.length - 1, streak + 1);
    for (let i = 0; i < 3; i++) ping(SC[Math.max(0, k - 2 + i)], 0.13, i * 0.06, 0.45);
    if (streak >= 3) ping(SC[Math.min(SC.length - 1, k)] * 2, 0.07, 0.22, 0.6);
    noise({ type: 'highpass', f: 6500, dur: 0.12, vol: 0.05, at: 0.12 });
  });
  const miss = S(() => { tone({ f: 330, to: 215, dur: 0.17, type: 'triangle', vol: 0.1 }); });
  const refund = S(() => { ping(SC[2], 0.07, 0, 0.3); ping(SC[2], 0.05, 0.09, 0.3); });

  /* ---------- wins ---------- */
  function coins(n, span, vol) {
    for (let i = 0; i < n; i++) {
      const at = Math.pow(Math.random(), 0.8) * span;
      ping(rnd(1700, 3300), (vol || 0.05) * rnd(0.6, 1), at, 0.28);
      if (i % 3 === 0) noise({ type: 'bandpass', f: rnd(5000, 8000), q: 3, dur: 0.02, vol: 0.04, at });
    }
  }
  const win = S(tier => {
    if (tier === 'nice') { coins(6, 0.4, 0.045); [0, 2, 4].forEach((k, i) => ping(SC[k + 2], 0.08, i * 0.05, 0.4)); }
    else if (tier === 'big') {
      coins(14, 0.9, 0.05); [0, 2, 3, 5, 7].forEach((k, i) => ping(SC[k], 0.1, i * 0.055, 0.5));
      [0, 2, 4].forEach(k => brass(SC[k] / 2, 0.25, 0.45, 0.08));
    } else if (tier === 'mega') {
      coins(26, 1.5, 0.05);
      [[0, 0], [2, 0.12], [4, 0.24], [5, 0.38]].forEach(([k, at]) => brass(SC[k], at, k === 5 ? 0.9 : 0.2, 0.1));
      tone({ f: 70, to: 45, dur: 0.6, vol: 0.25 });
    } else {          // jackpot
      tone({ f: 300, to: 1800, dur: 0.6, type: 'sawtooth', lp: 2500, vol: 0.06 });
      coins(44, 2.4, 0.05);
      [[0, 0.3], [2, 0.42], [4, 0.54], [5, 0.66], [7, 0.78]].forEach(([k, at]) => brass(SC[k], at, k === 7 ? 1.3 : 0.2, 0.11));
      [5, 7, 9, 7, 9].forEach((k, i) => ping(SC[k], 0.08, 0.9 + i * 0.1, 0.5));
      tone({ f: 70, to: 40, dur: 0.8, vol: 0.28, at: 0.3 });
    }
  });
  /* the lap payout counting up: ticks that rise in pitch, a chime if it ends in profit */
  const tally = S((dur, positive) => {
    const k = Math.max(4, Math.min(16, Math.round(dur * 13)));
    for (let i = 0; i < k; i++) tone({ f: 900 + i * 55, dur: 0.03, vol: 0.05, at: (i / k) * dur, type: 'triangle' });
    if (positive) { ping(SC[5], 0.12, dur, 0.5); ping(SC[7], 0.1, dur + 0.07, 0.6); }
  });
  const finish = S((place, mine) => {
    if (!mine) { if (place === 1) { tone({ f: 500, dur: 0.06, vol: 0.04, type: 'triangle' }); } return; }
    if (place === 1) { [0, 2, 4, 5].forEach((k, i) => brass(SC[k], i * 0.1, i === 3 ? 0.7 : 0.16, 0.1)); coins(8, 0.6, 0.04); }
    else if (place === 2) { [2, 4, 5].forEach((k, i) => ping(SC[k], 0.1, i * 0.08, 0.5)); }
    else { ping(SC[3], 0.08, 0, 0.35); ping(SC[2], 0.07, 0.11, 0.4); }
  });
  const champion = S(() => {
    [[0, 0], [0, 0.14], [0, 0.28], [2, 0.42], [4, 0.62]].forEach(([k, at], i) => brass(SC[k], at, i === 4 ? 1.2 : 0.12, 0.11));
    [0, 2, 4, 5].forEach(k => brass(SC[k] / 2, 0.62, 1.2, 0.05));
    coins(30, 2, 0.05);
    tone({ f: 70, to: 42, dur: 0.6, vol: 0.25, at: 0.62 });
  });
  const podium = S(() => { [0, 2, 4, 5].forEach((k, i) => ping(SC[k], 0.1, i * 0.09, 0.55)); });
  const settle = S(() => { ping(SC[4], 0.08, 0, 0.5); ping(SC[2], 0.07, 0.14, 0.6); });   // a gentle, not sad, end
  const pit = S(() => { ping(SC[2], 0.07, 0, 0.35); ping(SC[4], 0.07, 0.08, 0.4); });

  /* ---------- the crowd and the hoofbeats under the race ---------- */
  let crowdSrc = null, crowdGain = null, hoof = null, hv = 0, nextBeat = 0, step = 0;
  const CROWD = 0.034;
  function crowd(run) {
    if (!run && !crowdSrc) return;
    if (!go()) { if (!on && crowdSrc) crowdOff(); return; }
    try {
      if (run && !crowdSrc) {
        crowdSrc = ctx.createBufferSource(); crowdSrc.buffer = noiseBuf; crowdSrc.loop = true;
        const bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 650; bp.Q.value = 0.35;
        const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 1800;
        crowdGain = ctx.createGain(); crowdGain.gain.value = 0.0001;
        const lfo = ctx.createOscillator(), lg = ctx.createGain(); lfo.frequency.value = 0.35; lg.gain.value = 0.008;
        lfo.connect(lg); lg.connect(crowdGain.gain);
        crowdSrc.connect(bp); bp.connect(lp); lp.connect(crowdGain); crowdGain.connect(bus);
        crowdSrc.start(); lfo.start(); crowdSrc._lfo = lfo;
        crowdGain.gain.setTargetAtTime(CROWD, ctx.currentTime, 0.4);
      } else if (!run && crowdSrc) crowdOff();
    } catch (e) {}
  }
  function crowdOff() {
    try {
      const s = crowdSrc, g = crowdGain; crowdSrc = null; crowdGain = null;
      g.gain.setTargetAtTime(0.0001, ctx.currentTime, 0.15);
      setTimeout(() => { try { s.stop(); s._lfo.stop(); } catch (e) {} }, 700);
    } catch (e) {}
  }
  /* the crowd swells when something happens */
  function cheer(a) {
    if (!crowdGain || !ctx) return;
    try {
      const t = ctx.currentTime;
      crowdGain.gain.cancelScheduledValues(t);
      crowdGain.gain.setTargetAtTime(CROWD + 0.05 * Math.min(1.5, a), t, 0.05);
      crowdGain.gain.setTargetAtTime(CROWD, t + 0.45, 0.35);
    } catch (e) {}
  }
  function thump(at, a) {
    tone({ f: 105, to: 52, dur: 0.1, vol: 0.05 * a, at });
    noise({ type: 'lowpass', f: 380, dur: 0.06, vol: 0.04 * a, at });
  }
  function sched() {
    if (!ctx || !on || hv <= 0) return;
    const beat = Math.max(0.11, 0.26 - Math.min(hv, 9) * 0.015);
    try {
      while (nextBeat < ctx.currentTime + 0.14) {
        const a = [1, 0.65, 0.85, 0][step % 4];
        if (a) thump(Math.max(0, nextBeat - ctx.currentTime), a);
        step++; nextBeat += beat;
      }
    } catch (e) {}
  }
  /* v = how fast your horse is going (0 = silent) */
  function hooves(v) {
    hv = v;
    if (v > 0 && !hoof) { if (!go()) return; nextBeat = ctx.currentTime + 0.05; hoof = setInterval(sched, 40); }
    else if (v <= 0 && hoof) { clearInterval(hoof); hoof = null; }
  }

  /* ---------- on / off ---------- */
  function set(v) {
    on = !!v;
    try { localStorage.setItem(KEY, on ? '1' : '0'); } catch (e) {}
    if (ctx && master) master.gain.setTargetAtTime(on ? 0.9 : 0, ctx.currentTime, 0.02);
    if (!on) { hooves(0); if (crowdSrc) crowdOff(); }
    listeners.forEach(f => f(on));
    if (on) { go(); click(); }
  }
  const unlock = () => { if (on) go(); };

  /* test hook: render a sound offline and report its level (used by the build checks) */
  async function render(name, args, secs) {
    const oc = new OfflineAudioContext(1, Math.floor(44100 * secs), 44100);
    const keep = { ctx, bus, comp, master, noiseBuf, offline, on };
    ctx = oc; offline = true; on = true; init();
    try { api[name].apply(null, args || []); const buf = await oc.startRendering(); return buf.getChannelData(0); }
    finally { ({ ctx, bus, comp, master, noiseBuf, offline, on } = keep); }
  }

  const api = {
    click, pick, chip, shuffle, flip, buy, deny, count, draw, chaos, surge, spur, warn, perfect, clear, stumble,
    lucky, coinFlip, dice, hit, miss, refund, win, tally, finish, champion, podium, settle, pit,
    crowd, cheer, hooves, set, unlock, render,
    toggle: () => set(!on),
    get on() { return on; },
    onChange: f => { listeners.push(f); }
  };
  return api;
})();
if (typeof module !== 'undefined') module.exports = Sfx;
