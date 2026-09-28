import { useEffect, useState } from 'react'
import { useAuth } from '../context/AuthContext'
import { DEFAULT_SHOP_PROFILE, getShopProfile, saveShopProfile } from '../lib/shopProfile'

const FIELDS = [
  ['shop_name', 'اسم المحل', 'مثال: بقالة السلام'],
  ['phone', 'رقم الهاتف', '01234567890'],
  ['address', 'العنوان', 'العنوان الذي يظهر في الفاتورة'],
  ['tax_number', 'الرقم الضريبي', 'اختياري'],
  ['logo_url', 'رابط اللوجو', 'اختياري — عند تركه فارغًا يظهر شعار DokkanX'],
  ['return_policy', 'سياسة الاسترجاع', 'مثال: الاسترجاع خلال 14 يومًا مع الفاتورة'],
  ['invoice_footer', 'نص أسفل الفاتورة', 'شكرًا لتسوقكم معنا'],
]

export default function ShopSettingsPage() {
  const { user } = useAuth()
  const [profile, setProfile] = useState(DEFAULT_SHOP_PROFILE)
  const [saving, setSaving] = useState(false)
  const [notice, setNotice] = useState(null)
  useEffect(() => { if (user?.id) getShopProfile(user.id).then(setProfile) }, [user?.id])
  function chooseLogo(event) {
    const file = event.target.files?.[0]
    if (!file) return
    if (!file.type.startsWith('image/') || file.size > 700 * 1024) { setNotice('اختر صورة لا تتجاوز 700 كيلوبايت.'); event.target.value = ''; return }
    const reader = new FileReader()
    reader.onload = () => setProfile((current) => ({ ...current, logo_url: String(reader.result) }))
    reader.readAsDataURL(file)
  }
  async function save(event) {
    event.preventDefault(); setSaving(true); setNotice(null)
    try { await saveShopProfile({ userId: user.id, profile }); setNotice('تم حفظ إعدادات المحل. ستُستخدم في الفواتير الجديدة وتُزامن عند الاتصال.') }
    catch (error) { setNotice(error.message || 'تعذر حفظ الإعدادات.') }
    finally { setSaving(false) }
  }
  const field = ([key, label, placeholder]) => <label key={key} className="block text-sm font-medium text-slate-700">{label}<input className="input-field mt-1" value={profile[key] || ''} placeholder={placeholder} onChange={(e) => setProfile((current) => ({ ...current, [key]: e.target.value }))} /></label>
  return <main className="page-container max-w-3xl"><div className="mb-6"><h1 className="page-title">إعدادات المحل والفاتورة</h1><p className="page-subtitle">هذه التفاصيل تُحفظ مع كل فاتورة جديدة كلقطة ثابتة.</p></div>
    <form className="space-y-5" onSubmit={save}><section className="card p-4 sm:p-5"><div className="mb-4 border-b pb-3"><h2 className="font-bold text-slate-900">بيانات المحل</h2><p className="mt-1 text-xs text-slate-500">تظهر أعلى الفاتورة وفي بيانات التواصل.</p></div><div className="grid gap-4 sm:grid-cols-2">{FIELDS.slice(0, 4).map(field)}</div></section>
      <section className="card p-4 sm:p-5"><div className="mb-4 border-b pb-3"><h2 className="font-bold text-slate-900">الشعار</h2><p className="mt-1 text-xs text-slate-500">يظهر شعار DokkanX تلقائيًا إذا لم تضف شعارًا.</p></div><div className="space-y-4">{field(FIELDS[4])}<label className="block text-sm font-medium text-slate-700">رفع لوجو من الجهاز<input className="mt-2 block w-full rounded-lg border border-dashed border-slate-300 bg-slate-50 p-3 text-sm text-slate-600" type="file" accept="image/png,image/jpeg,image/webp" onChange={chooseLogo} /></label>{profile.logo_url && <div className="flex items-center justify-between gap-3 rounded-xl bg-slate-50 p-3"><img className="h-14 max-w-36 object-contain" src={profile.logo_url} alt="معاينة اللوجو" /><button type="button" className="rounded-lg px-3 py-2 text-sm font-medium text-red-600 hover:bg-red-50" onClick={() => setProfile((current) => ({ ...current, logo_url: '' }))}>إزالة اللوجو</button></div>}</div></section>
      <section className="card p-4 sm:p-5"><div className="mb-4 border-b pb-3"><h2 className="font-bold text-slate-900">نصوص الفاتورة</h2><p className="mt-1 text-xs text-slate-500">سياسة الاسترجاع والرسالة الختامية.</p></div><div className="space-y-4">{FIELDS.slice(5).map(field)}</div></section>
      <div className="rounded-xl bg-indigo-50 px-4 py-3 text-sm text-indigo-800">يمكنك تعديل هذه التفاصيل لاحقًا؛ الفواتير التي تم حفظها لا تتغير.</div>{notice && <p className="rounded-xl bg-emerald-50 px-4 py-3 text-sm font-medium text-emerald-700">{notice}</p>}<div className="sticky bottom-3 z-20 rounded-2xl border border-slate-200 bg-white/95 p-3 shadow-lg backdrop-blur"><button className="btn-primary w-full py-3" disabled={saving}>{saving ? 'جارٍ الحفظ…' : 'حفظ الإعدادات'}</button></div>
    </form></main>
}
