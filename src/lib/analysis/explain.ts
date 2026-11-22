import type { PieceSymbol } from 'chess.js';
import type { Lang } from '../settings';
import type { MoveLabel } from './classify';
import type { MoveFeatures } from './features';
import type { Score } from '../engine/uci';

/**
 * Turns an engine verdict plus board features into short, plain sentences.
 * Every sentence states something the engine line or the board shows; nothing
 * is attributed to a real player.
 */

const PIECE: Record<Lang, Record<PieceSymbol, string>> = {
  ar: { p: 'البيدق', n: 'الحصان', b: 'الفيل', r: 'القلعة', q: 'الوزير', k: 'الملك' },
  en: { p: 'pawn', n: 'knight', b: 'bishop', r: 'rook', q: 'queen', k: 'king' },
};

export const LABEL_TEXT: Record<Lang, Record<MoveLabel, string>> = {
  ar: {
    brilliant: 'مدهشة', great: 'رائعة', best: 'أفضل نقلة', excellent: 'ممتازة', good: 'جيدة',
    inaccuracy: 'غير دقيقة', mistake: 'خطأ', missedWin: 'أضاعت فرصة', blunder: 'خطأ فادح',
  },
  en: {
    brilliant: 'Brilliant', great: 'Great move', best: 'Best move', excellent: 'Excellent', good: 'Good',
    inaccuracy: 'Inaccuracy', mistake: 'Mistake', missedWin: 'Missed win', blunder: 'Blunder',
  },
};

export const LABEL_SYMBOL: Record<MoveLabel, string> = {
  brilliant: '!!', great: '!', best: '★', excellent: '✓', good: '·', inaccuracy: '?!', mistake: '?', missedWin: '✕', blunder: '??',
};

export interface ExplainInput {
  lang: Lang;
  label: MoveLabel;
  played: MoveFeatures;
  /** features of the engine's preferred move, when the played move was not it */
  best?: MoveFeatures | null;
  bestSan?: string | null;
  /** engine eval before the move (mover POV) and after the played move (mover POV) */
  before: Score;
  after: Score;
  /** opponent's best reply line in SAN after the played move */
  replySan?: string[];
  phase: 'opening' | 'middlegame' | 'endgame';
}

export interface Explanation {
  headline: string;
  reasons: string[];
  better: string | null;
}

const T = {
  ar: {
    praise: {
      brilliant: 'تضحية صحيحة! يثبت التحليل أن ما تخليت عنه يعود عليك بأفضلية.',
      great: 'نقلة رائعة: كانت تقريباً النقلة الوحيدة التي تحافظ على وضعك.',
      best: 'هذه أفضل نقلة في الوضعية حسب التحليل.',
      excellent: 'نقلة ممتازة، قريبة جداً من الأفضل.',
      good: 'نقلة جيدة، لكن كان هناك ما هو أدق قليلاً.',
    },
    warn: {
      inaccuracy: 'نقلة غير دقيقة: تفقد جزءاً من أفضليتك.',
      mistake: 'هذه النقلة خطأ: تعطي الخصم فرصة واضحة.',
      missedWin: 'أضعت فرصة: كانت الوضعية فائزة قبل هذه النقلة.',
      blunder: 'خطأ فادح: يغيّر نتيجة المباراة.',
    },
    mateFor: (n: number) => `أصبح لديك كش مات في ${n}.`,
    allowsMate: (n: number) => `هذه النقلة تسمح للخصم بكش مات في ${n}.`,
    missedMate: (n: number, san: string) => `كان لديك كش مات في ${n} بدءاً بـ ${san}.`,
    losesPiece: (p: string, line: string) => `تخسر ${p} بعد ${line}.`,
    losesMaterial: (n: number, line: string) => `تخسر مادة (حوالي ${n} نقاط) بعد ${line}.`,
    hangs: (p: string, sq: string) => `${p} على ${sq} أصبح مهدداً بلا حماية.`,
    winsMaterial: (n: number) => `تكسب مادة (حوالي ${n} نقاط).`,
    capture: (p: string) => `تأخذ ${p}.`,
    check: 'تعطي كش وتجبر الخصم على الرد.',
    develop: 'تطوّر قطعة جديدة، وهذا مبدأ مهم في الافتتاح.',
    castle: 'التبييت يؤمّن الملك ويربط القلعتين.',
    center: 'تسيطر على مربع مركزي.',
    kingPressure: 'تزيد الضغط على ملك الخصم.',
    passed: 'تدفع بيدقاً حراً نحو الترقية.',
    tradeQueens: 'تبادل الوزراء يبسّط الوضعية.',
    earlyQueen: 'إخراج الوزير مبكراً يعرّضه لهجمات القطع الصغيرة.',
    repeats: 'تحريك القطعة نفسها مرتين في الافتتاح يؤخر تطوير باقي القطع.',
    weakensKing: 'دفع بيادق أمام الملك المبيّت يُضعف حمايته.',
    better: (san: string) => `الأفضل كان ${san}`,
    because: ' لأنها ',
    join: '، و',
    bestWhy: {
      capture: 'تأخذ مادة', check: 'تعطي كش', mate: 'تعطي كش مات', develop: 'تطوّر قطعة', castle: 'تؤمّن الملك',
      center: 'تسيطر على المركز', pressure: 'تزيد الضغط على الملك', passed: 'تدفع البيدق الحر', keeps: 'تحافظ على توازن الوضعية',
    },
    opponentIdea: (san: string) => `انتبه: الخصم يهدد بـ ${san}.`,
  },
  en: {
    praise: {
      brilliant: 'A sound sacrifice! The engine confirms that what you gave up comes back as an advantage.',
      great: 'Great move: practically the only one that keeps your position.',
      best: 'This is the best move in the position according to the analysis.',
      excellent: 'Excellent move, very close to the best.',
      good: 'A good move, though something slightly more precise existed.',
    },
    warn: {
      inaccuracy: 'An inaccuracy: you give away part of your advantage.',
      mistake: 'This move is a mistake: it gives your opponent a clear chance.',
      missedWin: 'Missed win: the position was winning before this move.',
      blunder: 'A blunder: it changes the result of the game.',
    },
    mateFor: (n: number) => `You now have mate in ${n}.`,
    allowsMate: (n: number) => `This move allows your opponent mate in ${n}.`,
    missedMate: (n: number, san: string) => `You had mate in ${n} starting with ${san}.`,
    losesPiece: (p: string, line: string) => `You lose your ${p} after ${line}.`,
    losesMaterial: (n: number, line: string) => `You lose material (about ${n} points) after ${line}.`,
    hangs: (p: string, sq: string) => `Your ${p} on ${sq} is attacked and undefended.`,
    winsMaterial: (n: number) => `You win material (about ${n} points).`,
    capture: (p: string) => `You capture a ${p}.`,
    check: 'You give check and force a reply.',
    develop: 'You develop a new piece, a key opening principle.',
    castle: 'Castling makes the king safe and connects the rooks.',
    center: 'You take control of a central square.',
    kingPressure: 'You increase the pressure on the enemy king.',
    passed: 'You push a passed pawn towards promotion.',
    tradeQueens: 'Trading queens simplifies the position.',
    earlyQueen: 'Bringing the queen out early exposes it to attacks by minor pieces.',
    repeats: 'Moving the same piece twice in the opening delays your other pieces.',
    weakensKing: 'Pushing pawns in front of your castled king weakens its shelter.',
    better: (san: string) => `Better was ${san}`,
    because: ', which ',
    join: ' and ',
    bestWhy: {
      capture: 'wins material', check: 'gives check', mate: 'gives checkmate', develop: 'develops a piece', castle: 'secures the king',
      center: 'controls the centre', pressure: 'increases pressure on the king', passed: 'pushes the passed pawn', keeps: 'keeps the position balanced',
    },
    opponentIdea: (san: string) => `Careful: your opponent threatens ${san}.`,
  },
};

const BAD: MoveLabel[] = ['inaccuracy', 'mistake', 'missedWin', 'blunder'];

export function explain(i: ExplainInput): Explanation {
  const t = T[i.lang];
  const P = PIECE[i.lang];
  const bad = BAD.includes(i.label);
  const headline = bad ? t.warn[i.label as keyof typeof t.warn] : t.praise[i.label as keyof typeof t.praise];
  const reasons: string[] = [];
  const f = i.played;
  const line = (i.replySan ?? []).slice(0, 3).join(' ');

  // Mate facts first — they matter most.
  if (i.after.mate !== undefined && i.after.mate > 0) reasons.push(t.mateFor(i.after.mate));
  else if (i.after.mate !== undefined && i.after.mate < 0) reasons.push(t.allowsMate(-i.after.mate));
  if (bad && i.before.mate !== undefined && i.before.mate > 0 && i.bestSan && !(i.after.mate! > 0))
    reasons.push(t.missedMate(i.before.mate, i.bestSan));

  if (bad) {
    if (f.lineMaterialDelta <= -2 && line) {
      if (f.opponentWins && f.opponentWins.piece !== 'p') reasons.push(t.losesPiece(P[f.opponentWins.piece], line));
      else reasons.push(t.losesMaterial(Math.round(-f.lineMaterialDelta), line));
    } else if (f.hangs) {
      reasons.push(t.hangs(P[f.piece], f.to));
    }
    if (f.earlyQueen && i.phase === 'opening') reasons.push(t.earlyQueen);
    if (f.repeatsPieceInOpening) reasons.push(t.repeats);
    if (f.weakensKing) reasons.push(t.weakensKing);
    if (i.replySan?.[0] && reasons.length === 0) reasons.push(t.opponentIdea(i.replySan[0]));
  } else {
    if (f.lineMaterialDelta >= 2) reasons.push(t.winsMaterial(Math.round(f.lineMaterialDelta)));
    else if (f.captured) reasons.push(t.capture(P[f.captured]));
    if (f.isCheck && !f.isMate) reasons.push(t.check);
    if (f.isCastle) reasons.push(t.castle);
    else if (f.develops) reasons.push(t.develop);
    if (f.centralizes && !f.isCastle) reasons.push(t.center);
    if (f.kingPressureDelta >= 2) reasons.push(t.kingPressure);
    if (f.pushesPassedPawn && i.phase !== 'opening') reasons.push(t.passed);
    if (f.tradesQueens) reasons.push(t.tradeQueens);
  }

  let better: string | null = null;
  if (i.bestSan && i.label !== 'best' && i.label !== 'brilliant' && i.label !== 'great') {
    const b = i.best;
    const whys: string[] = [];
    if (b) {
      if (b.isMate) whys.push(t.bestWhy.mate);
      else {
        if (b.lineMaterialDelta >= 2 || (b.isCapture && b.capturedValue >= 3)) whys.push(t.bestWhy.capture);
        if (b.isCheck) whys.push(t.bestWhy.check);
        if (b.isCastle) whys.push(t.bestWhy.castle);
        else if (b.develops) whys.push(t.bestWhy.develop);
        if (b.centralizes && whys.length < 2) whys.push(t.bestWhy.center);
        if (b.kingPressureDelta >= 2 && whys.length < 2) whys.push(t.bestWhy.pressure);
        if (b.pushesPassedPawn && whys.length < 2) whys.push(t.bestWhy.passed);
      }
    }
    if (!whys.length) whys.push(t.bestWhy.keeps);
    better = t.better(i.bestSan) + t.because + whys.slice(0, 2).join(t.join) + '.';
  }
  return { headline, reasons: reasons.slice(0, 3), better };
}
