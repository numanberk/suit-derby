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
  const KEY_M = 'suitderby.mus', MUS = 0.4;
  let mon = true, musBus = null, musOut = null;
  try { mon = localStorage.getItem(KEY_M) !== '0'; } catch (e) {}
  try { on = localStorage.getItem(KEY) !== '0'; } catch (e) {}

  function init() {
    comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -16; comp.knee.value = 12; comp.ratio.value = 6; comp.attack.value = 0.003; comp.release.value = 0.2;
    master = ctx.createGain(); master.gain.value = on ? 0.9 : 0;
    bus = ctx.createGain(); bus.gain.value = 1.5;
    bus.connect(comp); comp.connect(master); master.connect(ctx.destination);
    // music has its own bus, a gentle compressor and its own on/off
    musBus = ctx.createGain(); musBus.gain.value = 0.0001;
    const mc = ctx.createDynamicsCompressor();
    mc.threshold.value = -20; mc.knee.value = 14; mc.ratio.value = 3; mc.attack.value = 0.01; mc.release.value = 0.25;
    musOut = ctx.createGain(); musOut.gain.value = mon ? 1 : 0;
    musBus.connect(mc); mc.connect(musOut); musOut.connect(ctx.destination);
    const len = Math.floor(ctx.sampleRate * 2);
    noiseBuf = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = noiseBuf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
  }
  function go() { return on ? ctxGo() : null; }
  function ctxGo() {
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
    if (tier !== 'nice') music.duck(tier === 'big' ? 0.5 : 0.3, tier === 'jackpot' ? 2.4 : 1.4);
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
    if (place === 1) { music.duck(0.45, 1.2); [0, 2, 4, 5].forEach((k, i) => brass(SC[k], i * 0.1, i === 3 ? 0.7 : 0.16, 0.1)); coins(8, 0.6, 0.04); }
    else if (place === 2) { [2, 4, 5].forEach((k, i) => ping(SC[k], 0.1, i * 0.08, 0.5)); }
    else { ping(SC[3], 0.08, 0, 0.35); ping(SC[2], 0.07, 0.11, 0.4); }
  });
  const champion = S(() => {
    music.duck(0.25, 2.6);
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


  /* ---------- music ----------
     Two generated tracks, both loops of four bars.
     chill: the menu, setup, pit stop and results. Warm keys, a soft beat, a little hook that comes in on the second pass.
     race:  driving pulse. It starts with kick, bass and hats, then adds a plucked arpeggio, a clap, a pad and a lead hook
            as the lap goes on, and gets busier in the last stretch. */
  let mWant = null, mMode = null, mLevel = 0, mDim = 1, mSwell = 1, mStep = 0, mNext = 0, mTimer = null;
  const mt = o => tone(Object.assign({ dest: musBus }, o));
  const mn = o => noise(Object.assign({ dest: musBus }, o));
  const hz = (root, semi) => root * Math.pow(2, semi / 12);
  const CH = { min: [0, 3, 7, 12], maj: [0, 4, 7, 12], m7: [0, 3, 7, 10], M7: [0, 4, 7, 11], d7: [0, 4, 7, 10] };
  const kick = (at, v) => { mt({ f: 135, to: 42, dur: 0.17, vol: 0.6 * v, at, atk: 0.002 }); mn({ type: 'lowpass', f: 900, dur: 0.02, vol: 0.12 * v, at }); };
  const hat = (at, v, open) => mn({ type: 'highpass', f: 8500, dur: open ? 0.09 : 0.035, vol: 0.06 * v, at });
  const clap = (at, v) => [0, 0.012, 0.024].forEach(d => mn({ type: 'bandpass', f: 1600, q: 0.9, dur: 0.06, vol: 0.1 * v, at: at + d }));
  const bass = (f, at, dur, v) => { mt({ f, dur, vol: 0.32 * v, at, type: 'triangle', lp: 520, atk: 0.005 }); mt({ f, dur: dur * 0.8, vol: 0.16 * v, at, atk: 0.005 }); };
  const ep = (f, at, v, dur) => { dur = dur || 0.9; mt({ f, dur, vol: 0.085 * v, at, atk: 0.004 }); mt({ f: f * 2, dur: dur * 0.5, vol: 0.03 * v, at }); mt({ f: f * 4.02, dur: 0.12, vol: 0.02 * v, at }); };
  const pluck = (f, at, v) => mt({ f, dur: 0.13, vol: 0.065 * v, at, type: 'triangle', lp: 2800, atk: 0.002 });
  const lead = (f, at, v) => { mt({ f, dur: 0.24, vol: 0.05 * v, at, type: 'square', lp: 2300, atk: 0.005 }); mt({ f: f * 1.005, dur: 0.24, vol: 0.03 * v, at, type: 'sawtooth', lp: 2000, atk: 0.005 }); };
  const pad = (f, at, dur, v) => { mt({ f, dur, vol: 0.035 * v, at, type: 'sawtooth', lp: 900, atk: 0.35 }); mt({ f: f * 1.008, dur, vol: 0.03 * v, at, type: 'sawtooth', lp: 900, atk: 0.35 }); };

  const RACE_CH = [[110, 'min'], [87.31, 'maj'], [130.81, 'maj'], [98, 'maj']];          // Am F C G
  const ARP = [0, 2, 1, 3, 2, 1, 3, 2, 0, 2, 1, 3, 2, 3, 1, 2];
  const RACE_LEAD = [
    [880, 0, 0, 659.25, 0, 0, 523.25, 0, 659.25, 0, 0, 0, 587.33, 0, 523.25, 0],
    [523.25, 0, 0, 587.33, 0, 0, 523.25, 0, 440, 0, 0, 0, 523.25, 0, 0, 0],
    [659.25, 0, 0, 783.99, 0, 0, 659.25, 0, 587.33, 0, 523.25, 0, 587.33, 0, 659.25, 0],
    [587.33, 0, 0, 659.25, 0, 587.33, 0, 0, 523.25, 0, 0, 0, 587.33, 0, 0, 0]
  ];
  const CHILL_CH = [[130.81, 'M7'], [110, 'm7'], [146.83, 'm7'], [98, 'd7']];               // Cmaj7 Am7 Dm7 G7
  const CHILL_MEL = [
    [[0, 659.25], [3, 783.99], [6, 880], [10, 783.99]],
    [[0, 880], [4, 783.99], [8, 659.25], [12, 523.25]],
    [[0, 587.33], [3, 659.25], [7, 880], [10, 783.99]],
    [[0, 783.99], [6, 659.25], [8, 587.33], [12, 659.25]]
  ];
  const MODES = {
    race: {
      bpm: 126, swing: 0,
      step(i, at, L) {
        const bar = (i >> 4) & 3, s = i & 15, sp = 60 / 126 / 4, [root, q] = RACE_CH[bar];
        if (s % 4 === 0) kick(at, L >= 1 ? 1 : 0.8);
        if (s % 2 === 0) bass(root * (s === 6 || s === 14 ? 2 : 1), at, 0.2, s === 0 ? 1 : 0.8);
        if (s % 4 === 2) hat(at, 1, true);
        else if (L >= 3 || (L >= 2 && s % 2 === 1)) hat(at, 0.5, false);
        if (L >= 1 && (s === 4 || s === 12)) clap(at, 1);
        if (L >= 1) pluck(hz(root * 4, CH[q][ARP[s]]), at, L >= 3 ? 1.15 : 0.85);
        if (L >= 2 && s === 0) [0, 1, 2].forEach(k => pad(hz(root * 2, CH[q][k]), at, 1.9, 1));
        if (L >= 2 && RACE_LEAD[bar][s]) { lead(RACE_LEAD[bar][s], at, 1); lead(RACE_LEAD[bar][s], at + 3 * sp, 0.35); }
        if (L >= 3 && s === 8) pluck(hz(root * 8, CH[q][3]), at, 0.9);
        if (L >= 3 && RACE_LEAD[bar][s]) lead(RACE_LEAD[bar][s] * 2, at, 0.45);
      }
    },
    chill: {
      bpm: 82, swing: 0.3,
      step(i, at, L) {
        const bar = (i >> 4) & 3, s = i & 15, loop = (i >> 6) & 1, [root, q] = CHILL_CH[bar];
        if (s === 0) CH[q].forEach((semi, k) => ep(hz(root * 2, semi), at + k * 0.014, 0.85, 1.7));
        if (s === 10) CH[q].slice(1).forEach((semi, k) => ep(hz(root * 2, semi), at + k * 0.012, 0.5, 0.55));
        if (s === 0) bass(root, at, 0.55, 1);
        if (s === 8) bass(root * 1.5, at, 0.4, 0.6);
        if (s === 0 || s === 10) kick(at, 0.45);
        if (s === 4 || s === 12) mn({ type: 'bandpass', f: 1900, q: 0.8, dur: 0.11, vol: 0.06, at });
        if (s % 4 === 2) hat(at, 0.4, false);
        if (loop === 1) CHILL_MEL[bar].forEach(([st, f]) => { if (st === s) ep(f, at, 0.9, 1.1); });
      }
    }
  };
  function mGain(mult, tc) { if (musBus) musBus.gain.setTargetAtTime(Math.max(0.0001, MUS * mDim * mSwell * (mult || 1)), ctx.currentTime, tc || 0.15); }
  function mSched() {
    if (!ctx || !mMode || !mon) return;
    if (!offline && ctx.state !== 'running') return;
    if (mNext < ctx.currentTime - 0.3) mNext = ctx.currentTime + 0.05;
    const m = MODES[mMode], sp = 60 / m.bpm / 4;
    while (mNext < ctx.currentTime + 0.15) {
      const sw = (mStep & 1) ? m.swing * sp : 0;
      try { m.step(mStep, Math.max(0, mNext + sw - ctx.currentTime), mLevel); } catch (e) {}
      mStep++; mNext += sp;
    }
  }
  function mStart() {
    mMode = mWant; mStep = 0; mNext = ctx.currentTime + 0.06;
    musBus.gain.cancelScheduledValues(ctx.currentTime);
    mGain(1, 0.3);
    if (!mTimer) mTimer = setInterval(mSched, 30);
  }
  function mStop() {
    if (mTimer) { clearInterval(mTimer); mTimer = null; }
    mMode = null;
    if (ctx && musBus) { musBus.gain.cancelScheduledValues(ctx.currentTime); musBus.gain.setTargetAtTime(0.0001, ctx.currentTime, 0.08); }
  }
  /* starts, switches or stops the track to match what the game wants (and the on/off switch) */
  function mApply() {
    if (!ctx) return;
    if (!mon || !mWant) { mStop(); return; }
    if (mMode === mWant && mTimer) return;
    if (mTimer && mMode) {           // dip, then start the other track
      const want = mWant;
      mMode = null;
      musBus.gain.cancelScheduledValues(ctx.currentTime);
      musBus.gain.setTargetAtTime(0.0001, ctx.currentTime, 0.06);
      setTimeout(() => { if (mWant === want && mon && !mMode) mStart(); }, 260);
      return;
    }
    mStart();
  }
  const music = {
    mode(m) { mWant = m; mApply(); },
    level(n) { mLevel = n; },
    /* the race track gets louder as the lap runs out: 1 = normal, up to about 1.35 in the last stretch */
    swell(v) { v = Math.round(v * 20) / 20; if (v !== mSwell) { mSwell = v; if (ctx && mMode) mGain(1, 0.3); } },
    dim(v) { if (v !== mDim) { mDim = v; if (ctx && mMode) mGain(1, 0.12); } },
    duck(amt, dur) {
      if (!ctx || !mMode || !mon) return;
      const t = ctx.currentTime;
      musBus.gain.cancelScheduledValues(t);
      musBus.gain.setTargetAtTime(MUS * mDim * mSwell * amt, t, 0.03);
      musBus.gain.setTargetAtTime(MUS * mDim * mSwell, t + dur, 0.4);
    },
    set(v) {
      mon = !!v;
      try { localStorage.setItem(KEY_M, mon ? '1' : '0'); } catch (e) {}
      if (ctx && musOut) musOut.gain.setTargetAtTime(mon ? 1 : 0, ctx.currentTime, 0.02);
      if (mon) { ctxGo(); mApply(); } else mStop();
      listeners.forEach(f => f(on));
    },
    toggle() { music.set(!mon); },
    get on() { return mon; }
  };

  /* ---------- on / off ---------- */
  function set(v) {
    on = !!v;
    try { localStorage.setItem(KEY, on ? '1' : '0'); } catch (e) {}
    if (ctx && master) master.gain.setTargetAtTime(on ? 0.9 : 0, ctx.currentTime, 0.02);
    if (!on) { hooves(0); if (crowdSrc) crowdOff(); }
    listeners.forEach(f => f(on));
    if (on) { go(); click(); }
  }
  const unlock = () => { if (on || mon) { ctxGo(); mApply(); } };

  /* test hook: render a sound offline and report its level (used by the build checks) */
  async function render(name, args, secs) {
    const oc = new OfflineAudioContext(1, Math.floor(44100 * secs), 44100);
    const keep = { ctx, bus, comp, master, noiseBuf, offline, on };
    ctx = oc; offline = true; on = true; init();
    try { api[name].apply(null, args || []); const buf = await oc.startRendering(); return buf.getChannelData(0); }
    finally { ({ ctx, bus, comp, master, noiseBuf, offline, on } = keep); }
  }

  async function renderMusic(mode, level, secs, gainMult) {
    const oc = new OfflineAudioContext(1, Math.floor(44100 * secs), 44100);
    const keep = { ctx, bus, comp, master, noiseBuf, offline, on, musBus, musOut, mon, mMode, mLevel, mStep, mNext };
    ctx = oc; offline = true; on = true; mon = true; init(); mMode = mode; mLevel = level;
    try {
      const m = MODES[mode], sp = 60 / m.bpm / 4;
      let i = 0, t = 0.05;
      while (t < secs) { m.step(i, t + ((i & 1) ? m.swing * sp : 0), level); i++; t += sp; }
      musBus.gain.value = MUS * (gainMult || 1);
      return (await oc.startRendering()).getChannelData(0);
    } finally { ({ ctx, bus, comp, master, noiseBuf, offline, on, musBus, musOut, mon, mMode, mLevel, mStep, mNext } = keep); }
  }

  /* keep quiet while the tab is hidden */
  document.addEventListener('visibilitychange', () => {
    if (!ctx || offline) return;
    try { if (document.hidden) ctx.suspend(); else if (on || mon) ctx.resume(); } catch (e) {}
  });

  const api = {
    click, pick, chip, shuffle, flip, buy, deny, count, draw, chaos, surge, spur, warn, perfect, clear, stumble,
    lucky, coinFlip, dice, hit, miss, refund, win, tally, finish, champion, podium, settle, pit,
    crowd, cheer, hooves, set, unlock, render, renderMusic, music,
    toggle: () => set(!on),
    get on() { return on; },
    onChange: f => { listeners.push(f); }
  };
  return api;
})();
if (typeof module !== 'undefined') module.exports = Sfx;
