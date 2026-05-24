import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import ConfirmDialog from '../components/ConfirmDialog'

export default function CategoriesPage() {
  const [categories, setCategories] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [newName, setNewName] = useState('')
  const [adding, setAdding] = useState(false)
  const [editingId, setEditingId] = useState(null)
  const [editingName, setEditingName] = useState('')
  const [saving, setSaving] = useState(false)
  const [toDelete, setToDelete] = useState(null)
  const [deleting, setDeleting] = useState(false)

  useEffect(() => {
    fetchCategories()
  }, [])

  async function fetchCategories() {
    setLoading(true)
    const { data, error } = await supabase.from('categories').select('*').order('name')
    if (error) setError('فشل تحميل الفئات')
    else setCategories(data || [])
    setLoading(false)
  }

  async function handleAdd() {
    const name = newName.trim()
    if (!name) return setError('اسم الفئة مطلوب')
    setAdding(true)
    setError('')
    try {
      const { data, error } = await supabase.from('categories').insert({ name }).select().single()
      if (error) throw error
      setCategories(prev => [...prev, data].sort((a, b) => a.name.localeCompare(b.name)))
      setNewName('')
    } catch (e) {
      setError('فشل إضافة الفئة: ' + e.message)
    } finally {
      setAdding(false)
    }
  }

  async function handleSaveEdit(cat) {
    const name = editingName.trim()
    if (!name || name === cat.name) return cancelEdit()
    setSaving(true)
    try {
      const { data, error } = await supabase
        .from('categories')
        .update({ name })
        .eq('id', cat.id)
        .select()
        .single()
      if (error) throw error
      setCategories(prev => prev.map(c => c.id === cat.id ? data : c).sort((a, b) => a.name.localeCompare(b.name)))
      cancelEdit()
    } catch (e) {
      setError('فشل تعديل الفئة: ' + e.message)
    } finally {
      setSaving(false)
    }
  }

  function startEdit(cat) {
    setEditingId(cat.id)
    setEditingName(cat.name)
  }

  function cancelEdit() {
    setEditingId(null)
    setEditingName('')
  }

  async function handleDelete() {
    if (!toDelete) return
    setDeleting(true)
    try {
      const { error } = await supabase.from('categories').delete().eq('id', toDelete.id)
      if (error) throw error
      setCategories(prev => prev.filter(c => c.id !== toDelete.id))
      setToDelete(null)
    } catch (e) {
      setError('فشل حذف الفئة: ' + e.message)
    } finally {
      setDeleting(false)
    }
  }

  return (
    <div className="page-container">
      <div className="flex items-center justify-between mb-6">
        <span className="text-slate-500 text-sm">{categories.length} فئة</span>
        <h1 className="text-xl font-bold text-slate-800">الفئات</h1>
      </div>

      {/* Add Form */}
      <div className="card p-4 mb-5">
        <p className="text-sm font-semibold text-slate-700 mb-3">إضافة فئة جديدة</p>
        <div className="flex gap-2">
          <input
            type="text"
            value={newName}
            onChange={e => { setNewName(e.target.value); setError('') }}
            placeholder="اسم الفئة"
            className="input-field"
            disabled={adding}
            onKeyDown={e => e.key === 'Enter' && handleAdd()}
            autoFocus
          />
          <button
            type="button"
            onClick={handleAdd}
            disabled={adding}
            className="btn-primary whitespace-nowrap flex items-center gap-2 px-5"
          >
            {adding ? (
              <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
              </svg>
            ) : (
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
              </svg>
            )}
            إضافة
          </button>
        </div>
      </div>

      {/* Error */}
      {error && (
        <div className="mb-4 bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg px-4 py-3">
          {error}
        </div>
      )}

      {/* List */}
      {loading ? (
        <div className="flex justify-center py-12">
          <svg className="w-7 h-7 animate-spin text-indigo-500" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
          </svg>
        </div>
      ) : categories.length === 0 ? (
        <div className="card p-10 text-center text-slate-400">
          <svg className="w-12 h-12 mx-auto mb-3 text-slate-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1}
              d="M7 7h.01M7 3h5c.512 0 1.024.195 1.414.586l7 7a2 2 0 010 2.828l-7 7a2 2 0 01-2.828 0l-7-7A1.994 1.994 0 013 12V7a4 4 0 014-4z" />
          </svg>
          <p className="font-semibold text-slate-500">لا توجد فئات بعد</p>
          <p className="text-sm mt-1">أضف فئة لتنظيم منتجاتك</p>
        </div>
      ) : (
        <div className="card divide-y divide-slate-100 overflow-hidden">
          {categories.map(cat => (
            <div key={cat.id} className="flex items-center gap-3 px-4 py-3">
              <div className="w-8 h-8 rounded-lg bg-indigo-50 flex items-center justify-center shrink-0">
                <svg className="w-4 h-4 text-indigo-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                    d="M7 7h.01M7 3h5c.512 0 1.024.195 1.414.586l7 7a2 2 0 010 2.828l-7 7a2 2 0 01-2.828 0l-7-7A1.994 1.994 0 013 12V7a4 4 0 014-4z" />
                </svg>
              </div>

              {editingId === cat.id ? (
                <input
                  type="text"
                  value={editingName}
                  onChange={e => setEditingName(e.target.value)}
                  className="input-field flex-1 py-1.5 text-sm"
                  autoFocus
                  disabled={saving}
                  onKeyDown={e => {
                    if (e.key === 'Enter') handleSaveEdit(cat)
                    if (e.key === 'Escape') cancelEdit()
                  }}
                />
              ) : (
                <span className="flex-1 text-slate-800 font-medium text-sm">{cat.name}</span>
              )}

              <div className="flex items-center gap-1 shrink-0">
                {editingId === cat.id ? (
                  <>
                    <button
                      onClick={() => handleSaveEdit(cat)}
                      disabled={saving}
                      className="w-8 h-8 rounded-lg bg-emerald-50 text-emerald-700 flex items-center justify-center hover:bg-emerald-100 transition-colors"
                    >
                      {saving ? (
                        <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
                        </svg>
                      ) : (
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                        </svg>
                      )}
                    </button>
                    <button
                      onClick={cancelEdit}
                      className="w-8 h-8 rounded-lg bg-slate-100 text-slate-600 flex items-center justify-center hover:bg-slate-200 transition-colors"
                    >
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                      </svg>
                    </button>
                  </>
                ) : (
                  <>
                    <button
                      onClick={() => startEdit(cat)}
                      className="w-8 h-8 rounded-lg bg-indigo-50 text-indigo-700 flex items-center justify-center hover:bg-indigo-100 transition-colors"
                    >
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                          d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                      </svg>
                    </button>
                    <button
                      onClick={() => setToDelete(cat)}
                      className="w-8 h-8 rounded-lg bg-red-50 text-red-700 flex items-center justify-center hover:bg-red-100 transition-colors"
                    >
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                          d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                      </svg>
                    </button>
                  </>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      <ConfirmDialog
        open={!!toDelete}
        title="حذف الفئة"
        message={`هل أنت متأكد من حذف فئة "${toDelete?.name}"؟ لن تُحذف المنتجات المرتبطة بها.`}
        onConfirm={handleDelete}
        onCancel={() => setToDelete(null)}
        loading={deleting}
      />
    </div>
  )
}
