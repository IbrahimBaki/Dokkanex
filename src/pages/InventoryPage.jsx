import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { useAuth } from '../context/AuthContext'
import { useSync } from '../context/SyncContext'
import { getCategories, getProducts } from '../lib/offlineOps'
import { buildInventoryRows, filterInventoryRows, getUserInventoryBalanceMap, isInventoryInitialized } from '../lib/inventoryLocal'
import { formatQuantityForUnit } from '../lib/quantity'
import InitializeStockDialog from '../components/InitializeStockDialog'
import AdjustStockDialog from '../components/AdjustStockDialog'
import StockActivityDialog from '../components/StockActivityDialog'

const FILTERS = ['all', 'low_stock', 'out_of_stock', 'stock_not_set']
const statusStyle = { in_stock: 'bg-emerald-50 text-emerald-700', low_stock: 'bg-amber-50 text-amber-700', out_of_stock: 'bg-red-50 text-red-700', stock_not_set: 'bg-slate-100 text-slate-600' }

function Quantity({ row, t }) {
  if (!isInventoryInitialized(row.balance)) return <span className="text-slate-500">{t('inventory.stockNotSet')}</span>
  const unit = row.product.unit || 'piece'
  return <span className="font-medium text-slate-800">{formatQuantityForUnit(row.balance.current_quantity, unit)} {t(`productForm.units.${unit}`)}</span>
}

export default function InventoryPage() {
  const { t } = useTranslation()
  const { user } = useAuth()
  const { syncVersion } = useSync()
  const navigate = useNavigate()
  const [products, setProducts] = useState([])
  const [categories, setCategories] = useState([])
  const [balanceMap, setBalanceMap] = useState(new Map())
  const [search, setSearch] = useState('')
  const [filter, setFilter] = useState('all')
  const [loading, setLoading] = useState(true)
  const [initializeProduct, setInitializeProduct] = useState(null)
  const [adjustRow, setAdjustRow] = useState(null)
  const [activityProduct, setActivityProduct] = useState(null)

  useEffect(() => {
    if (!user?.id) return
    let active = true
    setLoading(true)
    Promise.all([getProducts(user.id), getCategories(user.id), getUserInventoryBalanceMap(user.id)])
      .then(([nextProducts, nextCategories, nextBalances]) => {
        if (!active) return
        setProducts(nextProducts)
        setCategories(nextCategories)
        setBalanceMap(nextBalances)
      })
      .finally(() => active && setLoading(false))
    return () => { active = false }
  }, [user?.id, syncVersion])

  const rows = useMemo(() => buildInventoryRows({ userId: user?.id, products, categories, balanceMap }), [user?.id, products, categories, balanceMap])
  const visible = useMemo(() => filterInventoryRows(rows, search, filter), [rows, search, filter])
  const onInitialized = (balance) => setBalanceMap((previous) => new Map(previous).set(balance.product_id, balance))

  return <div className="page-container">
    <div className="mb-6 flex items-end justify-between gap-3"><div><h1 className="page-title">{t('inventory.title')}</h1><p className="page-subtitle">تابع الكميات والحالات واتخذ إجراءً سريعًا عند الحاجة.</p></div><button className="shrink-0 rounded-lg bg-indigo-50 px-3 py-2 text-sm font-medium text-indigo-700 hover:bg-indigo-100" onClick={() => navigate('/products')}>{t('inventory.products')}</button></div>
    <div className="card mb-5 p-3 sm:p-4"><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder={t('inventory.search')} className="input-field" /><div className="mt-3 flex gap-2 overflow-x-auto pb-1 scrollbar-hide">{FILTERS.map((value) => <button key={value} onClick={() => setFilter(value)} className={`shrink-0 rounded-full px-3 py-1.5 text-sm font-medium transition-colors ${filter === value ? 'bg-indigo-600 text-white shadow-sm' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}>{t(`inventory.filters.${value}`)}</button>)}</div></div>
    {loading ? <div className="py-16 text-center text-slate-400">{t('inventory.loading')}</div> : rows.length === 0 ? <div className="card py-16 text-center text-slate-500"><p className="font-semibold">{t('inventory.noProducts')}</p><button className="btn-primary mt-4 px-4" onClick={() => navigate('/add')}>{t('products.addProduct')}</button></div> : visible.length === 0 ? <div className="card py-12 text-center text-slate-500">{search ? t('inventory.noMatchingProducts') : t('inventory.noMatchingFilter')}</div> : <>
      <div className="hidden md:grid grid-cols-[minmax(0,2fr)_minmax(0,1fr)_minmax(0,1fr)_auto] gap-4 px-4 py-2 text-xs font-semibold text-slate-500"><span>{t('inventory.product')}</span><span>{t('inventory.category')}</span><span>{t('inventory.quantity')}</span><span>{t('inventory.status')}</span></div>
      <div className="space-y-2">{visible.map((row) => <div key={row.product.id} className="card p-3 transition-shadow hover:shadow-md md:grid md:grid-cols-[minmax(0,2fr)_minmax(0,1fr)_minmax(0,1fr)_auto] md:items-center md:gap-4">
        <div><p className="font-semibold text-slate-800">{row.product.name}</p><p className="md:hidden mt-1 inline-flex rounded-md bg-slate-100 px-2 py-0.5 text-xs text-slate-600">{row.category?.name || t('inventory.noCategory')}</p></div>
        <p className="hidden md:block text-sm text-slate-600">{row.category?.name || '—'}</p>
        <div className="mt-3 rounded-lg bg-slate-50 px-2.5 py-2 md:mt-0"><Quantity row={row} t={t} /></div>
        <div className="mt-3 flex items-center justify-between gap-3 md:mt-0"><span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${statusStyle[row.status]}`}>{t(`inventory.statuses.${row.status}`)}</span>{!isInventoryInitialized(row.balance) ? <button onClick={() => setInitializeProduct(row.product)} className="rounded-lg bg-emerald-50 px-2.5 py-1.5 text-sm font-medium text-emerald-700 hover:bg-emerald-100">{t('inventory.initialize')}</button> : <span className="flex gap-2"><button onClick={() => setActivityProduct(row.product)} className="rounded-lg px-2.5 py-1.5 text-sm font-medium text-slate-600 hover:bg-slate-100">{t('activity.open')}</button><button onClick={() => setAdjustRow(row)} className="rounded-lg bg-indigo-50 px-2.5 py-1.5 text-sm font-medium text-indigo-700 hover:bg-indigo-100">{t('adjustStock.open')}</button></span>}</div>
      </div>)}</div>
    </>}
    {initializeProduct && <InitializeStockDialog product={initializeProduct} userId={user.id} onInitialized={onInitialized} onClose={() => setInitializeProduct(null)} />}
    {adjustRow && <AdjustStockDialog product={adjustRow.product} currentBalance={adjustRow.balance} userId={user.id} onAdjusted={onInitialized} onClose={() => setAdjustRow(null)} />}
    {activityProduct && <StockActivityDialog product={activityProduct} userId={user.id} onClose={() => setActivityProduct(null)} />}
  </div>
}
