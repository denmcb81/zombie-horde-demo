/*  Horde Games network jackpot – client module (game-agnostic).  DEMO ONLY – virtual credits, no real money.
 *
 *  Any Horde Games slot imports this file and creates a client with its own gameId:
 *      const jp = HordeJackpot.create({ gameId: 'zombie-horde' });
 *      jp.contribute(stake);                 // every paid spin
 *      const win = jp.checkWin(stake, rng);  // null or { tier, name, amount, tierIndex, pick:{order,rest} } – once per paid spin
 *      jp.getPools();                        // [{ id, name, amount, seed }, ...] for the ticker
 *      jp.on('award', e => ...); jp.on('update', pools => ...);
 *
 *  Mechanic: four progressive tiers (MINI / MINOR / MAJOR / GRAND). Every paid spin contributes a fixed
 *  % of stake to each pool and can trigger any tier with probability = stake x oddsPerUnit (fair per
 *  stake: double the stake, double the chance, same return per unit staked). Long-run jackpot RTP per
 *  tier = oddsPerUnit x seed + incrementRate (seeds are funded from the seed reserve part of the
 *  contribution, so the whole contribution comes back to players).
 *
 *  Backend: in the demo the "network" (other players on other Horde Games titles) is simulated locally
 *  and persisted in localStorage. In production replace LocalNetwork with a transport that calls the
 *  central pool service (same method names; see JACKPOT_SPEC.md). Outcome decisions then move server-side.
 */
(function (root) {
  'use strict';
  const DEFAULT_TIERS = [
    //  id       name     seed    increment  seed reserve  odds per 1.00 staked
    { id: 'mini',  name: 'MINI',  seed: 10,    inc: 0.0020, reserve: 0.0050, oddsPerUnit: 1 / 2000 },
    { id: 'minor', name: 'MINOR', seed: 50,    inc: 0.0025, reserve: 0.0025, oddsPerUnit: 1 / 20000 },
    { id: 'major', name: 'MAJOR', seed: 500,   inc: 0.0020, reserve: 0.0020, oddsPerUnit: 1 / 250000 },
    { id: 'grand', name: 'GRAND', seed: 10000, inc: 0.0020, reserve: 0.0020, oddsPerUnit: 1 / 5000000 },
  ];
  // Expected long-run return of the jackpot layer per unit staked (= total contribution rate).
  const jackpotRtp = tiers => tiers.reduce((a, t) => a + t.inc + t.oddsPerUnit * t.seed, 0);

  function mulberry(seed) { let a = seed >>> 0 || 1; return () => { a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }

  // ---- Pick-game presentation (Playtech-style "match 3") ----
  // Board of 3 x tiers symbols (12 for 4 tiers), 3 of each tier. order[k] = tier revealed by the
  // player's k-th pick: the won tier is the first to reach 3 (on the last pick), every other tier shows
  // 0-2 times before that. rest = what the unpicked spots show afterwards ("what you could have won").
  // Purely cosmetic - the tier was already decided by checkWin.
  function pickBoard(win, rng, n) {
    n = n || 4;
    const order = [], counts = [];
    for (let t = 0; t < n; t++) {
      const c = t === win ? 2 : Math.min(2, Math.floor(rng() * 3.2));  // teases: 0..2 of each other tier
      counts.push(c); for (let k = 0; k < c; k++) order.push(t);
    }
    for (let i = order.length - 1; i > 0; i--) { const j = Math.floor(rng() * (i + 1)); const x = order[i]; order[i] = order[j]; order[j] = x; }
    order.push(win);                                   // the 3rd match lands on the final pick
    counts[win] = 3;
    const rest = [];
    for (let t = 0; t < n; t++) for (let k = counts[t]; k < 3; k++) rest.push(t);
    for (let i = rest.length - 1; i > 0; i--) { const j = Math.floor(rng() * (i + 1)); const x = rest[i]; rest[i] = rest[j]; rest[j] = x; }
    return { order, rest, size: 3 * n };
  }

  // ---- Local simulated network (demo backend) ----
  // Simulates other players' stake volume across the studio network so the tickers move realistically,
  // including other players winning tiers. Persisted so pools carry across page loads.
  function LocalNetwork(opts) {
    const key = opts.storageKey || 'hordeJackpotNet';
    const tiers = opts.tiers;
    const volume = opts.networkStakePerSec == null ? 25 : opts.networkStakePerSec; // simulated network turnover / s
    const rng = mulberry((Date.now() ^ 0x9e3779b9) >>> 0);
    const store = (() => { try { return root.localStorage; } catch (e) { return null; } })();
    let st = null;
    try { st = store && JSON.parse(store.getItem(key) || 'null'); } catch (e) { st = null; }
    if (!st || !st.pools || st.v !== 1) {
      // start each pool somewhere along its typical life so the first view looks "live"
      st = { v: 1, t: Date.now(), pools: {}, log: [] };
      tiers.forEach(t => { st.pools[t.id] = t.seed + t.inc * (rng() * 0.8 / t.oddsPerUnit); });
    }
    const save = () => { try { store && store.setItem(key, JSON.stringify(st)); } catch (e) { /* private mode */ } };
    const listeners = { award: [], update: [] };
    const emit = (ev, d) => listeners[ev].forEach(f => { try { f(d); } catch (e) { /* listener error */ } });
    const pools = () => tiers.map(t => ({ id: t.id, name: t.name, seed: t.seed, amount: Math.round(st.pools[t.id] * 100) / 100 }));
    function award(t, by, gameId) {
      const amount = Math.round(st.pools[t.id] * 100) / 100;
      st.pools[t.id] = t.seed;
      const e = { tier: t.id, name: t.name, amount, by, gameId, at: Date.now() };
      st.log.unshift(e); st.log.length = Math.min(st.log.length, 20);
      save(); emit('award', e);
      return e;
    }
    // simulated network play for dt seconds (other players)
    function simulate(dt) {
      dt = Math.min(dt, 6 * 3600);              // cap catch-up after long absences
      const stake = volume * dt;
      tiers.forEach(t => {
        st.pools[t.id] += stake * t.inc;
        // P(at least one network win in this slice) = 1 - exp(-stake * odds)
        if (rng() < 1 - Math.exp(-stake * t.oddsPerUnit)) {
          const games = ['Zombie Horde', 'another Horde Games slot'];
          award(t, 'network', games[(rng() * games.length) | 0]);
        }
      });
    }
    simulate((Date.now() - st.t) / 1000); st.t = Date.now(); save();
    let timer = null;
    return {
      tiers, pools, log: () => st.log.slice(),
      contribute(gameId, stake) { tiers.forEach(t => { st.pools[t.id] += stake * t.inc; }); save(); },
      // The player's own spin. Two draws from the supplied RNG: (1) does a jackpot trigger at all
      // (P = stake x sum of tier odds), (2) which tier (weighted by each tier's odds). Per tier this is
      // exactly P = stake x oddsPerUnit, i.e. fair per stake. The returned award also carries the
      // pick-game board so the UI can only REVEAL the result, never choose it.
      checkWin(gameId, stake, rng) {
        const tot = tiers.reduce((a, t) => a + t.oddsPerUnit, 0);
        if (!(rng() < Math.min(1, stake * tot))) return null;
        let r = rng() * tot, idx = tiers.length - 1;
        for (let i = 0; i < tiers.length; i++) { if ((r -= tiers[i].oddsPerUnit) < 0) { idx = i; break; } }
        const e = award(tiers[idx], 'you', gameId);
        return Object.assign({}, e, { tierIndex: idx, stake, pick: pickBoard(idx, rng, tiers.length) });
      },
      start() { if (timer || !opts.live) return; timer = setInterval(() => { const n = Date.now(); simulate((n - st.t) / 1000); st.t = n; save(); emit('update', pools()); }, 1000); },
      stop() { clearInterval(timer); timer = null; },
      on(ev, f) { (listeners[ev] = listeners[ev] || []).push(f); },
    };
  }

  function create(opts) {
    opts = Object.assign({ tiers: DEFAULT_TIERS, live: true }, opts || {});
    if (!opts.gameId) throw new Error('HordeJackpot.create needs a gameId');
    const net = opts.backend || LocalNetwork(opts);
    net.start();
    return {
      gameId: opts.gameId,
      tiers: opts.tiers,
      rtp: jackpotRtp(opts.tiers),
      getPools: () => net.pools(),
      getLog: () => (net.log ? net.log() : []),
      contribute: stake => net.contribute(opts.gameId, stake),
      checkWin: (stake, rng) => net.checkWin(opts.gameId, stake, rng || Math.random),
      on: (ev, f) => net.on(ev, f),
      stop: () => net.stop && net.stop(),
    };
  }

  const api = { create, DEFAULT_TIERS, jackpotRtp, LocalNetwork, pickBoard };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.HordeJackpot = api;
})(typeof window !== 'undefined' ? window : globalThis);
