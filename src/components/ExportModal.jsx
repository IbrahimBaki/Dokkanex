import { useState } from 'react'
import { FIELD_LABELS, downloadImage, shareAsImage, exportAsPDF, shareAsText } from '../lib/exportUtils'

const ALL_FIELDS = ['name', 'category', 'selling_price', 'wholesale_price', 'updated_at']

function Spinner() {
  return (
    <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
    </svg>
  )
}

export default function ExportModal({ products, categoryMap, onClose }) {
  const [fields, setFields] = useState(['name', 'selling_price', 'category'])
  const [busy, setBusy] = useState(null)
  const [copied, setCopied] = useState(false)

  function toggleField(f) {
    setFields(prev =>
      prev.includes(f) ? (prev.length > 1 ? prev.filter(x => x !== f) : prev) : [...prev, f]
    )
  }

  async function run(action, key) {
    setBusy(key)
    try {
      await action(products, fields, categoryMap)
      if (key === 'text') { setCopied(true); setTimeout(() => setCopied(false), 2000) }
    } catch (e) {
      if (e?.name !== 'AbortError') console.error(e)
    } finally {
      setBusy(null)
    }
  }

  const actions = [
    {
      key: 'text',
      label: copied ? 'تم النسخ!' : 'نص / واتساب',
      desc: 'نسخ أو مشاركة كنص',
      icon: (
        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
            d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
        </svg>
      ),
      color: 'bg-green-50 text-green-700 hover:bg-green-100 border-green-200',
      fn: shareAsText,
    },
    {
      key: 'image-share',
      label: 'صورة — مشاركة',
      desc: 'شارك كصورة PNG',
      icon: (
        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
            d="M8.684 13.342C8.886 12.938 9 12.482 9 12c0-.482-.114-.938-.316-1.342m0 2.684a3 3 0 110-2.684m0 2.684l6.632 3.316m-6.632-6l6.632-3.316m0 0a3 3 0 105.367-2.684 3 3 0 00-5.367 2.684zm0 9.316a3 3 0 105.368 2.684 3 3 0 00-5.368-2.684z" />
        </svg>
      ),
      color: 'bg-sky-50 text-sky-700 hover:bg-sky-100 border-sky-200',
      fn: shareAsImage,
    },
    {
      key: 'image-dl',
      label: 'صورة — تنزيل',
      desc: 'حفظ كملف PNG',
      icon: (
        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
            d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
        </svg>
      ),
      color: 'bg-violet-50 text-violet-700 hover:bg-violet-100 border-violet-200',
      fn: downloadImage,
    },
    {
      key: 'pdf',
      label: 'PDF',
      desc: 'تصدير كملف PDF',
      icon: (
        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
            d="M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z" />
        </svg>
      ),
      color: 'bg-red-50 text-red-700 hover:bg-red-100 border-red-200',
      fn: exportAsPDF,
    },
  ]

  return (
    <div
      className="fixed inset-0 z-50 bg-black/50 flex items-end sm:items-center justify-center p-0 sm:p-4"
      onClick={onClose}
    >
      <div
        className="bg-white w-full sm:max-w-sm sm:rounded-2xl rounded-t-2xl overflow-hidden shadow-2xl"
        onClick={e => e.stopPropagation()}
        dir="rtl"
      >
        {/* Handle */}
        <div className="flex justify-center pt-3 pb-1 sm:hidden">
          <div className="w-10 h-1 bg-slate-200 rounded-full" />
        </div>

        {/* Header */}
        <div className="px-4 pt-3 pb-2 flex items-center justify-between">
          <div>
            <h2 className="text-base font-bold text-slate-800">تصدير ومشاركة</h2>
            <p className="text-xs text-slate-500 mt-0.5">{products.length} منتج محدد</p>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-full bg-slate-100 flex items-center justify-center text-slate-500 hover:bg-slate-200 transition-colors"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="px-4 pb-5 space-y-4">
          {/* Field picker */}
          <div>
            <p className="text-xs font-semibold text-slate-500 mb-2">الحقول المُدرجة</p>
            <div className="flex flex-wrap gap-2">
              {ALL_FIELDS.map(f => (
                <button
                  key={f}
                  onClick={() => toggleField(f)}
                  className={`text-xs px-3 py-1.5 rounded-full border font-medium transition-colors ${
                    fields.includes(f)
                      ? 'bg-indigo-600 text-white border-indigo-600'
                      : 'bg-white text-slate-500 border-slate-200 hover:border-slate-300'
                  }`}
                >
                  {FIELD_LABELS[f]}
                </button>
              ))}
            </div>
          </div>

          {/* Actions */}
          <div>
            <p className="text-xs font-semibold text-slate-500 mb-2">طريقة التصدير</p>
            <div className="grid grid-cols-2 gap-2">
              {actions.map(a => (
                <button
                  key={a.key}
                  onClick={() => run(a.fn, a.key)}
                  disabled={!!busy}
                  className={`flex items-center gap-2 px-3 py-2.5 rounded-xl border text-sm font-medium transition-colors disabled:opacity-50 ${a.color}`}
                >
                  {busy === a.key ? <Spinner /> : a.icon}
                  <span className="truncate">{a.label}</span>
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
