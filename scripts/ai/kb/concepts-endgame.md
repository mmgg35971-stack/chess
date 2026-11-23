# Concept network — endgames
# "# id | area | Arabic title | English title", then:
# refs: reference ids   rel: related concept ids   pz: puzzle theme or app category
# "> " summary, "+ " key idea, "= " how to play it, "! " common mistake
# "ex: FEN | claim | note"  (claim: win w / win b / draw / best SAN / mate) — checked with Stockfish
# "line: SAN moves from the start | note" — checked for legality

# endgame-principles | endgame | مبادئ النهايات العامة | General endgame principles
refs: capablanca-fundamentals, shereshevsky-endgame-strategy, silman-endgame-course, hellsten-endgame-strategy, seirawan-endings, flear-improve-endgame, smyslov-125, dvoretsky-school-endgame, dvoretsky-tragicomedy, nunn-understanding-endgames, speelman-analysing, mednis-practical-endgame, shereshevsky-mastering
rel: king-activity, two-weaknesses, do-not-hurry, passed-pawn, exchange-when-ahead
pz: c_endgame
> In the endgame the king becomes a fighting piece, passed pawns gain value, and small advantages (a better king, one weak pawn, a more active rook) often decide the game.
+ Activate the king early: centralise it, then march towards the pawns or the passed pawn.
+ Passed pawns must be pushed; the side with the more dangerous passed pawn usually wins.
+ Rooks belong behind passed pawns (yours and the opponent's) and should be active, not passive.
+ The principle of two weaknesses: one weakness can be defended, two on different wings usually cannot.
+ "Do not hurry": when the opponent has no counterplay, improve every piece before the decisive action.
= Ask: where should my king go? Which pawn can become passed? Which enemy piece is passive?
= When ahead in material, trade pieces, not pawns; when behind, trade pawns, not pieces.
! Leaving the king on the back rank in the endgame "for safety".
! Pushing pawns without purpose, which creates weaknesses and gives the enemy king entry squares.

# king-activity | endgame | نشاط الملك في النهاية | King activity in the endgame
refs: capablanca-fundamentals, lasker-common-sense, shereshevsky-endgame-strategy, karolyi-karpov-endgame, chernev-capablanca-endings
rel: endgame-principles, opposition, key-squares
pz: c_endgame
> With fewer pieces on the board there is little danger of mate, so the king must take part: it attacks pawns, supports its own passed pawns and blocks enemy ones.
+ A centralised king can reach either wing in a few moves.
+ In pawn endings, the more active king often wins even with equal pawns.
+ In rook endings, cutting off the enemy king by a file or rank is often worth a pawn.
= Bring the king towards the centre as soon as the queens are off.
= Use checks with the rook to drive the enemy king back before advancing your own.
! Letting your king be cut off on the edge of the board.

# opposition | endgame | المعارضة | The opposition
refs: capablanca-fundamentals, dvoretsky-endgame-manual, muller-lamprecht-pawn, de-la-villa-100, averbakh-essential, silman-endgame-course
rel: key-squares, triangulation, king-pawn-vs-king, corresponding-squares
pz: p_pawnEnd
> Two kings stand face to face with one square between them; the side that is NOT to move "has the opposition" and forces the other king to give way.
+ Direct opposition: kings on the same file or rank with one square between them; distant opposition: an odd number of squares between them.
+ Diagonal opposition also exists; all forms come from the same counting rule.
+ The opposition is a means, not a goal: the real aim is to reach a key square or to keep the enemy king away from it.
= Attacker: take the opposition, then go around (outflanking) to reach a key square.
= Defender: keep the opposition; when the attacking king steps aside, step to the matching square.
! Pushing the pawn too early, which gives away the tempo needed for the opposition.
ex: 8/4k3/8/4K3/4P3/8/8/8 w - - 0 1 | draw | White to move: Black has the opposition and holds (kings e5/e7, White must give way).
ex: 8/4k3/8/4K3/4P3/8/8/8 b - - 0 1 | win w | Black to move must give way, so White's king reaches a key square (d6, e6 or f6).

# key-squares | endgame | المربعات المفتاحية | Key squares
refs: dvoretsky-endgame-manual, muller-lamprecht-pawn, de-la-villa-100, silman-endgame-course
rel: opposition, king-pawn-vs-king, rook-pawn-draw
pz: p_pawnEnd
> For a pawn there are key squares: if the attacking king reaches one of them, the pawn queens whatever the defence (except rook pawns).
+ For a pawn on the 2nd–4th rank, the key squares are the three squares two ranks in front of it.
+ For a pawn on the 5th or 6th rank, the key squares are the squares directly in front of it and diagonally in front (the six squares on the next two ranks for a 5th-rank pawn, the three on the next rank for 6th-rank and the squares beside it).
+ The king two squares in front of its pawn (not a rook pawn) wins regardless of who moves.
= First count: can my king reach a key square before the enemy king can stop it? Use the opposition if both arrive together.
! Advancing the pawn to "help" — the king must lead, the pawn follows.
ex: 4k3/8/4K3/4P3/8/8/8/8 b - - 0 1 | win w | White's king on e6 is on a key square (in front of the e5-pawn): it wins with either side to move.
ex: 8/8/4k3/8/8/4K3/4P3/8 w - - 0 1 | win w | White's king reaches a key square (d4/e4/f4) of the e2-pawn: 1.Kd4/Ke4 and the spare pawn tempo keeps the opposition.

# king-pawn-vs-king | endgame | ملك وبيدق ضد ملك | King and pawn vs king
refs: capablanca-fundamentals, dvoretsky-endgame-manual, averbakh-essential, de-la-villa-100, pandolfini-endgame-course
rel: opposition, key-squares, rule-of-square, rook-pawn-draw
pz: p_pawnEnd
> The most basic ending: everything depends on whether the attacking king can reach a key square; if the defending king gets in front of the pawn with the opposition, it is a draw.
+ The defender aims to stand in front of the pawn and keep the opposition when the pawn reaches the 6th rank; then stalemate saves him.
+ With a pawn on the 6th rank and the defending king in front, the side to move matters only in the last phase.
= Attacker: king first, pawn second. Defender: go straight back in front of the pawn (to its queening square or next to it).
! Defender: stepping to the side instead of straight back; attacker: pushing to the 7th rank with check when it allows stalemate or a block.

# rule-of-square | endgame | قاعدة المربع | The rule of the square
refs: capablanca-fundamentals, averbakh-essential, silman-endgame-course, chernev-practical-endings
rel: passed-pawn, outside-passed-pawn, king-pawn-vs-king
pz: p_pawnEnd
> Draw a square from the passed pawn to its promotion rank; if the defending king can step into that square, it catches the pawn.
+ A pawn on its starting rank counts as if it were one rank further (the double step).
+ The square shows instantly whether a pawn race can be stopped without counting moves.
= When the enemy king is outside the square, push the pawn; when you defend, enter the square with your king.
! Forgetting that your own pawns or the enemy pieces can block the king's path into the square.
ex: 7k/8/8/8/p7/8/4K3/8 w - - 0 1 | draw | 1.Kd3 (or Kd2) enters the square of the a4-pawn and catches it.
ex: 7k/8/8/8/p7/8/6K1/8 w - - 0 1 | win b | The white king on g2 is outside the square: the pawn runs to a1.

# triangulation | endgame | المثلث (التثليث) | Triangulation
refs: dvoretsky-endgame-manual, muller-lamprecht-pawn, de-la-villa-100, shereshevsky-endgame-strategy
rel: opposition, corresponding-squares, zugzwang
pz: p_zugzwang
> A king manoeuvre over three squares that "loses" a tempo, giving the move to the opponent and putting him in zugzwang.
+ It works when the attacking king has more room than the defending king, which is tied to a few squares.
+ The same position arises with the opponent to move — that is the whole point.
= Identify the zugzwang position you want, then find a triangle of squares your king can use while the enemy king cannot copy it.
! Repeating moves without noticing that a three-square route would win the tempo.

# corresponding-squares | endgame | المربعات المتناظرة | Corresponding squares
refs: dvoretsky-endgame-manual, muller-lamprecht-pawn, averbakh-comprehensive
rel: opposition, triangulation
pz: p_pawnEnd
> A generalisation of the opposition: for each square of the attacking king there is a "corresponding" square the defending king must occupy to hold; finding these pairs solves complex pawn endings.
+ The opposition and triangulation are special cases.
= Start from the key squares (where the defender must answer correctly) and work backwards.
! Calculating pawn endings move by move without a method, getting lost in variations.

# zugzwang | endgame | الزوغزوانغ (إجبار النقلة) | Zugzwang
refs: lasker-manual, nimzowitsch-my-system, dvoretsky-endgame-manual, muller-lamprecht-pawn
rel: triangulation, opposition, reserve-tempo
pz: p_zugzwang
> A position where the side to move would prefer to pass, because every move worsens the position.
+ Most common in pawn endings and in simple piece endings; rare but possible in the middlegame (Sämisch–Nimzowitsch, the "immortal zugzwang game").
+ Spare pawn moves (reserve tempi) decide many zugzwang battles.
= In pawn endings, keep your spare pawn moves for the critical moment.
! Using up reserve tempi too early.

# reserve-tempo | endgame | النقلات الاحتياطية | Reserve tempi
refs: muller-lamprecht-pawn, dvoretsky-endgame-manual, shereshevsky-endgame-strategy
rel: zugzwang, opposition
pz: p_pawnEnd
> Pawn moves that do not change the essence of the position and can be played when needed to pass the move to the opponent.
+ A pawn that has not moved (still on its starting square) offers one or two spare tempi.
= Before entering a pawn ending, count the reserve tempi for both sides.
! Advancing pawns "to gain space" in a pawn ending and losing the tempo battle.

# outside-passed-pawn | endgame | البيدق الحر البعيد | The outside passed pawn
refs: capablanca-fundamentals, capablanca-last-lectures, muller-lamprecht-pawn, chernev-capablanca-endings, de-la-villa-100
rel: passed-pawn, pawn-majority, rule-of-square, decoy-endgame
pz: p_pawnEnd
> A passed pawn far from the main group of pawns acts as a decoy: the enemy king must go after it, and the other king eats the pawns on the other wing.
+ In pawn endings, an outside passed pawn is usually decisive.
+ A queenside majority against a kingside castled king often produces this advantage in the endgame.
= Create the passed pawn, push it far enough to draw the king away, then invade with your king on the other side.
! Exchanging the outside passed pawn too early or pushing it so far that it is lost without drawing the king away.
ex: 8/8/3k2pp/8/P2K4/6PP/8/8 w - - 0 1 | win w | Equal kingside pawns, but the a-pawn will pull the black king away; White's king then eats the kingside (1.Ke4 and Kf5).

# protected-passed-pawn | endgame | البيدق الحر المحمي | The protected passed pawn
refs: muller-lamprecht-pawn, averbakh-essential, nimzowitsch-my-system
rel: passed-pawn, outside-passed-pawn
pz: p_advancedPawn
> A passed pawn protected by another pawn cannot be won by the enemy king, so the king is tied to it while your king is free.
+ In pawn endings a protected passed pawn is usually a decisive advantage.
= Use your free king to attack the enemy pawns while his king must watch the passer.

# breakthrough | endgame | الاختراق البيدقي | Pawn breakthrough
refs: dvoretsky-endgame-manual, muller-lamprecht-pawn, chernev-practical-endings, de-la-villa-100, benko-laboratory
rel: passed-pawn, rule-of-square
pz: p_pawnEnd
> A pawn sacrifice (or two) that creates a passed pawn against a pawn majority, usually when the enemy king is far away.
+ The classic case: three pawns on the 5th rank against three pawns on the 7th — b6! (or a6/c6) breaks through.
= Check whether the enemy king is outside the square of the future passed pawn before you break through.
! Overlooking the opponent's breakthrough when your king has gone to the other wing.
ex: 8/ppp5/8/PPP5/8/8/8/k5K1 w - - 0 1 | win w | 1.b6! axb6 (1...cxb6 2.a6!) 2.c6! bxc6 3.a6 and the a-pawn queens.

# rook-pawn-draw | endgame | بيدق الرخ والتعادل | Rook-pawn and wrong-bishop draws
refs: dvoretsky-endgame-manual, de-la-villa-100, fine-basic-endings, averbakh-essential
rel: king-pawn-vs-king, wrong-bishop, fortress
pz: p_minorEnd
> With a rook pawn (a- or h-pawn) the defender draws much more easily: a king in the corner cannot be driven out, and with a bishop that does not control the queening square it is a draw even with an extra piece.
+ King + rook pawn vs king: draw if the defending king reaches the corner (or the square in front of the pawn).
+ Wrong bishop: bishop of the opposite colour to the queening square + rook pawn = draw when the king reaches the corner.
= Defender: run to the corner. Attacker: cut the enemy king off from the corner before it gets there.
ex: 7k/8/7K/7P/8/8/8/5B2 w - - 0 1 | draw | The light-squared bishop cannot control h8: the black king never leaves the corner (stalemate tricks).

# wrong-bishop | endgame | الفيل الخطأ | The wrong bishop
refs: dvoretsky-endgame-manual, de-la-villa-100, nunn-minor-piece
rel: rook-pawn-draw, fortress
pz: p_minorEnd
> A bishop that cannot control the queening square of a rook pawn; the defending king in the corner cannot be removed, so the extra bishop does not win.
+ The attacker must prevent the defending king from reaching the corner at all.

# lucena | endgame | وضعية لوسينا (بناء الجسر) | The Lucena position (building a bridge)
refs: dvoretsky-endgame-manual, de-la-villa-100, levenfish-smyslov-rook, minev-rook-endgames, nunn-rook-endings, silman-endgame-course
rel: philidor, rook-endgame-principles, cut-off-king
pz: p_rookEnd
> Rook and pawn on the 7th rank with the king in front of it and the enemy king cut off by at least one file: White wins by "building a bridge" — bringing the rook to the 4th rank to block the checks.
+ Steps: cut off the enemy king; rook to the 4th rank; king out from in front of the pawn; when the checks start, the rook interposes on the 4th rank.
+ The defending side's checks run out because the rook "bridge" shields the king.
= Memorise the method: 1.Rd1+ (push the king further), then Rd4, Kc7/Kc8 and Rc4/Rd5 to block the checks.
! Leaving the king in front of the pawn forever, or bringing the rook to the wrong rank.
ex: 1K1k4/1P6/8/8/8/8/r7/2R5 w - - 0 1 | win w | 1.Rd1+ Ke7 2.Rd4! Ra1 3.Kc7 Rc1+ 4.Kb6 Rb1+ 5.Kc6 Rc1+ 6.Kb5 Rb1+ 7.Rb4 — the bridge.

# philidor | endgame | وضعية فيليدور | The Philidor position (third-rank defence)
refs: dvoretsky-endgame-manual, de-la-villa-100, levenfish-smyslov-rook, minev-rook-endgames, silman-endgame-course
rel: lucena, rook-endgame-principles, short-side-defence
pz: p_rookEnd
> Defending rook and pawn against rook: keep your rook on your third rank (the 6th for Black) so the enemy king cannot advance; when the pawn advances to that rank, switch the rook to the back for checks from behind.
+ The pawn on the 6th leaves the enemy king without shelter from vertical checks — so the rook goes back and checks from far away.
+ The defending king stands on the queening square or next to it.
= Defender: rook on the 6th rank; after the pawn moves to the 6th, ...Ra1 and check from behind.
! Passive rook on the back rank too early (often loses), or the king on the wrong side.
ex: 4k3/7R/r7/3PK3/8/8/8/8 b - - 0 1 | draw | 1...Rb6 keeps the 6th rank: the white king cannot come forward; after d6, ...Rb1 and checks from behind.

# vancura | endgame | وضعية فانكورا | The Vančura position
refs: dvoretsky-endgame-manual, de-la-villa-100, nunn-rook-endings
rel: rook-endgame-principles, philidor
pz: p_rookEnd
> Against a rook pawn on the 6th supported from the side by the enemy rook in front, the defender holds by placing his rook on the 6th rank attacking the pawn from the side, so the enemy rook is tied and the king cannot come to help without giving up checks.
+ The defending rook attacks the pawn from the side; the defending king stays near the opposite wing.

# rook-endgame-principles | endgame | مبادئ نهايات القلاع | Rook endgame principles
refs: levenfish-smyslov-rook, minev-rook-endgames, nunn-rook-endings, tarrasch-game-of-chess, marin-legends, de-la-villa-100, keres-practical-endings, nunn-chess-endings
rel: lucena, philidor, vancura, rook-behind-passer, cut-off-king, active-rook
pz: p_rookEnd
> "All rook endings are drawn" is a famous joke: rook endings are the most common endings and the defending side has many resources; the activity of the rook is often more important than a pawn.
+ Rooks belong behind passed pawns (Tarrasch's rule) — your own to push, the opponent's to stop.
+ An active rook (attacking pawns, cutting the king off) is worth more than material in many positions.
+ Cutting the enemy king off by a file is a huge advantage.
+ Checking distance: the defending rook needs at least three files between it and the pawn to give checks from the side.
= In practice: activate the rook first, then the king, then push pawns.
! Passive rook defence (rook tied to defending a pawn) when an active counterattack was possible.

# rook-behind-passer | endgame | القلعة خلف البيدق الحر | Rook behind the passed pawn
refs: tarrasch-game-of-chess, levenfish-smyslov-rook, minev-rook-endgames, nimzowitsch-my-system
rel: rook-endgame-principles, passed-pawn
pz: p_rookEnd
> A rook behind a passed pawn gains in activity as the pawn advances; a rook in front of the pawn becomes more and more passive.
+ For the defender, the rook behind the enemy passed pawn is also best: the enemy rook in front of it is passive.

# cut-off-king | endgame | عزل الملك | Cutting off the king
refs: dvoretsky-endgame-manual, minev-rook-endgames, levenfish-smyslov-rook
rel: lucena, rook-endgame-principles
pz: p_rookEnd
> Using the rook to keep the enemy king away from the passed pawn by one or more files (or ranks).
+ The number of files the king is cut off often decides between a win and a draw.

# active-rook | endgame | القلعة النشطة | The active rook
refs: marin-legends, levenfish-smyslov-rook, shereshevsky-endgame-strategy, nimzowitsch-my-system
rel: rook-endgame-principles, seventh-rank
pz: p_rookEnd
> Rubinstein and Capablanca showed that an active rook (on the 7th rank, behind enemy pawns, cutting the king off) often wins even without extra material.
+ Giving up a pawn to activate the rook is frequently correct.

# short-side-defence | endgame | الدفاع من الجانب القصير | Short-side defence
refs: dvoretsky-endgame-manual, de-la-villa-100, nunn-rook-endings
rel: philidor, rook-endgame-principles
pz: p_rookEnd
> When defending rook against rook and pawn, the king should go to the "short side" of the pawn (the side with fewer files) so the rook has space on the long side to check from a distance.

# queen-vs-pawn | endgame | الوزير ضد بيدق على السابع | Queen against a pawn on the seventh
refs: dvoretsky-endgame-manual, de-la-villa-100, averbakh-essential, fine-basic-endings
rel: rook-pawn-draw, stalemate
pz: p_queenEnd
> The queen wins against a central or knight pawn on the 7th by repeatedly forcing the king in front of the pawn and bringing her king closer; against a rook pawn or bishop pawn, the defender has a stalemate trick and usually draws if the attacking king is far away.
+ Method: check or pin until the enemy king stands in front of the pawn, then use the free tempo to bring the king nearer.
+ Bishop pawn: the king goes to the corner (...Kxx1), and taking the pawn would be stalemate.
ex: 4K3/8/8/8/8/8/1pk5/7Q w - - 0 1 | win w | Against a knight pawn the queen wins: checks force the king in front of the pawn, and the white king approaches.
ex: 4K3/8/8/8/8/8/2pk4/7Q w - - 0 1 | draw | Against a bishop pawn with the white king far away it is a draw: the defending king goes to the corner (b1/a1 side), where taking the pawn would leave it stalemated.

# opposite-bishops | endgame | الفيلة المختلفة اللون | Opposite-coloured bishops
refs: dvoretsky-endgame-manual, nunn-minor-piece, averbakh-comprehensive, shereshevsky-endgame-strategy
rel: fortress, blockade, bishop-vs-knight-endgame
pz: p_minorEnd
> In pure opposite-coloured bishop endings even two extra pawns may not win: the defender sets up a blockade on squares of his bishop's colour. In the middlegame the same bishops favour the attacker, because each side's bishop attacks squares the other cannot defend.
+ Endgame: the attacker needs passed pawns far apart (two weaknesses); connected pawns can often be stopped.
+ Middlegame: with opposite bishops, the attacking side effectively plays with an extra piece on its colour.
= Defender: blockade the pawns on squares of your bishop's colour, where the enemy bishop cannot challenge your blockaders.
ex: 8/8/4k3/8/2b2P2/4KP2/8/4B3 w - - 0 1 | draw | Two extra pawns but connected and blockaded on light squares: a typical opposite-bishop fortress.

# bishop-vs-knight-endgame | endgame | الفيل ضد الحصان في النهاية | Bishop vs knight in the endgame
refs: nunn-minor-piece, averbakh-comprehensive, pachman-strategy, silman-reassess, capablanca-fundamentals
rel: good-bad-bishop, bishop-pair, outpost
pz: p_minorEnd
> The bishop prefers open positions and pawns on both wings; the knight prefers closed positions, pawns on one wing and fixed pawns on the bishop's colour.
+ A knight struggles against a rook pawn and against passed pawns on both wings.
+ "Bad bishop" (own pawns on its colour) vs good knight is a classic winning endgame.
= With the bishop: open the position, create play on both wings. With the knight: fix enemy pawns on the bishop's colour and find a protected central square.

# bishop-knight-mate | endgame | كش مات بالفيل والحصان | Mate with bishop and knight
refs: dvoretsky-endgame-manual, de-la-villa-100, averbakh-essential, fine-basic-endings
rel: basic-mates
pz: c_endgame
> King, bishop and knight can force mate, but only in a corner of the bishop's colour; it takes up to 33 moves and the technique (Deletang's triangles or the "W" manoeuvre of the knight) must be learned.
+ Drive the king to the edge, then towards the right corner; the knight's W-manoeuvre stops it escaping along the edge.

# basic-mates | endgame | الكش مات الأساسي | Basic mates
refs: capablanca-fundamentals, capablanca-primer, pandolfini-endgame-course, seirawan-endings, chandler-beat-dad, nunn-pawnless
rel: bishop-knight-mate, stalemate
pz: c_mate
> Queen and king, rook and king, two bishops: drive the enemy king to the edge with the "box" method, bring your king close, then mate — always watching for stalemate.
+ With the rook: shrink the box; with the queen: a knight's move away from the enemy king keeps it boxed.
! Stalemate when the enemy king has no squares and it is his move.
ex: 8/8/8/4k3/8/8/8/KR6 w - - 0 1 | win w | Rook and king against king: shrink the box with the rook, bring the king, mate on the edge.

# stalemate | endgame | التعادل بالخنق (البات) | Stalemate
refs: capablanca-primer, dvoretsky-endgame-manual, nunn-practical
rel: basic-mates, queen-vs-pawn, fortress
pz: c_endgame
> If the side to move has no legal move and is not in check, the game is drawn — the defender's last resource and a frequent blunder by the winning side.
+ Defensive tricks: sacrifice your last pieces so your king is left without moves (a "desperado" rook).
= When winning, always check whether the opponent has any legal move left after your move.
ex: 7k/8/6K1/8/8/8/8/5Q2 w - - 0 1 | mate | Qf8# mates — but 1.Qf7?? would be stalemate.

# fortress | endgame | القلعة الدفاعية (الحصن) | Fortress
refs: dvoretsky-endgame-manual, soltis-defense, marin-defence, nunn-practical
rel: opposite-bishops, rook-pawn-draw, defence-methods
pz: p_defense
> A defensive set-up that the stronger side cannot break, even with extra material — for example the king in the corner against a rook pawn and wrong bishop, or a blockade with opposite bishops.
+ The defender looks for squares the attacker cannot reach and pieces that cannot be driven away.
= When much worse, ask: is there a set-up where I simply wait and nothing can happen?

# passed-pawn | endgame | البيدق الحر | The passed pawn
refs: nimzowitsch-my-system, capablanca-fundamentals, shankland-small-steps, muller-lamprecht-fce
rel: blockade, outside-passed-pawn, protected-passed-pawn, rook-behind-passer, rule-of-square
pz: p_advancedPawn
> A pawn with no enemy pawns in front of it or on adjacent files. It "lusts to expand" (Nimzowitsch): it ties down enemy pieces and becomes stronger as it advances.
+ Create passed pawns with pawn majorities; push them supported by the king and pieces.
+ The best defence is the blockade: a piece (ideally a knight) directly in front of the pawn.
= Push the passed pawn when it is safe; every step forward restricts the opponent more.
! Letting the opponent blockade your passer cheaply, or allowing his passed pawn to run while you attack.

# pawn-majority | endgame | الأغلبية البيدقية | Pawn majority
refs: capablanca-last-lectures, euwe-kramer-middlegame, nimzowitsch-my-system, pachman-strategy
rel: outside-passed-pawn, passed-pawn, minority-attack
pz: c_endgame
> More pawns than the opponent on one wing; the majority should be advanced to create a passed pawn, the "candidate" pawn (the one without an opponent on its file) leading.
+ A healthy queenside majority is an endgame advantage, because the passed pawn created is far from the kings.
= Advance the candidate pawn first, supported by the others.
! Advancing the wrong pawn of the majority, which leaves a blocked structure and no passed pawn.

# do-not-hurry | endgame | لا تستعجل | "Do not hurry"
refs: shereshevsky-endgame-strategy, karolyi-karpov-endgame, chernev-capablanca-endings
rel: two-weaknesses, endgame-principles, prophylaxis
pz: c_endgame
> In a better endgame where the opponent cannot create counterplay, improve every piece and pawn first; only then take decisive action. Moves that change nothing are useful because they can tire the defender and reveal the best set-up.
+ Repeating moves can be a weapon: it gains time on the clock and keeps options open.

# two-weaknesses | endgame | مبدأ الضعفين | The principle of two weaknesses
refs: shereshevsky-endgame-strategy, nimzowitsch-my-system, dvoretsky-school-strategic, hellsten-endgame-strategy, aagaard-endgame-play
rel: do-not-hurry, weak-pawns, endgame-principles
pz: c_endgame
> One weakness can usually be defended; the winning method is to attack it, tie the defending pieces down, then create a second weakness on the other wing — the defence cannot cover both.
+ The second weakness can be a pawn, a passed pawn, or an entry square for the king.
= Fix the first weakness, put maximum pressure on it, then open the other wing.

# exchange-when-ahead | endgame | التبادل عند التفوق | Simplifying when ahead
refs: capablanca-fundamentals, lasker-common-sense, seirawan-endings, nunn-practical, speelman-endgame-prep
rel: endgame-principles, converting-advantage
pz: c_endgame
> When ahead in material, exchange pieces (not pawns): every trade increases the relative weight of your extra material and reduces the opponent's counterplay. When behind, keep pieces and trade pawns.
+ Exception: do not enter a pawn ending, opposite-coloured bishops or a rook ending with all pawns on one wing without checking that it really wins.

# decoy-endgame | endgame | الإبعاد في النهاية | Decoying the king
refs: capablanca-fundamentals, muller-lamprecht-pawn
rel: outside-passed-pawn, two-weaknesses
pz: p_pawnEnd
> Using a passed pawn on one wing to pull the enemy king away from the other wing, where your king then wins pawns.
