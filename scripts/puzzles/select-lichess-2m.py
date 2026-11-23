# Selects 2,000,000 MORE Lichess puzzles (in addition to lichess-puzzles-1m.csv.gz) from the same
# source: the full Lichess puzzle database (CC0, 6,193,530 puzzles, file dated 2026-11-01) as
# repackaged in the public GitHub repo henryplotnick/puzzle-survival (see select-lichess-1m.py).
# Whole 512-puzzle chunks not used by the first selection are taken, spread evenly over each rating
# band, until the band's quota is met. Output: two gzip CSV files (each under GitHub's 50 MB warning).
#
# usage: python3 select-lichess-2m.py <puzzle-survival checkout> <lichess-puzzles-1m.csv.gz> <out-prefix> [--list-chunks]
import sys, json, gzip, math, os, csv
src, first, out = sys.argv[1], sys.argv[2], sys.argv[3]
m = json.load(open(f'{src}/manifest.json'))
bs, bmin, n, CH = m['bandStart'], m['bandMin'], m['n'], m['chunk']
def rank_at(r):
    b = r // 25 - bmin
    return 0 if b < 0 else n if b >= len(bs) else bs[b]
PLAN = [(0, 600, 110000), (600, 800, 150000), (800, 1000, 190000), (1000, 1200, 210000), (1200, 1400, 210000),
        (1400, 1600, 210000), (1600, 1800, 210000), (1800, 2000, 200000), (2000, 2200, 190000), (2200, 2400, 160000),
        (2400, 2600, 100000), (2600, 2800, 60000)]
# chunks the first selection used (same rule as select-lichess-1m.py)
PLAN1 = [(0, 600, 60000), (600, 800, 75000), (800, 1000, 90000), (1000, 1200, 100000), (1200, 1400, 100000), (1400, 1600, 100000),
         (1600, 1800, 100000), (1800, 2000, 100000), (2000, 2200, 90000), (2200, 2400, 80000), (2400, 2600, 70000),
         (2600, 2800, 55000), (2800, 3000, 20000), (3000, 99999, 5000)]
used = set()
for a, b, q in PLAN1:
    lo, hi = rank_at(a), rank_at(b)
    c0, c1 = lo // CH, (hi - 1) // CH
    k = min(c1 - c0 + 1, math.ceil(q / CH) + 1)
    for j in range(k): used.add(c0 + round(j * (c1 - c0) / max(1, k - 1)))
plan_chunks = []  # (band, [chunks in order of preference])
for a, b, q in PLAN:
    lo, hi = rank_at(a), rank_at(b)
    free = [c for c in range(lo // CH, (hi - 1) // CH + 1) if c not in used]
    k = min(len(free), math.ceil(q / CH * 1.06) + 2)  # a little extra: rows outside the band edges and long puzzles drop out
    pick = sorted({free[round(j * (len(free) - 1) / max(1, k - 1))] for j in range(k)})
    plan_chunks.append(((a, b, q), pick))
if '--list-chunks' in sys.argv:
    print('\n'.join(f'c/{c % 100:02d}/{c}.gz' for _, cs in plan_chunks for c in cs))
    sys.exit(0)
have = set(r['PuzzleId'] for r in csv.DictReader(gzip.open(first, 'rt')))
rows = {}
for _, cs in plan_chunks:
    for c in cs:
        for k, line in enumerate(gzip.open(f'{src}/c/{c % 100:02d}/{c}.gz', 'rt').read().split('\n')):
            if not line: continue
            pid, fen, moves, rating = line.split('|')
            rows[c * CH + k] = [pid, fen + ' 0 1', moves, int(rating), []]
for t in m['themes']:
    d = f'{src}/i/{t}'
    if not os.path.isdir(d): continue
    for f in os.listdir(d):
        data = open(f'{d}/{f}', 'rb').read()
        g = v = s = 0
        for byte in data:
            v |= (byte & 127) << s
            if byte & 128: s += 7; continue
            g += v; v = s = 0
            if g in rows: rows[g][4].append(t)
taken = []
for (a, b, q), cs in plan_chunks:
    band = [rows[c * CH + k] for c in cs for k in range(CH) if c * CH + k in rows]
    band = [r for r in band if a <= r[3] < b and r[0] not in have and len(r[2].split(' ')) // 2 <= 5]
    step = len(band) / q if len(band) > q else 1
    got = [band[int(i * step)] for i in range(min(q, len(band)))]
    print(f'{a}-{b}: {len(got)} of {q} (from {len(cs)} chunks)', file=sys.stderr)
    taken += got
half = math.ceil(len(taken) / 2)
for part, rs in ((1, taken[:half]), (2, taken[half:])):
    with gzip.open(f'{out}-{part}.csv.gz', 'wt', newline='', compresslevel=9) as f:
        w = csv.writer(f)
        w.writerow(['PuzzleId', 'FEN', 'Moves', 'Rating', 'Themes'])
        for r in rs: w.writerow([r[0], r[1], r[2], r[3], ' '.join(sorted(r[4]))])
print('selected', len(taken), 'no-theme', sum(1 for r in taken if not r[4]))
