# Zombie Horde Free Spins – maths sheet (engine v6, HIGH volatility)

DEMO ONLY – virtual credits. 6×4 pays-anywhere, cascades, free spins with horde-meter multiplier
(×2/×5/×10), boss drop, optional Pick a Zombie gamble, Horde Games network jackpot.
Bets 0.10 – 5.00 (default 1.00). Max win 10,000× bet per round (after gamble; jackpots on top).

## RTP by variant (total includes the 2.00% network jackpot)

Primary figures: decomposed estimate RTP = base RTP + P(trigger) × E[feature win] from 20M base spins
+ 2M simulated features per variant/strategy (95% CI ≈ ±0.45%). The variants differ only in the
free-spins WILD weight (26.2 / 25.25 / 24.4), so hit rate, bonus frequency and feel are identical.

| Variant | Game RTP excl. jackpot | Jackpot | **Total, always collect** | Total, always gamble 3 picks | Base game | Free spins + boss |
|---|---|---|---|---|---|---|
| 96 (default) | 94.05% | 2.00% | **96.05% ±0.45** | 95.74% ±0.48 | 37.62% | 56.42% |
| 94 | 91.89% | 2.00% | **93.89% ±0.44** | 93.38% ±0.46 | 37.62% | 54.26% |
| 92 | 90.05% | 2.00% | **92.05% ±0.42** | 91.43% ±0.45 | 37.62% | 52.42% |

Base game ≈ 39–41% of total RTP; features + boss ≈ 55–59%; jackpot 2%.
Gamble: EV per pick = 0.2×2 + 0.4×1 + 0.4×0.5 = **1.00** (RTP-neutral). Always taking 3 picks costs
0.3–0.6% only because results above the 10,000× cap are truncated (slightly house-favourable). Full-game 20M-spin cross-checks (collect): 95.67% / 93.06% / 92.28% total
±1.0% (heavier-tailed, wider CI) – consistent.

## Feel (identical in every variant; 20M spins, 96 variant)

| Metric | Value |
|---|---|
| Hit rate (any win) | 19.1% (1 in 5.23) |
| Dead spins | 80.9%; average losing streak 5.2 spins, longest seen 73 |
| Win distribution | 0: 80.9% · <2×: 12.7% · 2–5×: 5.1% · 5–20×: 1.0% · 20–100×: 0.22% · 100–1,000×: 0.13% · 1,000×+: 0.01% |
| Volatility | std dev per spin ≈ 23× bet (volatility index 1.96·σ ≈ 45) – HIGH |
| Free spins frequency | 1 in 276 (avg 21 spins played) |
| Feature win (collect), 96 variant | avg 155×, median 60×, p10 13×, p25 26×, p75 147×, p90 342×, p99 1,515×; 200×+ in 18.6% of features, 1,000×+ in 2.2% |
| Feature top multiplier | ×2 40% · ×5 47% · ×10 13% |
| Wins ≥ 1,000× | about 1 in 12,600 spins |
| Wins ≥ 5,000× | about 1 in 360,000 spins |
| Max win 10,000× (cap) | 26 hits in 60M spins ≈ 1 in 2.3 million spins |

## Pick a Zombie gamble

After free spins (incl. boss drop) the player may COLLECT or gamble the feature win: 3 coffins, outcome
drawn by engine.gamblePick (seeded RNG), the touched coffin only decides where it is shown.

| Outcome | Probability |
|---|---|
| ×2 | 20% |
| ×1 | 40% |
| ×½ | 40% |

Up to 3 picks, collect any time; result floored to the cent and capped at the room left under 10,000× bet.
Not offered in autoplay (auto collects). Odds disclosed in the help screen.

## Sessions (1,000 credits, up to 500 spins, incl. jackpot draws; 10,000 sessions per stake)

| Variant / strategy | Bet 1: finish up | Bet 1: median end | Bet 2: finish up | Bet 2: median end | Bet 5: finish up | Bet 5: bust | Bet 5: median end | Bet 5: reach +10,000 |
|---|---|---|---|---|---|---|---|---|
| 96, collect | 28.0% | 826 | 27.0% | 640 | 23.0% (77% down) | 57% | 4 | 1.1% |
| 96, always gamble | 23.6% | 787 | 23.1% | 573 | 18.9% (81% down) | 63% | 4 | 1.4% |
| 92, collect | 25.1% | 810 | 25.3% | 620 | 20.6% (79% down) | 60% | 4 | 1.0% |

## Horde Games network jackpot (shared by all Horde Games slots)

Stake-weighted random trigger on every paid spin: P(tier) = stake × odds per 1.00 staked; one draw
for "any jackpot", then the tier by weight. 2.00% of every stake is contributed (0.85% grows the pools,
1.15% seed reserve funds the reset values) – all of it returns to players as jackpot RTP.

| Tier | Seed | Contribution to pool | Seed reserve | Odds per 1.00 staked | Avg prize at drop | RTP share |
|---|---|---|---|---|---|---|
| MINI | 10 | 0.20% | 0.50% | 1 in 2,000 | 14 | 0.70% |
| MINOR | 50 | 0.25% | 0.25% | 1 in 20,000 | 100 | 0.50% |
| MAJOR | 500 | 0.20% | 0.20% | 1 in 250,000 | 1,000 | 0.40% |
| GRAND | 10,000 | 0.20% | 0.20% | 1 in 5,000,000 | 20,000 | 0.40% |
| **Total** | | 0.85% | 1.15% | 1 in 1,804 (any tier) | | **2.00%** |

Odds per spin by stake (1 in N spins):

| Stake | MINI | MINOR | MAJOR | GRAND | Any |
|---|---|---|---|---|---|
| 0.10 | 20,000 | 200,000 | 2,500,000 | 50,000,000 | 18,044 |
| 0.20 | 10,000 | 100,000 | 1,250,000 | 25,000,000 | 9,022 |
| 0.50 | 4,000 | 40,000 | 500,000 | 10,000,000 | 3,609 |
| 1.00 | 2,000 | 20,000 | 250,000 | 5,000,000 | 1,804 |
| 2.00 | 1,000 | 10,000 | 125,000 | 2,500,000 | 902 |
| 5.00 | 400 | 4,000 | 50,000 | 1,000,000 | 361 |

Expected time to drop (network-wide, any player): depends only on total network turnover.

| Network turnover | MINI | MINOR | MAJOR | GRAND |
|---|---|---|---|---|
| 25 credits/s (demo simulation) | 80 s | 13.3 min | 2.8 h | 2.3 days |
| 100 credits/s | 20 s | 3.3 min | 41.7 min | 13.9 h |
| 1,000 credits/s | 2 s | 20 s | 4.2 min | 83.3 min |

One player spinning non-stop (~4 s per spin incl. animations):

| Stake | MINI | MINOR | MAJOR | GRAND |
|---|---|---|---|---|
| 1.00 | 2.2 h | 22.2 h | 11.6 days | 231.5 days |
| 5.00 | 26.7 min | 4.4 h | 2.3 days | 46.3 days |

The pick game (12 graves, 3 per tier, first to 3 matches wins) is presentation only – the tier is already
decided by the draw; see horde-jackpot/README.md and JACKPOT_SPEC.md.

## Reproduce

```
node simulate.js 20000000 202696 96 0 collect      # full game, variant 96
node simulate.js 5000000 7796 96 0 pick3           # always take 3 gamble picks
node simulate.js 200000 5 96 10000 collect         # + session study
```
Decomposed estimates: zh-harness/precise2.js (base 20M; features 2M per variant/strategy).
Payout parity UI ↔ engine: zh-harness/drive.js (jsdom, drives the real game.js incl. gamble clicks and
forced jackpots) – 0 mismatches.
