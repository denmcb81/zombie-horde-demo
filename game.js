/* Zombie Horde Free Spins – UI layer v2 (Horde Games demo). DEMO credits only, no real money. */
(function () {
  'use strict';
  const E = window.HordeEngine, C = E.CONFIG, S = C.symbols, FS = C.freeSpins;
  const $ = id => document.getElementById(id);
  const qs = new URLSearchParams(location.search);
  const seed = qs.has('seed') ? (parseInt(qs.get('seed'), 10) >>> 0) : (Date.now() >>> 0);
  const rng = E.makeRng(seed);
  if (qs.has('rtp')) E.setVariant(qs.get('rtp'));          // operator RTP variant: ?rtp=96|94|92
  $('seedTxt').textContent = 'Seed ' + seed + '. RTP ' + C.variants[C.rtpVariant].label + '.';
  // Horde Games network jackpot (shared, game-agnostic module). Own RNG stream so the slot maths
  // sequence is untouched; in production the jackpot draw moves to the jackpot server.
  const JPM = window.HordeJackpot;
  const jp = JPM ? JPM.create({ gameId: 'zombie-horde' }) : null;
  const jrng = E.makeRng((seed ^ 0x4a5c3b1d) >>> 0);

  const IMG = id => `assets/sym/${id}.webp`;
  Object.keys(S).forEach(id => { const i = new Image(); i.src = IMG(id); });

  const state = { balance: C.startBalance, betIdx: C.defaultBetIndex, busy: false, auto: false, turbo: false,
                  sound: true, grid: E.drawGrid(E.makeRng(seed ^ 0x5eed), 'base'), forced: [], forcedBoss: null, forcedJp: null, inFeature: false };
  const bet = () => C.bets[state.betIdx];
  const fmt = n => n.toLocaleString('en-GB', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  const T = ms => (state.turbo ? Math.round(ms * 0.45) : ms);

  // ---------- audio: ElevenLabs-generated files (assets/audio) + tiny synth ticks ----------
  // Nothing plays until the first tap/key (browser autoplay rules). Music / SFX toggles are remembered.
  const PREF = (() => { try { return JSON.parse(localStorage.getItem('zhAudio') || '{}'); } catch (e) { return {}; } })();
  state.music = PREF.music !== false; state.sound = PREF.sfx !== false;
  const savePref = () => { try { localStorage.setItem('zhAudio', JSON.stringify({ music: state.music, sfx: state.sound })); } catch (e) { /* private mode */ } };
  const AUDIO_FILES = ['music_base', 'music_free', 'heartbeat', 'reel_stop', 'groan_small', 'groan_big', 'cascade_boom', 'meter_thunk', 'boss_roar', 'bigwin_fanfare', 'brain_land'];
  const A = { ctx: null, buf: {}, el: {}, loaded: 0, failed: 0, mode: 'none', music: null, musicKey: 'music_base', master: null, mGain: null, sGain: null, hb: null, lastThunk: 0 };
  const audioSrc = k => `assets/audio/${k}.mp3`;
  function markAudio() { document.body.dataset.audio = `${A.mode}:${A.loaded}/${AUDIO_FILES.length}${A.failed ? ' failed:' + A.failed : ''}`; }
  function unlockAudio() {
    if (A.ctx || A.mode === 'html') return;
    const AC = window.AudioContext || window.webkitAudioContext;
    const viaHtml = () => { // fallback (e.g. opened from file:// where fetch is blocked)
      A.mode = 'html';
      AUDIO_FILES.forEach(k => { if (A.buf[k]) return; const e = new Audio(audioSrc(k)); e.preload = 'auto'; A.el[k] = e;
        e.addEventListener('canplaythrough', () => { if (!e._ok) { e._ok = 1; A.loaded++; markAudio(); if (k === A.musicKey) startMusic(k); } }, { once: true });
        e.addEventListener('error', () => { A.failed++; markAudio(); }, { once: true }); e.load(); });
    };
    if (!AC) return viaHtml();
    A.ctx = new AC(); A.mode = 'webaudio';
    A.master = A.ctx.createGain(); A.master.connect(A.ctx.destination);
    A.mGain = A.ctx.createGain(); A.mGain.gain.value = 0; A.mGain.connect(A.master);
    A.sGain = A.ctx.createGain(); A.sGain.gain.value = 0.9; A.sGain.connect(A.master);
    if (A.ctx.state === 'suspended') A.ctx.resume();
    if (location.protocol === 'file:') return viaHtml();   // fetch() is blocked on file:// – use <audio> elements
    let fellBack = false;
    AUDIO_FILES.forEach(k => fetch(audioSrc(k)).then(r => { if (!r.ok) throw new Error(r.status); return r.arrayBuffer(); })
      .then(ab => new Promise((res, rej) => A.ctx.decodeAudioData(ab, res, rej)))
      .then(bf => { A.buf[k] = bf; A.loaded++; markAudio(); if (k === A.musicKey) startMusic(k); })
      .catch(() => { if (!fellBack) { fellBack = true; A.loaded = 0; A.buf = {}; viaHtml(); } }));
    markAudio();
  }
  ['pointerdown', 'keydown', 'touchstart'].forEach(ev => window.addEventListener(ev, unlockAudio, { passive: true }));
  document.addEventListener('visibilitychange', () => { if (A.ctx) (document.hidden ? A.ctx.suspend() : A.ctx.resume()); if (A.mode === 'html' && A.music) (document.hidden ? A.music.pause() : state.music && A.music.play().catch(() => {})); });

  function snd(k, o = {}) {
    if (!state.sound) return;
    const vol = o.vol == null ? 1 : o.vol, rate = o.rate || 1;
    if (A.buf[k]) {
      const s = A.ctx.createBufferSource(), g = A.ctx.createGain();
      s.buffer = A.buf[k]; s.playbackRate.value = rate; g.gain.value = vol;
      s.connect(g).connect(A.sGain); s.start(A.ctx.currentTime + (o.delay || 0));
      return s;
    }
    if (A.el[k]) { const e = A.el[k].cloneNode(); e.volume = Math.min(1, vol * 0.9); e.playbackRate = rate; e.play().catch(() => {}); return e; }
  }
  const MUSIC_VOL = 0.42;
  function startMusic(k) {
    A.musicKey = k;
    if (!state.music) return;
    if (A.mode === 'webaudio') {
      if (!A.buf[k]) return;
      if (A.music && A.music._k === k) return;
      const t = A.ctx.currentTime;
      if (A.music) { const old = A.music; old._g.gain.cancelScheduledValues(t); old._g.gain.setValueAtTime(old._g.gain.value, t); old._g.gain.linearRampToValueAtTime(0, t + 0.8); old.stop(t + 0.85); }
      const s = A.ctx.createBufferSource(), g = A.ctx.createGain();
      s.buffer = A.buf[k]; s.loop = true; s.loopStart = 0.03; s.loopEnd = A.buf[k].duration - 0.03;
      g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(1, t + 0.8);
      s.connect(g).connect(A.mGain); s.start(t, 0.03); s._k = k; s._g = g; A.music = s;
      A.mGain.gain.cancelScheduledValues(t); A.mGain.gain.setValueAtTime(A.mGain.gain.value, t); A.mGain.gain.linearRampToValueAtTime(MUSIC_VOL, t + 0.8);
    } else if (A.mode === 'html') {
      const e = A.el[k]; if (!e) return;
      if (A.music && A.music !== e) A.music.pause();
      e.loop = true; e.volume = MUSIC_VOL; A.music = e; e.play().catch(() => {});
    }
  }
  function stopMusic() {
    if (!A.music) return;
    if (A.mode === 'webaudio') { const t = A.ctx.currentTime, m = A.music; m._g.gain.setValueAtTime(m._g.gain.value, t); m._g.gain.linearRampToValueAtTime(0, t + 0.4); m.stop(t + 0.45); }
    else A.music.pause();
    A.music = null;
  }
  function duck(on) {
    if (A.mode === 'webaudio' && A.mGain) { const t = A.ctx.currentTime; A.mGain.gain.cancelScheduledValues(t); A.mGain.gain.setValueAtTime(A.mGain.gain.value, t); A.mGain.gain.linearRampToValueAtTime(on ? 0.1 : MUSIC_VOL, t + 0.3); }
    else if (A.music) A.music.volume = on ? 0.1 : MUSIC_VOL;
  }
  // heartbeat speeds up while the last reels spin with 3 brains landed
  function heartbeat(ms) {
    if (!state.sound || A.hb) return;
    if (A.buf.heartbeat) {
      const s = A.ctx.createBufferSource(), g = A.ctx.createGain(), t = A.ctx.currentTime;
      s.buffer = A.buf.heartbeat; s.loop = true; s.loopStart = 0.02; s.loopEnd = A.buf.heartbeat.duration - 0.02;
      s.playbackRate.setValueAtTime(1, t); s.playbackRate.linearRampToValueAtTime(1.9, t + ms / 1000);
      g.gain.setValueAtTime(0.3, t); g.gain.linearRampToValueAtTime(1, t + ms / 1000);
      s.connect(g).connect(A.sGain); s.start(t); s._g = g; A.hb = s; duck(true);
    } else if (A.el.heartbeat) { const e = A.el.heartbeat; e.loop = true; e.playbackRate = 1.3; e.currentTime = 0; e.play().catch(() => {}); A.hb = e; }
  }
  function heartbeatStop() {
    if (!A.hb) return;
    if (A.hb.stop) { const t = A.ctx.currentTime; A.hb._g.gain.setValueAtTime(A.hb._g.gain.value, t); A.hb._g.gain.linearRampToValueAtTime(0, t + 0.25); A.hb.stop(t + 0.3); duck(false); }
    else A.hb.pause();
    A.hb = null;
  }
  function tone(freq, dur, type = 'square', vol = 0.05, slide = 0) {
    if (!state.sound || !A.ctx) return;
    const o = A.ctx.createOscillator(), g = A.ctx.createGain(), t = A.ctx.currentTime;
    o.type = type; o.frequency.setValueAtTime(freq, t);
    if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(30, freq + slide), t + dur);
    g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g).connect(A.sGain); o.start(t); o.stop(t + dur + 0.02);
  }
  const rnd = (a, b) => a + Math.random() * (b - a);
  const sfx = {
    stop: () => snd('reel_stop', { vol: 0.55, rate: rnd(0.95, 1.08) }),
    brain: () => snd('brain_land', { vol: 0.9, rate: rnd(0.97, 1.05) }),
    tick: () => tone(1500, 0.025, 'square', 0.012),
    groan: x => { if (x >= 10) snd('groan_big', { vol: Math.min(1, 0.6 + x / 100) }); else snd('groan_small', { vol: x >= 2 ? 0.95 : 0.55, rate: x >= 2 ? rnd(0.82, 0.9) : rnd(1, 1.2) }); },
    boom: () => snd('cascade_boom', { vol: 0.8, rate: rnd(0.9, 1.08) }),
    drop: () => snd('reel_stop', { vol: 0.25, rate: 1.35 }),
    thunk: () => { const n = performance.now(); if (n - A.lastThunk < 55) return; A.lastThunk = n; snd('meter_thunk', { vol: 0.7, rate: rnd(0.9, 1.25) }); },
    intro: () => snd('groan_big', { vol: 1, rate: 0.9 }),
    unleash: () => { snd('groan_big', { vol: 1, rate: 0.8 }); snd('cascade_boom', { vol: 1, rate: 0.6 }); },
    roar: () => { snd('boss_roar', { vol: 1 }); snd('cascade_boom', { vol: 0.8, rate: 0.5, delay: 0.1 }); },
    fanfare: (v = 1) => snd('bigwin_fanfare', { vol: v }),
  };

  // ---------- layout ----------
  let cell = 84, gapPx = 5;
  const pitch = () => cell + gapPx;
  function layout() {
    gapPx = window.innerWidth < 420 ? 4 : 5;
    const vw = Math.min(window.innerWidth, document.documentElement.clientWidth || window.innerWidth);
    const w = Math.min(vw, 760) - 20 - 46 - gapPx * 7;
    const reserved = window.innerHeight < 700 ? 340 : 390;
    const h = window.innerHeight - reserved - (state.inFeature ? 70 : 0) - gapPx * 5;
    cell = Math.max(44, Math.floor(Math.min(104, w / 6, h / 4)));
    document.documentElement.style.setProperty('--cell', cell + 'px');
    document.documentElement.style.setProperty('--gap', gapPx + 'px');
    // shrink the reels if the page still overflows the viewport (tall logo / short screens)
    for (let i = 0; i < 3; i++) {
      const over = $('app').scrollHeight - window.innerHeight;
      if (over <= 2 || cell <= 44) break;
      cell = Math.max(44, cell - Math.ceil(over / 4) - 1);
      document.documentElement.style.setProperty('--cell', cell + 'px');
    }
  }

  // ---------- grid rendering ----------
  const gridEl = $('grid');
  const reels = [];          // {reel, strip, cells:[el x4]}
  function makeCell(sym) {
    const d = document.createElement('div');
    d.className = 'cell s-' + sym + ' k-' + S[sym].kind;
    d.dataset.sym = sym;
    d.style.setProperty('--i', (Math.random() * 9) | 0);
    d.innerHTML = `<img src="${IMG(sym)}" alt="${S[sym].name}">`;
    return d;
  }
  const setY = (el, y) => el.style.setProperty('--t', `translateY(${y}px)`);
  function buildReels() {
    gridEl.innerHTML = ''; reels.length = 0;
    for (let r = 0; r < C.reels; r++) {
      const reel = document.createElement('div'); reel.className = 'reel';
      const strip = document.createElement('div'); strip.className = 'strip';
      reel.appendChild(strip); gridEl.appendChild(reel);
      reels.push({ reel, strip, cells: [] });
      renderReel(r, state.grid[r]);
    }
  }
  function renderReel(r, col) {
    const R = reels[r];
    R.strip.innerHTML = ''; R.strip.style.transition = 'none'; R.strip.style.transform = 'none';
    R.cells.forEach(c => c && c.remove());
    R.cells = col.map((s, k) => { const c = makeCell(s); setY(c, k * pitch()); R.reel.appendChild(c); return c; });
  }
  const cellEl = (r, k) => reels[r].cells[k];
  const visualIds = Object.keys(S);
  const randSym = () => visualIds[(Math.random() * visualIds.length) | 0];

  function spinReels(grid, brainNeed) {
    clearHighlights();
    const p = pitch(), fast = state.turbo, prev = state.grid;
    state.grid = grid.map(c => c.slice());
    let brainsSoFar = 0, extra = 0;
    const promises = [];
    for (let r = 0; r < C.reels; r++) {
      const anticip = brainNeed > 0 && brainsSoFar >= brainNeed - 1;
      if (anticip) extra += fast ? 350 : 900;
      const filler = (fast ? 6 : 12) + r * (fast ? 2 : 4) + (anticip ? (fast ? 6 : 14) : 0);
      const syms = grid[r].slice();
      for (let i = 0; i < filler; i++) syms.push(randSym());
      syms.push(...prev[r]);
      const R = reels[r];
      R.cells.forEach(c => c.remove()); R.cells = [];
      R.strip.style.transition = 'none';
      R.strip.innerHTML = '';
      syms.forEach(s => R.strip.appendChild(makeCell(s)));
      R.strip.style.transform = `translateY(${-(filler + 4) * p}px)`;
      void R.strip.offsetHeight;
      const dur = (fast ? 260 + r * 70 : 560 + r * 160) + extra;
      R.strip.style.transition = `transform ${dur}ms cubic-bezier(.35,.05,.3,1.06)`;
      R.strip.style.transform = 'translateY(0)';
      if (anticip) setTimeout(() => { R.reel.classList.add('anticip'); heartbeat(fast ? 350 : 900 * (C.reels - r)); }, Math.max(0, dur - (fast ? 350 : 900)));
      promises.push(new Promise(res => setTimeout(() => {
        R.reel.classList.remove('anticip');
        renderReel(r, grid[r]);
        landFx(R.cells);
        sfx.stop();
        grid[r].forEach((s, k) => { if (s === 'BRAIN') { cellEl(r, k).classList.add('brainland'); sfx.brain(); } });
        res();
      }, dur + 30)));
      brainsSoFar += grid[r].filter(s => s === 'BRAIN').length;
    }
    return Promise.all(promises).then(() => heartbeatStop());
  }

  function clearHighlights() {
    gridEl.classList.remove('dim');
    gridEl.querySelectorAll('.hit').forEach(e => e.classList.remove('hit'));
  }
  function highlight(cells) {
    gridEl.classList.add('dim');
    cells.forEach(([r, k]) => cellEl(r, k).classList.add('hit'));
  }

  // particles at a cell
  const SPARK = { low: '#cfe3f5', zombie: '#9cff3a', wild: '#ffd21a', scatter: '#ff8fd0' };
  const REDUCED = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  function landFx(cells) {
    if (REDUCED) return;
    cells.forEach(c => { c.classList.remove('land'); void c.offsetWidth; c.classList.add('land'); });
    setTimeout(() => cells.forEach(c => c.classList.remove('land')), 420);
  }
  function burst(el, color) {
    const fx = $('fx'), fr = fx.getBoundingClientRect(), r = el.getBoundingClientRect();
    const cx = r.left - fr.left + r.width / 2, cy = r.top - fr.top + r.height / 2;
    if (REDUCED) return;
    // shockwave ring
    const sh = document.createElement('div'); sh.className = 'shock';
    sh.style.left = cx + 'px'; sh.style.top = cy + 'px'; sh.style.borderColor = color;
    fx.appendChild(sh);
    sh.animate([{ width: '10px', height: '10px', opacity: 1 }, { width: cell * 1.5 + 'px', height: cell * 1.5 + 'px', opacity: 0 }],
               { duration: 380, easing: 'cubic-bezier(.2,.8,.4,1)' }).onfinish = () => sh.remove();
    // gravity chunks
    for (let i = 0; i < 6; i++) {
      const c = document.createElement('div'); c.className = 'chunk';
      c.style.left = cx + 'px'; c.style.top = cy + 'px'; c.style.background = color;
      fx.appendChild(c);
      const vx = (Math.random() - 0.5) * cell * 1.6, up = cell * (0.4 + Math.random() * 0.5), rot = (Math.random() - 0.5) * 720;
      c.animate([{ transform: 'translate(-50%,-50%) rotate(0)', opacity: 1 },
                 { transform: `translate(calc(-50% + ${vx * 0.6}px), calc(-50% - ${up}px)) rotate(${rot / 2}deg)`, opacity: 1, offset: 0.4 },
                 { transform: `translate(calc(-50% + ${vx}px), calc(-50% + ${cell * 0.8}px)) rotate(${rot}deg)`, opacity: 0 }],
                { duration: 650 + Math.random() * 200, easing: 'cubic-bezier(.3,.6,.6,1)' }).onfinish = () => c.remove();
    }
    for (let i = 0; i < 9; i++) {
      const s = document.createElement('div'); s.className = 'spark';
      s.style.left = cx + 'px'; s.style.top = cy + 'px'; s.style.background = color; s.style.boxShadow = `0 0 8px ${color}`;
      fx.appendChild(s);
      const a = Math.random() * Math.PI * 2, d = cell * (0.4 + Math.random() * 0.6);
      s.animate([{ transform: 'translate(-50%,-50%) scale(1)', opacity: 1 },
                 { transform: `translate(calc(-50% + ${Math.cos(a) * d}px), calc(-50% + ${Math.sin(a) * d}px)) scale(.2)`, opacity: 0 }],
                { duration: 450 + Math.random() * 200, easing: 'cubic-bezier(.2,.8,.4,1)' }).onfinish = () => s.remove();
    }
  }

  // ---------- HUD ----------
  function updateHUD() {
    $('balance').textContent = fmt(state.balance);
    $('bet').textContent = fmt(bet());
    $('betDown').disabled = state.busy || state.betIdx === 0;
    $('betUp').disabled = state.busy || state.betIdx === C.bets.length - 1;
    $('btnSpin').disabled = state.busy && !state.auto;
    $('btnSpin').classList.toggle('spinning', state.busy);
    $('btnAuto').classList.toggle('on', state.auto);
    $('btnTurbo').classList.toggle('on', state.turbo);
    $('btnSfx').classList.toggle('off', !state.sound);
    $('btnMusic').classList.toggle('off', !state.music);
  }
  const msg = html => { $('msg').innerHTML = html; };
  const icon = id => `<img src="${IMG(id)}" alt="${S[id].name}">`;

  function countUp(el, from, to, ms) {
    return new Promise(res => {
      if (to <= from || ms <= 0) { el.textContent = fmt(to); return res(); }
      const t0 = performance.now(); let lastTick = 0;
      el.classList.add('counting');
      (function step(t) {
        const p = Math.min(1, (t - t0) / ms), e = 1 - Math.pow(1 - p, 3);
        el.textContent = fmt(from + (to - from) * e);
        if (t - lastTick > 70) { sfx.tick(); lastTick = t; }
        if (p < 1) requestAnimationFrame(step); else { el.classList.remove('counting'); res(); }
      })(t0);
    });
  }
  function banner(label, amount) {
    const b = $('winBanner');
    b.classList.remove('hidden', 'bump'); void b.offsetWidth; b.classList.add('bump');
    b.innerHTML = `<small>${label}</small>${fmt(amount)}`;
  }

  async function bigWin(amount, x) {
    const ov = $('ovBig');
    $('bigTitle').textContent = x >= 100 ? 'HORDE WIN!' : x >= 50 ? 'MEGA WIN' : 'BIG WIN';
    ov.classList.remove('hidden');
    shake(false); shower(x >= 100 ? 70 : x >= 50 ? 50 : 34);
    sfx.fanfare(1); sfx.groan(Math.max(10, x)); duck(true);
    await countUp($('bigAmt'), 0, amount, state.turbo ? 900 : 2600);
    await sleep(1100);
    ov.classList.add('hidden'); duck(false);
  }

  // coin + brain shower for big wins
  function shower(n) {
    if (REDUCED) return;
    const box = $('shower'); box.innerHTML = '';
    const H = window.innerHeight + 120;
    for (let i = 0; i < n; i++) {
      let d;
      if (i % 4 === 0) { d = document.createElement('img'); d.src = IMG('BRAIN'); d.alt = ''; }
      else { d = document.createElement('div'); d.className = 'coin'; }
      d.classList.add('drop');
      d.style.left = (Math.random() * 100) + 'vw';
      box.appendChild(d);
      const dur = 1400 + Math.random() * 1400, delay = Math.random() * 1600, sway = (Math.random() - 0.5) * 120;
      d.animate([{ transform: 'translate(0,0) rotate(0) rotateY(0)' },
                 { transform: `translate(${sway}px, ${H}px) rotate(${(Math.random() - 0.5) * 900}deg) rotateY(720deg)` }],
                { duration: dur, delay, easing: 'cubic-bezier(.4,.1,.8,.9)', fill: 'both' }).onfinish = () => d.remove();
    }
  }
  // floating embers in free spins
  (function embers() {
    const box = $('embers'); if (!box || REDUCED) return;
    for (let i = 0; i < 26; i++) {
      const e = document.createElement('i');
      e.style.left = (Math.random() * 100) + '%';
      e.style.setProperty('--dx', ((Math.random() - 0.5) * 160) + 'px');
      e.style.animationDuration = (6 + Math.random() * 8) + 's';
      e.style.animationDelay = (-Math.random() * 14) + 's';
      const s = 2 + Math.random() * 4; e.style.width = e.style.height = s + 'px';
      box.appendChild(e);
    }
  })();

  // ---------- bonus cinematics (presentation only – no maths here) ----------
  const HORDE = [0, 1, 2, 3, 4, 5].map(i => `assets/horde/z${i}.webp`);
  HORDE.forEach(src => { const i = new Image(); i.src = src; });
  function rollInt(el, to, ms) {
    return new Promise(res => {
      if (ms <= 0 || REDUCED) { el.textContent = to; return res(); }
      const t0 = performance.now();
      (function step(t) {
        const p = Math.min(1, (t - t0) / ms);
        el.textContent = Math.round(to * (1 - Math.pow(1 - p, 2)));
        if (p < 1) requestAnimationFrame(step); else { el.textContent = to; el.classList.remove('pop'); void el.offsetWidth; el.classList.add('pop'); res(); }
      })(t0);
    });
  }
  // zombie silhouettes rushing across the screen
  function hordeRush(n, ms, z = 54) {
    if (REDUCED) return sleep(Math.min(ms, 300));
    const box = document.createElement('div'); box.className = 'rush'; box.style.zIndex = z;
    document.body.appendChild(box);
    for (let i = 0; i < n; i++) {
      const w = document.createElement('div'); w.className = 'runner';
      const im = document.createElement('img'); im.src = HORDE[i % HORDE.length]; im.alt = '';
      im.style.animationDuration = (0.28 + Math.random() * 0.2) + 's';
      w.appendChild(im);
      const sc = 0.7 + Math.random() * 0.9;
      w.style.bottom = (2 + Math.random() * 22) + 'vh';
      w.style.height = (14 * sc) + 'vh';
      w.style.zIndex = Math.round(sc * 10);
      w.style.filter = `brightness(${0.2 + sc * 0.25})`;
      box.appendChild(w);
      const d = ms * (0.6 + Math.random() * 0.4), delay = Math.random() * ms * 0.35;
      w.animate([{ transform: 'translateX(-30vw)' }, { transform: 'translateX(130vw)' }],
                { duration: d, delay, easing: 'linear', fill: 'both' });
    }
    return sleep(ms + 60).then(() => box.remove());
  }
  // brains pulse, fly to the centre, screen darkens, horde rushes past, FREE SPINS title rolls up
  async function triggerCinematic(brainCells) {
    highlight(brainCells);
    brainCells.forEach(([r, k]) => cellEl(r, k).classList.add('bpulse'));
    sfx.brain();
    await sleep(T(900));
    const cine = $('cine'); cine.classList.remove('hidden', 'show', 'out'); void cine.offsetWidth; cine.classList.add('go');
    const cx = window.innerWidth / 2, cy = window.innerHeight / 2;
    const flights = brainCells.map(([r, k], i) => {
      const src = cellEl(r, k); if (!src) return Promise.resolve();
      const b = src.getBoundingClientRect();
      const f = document.createElement('img'); f.className = 'flyer brainfly'; f.src = IMG('BRAIN');
      Object.assign(f.style, { left: b.left + 'px', top: b.top + 'px', width: b.width + 'px', height: b.height + 'px' });
      document.body.appendChild(f);
      const dx = cx - (b.left + b.width / 2), dy = cy - (b.top + b.height / 2);
      return new Promise(res => {
        f.animate([{ transform: 'translate(0,0) scale(1) rotate(0)' },
                   { transform: `translate(${dx * 0.5}px, ${dy * 0.5 - 60}px) scale(1.6) rotate(${i % 2 ? 25 : -25}deg)`, offset: 0.5 },
                   { transform: `translate(${dx}px, ${dy}px) scale(2.4) rotate(0)`, opacity: 1, offset: 0.85 },
                   { transform: `translate(${dx}px, ${dy}px) scale(4)`, opacity: 0 }],
                  { duration: T(1000) + i * T(90), easing: 'cubic-bezier(.5,0,.4,1)', fill: 'both' }).onfinish = () => { f.remove(); res(); };
      });
    });
    sfx.intro();
    await Promise.all(flights);
    clearHighlights();
    shake(false); burstAt(cx, cy, '#ff8fd0', 22);
    const rush = hordeRush(9, T(2000), 61);
    cine.classList.add('show');
    await rollInt($('cineCount'), FS.award, T(900));
    await rush;
    cine.classList.add('out');
    await sleep(T(350));
    cine.classList.add('hidden'); cine.classList.remove('go', 'show', 'out');
  }
  // particles at screen coordinates
  function burstAt(x, y, color, n = 16) {
    if (REDUCED) return;
    for (let i = 0; i < n; i++) {
      const s2 = document.createElement('div'); s2.className = 'spark fixed';
      s2.style.left = x + 'px'; s2.style.top = y + 'px'; s2.style.background = color; s2.style.boxShadow = `0 0 10px ${color}`;
      document.body.appendChild(s2);
      const a = Math.random() * Math.PI * 2, d = 60 + Math.random() * 160;
      s2.animate([{ transform: 'translate(-50%,-50%) scale(1.4)', opacity: 1 },
                  { transform: `translate(calc(-50% + ${Math.cos(a) * d}px), calc(-50% + ${Math.sin(a) * d}px)) scale(.2)`, opacity: 0 }],
                 { duration: 600 + Math.random() * 400, easing: 'cubic-bezier(.2,.8,.4,1)' }).onfinish = () => s2.remove();
    }
  }
  // zombies shambling along the bottom during free spins
  function startWalkers() {
    const box = $('walkers'); box.innerHTML = '';
    if (REDUCED) return;
    for (let i = 0; i < 6; i++) {
      const w = document.createElement('div'); w.className = 'walker' + (i % 3 === 2 ? ' left' : '');
      const im = document.createElement('img'); im.src = HORDE[(i * 2 + (i > 2 ? 1 : 0)) % HORDE.length]; im.alt = '';
      im.style.animationDuration = (0.9 + Math.random() * 0.6) + 's';
      w.appendChild(im);
      const sc = 0.55 + Math.random() * 0.6;
      w.style.height = (11 * sc) + 'vh';
      w.style.bottom = (-1 + Math.random() * 3) + 'vh';
      w.style.animationDuration = (18 + Math.random() * 16) + 's';
      w.style.animationDelay = (-Math.random() * 30) + 's';
      box.appendChild(w);
    }
    box.classList.add('on');
  }
  function stopWalkers() { const box = $('walkers'); box.classList.remove('on'); setTimeout(() => { if (!box.classList.contains('on')) box.innerHTML = ''; }, 900); }
  // horde meter bursts on level-up, multiplier badge slams in
  function meterBurst(mult) {
    const m = $('meter'); m.classList.remove('burst'); void m.offsetWidth; m.classList.add('burst');
    const r = m.getBoundingClientRect();
    if (!REDUCED) for (let i = 0; i < 10; i++) {
      const f = document.createElement('img'); f.className = 'flyer'; f.src = IMG(['SHAMBLER', 'RUNNER', 'HULK'][i % 3]);
      const x = r.left + r.width * (i + 0.5) / 10, y = r.top + r.height / 2, sz = 30;
      Object.assign(f.style, { left: (x - sz / 2) + 'px', top: (y - sz / 2) + 'px', width: sz + 'px', height: sz + 'px' });
      document.body.appendChild(f);
      const a = -Math.PI / 2 + (Math.random() - 0.5) * 2.4, d = 80 + Math.random() * 140;
      f.animate([{ transform: 'translate(0,0) scale(1)', opacity: 1 },
                 { transform: `translate(${Math.cos(a) * d}px, ${Math.sin(a) * d + 160}px) scale(.4) rotate(${(Math.random() - 0.5) * 600}deg)`, opacity: 0 }],
                { duration: 900 + Math.random() * 400, easing: 'cubic-bezier(.2,.6,.6,1)' }).onfinish = () => f.remove();
    }
    burstAt(r.left + r.width / 2, r.top + r.height / 2, '#ffd23f', 24);
    const mEl = $('fsMult'); mEl.textContent = '×' + mult;
    mEl.classList.remove('pop', 'slam'); void mEl.offsetWidth; mEl.classList.add('slam');
    const badge = mEl.parentElement; badge.classList.remove('lvl'); void badge.offsetWidth; badge.classList.add('lvl');
  }
  // retrigger celebration
  async function retriggerFx(res) {
    sfx.brain();
    highlight(res.brainCells);
    res.brainCells.forEach(([r, k]) => cellEl(r, k).classList.add('bpulse'));
    shower(18);
    const fl = $('fsLeft'); fl.classList.remove('pop'); void fl.offsetWidth; fl.classList.add('pop');
    await toast(`<span class="rt">RETRIGGER!</span><br>+${FS.retriggerAward} FREE SPINS`);
    clearHighlights();
  }

  function toast(text, color) {
    const t = $('toast');
    t.classList.add('hidden'); void t.offsetWidth;
    t.innerHTML = text; t.style.color = color || '';
    t.classList.remove('hidden');
    return sleep(1400).then(() => t.classList.add('hidden'));
  }
  function waitClick(btnId, autoMs) {
    return new Promise(res => {
      const b = $(btnId); let done = false;
      const fin = () => { if (done) return; done = true; b.removeEventListener('click', fin); res(); };
      b.addEventListener('click', fin);
      if (autoMs) setTimeout(fin, autoMs);
    });
  }
  function shake(flash = true) {
    const a = $('app'); a.classList.remove('shake'); void a.offsetWidth; a.classList.add('shake');
    if (!flash) return;
    const f = $('flash'); f.classList.remove('go'); void f.offsetWidth; f.classList.add('go');
  }

  // ---------- horde meter ----------
  const meter = { shown: 0, level: 0 };
  function drawMeter() {
    const max = FS.multipliers.length - 1;
    const atMax = meter.level >= max;
    const need = FS.meterSizes[Math.min(meter.level, FS.meterSizes.length - 1)];
    const v = atMax ? need : Math.min(meter.shown, need);
    $('meterFill').style.width = (100 * v / need) + '%';
    $('meterFill').classList.toggle('full', atMax || meter.shown >= need);
    $('meterTxt').textContent = atMax ? `MAX ×${FS.multipliers[max]}` : `${Math.min(meter.shown, need)}/${need} → ×${FS.multipliers[meter.level + 1]}`;
    document.querySelectorAll('.mult-steps span').forEach(s => {
      const l = +s.dataset.l; s.classList.toggle('done', l <= meter.level); s.classList.toggle('next', l === meter.level + 1);
    });
  }
  // zombie cells fly into the meter
  function flyZombies(cells) {
    if (!cells.length || meter.level >= FS.multipliers.length - 1) return Promise.resolve();
    const target = $('meter').getBoundingClientRect();
    const tx = target.left + target.width * Math.min(1, meter.shown / FS.meterSizes[meter.level]), ty = target.top + target.height / 2;
    const jobs = cells.map(([r, k], i) => new Promise(res => {
      const src = cellEl(r, k); if (!src) return res();
      const b = src.getBoundingClientRect();
      const f = document.createElement('img'); f.className = 'flyer'; f.src = IMG(src.dataset.sym);
      Object.assign(f.style, { left: b.left + 'px', top: b.top + 'px', width: b.width + 'px', height: b.height + 'px' });
      document.body.appendChild(f);
      const dx = tx - (b.left + b.width / 2), dy = ty - (b.top + b.height / 2);
      const a = f.animate([
        { transform: 'translate(0,0) scale(1) rotate(0)', opacity: 1 },
        { transform: `translate(${dx * 0.3}px, ${dy * 0.3 - 40}px) scale(.8) rotate(-15deg)`, opacity: 1, offset: 0.35 },
        { transform: `translate(${dx}px, ${dy}px) scale(.22) rotate(20deg)`, opacity: 0.6 }],
        { duration: T(620) + i * T(45), easing: 'cubic-bezier(.45,0,.75,.6)' });
      a.onfinish = () => {
        f.remove(); meter.shown++; drawMeter(); sfx.thunk();
        const m = $('meter'); m.classList.remove('gulp'); void m.offsetWidth; m.classList.add('gulp');
        res();
      };
    }));
    return Promise.all(jobs);
  }

  // ---------- cascade presentation ----------
  // Plays all cascade steps of a spin result. Returns total cash shown.
  async function playCascades(res, mult, runFrom, label) {
    const b = bet();
    let shown = 0, idx = 0, bigDone = false;
    // big-win celebration plays while the winning symbols are still on screen (before they explode)
    const maybeBig = async total => { if (!bigDone && total / b >= C.bigWinX) { bigDone = true; await bigWin(total, total / b); } };
    if (state.inFeature) {
      const z = []; res.grid.forEach((col, r) => col.forEach((s, k) => { if (S[s].kind === 'zombie') z.push([r, k]); }));
      await flyZombies(z);
    }
    for (const st of res.steps) {
      idx++;
      // 1) highlight + count
      const hitCells = []; st.wins.forEach(w => hitCells.push(...w.cells));
      highlight(hitCells);
      const amt = st.x * b * mult;
      msg(st.wins.map(w => `${w.count}× ${icon(w.sym)} <b>${fmt(w.x * b * mult)}</b>`).join(' &nbsp;·&nbsp; ') + (mult > 1 ? ` &nbsp;(×${mult})` : '') + (idx > 1 ? ` &nbsp;· cascade ${idx}` : ''));
      banner(idx > 1 ? `${label} · CASCADE ${idx}` : label, shown + amt);
      sfx.groan(amt / b);
      await countUp($('win'), runFrom + shown, runFrom + shown + amt, T(Math.min(1000, 280 + st.x * 30)));
      shown += amt;
      await maybeBig(shown);
      await sleep(T(380));
      // 2) explode
      sfx.boom();
      const removeSet = new Set(st.remove.map(([r, k]) => r + ',' + k));
      st.remove.forEach(([r, k]) => { const el = cellEl(r, k); el.classList.add('boom'); burst(el, SPARK[S[el.dataset.sym].kind]); });
      await sleep(T(330));
      clearHighlights();
      // 3) drop survivors + fall in new symbols
      const p = pitch();
      for (let r = 0; r < C.reels; r++) {
        const R = reels[r];
        const survivors = [];
        for (let k = 0; k < C.rows; k++) { if (removeSet.has(r + ',' + k)) R.cells[k].remove(); else survivors.push(R.cells[k]); }
        const n = C.rows - survivors.length;
        if (!n) continue;
        const newCells = [];
        for (let j = 0; j < n; j++) {
          const c = makeCell(st.next[r][j]); c.classList.add('fall');
          setY(c, (j - n) * p - 10); R.reel.appendChild(c); newCells.push(c);
        }
        R.cells = newCells.concat(survivors);
        void R.reel.offsetHeight;
        R.cells.forEach((c, k) => { c.classList.add('fall'); c.style.setProperty('--d', T(300 + k * 40) + 'ms'); setY(c, k * p); });
      }
      sfx.drop();
      await sleep(T(420));
      landFx([...gridEl.querySelectorAll('.cell.fall')]);
      gridEl.querySelectorAll('.cell.fall').forEach(c => c.classList.remove('fall'));
      state.grid = st.next.map(c => c.slice());
      if (state.inFeature) {
        const z = st.newCells.filter(([r, k]) => S[st.next[r][k]].kind === 'zombie');
        await flyZombies(z);
      }
    }
    // scatter pay on final grid
    if (res.scatterX > 0) {
      highlight(res.brainCells);
      sfx.brain();
      const amt = res.scatterX * b * mult;
      msg(`${res.brains}× ${icon('BRAIN')} scatter <b>${fmt(amt)}</b>`);
      banner(label, shown + amt);
      await countUp($('win'), runFrom + shown, runFrom + shown + amt, T(500));
      shown += amt;
      await maybeBig(shown);
      await sleep(T(600));
    }
    return shown;
  }

  // ---------- free spins ----------
  async function runFeature(baseWin) {
    const b = bet(), cap = C.maxWinX * b;
    $('introSpins').textContent = '0';
    $('ovIntro').classList.remove('hidden');
    const introClick = waitClick('introGo', state.auto ? 2500 : 0);
    rollInt($('introSpins'), FS.award, T(700));
    await introClick;
    $('ovIntro').classList.add('hidden');
    state.inFeature = true;
    startMusic('music_free');
    document.body.classList.add('free');
    startWalkers();
    $('fsBar').classList.remove('hidden');
    layout(); buildReels();
    const st = E.newFeature();
    meter.shown = 0; meter.level = 0; drawMeter();
    $('fsLeft').textContent = st.left; $('fsMult').textContent = '×1';
    let total = 0;
    $('win').textContent = fmt(baseWin);
    msg('FREE SPINS – every zombie feeds the <b>HORDE METER</b>!');
    await sleep(700);
    while (st.left > 0) {
      $('fsLeft').textContent = st.left - 1;
      const res = E.freeSpin(rng, st, state.forced.shift(), res0Boss());
      await spinReels(res.grid, FS.retriggerBrains);
      let shown = await playCascades(res, res.mult, baseWin + total, 'FREE SPIN WIN');
      // round cap
      if (baseWin + total + shown >= cap) { shown = cap - baseWin - total; st.left = 0; res.done = true; }
      if (shown > 0) {
        total += shown; state.balance += shown; updateHUD();
        await sleep(T(250));
      } else {
        msg(res.zombies ? `+${res.zombies} zombies joined the horde` : 'No win');
        await sleep(T(300));
      }
      $('winBanner').classList.add('hidden');
      if (res.levelUp) {
        meter.level = st.level; meter.shown = st.meter; drawMeter();
        sfx.unleash(); shake();
        meterBurst(st.mult);
        $('unleashTxt').textContent = `×${st.mult} · +${FS.meterAward} SPINS`;
        $('unleash').classList.remove('hidden');
        await hordeRush(7, T(1700), 54);
        $('unleash').classList.add('hidden');
      } else { meter.shown = st.level >= FS.multipliers.length - 1 ? meter.shown : st.meter; drawMeter(); }
      if (res.retrigger) await retriggerFx(res);
      $('fsLeft').textContent = st.left;
      // boss drop on the last spin
      if (st.left <= 0 && res.boss) total = await bossScene(res.boss, total, baseWin, cap);
    }
    await sleep(400);
    clearHighlights();
    $('outroSub').textContent = `${st.played} free spins · top multiplier ×${st.mult}` + (st.boss ? ` · boss ${st.boss.type === 'mult' ? '×' + st.boss.value : 'prize ' + st.boss.value + '×'}` : '');
    $('outroWin').textContent = fmt(0);
    $('ovOutro').classList.remove('hidden');
    sfx.fanfare(0.8);
    shower(total / b >= 50 ? 60 : total / b >= 10 ? 40 : 22);
    // optional Pick a Zombie gamble on the feature win (never offered automatically in autoplay)
    const room = Math.round((cap - baseWin) * 100) / 100;
    const canGamble = total > 0 && total < room - 0.005;
    $('outroGamble').classList.toggle('hidden', !canGamble); $('outroNote').classList.toggle('hidden', !canGamble);
    // listen for COLLECT / GAMBLE straight away so an early tap is never lost
    const choice = waitChoice(canGamble ? ['outroGo', 'outroGamble'] : ['outroGo'], state.auto ? 4500 : 0);
    await Promise.race([countUp($('outroWin'), 0, total, Math.min(2500, 500 + total / b * 15)), choice]);
    $('outroWin').textContent = fmt(total);
    const picked = await choice;
    $('ovOutro').classList.add('hidden');
    if (picked === 'outroGamble') {
      const nt = await gambleScene(total, room);
      state.balance = Math.round((state.balance + nt - total) * 100) / 100; total = nt; updateHUD();
    }
    $('shower').innerHTML = '';
    stopWalkers();
    document.body.classList.remove('free');
    $('fsBar').classList.add('hidden');
    state.inFeature = false;
    startMusic('music_base');
    layout(); buildReels();
    $('win').textContent = fmt(baseWin + total);
    msg(`Feature won <b>${fmt(total)}</b> · round win <b>${fmt(baseWin + total)}</b>`);
    return total;
  }
  function debris() {
    const box = $('debris'); box.innerHTML = '';
    if (REDUCED) return;
    for (let i = 0; i < 26; i++) {
      const d = document.createElement('div'); d.className = 'rock';
      const sz = 8 + Math.random() * 22; d.style.width = sz + 'px'; d.style.height = sz * (0.6 + Math.random() * 0.5) + 'px';
      d.style.left = (40 + Math.random() * 20) + 'vw';
      box.appendChild(d);
      const vx = (Math.random() - 0.5) * 90, up = 30 + Math.random() * 50;
      d.animate([{ transform: 'translate(0,0) rotate(0)' }, { transform: `translate(${vx * 0.6}vw, -${up}vh) rotate(${Math.random() * 360}deg)`, offset: 0.45 },
                 { transform: `translate(${vx}vw, 10vh) rotate(${Math.random() * 720}deg)` }],
                { duration: 1100 + Math.random() * 600, easing: 'cubic-bezier(.2,.7,.6,1)', fill: 'both' }).onfinish = () => d.remove();
    }
  }
  function res0Boss() { const f = state.forcedBoss; return f || undefined; }

  async function bossScene(boss, total, baseWin, cap) {
    const b = bet();
    const ov = $('ovBoss'), img = $('bossImg'), drop = $('bossDrop');
    drop.classList.add('hidden');
    $('bossTitle').textContent = 'THE GROUND SHAKES…';
    img.classList.remove('roar', 'rise');
    ov.classList.remove('hidden', 'risen', 'reveal');
    ov.classList.add('rumble');
    $('frame').classList.add('smash');
    await sleep(T(900));
    // boss bursts out of the ground
    ov.classList.remove('rumble'); ov.classList.add('risen');
    img.classList.add('rise');
    sfx.roar(); shake();
    debris();
    await sleep(T(800));
    $('bossTitle').textContent = 'THE BOSS ARRIVES!';
    img.classList.add('roar'); shake(false);
    await sleep(T(800));
    let add = boss.type === 'mult' ? total * (boss.value - 1) : boss.value * b;
    if (baseWin + total + add > cap) add = Math.max(0, cap - baseWin - total);
    // build-up: the drop flickers through the boss table before landing
    $('bossTitle').textContent = 'THE BOSS DROPS…';
    $('bossDropAmt').textContent = '';
    drop.classList.remove('hidden'); drop.classList.add('rolling');
    const opts = C.bossDrop.table.map(o => o.type === 'mult' ? `×${o.value} FEATURE WIN` : `${o.value}× BET`);
    if (!REDUCED) { let wait = 60, i = 0; const end = performance.now() + T(1500);
      while (performance.now() < end) { $('bossDropTxt').textContent = opts[i++ % opts.length]; sfx.tick(); await sleep(wait); wait = Math.min(220, wait * 1.12); } }
    drop.classList.remove('rolling');
    $('bossTitle').textContent = boss.type === 'mult' ? 'BOSS MULTIPLIER!' : 'BOSS PRIZE!';
    $('bossDropTxt').textContent = boss.type === 'mult' ? `×${boss.value} FEATURE WIN` : `${boss.value}× BET`;
    $('bossDropAmt').textContent = boss.type === 'mult' ? `${fmt(total)} → ${fmt(total + add)}` : `+${fmt(add)}`;
    drop.classList.remove('boss-drop'); void drop.offsetWidth; drop.classList.add('boss-drop');
    ov.classList.add('reveal');
    const dr = $('bossDropTxt').getBoundingClientRect(); burstAt(dr.left + dr.width / 2, dr.top + dr.height / 2, '#ffd23f', 26);
    shower(boss.type === 'mult' || boss.value >= 10 ? 30 : 14);
    sfx.fanfare(0.7);
    await sleep(T(400));
    if (add > 0) { await countUp($('win'), baseWin + total, baseWin + total + add, T(1000)); state.balance += add; updateHUD(); }
    await sleep(T(1500));
    ov.classList.add('hidden'); ov.classList.remove('risen', 'reveal');
    $('frame').classList.remove('smash');
    return total + add;
  }

  function waitChoice(ids, autoMs) {
    return new Promise(res => {
      let done = false; const hs = [];
      const fin = id => { if (done) return; done = true; hs.forEach(([b, f]) => b.removeEventListener('click', f)); res(id); };
      ids.forEach(id => { const b = $(id), f = () => fin(id); b.addEventListener('click', f); hs.push([b, f]); });
      if (autoMs) setTimeout(() => fin(ids[0]), autoMs);
    });
  }

  // ---------- Pick a Zombie gamble ----------
  // Outcome comes from engine.gamblePick (seeded RNG, weighted 20/40/40); the coffin touched only
  // decides where that outcome is shown. Cap: result never exceeds the room left under the max win.
  const MULT_TXT = m => (m === 0.5 ? '×½' : '×' + m), MULT_CLS = m => (m === 2 ? 'm2' : m === 1 ? 'm1' : 'mh');
  const MULT_SYM = m => (m === 2 ? 'HULK' : m === 1 ? 'SHAMBLER' : 'RUNNER');
  async function gambleScene(amount, room) {
    const ov = $('ovGamble'), cofs = [...document.querySelectorAll('#coffins .coffin')];
    let picks = C.gamble.maxPicks;
    $('gAmt').textContent = fmt(amount);
    ov.classList.remove('hidden');
    duck(true);
    while (true) {
      $('gPicks').textContent = picks;
      cofs.forEach(c => { c.className = 'coffin'; c.disabled = false; c.querySelector('.g-rev').className = 'g-rev'; c.querySelector('.g-rev').innerHTML = ''; });
      $('gMsg').textContent = picks === C.gamble.maxPicks ? 'Choose a coffin…' : 'Pick again – choose a coffin…';
      $('gCollect').classList.remove('hidden'); $('gContinue').classList.add('hidden');
      const choice = await new Promise(res => {
        const hs = [];
        const fin = v => { hs.forEach(([b, f]) => b.removeEventListener('click', f)); res(v); };
        cofs.forEach((c, i) => { const f = () => fin(i); c.addEventListener('click', f); hs.push([c, f]); });
        const fc = () => fin(-1); $('gCollect').addEventListener('click', fc); hs.push([$('gCollect'), fc]);
      });
      if (choice < 0) break;
      cofs.forEach(c => { c.disabled = true; });
      $('gCollect').classList.add('hidden');
      const mine = cofs[choice]; mine.classList.add('mine', 'shake');
      $('gMsg').textContent = 'Something stirs…';
      sfx.thunk(); heartbeat(T(900));
      const g = E.gamblePick(rng, choice);
      const next = E.gambleApply(amount, g.mult, room);
      await sleep(T(700));
      heartbeatStop();
      cofs.forEach((c, i) => { const r = c.querySelector('.g-rev'), m = g.reveal[i]; r.className = 'g-rev ' + MULT_CLS(m); r.innerHTML = `<img src="${IMG(MULT_SYM(m))}" alt="">${MULT_TXT(m)}`; });
      mine.classList.remove('shake'); mine.classList.add('open');
      const rb = mine.getBoundingClientRect();
      if (g.mult === 2) { sfx.fanfare(0.6); sfx.groan(20); burstAt(rb.left + rb.width / 2, rb.top + rb.height / 2, '#ffd23f', 24); shower(16); }
      else if (g.mult === 1) { sfx.groan(2); }
      else { sfx.groan(1); snd('groan_small', { vol: 0.9, rate: 0.7 }); }
      await sleep(T(450));
      cofs.forEach((c, i) => { if (i !== choice) c.classList.add('open', 'other'); });
      const el = $('gAmt'); el.classList.remove('up', 'down'); void el.offsetWidth;
      if (next > amount) { el.classList.add('up'); await countUp(el, amount, next, T(700)); }
      else { if (next < amount) el.classList.add('down'); el.textContent = fmt(next); }
      $('gMsg').textContent = g.mult === 2 ? 'DOUBLED!' : g.mult === 1 ? 'Phew – win kept' : 'Bitten! Win halved';
      amount = next; picks--;
      $('gPicks').textContent = picks;
      if (picks > 0 && amount > 0 && amount < room - 0.005) {
        $('gContinue').classList.remove('hidden'); $('gCollect').classList.remove('hidden');
        const v = await waitChoice(['gCollect', 'gContinue'], 0);
        if (v === 'gCollect') break;
      } else {
        $('gMsg').textContent += amount >= room - 0.005 ? ' · max win reached' : ' · no picks left';
        await sleep(T(1500));
        break;
      }
    }
    ov.classList.add('hidden'); duck(false);
    $('shower').innerHTML = '';
    return amount;
  }

  // ---------- network jackpot: ticker ----------
  const tick = { shown: {}, target: {}, raf: 0 };
  function drawTicker() {
    if (!jp) return;
    jp.getPools().forEach(p => { tick.target[p.id] = p.amount; if (tick.shown[p.id] == null || p.amount < tick.shown[p.id]) tick.shown[p.id] = p.amount; });
    if (tick.raf) return;
    const step = () => {
      let moving = false;
      Object.keys(tick.target).forEach(id => {
        const d = tick.target[id] - tick.shown[id];
        if (Math.abs(d) > 0.004) { tick.shown[id] += d * 0.12 + Math.sign(d) * 0.003; if (Math.abs(tick.target[id] - tick.shown[id]) < 0.004 || Math.sign(tick.target[id] - tick.shown[id]) !== Math.sign(d)) tick.shown[id] = tick.target[id]; moving = true; }
        const e = $('jp_' + id); if (e) e.textContent = fmt(tick.shown[id]);
      });
      tick.raf = moving ? requestAnimationFrame(step) : 0;
    };
    tick.raf = requestAnimationFrame(step);
  }
  if (jp) {
    jp.getPools().forEach(p => { tick.shown[p.id] = p.amount; const e = $('jp_' + p.id); if (e) e.textContent = fmt(p.amount); });
    jp.on('update', drawTicker);
    jp.on('award', e => {
      drawTicker();
      const cellEl2 = document.querySelector('.jp-cell.t-' + e.tier);
      if (cellEl2) { cellEl2.classList.remove('won'); void cellEl2.offsetWidth; cellEl2.classList.add('won'); }
      if (e.by !== 'you') {
        const n = $('jpNews'); n.textContent = `${e.name} ${fmt(e.amount)} just won on ${e.gameId}!`; n.classList.add('show');
        setTimeout(() => n.classList.remove('show'), 4500);
      }
    });
  }
  // debug hook can force a tier: rigged draws (trigger, tier), then the real stream
  function jpRng() {
    if (state.forcedJp == null || !jp) return jrng;
    const ti = jp.tiers.findIndex(t => t.id === state.forcedJp || t.name === state.forcedJp); state.forcedJp = null;
    if (ti < 0) return jrng;
    const tot = jp.tiers.reduce((a, t) => a + t.oddsPerUnit, 0);
    const cum = jp.tiers.slice(0, ti).reduce((a, t) => a + t.oddsPerUnit, 0);
    const q = [0, (cum + jp.tiers[ti].oddsPerUnit / 2) / tot];
    return () => (q.length ? q.shift() : jrng());
  }

  // ---------- network jackpot: jump-scare + Lair pick game ----------
  const SCARE_KEY = 'zhScareSeen';
  async function jumpScare() {
    const sc = $('jpScare');
    let seen = false; try { seen = localStorage.getItem(SCARE_KEY) === '1'; } catch (e) { /* private mode */ }
    let skipped = false, wake = null;
    const nap = ms => new Promise(r => { if (skipped) return r(); const t = setTimeout(r, ms); wake = () => { clearTimeout(t); r(); }; });
    const onSkip = () => { skipped = true; if (wake) wake(); };
    sc.classList.remove('hidden', 'go', 'calm', 'dark', 'show'); void sc.offsetWidth;
    heartbeatStop(); stopMusic();
    sc.classList.add(REDUCED ? 'calm' : 'go');
    if (seen) { sc.classList.add('show'); sc.addEventListener('click', onSkip); }
    // flicker + glitch buzz
    tone(70, 0.5, 'sawtooth', 0.06, -30); tone(1800, 0.08, 'square', 0.03);
    await nap(T(500));
    if (!skipped) { heartbeat(900); tone(55, 0.9, 'sawtooth', 0.05, 40); }
    await nap(REDUCED ? 600 : 900);
    // the lunge hits the glass
    if (!skipped) {
      sfx.roar(); snd('cascade_boom', { vol: 1, rate: 0.55 }); snd('groan_big', { vol: 1, rate: 0.7, delay: 0.05 });
      if (!REDUCED) sc.animate([{ transform: 'translate(0,0)' }, { transform: 'translate(-14px,9px)' }, { transform: 'translate(12px,-10px)' }, { transform: 'translate(-8px,6px)' }, { transform: 'translate(0,0)' }], { duration: 450, iterations: 2 });
    }
    await nap(REDUCED ? 500 : 650);
    heartbeatStop();
    if (!skipped && !seen) {      // first ever view: let it land, then TAP TO CONTINUE
      sc.classList.add('show');
      await waitChoice(['scareSkip'], state.auto ? 2500 : 0);
    } else if (!skipped) {
      await waitChoice(['scareSkip'], state.auto ? 1200 : 1600);
    }
    try { localStorage.setItem(SCARE_KEY, '1'); } catch (e) { /* private mode */ }
    sc.removeEventListener('click', onSkip);
    sc.classList.add('dark');               // screen goes dark…
    await sleep(600);
  }
  async function jackpotScene(w) {
    state.inJackpot = true;
    await jumpScare();
    const scr = $('jpScreen'), tiers = jp.tiers, grid = $('jpGrid');
    // tier board + 12 graves
    const pools = jp.getPools();
    $('jpTiers').innerHTML = tiers.slice().reverse().map(t => {
      const amt = t.id === w.tier ? w.amount : (pools.find(p => p.id === t.id) || {}).amount || t.seed;
      return `<div class="jp-tier t-${t.id}" data-t="${t.id}"><label><img class="ti" src="${IMG(({ mini: 'SHAMBLER', minor: 'RUNNER', major: 'HULK', grand: 'BOSS' })[t.id] || 'BRAIN')}" alt="">${t.name}</label><b>${fmt(amt)}</b><div class="pips"><i></i><i></i><i></i></div></div>`;
    }).join('');
    grid.innerHTML = '';
    for (let i = 0; i < w.pick.size; i++) {
      const g = document.createElement('button'); g.className = 'grave'; g.setAttribute('aria-label', 'Grave ' + (i + 1));
      g.innerHTML = `<img src="assets/tomb.webp" alt=""><div class="tok"></div>`;
      grid.appendChild(g);
    }
    $('jpWin').classList.add('hidden');
    scr.classList.remove('hidden');
    $('jpScare').classList.add('hidden');
    $('jpScare').classList.remove('go', 'calm', 'dark', 'show');
    startMusic('music_free');
    const counts = {}; tiers.forEach(t => { counts[t.id] = 0; });
    const TIER_SYM = { mini: 'SHAMBLER', minor: 'RUNNER', major: 'HULK', grand: 'BOSS' };
    const tokHtml = t => `<img src="${IMG(TIER_SYM[t.id] || 'BRAIN')}" alt=""><span>${t.name}</span>`;
    const setTok = (g, t) => { const tok = g.querySelector('.tok'); tok.innerHTML = tokHtml(t); g.style.setProperty('--tc', `var(--c-${t.id})`); g.dataset.t = t.id; };
    const graves = [...grid.children];
    for (let k = 0; k < w.pick.order.length; k++) {
      // wait for the player to dig a grave (autoplay digs for them)
      const g = await new Promise(res => {
        const open = graves.filter(x => !x.disabled), hs = [];
        const fin = x => { hs.forEach(([b, f]) => b.removeEventListener('click', f)); clearTimeout(at); res(x); };
        open.forEach(x => { const f = () => fin(x); x.addEventListener('click', f); hs.push([x, f]); });
        const at = state.auto ? setTimeout(() => fin(open[Math.floor(Math.random() * open.length)]), T(700)) : 0;
      });
      g.disabled = true;
      const t = tiers[w.pick.order[k]];
      setTok(g, t); g.classList.add('dug');
      counts[t.id]++;
      sfx.brain(); sfx.thunk();
      const rb = g.getBoundingClientRect(); burstAt(rb.left + rb.width / 2, rb.top + rb.height / 2, '#c8ff7a', 10);
      const tierEl = $('jpTiers').querySelector(`[data-t="${t.id}"]`);
      tierEl.querySelectorAll('.pips i').forEach((p, i) => p.classList.toggle('on', i < counts[t.id]));
      if (counts[t.id] === 2) { tierEl.classList.add('hot'); heartbeat(T(700)); }
      if (counts[t.id] === 3) {
        tierEl.classList.remove('hot'); tierEl.classList.add('win');
        graves.filter(x => x.dataset.t === t.id).forEach(x => x.classList.add('match'));
      }
      await sleep(T(260));
    }
    heartbeatStop();
    // reveal what the other graves held
    await sleep(T(500));
    const restGr = graves.filter(x => !x.disabled);
    restGr.forEach((g, i) => { g.disabled = true; setTok(g, tiers[w.pick.rest[i]]); g.classList.add('dug', 'rest'); });
    await sleep(T(900));
    // celebration
    const winT = tiers[w.tierIndex];
    $('jwTier').textContent = winT.name; $('jwTier').style.setProperty('--tc', `var(--c-${winT.id})`);
    $('jwAmt').textContent = fmt(0);
    $('jpWin').classList.remove('hidden');
    sfx.fanfare(1); sfx.groan(100); shower(w.tierIndex >= 2 ? 80 : 50);
    const done = waitClick('jpCollect', state.auto ? 5000 : 0);
    await Promise.race([countUp($('jwAmt'), 0, w.amount, Math.min(4000, 1200 + w.tierIndex * 900)), done]);
    $('jwAmt').textContent = fmt(w.amount);
    await done;
    state.balance = Math.round((state.balance + w.amount) * 100) / 100;
    scr.classList.add('hidden'); $('jpWin').classList.add('hidden'); $('shower').innerHTML = '';
    startMusic('music_base');
    state.inJackpot = false;
    $('win').textContent = fmt(w.amount);
    msg(`<b>${winT.name} JACKPOT</b> · ${fmt(w.amount)} added to your demo credits`);
    updateHUD(); drawTicker();
  }

  // ---------- main spin ----------
  async function spin() {
    if (state.busy) return;
    if (state.balance < bet() - 1e-9) {
      state.auto = false; updateHUD();
      msg('Not enough demo credits – lower the bet or reset credits in the info screen');
      return;
    }
    state.busy = true;
    state.balance = Math.round((state.balance - bet()) * 100) / 100;
    $('win').textContent = fmt(0);
    $('winBanner').classList.add('hidden');
    msg('&nbsp;');
    updateHUD();
    const b = bet();
    const res = E.baseSpin(rng, state.forced.shift());
    // network jackpot: every paid spin contributes, then one stake-weighted draw (decided now, shown after the round)
    let jpWin = null;
    if (jp) { jp.contribute(b); jpWin = jp.checkWin(b, jpRng()); drawTicker(); }
    await spinReels(res.grid, FS.trigger);
    let amount = await playCascades(res, 1, 0, 'WIN');
    amount = Math.min(amount, C.maxWinX * b);
    if (amount > 0) {
      state.balance += amount;
      if (!res.trigger) msg(`Round win <b>${fmt(amount)}</b>` + (res.steps.length > 1 ? ` · ${res.steps.length} cascades` : ''));
    } else msg(res.brains === 3 ? `So close! 3 ${icon('BRAIN')}…` : 'No win – the horde keeps coming');
    updateHUD();
    if (res.trigger) {
      await triggerCinematic(res.brainCells);
      await runFeature(amount);
    }
    if (jpWin) await jackpotScene(jpWin);
    state.balance = Math.round(state.balance * 100) / 100;
    state.busy = false;
    updateHUD();
    if (state.auto) setTimeout(() => { if (state.auto) spin(); }, state.turbo ? 120 : 400);
  }

  // ---------- paytable ----------
  function buildPaytable() {
    const b = bet();
    let h = '<tr><th>SYMBOL</th><th>8–9</th><th>10–11</th><th>12+</th></tr>';
    ['BOSS', 'HULK', 'RUNNER', 'SHAMBLER', 'TNT', 'MEDKIT', 'RADIO', 'AXE'].forEach(id => {
      const s = S[id];
      h += `<tr><td>${icon(id)}${s.name}</td>${s.pay.map(p => `<td>${fmt(p * b)}</td>`).join('')}</tr>`;
    });
    h += `<tr><td>${icon('BRAIN')}Brain</td><td colspan="3">4: ${fmt(C.scatterPay[4] * b)} · 5: ${fmt(C.scatterPay[5] * b)} · 6+: ${fmt(C.scatterPay[6] * b)} + FREE SPINS</td></tr>`;
    h += `<tr><td>${icon('WILD')}Wild</td><td colspan="3">Substitutes for every paying symbol</td></tr>`;
    $('payTable').innerHTML = h;
    $('maxWin').textContent = C.maxWinX.toLocaleString('en-GB');
    $('meterRule').textContent = FS.meterSizes.join(' / ') + ' zombies';
    $('bossMin').textContent = C.bossDrop.minForMult;
    $('rtpRule').textContent = C.variants[C.rtpVariant].label;
    if (jp) {
      const pools = jp.getPools();
      $('jpRule').innerHTML = jp.tiers.map(t => `<b>${t.name}</b> (starts at ${fmt(t.seed)}, now ${fmt((pools.find(p => p.id === t.id) || {}).amount || t.seed)}; chance per spin at this bet ≈ 1 in ${Math.round(1 / (t.oddsPerUnit * b)).toLocaleString('en-GB')})`).join(', ') + '.';
    }
  }

  // ---------- events ----------
  $('btnSpin').addEventListener('click', () => { if (state.auto) { state.auto = false; updateHUD(); } else spin(); });
  $('btnAuto').addEventListener('click', () => { state.auto = !state.auto; updateHUD(); if (state.auto && !state.busy) spin(); });
  $('btnTurbo').addEventListener('click', () => { state.turbo = !state.turbo; updateHUD(); });
  $('btnSfx').addEventListener('click', () => { state.sound = !state.sound; if (!state.sound) heartbeatStop(); savePref(); updateHUD(); });
  $('btnMusic').addEventListener('click', () => { state.music = !state.music; savePref(); updateHUD(); unlockAudio(); if (state.music) startMusic(A.musicKey); else stopMusic(); });
  $('betDown').addEventListener('click', () => { if (!state.busy && state.betIdx > 0) { state.betIdx--; updateHUD(); } });
  $('betUp').addEventListener('click', () => { if (!state.busy && state.betIdx < C.bets.length - 1) { state.betIdx++; updateHUD(); } });
  $('btnInfo').addEventListener('click', () => { buildPaytable(); $('ovInfo').classList.remove('hidden'); });
  $('infoClose').addEventListener('click', () => $('ovInfo').classList.add('hidden'));
  $('ovInfo').addEventListener('click', e => { if (e.target.id === 'ovInfo') $('ovInfo').classList.add('hidden'); });
  $('btnReset').addEventListener('click', () => { if (state.busy) return; state.balance = C.startBalance; updateHUD(); $('ovInfo').classList.add('hidden'); msg('Demo credits reset to ' + fmt(C.startBalance)); });
  document.addEventListener('keydown', e => {
    if (e.code === 'Space') {
      e.preventDefault();
      if (!$('ovIntro').classList.contains('hidden')) $('introGo').click();
      else if (!$('ovOutro').classList.contains('hidden')) $('outroGo').click();
      else if (!$('jpScreen').classList.contains('hidden') || !$('ovGamble').classList.contains('hidden') || !$('jpScare').classList.contains('hidden')) { /* use taps in these screens */ }
      else if ($('ovInfo').classList.contains('hidden')) $('btnSpin').click();
    }
  });
  let rt; window.addEventListener('resize', () => { clearTimeout(rt); rt = setTimeout(() => { layout(); if (!state.busy) buildReels(); }, 150); });

  layout(); buildReels(); updateHUD(); drawTicker();
  // re-fit once the logo art and web font have loaded
  window.addEventListener('load', () => { layout(); if (!state.busy) buildReels(); });
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(() => { if (!state.busy) { layout(); buildReels(); } });
})();
