/*  Zombie Horde Free Spins - game maths engine (Horde Games demo)
 *  DEMO ONLY - virtual credits, no real money.
 *  Shared by index.html (browser) and simulate.js (node). ALL tuning lives in CONFIG.
 *
 *  Rules
 *  - Grid 6 reels x 4 rows = 24 cells. Every cell is drawn independently from weighted symbols.
 *  - "Pays anywhere": 8+ of the same paying symbol anywhere on the grid wins. WILD counts as every
 *    paying symbol (a symbol needs at least 1 natural copy to pay). Pays are x TOTAL BET.
 *  - Every paying symbol is evaluated; all wins add up.
 *  - 4+ BRAIN scatters anywhere: scatter pay + 10 free spins (base game).
 *    In free spins 3+ brains = +5 spins (retrigger).
 *  - Free spins: every zombie symbol that lands (shambler/runner/hulk/boss) adds 1 to the HORDE METER.
 *    Filling the meter = +5 extra spins and steps the multiplier x1 -> x2 -> x5 -> x10 (persists for the
 *    rest of the feature). Meter then resets (up to the last level).
 *  - Total win per round (base spin + whole feature) is capped at CONFIG.maxWinX x bet.
 */
(function (root) {
  const CONFIG = {
    reels: 6, rows: 4,
    minCluster: 8,
    startBalance: 1000,
    bets: [0.2, 0.5, 1, 2, 5, 10, 20],
    defaultBetIndex: 2,
    maxWinX: 5000,
    symbols: {
      // id: display + pays by count band [8-9, 10-11, 12+] in x total bet
      AXE:      { name: 'Axe',      icon: '🪓', kind: 'low',  pay: [1, 3, 12] },
      RADIO:    { name: 'Radio',    icon: '📻', kind: 'low',  pay: [1.5, 5, 25] },
      MEDKIT:   { name: 'Medkit',   icon: '🩹', kind: 'low',  pay: [2.6, 6, 30] },
      TNT:      { name: 'Dynamite', icon: '🧨', kind: 'low',  pay: [3.6, 8, 50] },
      SHAMBLER: { name: 'Shambler', icon: '🧟', kind: 'zombie', pay: [8, 20, 60] },
      RUNNER:   { name: 'Runner',   icon: '🧟‍♀️', kind: 'zombie', pay: [12, 40, 120] },
      HULK:     { name: 'Hulk',     icon: '👹', kind: 'zombie', pay: [20, 80, 250] },
      BOSS:     { name: 'Boss',     icon: '💀', kind: 'zombie', pay: [80, 250, 800] },
      WILD:     { name: 'Wild',     icon: '☣️', kind: 'wild' },
      BRAIN:    { name: 'Brain',    icon: '🧠', kind: 'scatter' },
    },
    // Scatter pays (x bet) by brain count (4,5,6+)
    scatterPay: { 4: 3, 5: 5, 6: 100 },
    weightsBase: { AXE: 220, RADIO: 200, MEDKIT: 180, TNT: 160, SHAMBLER: 100, RUNNER: 75, HULK: 50, BOSS: 30, WILD: 7, BRAIN: 30 },
    weightsFree: { AXE: 170, RADIO: 150, MEDKIT: 130, TNT: 110, SHAMBLER: 120, RUNNER: 90, HULK: 60, BOSS: 32, WILD: 20, BRAIN: 22 },
    freeSpins: { trigger: 4, award: 10, retriggerBrains: 3, retriggerAward: 5,
                 meterSize: 58, meterAward: 5, multipliers: [1, 2, 5, 10] },
  };

  // Seedable RNG (mulberry32)
  function makeRng(seed) {
    let a = (seed >>> 0) || 1;
    const f = function () {
      a = (a + 0x6D2B79F5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
    f.seed = seed;
    return f;
  }

  function cumTable(w) {
    const ids = Object.keys(w); let s = 0; const c = [];
    for (const id of ids) { s += w[id]; c.push(s); }
    return { ids, c, total: s };
  }
  const TABLES = {};
  function table(mode) {
    const w = mode === 'free' ? CONFIG.weightsFree : CONFIG.weightsBase;
    if (!TABLES[mode] || TABLES[mode].src !== w) { TABLES[mode] = cumTable(w); TABLES[mode].src = w; }
    return TABLES[mode];
  }
  function drawSymbol(rng, t) {
    const r = rng() * t.total;
    for (let i = 0; i < t.c.length; i++) if (r < t.c[i]) return t.ids[i];
    return t.ids[t.ids.length - 1];
  }
  // grid[reel][row]
  function drawGrid(rng, mode) {
    const t = table(mode), g = [];
    for (let r = 0; r < CONFIG.reels; r++) { const col = []; for (let k = 0; k < CONFIG.rows; k++) col.push(drawSymbol(rng, t)); g.push(col); }
    return g;
  }
  function band(n) { return n >= 12 ? 2 : n >= 10 ? 1 : 0; }

  // Evaluate a grid. Returns wins (x bet, before multiplier), brains, zombies landed.
  function evaluate(grid) {
    const counts = {}, cells = {};
    let wilds = [], brains = [], zombies = 0;
    grid.forEach((col, r) => col.forEach((s, k) => {
      if (s === 'WILD') wilds.push([r, k]);
      else if (s === 'BRAIN') brains.push([r, k]);
      else { counts[s] = (counts[s] || 0) + 1; (cells[s] = cells[s] || []).push([r, k]); if (CONFIG.symbols[s].kind === 'zombie') zombies++; }
    }));
    const wins = []; let totalX = 0;
    for (const s in counts) {
      const n = counts[s] + wilds.length;
      if (n >= CONFIG.minCluster) {
        const x = CONFIG.symbols[s].pay[band(n)];
        wins.push({ sym: s, count: n, x, cells: cells[s].concat(wilds) });
        totalX += x;
      }
    }
    let scatterX = 0;
    if (brains.length >= 4) {
      scatterX = CONFIG.scatterPay[Math.min(6, brains.length)];
      wins.push({ sym: 'BRAIN', count: brains.length, x: scatterX, cells: brains });
      totalX += scatterX;
    }
    return { wins, totalX, brains: brains.length, brainCells: brains, zombies };
  }

  // One base-game spin. Returns result; result.trigger => start free spins.
  // forcedGrid (optional) is for testing/demo only.
  function baseSpin(rng, forcedGrid) {
    const grid = forcedGrid || drawGrid(rng, 'base');
    const ev = evaluate(grid);
    return Object.assign({ grid, mode: 'base', winX: ev.totalX, trigger: ev.brains >= CONFIG.freeSpins.trigger }, ev);
  }

  function newFeature() {
    return { left: CONFIG.freeSpins.award, played: 0, meter: 0, level: 0, mult: CONFIG.freeSpins.multipliers[0], totalX: 0 };
  }

  // One free spin. Mutates state. Win uses the multiplier active at the START of the spin;
  // meter fill applies from the next spin.
  function freeSpin(rng, st, forcedGrid) {
    const fs = CONFIG.freeSpins;
    const grid = forcedGrid || drawGrid(rng, 'free');
    const ev = evaluate(grid);
    st.left--; st.played++;
    const mult = st.mult;
    const winX = ev.totalX * mult;
    st.totalX += winX;
    let extra = 0, levelUp = false, retrigger = false;
    if (ev.brains >= fs.retriggerBrains) { st.left += fs.retriggerAward; extra += fs.retriggerAward; retrigger = true; }
    const maxLevel = fs.multipliers.length - 1;
    if (st.level < maxLevel) {
      st.meter += ev.zombies;
      if (st.meter >= fs.meterSize) {
        st.level++; st.mult = fs.multipliers[st.level];
        st.left += fs.meterAward; extra += fs.meterAward; levelUp = true;
        st.meter = st.level < maxLevel ? st.meter - fs.meterSize : fs.meterSize;
      }
    }
    return Object.assign({ grid, mode: 'free', mult, winX, extra, levelUp, retrigger, done: st.left <= 0 }, ev);
  }

  const api = { CONFIG, makeRng, drawGrid, evaluate, baseSpin, newFeature, freeSpin };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.HordeEngine = api;
})(typeof window !== 'undefined' ? window : globalThis);
