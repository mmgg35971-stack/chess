# Calibration of move classification and Game Rating

Data: 1000 standard rated Lichess games from September 2017 (Lichess database, **CC0**),
as shipped in the `samples/sample-2.pgn` file of the `jja` 0.9.1 crate on crates.io.
Bullet, UltraBullet and correspondence games were skipped → **700 games** (classical + blitz),
ratings 857–2500 (median ≈1640).

1. `node analyze.mjs sample-2.pgn <worker> <workers> out.jsonl` — every position analysed with the
   app's own Stockfish.js 19 lite build, depth 12, MultiPV 2. Result: `lichess-2017-09-sample-analysed.jsonl.gz`.
2. `python3 fit.py out*.jsonl` (env `EP_SET=classical`, the default) writes
   `src/data/ep-model.json` and `src/data/game-rating-model.json`.
3. `npx tsx label-stats.ts out*.jsonl` — runs the app's classifier over the games (sanity check).

Results (2026-11-22):
- Expected points: E = 1/(1+exp(−a(r)·sign(cp)·(|cp|/100)^0.737)), a(r) = 0.391 + 0.223·(r−1500)/1000,
  fitted on 12,533 positions of the classical games. At +3 pawns: 0.65 (1000), 0.71 (1500), 0.76 (2000).
- Game Rating from a single game alone: cross-validated MAE 212 vs 229 for always guessing the mean
  (correlation 0.37). One game carries little information, so the app combines it with a known rating
  (profile or PGN header) as a Bayesian prior; with a rating known to ±150 the error is ≈±120.
- Label rates by band (share of moves): best 31% → 37%, blunder 4.0% → 2.8% from 800–1300 to 1900+.
