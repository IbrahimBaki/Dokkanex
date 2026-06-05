import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { useSync } from '../context/SyncContext'
import { getProducts, getCategories, deleteProduct } from '../lib/offlineOps'
import ProductCard from '../components/ProductCard'
import SearchBar from '../components/SearchBar'
import CategoryFilter from '../components/CategoryFilter'
import ConfirmDialog from '../components/ConfirmDialog'
import ExportModal from '../components/ExportModal'

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

export default function ProductsPage() {
  const navigate = useNavigate()
  const { user } = useAuth()
  const { syncVersion, syncing } = useSync()
  const [products, setProducts] = useState([])
  const [categories, setCategories] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [search, setSearch] = useState('')
  const [selectedCategory, setSelectedCategory] = useState(null)
  const [toDelete, setToDelete] = useState(null)
  const [deleting, setDeleting] = useState(false)
  const [viewMode, setViewMode] = useState(
    () => localStorage.getItem('products-view') || 'grid'
  )
  const [selectionMode, setSelectionMode] = useState(false)
  const [selectedIds, setSelectedIds] = useState(new Set())
  const [showExport, setShowExport] = useState(false)
  const [page, setPage] = useState(1)
  const ITEMS_PER_PAGE = 100

  function setView(mode) {
    setViewMode(mode)
    localStorage.setItem('products-view', mode)
  }

  function toggleSelectionMode() {
    setSelectionMode(v => !v)
    setSelectedIds(new Set())
  }

  function toggleSelect(id) {
    setSelectedIds(prev => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
  }

  function selectAll() {
    setSelectedIds(new Set(filtered.map(p => p.id)))
  }

  useEffect(() => {
    if (!user) return
    fetchAll()
  }, [user, syncVersion])

  async function fetchAll() {
    setLoading(true)
    await Promise.all([fetchProducts(), fetchCategories()])
    setLoading(false)
  }

  async function fetchProducts() {
    try {
      const data = await getProducts(user.id)
      setProducts(data.sort((a, b) => new Date(b.created_at) - new Date(a.created_at)))
    } catch (e) {
      setError('فشل تحميل المنتجات: ' + e.message)
    }
  }

  async function fetchCategories() {
    try {
      const data = await getCategories(user.id)
      setCategories(data.sort((a, b) => a.name.localeCompare(b.name)))
    } catch (e) {
      console.error('fetchCategories error', e)
    }
  }

  async function handleDelete() {
    if (!toDelete) return
    setDeleting(true)
    try {
      await deleteProduct(toDelete.id)
      setProducts(prev => prev.filter(p => p.id !== toDelete.id))
      setToDelete(null)
    } catch (e) {
      setError('فشل حذف المنتج: ' + e.message)
    } finally {
      setDeleting(false)
    }
  }

  const categoryMap = Object.fromEntries(categories.map(c => [c.id, c]))

  const filtered = products.filter(p => {
    const matchSearch = p.name.toLowerCase().includes(search.toLowerCase())
    const matchCat = selectedCategory === null || p.category_id === selectedCategory
    return matchSearch && matchCat
  })

  const totalPages = Math.max(1, Math.ceil(filtered.length / ITEMS_PER_PAGE))
  const safePage = Math.min(page, totalPages)
  const paginated = filtered.slice((safePage - 1) * ITEMS_PER_PAGE, safePage * ITEMS_PER_PAGE)

  useEffect(() => { setPage(1) }, [search, selectedCategory])

  return (
    <div className="page-container">
      {/* Header */}
      <div className="flex items-center justify-between mb-5">
        <div className="flex items-center gap-2">
          {selectionMode ? (
            <>
              <button
                onClick={toggleSelectionMode}
                className="text-sm text-slate-500 hover:text-slate-700 transition-colors"
              >
                إلغاء
              </button>
              <button
                onClick={selectAll}
                className="text-sm text-indigo-600 font-medium hover:text-indigo-700 transition-colors"
              >
                تحديد الكل
              </button>
            </>
          ) : (
            <>
              <span className="text-slate-500 text-sm">
                {filtered.length !== products.length
                  ? `${filtered.length} / ${products.length}`
                  : products.length} منتج
              </span>
              <div className="flex items-center gap-0.5 bg-slate-100 rounded-lg p-0.5">
                <button
                  onClick={() => setView('grid')}
                  className={`p-1.5 rounded-md transition-colors ${viewMode === 'grid' ? 'bg-white text-indigo-600 shadow-sm' : 'text-slate-400 hover:text-slate-600'}`}
                  title="عرض شبكي"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                      d="M4 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2V6zM14 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2V6zM4 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2v-2zM14 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2v-2z" />
                  </svg>
                </button>
                <button
                  onClick={() => setView('list')}
                  className={`p-1.5 rounded-md transition-colors ${viewMode === 'list' ? 'bg-white text-indigo-600 shadow-sm' : 'text-slate-400 hover:text-slate-600'}`}
                  title="عرض قائمة"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                      d="M4 6h16M4 10h16M4 14h16M4 18h16" />
                  </svg>
                </button>
              </div>
              <button
                onClick={toggleSelectionMode}
                className="p-1.5 rounded-md text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-colors"
                title="تحديد للتصدير"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                    d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" />
                </svg>
              </button>
            </>
          )}
        </div>
        <h1 className="text-xl font-bold text-slate-800">
          {selectionMode && selectedIds.size > 0 ? `${selectedIds.size} محدد` : 'المنتجات'}
        </h1>
      </div>

      {/* Search */}
      <div className="mb-4">
        <SearchBar value={search} onChange={setSearch} />
      </div>

      {/* Category Filter */}
      {categories.length > 0 && (
        <div className="mb-5">
          <CategoryFilter categories={categories} selected={selectedCategory} onChange={setSelectedCategory} />
        </div>
      )}

      {/* Error */}
      {error && (
        <div className="mb-4 bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg px-4 py-3">
          {error}
        </div>
      )}

      {/* Content */}
      {loading ? (
        <Spinner />
      ) : products.length === 0 && syncing ? (
        <div className="flex flex-col items-center justify-center py-16 text-slate-400 gap-3">
          <svg className="w-8 h-8 animate-spin text-indigo-400" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
          </svg>
          <p className="text-sm">جاري تحميل البيانات من السيرفر...</p>
        </div>
      ) : filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 text-slate-400">
          <svg className="w-16 h-16 mb-4 text-slate-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1}
              d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" />
          </svg>
          {search || selectedCategory ? (
            <>
              <p className="font-semibold text-slate-500">لا توجد نتائج</p>
              <p className="text-sm mt-1">جرّب تغيير كلمة البحث أو الفئة</p>
            </>
          ) : (
            <>
              <p className="font-semibold text-slate-500">لا توجد منتجات بعد</p>
              <p className="text-sm mt-1">أضف منتجاً جديداً بالضغط على +</p>
            </>
          )}
        </div>
      ) : viewMode === 'grid' ? (
        <div className="grid grid-cols-2 gap-3">
          {paginated.map(product => (
            <ProductCard
              key={product.id}
              product={product}
              categoryName={categoryMap[product.category_id]?.name}
              categoryId={product.category_id}
              onEdit={p => navigate(`/edit/${p.id}`)}
              onDelete={p => setToDelete(p)}
              selectionMode={selectionMode}
              selected={selectedIds.has(product.id)}
              onToggleSelect={toggleSelect}
            />
          ))}
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          {paginated.map(product => (
            <ProductCard
              key={product.id}
              product={product}
              categoryName={categoryMap[product.category_id]?.name}
              categoryId={product.category_id}
              onEdit={p => navigate(`/edit/${p.id}`)}
              onDelete={p => setToDelete(p)}
              view="list"
              selectionMode={selectionMode}
              selected={selectedIds.has(product.id)}
              onToggleSelect={toggleSelect}
            />
          ))}
        </div>
      )}

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-3 py-6 mt-2">
          <button
            onClick={() => setPage(p => Math.max(1, p - 1))}
            disabled={safePage === 1}
            className="w-9 h-9 rounded-lg bg-slate-100 text-slate-600 flex items-center justify-center hover:bg-slate-200 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
            </svg>
          </button>

          <div className="flex items-center gap-1">
            {Array.from({ length: totalPages }, (_, i) => i + 1)
              .filter(n => n === 1 || n === totalPages || Math.abs(n - safePage) <= 1)
              .reduce((acc, n, idx, arr) => {
                if (idx > 0 && n - arr[idx - 1] > 1) acc.push('…')
                acc.push(n)
                return acc
              }, [])
              .map((item, idx) =>
                item === '…' ? (
                  <span key={`ellipsis-${idx}`} className="px-1 text-slate-400 text-sm">…</span>
                ) : (
                  <button
                    key={item}
                    onClick={() => setPage(item)}
                    className={`w-9 h-9 rounded-lg text-sm font-medium transition-colors ${
                      item === safePage
                        ? 'bg-indigo-600 text-white shadow-sm'
                        : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                    }`}
                  >
                    {item}
                  </button>
                )
              )}
          </div>

          <button
            onClick={() => setPage(p => Math.min(totalPages, p + 1))}
            disabled={safePage === totalPages}
            className="w-9 h-9 rounded-lg bg-slate-100 text-slate-600 flex items-center justify-center hover:bg-slate-200 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
          </button>
        </div>
      )}

      {/* FAB */}
      <button
        onClick={() => navigate('/add')}
        className="fixed bottom-6 left-4 w-14 h-14 bg-indigo-600 text-white rounded-full shadow-lg shadow-indigo-300 flex items-center justify-center hover:bg-indigo-700 active:scale-95 transition-all z-30"
        aria-label="إضافة منتج"
      >
        <svg className="w-7 h-7" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
        </svg>
      </button>

      {/* Delete Confirmation */}
      <ConfirmDialog
        open={!!toDelete}
        title="حذف المنتج"
        message={`هل أنت متأكد من حذف "${toDelete?.name}"؟ لا يمكن التراجع عن هذا الإجراء.`}
        onConfirm={handleDelete}
        onCancel={() => setToDelete(null)}
        loading={deleting}
      />

      {/* Export floating bar */}
      {selectionMode && selectedIds.size > 0 && (
        <div className="fixed bottom-6 inset-x-4 z-30 flex items-center justify-between gap-3 bg-indigo-600 text-white rounded-2xl px-4 py-3 shadow-xl shadow-indigo-300">
          <span className="text-sm font-semibold">{selectedIds.size} منتج محدد</span>
          <button
            onClick={() => setShowExport(true)}
            className="flex items-center gap-2 bg-white text-indigo-700 font-bold text-sm px-4 py-1.5 rounded-xl hover:bg-indigo-50 active:scale-95 transition-all"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
            </svg>
            تصدير ومشاركة
          </button>
        </div>
      )}

      {/* Export Modal */}
      {showExport && (
        <ExportModal
          products={filtered.filter(p => selectedIds.has(p.id))}
          categoryMap={categoryMap}
          onClose={() => setShowExport(false)}
        />
      )}
    </div>
  )
}
