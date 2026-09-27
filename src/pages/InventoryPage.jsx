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
    <div className="flex items-center justify-between mb-5"><h1 className="text-xl font-bold text-slate-800">{t('inventory.title')}</h1><button className="text-sm text-indigo-600 hover:text-indigo-700" onClick={() => navigate('/products')}>{t('inventory.products')}</button></div>
    <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder={t('inventory.search')} className="input-field mb-4" />
    <div className="flex gap-2 overflow-x-auto pb-2 mb-4">{FILTERS.map((value) => <button key={value} onClick={() => setFilter(value)} className={`shrink-0 rounded-lg px-3 py-1.5 text-sm font-medium ${filter === value ? 'bg-indigo-600 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}>{t(`inventory.filters.${value}`)}</button>)}</div>
    {loading ? <div className="py-16 text-center text-slate-400">{t('inventory.loading')}</div> : rows.length === 0 ? <div className="card py-16 text-center text-slate-500"><p className="font-semibold">{t('inventory.noProducts')}</p><button className="btn-primary mt-4 px-4" onClick={() => navigate('/add')}>{t('products.addProduct')}</button></div> : visible.length === 0 ? <div className="card py-12 text-center text-slate-500">{search ? t('inventory.noMatchingProducts') : t('inventory.noMatchingFilter')}</div> : <>
      <div className="hidden md:grid grid-cols-[minmax(0,2fr)_minmax(0,1fr)_minmax(0,1fr)_auto] gap-4 px-4 py-2 text-xs font-semibold text-slate-500"><span>{t('inventory.product')}</span><span>{t('inventory.category')}</span><span>{t('inventory.quantity')}</span><span>{t('inventory.status')}</span></div>
      <div className="space-y-2">{visible.map((row) => <div key={row.product.id} className="card p-3 md:grid md:grid-cols-[minmax(0,2fr)_minmax(0,1fr)_minmax(0,1fr)_auto] md:items-center md:gap-4">
        <div><p className="font-semibold text-slate-800">{row.product.name}</p><p className="md:hidden text-xs text-slate-500 mt-1">{row.category?.name || t('inventory.noCategory')}</p></div>
        <p className="hidden md:block text-sm text-slate-600">{row.category?.name || '—'}</p>
        <div className="mt-2 md:mt-0"><Quantity row={row} t={t} /></div>
        <div className="mt-2 md:mt-0 flex items-center justify-between gap-3"><span className={`rounded-full px-2 py-1 text-xs font-medium ${statusStyle[row.status]}`}>{t(`inventory.statuses.${row.status}`)}</span>{!isInventoryInitialized(row.balance) ? <button onClick={() => setInitializeProduct(row.product)} className="text-sm font-medium text-emerald-700 hover:text-emerald-800">{t('inventory.initialize')}</button> : <span className="flex gap-2"><button onClick={() => setActivityProduct(row.product)} className="text-sm font-medium text-slate-600">{t('activity.open')}</button><button onClick={() => setAdjustRow(row)} className="text-sm font-medium text-indigo-700 hover:text-indigo-800">{t('adjustStock.open')}</button></span>}</div>
      </div>)}</div>
    </>}
    {initializeProduct && <InitializeStockDialog product={initializeProduct} userId={user.id} onInitialized={onInitialized} onClose={() => setInitializeProduct(null)} />}
    {adjustRow && <AdjustStockDialog product={adjustRow.product} currentBalance={adjustRow.balance} userId={user.id} onAdjusted={onInitialized} onClose={() => setAdjustRow(null)} />}
    {activityProduct && <StockActivityDialog product={activityProduct} userId={user.id} onClose={() => setActivityProduct(null)} />}
  </div>
}
