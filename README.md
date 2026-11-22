# Chess Grandmaster Academy

أكاديمية شطرنج تعليمية تعمل دون إنترنت على أندرويد، بمحرك Stockfish محلي.

> الحالة: المرحلة الثانية (الأساس المحلي) منفّذة ومختبرة في المتصفح. لم تُختبر بعد على هاتف حقيقي.
> التفاصيل في `TASKS.md` و`OFFLINE_TESTS.md`.

## الحصول على APK (دون حاسوب)
1. أنشئ مستودعاً على GitHub وارفع إليه محتوى هذا المجلد (أو اطلب من Claude رفعه).
2. يعمل `Android APK` في تبويب **Actions** تلقائياً عند كل دفعة إلى `main`.
3. افتح آخر تشغيل ناجح ← **Artifacts** ← `chess-academy-debug-apk`، نزّله على الهاتف وثبّته
   (قد يطلب أندرويد السماح بالتثبيت من مصادر غير معروفة).

## التطوير على حاسوب
```bash
npm ci
npm run dev          # تشغيل في المتصفح
npm test             # اختبارات الوحدة
npm run build        # بناء + فحص عدم وجود عناوين خارجية
npm run test:e2e     # اختبار المتصفح مع حجب الشبكة (يحتاج Chrome وPlaywright)
npx cap sync android # نسخ البناء إلى مشروع أندرويد
cd android && ./gradlew assembleDebug   # يحتاج JDK 21 وAndroid SDK
```

## البنية
- `src/lib/chess` — قواعد اللعب وPGN (chess.js)
- `src/lib/engine` — عميل UCI لـ Stockfish داخل Web Worker
- `src/lib/storage` — IndexedDB (Dexie): الملف، المباريات، الجلسة، الإعدادات، النسخ الاحتياطي
- `src/ui` — الواجهة والرقعة
- `public/engine` — Stockfish.js 19 lite single-threaded (GPL-3)
- `public/pieces` — مجموعتا قطع cburnett وmerida (GPLv2+)

## الملفات
`PROJECT_SPEC.md` · `ARCHITECTURE.md` · `TASKS.md` · `DATA_SOURCES.md` · `OFFLINE_TESTS.md`

## الترخيص
GPL-3.0-or-later — انظر `LICENSE` و`DATA_SOURCES.md`.
