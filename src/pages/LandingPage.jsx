import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import logoMark from '/files/logo-mark.svg'

function useInView(threshold = 0.15) {
  const ref = useRef(null)
  const [visible, setVisible] = useState(false)
  useEffect(() => {
    if (!ref.current) return
    const observer = new IntersectionObserver(
      ([entry]) => { if (entry.isIntersecting) { setVisible(true); observer.disconnect() } },
      { threshold }
    )
    observer.observe(ref.current)
    return () => observer.disconnect()
  }, [threshold])
  return [ref, visible]
}

const features = [
  {
    icon: (
      <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
          d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 10V11" />
      </svg>
    ),
    color: 'bg-indigo-100 text-indigo-600',
    title: 'إدارة المنتجات',
    desc: 'ضيّف، عدّل، واحذف منتجاتك بسهولة تامة. سعر الجملة والبيع وتصنيف كل منتج في إيدك.',
  },
  {
    icon: (
      <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
          d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
      </svg>
    ),
    color: 'bg-emerald-100 text-emerald-600',
    title: 'صور المنتجات',
    desc: 'ارفع صورة لكل منتج من موبايلك أو لاب توبك. الصور بتتحفظ بأمان وبتتعرض بشكل احترافي.',
  },
  {
    icon: (
      <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
          d="M21 21l-4.35-4.35M17 11A6 6 0 115 11a6 6 0 0112 0z" />
      </svg>
    ),
    color: 'bg-violet-100 text-violet-600',
    title: 'بحث وفلترة',
    desc: 'دوّر على أي منتج باسمه وفلتر حسب التصنيف. هتلاقيه في ثواني.',
  },
  {
    icon: (
      <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
          d="M12 18h.01M8 21h8a2 2 0 002-2V5a2 2 0 00-2-2H8a2 2 0 00-2 2v14a2 2 0 002 2z" />
      </svg>
    ),
    color: 'bg-amber-100 text-amber-600',
    title: 'بيشتغل على كل الأجهزة',
    desc: 'تطبيق ويب بيشتغل على الموبايل والكمبيوتر. ثبّته على شاشتك الرئيسية زي أي آبلكيشن تاني.',
  },
]

const steps = [
  {
    n: '١',
    title: 'سجّل حسابك',
    desc: 'افتح حساب مجاني بإيميلك وكلمة السر. بياناتك خصوصية ومأمونة.',
  },
  {
    n: '٢',
    title: 'ضيّف منتجاتك',
    desc: 'حط اسم المنتج والأسعار والصورة والتصنيف. كل ده في ثواني.',
  },
  {
    n: '٣',
    title: 'أدّر مخزنك',
    desc: 'اتفرّج، دوّر، عدّل، وسعّر من أي مكان وفي أي وقت.',
  },
]

function HeroSection() {
  return (
    <section className="relative min-h-screen flex items-center justify-center overflow-hidden bg-gradient-to-br from-slate-900 via-indigo-950 to-slate-900">
      {/* Animated blobs */}
      <div
        className="absolute top-1/4 right-1/4 w-72 h-72 bg-indigo-600 opacity-20 rounded-full blur-3xl"
        style={{ animation: 'blob 10s ease-in-out infinite' }}
      />
      <div
        className="absolute bottom-1/3 left-1/4 w-64 h-64 bg-violet-600 opacity-15 rounded-full blur-3xl"
        style={{ animation: 'blob 14s ease-in-out infinite 3s' }}
      />
      <div
        className="absolute top-2/3 right-1/3 w-56 h-56 bg-indigo-400 opacity-10 rounded-full blur-3xl"
        style={{ animation: 'blob 12s ease-in-out infinite 6s' }}
      />

      <div className="relative z-10 text-center px-6 max-w-2xl mx-auto">
        {/* Logo */}
        <div className="flex justify-center mb-8">
          <div className="w-20 h-20 rounded-2xl bg-white/10 backdrop-blur-sm border border-white/20 flex items-center justify-center shadow-2xl">
            <img src={logoMark} alt="دكانيكس" className="w-14 h-14 object-contain" />
          </div>
        </div>

        {/* Headline */}
        <h1 className="text-4xl sm:text-5xl font-extrabold text-white leading-tight mb-4">
          أدّر مخزنك
          <span className="block bg-gradient-to-l from-indigo-400 to-violet-400 bg-clip-text text-transparent">
            بطريقة ذكية
          </span>
        </h1>

        <p className="text-slate-300 text-lg sm:text-xl leading-relaxed mb-10">
          DokkanX تطبيق بسيط وسريع لإدارة منتجاتك وأسعارها وتصنيفاتها.
          <br className="hidden sm:block" />
          كل اللي محتاجه في مكان واحد، من أي جهاز.
        </p>

        {/* CTAs */}
        <div className="flex flex-col sm:flex-row gap-4 justify-center">
          <Link
            to="/register"
            className="inline-flex items-center justify-center gap-2 bg-indigo-500 hover:bg-indigo-400 text-white font-semibold px-8 py-3.5 rounded-xl transition-all active:scale-95 shadow-lg shadow-indigo-500/30"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                d="M18 9v3m0 0v3m0-3h3m-3 0h-3m-2-5a4 4 0 11-8 0 4 4 0 018 0zM3 20a6 6 0 0112 0v1H3v-1z" />
            </svg>
            ابدأ مجاناً
          </Link>
          <Link
            to="/login"
            className="inline-flex items-center justify-center gap-2 bg-white/10 hover:bg-white/20 text-white font-semibold px-8 py-3.5 rounded-xl border border-white/20 transition-all active:scale-95 backdrop-blur-sm"
          >
            سجّل دخولك
          </Link>
          <button
            onClick={() => document.getElementById('download')?.scrollIntoView({ behavior: 'smooth' })}
            className="inline-flex items-center justify-center gap-2 bg-white/5 hover:bg-white/10 text-slate-300 hover:text-white font-medium px-8 py-3.5 rounded-xl border border-white/10 transition-all active:scale-95 backdrop-blur-sm text-sm"
          >
            <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor">
              <path d="M0 3.449L9.75 2.1v9.451H0m10.949-9.602L24 0v11.4H10.949M0 12.6h9.75v9.451L0 20.699M10.949 12.6H24V24l-12.9-1.801" />
            </svg>
            نزّل للويندوز
          </button>
        </div>

        {/* Scroll hint */}
        <div className="mt-16 flex flex-col items-center gap-2 text-slate-500 text-xs animate-bounce">
          <span>نزّل لأسفل</span>
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
          </svg>
        </div>
      </div>
    </section>
  )
}

function FeaturesSection() {
  const [ref, visible] = useInView()
  return (
    <section id="features" className="py-20 bg-white px-6">
      <div
        ref={ref}
        className={`max-w-4xl mx-auto transition-all duration-700 ${visible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-8'}`}
      >
        <div className="text-center mb-12">
          <span className="inline-block text-xs font-semibold tracking-widest text-indigo-500 uppercase mb-3">المميزات</span>
          <h2 className="text-3xl font-bold text-slate-900">كل اللي محتاجه دكانك</h2>
          <p className="text-slate-500 mt-3 text-base">أدوات بسيطة وشغّالة بتوفّر عليك وقت وجهد</p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
          {features.map((f, i) => (
            <div
              key={i}
              className="rounded-2xl border border-slate-100 bg-slate-50 p-6 hover:shadow-md hover:border-slate-200 transition-all duration-300"
              style={{ transitionDelay: `${i * 80}ms` }}
            >
              <div className={`w-12 h-12 rounded-xl ${f.color} flex items-center justify-center mb-4`}>
                {f.icon}
              </div>
              <h3 className="font-bold text-slate-800 mb-2">{f.title}</h3>
              <p className="text-slate-500 text-sm leading-relaxed">{f.desc}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}

function HowItWorksSection() {
  const [ref, visible] = useInView()
  return (
    <section id="how" className="py-20 bg-slate-50 px-6">
      <div
        ref={ref}
        className={`max-w-4xl mx-auto transition-all duration-700 ${visible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-8'}`}
      >
        <div className="text-center mb-12">
          <span className="inline-block text-xs font-semibold tracking-widest text-indigo-500 uppercase mb-3">بيشتغل إزاي</span>
          <h2 className="text-3xl font-bold text-slate-900">تلات خطوات وبس</h2>
          <p className="text-slate-500 mt-3 text-base">مش محتاج ساعات. في دقايق تبقى جاهز</p>
        </div>

        <div className="relative">
          {/* Connecting line (desktop) */}
          <div className="hidden sm:block absolute top-10 right-[calc(16.67%+1.5rem)] left-[calc(16.67%+1.5rem)] h-0.5 bg-gradient-to-l from-indigo-200 to-indigo-200 via-indigo-400" />

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-8">
            {steps.map((s, i) => (
              <div
                key={i}
                className="flex flex-col items-center text-center"
                style={{ transitionDelay: `${i * 120}ms` }}
              >
                <div className="w-20 h-20 rounded-full bg-white border-2 border-indigo-200 flex items-center justify-center text-3xl font-bold text-indigo-500 shadow-sm mb-5 relative z-10">
                  {s.n}
                </div>
                <h3 className="font-bold text-slate-800 mb-2">{s.title}</h3>
                <p className="text-slate-500 text-sm leading-relaxed">{s.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  )
}

// ── Download Section ─────────────────────────────────────────────────────────
const GITHUB_RELEASE_URL =
  'https://github.com/IbrahimBaki/Dokkanex/releases/latest/download/DokkanX-Setup-1.1.0.exe'

const installSteps = [
  {
    n: '١',
    title: 'حمّل ملف الإعداد',
    desc: 'اضغط زر التحميل وحمّل ملف "DokkanX-Setup.exe" (حوالي 80 ميجا).',
  },
  {
    n: '٢',
    title: 'شغّل الإعداد',
    desc: 'افتح الملف اللي حمّلته واضغط "Install". مش محتاج صلاحيات مدير.',
  },
  {
    n: '٣',
    title: 'سجّل دخولك',
    desc: 'افتح التطبيق وسجّل بنفس حسابك الموجود على الويب — بياناتك هتتزامن تلقائياً.',
  },
  {
    n: '٤',
    title: 'اشتغل Offline',
    desc: 'دلوقتي تقدر تضيف وتعدّل المنتجات من غير نت. أوّل ما الإنترنت يرجع هتتزامن تلقائياً.',
  },
]

function DownloadSection() {
  const [ref, visible] = useInView()
  return (
    <section id="download" className="py-20 bg-white px-6">
      <div
        ref={ref}
        className={`max-w-4xl mx-auto transition-all duration-700 ${visible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-8'}`}
      >
        {/* Header */}
        <div className="text-center mb-14">
          <span className="inline-block text-xs font-semibold tracking-widest text-indigo-500 uppercase mb-3">
            تطبيق الويندوز
          </span>
          <h2 className="text-3xl font-bold text-slate-900">اشتغل بدون إنترنت</h2>
          <p className="text-slate-500 mt-3 text-base leading-relaxed">
            حمّل نسخة الويندوز وأدّر منتجاتك حتى لو الشبكة وقفت.
            <br className="hidden sm:block" />
            البيانات بتتزامن تلقائياً لمّا الإنترنت يرجع.
          </p>
        </div>

        {/* Download card */}
        <div className="rounded-2xl border border-indigo-100 bg-gradient-to-br from-indigo-50 to-slate-50 p-8 mb-14 flex flex-col sm:flex-row items-center gap-6 shadow-sm">
          {/* Windows icon */}
          <div className="shrink-0 w-20 h-20 rounded-2xl bg-[#0078D4] flex items-center justify-center shadow-lg shadow-blue-200">
            <svg className="w-11 h-11 text-white" viewBox="0 0 24 24" fill="currentColor">
              <path d="M0 3.449L9.75 2.1v9.451H0m10.949-9.602L24 0v11.4H10.949M0 12.6h9.75v9.451L0 20.699M10.949 12.6H24V24l-12.9-1.801" />
            </svg>
          </div>

          <div className="flex-1 text-center sm:text-right">
            <p className="font-bold text-slate-900 text-lg">DokkanX for Windows</p>
            <p className="text-slate-500 text-sm mt-1">
              الإصدار 1.1.0 &nbsp;·&nbsp; يدعم Windows 10 / 11 &nbsp;·&nbsp; 64-bit
            </p>
          </div>

          <a
            href={GITHUB_RELEASE_URL}
            className="shrink-0 inline-flex items-center gap-2.5 bg-indigo-600 hover:bg-indigo-500 text-white font-semibold px-7 py-3.5 rounded-xl transition-all active:scale-95 shadow-md shadow-indigo-200"
            download
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
            </svg>
            تحميل مجاني
          </a>
        </div>

        {/* Install steps */}
        <div className="text-center mb-10">
          <h3 className="text-xl font-bold text-slate-800">خطوات التثبيت</h3>
          <p className="text-slate-500 text-sm mt-1">أربع خطوات وتبقى جاهز</p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
          {installSteps.map((s, i) => (
            <div
              key={i}
              className="flex gap-4 rounded-2xl border border-slate-100 bg-slate-50 p-5 hover:shadow-md hover:border-indigo-100 transition-all duration-300"
              style={{ transitionDelay: `${i * 80}ms` }}
            >
              <div className="shrink-0 w-10 h-10 rounded-full bg-indigo-100 text-indigo-600 font-bold text-base flex items-center justify-center">
                {s.n}
              </div>
              <div>
                <p className="font-bold text-slate-800 text-sm mb-1">{s.title}</p>
                <p className="text-slate-500 text-sm leading-relaxed">{s.desc}</p>
              </div>
            </div>
          ))}
        </div>

        {/* Note */}
        <div className="mt-8 rounded-xl bg-amber-50 border border-amber-100 px-5 py-4 flex items-start gap-3">
          <svg className="w-5 h-5 text-amber-500 mt-0.5 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
              d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          <p className="text-amber-800 text-sm leading-relaxed">
            لو ظهرت رسالة "Windows protected your PC" — اضغط <strong>More info</strong> ثم <strong>Run anyway</strong>.
            هذا تحذير عادي لأي تطبيق جديد مش مسجّل في Microsoft.
          </p>
        </div>
      </div>
    </section>
  )
}
// ─────────────────────────────────────────────────────────────────────────────

function CTASection() {
  const [ref, visible] = useInView()
  return (
    <section className="py-20 bg-gradient-to-br from-indigo-600 to-violet-700 px-6">
      <div
        ref={ref}
        className={`max-w-xl mx-auto text-center transition-all duration-700 ${visible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-8'}`}
      >
        <h2 className="text-3xl font-bold text-white mb-4">عايز تبدأ؟</h2>
        <p className="text-indigo-100 text-lg mb-8">انضم وابدأ إدارة منتجاتك دلوقتي. مجاناً 100%.</p>
        <Link
          to="/register"
          className="inline-flex items-center gap-2 bg-white text-indigo-700 font-bold px-10 py-4 rounded-xl hover:bg-indigo-50 transition-all active:scale-95 shadow-lg text-lg"
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
              d="M18 9v3m0 0v3m0-3h3m-3 0h-3m-2-5a4 4 0 11-8 0 4 4 0 018 0zM3 20a6 6 0 0112 0v1H3v-1z" />
          </svg>
          افتح حسابك دلوقتي
        </Link>
      </div>
    </section>
  )
}

function Footer() {
  return (
    <footer className="bg-slate-900 py-10 px-6">
      <div className="max-w-7xl mx-auto">
        <div className="flex flex-col sm:flex-row items-center justify-between gap-6">
          {/* Brand */}
          <div className="flex items-center gap-3">
            <img src={logoMark} alt="دكانيكس" className="w-8 h-8 object-contain" />
            <span className="font-bold text-white text-lg">دكان <span className="text-amber-400">إكس</span></span>
          </div>

          {/* Links */}
          <div className="flex items-center gap-6 text-sm text-slate-400">
            <button onClick={() => document.getElementById('features')?.scrollIntoView({ behavior: 'smooth' })} className="hover:text-white transition-colors">المميزات</button>
            <button onClick={() => document.getElementById('how')?.scrollIntoView({ behavior: 'smooth' })} className="hover:text-white transition-colors">بيشتغل إزاي</button>
            <button onClick={() => document.getElementById('download')?.scrollIntoView({ behavior: 'smooth' })} className="hover:text-indigo-400 transition-colors font-medium">تحميل الويندوز</button>
            <Link to="/login" className="hover:text-white transition-colors">سجّل دخولك</Link>
            <Link to="/register" className="hover:text-white transition-colors">افتح حساب</Link>
          </div>
        </div>

        <div className="mt-8 pt-6 border-t border-slate-800 text-center text-xs text-slate-600">
          © {new Date().getFullYear()} Baghdadi Tech — جميع الحقوق محفوظة
        </div>
      </div>
    </footer>
  )
}

export default function LandingPage() {
  return (
    <div dir="rtl" className="font-sans">
      <HeroSection />
      <FeaturesSection />
      <HowItWorksSection />
      <DownloadSection />
      <CTASection />
      <Footer />
    </div>
  )
}
