# Selects ~92,000 Lichess puzzles spread over all rating levels from the full Lichess puzzle
# database (CC0, 6,193,530 puzzles, file dated 2026-11-01) as repackaged in the public GitHub repo
# henryplotnick/puzzle-survival (c/NN/<chunk>.gz = 512 puzzles sorted by rating,
# i/<theme>/<band>.bin = varint-delta lists of puzzle positions per theme and 25-point band).
# That repackaging has id, FEN, moves, rating and themes; it does not carry RatingDeviation,
# Popularity or NbPlays.
#
# usage: python3 select-lichess-100k.py <puzzle-survival checkout> <out.csv.gz>
import sys, json, gzip, math, os, csv
src, out = sys.argv[1], sys.argv[2]
m = json.load(open(f'{src}/manifest.json'))
bs, bmin, n, CH = m['bandStart'], m['bandMin'], m['n'], m['chunk']
def rank_at(r):
    b = r // 25 - bmin
    return 0 if b < 0 else n if b >= len(bs) else bs[b]
# puzzles per rating band: every level gets thousands, the rare top bands what exists
PLAN = [(0, 600, 6000), (600, 800, 7000), (800, 1000, 8300), (1000, 1200, 8300), (1200, 1400, 8300), (1400, 1600, 8300),
        (1600, 1800, 8300), (1800, 2000, 8300), (2000, 2200, 8300), (2200, 2400, 7000), (2400, 2600, 6000),
        (2600, 2800, 5000), (2800, 3000, 2500), (3000, 99999, 1000)]
chunks = set()
for a, b, q in PLAN:
    lo, hi = rank_at(a), rank_at(b)
    c0, c1 = lo // CH, (hi - 1) // CH
    k = min(c1 - c0 + 1, math.ceil(q / CH) + 1)
    for j in range(k): chunks.add(c0 + round(j * (c1 - c0) / max(1, k - 1)))
rows = {}
for c in sorted(chunks):
    for k, line in enumerate(gzip.open(f'{src}/c/{c % 100:02d}/{c}.gz', 'rt').read().split('\n')):
        pid, fen, moves, rating = line.split('|')
        rows[c * CH + k] = [pid, fen + ' 0 1', moves, int(rating), []]
# themes
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
# quotas per band (chunks can straddle a band edge)
taken = []
for a, b, q in PLAN:
    band = [r for r in rows.values() if a <= r[3] < b]
    step = max(1, len(band) / q) if len(band) > q else 1
    taken += [band[int(i * step)] for i in range(min(q, len(band)))]
with gzip.open(out, 'wt', newline='') as f:
    w = csv.writer(f)
    w.writerow(['PuzzleId', 'FEN', 'Moves', 'Rating', 'Themes'])
    for r in taken: w.writerow([r[0], r[1], r[2], r[3], ' '.join(sorted(r[4]))])
print('chunks', len(chunks), 'selected', len(taken), 'no-theme', sum(1 for r in taken if not r[4]))
