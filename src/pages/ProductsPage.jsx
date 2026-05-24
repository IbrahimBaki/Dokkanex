import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase, deleteImage } from '../lib/supabase'
import ProductCard from '../components/ProductCard'
import SearchBar from '../components/SearchBar'
import CategoryFilter from '../components/CategoryFilter'
import ConfirmDialog from '../components/ConfirmDialog'

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

  function setView(mode) {
    setViewMode(mode)
    localStorage.setItem('products-view', mode)
  }

  useEffect(() => {
    fetchAll()

    const channel = supabase
      .channel('products-realtime')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'products' }, () => {
        fetchProducts()
      })
      .subscribe()

    return () => supabase.removeChannel(channel)
  }, [])

  async function fetchAll() {
    setLoading(true)
    await Promise.all([fetchProducts(), fetchCategories()])
    setLoading(false)
  }

  async function fetchProducts() {
    const { data, error } = await supabase
      .from('products')
      .select('*')
      .order('created_at', { ascending: false })
    if (error) setError('فشل تحميل المنتجات')
    else setProducts(data || [])
  }

  async function fetchCategories() {
    const { data } = await supabase.from('categories').select('*').order('name')
    if (data) setCategories(data)
  }

  async function handleDelete() {
    if (!toDelete) return
    setDeleting(true)
    try {
      await deleteImage(toDelete.image_url)
      const { error } = await supabase.from('products').delete().eq('id', toDelete.id)
      if (error) throw error
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

  return (
    <div className="page-container">
      {/* Header */}
      <div className="flex items-center justify-between mb-5">
        <div className="flex items-center gap-2">
          <span className="text-slate-500 text-sm">{products.length} منتج</span>
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
        </div>
        <h1 className="text-xl font-bold text-slate-800">المنتجات</h1>
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
          {filtered.map(product => (
            <ProductCard
              key={product.id}
              product={product}
              categoryName={categoryMap[product.category_id]?.name}
              categoryId={product.category_id}
              onEdit={p => navigate(`/edit/${p.id}`)}
              onDelete={p => setToDelete(p)}
            />
          ))}
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          {filtered.map(product => (
            <ProductCard
              key={product.id}
              product={product}
              categoryName={categoryMap[product.category_id]?.name}
              categoryId={product.category_id}
              onEdit={p => navigate(`/edit/${p.id}`)}
              onDelete={p => setToDelete(p)}
              view="list"
            />
          ))}
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
    </div>
  )
}
