/* Zombie Horde Free Spins – UI layer v2 (Horde Games demo). DEMO credits only, no real money. */
(function () {
  'use strict';
  const E = window.HordeEngine, C = E.CONFIG, S = C.symbols, FS = C.freeSpins;
  const $ = id => document.getElementById(id);
  const qs = new URLSearchParams(location.search);
  const seed = qs.has('seed') ? (parseInt(qs.get('seed'), 10) >>> 0) : (Date.now() >>> 0);
  const rng = E.makeRng(seed);
  $('seedTxt').textContent = 'Seed ' + seed + '.';

  const IMG = id => `assets/sym/${id}.svg`;
  Object.keys(S).forEach(id => { const i = new Image(); i.src = IMG(id); });

  const state = { balance: C.startBalance, betIdx: C.defaultBetIndex, busy: false, auto: false, turbo: false,
                  sound: true, grid: E.drawGrid(E.makeRng(seed ^ 0x5eed), 'base'), forced: [], forcedBoss: null, inFeature: false };
  const bet = () => C.bets[state.betIdx];
  const fmt = n => n.toLocaleString('en-GB', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  const T = ms => (state.turbo ? Math.round(ms * 0.45) : ms);

  // ---------- sound (tiny WebAudio synth) ----------
  let ac = null;
  function tone(freq, dur, type = 'square', vol = 0.05, slide = 0, delay = 0) {
    if (!state.sound) return;
    try {
      ac = ac || new (window.AudioContext || window.webkitAudioContext)();
      const o = ac.createOscillator(), g = ac.createGain(), t = ac.currentTime + delay;
      o.type = type; o.frequency.setValueAtTime(freq, t);
      if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(30, freq + slide), t + dur);
      g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      o.connect(g).connect(ac.destination); o.start(t); o.stop(t + dur + 0.02);
    } catch (e) { /* audio unavailable */ }
  }
  function noise(dur, vol = 0.08) {
    if (!state.sound) return;
    try {
      ac = ac || new (window.AudioContext || window.webkitAudioContext)();
      const n = Math.floor(ac.sampleRate * dur), buf = ac.createBuffer(1, n, ac.sampleRate), d = buf.getChannelData(0);
      for (let i = 0; i < n; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / n, 2);
      const s = ac.createBufferSource(), g = ac.createGain(); g.gain.value = vol;
      s.buffer = buf; s.connect(g).connect(ac.destination); s.start();
    } catch (e) { /* audio unavailable */ }
  }
  const sfx = {
    stop: () => tone(110, 0.08, 'triangle', 0.08, -40),
    brain: () => tone(520, 0.15, 'sine', 0.08, 300),
    win: n => [523, 659, 784].forEach((f, i) => tone(f * Math.pow(1.06, n || 0), 0.18, 'square', 0.04, 0, i * 0.07)),
    boom: () => { noise(0.35, 0.12); tone(90, 0.3, 'sawtooth', 0.05, -50); },
    drop: () => tone(240, 0.06, 'triangle', 0.04, -120),
    tick: () => tone(1200, 0.03, 'square', 0.015),
    gulp: () => tone(300 + Math.random() * 200, 0.06, 'square', 0.02, -150),
    groan: () => tone(140, 0.7, 'sawtooth', 0.06, -70),
    level: () => [392, 523, 659, 1046].forEach((f, i) => tone(f, 0.25, 'square', 0.05, 0, i * 0.09)),
    roar: () => { noise(0.9, 0.15); tone(80, 0.9, 'sawtooth', 0.09, -40); },
  };

  // ---------- layout ----------
  let cell = 84, gapPx = 5;
  const pitch = () => cell + gapPx;
  function layout() {
    gapPx = window.innerWidth < 420 ? 4 : 5;
    const w = Math.min(window.innerWidth, 760) - 20 - 20 - gapPx * 7;
    const reserved = window.innerHeight < 700 ? 340 : 390;
    const h = window.innerHeight - reserved - (state.inFeature ? 70 : 0) - gapPx * 5;
    cell = Math.max(44, Math.floor(Math.min(104, w / 6, h / 4)));
    document.documentElement.style.setProperty('--cell', cell + 'px');
    document.documentElement.style.setProperty('--gap', gapPx + 'px');
  }

  // ---------- grid rendering ----------
  const gridEl = $('grid');
  const reels = [];          // {reel, strip, cells:[el x4]}
  function makeCell(sym) {
    const d = document.createElement('div');
    d.className = 'cell s-' + sym + ' k-' + S[sym].kind;
    d.dataset.sym = sym;
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
      if (anticip) setTimeout(() => R.reel.classList.add('anticip'), Math.max(0, dur - (fast ? 350 : 900)));
      promises.push(new Promise(res => setTimeout(() => {
        R.reel.classList.remove('anticip');
        renderReel(r, grid[r]);
        sfx.stop();
        grid[r].forEach((s, k) => { if (s === 'BRAIN') { cellEl(r, k).classList.add('brainland'); sfx.brain(); } });
        res();
      }, dur + 30)));
      brainsSoFar += grid[r].filter(s => s === 'BRAIN').length;
    }
    return Promise.all(promises);
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
  function burst(el, color) {
    const fx = $('fx'), fr = fx.getBoundingClientRect(), r = el.getBoundingClientRect();
    const cx = r.left - fr.left + r.width / 2, cy = r.top - fr.top + r.height / 2;
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
    $('btnSound').classList.toggle('off', !state.sound);
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
    sfx.level();
    await countUp($('bigAmt'), 0, amount, state.turbo ? 900 : 2600);
    await sleep(1100);
    ov.classList.add('hidden');
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
  function shake() {
    const a = $('app'); a.classList.remove('shake'); void a.offsetWidth; a.classList.add('shake');
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
        f.remove(); meter.shown++; drawMeter(); sfx.gulp();
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
    let shown = 0, idx = 0;
    if (state.inFeature) {
      const z = []; res.grid.forEach((col, r) => col.forEach((s, k) => { if (S[s].kind === 'zombie') z.push([r, k]); }));
      await flyZombies(z);
    }
    for (const st of res.steps) {
      idx++;
      // 1) highlight + count
      const hitCells = []; st.wins.forEach(w => hitCells.push(...w.cells));
      highlight(hitCells);
      sfx.win(idx - 1);
      const amt = st.x * b * mult;
      msg(st.wins.map(w => `${w.count}× ${icon(w.sym)} <b>${fmt(w.x * b * mult)}</b>`).join(' &nbsp;·&nbsp; ') + (mult > 1 ? ` &nbsp;(×${mult})` : '') + (idx > 1 ? ` &nbsp;· cascade ${idx}` : ''));
      banner(idx > 1 ? `${label} ×${idx}` : label, shown + amt);
      await countUp($('win'), runFrom + shown, runFrom + shown + amt, T(Math.min(1000, 280 + st.x * 30)));
      shown += amt;
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
      await sleep(T(600));
    }
    return shown;
  }

  // ---------- free spins ----------
  async function runFeature(baseWin) {
    const b = bet(), cap = C.maxWinX * b;
    $('introSpins').textContent = FS.award;
    $('ovIntro').classList.remove('hidden');
    sfx.groan();
    await waitClick('introGo', state.auto ? 2500 : 0);
    $('ovIntro').classList.add('hidden');
    state.inFeature = true;
    document.body.classList.add('free');
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
        if (shown / b >= 25) await bigWin(shown, shown / b);
        await sleep(T(250));
      } else {
        msg(res.zombies ? `+${res.zombies} zombies joined the horde` : 'No win');
        await sleep(T(300));
      }
      $('winBanner').classList.add('hidden');
      if (res.levelUp) {
        meter.level = st.level; meter.shown = st.meter; drawMeter();
        sfx.roar(); shake();
        $('unleashTxt').textContent = `×${st.mult} · +${FS.meterAward} SPINS`;
        $('unleash').classList.remove('hidden');
        const mEl = $('fsMult'); mEl.textContent = '×' + st.mult; mEl.classList.remove('pop'); void mEl.offsetWidth; mEl.classList.add('pop');
        await sleep(T(1700));
        $('unleash').classList.add('hidden');
      } else { meter.shown = st.level >= FS.multipliers.length - 1 ? meter.shown : st.meter; drawMeter(); }
      if (res.retrigger) { sfx.brain(); await toast(`+${FS.retriggerAward} FREE SPINS!`); }
      $('fsLeft').textContent = st.left;
      // boss drop on the last spin
      if (st.left <= 0 && res.boss) total = await bossScene(res.boss, total, baseWin, cap);
    }
    await sleep(400);
    clearHighlights();
    $('outroSub').textContent = `${st.played} free spins · top multiplier ×${st.mult}` + (st.boss ? ` · boss ${st.boss.type === 'mult' ? '×' + st.boss.value : 'prize ' + st.boss.value + '×'}` : '');
    $('outroWin').textContent = fmt(0);
    $('ovOutro').classList.remove('hidden');
    sfx.level();
    await countUp($('outroWin'), 0, total, Math.min(2500, 500 + total / b * 15));
    await waitClick('outroGo', state.auto ? 2500 : 0);
    $('ovOutro').classList.add('hidden');
    document.body.classList.remove('free');
    $('fsBar').classList.add('hidden');
    state.inFeature = false;
    layout(); buildReels();
    $('win').textContent = fmt(baseWin + total);
    msg(`Feature won <b>${fmt(total)}</b> · round win <b>${fmt(baseWin + total)}</b>`);
    if ((baseWin + total) / b >= 25) await bigWin(baseWin + total, (baseWin + total) / b);
    return total;
  }
  function res0Boss() { const f = state.forcedBoss; return f || undefined; }

  async function bossScene(boss, total, baseWin, cap) {
    const b = bet();
    const ov = $('ovBoss'), img = $('bossImg'), drop = $('bossDrop');
    drop.classList.add('hidden');
    $('bossTitle').textContent = 'THE BOSS ARRIVES…';
    img.classList.remove('roar');
    ov.classList.remove('hidden');
    sfx.roar();
    await sleep(T(900)); shake();
    img.classList.add('roar');
    await sleep(T(700));
    let add = boss.type === 'mult' ? total * (boss.value - 1) : boss.value * b;
    if (baseWin + total + add > cap) add = Math.max(0, cap - baseWin - total);
    $('bossTitle').textContent = boss.type === 'mult' ? 'BOSS MULTIPLIER!' : 'BOSS PRIZE!';
    $('bossDropTxt').textContent = boss.type === 'mult' ? `×${boss.value} FEATURE WIN` : `${boss.value}× BET`;
    $('bossDropAmt').textContent = boss.type === 'mult' ? `${fmt(total)} → ${fmt(total + add)}` : `+${fmt(add)}`;
    drop.classList.remove('hidden');
    sfx.level();
    await sleep(T(400));
    if (add > 0) { await countUp($('win'), baseWin + total, baseWin + total + add, T(1000)); state.balance += add; updateHUD(); }
    await sleep(T(1500));
    ov.classList.add('hidden');
    return total + add;
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
    await spinReels(res.grid, FS.trigger);
    let amount = await playCascades(res, 1, 0, 'WIN');
    amount = Math.min(amount, C.maxWinX * b);
    if (amount > 0) {
      state.balance += amount;
      if (amount / b >= 25 && !res.trigger) await bigWin(amount, amount / b);
      if (!res.trigger) msg(`Round win <b>${fmt(amount)}</b>` + (res.steps.length > 1 ? ` · ${res.steps.length} cascades` : ''));
    } else msg(res.brains === 3 ? `So close! 3 ${icon('BRAIN')}…` : 'No win – the horde keeps coming');
    updateHUD();
    if (res.trigger) {
      highlight(res.brainCells);
      await sleep(700);
      await runFeature(amount);
    }
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
  }

  // ---------- events ----------
  $('btnSpin').addEventListener('click', () => { if (state.auto) { state.auto = false; updateHUD(); } else spin(); });
  $('btnAuto').addEventListener('click', () => { state.auto = !state.auto; updateHUD(); if (state.auto && !state.busy) spin(); });
  $('btnTurbo').addEventListener('click', () => { state.turbo = !state.turbo; updateHUD(); });
  $('btnSound').addEventListener('click', () => { state.sound = !state.sound; updateHUD(); });
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
      else if ($('ovInfo').classList.contains('hidden')) $('btnSpin').click();
    }
  });
  let rt; window.addEventListener('resize', () => { clearTimeout(rt); rt = setTimeout(() => { layout(); if (!state.busy) buildReels(); }, 150); });

  layout(); buildReels(); updateHUD();
})();
