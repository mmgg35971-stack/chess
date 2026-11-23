# Opening tree of master games: how often each move sequence was played, up to ply 40 (move 20).
# Pass 1 counts plies 1–20; pass 2 counts plies 21–40 only below ply-20 positions reached by
# at least 8 games (keeps memory small and drops one-off deep lines).
# Source: kinairi/chess-data (GPL-3.0), data/players/*.pgn — 242 strong players' games.
# Games appearing in two players' files are counted once.
# usage: python3 master-tree.py <chess-data checkout> <out.json.gz>
import sys, re, glob, gzip, json
src, out = sys.argv[1], sys.argv[2]
MAXPLY, SPLIT, MINCOUNT, DEEPMIN = 40, 20, 4, 8
TOK = re.compile(r'(?:O-O-O|O-O|[KQRBN]?[a-h]?[1-8]?x?[a-h][1-8](?:=[QRBN])?)[+#]?')
counts = {}
seen = set()
games = 0
all_games = []
for f in sorted(glob.glob(src + '/data/players/*.pgn')):
    text = open(f, encoding='latin-1').read().replace('\r', '')
    for g in re.split(r'\n\s*\n(?=\[Event )', text):
        head, _, body = g.partition('\n\n')
        h = dict(re.findall(r'^\[(\w+) "([^"]*)"\]', head, re.M))
        if h.get('FEN') or h.get('SetUp') == '1': continue
        body = re.sub(r'\{[^}]*\}', ' ', body)
        while '(' in body:
            nb = re.sub(r'\([^()]*\)', ' ', body)
            if nb == body: break
            body = nb
        body = re.sub(r'\$\d+', ' ', body)
        body = re.sub(r'\d+\.(\.\.)?', ' ', body)
        sans = TOK.findall(body)[:MAXPLY]
        if len(sans) < 6: continue
        key = (h.get('White'), h.get('Black'), h.get('Date'), ' '.join(sans[:20]))
        if key in seen: continue
        seen.add(key); games += 1
        all_games.append(sans)
        p = ''
        for s_ in sans[:SPLIT]:
            p = (p + ' ' + s_) if p else s_
            counts[p] = counts.get(p, 0) + 1
deep = {}
for sans in all_games:
    if len(sans) <= SPLIT: continue
    base = ' '.join(sans[:SPLIT])
    if counts.get(base, 0) < DEEPMIN: continue
    p = base
    for s_ in sans[SPLIT:]:
        p = p + ' ' + s_
        deep[p] = deep.get(p, 0) + 1
counts.update(deep)
kept = {k: v for k, v in counts.items() if v >= MINCOUNT}
with gzip.open(out, 'wt') as fo: json.dump({'games': games, 'maxPly': MAXPLY, 'minCount': MINCOUNT, 'counts': kept}, fo)
print('games', games, 'prefixes kept', len(kept))
