# ARCHITECTURE — Chess Grandmaster Academy

> الحالة: المرحلة الثانية منفّذة. انظر TASKS.md لحالة كل جزء.

## القرارات المعتمدة

| القرار | الاختيار | السبب |
|---|---|---|
| المنصة الأولى | أندرويد | اختيار صاحب المشروع |
| التقنية | TypeScript + React + Vite، مغلّف بـ Capacitor | كود واحد يصلح لاحقاً للويب وiOS وسطح المكتب |
| الترخيص | GPL-3.0 للمشروع كاملاً | Stockfish تحت GPL-3؛ توحيد الرخصة أبسط وأسلم |
| صور المدربين | شعارات رمزية أصلية (حروف أولى + رمز الأسلوب + لون) | تجنّب صور أشخاص حقيقيين أو محاكاة ملامحهم |

## الطبقات

```
واجهة React (RTL/LTR، داكن/فاتح)
 ├─ Board: مكوّن SVG خاص (سحب/إفلات، نقر، أسهم، تمييز)
 ├─ Screens: Home/Profile, Coaches, Puzzles, Openings, Lessons, Games, Settings
 │
خدمات المنطق (TypeScript خالص، قابلة للاختبار دون واجهة)
 ├─ rules: chess.js (القانونية، الكش، المات، التعادل، PGN/FEN)
 ├─ engine: عميل UCI يتحدث مع Stockfish داخل Web Worker
 ├─ analysis: تصنيف النقلات، الدقة، تقدير الأداء
 ├─ coach: ملفات سلوك المدربين + اختيار النقلة
 ├─ rating: Glicko-2 للألغاز
 ├─ training: كشف نقاط الضعف واقتراح التدريب
 │
التخزين
 ├─ IndexedDB عبر Dexie: بيانات المستخدم (ملف، إعدادات، مباريات، تقدّم، تصنيفات)
 └─ حزم محتوى للقراءة فقط مضمّنة في التطبيق: puzzles, openings, games, lessons, coaches
```

## المحرك
- المضمّن: Stockfish.js 19 نسخة lite single-threaded (~1.8MB، تعمل في WebView أندرويد دون ترويسات COOP/COEP). خادم Capacitor يقدّم ملفات .wasm بالنوع application/wasm.
- لاحقاً، عند توفر SharedArrayBuffer: نسخة متعددة الخيوط (غير مضمّنة حالياً).
- إعدادات المستخدم: العمق، الوقت لكل نقلة، عدد الخيوط، حجم الذاكرة.
- لا تُرسل أي وضعية خارج الجهاز.

## العمل دون اتصال
- كل الملفات داخل حزمة APK؛ لا يوجد خادم.
- لا توجد أي استدعاءات شبكة في الكود؛ يُفرض ذلك باختبار آلي (انظر OFFLINE_TESTS.md).

## بناء APK
- البناء يحتاج Android SDK وGradle. الخطة: GitHub Actions مجاني يبني APK عند كل دفعة كود، ويُنزَّل الملف على الهاتف مباشرة.
- بديل: Android Studio على حاسوب صاحب المشروع.

## نموذج البيانات (IndexedDB)
- `profile` (id, name, avatar, createdAt)
- `settings` (board, play, analysis, app)
- `games` (id, pgn, white, black, coachId, mode, result, startedAt, durationMs, analysisId)
- `analyses` (gameId, engineVersion, depth, perMove[], accuracy{w,b}, perfEstimate{w,b})
- `ratings` (kind: puzzle|play, value, rd, vol, history[])
- `puzzleAttempts` (puzzleId, success, timeMs, ratingBefore, ratingAfter, at)
- `openingProgress` (openingId, stageId, attempts, passed, lastReviewed)
- `lessonProgress` (lessonId, status, score)
- `activity` (type, refId, at, durationMs)
- `achievements` (id, unlockedAt)

## تصنيف النقلات (قيم افتراضية قابلة للضبط)
يعتمد على خسارة احتمال الفوز (Win% loss) بدلاً من السنتي-بيدق الخام، لأنه يعكس أهمية الخطأ حسب الوضعية:
- Best: النقلة الأولى للمحرك بالإعدادات الحالية.
- Excellent ≤ 2%، Good ≤ 5%، Inaccuracy ≤ 10%، Mistake ≤ 20%، Blunder > 20%.
- Missed Win: كانت الوضعية فائزة (≥ 70% مثلاً) وأصبحت غير فائزة.
- Great: النقلة الوحيدة التي تحافظ على النتيجة (بفارق كبير عن البديل الثاني في MultiPV).
- Brilliant: Best أو Great + تضحية مادية حقيقية تثبت صحتها بعد بحث أعمق + ليست وضعية محسومة أصلاً.

## تقدير الأداء
لا تحويل مباشر من الدقة إلى Elo. نموذج انحدار يُعايَر على مباريات Lichess (CC0) معروفة التصنيف، مدخلاته: خسارة Win% المتوسطة، عدد الأخطاء الفادحة، صعوبة الوضعيات، قوة الخصم. يُعرض دائماً بوصفه «تقديراً للمباراة».

## تدفق مباراة المدرب
1. أثناء تفكير المستخدم: تحليل خلفي للوضعية (MultiPV 3، عمق 13، حد 1.8 ث) — يقيّم أيضاً نقلة المدرب السابقة ويغذّي التلميح وشريط التقييم.
2. بعد نقلة المستخدم: يُوقف التحليل الخلفي، ويُحلَّل الوضع الجديد (MultiPV 5) → تقييم نقلة المستخدم وشرحها، ومرشحو نقلة المدرب.
3. المدرب: ذخيرته الافتتاحية أولاً، وإلا اختيار الأسلوب من المرشحين، ثم انتظار حتى 2–5 ث، ثم شرح نقلته.
4. نهاية المباراة: حفظ المباراة والتحليل الحي (`analyses`، kind=live)؛ التحليل الكامل لاحقاً (kind=full).

## اختيار نقلة المدرب
1. الافتتاح: من شجرة مستخرجة من مبارياته الحقيقية، بأوزان تكرارها.
2. بعدها: MultiPV من 4 إلى 8 نقلات ← تصفية بهامش تقييم يحدده مستوى الصعوبة ← ترتيب بدالة أسلوب (تضحية، تعقيد، أمان الملك، تبسيط، نشاط القطع) بأوزان من ملف المدرب.
3. الاختيار حتمي بالنسبة للأوزان؛ لا اختيار عشوائي من خارج المرشحين.
