// Structure of the Openings Academy (spec 8): which openings, from which side, and which theory
// lines they contain. Lines come from lichess-org/chess-openings (CC0, scripts/openings/*.tsv) —
// every named line whose name belongs to `families` and whose moves start with `root` — plus the
// curated `main` line. Everything is checked for legality and with Stockfish at build time
// (scripts/academy/build-academy.ts).

export interface OpeningDef {
  id: string;
  side: 'w' | 'b';
  eco: string;
  name: { ar: string; en: string };
  /** SAN moves every line of this opening starts with */
  root: string;
  /** name prefixes in the Lichess openings list (text before the colon) */
  families: string[];
  /** curated main line (SAN), taught first */
  main: string;
  /** extra curated lines for openings the Lichess list covers thinly */
  extra?: string[];
  /**
   * the learner's system: when one of these moves is legal and sound (≤80 cp worse than the engine's
   * best) in the first 20 plies, the repertoire plays it, so the tree stays inside this opening
   */
  prefer?: string[];
}

export const OPENINGS: OpeningDef[] = [
  // ---------------- White ----------------
  { id: 'english', side: 'w', eco: 'A10–A39', name: { ar: 'الافتتاح الإنجليزي', en: 'English Opening' }, root: 'c4', families: ['English Opening'],
    prefer: ['c4', 'Nc3', 'g3', 'Bg2', 'Nf3', 'O-O'], main: 'c4 e5 Nc3 Nf6 Nf3 Nc6 g3 d5 cxd5 Nxd5 Bg2 Nb6 O-O Be7 d3 O-O' },
  { id: 'kings-gambit', side: 'w', eco: 'C30–C39', name: { ar: 'غامبيت الملك', en: "King's Gambit" }, root: 'e4 e5 f4',
    families: ["King's Gambit", "King's Gambit Accepted", "King's Gambit Declined"],
    prefer: ['f4', 'Nf3', 'Bc4', 'd4', 'O-O'], main: 'e4 e5 f4 exf4 Nf3 d5 exd5 Nf6 Bb5+ c6 dxc6 bxc6 Bc4 Nd5 O-O Bd6' },
  { id: 'queens-gambit', side: 'w', eco: 'D06–D69', name: { ar: 'غامبيت الوزير', en: "Queen's Gambit" }, root: 'd4 d5 c4',
    families: ["Queen's Gambit", "Queen's Gambit Accepted", "Queen's Gambit Declined", 'Slav Defense', 'Semi-Slav Defense'],
    prefer: ['c4', 'Nc3', 'Bg5', 'e3', 'Nf3'], main: 'd4 d5 c4 e6 Nc3 Nf6 Bg5 Be7 e3 O-O Nf3 h6 Bh4 b6 cxd5 Nxd5 Bxe7 Qxe7' },
  { id: 'italian', side: 'w', eco: 'C50–C59', name: { ar: 'اللعبة الإيطالية', en: 'Italian Game' }, root: 'e4 e5 Nf3 Nc6 Bc4', families: ['Italian Game'],
    prefer: ['Bc4', 'c3', 'd3', 'O-O', 'Re1', 'Bb3', 'h3'], main: 'e4 e5 Nf3 Nc6 Bc4 Bc5 c3 Nf6 d3 d6 O-O O-O Re1 a6 Bb3 Ba7 h3' },
  { id: 'ruy-lopez', side: 'w', eco: 'C60–C99', name: { ar: 'روي لوبيز (الافتتاح الإسباني)', en: 'Ruy Lopez' }, root: 'e4 e5 Nf3 Nc6 Bb5', families: ['Ruy Lopez'],
    prefer: ['Bb5', 'Ba4', 'O-O', 'Re1', 'Bb3', 'c3', 'h3'], main: 'e4 e5 Nf3 Nc6 Bb5 a6 Ba4 Nf6 O-O Be7 Re1 b5 Bb3 d6 c3 O-O h3' },
  { id: 'scotch', side: 'w', eco: 'C44–C45', name: { ar: 'اللعبة الاسكتلندية', en: 'Scotch Game' }, root: 'e4 e5 Nf3 Nc6 d4', families: ['Scotch Game'],
    prefer: ['d4', 'Nxd4', 'Nxc6', 'e5', 'Qe2', 'c4'], main: 'e4 e5 Nf3 Nc6 d4 exd4 Nxd4 Nf6 Nxc6 bxc6 e5 Qe7 Qe2 Nd5 c4 Nb6 Nd2' },
  { id: 'vienna', side: 'w', eco: 'C25–C29', name: { ar: 'لعبة فيينا', en: 'Vienna Game' }, root: 'e4 e5 Nc3', families: ['Vienna Game'],
    prefer: ['Nc3', 'f4', 'fxe5', 'Nf3', 'd4'], main: 'e4 e5 Nc3 Nf6 f4 d5 fxe5 Nxe4 Nf3 Be7 d4 O-O Bd3' },
  { id: 'london', side: 'w', eco: 'D02 / A46 / A48', name: { ar: 'نظام لندن', en: 'London System' }, root: 'd4',
    families: ['London System', "Queen's Pawn Game: London System", 'Indian Defense: London System', 'Indian Defense: Accelerated London System'],
    prefer: ['Bf4', 'e3', 'c3', 'Nf3', 'Nd2', 'Ngf3', 'Bd3', 'h3', 'Bg3', 'O-O'], main: 'd4 d5 Bf4 Nf6 e3 c5 c3 Nc6 Nd2 e6 Ngf3 Bd6 Bg3 O-O Bd3',
    extra: [
      'd4 Nf6 Bf4 g6 Nf3 Bg7 e3 O-O Be2 d6 h3 c5 c3 b6 O-O',
      'd4 d5 Bf4 Nf6 e3 e6 Nd2 c5 c3 Nc6 Ngf3 Bd6 Bg3 O-O Bd3 b6 Ne5',
      'd4 Nf6 Bf4 d5 e3 c5 Nd2 cxd4 exd4 Nc6 c3 Bf5 Ngf3 e6 Qb3 Qc8',
      'd4 d5 Bf4 Bf5 e3 e6 Nf3 Nf6 c4 Bb4+ Nc3 O-O Qb3',
      'd4 Nf6 Bf4 e6 e3 c5 Nd2 d5 c3 Nc6 Ngf3 Bd6 Bg3 O-O Bd3',
      'd4 d5 Nf3 Nf6 Bf4 e6 e3 Bd6 Bg3 O-O Nbd2 c5 c3 b6 Bd3 Bb7',
    ] },
  { id: 'catalan', side: 'w', eco: 'E01–E09', name: { ar: 'الافتتاح الكتالوني', en: 'Catalan Opening' }, root: 'd4 Nf6 c4 e6 g3', families: ['Catalan Opening'],
    prefer: ['g3', 'Bg2', 'Nf3', 'O-O', 'Qc2'], main: 'd4 Nf6 c4 e6 g3 d5 Bg2 Be7 Nf3 O-O O-O dxc4 Qc2 a6 Qxc4 b5 Qc2 Bb7 Bd2',
    extra: [
      'd4 Nf6 c4 e6 g3 d5 Nf3 Be7 Bg2 O-O O-O c6 Qc2 Nbd7 Nbd2 b6 e4',
      'd4 Nf6 c4 e6 g3 d5 Bg2 dxc4 Nf3 c5 O-O Nc6 Qa4 Bd7 Qxc4 b5 Qd3',
      'd4 Nf6 c4 e6 g3 Bb4+ Bd2 Be7 Bg2 d5 Nf3 O-O O-O c6 Qc2 b6 Rd1',
      'd4 Nf6 c4 e6 g3 d5 Bg2 Bb4+ Bd2 Be7 Nf3 O-O O-O c6 Qc2 b6 Bf4',
    ] },
  { id: 'reti', side: 'w', eco: 'A04–A09', name: { ar: 'افتتاح ريتي', en: 'Réti Opening' }, root: 'Nf3', families: ['Réti Opening'],
    prefer: ['Nf3', 'c4', 'g3', 'Bg2', 'O-O', 'b3', 'Bb2'], main: 'Nf3 d5 c4 e6 g3 Nf6 Bg2 Be7 O-O O-O b3 c5 Bb2 Nc6 e3',
    extra: [
      'Nf3 d5 c4 c6 b3 Nf6 g3 Bf5 Bg2 e6 O-O Nbd7 Bb2 h6 d3 Be7 Nbd2',
      'Nf3 d5 c4 dxc4 e3 Nf6 Bxc4 e6 O-O c5 d4 a6 a4',
      'Nf3 d5 c4 d4 e3 Nc6 exd4 Nxd4 Nxd4 Qxd4 Nc3 e5 d3 Bc5 Qe2',
      'Nf3 d5 c4 e6 g3 Nf6 Bg2 d4 O-O c5 e3 Nc6 exd4 cxd4 d3',
    ] },
  { id: 'kia', side: 'w', eco: 'A07–A08', name: { ar: 'هجوم الهندي الملكي', en: "King's Indian Attack" }, root: '', families: ["King's Indian Attack"],
    prefer: ['Nf3', 'g3', 'Bg2', 'O-O', 'd3', 'Nbd2', 'e4', 'Re1'], main: 'Nf3 d5 g3 Nf6 Bg2 c6 O-O Bg4 d3 Nbd7 Nbd2 e5 e4 dxe4 dxe4 Bc5',
    extra: [
      'e4 e6 d3 d5 Nd2 Nf6 Ngf3 c5 g3 Nc6 Bg2 Be7 O-O O-O Re1',
      'e4 c5 Nf3 e6 d3 Nc6 g3 d5 Nbd2 Nf6 Bg2 Be7 O-O O-O Re1',
      'Nf3 Nf6 g3 g6 Bg2 Bg7 O-O O-O d3 d6 e4 e5 Nc3',
      'Nf3 d5 g3 c5 Bg2 Nc6 O-O e5 d3 Nf6 Nbd2 Be7 e4 O-O c3',
      'Nf3 Nf6 g3 d5 Bg2 e6 O-O Be7 d3 O-O Nbd2 c5 e4 Nc6 Re1',
    ] },
  // ---------------- Black ----------------
  { id: 'sicilian', side: 'b', eco: 'B20–B99', name: { ar: 'الدفاع الصقلي', en: 'Sicilian Defense' }, root: 'e4 c5', families: ['Sicilian Defense'],
    prefer: ['c5', 'd6', 'cxd4', 'Nf6', 'a6'], main: 'e4 c5 Nf3 d6 d4 cxd4 Nxd4 Nf6 Nc3 a6 Be3 e5 Nb3 Be6 f3 Be7 Qd2 O-O' },
  { id: 'kid', side: 'b', eco: 'E60–E99', name: { ar: 'الدفاع الهندي الملكي', en: "King's Indian Defense" }, root: 'd4 Nf6 c4 g6', families: ["King's Indian Defense"],
    prefer: ['Nf6', 'g6', 'Bg7', 'd6', 'O-O', 'e5'], main: 'd4 Nf6 c4 g6 Nc3 Bg7 e4 d6 Nf3 O-O Be2 e5 O-O Nc6 d5 Ne7 Ne1 Nd7' },
  { id: 'french', side: 'b', eco: 'C00–C19', name: { ar: 'الدفاع الفرنسي', en: 'French Defense' }, root: 'e4 e6', families: ['French Defense'],
    prefer: ['e6', 'd5', 'Nf6', 'Be7'], main: 'e4 e6 d4 d5 Nc3 Nf6 Bg5 Be7 e5 Nfd7 Bxe7 Qxe7 f4 O-O Nf3 c5' },
  { id: 'caro-kann', side: 'b', eco: 'B10–B19', name: { ar: 'دفاع كارو-كان', en: 'Caro-Kann Defense' }, root: 'e4 c6', families: ['Caro-Kann Defense'],
    prefer: ['c6', 'd5', 'dxe4', 'Bf5'], main: 'e4 c6 d4 d5 Nc3 dxe4 Nxe4 Bf5 Ng3 Bg6 h4 h6 Nf3 Nd7 h5 Bh7 Bd3 Bxd3 Qxd3 e6' },
  { id: 'pirc', side: 'b', eco: 'B07–B09', name: { ar: 'دفاع بيرتس', en: 'Pirc Defense' }, root: 'e4 d6', families: ['Pirc Defense'],
    prefer: ['d6', 'Nf6', 'g6', 'Bg7', 'O-O'], main: 'e4 d6 d4 Nf6 Nc3 g6 Nf3 Bg7 Be2 O-O O-O c6 a4 a5',
    extra: [
      'e4 d6 d4 Nf6 Nc3 g6 Be3 c6 Qd2 b5 f3 Nbd7 g4 h6',
      'e4 d6 d4 Nf6 Nc3 g6 f4 Bg7 Nf3 O-O Bd3 Na6 O-O c5',
      'e4 d6 d4 Nf6 Nc3 g6 f4 Bg7 Nf3 c5 dxc5 Qa5 Bd3 Qxc5 Qe2 O-O Be3 Qa5',
      'e4 d6 d4 Nf6 Nc3 g6 Bg5 Bg7 Qd2 h6 Bh4 c6 f4 b5',
      'e4 d6 d4 Nf6 Nc3 g6 Nf3 Bg7 h3 O-O Be3 a6 a4 b6',
      'e4 d6 d4 Nf6 Nc3 c6 f4 Qa5 Bd3 e5 Nf3 Bg4',
      'e4 d6 d4 Nf6 Nc3 g6 Be3 Bg7 Qd2 O-O O-O-O c6 f3 b5',
    ] },
  { id: 'scandinavian', side: 'b', eco: 'B01', name: { ar: 'الدفاع الإسكندنافي', en: 'Scandinavian Defense' }, root: 'e4 d5', families: ['Scandinavian Defense'],
    prefer: ['d5', 'Qxd5', 'Qa5', 'Nf6', 'c6', 'Bf5'], main: 'e4 d5 exd5 Qxd5 Nc3 Qa5 d4 Nf6 Nf3 c6 Bc4 Bf5 Bd2 e6 Nd5 Qd8' },
  { id: 'nimzo', side: 'b', eco: 'E20–E59', name: { ar: 'الدفاع النيمزو-هندي', en: 'Nimzo-Indian Defense' }, root: 'd4 Nf6 c4 e6 Nc3 Bb4', families: ['Nimzo-Indian Defense'],
    prefer: ['Bb4', 'O-O', 'd5', 'c5'], main: 'd4 Nf6 c4 e6 Nc3 Bb4 e3 O-O Bd3 d5 Nf3 c5 O-O Nc6 a3 Bxc3 bxc3 dxc4 Bxc4 Qc7' },
  { id: 'qgd', side: 'b', eco: 'D30–D69', name: { ar: 'غامبيت الوزير المرفوض', en: "Queen's Gambit Declined" }, root: 'd4 d5 c4 e6', families: ["Queen's Gambit Declined"],
    prefer: ['e6', 'Nf6', 'Be7', 'O-O'], main: 'd4 d5 c4 e6 Nc3 Nf6 Bg5 Be7 e3 O-O Nf3 Nbd7 Rc1 c6 Bd3 dxc4 Bxc4 Nd5 Bxe7 Qxe7' },
  { id: 'grunfeld', side: 'b', eco: 'D70–D99', name: { ar: 'دفاع غرونفيلد', en: 'Grünfeld Defense' }, root: 'd4 Nf6 c4 g6', families: ['Grünfeld Defense'],
    prefer: ['d5', 'Nxd5', 'Nxc3', 'Bg7', 'c5'], main: 'd4 Nf6 c4 g6 Nc3 d5 cxd5 Nxd5 e4 Nxc3 bxc3 Bg7 Nf3 c5 Be3 Qa5 Qd2 O-O' },
  { id: 'slav', side: 'b', eco: 'D10–D19', name: { ar: 'الدفاع السلافي', en: 'Slav Defense' }, root: 'd4 d5 c4 c6', families: ['Slav Defense'],
    prefer: ['c6', 'Nf6', 'dxc4', 'Bf5'], main: 'd4 d5 c4 c6 Nf3 Nf6 Nc3 dxc4 a4 Bf5 e3 e6 Bxc4 Bb4 O-O O-O' },
  { id: 'dutch', side: 'b', eco: 'A80–A99', name: { ar: 'الدفاع الهولندي', en: 'Dutch Defense' }, root: 'd4 f5', families: ['Dutch Defense'],
    prefer: ['f5', 'Nf6', 'g6', 'Bg7', 'O-O', 'd6'], main: 'd4 f5 g3 Nf6 Bg2 g6 Nf3 Bg7 O-O O-O c4 d6 Nc3 Qe8 d5 a5' },
];

export const openingById = (id: string) => OPENINGS.find((o) => o.id === id);
