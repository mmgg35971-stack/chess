// The offline coach: answers on the device, without any API key or internet, from the knowledge network.
// It understands the question by matching it to concepts (Arabic aliases, English keywords), then writes
// the answer in the coach's voice from the concept's Arabic text, with an example board, the source books,
// puzzles for the idea, links to the app's lessons and follow-up topics. Positions given as FEN are
// analysed with Stockfish.
import { Chess } from 'chess.js';
import type { CoachProfile, CoachGameStats } from '../coach/coaches';
import type { Lang } from '../settings';
import type { KConcept, KnowledgeIndex } from './knowledge';
import type { AnalyseResult } from './agent';
import { normalizeFen } from './tags';

// ---------- Arabic normalisation ----------
const PREFIXES = /^(وبال|وال|بال|كال|فال|لل|ال|و)(?=..)/;
export function normAr(s: string): string {
  return s.toLowerCase()
    .replace(/[ً-ٰٟـ]/g, '') // diacritics, tatweel
    .replace(/[إأآٱ]/g, 'ا').replace(/ة/g, 'ه').replace(/ى/g, 'ي').replace(/ؤ/g, 'و').replace(/ئ/g, 'ي')
    .replace(/[^\p{L}\p{N}\s]/gu, ' ').replace(/\s+/g, ' ').trim();
}
export function arWords(s: string): string[] {
  return normAr(s).split(' ').filter(Boolean).map((w) => (w.length > 4 ? w.replace(PREFIXES, '') : w.length > 3 ? w.replace(/^(ال)(?=..)/, '') : w));
}
const sameWord = (a: string, b: string) => a === b || (a.length >= 4 && b.length >= 4 && (a.startsWith(b) || b.startsWith(a)));

const STOP_AR = new Set(['في', 'من', 'الي', 'الى', 'علي', 'على', 'عن', 'ما', 'ماذا', 'كيف', 'متي', 'هل', 'لي', 'لك', 'اشرح', 'شرح', 'اعطني', 'عطني', 'مع', 'او', 'ثم', 'هذا', 'هذه', 'ذلك', 'التي', 'الذي', 'لما', 'عندما', 'شنو', 'شو', 'ايش', 'انا', 'انت', 'به', 'بها', 'هو', 'هي', 'مثال', 'بمثال', 'فكره', 'الفكره', 'and', 'the', 'of', 'to', 'in', 'how', 'what', 'is', 'a']);
const content = (ws: string[]) => ws.filter((w) => !STOP_AR.has(w) && w.length > 1);

/** idf of Arabic words across all concepts' Arabic texts: specific words ("معارضه") outweigh common ones ("نهايه"). */
const idfCache = new WeakMap<KnowledgeIndex, (w: string) => number>();
function idfOf(kx: KnowledgeIndex) {
  let f = idfCache.get(kx);
  if (f) return f;
  const docs = kx.data.concepts.map((c) => new Set(content(arWords([c.title.ar, ...(c.ar?.aka ?? []), c.ar?.summary ?? '', ...(c.ar?.ideas ?? [])].join(' ')))));
  const N = docs.length;
  f = (w: string) => {
    let df = 0;
    for (const d of docs) { for (const x of d) if (sameWord(x, w)) { df++; break; } }
    return Math.log(1 + N / (1 + df));
  };
  const memo = new Map<string, number>();
  const g = (w: string) => { let v = memo.get(w); if (v === undefined) { v = f!(w); memo.set(w, v); } return v; };
  idfCache.set(kx, g);
  return g;
}

/** Concepts ranked for a question, by Arabic aliases/titles first, English keywords second. */
export function matchConcepts(q: string, kx: KnowledgeIndex, k = 3): { c: KConcept; score: number }[] {
  const qw = content(arWords(q));
  const idf = idfOf(kx);
  const scores = new Map<string, number>();
  for (const c of kx.data.concepts) {
    let best = 0;
    for (const alias of [...(c.ar?.aka ?? []), c.title.ar]) {
      const aw = content(arWords(alias));
      if (!aw.length) continue;
      const matched = aw.filter((w) => qw.some((x) => sameWord(x, w)));
      const weight = matched.reduce((a, w) => a + idf(w), 0);
      if (matched.length === aw.length) best = Math.max(best, weight * (1 + 0.15 * aw.length));
      else if (aw.length >= 2 && matched.length >= aw.length - 1 && matched.length) best = Math.max(best, weight * 0.5);
    }
    if (best) scores.set(c.id, best);
  }
  // Latin words (Lucena, IQP, Najdorf, "fork") through the English index; moves like e4 or Nf3 are not keywords
  const latin = (q.match(/[A-Za-z][A-Za-z'-]{2,}/g) ?? []).filter((w) => !/^([KQRBN]?[a-h]?x?[a-h][1-8]|O-O(-O)?)$/.test(w)).join(' ');
  if (latin) kx.search(latin, 3).forEach((c, i) => scores.set(c.id, (scores.get(c.id) ?? 0) + 6 - i * 1.5));
  return [...scores.entries()].sort((a, b) => b[1] - a[1]).slice(0, k).map(([id, score]) => ({ c: kx.byId.get(id)!, score }));
}

// ---------- intents ----------
const has = (q: string, words: string[]) => {
  const w = arWords(q), nq = ' ' + normAr(q) + ' ';
  return words.some((x) => (x.includes(' ') ? nq.includes(' ' + normAr(x) + ' ') : w.some((y) => sameWord(y, normAr(x)))));
};
const GREET = ['مرحبا', 'اهلا', 'السلام', 'هلا', 'صباح', 'مساء', 'hello', 'hi'];
const ABOUT = ['من انت', 'عرفني', 'نفسك', 'اسلوبك', 'افتتاحياتك', 'تلعب', 'مبارياتك', 'تحب'];
const MORE = ['اكثر', 'المزيد', 'زيدني', 'تفاصيل', 'كمل', 'اكمل', 'more'];
const PUZZLES = ['لغز', 'الغاز', 'ألغاز', 'تمرين', 'تمارين', 'puzzle', 'puzzles'];
const THANKS = ['شكرا', 'مشكور', 'thanks', 'thank'];

const FEN_RE = /([rnbqkpRNBQKP1-8]{1,8}\/){7}[rnbqkpRNBQKP1-8]{1,8}(\s+[wb](\s+(-|[KQkq]{1,4})(\s+(-|[a-h][36])(\s+\d+\s+\d+)?)?)?)?/;

// Concepts that have a guided lesson or an openings course in the app
const LESSON_OF: Record<string, string> = {
  opposition: 'opposition-1', 'key-squares': 'key-squares-1', 'rule-of-square': 'square-1', 'king-pawn-vs-king': 'king-front',
  breakthrough: 'breakthrough', philidor: 'philidor', 'queen-vs-pawn': 'queen-pawn', 'wrong-bishop': 'wrong-bishop', 'rook-pawn-draw': 'wrong-bishop',
  lucena: 'lucena', 'outside-passed-pawn': 'outside-passer', 'smothered-mate': 'smothered', 'greek-gift': 'greek-gift',
  'back-rank': 'back-rank', 'seventh-rank': 'rook-seventh', 'candidate-moves': 'calc-combo',
};
const OPENING_OF: Record<string, string> = {
  'london-ideas': 'london', 'kid-ideas': 'kid', 'sicilian-ideas': 'sicilian', 'french-ideas': 'french', 'caro-ideas': 'caro-kann',
  'ruy-ideas': 'ruy-lopez', 'italian-ideas': 'italian', 'scotch-ideas': 'scotch', 'vienna-ideas': 'vienna', 'kings-gambit-ideas': 'kings-gambit',
  'qgd-ideas': 'qgd', 'slav-ideas': 'slav', 'nimzo-ideas': 'nimzo', 'grunfeld-ideas': 'grunfeld', 'catalan-ideas': 'catalan',
  'english-ideas': 'english', 'reti-ideas': 'reti', 'dutch-ideas': 'dutch', 'scandinavian-ideas': 'scandinavian', 'pirc-ideas': 'pirc',
};
// What each coach "loves" — used for one line of personal flavour
const LOVES: Record<string, { ids: string[]; ar: string; en: string }> = {
  tal: { ids: ['sacrifice-types', 'greek-gift', 'attack-castled-king', 'king-in-centre', 'initiative', 'pawn-sacrifice', 'exchange-sacrifice', 'style-tal'], ar: 'وهذا موضوعي المفضّل: على طريقة تال، المبادرة أغلى من المادة أحيانًا.', en: 'This is my favourite subject — in Tal’s way, the initiative is sometimes worth more than material.' },
  fischer: { ids: ['bishop-pair', 'ruy-ideas', 'sicilian-ideas', 'converting-advantage', 'style-fischer', 'open-file'], ar: 'فيشر كان يحب هذا الوضوح: قطع نشطة وخطة بسيطة تُنفَّذ بدقة.', en: 'Fischer loved this kind of clarity: active pieces and a simple plan executed precisely.' },
  kasparov: { ids: ['initiative', 'sicilian-ideas', 'grunfeld-ideas', 'kid-ideas', 'scotch-ideas', 'style-kasparov', 'attack-castled-king'], ar: 'على طريقة كاسباروف: التحضير العميق والمبادرة هما السلاح.', en: 'In Kasparov’s way: deep preparation and the initiative are the weapons.' },
  carlsen: { ids: ['do-not-hurry', 'two-weaknesses', 'endgame-principles', 'worst-piece', 'converting-advantage', 'style-carlsen', 'rook-endgame-principles'], ar: 'على طريقة كارلسن: لا تستعجل، واعصر الأفضلية الصغيرة حتى النهاية.', en: 'In Carlsen’s way: don’t hurry, squeeze the small edge all the way to the endgame.' },
  nakamura: { ids: ['practical-decisions', 'time-management', 'swindles', 'style-nakamura', 'tactics-basics'], ar: 'على طريقة ناكامورا: القرار العملي السريع يكسب نقاطًا كثيرة.', en: 'In Nakamura’s way: quick practical decisions win a lot of points.' },
  caruana: { ids: ['study-openings', 'candidate-moves', 'qgd-ideas', 'ruy-ideas', 'calculation'], ar: 'على طريقة كاروانا: التحضير الدقيق والحساب الهادئ.', en: 'In Caruana’s way: precise preparation and calm calculation.' },
  firouzja: { ids: ['initiative', 'attack-castled-king', 'opposite-castling', 'pawn-storm'], ar: 'على طريقة فيروزجا: لعب نشط وهجومي من البداية.', en: 'In Firouzja’s way: active, attacking play from the start.' },
};

function pick<T>(xs: T[], seed: number): T { return xs[Math.abs(seed) % xs.length]; }
function hash(s: string) { let h = 0; for (const ch of s) h = (h * 31 + ch.charCodeAt(0)) | 0; return h; }

const INTRO_AR = ['خلّيني أشرح لك **{t}** ببساطة:', 'سؤال ممتاز! الفكرة هنا هي **{t}**:', 'هذا موضوع مهم جدًا: **{t}**.', 'تعال نفهم **{t}** خطوة خطوة:'];
const INTRO_EN = ['Let me explain **{t}** simply:', 'Great question! The idea here is **{t}**:', 'This is an important one: **{t}**.', 'Let’s go through **{t}** step by step:'];

export interface LocalReply { text: string; topic?: string }
export interface LocalInput {
  question: string; lang: Lang; coach: CoachProfile; stats: CoachGameStats | null;
  kx: KnowledgeIndex; lastTopic?: string; analyse?: (fen: string) => Promise<AnalyseResult | null>;
}

function sourcesLine(c: KConcept, kx: KnowledgeIndex, L: Lang) {
  const refs = c.refs.map((r) => kx.refById.get(r)).filter(Boolean).slice(0, 4).map((r) => `- ${r!.title} — ${r!.author.split(' & ')[0].split(' (')[0]}`);
  return refs.length ? (L === 'ar' ? '📚 **من أين جاءت الفكرة:**' : '📚 **Where the idea comes from:**') + '\n' + refs.join('\n') : '';
}

const q = (s: string) => s.replace(/"/g, "'");
/** An example as a step-through line, or — when it has a checked claim — as an interactive exercise. */
function exampleTag(c: KConcept, i: number, L: Lang): string {
  const e = c.examples[i];
  if (!e) return '';
  const note = q((L === 'ar' ? c.ar?.notes[i] : e.note) ?? e.note);
  const vis = `${e.arrows ? ` arrows="${e.arrows}"` : ''}${e.marks ? ` marks="${e.marks}"` : ''}`;
  if (e.moves) return `[[line fen="start" moves="${e.moves}" caption="${note}"${vis}]]`;
  if (e.claim && e.fen) {
    const [kind, arg] = e.claim.split(/\s+/);
    const fen = e.fen;
    const stm = fen.split(' ')[1];
    // a "draw" exercise only makes sense for the defending (weaker) side
    const mat = (side: 'w' | 'b') => [...fen.split(' ')[0]].reduce((a, ch) => a + ((side === 'w' ? ch === ch.toUpperCase() : ch === ch.toLowerCase()) ? ({ p: 1, n: 3, b: 3, r: 5, q: 9 } as Record<string, number>)[ch.toLowerCase()] ?? 0 : 0), 0);
    const weaker = mat(stm as 'w' | 'b') < mat(stm === 'w' ? 'b' : 'w');
    const goal = kind === 'mate' ? 'mate' : kind === 'best' ? 'best' : kind === 'draw' && weaker ? 'draw' : kind === 'win' && arg === stm ? 'win' : '';
    if (goal) {
      const side = stm === 'w' ? (L === 'ar' ? 'الأبيض' : 'White') : (L === 'ar' ? 'الأسود' : 'Black');
      const prompt = L === 'ar'
        ? ({ mate: `${side} يلعب ويعطي كش مات — جرّب!`, best: `${side} يلعب — ما أفضل نقلة؟`, win: `${side} يلعب ويفوز — ما النقلة الصحيحة؟`, draw: `${side} يلعب ويتعادل — كيف تدافع؟` } as Record<string, string>)[goal]
        : ({ mate: `${side} to play and mate — try it!`, best: `${side} to play — what is the best move?`, win: `${side} to play and win — find the move`, draw: `${side} to play and draw — how do you defend?` } as Record<string, string>)[goal];
      const answer = kind === 'best' ? ` answer="${arg}"` : '';
      return `[[quiz fen="${e.fen}" goal="${goal}"${answer} prompt="${prompt}" explain="${note}"]]`;
    }
  }
  return `[[board fen="${e.fen}" caption="${note}"${vis}]]`;
}

/** Puzzle themes that really match a concept (generic categories would show unrelated puzzles). */
const GENERIC_PZ = new Set(['opening', 'c_middlegame', 'c_random', 'c_tactics', 'c_best']);
const usefulPuzzles = (c: KConcept) => !!c.pz && !GENERIC_PZ.has(c.pz);

function followUps(c: KConcept, kx: KnowledgeIndex, L: Lang) {
  const rel = c.rel.map((r) => kx.byId.get(r)).filter(Boolean).slice(0, 3) as KConcept[];
  return rel.map((r) => `[[ask q="${L === 'ar' ? `اشرح لي ${r.title.ar}` : `Explain ${r.title.en}`}"]]`).join('\n');
}

/** Full explanation of one concept (first answer). */
function explain(c: KConcept, inp: LocalInput, wantPuzzles: boolean): string {
  const L = inp.lang, ar = L === 'ar' && c.ar;
  const title = L === 'ar' ? c.title.ar : c.title.en;
  const intro = pick(L === 'ar' ? INTRO_AR : INTRO_EN, hash(inp.question + c.id)).replace('{t}', title);
  const summary = ar ? c.ar!.summary : c.summary;
  const ideas = (ar ? c.ar!.ideas : c.ideas).slice(0, 3);
  const how = (ar ? c.ar!.how : c.how).slice(0, 2);
  const mistake = (ar ? c.ar!.mistakes : c.mistakes)[0];
  const out: string[] = [intro, summary];
  if (ideas.length) out.push((L === 'ar' ? '**الأفكار المهمة:**' : '**Key ideas:**') + '\n' + ideas.map((x) => '- ' + x).join('\n'));
  if (how.length) out.push((L === 'ar' ? '**كيف تلعبها:**' : '**How to play it:**') + '\n' + how.map((x) => '- ' + x).join('\n'));
  if (mistake) out.push((L === 'ar' ? '⚠️ **خطأ شائع:** ' : '⚠️ **Common mistake:** ') + mistake);
  if (c.id === 'repertoire' || c.id === 'study-openings') {
    const co = inp.coach, st = inp.stats;
    if (st?.topOpenings.length) out.push(L === 'ar' ? `ومن مباريات ${co.name.ar} الحقيقية في التطبيق، أكثر ما يلعبه: ${st.topOpenings.slice(0, 4).map((o) => `${o.name} (${o.n})`).join('، ')}.` : `From ${co.name.en}'s real games in the app, the most played: ${st.topOpenings.slice(0, 4).map((o) => `${o.name} (${o.n})`).join(', ')}.`);
    const bl = co.book.black[0], wh = co.book.white[0];
    if (wh) out.push(`[[line fen="start" moves="${wh}" caption="${L === 'ar' ? 'خط يلعبه بالأبيض' : 'A line he plays with White'}"]]`);
    if (bl) out.push(`[[line fen="start" moves="${bl}" caption="${L === 'ar' ? 'خط يلعبه بالأسود' : 'A line he plays with Black'}"]]`);
  }
  const love = LOVES[inp.coach.id];
  if (love?.ids.includes(c.id)) out.push(L === 'ar' ? love.ar : love.en);
  if (c.examples.length) {
    const n = Math.min(c.examples.length, 4);
    const head = L === 'ar' ? (n > 1 ? `شوف هذه الأمثلة (${n}) — تنقّل بين النقلات، والأسهم توضّح الخطة:` : 'شوف هذا المثال:') : (n > 1 ? `Look at these ${n} examples — step through the moves; the arrows show the plan:` : 'Look at this example:');
    out.push(head + '\n' + c.examples.slice(0, n).map((_, i) => exampleTag(c, i, L)).join('\n'));
  }
  const src = sourcesLine(c, inp.kx, L);
  if (src) out.push(src);
  if (usefulPuzzles(c) || (wantPuzzles && c.pz)) out.push((wantPuzzles ? (L === 'ar' ? 'هذه ألغاز للتمرين على الفكرة نفسها:' : 'Here are puzzles on exactly this idea:') : (L === 'ar' ? 'جرّب هذه الألغاز لتثبيت الفكرة 👇' : 'Try these puzzles to lock the idea in 👇')) + `\n[[puzzles theme="${c.pz}" n="${wantPuzzles ? 5 : 3}"]]`);
  if (LESSON_OF[c.id]) out.push(`[[lesson id="${LESSON_OF[c.id]}"]]`);
  if (OPENING_OF[c.id]) out.push(`[[opening id="${OPENING_OF[c.id]}"]]`);
  const fu = followUps(c, inp.kx, L);
  if (fu) out.push((L === 'ar' ? 'تحب نكمل بموضوع قريب؟' : 'Want to continue with a related topic?') + '\n' + fu);
  return out.join('\n\n');
}

/** "Tell me more": the rest of the concept, the other examples, and deeper links. */
function more(c: KConcept, inp: LocalInput): string {
  const L = inp.lang, ar = L === 'ar' && c.ar;
  const ideas = (ar ? c.ar!.ideas : c.ideas).slice(3);
  const how = (ar ? c.ar!.how : c.how).slice(2);
  const mistakes = (ar ? c.ar!.mistakes : c.mistakes).slice(1);
  const out: string[] = [L === 'ar' ? `نكمل في **${c.title.ar}**:` : `More on **${c.title.en}**:`];
  if (ideas.length) out.push(ideas.map((x) => '- ' + x).join('\n'));
  if (how.length) out.push((L === 'ar' ? '**وأيضًا عمليًا:**' : '**Also in practice:**') + '\n' + how.map((x) => '- ' + x).join('\n'));
  if (mistakes.length) out.push((L === 'ar' ? '⚠️ **وانتبه أيضًا:** ' : '⚠️ **Also watch out:** ') + mistakes.join(' '));
  for (let i = 4; i < c.examples.length; i++) out.push(exampleTag(c, i, L));
  for (const r of c.rel.slice(0, 2)) {
    const rc = inp.kx.byId.get(r);
    if (rc?.examples.length) out.push((L === 'ar' ? `ومثال من موضوع قريب (**${rc.title.ar}**):` : `And an example from a related topic (**${rc.title.en}**):`) + '\n' + exampleTag(rc, 0, L));
  }
  const refs = c.refs.map((r) => inp.kx.refById.get(r)).filter(Boolean).slice(0, 3);
  for (const r of refs) {
    const idea = r!.ideas[0];
    if (idea) out.push(`📖 **${r!.title}** (${r!.author}, ${r!.year}) — ${L === 'ar' ? 'من أفكاره (بالإنجليزية كما في فهرس المراجع):' : 'one of its ideas:'} ${idea}`);
  }
  if (out.length === 1) out.push(L === 'ar' ? 'هذا كل ما في الشبكة عن هذا المفهوم حاليًا. جرّب الألغاز أو موضوعًا قريبًا:' : 'That is everything the network has on this concept. Try the puzzles or a related topic:');
  if (usefulPuzzles(c)) out.push(`[[puzzles theme="${c.pz}" n="3"]]`);
  const fu = followUps(c, inp.kx, L);
  if (fu) out.push(fu);
  return out.join('\n\n');
}

function aboutCoach(inp: LocalInput): string {
  const { coach: c, stats: s, lang: L } = inp;
  const out = [L === 'ar' ? `أنا مدرب يدرّبك على طريقة **${c.name.ar}** (لست ${c.name.ar} نفسه طبعًا 😄).` : `I coach you in the style of **${c.name.en}** (not ${c.name.en} himself, of course 😄).`, c.bio[L], c.style[L]];
  if (c.strengths.length) out.push((L === 'ar' ? '**نقاط القوة:** ' : '**Strengths:** ') + c.strengths.map((x) => x[L]).join(L === 'ar' ? '، ' : ', '));
  if (s) {
    out.push(L === 'ar'
      ? `من ${s.games} مباراة كلاسيكية حقيقية حللها التطبيق: ${s.score.win} فوز، ${s.score.draw} تعادل، ${s.score.loss} خسارة. أكثر الافتتاحيات: ${s.topOpenings.slice(0, 4).map((o) => o.name).join('، ')}.`
      : `From ${s.games} real classical games analysed by the app: ${s.score.win} wins, ${s.score.draw} draws, ${s.score.loss} losses. Most played: ${s.topOpenings.slice(0, 4).map((o) => o.name).join(', ')}.`);
  }
  const style = inp.kx.byId.get('style-' + c.id);
  if (style) out.push(`[[ask q="${L === 'ar' ? `اشرح لي ${style.title.ar}` : `Explain ${style.title.en}`}"]]`);
  return out.join('\n\n');
}

function menu(inp: LocalInput, notFound: boolean): string {
  const L = inp.lang;
  const head = notFound
    ? (L === 'ar' ? 'ما فهمت تمامًا أي فكرة تقصد 🤔. أنا أعرف أكثر من 150 مفهومًا: الافتتاحيات، الخطط، التكتيك، الهجوم والدفاع، الحساب، والنهايات. جرّب كلمة مثل «المعارضة» أو «البيدق المعزول» أو «الشوكة»، أو الصق وضعية FEN وأحللها لك. أو اختر:' : 'I didn’t quite get which idea you mean 🤔. I know 150+ concepts: openings, plans, tactics, attack and defence, calculation and endgames. Try a word like “opposition”, “isolated pawn” or “fork”, or paste a FEN and I’ll analyse it. Or pick one:')
    : (L === 'ar' ? `أهلًا! أنا مدربك على طريقة ${inp.coach.name.ar}. اسألني عن أي فكرة وسأشرحها بمثال على الرقعة وأعطيك ألغازًا للتمرين. مثلًا:` : `Hi! I’m your coach in ${inp.coach.name.en}’s style. Ask me about any idea and I’ll explain it with an example and give you puzzles. For example:`);
  const ids = ['plan-making', 'opposition', 'isolated-pawn', 'attack-castled-king', 'fork', 'lucena', 'opening-principles', 'candidate-moves'];
  const start = Math.abs(hash(inp.question)) % ids.length;
  const chosen = [0, 1, 2, 3].map((k) => inp.kx.byId.get(ids[(start + k) % ids.length])).filter(Boolean) as KConcept[];
  return head + '\n' + chosen.map((c) => `[[ask q="${L === 'ar' ? `اشرح لي ${c.title.ar}` : `Explain ${c.title.en}`}"]]`).join('\n');
}

async function analysePosition(fenIn: string, inp: LocalInput): Promise<string> {
  const L = inp.lang;
  const fen = normalizeFen(fenIn);
  if (!fen) return L === 'ar' ? 'هذه الوضعية غير صالحة (FEN غير قانوني). تأكد من النص وأعد إرساله.' : 'That position is not valid (illegal FEN). Check it and send it again.';
  const g = new Chess(fen);
  const board = `[[board fen="${fen}" caption="${L === 'ar' ? (g.turn() === 'w' ? 'الدور على الأبيض' : 'الدور على الأسود') : (g.turn() === 'w' ? 'White to move' : 'Black to move')}"]]`;
  if (g.isGameOver()) return board + '\n\n' + (g.isCheckmate() ? (L === 'ar' ? 'هذه الوضعية كش مات بالفعل.' : 'This position is already checkmate.') : (L === 'ar' ? 'المباراة منتهية بالتعادل في هذه الوضعية.' : 'The game is drawn in this position.'));
  const r = inp.analyse ? await inp.analyse(fen) : null;
  if (!r) return board + '\n\n' + (L === 'ar' ? 'المحرك غير متاح الآن، جرّب زر «افحص بـ Stockfish» تحت الرقعة.' : 'The engine is not available right now; try the “Check with Stockfish” button under the board.');
  const v = r.eval;
  const num = v.startsWith('#') || v.startsWith('M') ? null : parseFloat(v);
  const verdict = num === null ? (L === 'ar' ? 'هناك كش مات بالقوة.' : 'There is a forced mate.')
    : Math.abs(num) < 0.5 ? (L === 'ar' ? 'الوضعية متعادلة تقريبًا.' : 'The position is roughly equal.')
      : Math.abs(num) < 1.5 ? (L === 'ar' ? `أفضلية ${num > 0 ? 'للأبيض' : 'للأسود'}.` : `${num > 0 ? 'White' : 'Black'} is better.`)
        : (L === 'ar' ? `${num > 0 ? 'الأبيض' : 'الأسود'} متفوق بوضوح.` : `${num > 0 ? 'White' : 'Black'} is clearly better.`);
  const lines = r.best.slice(0, 3).map((l, i) => `${i + 1}. ${l.slice(0, 6).join(' ')}`).join('\n');
  const line0 = r.best[0]?.length ? `[[line fen="${fen}" moves="${r.best[0].slice(0, 8).join(' ')}" caption="${L === 'ar' ? 'أفضل خط حسب Stockfish' : 'Best line according to Stockfish'}"]]` : '';
  return [board, (L === 'ar' ? `**تقييم Stockfish:** ${v} — ${verdict}` : `**Stockfish:** ${v} — ${verdict}`), (L === 'ar' ? '**أفضل الخطوط:**' : '**Best lines:**') + '\n' + lines, line0].filter(Boolean).join('\n\n');
}

export async function localReply(inp: LocalInput): Promise<LocalReply> {
  const q = inp.question.trim();
  const L = inp.lang;
  const fen = q.match(FEN_RE)?.[0];
  if (fen) return { text: await analysePosition(fen, inp) };
  const matches = matchConcepts(q, inp.kx);
  const wantPuzzles = has(q, PUZZLES);
  const last = inp.lastTopic ? inp.kx.byId.get(inp.lastTopic) : undefined;
  if (!matches.length) {
    if (last && has(q, MORE)) return { text: more(last, inp), topic: last.id };
    if (last && wantPuzzles && last.pz) return { text: (L === 'ar' ? `ألغاز على **${last.title.ar}**:` : `Puzzles on **${last.title.en}**:`) + `\n[[puzzles theme="${last.pz}" n="5"]]`, topic: last.id };
    if (has(q, ABOUT)) return { text: aboutCoach(inp) };
    if (has(q, THANKS)) return { text: L === 'ar' ? 'العفو! 🙏 متى ما أردت نكمل، اسألني عن أي فكرة.' : 'You’re welcome! 🙏 Ask me about any idea whenever you like.' };
    if (wantPuzzles) return { text: (L === 'ar' ? 'هذه ألغاز متنوعة قريبة من مستواك:' : 'Here are mixed puzzles near your level:') + '\n[[puzzles theme="c_tactics" n="5"]]' };
    return { text: menu(inp, !has(q, GREET)) };
  }
  const top = matches[0].c;
  if (last && top.id === last.id && has(q, MORE)) return { text: more(top, inp), topic: top.id };
  let text = explain(top, inp, wantPuzzles);
  if (matches.length > 1 && matches[1].score >= matches[0].score * 0.6) {
    text += '\n\n' + (L === 'ar' ? 'وربما تقصد أيضًا:' : 'You might also mean:') + '\n' + matches.slice(1).map((m) => `[[ask q="${L === 'ar' ? `اشرح لي ${m.c.title.ar}` : `Explain ${m.c.title.en}`}"]]`).join('\n');
  }
  return { text, topic: top.id };
}
