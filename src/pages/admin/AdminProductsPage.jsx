import { useState, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { listAllProducts, listAllUsers } from '../../lib/adminOps'

export default function AdminProductsPage() {
  const { t, i18n } = useTranslation()
  const [products, setProducts] = useState([])
  const [userMap, setUserMap] = useState({})
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [search, setSearch] = useState('')

  useEffect(() => {
    Promise.all([listAllProducts(), listAllUsers()])
      .then(([prods, users]) => {
        setProducts(prods)
        setUserMap(Object.fromEntries(users.map(u => [u.id, u.email])))
      })
      .catch(e => setError(e.message))
      .finally(() => setLoading(false))
  }, [])

  const locale = i18n.language === 'ar' ? 'ar-EG' : 'en-US'
  const filtered = products.filter(p =>
    p.name?.toLowerCase().includes(search.toLowerCase())
  )

  if (loading) return (
    <div className="flex justify-center py-20">
      <svg className="w-8 h-8 animate-spin text-indigo-500" fill="none" viewBox="0 0 24 24">
        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
      </svg>
    </div>
  )

  return (
    <div className="max-w-7xl mx-auto px-4 py-6 space-y-5">
      <div className="flex items-center justify-between gap-4">
        <h1 className="text-xl font-bold text-slate-800">{t('admin.products.title')}</h1>
        <span className="text-sm text-slate-500">{filtered.length} {t('admin.products.count')}</span>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg px-4 py-3">{error}</div>
      )}

      <input
        type="text"
        value={search}
        onChange={e => setSearch(e.target.value)}
        placeholder={t('admin.products.searchPlaceholder')}
        className="w-full max-w-sm border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400"
      />

      <div className="bg-white rounded-xl border border-slate-200 overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-slate-100 text-slate-500 text-xs uppercase tracking-wide">
              <th className="px-4 py-3 text-start">{t('admin.products.colName')}</th>
              <th className="px-4 py-3 text-start">{t('admin.products.colOwner')}</th>
              <th className="px-4 py-3 text-start">{t('admin.products.colPrice')}</th>
              <th className="px-4 py-3 text-start">{t('admin.products.colDate')}</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map(p => (
              <tr key={p.id} className="border-b border-slate-50 hover:bg-slate-50">
                <td className="px-4 py-3 text-slate-700 font-medium">{p.name}</td>
                <td className="px-4 py-3 text-slate-400 text-xs" dir="ltr">
                  {userMap[p.user_id] || p.user_id}
                </td>
                <td className="px-4 py-3 text-slate-600" dir="ltr">
                  {p.selling_price ? p.selling_price.toLocaleString(locale) : '—'}
                </td>
                <td className="px-4 py-3 text-slate-400" dir="ltr">
                  {new Date(p.created_at).toLocaleDateString()}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
