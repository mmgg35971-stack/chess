// Names and short explanations of puzzle themes (Lichess theme ids), Arabic and English.
// Shown after a puzzle is solved (spec 7.6) and on the statistics screen.
import type { Lang } from '../settings';

type Bi = { ar: string; en: string };
export const THEMES: Record<string, { name: Bi; idea: Bi }> = {
  fork: { name: { ar: 'شوكة', en: 'Fork' }, idea: { ar: 'قطعة واحدة تهاجم هدفين أو أكثر في الوقت نفسه، فلا يستطيع الخصم إنقاذهما معًا.', en: 'One piece attacks two or more targets at once, so the opponent cannot save both.' } },
  pin: { name: { ar: 'تثبيت', en: 'Pin' }, idea: { ar: 'قطعة الخصم لا تستطيع التحرك دون كشف قطعة أثمن خلفها (أو الملك).', en: 'An enemy piece cannot move without exposing a more valuable piece (or the king) behind it.' } },
  skewer: { name: { ar: 'سيخ', en: 'Skewer' }, idea: { ar: 'هجوم على قطعة ثمينة يجبرها على التنحي، فتُكسب القطعة التي خلفها.', en: 'A valuable piece is attacked and must move, exposing the piece behind it.' } },
  discoveredAttack: { name: { ar: 'هجوم مكشوف', en: 'Discovered attack' }, idea: { ar: 'تحريك قطعة يفتح خطّ هجوم لقطعة أخرى خلفها، فيتولد تهديدان.', en: 'Moving one piece opens a line for another behind it, creating two threats.' } },
  doubleCheck: { name: { ar: 'كش مزدوج', en: 'Double check' }, idea: { ar: 'كش من قطعتين معًا؛ لا يمكن صدّه إلا بتحريك الملك.', en: 'Check from two pieces at once; the only defence is to move the king.' } },
  hangingPiece: { name: { ar: 'قطعة غير محمية', en: 'Hanging piece' }, idea: { ar: 'قطعة للخصم بلا حماية كافية ويمكن أخذها مجانًا.', en: 'An enemy piece is insufficiently defended and can be taken for free.' } },
  trappedPiece: { name: { ar: 'قطعة محاصرة', en: 'Trapped piece' }, idea: { ar: 'قطعة لا تجد مربعًا آمنًا للهروب، فتُكسب.', en: 'A piece has no safe square to escape to and is won.' } },
  deflection: { name: { ar: 'إبعاد', en: 'Deflection' }, idea: { ar: 'إجبار قطعة مدافعة على ترك واجبها (حماية مربع أو قطعة).', en: 'Force a defending piece away from the square or piece it guards.' } },
  attraction: { name: { ar: 'جذب', en: 'Attraction' }, idea: { ar: 'إجبار قطعة (غالبًا الملك) على الانتقال إلى مربع سيئ لها، غالبًا بتضحية.', en: 'Lure a piece (often the king) onto a bad square, usually with a sacrifice.' } },
  clearance: { name: { ar: 'إخلاء', en: 'Clearance' }, idea: { ar: 'إخلاء مربع أو خط بنقلة مع كسب وقت، لتستفيد منه قطعة أخرى.', en: 'Vacate a square or line with tempo so another piece can use it.' } },
  interference: { name: { ar: 'اعتراض', en: 'Interference' }, idea: { ar: 'وضع قطعة بين قطعة مدافعة وما تحميه لقطع الاتصال بينهما.', en: 'Put a piece between a defender and what it protects, cutting the connection.' } },
  xRayAttack: { name: { ar: 'هجوم بالأشعة', en: 'X-ray attack' }, idea: { ar: 'قطعة تؤثر على مربع عبر قطعة أخرى تقع على الخط نفسه.', en: 'A piece acts through another piece on the same line.' } },
  intermezzo: { name: { ar: 'نقلة وسيطة', en: 'Intermezzo' }, idea: { ar: 'بدل الرد المتوقع، نقلة مُلزِمة أولًا (كش أو تهديد) تغيّر الحساب.', en: 'Instead of the expected reply, a forcing move first (check or threat) changes the outcome.' } },
  capturingDefender: { name: { ar: 'أخذ المدافع', en: 'Capturing the defender' }, idea: { ar: 'إزالة القطعة التي تحمي هدفًا، ثم أخذ الهدف.', en: 'Remove the piece that protects a target, then win the target.' } },
  sacrifice: { name: { ar: 'تضحية', en: 'Sacrifice' }, idea: { ar: 'التخلي عن مادة مؤقتًا لكسب أكبر: كش مات أو مادة أكثر أو هجوم حاسم.', en: 'Give up material temporarily for something bigger: mate, more material or a decisive attack.' } },
  quietMove: { name: { ar: 'نقلة هادئة', en: 'Quiet move' }, idea: { ar: 'نقلة بلا أخذ ولا كش، لكنها تخلق تهديدًا لا يُصدّ أو تمنع دفاع الخصم.', en: 'A move with no capture or check that creates an unstoppable threat or prevents the defence.' } },
  defensiveMove: { name: { ar: 'نقلة دفاعية', en: 'Defensive move' }, idea: { ar: 'النقلة الوحيدة (أو الأفضل) التي تتفادى خسارة مادة أو المباراة.', en: 'The only (or best) move that avoids losing material or the game.' } },
  equality: { name: { ar: 'التعادل', en: 'Equality' }, idea: { ar: 'من موقف أسوأ، الوصول إلى موقف متعادل أو إنقاذ المباراة.', en: 'From a worse position, reach equality or save the game.' } },
  promotion: { name: { ar: 'ترقية', en: 'Promotion' }, idea: { ar: 'تقدّم البيدق حتى الصف الأخير وترقيته (عادة إلى وزير).', en: 'Push the pawn to the last rank and promote it (usually to a queen).' } },
  underPromotion: { name: { ar: 'ترقية إلى قطعة أضعف', en: 'Underpromotion' }, idea: { ar: 'الترقية إلى حصان أو قلعة أو فيل لأن الوزير لا يحقق الهدف.', en: 'Promote to a knight, rook or bishop because a queen would not work.' } },
  advancedPawn: { name: { ar: 'بيدق متقدم', en: 'Advanced pawn' }, idea: { ar: 'بيدق قريب من الترقية يصنع تهديدًا يقيّد الخصم.', en: 'A pawn close to promotion creates threats that tie the opponent down.' } },
  zugzwang: { name: { ar: 'تسوغزوانغ', en: 'Zugzwang' }, idea: { ar: 'الخصم مُجبر على التحرك وكل نقلة متاحة تُضعف موقفه.', en: 'The opponent must move, and every move makes things worse.' } },
  kingsideAttack: { name: { ar: 'هجوم على جناح الملك', en: 'Kingside attack' }, idea: { ar: 'تركيز القطع ضد الملك المُبيَّت قصيرًا.', en: 'Pieces combine against the king castled short.' } },
  queensideAttack: { name: { ar: 'هجوم على جناح الوزير', en: 'Queenside attack' }, idea: { ar: 'هجوم على الملك المُبيَّت طويلًا.', en: 'An attack on the king castled long.' } },
  exposedKing: { name: { ar: 'ملك مكشوف', en: 'Exposed king' }, idea: { ar: 'ملك بلا حماية بيادق كافية؛ الكشوش المتتالية حاسمة.', en: 'A king without enough pawn cover; a series of checks is decisive.' } },
  attackingF2F7: { name: { ar: 'هجوم على f2/f7', en: 'Attacking f2/f7' }, idea: { ar: 'المربع f2/f7 يحميه الملك وحده في البداية، فهو هدف شائع.', en: 'f2/f7 is guarded only by the king early on, a common target.' } },
  backRankMate: { name: { ar: 'مات الصف الأخير', en: 'Back-rank mate' }, idea: { ar: 'الملك محبوس خلف بيادقه في الصف الأخير، وقلعة أو وزير يعطي المات.', en: 'The king is boxed in by its own pawns on the back rank; a rook or queen mates.' } },
  smotheredMate: { name: { ar: 'المات الخانق', en: 'Smothered mate' }, idea: { ar: 'حصان يعطي المات لملك تحاصره قطعه.', en: 'A knight mates a king surrounded by its own pieces.' } },
  hookMate: { name: { ar: 'مات الخطاف', en: 'Hook mate' }, idea: { ar: 'قلعة يحميها حصان، والحصان يحميه بيدق.', en: 'A rook protected by a knight, which is protected by a pawn.' } },
  arabianMate: { name: { ar: 'المات العربي', en: 'Arabian mate' }, idea: { ar: 'قلعة وحصان يُميتان الملك في الزاوية.', en: 'Rook and knight mate the king in the corner.' } },
  anastasiaMate: { name: { ar: 'مات أناستازيا', en: "Anastasia's mate" }, idea: { ar: 'حصان وقلعة (أو وزير) يحبسان الملك على الطرف بين القطعة وبيدقه.', en: 'A knight and a rook (or queen) trap the king on the edge against its own pawn.' } },
  dovetailMate: { name: { ar: 'مات ذيل الحمامة', en: 'Dovetail mate' }, idea: { ar: 'وزير مدعوم ملاصق للملك وقطعه تسد طرق الهروب الخلفية.', en: 'A supported queen next to the king, whose own pieces block the escape squares.' } },
  bodenMate: { name: { ar: 'مات بودن', en: "Boden's mate" }, idea: { ar: 'فيلان على قطرين متقاطعين يميتان الملك المبيت طويلًا.', en: 'Two bishops on crossing diagonals mate the king castled long.' } },
  doubleBishopMate: { name: { ar: 'مات الفيلين', en: 'Double bishop mate' }, idea: { ar: 'الفيلان معًا يغلقان قطرين ويعطيان المات.', en: 'The two bishops cover two diagonals and give mate.' } },
  discoveredCheck: { name: { ar: 'كش مكشوف', en: 'Discovered check' }, idea: { ar: 'تحريك قطعة يكشف كشًا من قطعة خلفها، فتتحرر القطعة المتحركة لتهدد شيئًا آخر.', en: 'Moving a piece uncovers check from the piece behind it, so the moved piece is free to threaten something else.' } },
  collinearMove: { name: { ar: 'نقلة على الخط نفسه', en: 'Collinear move' }, idea: { ar: 'تحريك قطعة على الخط نفسه الذي تقف عليه قطعة أخرى لتقوية التأثير أو تفاديه.', en: 'A move along the same line as another piece, to double up or step out of an x-ray.' } },
  balestraMate: { name: { ar: 'مات باليسترا', en: 'Balestra mate' }, idea: { ar: 'فيل يعطي المات ووزير يغطي مربعات الهروب.', en: 'A bishop delivers mate while the queen covers the escape squares.' } },
  blindSwineMate: { name: { ar: 'مات الخنزيرين الأعميين', en: 'Blind swine mate' }, idea: { ar: 'قلعتان على الصف السابع تعطيان المات معًا.', en: 'Two rooks on the seventh rank mate together.' } },
  cornerMate: { name: { ar: 'مات الزاوية', en: 'Corner mate' }, idea: { ar: 'ملك محبوس في الزاوية بقطعه أو بقلعة، وحصان يعطي المات.', en: 'A king boxed in the corner is mated, typically by a knight with a rook.' } },
  epauletteMate: { name: { ar: 'مات الكتفيتين', en: 'Epaulette mate' }, idea: { ar: 'قطعتا الخصم على جانبي ملكه تسدان هروبه، فيعطي الوزير المات من الأمام.', en: "The king's own pieces on both sides block its escape and the queen mates from the front." } },
  killBoxMate: { name: { ar: 'مات الصندوق', en: 'Kill box mate' }, idea: { ar: 'قلعة ملاصقة للملك يحميها وزير على قطر، فيُحبس الملك في «صندوق».', en: 'A rook next to the king, protected diagonally by the queen, traps the king in a box.' } },
  morphysMate: { name: { ar: 'مات مورفي', en: "Morphy's mate" }, idea: { ar: 'فيل يعطي المات على القطر الطويل وقلعة تغلق العمود.', en: 'A bishop mates on the long diagonal while a rook seals the file.' } },
  operaMate: { name: { ar: 'مات الأوبرا', en: 'Opera mate' }, idea: { ar: 'قلعة تعطي المات على الصف الأخير يحميها فيل من بعيد.', en: 'A rook mates on the back rank, protected by a bishop from afar.' } },
  pillsburysMate: { name: { ar: 'مات بيلزبري', en: "Pillsbury's mate" }, idea: { ar: 'قلعة على العمود وفيل على القطر يميتان الملك المبيَّت بعد تحريك بيدقه.', en: 'Rook on the file and bishop on the diagonal mate a castled king whose pawn has moved.' } },
  swallowstailMate: { name: { ar: 'مات ذيل السنونو', en: "Swallow's tail mate" }, idea: { ar: 'وزير مدعوم أمام الملك، وقطعتاه على الجانبين خلفه تسدان الهروب.', en: "A supported queen in front of the king, whose own pieces behind on both sides block it." } },
  triangleMate: { name: { ar: 'مات المثلث', en: 'Triangle mate' }, idea: { ar: 'وزير وقلعة يشكلان مثلثًا حول الملك.', en: 'Queen and rook form a triangle around the king.' } },
  vukovicMate: { name: { ar: 'مات فوكوفيتش', en: 'Vukovic mate' }, idea: { ar: 'قلعة يحميها حصان تعطي المات، والحصان يغطي مربعات الهروب.', en: 'A rook protected by a knight mates while the knight covers the escape squares.' } },
  mate: { name: { ar: 'كش مات', en: 'Checkmate' }, idea: { ar: 'سلسلة نقلات مُلزِمة تنتهي بكش مات.', en: 'A forcing sequence that ends in checkmate.' } },
  enPassant: { name: { ar: 'الأخذ بالتجاوز', en: 'En passant' }, idea: { ar: 'أخذ البيدق الذي تقدّم مربعين كما لو تقدم مربعًا واحدًا.', en: 'Capture a pawn that moved two squares as if it had moved one.' } },
  castling: { name: { ar: 'التبييت', en: 'Castling' }, idea: { ar: 'التبييت هو النقلة الأقوى هنا (حماية الملك وتشغيل القلعة).', en: 'Castling is the strongest move here (king safety and an active rook).' } },
  onlyMove: { name: { ar: 'النقلة الوحيدة', en: 'Only move' }, idea: { ar: 'نقلة واحدة فقط تحافظ على الفوز؛ كل النقلات الأخرى تؤدي إلى التعادل (تحقق Stockfish).', en: 'Only one move keeps the win; every other move draws (checked with Stockfish).' } },
  pawnEndgame: { name: { ar: 'نهاية بيادق', en: 'Pawn endgame' }, idea: { ar: 'في نهايات البيادق، المعارضة وموقع الملك أمام البيدق يحسمان النتيجة.', en: 'In pawn endings the opposition and the king in front of the pawn decide the result.' } },
};

const META: Record<string, Bi> = {
  endgame: { ar: 'نهاية', en: 'Endgame' }, middlegame: { ar: 'وسط اللعب', en: 'Middlegame' }, opening: { ar: 'افتتاح', en: 'Opening' },
  mateIn1: { ar: 'مات في 1', en: 'Mate in 1' }, mateIn2: { ar: 'مات في 2', en: 'Mate in 2' }, mateIn3: { ar: 'مات في 3', en: 'Mate in 3' },
  mateIn4: { ar: 'مات في 4', en: 'Mate in 4' }, mateIn5: { ar: 'مات في 5', en: 'Mate in 5' },
  oneMove: { ar: 'نقلة واحدة', en: 'One move' }, short: { ar: 'قصير', en: 'Short' }, long: { ar: 'طويل', en: 'Long' }, veryLong: { ar: 'طويل جدًا', en: 'Very long' },
  crushing: { ar: 'أفضلية ساحقة', en: 'Crushing' }, advantage: { ar: 'أفضلية', en: 'Advantage' },
  master: { ar: 'من مباراة أساتذة', en: 'Master game' }, masterVsMaster: { ar: 'أستاذ ضد أستاذ', en: 'Master vs master' }, superGM: { ar: 'من مباراة نخبة', en: 'Super-GM game' },
  rookEndgame: { ar: 'نهاية قلاع', en: 'Rook endgame' }, bishopEndgame: { ar: 'نهاية أفيال', en: 'Bishop endgame' }, knightEndgame: { ar: 'نهاية أحصنة', en: 'Knight endgame' },
  queenEndgame: { ar: 'نهاية وزراء', en: 'Queen endgame' }, queenRookEndgame: { ar: 'نهاية وزير وقلعة', en: 'Queen and rook endgame' },
};
export function themeName(t: string, L: Lang) { return THEMES[t]?.name[L] ?? META[t]?.[L] ?? t; }

/** The ideas to show after solving: the most specific themes first, at most three. */
export function ideasFor(themes: string[], L: Lang): { theme: string; name: string; idea: string }[] {
  const order = Object.keys(THEMES);
  return themes
    .filter((t) => THEMES[t])
    .sort((a, b) => order.indexOf(a) - order.indexOf(b))
    .slice(0, 3)
    .map((t) => ({ theme: t, name: THEMES[t].name[L], idea: THEMES[t].idea[L] }));
}
