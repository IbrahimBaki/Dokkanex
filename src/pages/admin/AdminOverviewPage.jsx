import { useState, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { getSystemStats } from '../../lib/adminOps'

function StatCard({ icon, label, value, valueClass = 'text-slate-800' }) {
  return (
    <div className="bg-white rounded-xl border border-slate-200 p-5 flex flex-col gap-1">
      <span className="text-2xl">{icon}</span>
      <span className={`text-2xl font-bold ${valueClass}`}>{value}</span>
      <span className="text-xs text-slate-500">{label}</span>
    </div>
  )
}

export default function AdminOverviewPage() {
  const { t } = useTranslation()
  const [stats, setStats] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    getSystemStats()
      .then(setStats)
      .catch(e => setError(e.message))
      .finally(() => setLoading(false))
  }, [])

  if (loading) return (
    <div className="flex justify-center py-20">
      <svg className="w-8 h-8 animate-spin text-indigo-500" fill="none" viewBox="0 0 24 24">
        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
      </svg>
    </div>
  )

  if (error) return (
    <div className="max-w-7xl mx-auto px-4 py-10 text-center text-red-600">{error}</div>
  )

  return (
    <div className="max-w-7xl mx-auto px-4 py-6 space-y-6">
      <h1 className="text-xl font-bold text-slate-800">{t('admin.overview.title')}</h1>
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5">
        <StatCard icon="👥" label={t('admin.overview.totalUsers')} value={stats.totalUsers} />
        <StatCard icon="✅" label={t('admin.overview.activeUsers')} value={stats.activeUsers} valueClass="text-emerald-600" />
        <StatCard icon="🚫" label={t('admin.overview.deactivatedUsers')} value={stats.deactivatedUsers} valueClass="text-red-600" />
        <StatCard icon="📦" label={t('admin.overview.totalProducts')} value={stats.totalProducts} />
        <StatCard icon="📁" label={t('admin.overview.totalCategories')} value={stats.totalCategories} />
      </div>
    </div>
  )
}
