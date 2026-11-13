/* Zombie Horde Free Spins – UI layer (Horde Games demo). DEMO credits only, no real money. */
(function () {
  'use strict';
  const E = window.HordeEngine, C = E.CONFIG, S = C.symbols;
  const $ = id => document.getElementById(id);
  const qs = new URLSearchParams(location.search);
  const seed = qs.has('seed') ? (parseInt(qs.get('seed'), 10) >>> 0) : (Date.now() >>> 0);
  const rng = E.makeRng(seed);
  $('seedTxt').textContent = 'Seed ' + seed + '.';

  const state = { balance: C.startBalance, betIdx: C.defaultBetIndex, busy: false, auto: false, turbo: false,
                  sound: true, grid: E.drawGrid(E.makeRng(seed ^ 0x5eed), 'base'), forced: [], inFeature: false };
  const bet = () => C.bets[state.betIdx];
  const fmt = n => n.toLocaleString('en-GB', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const sleep = ms => new Promise(r => setTimeout(r, ms));

  // ---------- sound (tiny WebAudio synth) ----------
  let ac = null;
  function tone(freq, dur, type = 'square', vol = 0.05, slide = 0) {
    if (!state.sound) return;
    try {
      ac = ac || new (window.AudioContext || window.webkitAudioContext)();
      const o = ac.createOscillator(), g = ac.createGain(), t = ac.currentTime;
      o.type = type; o.frequency.setValueAtTime(freq, t);
      if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(30, freq + slide), t + dur);
      g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      o.connect(g).connect(ac.destination); o.start(t); o.stop(t + dur);
    } catch (e) { /* audio unavailable */ }
  }
  const sfx = {
    stop: () => tone(110, 0.08, 'triangle', 0.08, -40),
    brain: () => { tone(520, 0.15, 'sine', 0.08, 300); },
    win: () => { [523, 659, 784].forEach((f, i) => setTimeout(() => tone(f, 0.18, 'square', 0.04), i * 70)); },
    tick: () => tone(1200, 0.03, 'square', 0.015),
    groan: () => tone(140, 0.7, 'sawtooth', 0.06, -70),
    level: () => { [392, 523, 659, 1046].forEach((f, i) => setTimeout(() => tone(f, 0.25, 'square', 0.05), i * 90)); },
  };

  // ---------- layout ----------
  let cell = 84, gapPx = 5;
  function layout() {
    const w = Math.min(window.innerWidth, 760) - 20 - 12 - 6 - gapPx * 7;
    const reserved = window.innerHeight < 700 ? 330 : 380;
    const h = window.innerHeight - reserved - (state.inFeature ? 54 : 0) - gapPx * 5;
    cell = Math.max(44, Math.floor(Math.min(100, w / 6, h / 4)));
    gapPx = cell < 60 ? 4 : 5;
    document.documentElement.style.setProperty('--cell', cell + 'px');
    document.documentElement.style.setProperty('--gap', gapPx + 'px');
  }

  // ---------- grid rendering ----------
  const gridEl = $('grid');
  const reels = [];
  function cellHTML(sym) {
    const s = S[sym];
    return `<div class="cell k-${s.kind} s-${sym}"><span class="ic">${s.icon}</span><span class="nm">${s.kind === 'wild' ? 'WILD' : s.kind === 'scatter' ? 'SCATTER' : s.name}</span></div>`;
  }
  function buildReels() {
    gridEl.innerHTML = '';
    reels.length = 0;
    for (let r = 0; r < C.reels; r++) {
      const reel = document.createElement('div'); reel.className = 'reel';
      const strip = document.createElement('div'); strip.className = 'strip';
      reel.appendChild(strip); gridEl.appendChild(reel);
      reels.push({ reel, strip });
      renderReel(r, state.grid[r]);
    }
  }
  function renderReel(r, col) {
    const { strip } = reels[r];
    strip.style.transition = 'none'; strip.style.transform = 'translateY(0)';
    strip.innerHTML = col.map(cellHTML).join('');
  }
  const cellEl = (r, k) => reels[r].strip.children[k];
  const visualTable = Object.keys(S);
  const randSym = () => visualTable[(Math.random() * visualTable.length) | 0];

  function spinReels(grid, brainNeed) {
    clearHighlights();
    const pitch = cell + gapPx;
    const fast = state.turbo;
    const prev = state.grid;
    state.grid = grid;
    let brainsSoFar = 0, extra = 0;
    const promises = [];
    for (let r = 0; r < C.reels; r++) {
      const anticip = brainsSoFar >= brainNeed - 1 && brainNeed > 0;
      if (anticip) extra += fast ? 350 : 900;
      const filler = (fast ? 6 : 12) + r * (fast ? 2 : 4) + (anticip ? (fast ? 6 : 14) : 0);
      const syms = grid[r].slice();
      for (let i = 0; i < filler; i++) syms.push(randSym());
      syms.push(...prev[r]);
      const { strip, reel } = reels[r];
      strip.style.transition = 'none';
      strip.innerHTML = syms.map(cellHTML).join('');
      strip.style.transform = `translateY(${-(filler + 4) * pitch}px)`;
      void strip.offsetHeight;
      const dur = (fast ? 260 + r * 70 : 560 + r * 170) + extra;
      strip.style.transition = `transform ${dur}ms cubic-bezier(.35,.05,.3,1.06)`;
      strip.style.transform = 'translateY(0)';
      if (anticip) setTimeout(() => reel.classList.add('anticip'), Math.max(0, dur - (fast ? 350 : 900)));
      promises.push(new Promise(res => setTimeout(() => {
        reel.classList.remove('anticip');
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
    $('winBanner').classList.add('hidden');
  }
  function highlight(wins) {
    gridEl.classList.add('dim');
    wins.forEach(w => w.cells.forEach(([r, k]) => cellEl(r, k).classList.add('hit')));
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
    $('btnSound').textContent = state.sound ? '🔊' : '🔇';
  }
  function msg(html) { $('msg').innerHTML = html; }

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

  function winText(w, mult) {
    const s = S[w.sym];
    return `${w.count}× ${s.icon} ${w.sym === 'BRAIN' ? 'scatter' : ''} <b>${fmt(w.x * bet() * mult)}</b>`;
  }

  async function presentWin(res, amount, mult, runningFrom) {
    if (amount <= 0) return;
    highlight(res.wins);
    sfx.win();
    const parts = res.wins.map(w => winText(w, mult));
    msg(parts.join(' &nbsp;·&nbsp; ') + (mult > 1 ? ` &nbsp;(×${mult})` : ''));
    const banner = $('winBanner');
    banner.classList.remove('hidden');
    banner.textContent = 'WIN ' + fmt(amount) + (mult > 1 ? `  (×${mult})` : '');
    const x = amount / bet();
    if (x >= 25) await bigWin(amount, x);
    await countUp($('win'), runningFrom, runningFrom + amount, state.turbo ? 250 : Math.min(1400, 300 + x * 40));
    await sleep(state.turbo ? 250 : 700);
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
    return sleep(1500).then(() => t.classList.add('hidden'));
  }

  function waitClick(btnId, autoMs) {
    return new Promise(res => {
      const b = $(btnId); let done = false;
      const fin = () => { if (done) return; done = true; b.removeEventListener('click', fin); res(); };
      b.addEventListener('click', fin);
      if (autoMs) setTimeout(fin, autoMs);
    });
  }

  // ---------- free spins ----------
  function updateFsBar(st, animateTo) {
    const fs = C.freeSpins, max = fs.multipliers.length - 1;
    $('fsLeft').textContent = st.left;
    $('fsMult').textContent = '×' + st.mult;
    const m = st.level >= max ? fs.meterSize : st.meter;
    $('meterFill').style.width = (100 * Math.min(1, (animateTo != null ? animateTo : m) / fs.meterSize)) + '%';
    $('meterFill').classList.toggle('full', st.level >= max);
    $('meterTxt').textContent = st.level >= max ? 'MAX ×' + fs.multipliers[max] : `${m}/${fs.meterSize} → next ×${fs.multipliers[st.level + 1]}`;
  }

  async function runFeature(baseWin) {
    const fs = C.freeSpins, b = bet(), cap = C.maxWinX * b;
    state.inFeature = true;
    $('introSpins').textContent = fs.award;
    $('ovIntro').classList.remove('hidden');
    sfx.groan();
    await waitClick('introGo', state.auto ? 2500 : 0);
    $('ovIntro').classList.add('hidden');
    document.body.classList.add('free');
    $('fsBar').classList.remove('hidden');
    layout();
    const st = E.newFeature();
    updateFsBar(st);
    let total = 0;
    $('win').textContent = fmt(baseWin);
    msg('FREE SPINS – feed the <b>HORDE METER</b> with zombies!');
    await sleep(600);
    while (st.left > 0) {
      const before = { meter: st.meter, level: st.level };
      $('fsLeft').textContent = st.left - 1;
      const res = E.freeSpin(rng, st, state.forced.shift());
      // round win cap
      if (baseWin + total + res.winX * b >= cap) {
        const allowed = Math.max(0, cap - baseWin - total);
        res.winX = allowed / b; st.left = 0;
      }
      await spinReels(res.grid, fs.retriggerBrains);
      // zombie feed
      let fed = 0;
      res.grid.forEach((col, r) => col.forEach((s, k) => { if (S[s].kind === 'zombie') { cellEl(r, k).classList.add('zfeed'); fed++; } }));
      if (fed && before.level < fs.multipliers.length - 1) {
        if (res.levelUp) updateFsBar({ ...st, meter: fs.meterSize, level: before.level, mult: res.mult }, fs.meterSize);
        else updateFsBar(st);
        await sleep(state.turbo ? 150 : 450);
      }
      const amount = res.winX * b;
      if (amount > 0) {
        await presentWin(res, amount, res.mult, baseWin + total);
        total += amount;
        state.balance += amount; updateHUD();
      } else {
        msg(fed ? `+${fed} zombies to the horde` : 'No win');
        await sleep(state.turbo ? 150 : 350);
      }
      if (res.levelUp) {
        sfx.level();
        updateFsBar(st);
        const mEl = $('fsMult'); mEl.classList.remove('pop'); void mEl.offsetWidth; mEl.classList.add('pop');
        await toast(`HORDE UNLEASHED!<br>×${st.mult} &nbsp;+${fs.meterAward} SPINS`, '#ffd23f');
      }
      if (res.retrigger) { sfx.brain(); await toast(`+${fs.retriggerAward} FREE SPINS!`); }
      updateFsBar(st);
    }
    await sleep(500);
    clearHighlights();
    $('outroSub').textContent = `${st.played} free spins played · max multiplier ×${st.mult}`;
    $('outroWin').textContent = fmt(0);
    $('ovOutro').classList.remove('hidden');
    sfx.level();
    await countUp($('outroWin'), 0, total, Math.min(2500, 500 + total / b * 20));
    await waitClick('outroGo', state.auto ? 2500 : 0);
    $('ovOutro').classList.add('hidden');
    document.body.classList.remove('free');
    $('fsBar').classList.add('hidden');
    state.inFeature = false;
    layout();
    msg(`Feature won <b>${fmt(total)}</b> · total round win <b>${fmt(baseWin + total)}</b>`);
    return total;
  }

  // ---------- main spin ----------
  async function spin() {
    if (state.busy) return;
    if (state.balance < bet() - 1e-9) {
      state.auto = false; updateHUD();
      msg('Not enough demo credits – lower the bet or reset credits in ℹ️');
      return;
    }
    state.busy = true;
    state.balance = Math.round((state.balance - bet()) * 100) / 100;
    $('win').textContent = fmt(0);
    msg('&nbsp;');
    updateHUD();
    const res = E.baseSpin(rng, state.forced.shift());
    const b = bet();
    await spinReels(res.grid, C.freeSpins.trigger);
    const amount = Math.min(res.winX * b, C.maxWinX * b);
    if (amount > 0) {
      await presentWin(res, amount, 1, 0);
      state.balance += amount;
    } else msg(res.brains === 3 ? 'So close! 3 brains…' : 'No win – the horde keeps coming');
    updateHUD();
    if (res.trigger) {
      await sleep(400);
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
      h += `<tr><td>${s.icon}<span>${s.name}</span></td>${s.pay.map(p => `<td>${fmt(p * b)}</td>`).join('')}</tr>`;
    });
    h += `<tr><td>🧠<span>Brain</span></td><td colspan="3">4: ${fmt(C.scatterPay[4] * b)} · 5: ${fmt(C.scatterPay[5] * b)} · 6+: ${fmt(C.scatterPay[6] * b)} + FREE SPINS</td></tr>`;
    h += `<tr><td>☣️<span>Wild</span></td><td colspan="3">Substitutes for every paying symbol</td></tr>`;
    $('payTable').innerHTML = h;
    $('maxWin').textContent = C.maxWinX.toLocaleString('en-GB');
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
