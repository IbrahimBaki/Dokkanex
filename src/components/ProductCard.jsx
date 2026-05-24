import { useState } from 'react'

const PLACEHOLDER_BG = [
  'from-indigo-400 to-violet-500',
  'from-pink-400 to-rose-500',
  'from-emerald-400 to-teal-500',
  'from-amber-400 to-orange-500',
  'from-sky-400 to-blue-500',
]

function hashId(id) {
  if (!id) return 0
  let h = 0
  for (const ch of String(id)) h = (h * 31 + ch.charCodeAt(0)) >>> 0
  return h
}

function getCategoryColor(id) {
  const colors = [
    'bg-indigo-100 text-indigo-700',
    'bg-pink-100 text-pink-700',
    'bg-emerald-100 text-emerald-700',
    'bg-amber-100 text-amber-700',
    'bg-sky-100 text-sky-700',
    'bg-violet-100 text-violet-700',
  ]
  return colors[hashId(id) % colors.length]
}

export default function ProductCard({ product, categoryName, categoryId, onEdit, onDelete }) {
  const [imgError, setImgError] = useState(false)
  const gradient = PLACEHOLDER_BG[hashId(categoryId) % PLACEHOLDER_BG.length]

  return (
    <div className="card overflow-hidden flex flex-col hover:shadow-md transition-shadow duration-200">
      {/* Image */}
      <div className="aspect-[4/3] bg-slate-100 overflow-hidden relative">
        {product.image_url && !imgError ? (
          <img
            src={product.image_url}
            alt={product.name}
            className="w-full h-full object-cover"
            onError={() => setImgError(true)}
          />
        ) : (
          <div className={`w-full h-full bg-gradient-to-br ${gradient} flex items-center justify-center`}>
            <svg className="w-12 h-12 text-white/70" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
                d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
            </svg>
          </div>
        )}
      </div>

      {/* Info */}
      <div className="p-3 flex flex-col gap-2 flex-1">
        {categoryName && (
          <span className={`text-xs font-semibold px-2 py-0.5 rounded-full w-fit ${getCategoryColor(categoryId)}`}>
            {categoryName}
          </span>
        )}

        <h3 className="font-bold text-slate-800 text-sm leading-tight line-clamp-2">
          {product.name}
        </h3>

        <div className="grid grid-cols-2 gap-1 text-xs mt-auto">
          <div className="bg-slate-50 rounded-lg p-2">
            <div className="text-slate-500 mb-0.5">الجملة</div>
            <div className="font-bold text-slate-700">{product.wholesale_price}</div>
          </div>
          <div className="bg-emerald-50 rounded-lg p-2">
            <div className="text-emerald-600 mb-0.5">البيع</div>
            <div className="font-bold text-emerald-700">{product.selling_price}</div>
          </div>
        </div>

        <div className="flex gap-2 pt-1">
          <button
            onClick={() => onEdit(product)}
            className="flex-1 flex items-center justify-center gap-1.5 py-1.5 text-xs font-medium rounded-lg bg-indigo-50 text-indigo-700 hover:bg-indigo-100 transition-colors"
          >
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
            </svg>
            تعديل
          </button>
          <button
            onClick={() => onDelete(product)}
            className="flex-1 flex items-center justify-center gap-1.5 py-1.5 text-xs font-medium rounded-lg bg-red-50 text-red-700 hover:bg-red-100 transition-colors"
          >
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
            </svg>
            حذف
          </button>
        </div>
      </div>
    </div>
  )
}
