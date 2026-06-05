# بناء الـ EXE على ويندوز

## المتطلبات
- [Node.js](https://nodejs.org) — نزّل أحدث إصدار LTS
- [Git](https://git-scm.com) — نزّله وثبّته بالإعدادات الافتراضية

## الخطوات

### 1. Clone المشروع
```bash
git clone https://github.com/IbrahimBaki/Dokkanex.git
cd Dokkanex
```

### 2. ضيف ملف `.env`
اعمل ملف `.env` في جذر المشروع وحط فيه:
```
VITE_SUPABASE_URL=https://fntojupobuvrpryiodgh.supabase.co
VITE_SUPABASE_ANON_KEY=sb_publishable_kNmRmc-sAZNnYfX-dHzKfA_boLBaQ42
```

### 3. ثبّت الـ packages
```bash
npm install
```

### 4. ابني الـ EXE
```bash
npm run electron:build:win
```

> هيعمل `npm run build` أولاً عشان يجمّع تطبيق React، وبعدين يعمل الـ installer.

### 5. الملف الناتج
```
dist-electron/
  دكانكس Setup 1.0.0.exe    ← ملف الـ installer
```

---

## ملاحظات

| موضوع | تفصيل |
|-------|--------|
| حجم الملف | حوالي 80–120MB — طبيعي لأن Electron جوّاه |
| بعد التثبيت | هيظهر shortcut على الـ Desktop وفي قائمة Start |
| أي تحديث | شغّل `npm run electron:build:win` تاني وبس |
| الـ app بتشتغل offline؟ | الواجهة بتشتغل، بس Supabase محتاج إنترنت للبيانات |

---

## اختبار بدون بناء EXE (للتطوير)

افتح ترمينالين:

**ترمينال 1** — شغّل سيرفر التطوير:
```bash
npm run dev
```

**ترمينال 2** — شغّل Electron:
```bash
npm run electron:start
```

أو في ترمينال واحد:
```bash
npm run electron:dev
```

---

## هيكل المشروع المتعلق بـ Electron

```
electron/
  main.cjs      — نافذة التطبيق، التحكم في التحميل
  preload.cjs   — عزل الـ renderer (sandbox)
public/
  icons/
    icon-512.png  — أيقونة التطبيق (512×512)
dist/           — الـ React app المجمّع (ينتج من npm run build)
dist-electron/  — ملفات الـ installer الناتجة
```
