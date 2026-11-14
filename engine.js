/*  Zombie Horde Free Spins - game maths engine v5 (HIGH volatility: ~94.5% RTP, ~19% hit rate, bonus-driven) (Horde Games demo)
 *  DEMO ONLY - virtual credits, no real money.
 *  Shared by index.html (browser) and simulate.js (node). ALL tuning lives in CONFIG.
 *
 *  Rules
 *  - Grid 6 reels x 4 rows = 24 cells, each drawn independently from weighted symbols.
 *  - Pays anywhere: 8+ of the same paying symbol anywhere wins. WILD counts as every paying symbol
 *    (a symbol needs at least 1 natural copy). Pays are x TOTAL BET, by count band 8-9 / 10-11 / 12+.
 *  - CASCADES (tumbles): all winning symbols (and wilds used) explode, the rest drop down, new
 *    symbols fall in from the top. Repeats while there are wins. All cascade wins add up.
 *  - BRAIN scatters never explode. Counted on the final grid of the cascade chain:
 *    4+ = scatter pay + 10 free spins (base). In free spins 3+ = +5 spins.
 *  - Free spins: every zombie symbol that lands (first drop AND cascade refills) adds 1 to the
 *    HORDE METER. Each fill = +5 spins and the multiplier steps x1 -> x2 -> x5 -> x10. Each step
 *    needs a bigger meter (meterSizes). The multiplier applies to every cascade win and persists.
 *  - BOSS DROP: after the last free spin the boss drops either an extra multiplier on the whole
 *    feature win, or a flat boss prize (always a prize if the feature won < bossMinForMult x bet).
 *  - Total round win (base spin + whole feature) is capped at CONFIG.maxWinX x bet.
 */
(function (root) {
  const CONFIG = {
    reels: 6, rows: 4,
    minCluster: 8,
    maxCascades: 40,
    startBalance: 1000,
    bets: [0.1, 0.2, 0.5, 1, 2, 5],               // stake ladder; min 0.10 / max 5.00 (UK online slot stake limits)
    defaultBetIndex: 3,
    maxWinX: 10000,
    bigWinX: 25,                                 // presentation only: big-win screen from 25x bet
    symbols: {
      // pays by count band [8-9, 10-11, 12+] in x total bet
      AXE:      { name: 'Axe',      kind: 'low',    pay: [1, 1.5, 5] },
      RADIO:    { name: 'Radio',    kind: 'low',    pay: [1, 2, 5] },
      MEDKIT:   { name: 'Medkit',   kind: 'low',    pay: [1, 2, 6] },
      TNT:      { name: 'Dynamite', kind: 'low',    pay: [1, 2.5, 8] },
      SHAMBLER: { name: 'Shambler', kind: 'zombie', pay: [8, 50, 200] },
      RUNNER:   { name: 'Runner',   kind: 'zombie', pay: [16, 100, 400] },
      HULK:     { name: 'Hulk',     kind: 'zombie', pay: [30, 250, 1200] },
      BOSS:     { name: 'Boss',     kind: 'zombie', pay: [80, 700, 4000] },
      WILD:     { name: 'Wild',     kind: 'wild' },
      BRAIN:    { name: 'Brain',    kind: 'scatter' },
    },
    scatterPay: { 4: 2, 5: 8, 6: 100 },          // x bet by brains on final grid (6 = 6+)
    weightsBase: { AXE: 160, RADIO: 160, MEDKIT: 160, TNT: 160, SHAMBLER: 104, RUNNER: 80, HULK: 52, BOSS: 26, WILD: 3, BRAIN: 23 },
    weightsFree: { AXE: 165, RADIO: 145, MEDKIT: 125, TNT: 105, SHAMBLER: 120, RUNNER: 85, HULK: 58, BOSS: 30, WILD: 24, BRAIN: 20 },
    freeSpins: {
      trigger: 4, award: 10, retriggerBrains: 3, retriggerAward: 5,
      meterSizes: [46, 92, 105],                  // zombies needed for x2, x5, x10
      meterAward: 5, multipliers: [1, 2, 5, 10],
    },
    // RTP variants (operator-selectable). Totals INCLUDE the 2.0% Horde network jackpot contribution
    // (horde-jackpot/jackpot.js), i.e. game maths 94/92/90% + jackpot 2%. Only the free-spins WILD weight
    // differs, so hit rate, bonus frequency and volatility class are the same. Default demo = 96%.
    jackpotRtp: 0.02,
    rtpVariant: '96',
    variants: {
      '96': { label: '96.0% (game 94.0% + jackpot 2.0%)', weightsFree: { WILD: 26.2 } },
      '94': { label: '94.0% (game 92.0% + jackpot 2.0%)', weightsFree: { WILD: 25.25 } },
      '92': { label: '92.0% (game 90.0% + jackpot 2.0%)', weightsFree: { WILD: 24.4 } },
    },
    // Post-bonus "Pick a Zombie" gamble: RTP-neutral (EV per pick = 0.2*2 + 0.4*1 + 0.4*0.5 = 1.00).
    // Outcome is drawn here from the seeded RNG, never by the UI. Odds are disclosed in the rules.
    gamble: {
      maxPicks: 3,
      outcomes: [ { mult: 2, w: 20 }, { mult: 1, w: 40 }, { mult: 0.5, w: 40 } ],
    },
    bossDrop: {
      minForMult: 10,                             // feature win (x bet) below this always gets a prize
      table: [                                    // weighted outcomes
        { type: 'mult',  value: 2,   w: 18 },
        { type: 'mult',  value: 3,   w: 12 },
        { type: 'mult',  value: 5,   w: 8 },
        { type: 'mult',  value: 10,  w: 4 },
        { type: 'prize', value: 5,   w: 40 },
        { type: 'prize', value: 10,  w: 15 },
        { type: 'prize', value: 25,  w: 5 },
        { type: 'prize', value: 100, w: 1 },
      ],
    },
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

  const TABLES = {};
  function table(mode) {
    const w = mode === 'free' ? CONFIG.weightsFree : CONFIG.weightsBase;
    if (!TABLES[mode] || TABLES[mode].src !== w) {
      const ids = Object.keys(w); let s = 0; const c = [];
      for (const id of ids) { s += w[id]; c.push(s); }
      TABLES[mode] = { ids, c, total: s, src: w };
    }
    return TABLES[mode];
  }
  function drawSymbol(rng, mode) {
    const t = table(mode), r = rng() * t.total;
    for (let i = 0; i < t.c.length; i++) if (r < t.c[i]) return t.ids[i];
    return t.ids[t.ids.length - 1];
  }
  // grid[reel][row], row 0 = top
  function drawGrid(rng, mode) {
    const g = [];
    for (let r = 0; r < CONFIG.reels; r++) { const col = []; for (let k = 0; k < CONFIG.rows; k++) col.push(drawSymbol(rng, mode)); g.push(col); }
    return g;
  }
  const band = n => (n >= 12 ? 2 : n >= 10 ? 1 : 0);
  const isZombie = s => CONFIG.symbols[s].kind === 'zombie';

  // Cluster wins on one grid (no scatter).
  function clusterWins(grid) {
    const counts = {}, cells = {}, wilds = [];
    grid.forEach((col, r) => col.forEach((s, k) => {
      if (s === 'WILD') wilds.push([r, k]);
      else if (s !== 'BRAIN') { counts[s] = (counts[s] || 0) + 1; (cells[s] = cells[s] || []).push([r, k]); }
    }));
    const wins = []; let x = 0;
    for (const s in counts) {
      const n = counts[s] + wilds.length;
      if (n >= CONFIG.minCluster) {
        const p = CONFIG.symbols[s].pay[band(n)];
        wins.push({ sym: s, count: n, x: p, cells: cells[s].concat(wilds) });
        x += p;
      }
    }
    return { wins, x };
  }

  // Full spin with cascades. Returns
  // { grid (first drop), steps:[{grid, wins, x, remove, next, newCells}], finalGrid,
  //   cascadeX, scatterX, winX (x bet, before multiplier), brains, brainCells, zombies }
  function playSpin(rng, mode, forcedGrid) {
    let grid = forcedGrid ? forcedGrid.map(c => c.slice()) : drawGrid(rng, mode);
    const first = grid;
    let zombies = 0;
    grid.forEach(col => col.forEach(s => { if (isZombie(s)) zombies++; }));
    const steps = []; let cascadeX = 0;
    for (let i = 0; i < CONFIG.maxCascades; i++) {
      const cw = clusterWins(grid);
      if (!cw.wins.length) break;
      cascadeX += cw.x;
      const rm = grid.map(col => col.map(() => false));
      cw.wins.forEach(w => w.cells.forEach(([r, k]) => { rm[r][k] = true; }));
      const remove = [], next = [], newCells = [];
      for (let r = 0; r < CONFIG.reels; r++) {
        const keep = [];
        for (let k = 0; k < CONFIG.rows; k++) { if (rm[r][k]) remove.push([r, k]); else keep.push(k); }
        const n = CONFIG.rows - keep.length, col = [];
        for (let j = 0; j < n; j++) { const s = drawSymbol(rng, mode); col.push(s); newCells.push([r, j]); if (isZombie(s)) zombies++; }
        keep.forEach(k => col.push(grid[r][k]));
        next.push(col);
      }
      steps.push({ grid, wins: cw.wins, x: cw.x, remove, next, newCells });
      grid = next;
    }
    const brainCells = [];
    grid.forEach((col, r) => col.forEach((s, k) => { if (s === 'BRAIN') brainCells.push([r, k]); }));
    const brains = brainCells.length;
    const scatterX = brains >= 4 ? CONFIG.scatterPay[Math.min(6, brains)] : 0;
    return { grid: first, steps, finalGrid: grid, cascadeX, scatterX, winX: cascadeX + scatterX, brains, brainCells, zombies };
  }

  function baseSpin(rng, forcedGrid) {
    const res = playSpin(rng, 'base', forcedGrid);
    res.mode = 'base';
    res.trigger = res.brains >= CONFIG.freeSpins.trigger;
    return res;
  }

  function newFeature() {
    return { left: CONFIG.freeSpins.award, played: 0, meter: 0, level: 0, mult: 1, totalX: 0, boss: null };
  }
  const meterSize = st => CONFIG.freeSpins.meterSizes[Math.min(st.level, CONFIG.freeSpins.meterSizes.length - 1)];
  const maxLevel = () => CONFIG.freeSpins.multipliers.length - 1;

  // One free spin (with cascades). Mutates st. Win uses the multiplier active at the start of the
  // spin; meter level-ups apply from the next spin. On the last spin the boss drop is resolved.
  function freeSpin(rng, st, forcedGrid, forcedBoss) {
    const fs = CONFIG.freeSpins;
    const res = playSpin(rng, 'free', forcedGrid);
    res.mode = 'free';
    st.left--; st.played++;
    res.mult = st.mult;
    res.spinX = res.winX * st.mult;
    st.totalX += res.spinX;
    res.extra = 0; res.levelUp = false; res.retrigger = false;
    res.meterBefore = st.meter; res.levelBefore = st.level;
    if (res.brains >= fs.retriggerBrains) { st.left += fs.retriggerAward; res.extra += fs.retriggerAward; res.retrigger = true; }
    if (st.level < maxLevel()) {
      st.meter += res.zombies;
      const need = meterSize(st);
      if (st.meter >= need) {
        st.meter -= need; st.level++; st.mult = fs.multipliers[st.level];
        st.left += fs.meterAward; res.extra += fs.meterAward; res.levelUp = true;
        if (st.level >= maxLevel()) st.meter = 0;
      }
    }
    res.done = st.left <= 0;
    if (res.done) st.boss = res.boss = bossDrop(rng, st, forcedBoss);
    return res;
  }

  function bossDrop(rng, st, forced) {
    const bd = CONFIG.bossDrop;
    let opts = bd.table;
    if (st.totalX < bd.minForMult) opts = opts.filter(o => o.type === 'prize');
    let pick = forced;
    if (!pick) {
      const tot = opts.reduce((a, o) => a + o.w, 0); let r = rng() * tot;
      pick = opts[opts.length - 1];
      for (const o of opts) { if ((r -= o.w) < 0) { pick = o; break; } }
    }
    const before = st.totalX;
    const addX = pick.type === 'mult' ? before * (pick.value - 1) : pick.value;
    st.totalX += addX;
    return { type: pick.type, value: pick.value, addX, before };
  }

  // RTP variant switch (rebuilds the free-spins reel weights)
  const FREE_BASE = Object.assign({}, CONFIG.weightsFree);
  function setVariant(v) {
    const vv = CONFIG.variants[v]; if (!vv) return false;
    CONFIG.weightsFree = Object.assign({}, FREE_BASE, vv.weightsFree || {});
    CONFIG.rtpVariant = v; return true;
  }
  setVariant(CONFIG.rtpVariant);

  // One gamble pick. pick = door index chosen by the player (0-2). The multiplier is drawn from the
  // weighted outcome table with the seeded RNG; the other two doors show the remaining outcomes.
  function gamblePick(rng, pick) {
    const o = CONFIG.gamble.outcomes, tot = o.reduce((a, x) => a + x.w, 0);
    let r = rng() * tot, idx = o.length - 1;
    for (let i = 0; i < o.length; i++) { if ((r -= o[i].w) < 0) { idx = i; break; } }
    const rest = o.filter((_, i) => i !== idx).map(x => x.mult);
    if (rng() < 0.5) rest.reverse();
    const reveal = []; let j = 0;
    for (let d = 0; d < 3; d++) reveal.push(d === pick ? o[idx].mult : rest[j++]);
    return { mult: o[idx].mult, reveal };
  }

  // Gamble result in credits: amount x mult, rounded down to the cent, never above the room left
  // under the round's max-win cap (so the cap applies after the gamble).
  function gambleApply(amount, mult, room) { return Math.max(0, Math.min(room, Math.floor(amount * mult * 100 + 1e-6) / 100)); }

  const api = { CONFIG, makeRng, drawGrid, clusterWins, playSpin, baseSpin, newFeature, freeSpin, meterSize, setVariant, gamblePick, gambleApply };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.HordeEngine = api;
})(typeof window !== 'undefined' ? window : globalThis);
