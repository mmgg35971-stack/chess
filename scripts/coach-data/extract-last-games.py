import re, glob, os, collections
COACHES = {'carlsen': 'Carlsen', 'nakamura': 'Nakamura', 'caruana': 'Caruana', 'firouzja': 'Firouzja',
           'tal': 'Tal', 'fischer': 'Fischer', 'kasparov': 'Kasparov'}
NONCLASSICAL = re.compile(r'blitz|rapid|bullet|blind|simul|exhib|armageddon|960|random|online|titled|lichess|chess\.com|chess24|banter|speed|thematic|basque|tiebreak|tie-break|playoff|play-off|lightning|pro chess|bundesliga.*rapid|magnus carlsen invitational|champions chess tour|meltwater|skilling|airthings|opera euro|ftx|chessable|lindores|goldmoney|clutch|grand chess tour.*(rapid|blitz)|zurich.*rapid|ksn|fide online|steinitz|altibox norway.*armageddon|kids|clock|g/|sudden|\bsim\b|consultation|vip|clichy|millennium|exhibition|computer|deep blue|x3d|junior|fritz', re.I)
LAST = {'kasparov': '2005.03.31', 'fischer': '1992.12.31', 'tal': '1992.12.31'}
import sys
# usage: python3 extract-last-games.py <chess-data checkout> <outDir>
SRC, OUT = sys.argv[1], sys.argv[2]
files = glob.glob(SRC + '/data/players/*.pgn')
games = {k: {} for k in COACHES}
def split(text):
    return re.split(r'\n\s*\n(?=\[Event )', text.replace('\r', ''))
for f in files:
    text = open(f, encoding='latin-1').read()
    for g in split(text):
        h = dict(re.findall(r'^\[(\w+) "([^"]*)"\]', g, re.M))
        w, b = h.get('White', ''), h.get('Black', '')
        for cid, name in COACHES.items():
            surname = re.compile(r'^' + name + r'\b', re.I)
            if cid == 'tal' and not (re.match(r'^Tal,\s*M', w) or re.match(r'^Tal,\s*M', b)): continue
            if cid == 'fischer' and not (re.match(r'^Fischer,\s*R', w) or re.match(r'^Fischer,\s*R', b)): continue
            if cid == 'kasparov' and not (re.match(r'^Kasparov,\s*G(arry|ary|\.|\s*$)', w) or re.match(r'^Kasparov,\s*G(arry|ary|\.|\s*$)', b)): continue
            if not (surname.match(w) or surname.match(b)): continue
            ev = (h.get('Event', '') + ' ' + h.get('Site', ''))
            if NONCLASSICAL.search(ev): continue
            tc = h.get('TimeControl', '')
            if tc and re.match(r'^\d+', tc) and int(re.match(r'^(\d+)', tc).group(1)) < 3000: continue
            body = re.sub(r'^\[.*\]\s*$', '', g, flags=re.M)
            body = re.sub(r'\{[^}]*\}', '', body)
            body = re.sub(r'\([^()]*\)', '', body)
            moves = re.sub(r'\d+\.(\.\.)?', ' ', body)
            moves = ' '.join(moves.split())
            if len(moves.split()) < 30: continue
            date = h.get('Date', '????.??.??').replace('?', '0')
            if cid in LAST and date > LAST[cid]: continue
            if cid == 'fischer' and '1973' <= date[:4] <= '1991': continue  # Fischer played no official games then
            key = (w.split(',')[0].lower(), b.split(',')[0].lower(), date[:4], ' '.join(moves.split()[:30]))
            if key not in games[cid]: games[cid][key] = (date, g.strip())
for cid, d in games.items():
    allg = sorted(d.values(), key=lambda x: x[0], reverse=True)
    last = allg[:150]
    with open(f'{OUT}/{cid}.pgn', 'w') as out:
        out.write('\n\n'.join(g for _, g in last) + '\n')
    print(f'{cid:9s} classical games found {len(allg):5d}  using {len(last)}  dates {last[-1][0][:7] if last else "-"} .. {last[0][0][:7] if last else "-"}')
