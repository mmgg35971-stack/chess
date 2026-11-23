#!/usr/bin/env python3
"""Builds the coach-chat book library from public-domain chess books.

Input: shallow clones of the GITenberg mirrors of Project Gutenberg books
(https://github.com/GITenberg/<repo>), one directory per book under BOOKS_DIR.
Output: public/data/books/books.pz (gzip JSON) with the books' metadata and
their text split into passages of ~1,200 characters, each tagged with the
chapter it comes from. Only public-domain texts are used; the Gutenberg
header/footer and licence are removed, everything else is the book's own text.

Usage: python3 scripts/ai/build-books.py <BOOKS_DIR>
"""
import gzip, json, re, subprocess, sys
from pathlib import Path

BOOKS = [
    # repo, file, short id, author, title, year, focus
    ('Chess-Fundamentals_33870', '33870-8.txt', 'capablanca-fundamentals', 'José Raúl Capablanca', 'Chess Fundamentals', 1921, 'endgame,middlegame,opening,games'),
    ('Chess-Strategy_5614', '5614.txt', 'lasker-strategy', 'Edward Lasker', 'Chess Strategy', 1915, 'opening,middlegame,endgame,games'),
    ('Chess-and-Checkers-the-Way-to-Mastership_4913', '4913.txt', 'lasker-mastership', 'Edward Lasker', 'Chess and Checkers: The Way to Mastership', 1918, 'opening,middlegame,endgame'),
    ('The-Blue-Book-of-Chess--13-Teaching-the-Rudiments-of-the-Game-and-Giving-an-Analysis-of-All-t__16377', '16377.txt', 'staunton-bluebook', 'Howard Staunton et al.', 'The Blue Book of Chess', 1910, 'opening,rules,endgame'),
    ('Chess-Generalship-Vol-I-Grand-Reconnaissance_55278', '55278-0.txt', 'young-generalship', 'Franklin K. Young', 'Chess Generalship, Vol. I: Grand Reconnaissance', 1910, 'strategy'),
    ('The-Exploits-and-Triumphs-in-Europe-of-Paul-Morphy-the-Chess-Champion_34180', '34180-8.txt', 'edge-morphy', 'Frederick Milnes Edge', 'The Exploits and Triumphs, in Europe, of Paul Morphy', 1859, 'history,games'),
    ('Chess-History-and-Reminiscences_4902', '4902.txt', 'bird-history', 'H. E. Bird', 'Chess History and Reminiscences', 1893, 'history'),
]
TARGET = 1200


def read(p: Path) -> str:
    raw = p.read_bytes()
    for enc in ('utf-8', 'latin-1'):
        try:
            return raw.decode(enc)
        except UnicodeDecodeError:
            pass
    raise ValueError(p)


def body(text: str) -> str:
    text = text.replace('\r\n', '\n')
    s = re.search(r'\*\*\*\s*START OF (THE|THIS) PROJECT GUTENBERG[^\n]*\n', text)
    e = re.search(r'\*\*\*\s*END OF (THE|THIS) PROJECT GUTENBERG', text)
    if e: text = text[:e.start()]
    if s: text = text[s.end():]
    end = re.search(r'\n\s*End of (the )?Project Gutenberg', text, re.I)
    if end: text = text[:end.start()]
    return text


def is_diagram(line: str) -> bool:
    s = line.strip()
    if not s: return False
    sym = sum(c in '|+-#^_=*' for c in s)
    return (len(s) >= 8 and sym / len(s) > 0.35) or s.count('|') >= 4


RANK = re.compile(r'^\s*([1-8])\s*\|(.*)\|\s*$')
PIECE = {'K': 'k', 'Q': 'q', 'R': 'r', 'B': 'b', 'KT': 'n', 'N': 'n', 'P': 'p'}


def diagram_fen(rows):
    """rows: {rank: [8 cells]} from an ASCII diagram (#X black, ^X white) -> FEN placement or None."""
    if sorted(rows) != list(range(1, 9)): return None
    out = []
    for r in range(8, 0, -1):
        cells = rows[r]
        if len(cells) != 8: return None
        fr, empty = '', 0
        for c in cells:
            c = c.strip().upper()
            if not c:
                empty += 1; continue
            m = re.match(r'^([#^])(KT|K|Q|R|B|N|P)$', c)
            if not m: return None
            if empty: fr += str(empty); empty = 0
            ch = PIECE[m.group(2)]
            fr += ch if m.group(1) == '#' else ch.upper()
        if empty: fr += str(empty)
        out.append(fr)
    fen = '/'.join(out)
    if fen.count('k') != 1 or fen.count('K') != 1: return None
    if re.search(r'[pP]', out[0] + out[7]): return None
    return fen


def is_heading(line: str, prev_blank: bool, next_blank: bool) -> bool:
    s = line.strip()
    if not (prev_blank and next_blank) or not (3 <= len(s) <= 80): return False
    if re.search(r'\b(P|Kt|B|R|Q|K)\s*-\s*[QK]', s) or re.match(r'^\d+\.\s', s) and '-' in s: return False
    if re.search(r'produced by|proofreading|pgdp|transcriber', s, re.I): return False
    if re.match(r'^(CHAPTER|PART|BOOK|SECTION|LESSON)\b', s, re.I): return True
    letters = [c for c in s if c.isalpha()]
    if len(letters) < 4: return False
    up = sum(c.isupper() for c in letters) / len(letters)
    return up > 0.8 and not s.endswith(',')


def passages(text: str):
    lines = text.split('\n')
    heading = ''
    paras, cur = [], []
    in_diag = False
    rows = {}
    for i, ln in enumerate(lines):
        m = RANK.match(ln)
        if m:
            rows[int(m.group(1))] = m.group(2).split('|')
            if int(m.group(1)) == 1:
                fen = diagram_fen(rows)
                cur.append(f'[diagram FEN {fen}]' if fen else '[diagram]')
                rows = {}
            in_diag = True
            continue
        if in_diag and (re.match(r'^\s*[A-H](\s+[A-H]){7}\s*$', ln) or re.match(r'^\s*[a-h](\s+[a-h]){7}\s*$', ln)):
            continue
        prev_blank = i == 0 or not lines[i - 1].strip()
        next_blank = i + 1 >= len(lines) or not lines[i + 1].strip()
        if is_diagram(ln):
            if not in_diag:
                cur.append('[diagram]')
            in_diag = True
            continue
        in_diag = False
        if is_heading(ln, prev_blank, next_blank):
            if cur: paras.append((heading, ' '.join(cur))); cur = []
            heading = re.sub(r'\s+', ' ', ln.strip())[:80]
            continue
        if not ln.strip():
            if cur: paras.append((heading, ' '.join(cur))); cur = []
            continue
        if re.search(r'produced by|distributed proofreading|pgdp\.net|transcriber', ln, re.I):
            continue
        if ln.strip() in ('[Illustration]',):
            cur.append('[diagram]'); continue
        cur.append(ln.strip())
    if cur: paras.append((heading, ' '.join(cur)))
    # merge paragraphs into passages of ~TARGET chars, never across headings
    out, buf, bh = [], '', None
    for h, p in paras:
        p = re.sub(r'\s+', ' ', p).strip()
        p = re.sub(r'\{\d+\}', '', p)  # page markers like {12}
        if not p or p == '[diagram]' and not buf: continue
        if bh is not None and (h != bh or len(buf) + len(p) > TARGET * 1.4) and buf:
            out.append((bh, buf.strip())); buf = ''
        bh = h
        buf += ('\n' if buf else '') + p
        if len(buf) >= TARGET:
            out.append((bh, buf.strip())); buf = ''
    if buf: out.append((bh, buf.strip()))
    return [(h, t) for h, t in out if len(t) > 80]


def main():
    root = Path(sys.argv[1])
    books, chunks = [], []
    for repo, fn, bid, author, title, year, focus in BOOKS:
        d = root / repo
        commit = subprocess.check_output(['git', '-C', str(d), 'rev-parse', 'HEAD'], text=True).strip()
        text = body(read(d / fn))
        if bid == 'lasker-mastership':  # keep the chess part only; part II is about checkers
            text = text[: [m.start() for m in re.finditer(r'\nPART II\s*\n\s*\n\s*THE GAME OF CHECKERS', text)][-1]]
        ps = passages(text)
        books.append({'id': bid, 'author': author, 'title': title, 'year': year, 'focus': focus.split(','),
                      'source': f'https://github.com/GITenberg/{repo} @ {commit[:12]} (Project Gutenberg #{repo.rsplit("_", 1)[-1]})',
                      'passages': len(ps)})
        for h, t in ps:
            chunks.append([len(books) - 1, h, t])
        print(f'{bid}: {len(ps)} passages', file=sys.stderr)
    out = Path(__file__).resolve().parents[2] / 'public/data/books/books.pz'
    out.parent.mkdir(parents=True, exist_ok=True)
    data = json.dumps({'v': 1, 'books': books, 'chunks': chunks}, ensure_ascii=False, separators=(',', ':')).encode()
    out.write_bytes(gzip.compress(data, 9, mtime=0))
    print(f'{len(chunks)} passages, {len(data)//1024} KB json, {out.stat().st_size//1024} KB gz', file=sys.stderr)


if __name__ == '__main__':
    main()
