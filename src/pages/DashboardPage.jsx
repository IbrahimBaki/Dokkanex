import { useState, useEffect } from 'react'
import { useAuth } from '../context/AuthContext'
import { useSync } from '../context/SyncContext'
import { getProducts, getCategories } from '../lib/offlineOps'

function Spinner() {
  return (
    <div className="flex items-center justify-center py-16">
      <svg className="w-8 h-8 animate-spin text-indigo-500" fill="none" viewBox="0 0 24 24">
        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
      </svg>
    </div>
  )
}

function StatCard({ icon, label, value, valueClass = 'text-slate-800' }) {
  return (
    <div className="bg-white rounded-xl border border-slate-200 p-4 flex flex-col gap-1">
      <span className="text-2xl">{icon}</span>
      <span className={`text-lg font-bold leading-tight ${valueClass}`}>{value}</span>
      <span className="text-xs text-slate-500">{label}</span>
    </div>
  )
}

function BucketRow({ emoji, label, count, total, colorClass }) {
  const pct = total > 0 ? (count / total) * 100 : 0
  return (
    <div>
      <div className="flex justify-between text-xs text-slate-600 mb-1">
        <span>{emoji} {label}</span>
        <span className="text-slate-400 shrink-0 mr-2">{count} من {total}</span>
      </div>
      <div className="h-3 bg-slate-100 rounded-full overflow-hidden">
        <div className={`h-full rounded-full transition-all ${colorClass}`} style={{ width: `${pct}%` }} />
      </div>
    </div>
  )
}

export default function DashboardPage() {
  const { user } = useAuth()
  const { syncVersion } = useSync()
  const [products, setProducts] = useState([])
  const [categories, setCategories] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!user) return
    async function fetchData() {
      setLoading(true)
      const [prods, cats] = await Promise.all([
        getProducts(user.id),
        getCategories(user.id)
      ])
      setProducts(prods || [])
      setCategories(cats || [])
      setLoading(false)
    }
    fetchData()
  }, [user, syncVersion])

  if (loading) return <Spinner />

  const totalProducts = products.length

  if (totalProducts === 0) {
    return (
      <div className="max-w-2xl mx-auto px-4 py-20 text-center text-slate-400">
        <p className="text-lg font-medium">لا توجد بيانات لعرضها</p>
        <p className="text-sm mt-1">أضف منتجات أولاً لرؤية التحليلات</p>
      </div>
    )
  }

  const totalCategories = categories.length
  const totalValue = products.reduce((s, p) => s + (p.selling_price || 0), 0)

  const pricedProducts = products.filter(p => p.selling_price > 0 && p.wholesale_price > 0)
  const margins = pricedProducts.map(
    p => ((p.selling_price - p.wholesale_price) / p.selling_price) * 100
  )
  const avgMargin = margins.length
    ? margins.reduce((a, b) => a + b, 0) / margins.length
    : null

  const byCategory = categories
    .map(c => ({ name: c.name, count: products.filter(p => p.category_id === c.id).length }))
    .filter(c => c.count > 0)
    .sort((a, b) => b.count - a.count)
    .slice(0, 8)

  const uncatCount = products.filter(p => !p.category_id).length
  if (uncatCount > 0 && byCategory.length < 8) {
    byCategory.push({ name: 'بدون فئة', count: uncatCount })
  }
  const maxCount = Math.max(...byCategory.map(c => c.count), 1)

  const buckets = { high: 0, mid: 0, low: 0 }
  margins.forEach(m => {
    if (m >= 30) buckets.high++
    else if (m >= 15) buckets.mid++
    else buckets.low++
  })

  const topProducts = pricedProducts
    .map(p => ({ ...p, margin: ((p.selling_price - p.wholesale_price) / p.selling_price) * 100 }))
    .sort((a, b) => b.margin - a.margin)
    .slice(0, 10)

  const fmt = n => n.toLocaleString('ar-EG', { maximumFractionDigits: 0 })

  function marginBarColor(m) {
    if (m >= 30) return 'bg-emerald-500'
    if (m >= 15) return 'bg-amber-400'
    return 'bg-red-400'
  }

  function marginTextColor(m) {
    if (m >= 30) return 'text-emerald-600'
    if (m >= 15) return 'text-amber-600'
    return 'text-red-500'
  }

  return (
    <div className="max-w-2xl mx-auto px-4 py-6 space-y-5" dir="rtl">
      <h1 className="text-xl font-bold text-slate-800">لوحة التحليلات</h1>

      {/* Summary cards */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatCard icon="📦" label="إجمالي المنتجات" value={fmt(totalProducts)} />
        <StatCard icon="📁" label="التصنيفات" value={fmt(totalCategories)} />
        <StatCard
          icon="📈"
          label="متوسط هامش الربح"
          value={avgMargin !== null ? `${avgMargin.toFixed(1)}%` : '—'}
          valueClass={avgMargin === null ? 'text-slate-400' : avgMargin >= 20 ? 'text-emerald-600' : 'text-amber-600'}
        />
        <StatCard icon="💰" label="إجمالي قيمة الكتالوج" value={fmt(totalValue)} />
      </div>

      {/* Category chart + Margin buckets */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="bg-white rounded-xl border border-slate-200 p-4">
          <h2 className="text-sm font-semibold text-slate-700 mb-4">أعلى التصنيفات</h2>
          {byCategory.length === 0 ? (
            <p className="text-sm text-slate-400">لا توجد تصنيفات بها منتجات</p>
          ) : (
            <div className="space-y-3">
              {byCategory.map(cat => (
                <div key={cat.name}>
                  <div className="flex justify-between text-xs text-slate-600 mb-1">
                    <span className="truncate ml-2">{cat.name}</span>
                    <span className="text-slate-400 shrink-0">{cat.count}</span>
                  </div>
                  <div className="h-3 bg-slate-100 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-indigo-500 rounded-full transition-all"
                      style={{ width: `${(cat.count / maxCount) * 100}%` }}
                    />
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="bg-white rounded-xl border border-slate-200 p-4">
          <h2 className="text-sm font-semibold text-slate-700 mb-4">توزيع هامش الربح</h2>
          {pricedProducts.length === 0 ? (
            <p className="text-sm text-slate-400">أضف سعر الشراء والبيع للمنتجات لعرض هذه البيانات</p>
          ) : (
            <div className="space-y-3">
              <BucketRow emoji="🟢" label="عالي (أكثر من 30%)" count={buckets.high} total={margins.length} colorClass="bg-emerald-500" />
              <BucketRow emoji="🟡" label="متوسط (15–30%)" count={buckets.mid} total={margins.length} colorClass="bg-amber-400" />
              <BucketRow emoji="🔴" label="منخفض (أقل من 15%)" count={buckets.low} total={margins.length} colorClass="bg-red-400" />
            </div>
          )}
        </div>
      </div>

      {/* Top 10 by margin */}
      {topProducts.length > 0 && (
        <div className="bg-white rounded-xl border border-slate-200 p-4">
          <h2 className="text-sm font-semibold text-slate-700 mb-4">أعلى 10 منتجات ربحية</h2>
          <div className="space-y-3">
            {topProducts.map((p, i) => (
              <div key={p.id} className="flex items-center gap-3">
                <span className="text-xs text-slate-400 w-5 shrink-0 text-center">{i + 1}</span>
                <div className="flex-1 min-w-0">
                  <div className="flex justify-between items-center mb-1">
                    <span className="text-sm text-slate-700 truncate ml-2">{p.name}</span>
                    <span className={`text-xs font-bold shrink-0 ${marginTextColor(p.margin)}`}>
                      {p.margin.toFixed(1)}%
                    </span>
                  </div>
                  <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
                    <div
                      className={`h-full rounded-full transition-all ${marginBarColor(p.margin)}`}
                      style={{ width: `${Math.min(p.margin, 100)}%` }}
                    />
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
