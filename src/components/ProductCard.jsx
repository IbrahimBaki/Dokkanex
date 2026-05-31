import { useState } from 'react'
import { timeAgo } from '../lib/timeAgo'

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

function EditIcon() {
  return (
    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
        d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
    </svg>
  )
}

function DeleteIcon() {
  return (
    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
        d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
    </svg>
  )
}

export default function ProductCard({ product, categoryName, categoryId, onEdit, onDelete, view = 'grid', selectionMode = false, selected = false, onToggleSelect }) {
  const [imgError, setImgError] = useState(false)
  const imageSrc = product.image_base64 || product.image_url || null
  const [showDetail, setShowDetail] = useState(false)
  const gradient = PLACEHOLDER_BG[hashId(categoryId) % PLACEHOLDER_BG.length]

  // ── List row ────────────────────────────────────────────────────────────────
  if (view === 'list') {
    return (
      <>
        <div
          className={`card flex items-center gap-3 px-3 py-2.5 hover:shadow-md transition-shadow duration-200 ${selectionMode ? 'cursor-pointer' : ''} ${selected ? 'ring-2 ring-indigo-500 bg-indigo-50/40' : ''}`}
          onClick={selectionMode ? () => onToggleSelect(product.id) : undefined}
        >
          {/* Selection checkbox */}
          {selectionMode && (
            <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center shrink-0 transition-colors ${selected ? 'bg-indigo-600 border-indigo-600' : 'border-slate-300 bg-white'}`}>
              {selected && (
                <svg className="w-3 h-3 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                </svg>
              )}
            </div>
          )}

          {/* Thumbnail */}
          <div className="w-14 h-14 rounded-lg overflow-hidden shrink-0 bg-slate-100">
            {imageSrc && !imgError ? (
              <img
                src={imageSrc}
                alt={product.name}
                className="w-full h-full object-cover"
                onError={() => setImgError(true)}
              />
            ) : (
              <div className={`w-full h-full bg-gradient-to-br ${gradient} flex items-center justify-center`}>
                <svg className="w-6 h-6 text-white/70" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
                    d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                </svg>
              </div>
            )}
          </div>

          {/* Info — selling price only, prominent */}
          <div className="flex-1 min-w-0">
            {categoryName && (
              <span className={`text-xs font-semibold px-1.5 py-0.5 rounded-full inline-block mb-0.5 ${getCategoryColor(categoryId)}`}>
                {categoryName}
              </span>
            )}
            <h3 className="font-bold text-slate-800 text-sm truncate leading-tight">
              {product.name}
            </h3>
            <p className="text-base font-bold text-emerald-600 leading-tight mt-0.5">
              {product.selling_price}
              <span className="text-xs font-normal text-emerald-500 mr-1">سعر البيع</span>
            </p>
            <p className="text-[10px] text-slate-400 leading-none mt-0.5">
              آخر تعديل: {timeAgo(product.updated_at || product.created_at)}
            </p>
          </div>

          {/* Actions */}
          {!selectionMode && <div className="flex items-center gap-1 shrink-0">
            <button
              onClick={() => setShowDetail(true)}
              className="w-8 h-8 rounded-lg bg-slate-100 text-slate-600 flex items-center justify-center hover:bg-slate-200 transition-colors"
              title="تفاصيل"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                  d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                  d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
              </svg>
            </button>
            <button
              onClick={() => onEdit(product)}
              className="w-8 h-8 rounded-lg bg-indigo-50 text-indigo-700 flex items-center justify-center hover:bg-indigo-100 transition-colors"
              title="تعديل"
            >
              <EditIcon />
            </button>
            <button
              onClick={() => onDelete(product)}
              className="w-8 h-8 rounded-lg bg-red-50 text-red-700 flex items-center justify-center hover:bg-red-100 transition-colors"
              title="حذف"
            >
              <DeleteIcon />
            </button>
          </div>}
        </div>

        {/* Detail sheet */}
        {showDetail && (
          <div
            className="fixed inset-0 z-50 bg-black/50 flex items-end sm:items-center justify-center p-0 sm:p-4"
            onClick={() => setShowDetail(false)}
          >
            <div
              className="bg-white w-full sm:max-w-sm sm:rounded-2xl rounded-t-2xl overflow-hidden shadow-2xl"
              onClick={e => e.stopPropagation()}
            >
              {/* Image */}
              <div className="aspect-video bg-slate-100 relative">
                {imageSrc && !imgError ? (
                  <img
                    src={imageSrc}
                    alt={product.name}
                    className="w-full h-full object-cover"
                  />
                ) : (
                  <div className={`w-full h-full bg-gradient-to-br ${gradient} flex items-center justify-center`}>
                    <svg className="w-16 h-16 text-white/70" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1}
                        d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                    </svg>
                  </div>
                )}
                <button
                  onClick={() => setShowDetail(false)}
                  className="absolute top-3 left-3 w-8 h-8 bg-black/40 text-white rounded-full flex items-center justify-center hover:bg-black/60 transition-colors"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>

              {/* Content */}
              <div className="p-4 pb-safe" dir="rtl">
                {categoryName && (
                  <span className={`text-xs font-semibold px-2 py-0.5 rounded-full inline-block mb-2 ${getCategoryColor(categoryId)}`}>
                    {categoryName}
                  </span>
                )}
                <h2 className="text-lg font-bold text-slate-800 leading-snug mb-1">
                  {product.name}
                </h2>
                <p className="text-xs text-slate-400 mb-4">
                  آخر تعديل: {timeAgo(product.updated_at || product.created_at)}
                </p>

                <div className="grid grid-cols-2 gap-3 mb-4">
                  <div className="bg-slate-50 rounded-xl p-3 text-center">
                    <p className="text-xs text-slate-500 mb-1">سعر الجملة</p>
                    <p className="text-xl font-bold text-slate-700">{product.wholesale_price}</p>
                  </div>
                  <div className="bg-emerald-50 rounded-xl p-3 text-center">
                    <p className="text-xs text-emerald-600 mb-1">سعر البيع</p>
                    <p className="text-xl font-bold text-emerald-700">{product.selling_price}</p>
                  </div>
                </div>

                <div className="flex gap-2">
                  <button
                    onClick={() => { setShowDetail(false); onEdit(product) }}
                    className="flex-1 flex items-center justify-center gap-2 py-2.5 text-sm font-medium rounded-xl bg-indigo-600 text-white hover:bg-indigo-700 transition-colors"
                  >
                    <EditIcon />
                    تعديل
                  </button>
                  <button
                    onClick={() => { setShowDetail(false); onDelete(product) }}
                    className="flex-1 flex items-center justify-center gap-2 py-2.5 text-sm font-medium rounded-xl bg-red-50 text-red-700 hover:bg-red-100 transition-colors"
                  >
                    <DeleteIcon />
                    حذف
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}
      </>
    )
  }

  // ── Grid card (default) ─────────────────────────────────────────────────────
  return (
    <div
      className={`card overflow-hidden flex flex-col hover:shadow-md transition-shadow duration-200 ${selectionMode ? 'cursor-pointer' : ''} ${selected ? 'ring-2 ring-indigo-500' : ''}`}
      onClick={selectionMode ? () => onToggleSelect(product.id) : undefined}
    >
      {/* Image */}
      <div className="aspect-[4/3] bg-slate-100 overflow-hidden relative">
        {imageSrc && !imgError ? (
          <img
            src={imageSrc}
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
        {selectionMode && (
          <div className={`absolute top-2 right-2 w-6 h-6 rounded-full border-2 flex items-center justify-center transition-colors shadow-sm ${selected ? 'bg-indigo-600 border-indigo-600' : 'bg-white/80 border-slate-300'}`}>
            {selected && (
              <svg className="w-3.5 h-3.5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
              </svg>
            )}
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

        <div className="mt-auto text-xs">
          <div className="bg-emerald-50 rounded-lg p-2">
            <div className="text-emerald-600 mb-0.5">سعر البيع</div>
            <div className="font-bold text-emerald-700 text-sm">{product.selling_price}</div>
          </div>
        </div>

        <p className="text-[10px] text-slate-400 leading-none">
          آخر تعديل: {timeAgo(product.updated_at || product.created_at)}
        </p>

        {!selectionMode && (
          <div className="flex gap-2 pt-1">
            <button
              onClick={() => onEdit(product)}
              className="flex-1 flex items-center justify-center gap-1.5 py-1.5 text-xs font-medium rounded-lg bg-indigo-50 text-indigo-700 hover:bg-indigo-100 transition-colors"
            >
              <EditIcon />
              تعديل
            </button>
            <button
              onClick={() => onDelete(product)}
              className="flex-1 flex items-center justify-center gap-1.5 py-1.5 text-xs font-medium rounded-lg bg-red-50 text-red-700 hover:bg-red-100 transition-colors"
            >
              <DeleteIcon />
              حذف
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
