# Concept network — tactics, attack, calculation and practical play

# tactics-basics | tactics | أساسيات التكتيك | Why tactics happen
refs: weteschnik-tactics, heisman-tactics, nunn-practical, seirawan-tactics, pachman-tactics
rel: loose-pieces, fork, pin, double-attack, checks-captures-threats
pz: c_tactics
> Tactics appear when the position has "tactical elements": loose (undefended) pieces, an exposed king, overloaded defenders, pieces on the same line, or a weak back rank. Seeing the elements tells you when to look for a combination.
+ "Loose pieces drop off" (Nunn): undefended pieces are the most common target of double attacks.
+ Count attackers and defenders before every capture.
= Before every move: list checks, captures and threats — for both sides.
! Looking for tactics only when the position "feels" sharp; they hide in quiet positions too.

# loose-pieces | tactics | القطع غير المحمية | Loose pieces (LPDO)
refs: nunn-practical, heisman-tactics, weteschnik-tactics
rel: tactics-basics, double-attack, fork
pz: hangingPiece
> An undefended piece can be hit by a double attack (a fork, a queen check that also attacks it). Keep your pieces protected and notice the opponent's loose ones.

# checks-captures-threats | calculation | الكشوش والأسر والتهديدات | Checks, captures, threats
refs: heisman-tactics, ramesh-better-thinking, aagaard-excelling-calculation, nunn-practical
rel: candidate-moves, blunder-check, forcing-moves
pz: c_tactics
> The thinking habit that prevents most blunders and finds most combinations: look at all checks, captures and threats for yourself and for the opponent before choosing a move.

# double-attack | tactics | الهجوم المزدوج | Double attack
refs: pachman-tactics, seirawan-tactics, chandler-tactics-kids, reinfeld-1001-sacrifices
rel: fork, loose-pieces
pz: fork
> One move attacks two targets; the opponent can save only one. The queen is the most common double attacker; checks combined with an attack on a piece are especially strong.

# fork | tactics | الشوكة | The fork
refs: pachman-tactics, seirawan-tactics, chandler-tactics-kids, reinfeld-1001-sacrifices, polgar-5334
rel: double-attack, decoy, loose-pieces
pz: fork
> A piece (most often a knight) attacks two or more enemy pieces at once. Knight forks are hard to see because the knight attacks without lines.
+ Typical targets: king and rook, king and queen ("royal fork"), two rooks.
+ Often prepared by a decoy that drives a piece onto the fork square.
ex: r3k3/8/8/1N6/8/8/7P/4K3 w - - 0 1 | best Nc7+ | Nc7+ forks the king on e8 and the rook on a8.

# pin | tactics | التثبيت | The pin
refs: pachman-tactics, seirawan-tactics, chandler-tactics-kids, weteschnik-tactics
rel: skewer, x-ray, removal-of-defender
pz: pin
> A piece cannot move (absolute pin, against the king) or should not move (relative pin) because a more valuable piece stands behind it. Attack the pinned piece again — it cannot run.
+ A pin against the king: the pinned piece does not really defend anything.

# skewer | tactics | السيخ (الهجوم عبر الخط) | The skewer
refs: pachman-tactics, seirawan-tactics, chandler-tactics-kids
rel: pin, x-ray
pz: skewer
> The reverse of the pin: a valuable piece is attacked along a line and must move, exposing a piece behind it.

# discovered-attack | tactics | الهجوم المكشوف | Discovered attack and check
refs: pachman-tactics, seirawan-tactics, reinfeld-1001-sacrifices, renaud-kahn-checkmate
rel: double-check, double-attack
pz: discoveredAttack
> Moving one piece uncovers an attack by another. A discovered check lets the moving piece do anything (capture, attack) because the opponent must answer the check.

# double-check | tactics | الكش المزدوج | Double check
refs: renaud-kahn-checkmate, reinfeld-1001-sacrifices, pachman-tactics
rel: discovered-attack, smothered-mate
pz: doubleCheck
> Two pieces give check at once; the king must move — no capture or block helps. Many mating combinations end with a double check.

# deflection | tactics | الإبعاد (التحويل) | Deflection
refs: pachman-tactics, weteschnik-tactics, blokh-art-combination
rel: overloading, decoy, removal-of-defender
pz: deflection
> Forcing a defending piece away from the square or line it guards (often by a sacrifice), after which the undefended target falls.

# decoy | tactics | الجذب (الإغراء) | Decoy (attraction)
refs: pachman-tactics, blokh-art-combination, ivashchenko-manual
rel: deflection, fork, smothered-mate
pz: attraction
> Forcing an enemy piece (often the king) onto a particular square with a sacrifice, where it is then forked, mated or pinned.

# overloading | tactics | الحمل الزائد | Overloading
refs: weteschnik-tactics, pachman-tactics, aagaard-excelling-combinational
rel: deflection, removal-of-defender
pz: deflection
> A piece with two defensive duties cannot fulfil both; attack one duty and the other collapses.

# removal-of-defender | tactics | إزالة المدافع | Removing the defender
refs: pachman-tactics, seirawan-combinations, weteschnik-tactics
rel: deflection, overloading, exchange-sacrifice
pz: capturingDefender
> Capture or exchange the piece that defends a key square or piece, then exploit the now-undefended target.

# interference | tactics | التداخل (قطع الخط) | Interference
refs: pachman-tactics, blokh-art-combination, ivashchenko-manual
rel: deflection, clearance
pz: interference
> Placing a piece on a line between an enemy piece and the square it defends, cutting the connection.

# clearance | tactics | إخلاء الخط أو المربع | Clearance
refs: pachman-tactics, blokh-art-combination, aagaard-excelling-combinational
rel: interference, discovered-attack
pz: clearance
> Moving (often sacrificing) a piece to free a square or a line for another piece.

# zwischenzug | tactics | النقلة الوسيطة | The intermediate move (zwischenzug)
refs: dvoretsky-tactics, aagaard-calculation, beim-calculate-tactics
rel: forcing-moves, candidate-moves
pz: intermezzo
> Instead of the expected recapture, a stronger forcing move first (a check or a bigger threat). Calculations often fail because one side forgets the opponent's intermediate move.

# x-ray | tactics | الأشعة السينية | X-ray
refs: pachman-tactics, weteschnik-tactics
rel: pin, skewer
pz: xRayAttack
> A piece acts "through" another piece along a line — attacking or defending a square behind it.

# desperado | tactics | قطعة اليائس | Desperado
refs: weteschnik-tactics, blokh-art-combination
rel: zwischenzug, stalemate
pz: c_tactics
> A piece that is lost anyway sells itself as dearly as possible (capturing something on its way out); in endings, a rook that keeps checking to force stalemate.

# trapped-piece | tactics | القطعة المحاصرة | Trapped pieces
refs: weteschnik-tactics, neishtadt-catastrophe, giddins-traps
rel: knight-on-the-rim, loose-pieces
pz: trappedPiece
> A piece with no safe squares can be won by attacking it. Typical: the bishop on a7/h7 after ...b6/...g6, the knight on the rim, the queen that grabbed the b2-pawn.

# quiet-move | tactics | النقلة الهادئة في التكتيك | The quiet move in a combination
refs: dvoretsky-tactics, aagaard-calculation, beim-calculate-tactics, emms-amazing-moves
rel: zwischenzug, candidate-moves
pz: quietMove
> A non-forcing move in the middle of a combination that creates an unstoppable threat or takes away the defence; the hardest tactical idea to see.

# back-rank | tactics | ضعف الصف الأخير | Back-rank weakness
refs: fischer-teaches, renaud-kahn-checkmate, chandler-beat-dad, pachman-tactics
rel: mating-patterns, deflection, overloading
pz: backRankMate
> A king behind its unmoved pawns can be mated by a rook or queen on the back rank. Defend by making "luft" (h3/h6) in time.
ex: 6k1/5ppp/8/8/8/8/q4PPP/4R1K1 w - - 0 1 | mate | Re8# — the pawns on f7, g7, h7 trap their own king.

# mating-patterns | tactics | أنماط الكش مات | Mating patterns
refs: renaud-kahn-checkmate, chandler-beat-dad, polgar-5334, reinfeld-1001-checkmate, vukovic-art-of-attack
rel: back-rank, smothered-mate, greek-gift, attack-castled-king
pz: c_mate
> Named patterns that recur constantly: back-rank mate, smothered mate, Anastasia's mate (knight e7 + rook on the h-file), Arabian mate (rook + knight against a king in the corner), Boden's mate (two bishops on crossing diagonals), Greco's mate, Damiano's mate, the epaulette mate. Knowing the final picture makes the combination visible.
ex: 7k/R7/5N2/8/8/8/8/6K1 w - - 0 1 | mate | Arabian mate: Rh7#, the knight covers g8 and h7.
ex: 8/4N1pk/8/8/8/8/K7/R7 w - - 0 1 | mate | Anastasia's mate: Rh1#, the knight on e7 covers g6 and g8.

# smothered-mate | tactics | الكش المخنوق | The smothered mate
refs: renaud-kahn-checkmate, vukovic-art-of-attack, chandler-beat-dad
rel: double-check, decoy, mating-patterns
pz: smotheredMate
> A knight mates a king surrounded by its own pieces. The classic "Philidor's legacy": Qg8+! Rxg8 Nf7#.
ex: 6rk/6pp/8/6N1/8/8/8/6K1 w - - 0 1 | mate | Nf7# — the king is boxed in by its own rook and pawns.
ex: 5rk1/6pp/8/6N1/8/8/8/3Q2K1 w - - 0 1 | win w | Philidor's legacy: Qb3+ (or Qd5+) Kh8 Nf7+ Kg8 Nh6+ Kh8 Qg8+! Rxg8 Nf7#.

# greek-gift | attack | تضحية الفيل في h7 (الهدية الإغريقية) | The Greek gift (Bxh7+)
refs: vukovic-art-of-attack, aagaard-attack-defence, chernev-logical
rel: attack-castled-king, sacrifice-types, mating-patterns
pz: p_kingAttack
> The bishop sacrifice on h7 (h2) followed by Ng5+ and Qh5. Conditions (Vuković): the bishop reaches h7 with check, a knight can go to g5 safely, the queen can join on the h-file, and the defender has no knight on f6 and no quick way to cover h7 or escape.
+ A pawn on e5 (driving the knight from f6) and a pawn on h4 (supporting Ng5) are typical helpers.
= Before sacrificing, check the three king moves after Ng5+: ...Kg8, ...Kg6 and ...Kh6.
ex: rnbq1rk1/pppnbppp/4p3/3pP3/3P3P/3B1N2/PPP2PP1/RNBQK2R w KQ - 0 1 | best Bxh7+ | Bxh7+! Kxh7 Ng5+ — with h4 supporting the knight and the queen ready for h5.

# attack-castled-king | attack | الهجوم على الملك المبيّت | Attacking the castled king
refs: vukovic-art-of-attack, aagaard-attack-defence, dvoretsky-attack-defence, euwe-kramer-middlegame, smirin-kid-warfare, polgar-fischers-record
rel: greek-gift, opposite-castling, initiative, mating-patterns
pz: p_kingAttack
> An attack needs more attackers than defenders near the king, open lines (files or diagonals) towards it, and weaknesses in the pawn cover (h6, g6, f6…).
+ Bring pieces first, pawns second (unless kings castled on opposite sides).
+ Remove or exchange the key defender (often the f6 knight or the fianchetto bishop).
+ The centre must be stable — a central counterblow is the best answer to a wing attack.
= Count: attackers vs defenders around the king; then look for sacrifices that open lines.
! Attacking with two pieces against four defenders.

# opposite-castling | attack | التبييت المتعاكس | Opposite-side castling
refs: vukovic-art-of-attack, aagaard-attack-defence, palliser-najdorf
rel: attack-castled-king, pawn-storm
pz: p_kingAttack
> When kings castle on opposite sides, both sides storm with pawns (the pawns do not shelter their own king); speed is everything — a tempo is worth more than a pawn.

# pawn-storm | attack | زحف البيادق | Pawn storms
refs: vukovic-art-of-attack, smirin-kid-warfare, sadler-regan-game-changer
rel: opposite-castling, attack-castled-king, kid-ideas
pz: p_kingAttack
> Advancing pawns against the enemy king's position to open files. Typical: the King's Indian ...f5–f4–g5–g4, the Yugoslav h4–h5 against the Dragon, and AlphaZero's h-pawn push "h4–h5–h6" to weaken the king.

# king-in-centre | attack | الملك في المركز | The king caught in the centre
refs: spielmann-sacrifice, neishtadt-catastrophe, reti-modern-ideas, chernev-1000-short
rel: development-lead, opening-principles, sacrifice-types
pz: c_attack
> An uncastled king behind an opening centre is a target: sacrifice material to open the e- or d-file and keep it from castling (Morphy's style).
line: e4 e5 Nf3 d6 Bc4 Bg4 Nc3 g6 Nxe5 Bxd1 Bxf7+ Ke7 Nd5# | Légal's mate: the king left in the centre with lagging development.

# sacrifice-types | attack | أنواع التضحيات | Types of sacrifices
refs: spielmann-sacrifice, mcdonald-positional-sacrifices, tal-life-games, aagaard-attack-defence, shirov-fire
rel: exchange-sacrifice, pawn-sacrifice, greek-gift, initiative
pz: p_sacrifice
> Sham sacrifices win the material back by force (they can be calculated to the end); real sacrifices give lasting compensation — development, an attack, a keep-the-king-in-the-centre bind — that must be judged by intuition. Tal was the master of the real sacrifice.
+ Ask before sacrificing: what do I get (time, lines, squares), and can the opponent return the material to escape?

# candidate-moves | calculation | النقلات المرشحة | Candidate moves
refs: kotov-think-gm, aagaard-calculation, aagaard-thinking-box, nunn-practical, tisdall-improve-now, dvoretsky-school-tactical
rel: tree-of-analysis, forcing-moves, blunder-check, comparison
pz: p_calc
> Kotov's method: first list all reasonable candidate moves, then analyse each once, systematically. It prevents missing the best move and endless back-and-forth analysis.
+ Include the opponent's candidate replies — the "candidate moves for the defender" (Aagaard).

# tree-of-analysis | calculation | شجرة التحليل | The tree of analysis
refs: kotov-think-gm, tisdall-improve-now, aagaard-excelling-calculation
rel: candidate-moves, kotov-syndrome
pz: p_calc
> Calculating along branches: each candidate is followed to a clear evaluation before moving on to the next. Modern trainers add: calculate forcing lines first and stop when the evaluation is clear.

# forcing-moves | calculation | النقلات القسرية | Forcing moves first
refs: aagaard-excelling-calculation, beim-calculate-tactics, heisman-tactics
rel: checks-captures-threats, candidate-moves, zwischenzug
pz: p_calc
> Checks, captures and threats limit the opponent's replies, so they can be calculated deeply; always look at them first.

# comparison | calculation | المقارنة بين النقلات | Comparison
refs: aagaard-thinking-box, aagaard-calculation, nunn-practical
rel: candidate-moves
pz: p_calc
> You do not need to calculate a line to the end if you can compare two candidate moves: find the difference between them and choose the one that keeps more advantages.

# blunder-check | calculation | فحص الخطأ الفادح | The blunder check
refs: heisman-tactics, ramesh-better-thinking, nunn-practical, heisman-looking-trouble
rel: checks-captures-threats
pz: c_tactics
> Before playing the chosen move, look at the position after it from the opponent's side: his checks, captures and threats. Most lost games are lost to simple oversights.

# visualisation | calculation | التخيّل | Visualisation
refs: tisdall-improve-now, aagaard-calculation, dvoretsky-training
rel: tree-of-analysis
pz: p_calc
> Seeing the position several moves ahead clearly. Train by solving positions without moving the pieces and by playing through games from the score in your head.

# kotov-syndrome | psychology | متلازمة كوتوف | The Kotov syndrome
refs: kotov-think-gm, rowson-seven-sins, nunn-practical
rel: time-management, candidate-moves
pz: p_calc
> After long, fruitless calculation, a player suddenly plays a move he has not checked at all. Avoid it by deciding on a default candidate early and managing the clock.

# time-management | psychology | إدارة الوقت | Time management
refs: nunn-practical, rowson-seven-sins, aagaard-thinking-box
rel: kotov-syndrome, practical-decisions
pz: c_tactics
> Spend time at critical moments (pawn structure changes, exchanges, sacrifices) and play quickly in simple positions; never fall into time trouble with a complex position on the board.

# practical-decisions | psychology | القرارات العملية | Practical decisions
refs: nunn-practical, gelfand-dynamic, rowson-seven-sins, kasparov-life, larsen-selected, nunn-gm-chess
rel: time-management, swindles
pz: c_middlegame
> In a real game you cannot calculate everything: choose moves that keep the position under control, set problems for the opponent, and avoid unnecessary risk when better. When worse, create complications.

# swindles | psychology | الإنقاذ في المواقف الخاسرة | Fighting in bad positions
refs: nunn-practical, soltis-defense, marin-defence
rel: defence-methods, fortress, stalemate
pz: p_defense
> In a lost position, make the opponent's task as difficult as possible: keep pieces, create threats, set traps, aim for fortresses and stalemate tricks. Many games are saved this way.

# seven-sins | psychology | الأخطاء الذهنية السبعة | Thinking errors
refs: rowson-seven-sins, rowson-zebras
rel: kotov-syndrome, practical-decisions
pz: c_middlegame
> Rowson's seven sins: thinking too much (in the wrong way), "blinking" when the critical moment arrives, wanting the result rather than playing well, materialism, egoism (ignoring the opponent), perfectionism, and looseness (careless moves).

# training-methods | training | طرق التدريب | How to train
refs: dvoretsky-training, kotov-train-gm, yermolinsky-road, woodpecker, yusupov-series, sadler-silicon-road, aagaard-excelling, purdy-perfection, dvoretsky-tournament-player, nunn-puzzle-book, hendriks-move-first
rel: analyse-own-games, tactics-basics
pz: c_random
> The proven methods: analyse your own games (without an engine first), solve tactical exercises regularly (repeating sets, as in the Woodpecker method), study basic endgames, play out training positions, and study annotated master games in your openings.

# analyse-own-games | training | تحليل مبارياتك | Analysing your own games
refs: dvoretsky-training, kotov-train-gm, aagaard-excelling, yermolinsky-road, botvinnik-selected
rel: training-methods
pz: c_random
> After each game write down what you thought during the game, then check it with the engine; look for recurring errors (time trouble, missed tactics, wrong plans) and train them specifically.

# study-master-games | training | دراسة مباريات الأساتذة | Studying master games
refs: chernev-instructive, chernev-logical, chernev-golden-dozen, mammoth-greatest-games, fine-great-games, reinfeld-capablanca-immortal, seirawan-chess-duels, alekhine-ny1924, spassky-best, seirawan-brilliancies, soltis-100-best, reti-masters, kasparov-predecessors
rel: training-methods, plan-making, analyse-own-games
pz: c_middlegame
> Playing through well-annotated master games teaches plans, typical structures and endgame technique in context. Guess the next move before looking (the "guess-the-move" method), and focus on why each plan was chosen.
