import statsJson from '../../data/coach-stats.json';
/**
 * Virtual coaches. Biographical data was checked on 2026-11-22 against the
 * sources listed per coach (see also DATA_SOURCES.md). Ratings are FIDE
 * classical ratings. The app shows the date of every rating it displays.
 *
 * The playing style is an EDUCATIONAL SIMULATION: weights and opening lines
 * summarise what each player is widely known for. They were NOT computed from
 * a 200-game database (none was available offline under a clear licence);
 * `scripts/coach-profile-from-pgn.mjs` can rebuild a profile from PGN files
 * you are allowed to use. Nothing here is a quotation of the real person.
 */

export interface Bi { ar: string; en: string }

export interface StyleWeights {
  /** bonus per pawn of material sacrificed in a sound line */
  sacrifice: number;
  /** bonus per extra attack on the enemy king zone */
  kingAttack: number;
  check: number;
  /** bonus for captures (keeps tension low when negative) */
  capture: number;
  /** bonus per opponent legal move (complex positions) */
  complexity: number;
  /** bonus for trades when ahead / queen trades (technical style) */
  simplify: number;
  centralize: number;
  develop: number;
  /** bonus for passed-pawn pushes (endgame technique) */
  passedPawn: number;
}

export interface CoachProfile {
  id: string;
  name: Bi;
  fullName: string;
  federation: { flag: string; label: Bi };
  born: { date: string; place: Bi };
  died?: { date: string; place: Bi };
  rating: { value: number; kind: 'current' | 'last'; asOf: string; note?: Bi };
  peak: { value: number; asOf: string };
  achievements: Bi[];
  bio: Bi;
  style: Bi;
  strengths: Bi[];
  sources: string[];
  /** AI-generated illustrative portrait from the project's asset pack (not a photograph) */
  portrait: string;
  /** emblem */
  color: [string, string];
  symbol: 'hourglass' | 'bolt' | 'target' | 'comet' | 'flame' | 'diamond' | 'chevrons';
  monogram: string;
  weights: StyleWeights;
  /** cp the coach may give up versus the engine's best move to play in its style, at full strength */
  styleMarginCp: number;
  book: { white: string[]; black: string[] };
}

export const COACHES: CoachProfile[] = [
  {
    id: 'carlsen',
    name: { ar: 'ماغنوس كارلسن', en: 'Magnus Carlsen' },
    fullName: 'Sven Magnus Øen Carlsen',
    federation: { flag: 'norway', label: { ar: 'النرويج', en: 'Norway' } },
    born: { date: '1990-11-30', place: { ar: 'تونسبيرغ، النرويج', en: 'Tønsberg, Norway' } },
    rating: { value: 2823, kind: 'current', asOf: '2026-11' },
    peak: { value: 2882, asOf: '2014-05' },
    achievements: [
      { ar: 'بطل العالم 2013–2023', en: 'World Champion 2013–2023' },
      { ar: 'أعلى تصنيف في التاريخ (2882)', en: 'Highest rating in history (2882)' },
      { ar: 'المصنف الأول عالمياً منذ يوليو 2011', en: 'World No. 1 since July 2011' },
    ],
    bio: {
      ar: 'بطل العالم السادس عشر، حافظ على اللقب عشر سنوات قبل أن يتخلى عن الدفاع عنه، ولا يزال المصنف الأول في العالم.',
      en: 'The 16th World Champion; he held the title for ten years before declining to defend it and remains world No. 1.',
    },
    style: {
      ar: 'ضغط مستمر في وضعيات تبدو متعادلة، واستغلال الأفضليات الصغيرة، وتقنية عالية في النهايات.',
      en: 'Relentless pressure in seemingly equal positions, squeezing small edges, superb endgame technique.',
    },
    strengths: [
      { ar: 'النهايات', en: 'Endgames' },
      { ar: 'المرونة الافتتاحية', en: 'Opening flexibility' },
      { ar: 'الدفاع العنيد', en: 'Stubborn defence' },
    ],
    sources: ['FIDE November 2026 list (via ChessBase)', 'Wikipedia: List of chess players by peak FIDE rating'],
    portrait: './coaches/carlsen.webp',
    color: ['#2f6d9b', '#173a57'],
    symbol: 'hourglass',
    monogram: 'MC',
    weights: { sacrifice: 0, kingAttack: 4, check: 2, capture: 2, complexity: 0.5, simplify: 18, centralize: 8, develop: 8, passedPawn: 20 },
    styleMarginCp: 25,
    book: {
      white: [
        'e4 e5 Nf3 Nc6 Bb5 Nf6 d3 Bc5 c3 O-O O-O d6',
        'e4 e5 Nf3 Nc6 Bc4 Bc5 c3 Nf6 d3 d6 O-O',
        'e4 c5 Nf3 Nc6 Bb5 g6 O-O Bg7 Re1',
        'e4 c5 Nf3 d6 d4 cxd4 Nxd4 Nf6 Nc3 a6 h3',
        'e4 e6 d4 d5 Nd2 Nf6 e5 Nfd7 Bd3 c5 c3',
        'e4 c6 d4 d5 e5 Bf5 Nf3 e6 Be2',
        'd4 Nf6 c4 e6 Nf3 d5 Nc3 Be7 Bf4 O-O e3',
      ],
      black: [
        'e4 c5 Nf3 Nc6 d4 cxd4 Nxd4 Nf6 Nc3 e5 Ndb5 d6',
        'e4 e5 Nf3 Nc6 Bb5 Nf6 O-O Nxe4 d4 Nd6 Bxc6 dxc6 dxe5 Nf5',
        'd4 Nf6 c4 e6 Nc3 Bb4 e3 O-O',
        'd4 Nf6 c4 e6 Nf3 d5 Nc3 Be7',
        'd4 d5 c4 e6 Nc3 Nf6 Bg5 Be7',
        'c4 e5 Nc3 Nf6 Nf3 Nc6',
        'Nf3 d5 g3 Nf6 Bg2 c6',
      ],
    },
  },
  {
    id: 'nakamura',
    name: { ar: 'هيكارو ناكامورا', en: 'Hikaru Nakamura' },
    fullName: 'Hikaru Nakamura',
    federation: { flag: 'united-states', label: { ar: 'الولايات المتحدة', en: 'United States' } },
    born: { date: '1987-12-09', place: { ar: 'هيراكاتا، اليابان', en: 'Hirakata, Japan' } },
    rating: { value: 2792, kind: 'current', asOf: '2026-11', note: { ar: 'نادراً ما يلعب الشطرنج الكلاسيكي حالياً', en: 'Rarely plays classical chess at present' } },
    peak: { value: 2816, asOf: '2015-10' },
    achievements: [
      { ar: 'بطل الولايات المتحدة خمس مرات', en: 'Five-time US Champion' },
      { ar: 'بطل العالم للشطرنج العشوائي (فيشر راندوم) 2022', en: 'FIDE World Fischer Random Champion 2022' },
      { ar: 'من أقوى لاعبي الشطرنج السريع والخاطف في العالم', en: 'One of the strongest blitz and rapid players in the world' },
    ],
    bio: {
      ar: 'غراند ماستر أمريكي وُلد في اليابان، أصبح من أشهر وجوه الشطرنج عبر البث المباشر، واحتل المركز الثاني عالمياً في الكلاسيكي.',
      en: 'Japanese-born American grandmaster, one of the best-known faces of online chess and No. 2 in the world in classical chess.',
    },
    style: {
      ar: 'حساب سريع، ونشاط تكتيكي، ودفاع عملي صلب، مع ميل لإبقاء الوضعية مليئة بالقطع.',
      en: 'Fast calculation, tactical activity and practical, resilient defence, keeping plenty of pieces on the board.',
    },
    strengths: [
      { ar: 'التكتيك', en: 'Tactics' },
      { ar: 'السرعة', en: 'Speed' },
      { ar: 'الدفاع العملي', en: 'Practical defence' },
    ],
    sources: ['FIDE November 2026 list (via ChessBase)', 'FIDE top list API (birth date)', 'Wikipedia: List of chess players by peak FIDE rating'],
    portrait: './coaches/nakamura.webp',
    color: ['#c2452f', '#6d1f14'],
    symbol: 'bolt',
    monogram: 'HN',
    weights: { sacrifice: 6, kingAttack: 10, check: 10, capture: 6, complexity: 1.2, simplify: 2, centralize: 6, develop: 8, passedPawn: 8 },
    styleMarginCp: 30,
    book: {
      white: [
        'e4 e5 Nf3 Nc6 Bc4 Nf6 d3 Bc5 c3 d6 O-O',
        'e4 c5 Nf3 d6 d4 cxd4 Nxd4 Nf6 Nc3 a6 Be3 e5 Nb3',
        'e4 e6 d4 d5 Nc3 Nf6 e5 Nfd7 f4 c5 Nf3',
        'd4 Nf6 c4 e6 Nf3 d5 Nc3 Be7 Bf4 O-O e3',
        'Nf3 d5 g3 Nf6 Bg2 c6 O-O',
      ],
      black: [
        'd4 Nf6 c4 g6 Nc3 Bg7 e4 d6 Nf3 O-O Be2 e5 O-O Nc6 d5 Ne7',
        'e4 e5 Nf3 Nc6 Bb5 Nf6 O-O Nxe4 d4 Nd6',
        'e4 c5 Nf3 d6 d4 cxd4 Nxd4 Nf6 Nc3 a6',
        'c4 e5 Nc3 Nf6 Nf3 Nc6 g3 d5',
        'Nf3 Nf6 c4 g6 Nc3 Bg7',
      ],
    },
  },
  {
    id: 'caruana',
    name: { ar: 'فابيانو كاروانا', en: 'Fabiano Caruana' },
    fullName: 'Fabiano Luigi Caruana',
    federation: { flag: 'united-states', label: { ar: 'الولايات المتحدة', en: 'United States' } },
    born: { date: '1992-07-30', place: { ar: 'ميامي، الولايات المتحدة', en: 'Miami, United States' } },
    rating: { value: 2783, kind: 'current', asOf: '2026-11' },
    peak: { value: 2844, asOf: '2014-10' },
    achievements: [
      { ar: 'متحدي بطولة العالم 2018', en: 'World Championship challenger 2018' },
      { ar: 'أداء تاريخي 3098 في كأس سينكفيلد 2014', en: 'Historic 3098 performance at the 2014 Sinquefield Cup' },
      { ar: 'ثالث أعلى تصنيف في التاريخ (2844)', en: 'Third-highest rating in history (2844)' },
    ],
    bio: {
      ar: 'غراند ماستر إيطالي أمريكي وُلد في ميامي ونشأ في بروكلين، ولعب لإيطاليا بين 2005 و2015 ثم عاد إلى الاتحاد الأمريكي.',
      en: 'Italian-American grandmaster born in Miami and raised in Brooklyn; he played for Italy 2005–2015 before returning to the US federation.',
    },
    style: {
      ar: 'تحضير افتتاحي عميق، ولعب كلاسيكي دقيق، وحساب طويل في الوضعيات الحادة.',
      en: 'Deep opening preparation, precise classical play and long calculation in sharp positions.',
    },
    strengths: [
      { ar: 'التحضير الافتتاحي', en: 'Opening preparation' },
      { ar: 'الحساب', en: 'Calculation' },
      { ar: 'الدقة', en: 'Precision' },
    ],
    sources: ['FIDE November 2026 list (via ChessBase)', 'Wikipedia: Fabiano Caruana'],
    portrait: './coaches/caruana.webp',
    color: ['#3d8a5f', '#1c4a31'],
    symbol: 'target',
    monogram: 'FC',
    weights: { sacrifice: 2, kingAttack: 6, check: 4, capture: 4, complexity: 0.5, simplify: 6, centralize: 10, develop: 10, passedPawn: 12 },
    styleMarginCp: 15,
    book: {
      white: [
        'e4 e5 Nf3 Nc6 Bb5 a6 Ba4 Nf6 O-O Be7 Re1 b5 Bb3 O-O h3',
        'e4 e5 Nf3 Nf6 Nxe5 d6 Nf3 Nxe4 d4 d5 Bd3',
        'e4 c5 Nf3 Nc6 Bb5 g6 Bxc6 dxc6 d3',
        'e4 c5 Nf3 d6 d4 cxd4 Nxd4 Nf6 Nc3 a6 Be3 e5 Nb3',
        'e4 e6 d4 d5 Nc3 Nf6 e5 Nfd7 f4 c5 Nf3',
        'e4 c6 d4 d5 e5 Bf5 Nf3 e6 Be2',
        'd4 Nf6 c4 e6 Nf3 d5 Nc3 Be7 Bf4 O-O e3',
      ],
      black: [
        'e4 e5 Nf3 Nf6 Nxe5 d6 Nf3 Nxe4 d4 d5 Bd3 Nc6',
        'e4 c5 Nf3 Nc6 d4 cxd4 Nxd4 Nf6 Nc3 e5 Ndb5 d6',
        'd4 Nf6 c4 e6 Nf3 d5 Nc3 Bb4',
        'd4 d5 c4 e6 Nc3 Nf6 Bg5 Be7',
        'c4 e5 Nc3 Nf6 Nf3 Nc6',
        'Nf3 d5 g3 Nf6 Bg2 c6',
      ],
    },
  },
  {
    id: 'firouzja',
    name: { ar: 'علي رضا فيروزجا', en: 'Alireza Firouzja' },
    fullName: 'Alireza Firouzja',
    federation: { flag: 'france', label: { ar: 'فرنسا', en: 'France' } },
    born: { date: '2003-06-18', place: { ar: 'بابل، إيران', en: 'Babol, Iran' } },
    rating: { value: 2757, kind: 'current', asOf: '2026-11' },
    peak: { value: 2804, asOf: '2021-12' },
    achievements: [
      { ar: 'أصغر لاعب في التاريخ يتجاوز تصنيف 2800', en: 'Youngest player ever to pass a 2800 rating' },
      { ar: 'بطل الغراند سويس 2021', en: 'Winner of the 2021 FIDE Grand Swiss' },
      { ar: 'بطل جولة الشطرنج الكبرى 2022 و2024', en: 'Grand Chess Tour champion 2022 and 2024' },
    ],
    bio: {
      ar: 'وُلد في إيران وغادر اتحادها عام 2019، ثم مثّل فرنسا منذ 2021 بعد حصوله على الجنسية الفرنسية.',
      en: 'Born in Iran, he left its federation in 2019 and has represented France since 2021 after becoming a French citizen.',
    },
    style: {
      ar: 'هجومي وديناميكي، يحب المبادرة والتعقيد، ويخاطر لصنع فرص الفوز.',
      en: 'Aggressive and dynamic; loves the initiative and complications and takes risks to create winning chances.',
    },
    strengths: [
      { ar: 'الهجوم', en: 'Attack' },
      { ar: 'المبادرة', en: 'Initiative' },
      { ar: 'الشطرنج السريع', en: 'Fast time controls' },
    ],
    sources: ['FIDE November 2026 list (via ChessBase)', 'Wikipedia: Alireza Firouzja'],
    portrait: './coaches/firouzja.webp',
    color: ['#7b4bb3', '#3b215e'],
    symbol: 'comet',
    monogram: 'AF',
    weights: { sacrifice: 10, kingAttack: 12, check: 8, capture: 4, complexity: 1.5, simplify: -4, centralize: 6, develop: 8, passedPawn: 6 },
    styleMarginCp: 45,
    book: {
      white: [
        'e4 e5 Nf3 Nc6 Bc4 Nf6 d3 Bc5 c3 d6 O-O',
        'e4 e5 Nf3 Nc6 Bb5 a6 Ba4 Nf6 O-O Be7 Re1 b5 Bb3',
        'e4 c5 Nf3 d6 d4 cxd4 Nxd4 Nf6 Nc3 a6 Be3 e5 Nf3',
        'e4 e6 d4 d5 Nc3 Nf6 e5 Nfd7 f4',
        'e4 c6 d4 d5 e5 Bf5 Nf3 e6 Be2',
        'd4 d5 c4 e6 Nc3 Nf6 Bg5 Be7 e3',
      ],
      black: [
        'e4 c5 Nf3 d6 d4 cxd4 Nxd4 Nf6 Nc3 a6',
        'e4 e5 Nf3 Nc6 Bb5 a6 Ba4 Nf6 O-O Be7',
        'd4 Nf6 c4 e6 Nf3 d5 Nc3 Be7',
        'd4 Nf6 c4 g6 Nc3 d5 cxd5 Nxd5 e4 Nxc3 bxc3 Bg7',
        'c4 e5 Nc3 Nf6',
        'Nf3 d5 g3 Nf6 Bg2 c6',
      ],
    },
  },
  {
    id: 'tal',
    name: { ar: 'ميخائيل تال', en: 'Mikhail Tal' },
    fullName: 'Mikhail Nekhemyevich Tal',
    federation: { flag: 'latvia', label: { ar: 'لاتفيا (الاتحاد السوفيتي حتى 1991)', en: 'Latvia (Soviet Union until 1991)' } },
    born: { date: '1936-11-09', place: { ar: 'ريغا، لاتفيا', en: 'Riga, Latvia' } },
    died: { date: '1992-06-28', place: { ar: 'موسكو، روسيا', en: 'Moscow, Russia' } },
    rating: { value: 2525, kind: 'last', asOf: '1992', note: { ar: 'كما يظهر في سجلات مباريات برشلونة 1992؛ لا نملك نسخة رسمية من آخر قائمة FIDE', en: 'As shown in 1992 Barcelona game records; we do not hold an official copy of his last FIDE list' } },
    peak: { value: 2705, asOf: '1980-01' },
    achievements: [
      { ar: 'بطل العالم الثامن 1960–1961', en: '8th World Champion 1960–1961' },
      { ar: 'بطل الاتحاد السوفيتي ست مرات', en: 'Six-time Soviet Champion' },
      { ar: 'ثماني ميداليات ذهبية مع الفريق السوفيتي في الأولمبياد', en: 'Eight Olympiad team gold medals with the USSR' },
    ],
    bio: {
      ar: 'بطل العالم الثامن، اشتهر بلقب «ساحر ريغا»، وكان أيضاً كاتباً ومحللاً شطرنجياً بارزاً.',
      en: 'The eighth World Champion, nicknamed “the Magician from Riga”, and also a notable chess writer and annotator.',
    },
    style: {
      ar: 'هجوم وتضحيات معقدة، ورمي الخصم في وضعيات غير مألوفة يصعب حسابها.',
      en: 'Attack and complex sacrifices, throwing the opponent into unfamiliar positions that are hard to calculate.',
    },
    strengths: [
      { ar: 'التضحيات', en: 'Sacrifices' },
      { ar: 'الهجوم على الملك', en: 'King attacks' },
      { ar: 'الخيال', en: 'Imagination' },
    ],
    sources: ['Wikipedia: Mikhail Tal', '365chess.com: Mikhail Tal (1992 game ratings, opening repertoire)'],
    portrait: './coaches/tal.webp',
    color: ['#d9792b', '#7a3a0c'],
    symbol: 'flame',
    monogram: 'MT',
    weights: { sacrifice: 16, kingAttack: 14, check: 10, capture: 2, complexity: 2, simplify: -8, centralize: 4, develop: 6, passedPawn: 4 },
    styleMarginCp: 60,
    book: {
      white: [
        'e4 e5 Nf3 Nc6 Bb5 a6 Ba4 Nf6 O-O Be7 Re1 b5 Bb3 d6 c3 O-O h3',
        'e4 c5 Nf3 d6 d4 cxd4 Nxd4 Nf6 Nc3 a6 Bg5 e6 f4',
        'e4 c5 Nf3 e6 d4 cxd4 Nxd4 Nc6 Nc3 Qc7 Be2',
        'e4 e6 d4 d5 Nd2 c5 exd5 exd5 Ngf3',
        'e4 c6 Nc3 d5 Nf3 Bg4 h3',
        'c4 c5 Nc3 Nc6 g3 g6 Bg2 Bg7',
      ],
      black: [
        'e4 c5 Nf3 d6 d4 cxd4 Nxd4 Nf6 Nc3 a6',
        'e4 c5 Nf3 d6 d4 cxd4 Nxd4 Nf6 Nc3 e6',
        'e4 e5 Nf3 Nc6 Bb5 a6 Ba4 Nf6 O-O Be7',
        'd4 Nf6 c4 c5 d5 e6 Nc3 exd5 cxd5 d6',
        'd4 Nf6 c4 e6 Nc3 Bb4',
        'c4 Nf6 Nc3 e6',
        'Nf3 Nf6 c4 e6',
      ],
    },
  },
  {
    id: 'fischer',
    name: { ar: 'بوبي فيشر', en: 'Bobby Fischer' },
    fullName: 'Robert James Fischer',
    federation: { flag: 'united-states', label: { ar: 'الولايات المتحدة', en: 'United States' } },
    born: { date: '1943-03-09', place: { ar: 'شيكاغو، الولايات المتحدة', en: 'Chicago, United States' } },
    died: { date: '2008-01-17', place: { ar: 'ريكيافيك، آيسلندا', en: 'Reykjavík, Iceland' } },
    rating: { value: 2780, kind: 'last', asOf: '1970s', note: { ar: 'آخر تصنيف FIDE حسب chessgames.com', en: 'Last FIDE rating according to chessgames.com' } },
    peak: { value: 2785, asOf: '1972-07' },
    achievements: [
      { ar: 'بطل العالم الحادي عشر 1972–1975', en: '11th World Champion 1972–1975' },
      { ar: 'بطل الولايات المتحدة ثماني مرات (رقم قياسي)', en: 'Record eight-time US Champion' },
      { ar: 'مبتكر شطرنج فيشر العشوائي (960)', en: 'Inventor of Fischer Random (Chess960)' },
    ],
    bio: {
      ar: 'أمريكي هزم بوريس سباسكي في ريكيافيك عام 1972 وأنهى سيطرة السوفييت على اللقب، ثم ابتعد عن المنافسات الرسمية.',
      en: 'The American who beat Boris Spassky in Reykjavík in 1972, ending Soviet dominance of the title, then withdrew from official play.',
    },
    style: {
      ar: 'وضوح ودقة، وقطع نشطة، وتحويل الأفضلية إلى فوز بأسلوب منطقي ومباشر.',
      en: 'Clarity and precision, active pieces, and converting advantages in a logical, direct way.',
    },
    strengths: [
      { ar: 'الدقة', en: 'Precision' },
      { ar: 'نشاط القطع', en: 'Piece activity' },
      { ar: 'الافتتاحيات (1.e4 والنايدورف)', en: 'Openings (1.e4 and the Najdorf)' },
    ],
    sources: ['Wikipedia: Bobby Fischer', 'chessgames.com: Bobby Fischer (last FIDE rating)'],
    portrait: './coaches/fischer.webp',
    color: ['#2b4c8c', '#14254a'],
    symbol: 'diamond',
    monogram: 'BF',
    weights: { sacrifice: 3, kingAttack: 8, check: 4, capture: 6, complexity: 0.5, simplify: 8, centralize: 12, develop: 10, passedPawn: 12 },
    styleMarginCp: 20,
    book: {
      white: [
        'e4 e5 Nf3 Nc6 Bb5 a6 Bxc6 dxc6 O-O f6 d4',
        'e4 e5 Nf3 Nc6 Bb5 a6 Ba4 Nf6 O-O Be7 Re1 b5 Bb3 d6 c3 O-O h3',
        'e4 c5 Nf3 d6 d4 cxd4 Nxd4 Nf6 Nc3 a6 Bc4 e6 Bb3',
        'e4 c5 Nf3 Nc6 d4 cxd4 Nxd4 Nf6 Nc3 d6 Bc4',
        'e4 e6 d4 d5 Nc3 Bb4 e5 c5 a3 Bxc3+ bxc3',
        'e4 c6 Nc3 d5 Nf3 Bg4 h3',
        'c4 e6 Nf3 d5 d4 Nf6 Nc3',
      ],
      black: [
        'e4 c5 Nf3 d6 d4 cxd4 Nxd4 Nf6 Nc3 a6',
        'd4 Nf6 c4 g6 Nc3 Bg7 e4 d6 Nf3 O-O Be2 e5',
        'd4 Nf6 c4 g6 Nc3 d5 cxd5 Nxd5 e4 Nxc3 bxc3 Bg7',
        'c4 Nf6 Nc3 g6',
        'Nf3 Nf6 c4 g6',
        'e4 e5 Nf3 Nc6 Bb5 a6 Ba4 Nf6 O-O Be7',
      ],
    },
  },
  {
    id: 'kasparov',
    name: { ar: 'غاري كاسباروف', en: 'Garry Kasparov' },
    fullName: 'Garry Kimovich Kasparov',
    federation: { flag: 'russia', label: { ar: 'روسيا (الاتحاد السوفيتي حتى 1991)', en: 'Russia (Soviet Union until 1991)' } },
    born: { date: '1963-04-13', place: { ar: 'باكو، أذربيجان (الاتحاد السوفيتي)', en: 'Baku, Azerbaijan SSR' } },
    rating: { value: 2812, kind: 'last', asOf: '2005', note: { ar: 'اعتزل عام 2005 وتصنيفه غير نشط منذ ذلك الحين', en: 'Retired in 2005; rating inactive since' } },
    peak: { value: 2851, asOf: '1999-07' },
    achievements: [
      { ar: 'بطل العالم 1985–2000', en: 'World Champion 1985–2000' },
      { ar: 'المصنف الأول عالمياً 255 شهراً (رقم قياسي)', en: 'World No. 1 for a record 255 months' },
      { ar: 'أعلى تصنيف في التاريخ حتى 2013 (2851)', en: 'Highest rating in history until 2013 (2851)' },
    ],
    bio: {
      ar: 'أصبح أصغر بطل عالم عام 1985 بعد فوزه على كاربوف، وبقي المصنف الأول حتى اعتزاله المنافسات المنتظمة عام 2005.',
      en: 'Became the youngest World Champion in 1985 by beating Karpov, and stayed world No. 1 until retiring from regular play in 2005.',
    },
    style: {
      ar: 'مبادرة دائمة، وتحضير افتتاحي عميق، وهجوم ديناميكي مع لعب نشط للقطع.',
      en: 'Constant initiative, deep opening preparation and dynamic attacks with highly active pieces.',
    },
    strengths: [
      { ar: 'المبادرة', en: 'Initiative' },
      { ar: 'التحضير الافتتاحي', en: 'Opening preparation' },
      { ar: 'الهجوم الديناميكي', en: 'Dynamic attack' },
    ],
    sources: ['Wikipedia: Garry Kasparov', 'chessgames.com: Garry Kasparov (last FIDE rating)'],
    portrait: './coaches/kasparov.webp',
    color: ['#a32638', '#4f0f1a'],
    symbol: 'chevrons',
    monogram: 'GK',
    weights: { sacrifice: 10, kingAttack: 14, check: 8, capture: 4, complexity: 1.2, simplify: -2, centralize: 10, develop: 12, passedPawn: 6 },
    styleMarginCp: 35,
    book: {
      white: [
        'e4 c5 Nf3 d6 d4 cxd4 Nxd4 Nf6 Nc3 a6 Be3 e5 Nb3',
        'e4 e5 Nf3 Nc6 Bb5 a6 Ba4 Nf6 O-O Be7 Re1 b5 Bb3 d6 c3 O-O h3',
        'd4 d5 c4 e6 Nc3 Nf6 Bg5 Be7 e3 O-O Nf3',
        'd4 Nf6 c4 e6 Nc3 Bb4 Qc2 O-O a3 Bxc3+ Qxc3',
        'd4 Nf6 c4 g6 Nc3 Bg7 e4 d6 Nf3 O-O Be2 e5 O-O',
        'e4 e6 d4 d5 Nc3 Nf6 e5 Nfd7 f4 c5 Nf3',
        'e4 c6 d4 d5 e5 Bf5 Nf3 e6 Be2',
      ],
      black: [
        'e4 c5 Nf3 d6 d4 cxd4 Nxd4 Nf6 Nc3 a6',
        'e4 c5 Nf3 d6 d4 cxd4 Nxd4 Nf6 Nc3 e6',
        'd4 Nf6 c4 g6 Nc3 Bg7 e4 d6 Nf3 O-O Be2 e5',
        'd4 Nf6 c4 g6 Nc3 d5 cxd5 Nxd5 e4 Nxc3 bxc3 Bg7',
        'e4 e5 Nf3 Nc6 Bb5 Nf6 O-O Nxe4 d4 Nd6',
        'c4 e5 Nc3 Nf6',
        'Nf3 Nf6 c4 g6',
      ],
    },
  },
];

export function coachById(id: string) {
  return COACHES.find((c) => c.id === id);
}

/**
 * Difficulty for coaches. Each level is a human-like player: it searches to `depth`, looks at
 * `multipv` candidate moves (0 = every legal move) and picks one at random with probability
 * ∝ exp(score / temperature), so weaker levels make more and bigger mistakes.
 * The numbers were tuned by self-play (scripts/coach-data/calibrate-levels.ts) so the average
 * centipawn loss of each level matches real Lichess players of `targetRating`
 * (see DATA_SOURCES.md). `targetRating` is approximate, not a promise.
 * Measured median ACPL (self-play, 10 game sides per level, depth-10 re-analysis):
 *   L1 150 · L2 109 · L3 73 · L4 63 · L5 35–47 · L6 28 · L7 6.
 * Lichess players (our sample): ~950 → 100, ~1250 → 77, ~1550 → 67, ~1850 → 55, ~2200 → 45.
 * At L5–L6 the depth-10 yardstick under-measures errors of a similarly deep search, so their
 * true ACPL is higher than shown; treat 1900/2200 as rough.
 */
export interface CoachLevel {
  level: number;
  targetRating: number;
  depth: number;
  multipv: number;
  temperature: number;
  blindness: number;
  label: Bi;
}
export const COACH_LEVELS: CoachLevel[] = [
  { level: 1, targetRating: 700, depth: 2, multipv: 0, temperature: 150, blindness: 0.1, label: { ar: 'مبتدئ', en: 'Beginner' } },
  { level: 2, targetRating: 1000, depth: 3, multipv: 0, temperature: 110, blindness: 0.08, label: { ar: 'مبتدئ+', en: 'Novice' } },
  { level: 3, targetRating: 1300, depth: 4, multipv: 16, temperature: 95, blindness: 0.03, label: { ar: 'هاوٍ', en: 'Casual' } },
  { level: 4, targetRating: 1600, depth: 6, multipv: 10, temperature: 75, blindness: 0.01, label: { ar: 'نادي', en: 'Club' } },
  { level: 5, targetRating: 1900, depth: 8, multipv: 8, temperature: 70, blindness: 0, label: { ar: 'متقدم', en: 'Advanced' } },
  { level: 6, targetRating: 2200, depth: 10, multipv: 8, temperature: 50, blindness: 0, label: { ar: 'خبير', en: 'Expert' } },
  { level: 7, targetRating: 0, depth: 13, multipv: 4, temperature: 6, blindness: 0, label: { ar: 'أقصى قوة', en: 'Full strength' } },
];
export const coachLevel = (n: number) => COACH_LEVELS[Math.min(Math.max(Math.round(n), 1), COACH_LEVELS.length) - 1];

// ---- measured data from the coaches' real games (scripts/coach-data/build-coach-profiles.ts) ----
export interface CoachGameStats {
  games: number; analysedMoves: number; from: string | null; to: string | null;
  score: { win: number; draw: number; loss: number };
  acpl: number; bestMoveRate: number; captureRate: number; checkRate: number;
  sacrificePer100: number; soundSacrificePer100: number; kingPressure: number; queenTradeRate: number;
  avgMoves: number; topOpenings: { name: string; n: number }[];
}
type StatsFile = { source: string; coaches: Record<string, { stats: CoachGameStats; styleFactor: Partial<Record<keyof StyleWeights, number>> }> };
const STATS = statsJson as StatsFile;
export const coachGameStats = (id: string): CoachGameStats | null => STATS.coaches[id]?.stats ?? null;
export const COACH_DATA_SOURCE = STATS.source;

/** The coach with its style weights scaled by what its real games show (sacrifices, king pressure, checks, …). */
export function withMeasuredStyle(c: CoachProfile): CoachProfile {
  const f = STATS.coaches[c.id]?.styleFactor;
  if (!f) return c;
  const w = { ...c.weights };
  for (const k of Object.keys(f) as (keyof StyleWeights)[]) w[k] = +(w[k] * (f[k] ?? 1)).toFixed(2);
  return { ...c, weights: w };
}

type TreeFile = { coaches: Record<string, Record<string, [string, number][]>> };
let trees: Promise<TreeFile> | null = null;
/** Opening moves the coach really played (lazy: the file is large). */
export async function coachTree(id: string): Promise<Record<string, [string, number][]> | undefined> {
  trees ??= import('../../data/coach-trees.json').then((m) => (m.default ?? m) as unknown as TreeFile);
  return (await trees).coaches[id];
}
