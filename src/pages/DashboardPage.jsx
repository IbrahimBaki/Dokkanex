import { useState, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
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
    <div className="card p-4 sm:p-5 flex flex-col gap-3 transition-shadow hover:shadow-md">
      <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-indigo-50 text-xl" aria-hidden="true">{icon}</span>
      <div>
        <span className={`block text-xl font-bold leading-tight sm:text-2xl ${valueClass}`}>{value}</span>
        <span className="mt-1 block text-xs font-medium text-slate-500">{label}</span>
      </div>
    </div>
  )
}

function BucketRow({ emoji, label, count, total, colorClass }) {
  const { t } = useTranslation()
  const pct = total > 0 ? (count / total) * 100 : 0
  return (
    <div>
      <div className="mb-1 flex justify-between text-xs text-slate-600">
        <span>{emoji} {label}</span>
        <span className="text-slate-400 shrink-0 mx-2">{count} {t('dashboard.of')} {total}</span>
      </div>
      <div className="h-2.5 overflow-hidden rounded-full bg-slate-100">
        <div className={`h-full rounded-full transition-all ${colorClass}`} style={{ width: `${pct}%` }} />
      </div>
    </div>
  )
}

export default function DashboardPage() {
  const { t, i18n } = useTranslation()
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
      <div className="page-container py-20 text-center text-slate-400">
        <div className="card mx-auto max-w-md p-8 sm:p-10">
          <span className="mb-4 inline-flex h-14 w-14 items-center justify-center rounded-2xl bg-indigo-50 text-3xl" aria-hidden="true">📊</span>
          <p className="text-lg font-semibold text-slate-700">{t('dashboard.noData')}</p>
          <p className="mt-1 text-sm">{t('dashboard.addProductsFirst')}</p>
        </div>
      </div>
    )
  }

  const locale = i18n.language === 'ar' ? 'ar-EG' : 'en-US'
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
    byCategory.push({ name: t('dashboard.uncategorized'), count: uncatCount })
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

  const fmt = n => n.toLocaleString(locale, { maximumFractionDigits: 0 })

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
    <div className="page-container space-y-6">
      <header>
        <h1 className="page-title">{t('dashboard.title')}</h1>
        <p className="page-subtitle">{t('dashboard.subtitle')}</p>
      </header>

      {/* Summary cards */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 sm:gap-4">
        <StatCard icon="📦" label={t('dashboard.totalProducts')} value={fmt(totalProducts)} />
        <StatCard icon="📁" label={t('dashboard.categories')} value={fmt(totalCategories)} />
        <StatCard
          icon="📈"
          label={t('dashboard.avgMargin')}
          value={avgMargin !== null ? `${avgMargin.toFixed(1)}%` : '—'}
          valueClass={avgMargin === null ? 'text-slate-400' : avgMargin >= 20 ? 'text-emerald-600' : 'text-amber-600'}
        />
        <StatCard icon="💰" label={t('dashboard.totalCatalogValue')} value={fmt(totalValue)} />
      </div>

      {/* Category chart + Margin buckets */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <section className="card p-4 sm:p-5">
          <h2 className="mb-5 text-base font-bold text-slate-800">{t('dashboard.topCategories')}</h2>
          {byCategory.length === 0 ? (
            <p className="text-sm text-slate-400">{t('dashboard.noCategoriesWithProducts')}</p>
          ) : (
            <div className="space-y-3">
              {byCategory.map(cat => (
                <div key={cat.name}>
                  <div className="mb-1 flex justify-between text-xs text-slate-600">
                    <span className="truncate ml-2">{cat.name}</span>
                    <span className="text-slate-400 shrink-0">{cat.count}</span>
                  </div>
                  <div className="h-2.5 overflow-hidden rounded-full bg-slate-100">
                    <div
                      className="h-full bg-indigo-500 rounded-full transition-all"
                      style={{ width: `${(cat.count / maxCount) * 100}%` }}
                    />
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>

        <section className="card p-4 sm:p-5">
          <h2 className="mb-5 text-base font-bold text-slate-800">{t('dashboard.marginDistribution')}</h2>
          {pricedProducts.length === 0 ? (
            <p className="text-sm text-slate-400">{t('dashboard.noPricingData')}</p>
          ) : (
            <div className="space-y-3">
              <BucketRow emoji="🟢" label={t('dashboard.marginHigh')} count={buckets.high} total={margins.length} colorClass="bg-emerald-500" />
              <BucketRow emoji="🟡" label={t('dashboard.marginMid')}  count={buckets.mid}  total={margins.length} colorClass="bg-amber-400" />
              <BucketRow emoji="🔴" label={t('dashboard.marginLow')}  count={buckets.low}  total={margins.length} colorClass="bg-red-400" />
            </div>
          )}
        </section>
      </div>

      {/* Top 10 by margin */}
      {topProducts.length > 0 && (
        <section className="card overflow-hidden">
          <div className="border-b border-slate-100 px-4 py-4 sm:px-5">
            <h2 className="text-base font-bold text-slate-800">{t('dashboard.top10Products')}</h2>
          </div>
          <div className="space-y-4 px-4 py-5 sm:px-5">
            {topProducts.map((p, i) => (
              <div key={p.id} className="flex items-center gap-3">
                <span className="text-xs text-slate-400 w-5 shrink-0 text-center">{i + 1}</span>
                <div className="flex-1 min-w-0">
                  <div className="mb-1.5 flex items-center justify-between">
                    <span className="text-sm text-slate-700 truncate ml-2">{p.name}</span>
                    <span className={`text-xs font-bold shrink-0 ${marginTextColor(p.margin)}`}>
                      {p.margin.toFixed(1)}%
                    </span>
                  </div>
                  <div className="h-2.5 overflow-hidden rounded-full bg-slate-100">
                    <div
                      className={`h-full rounded-full transition-all ${marginBarColor(p.margin)}`}
                      style={{ width: `${Math.min(p.margin, 100)}%` }}
                    />
                  </div>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  )
}
