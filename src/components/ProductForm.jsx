import { useState, useEffect, useRef } from 'react'
import { uploadImage, deleteImage, supabase } from '../lib/supabase'
import { useSync } from '../context/SyncContext'
import { getCategories, addCategory, addProduct, updateProduct } from '../lib/offlineOps'

export default function ProductForm({ initialData, onSuccess, onCancel }) {
  const { isOnline, refreshMeta } = useSync()
  const [name, setName] = useState(initialData?.name || '')
  const [wholesalePrice, setWholesalePrice] = useState(initialData?.wholesale_price || '')
  const [sellingPrice, setSellingPrice] = useState(initialData?.selling_price || '')
  const [categoryId, setCategoryId] = useState(initialData?.category_id || '')
  const [categories, setCategories] = useState([])
  const [imageFile, setImageFile] = useState(null)
  const [imagePreview, setImagePreview] = useState(initialData?.image_url || null)
  const [newCategoryName, setNewCategoryName] = useState('')
  const [showNewCategory, setShowNewCategory] = useState(false)
  const [loading, setLoading] = useState(false)
  const [catLoading, setCatLoading] = useState(false)
  const [error, setError] = useState('')
  const fileInputRef = useRef(null)
  const previewUrlRef = useRef(null)

  useEffect(() => {
    fetchCategories()
    return () => {
      if (previewUrlRef.current) URL.revokeObjectURL(previewUrlRef.current)
    }
  }, [])

  async function fetchCategories() {
    const { data } = await supabase.auth.getSession()
    const userId = data.session?.user?.id
    if (!userId) return
    const cats = await getCategories(userId)
    setCategories(cats.sort((a, b) => a.name.localeCompare(b.name)))
  }

  function handleImageChange(e) {
    const file = e.target.files[0]
    if (!file) return
    if (previewUrlRef.current) URL.revokeObjectURL(previewUrlRef.current)
    const url = URL.createObjectURL(file)
    previewUrlRef.current = url
    setImageFile(file)
    setImagePreview(url)
  }

  function removeImage() {
    if (previewUrlRef.current) URL.revokeObjectURL(previewUrlRef.current)
    previewUrlRef.current = null
    setImageFile(null)
    setImagePreview(null)
    if (fileInputRef.current) fileInputRef.current.value = ''
  }

  async function handleAddCategory() {
    const trimmed = newCategoryName.trim()
    if (!trimmed) return
    setCatLoading(true)
    try {
      const record = await addCategory({ name: trimmed })
      setCategories(prev => [...prev, record].sort((a, b) => a.name.localeCompare(b.name)))
      setCategoryId(record.id)
      setNewCategoryName('')
      setShowNewCategory(false)
      refreshMeta()
    } catch (e) {
      setError('فشل إضافة الفئة: ' + e.message)
    } finally {
      setCatLoading(false)
    }
  }

  async function handleSubmit(e) {
    e.preventDefault()
    setError('')

    if (!name.trim()) return setError('اسم المنتج مطلوب')
    if (!wholesalePrice || isNaN(wholesalePrice)) return setError('سعر الجملة غير صحيح')
    if (!sellingPrice || isNaN(sellingPrice)) return setError('سعر البيع غير صحيح')

    if (imageFile && !isOnline) {
      return setError('رفع الصور يتطلب اتصالاً بالإنترنت. احفظ المنتج بدون صورة الآن وأضف الصورة عند الاتصال.')
    }

    setLoading(true)
    try {
      let imageUrl = initialData?.image_url || null

      if (imageFile) {
        if (initialData?.image_url) {
          await deleteImage(initialData.image_url)
        }
        imageUrl = await uploadImage(imageFile)
      } else if (!imagePreview && initialData?.image_url) {
        await deleteImage(initialData.image_url)
        imageUrl = null
      }

      const payload = {
        name: name.trim(),
        wholesale_price: parseFloat(wholesalePrice),
        selling_price: parseFloat(sellingPrice),
        category_id: categoryId || null,
        image_url: imageUrl,
      }

      let result
      if (initialData?.id) {
        result = await updateProduct(initialData.id, payload)
      } else {
        result = await addProduct(payload)
      }

      refreshMeta()
      onSuccess(result)
    } catch (e) {
      setError('فشل حفظ المنتج: ' + e.message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      {/* Product Name */}
      <div>
        <label className="form-label">اسم المنتج <span className="text-red-500">*</span></label>
        <input
          type="text"
          value={name}
          onChange={e => setName(e.target.value)}
          placeholder="أدخل اسم المنتج"
          className="input-field"
          disabled={loading}
        />
      </div>

      {/* Image Upload */}
      <div>
        <label className="form-label">
          صورة المنتج
          {!isOnline && (
            <span className="text-xs text-amber-500 font-normal mr-2">(يتطلب إنترنت)</span>
          )}
        </label>
        {imagePreview ? (
          <div className="relative w-full aspect-video rounded-xl overflow-hidden border border-slate-200 bg-slate-50">
            <img src={imagePreview} alt="معاينة" className="w-full h-full object-cover" />
            <button
              type="button"
              onClick={removeImage}
              className="absolute top-2 left-2 w-7 h-7 bg-red-600 text-white rounded-full flex items-center justify-center hover:bg-red-700 shadow"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => isOnline && fileInputRef.current?.click()}
            className={`w-full border-2 border-dashed rounded-xl py-8 flex flex-col items-center gap-2 transition-colors text-slate-500 ${
              isOnline
                ? 'border-slate-300 hover:border-indigo-400 hover:bg-indigo-50 cursor-pointer'
                : 'border-slate-200 opacity-50 cursor-not-allowed'
            }`}
            disabled={loading || !isOnline}
            title={!isOnline ? 'رفع الصور يتطلب اتصالاً بالإنترنت' : ''}
          >
            <svg className="w-8 h-8 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
                d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
            </svg>
            <span className="text-sm font-medium">
              {isOnline ? 'اضغط لاختيار صورة' : 'رفع الصور يتطلب إنترنت'}
            </span>
            {isOnline && <span className="text-xs text-slate-400">JPG, PNG, WEBP</span>}
          </button>
        )}
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={handleImageChange}
        />
      </div>

      {/* Prices */}
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="form-label">سعر الجملة <span className="text-red-500">*</span></label>
          <input
            type="number"
            value={wholesalePrice}
            onChange={e => setWholesalePrice(e.target.value)}
            placeholder="0"
            min="0"
            step="any"
            className="input-field"
            disabled={loading}
          />
        </div>
        <div>
          <label className="form-label">سعر البيع <span className="text-red-500">*</span></label>
          <input
            type="number"
            value={sellingPrice}
            onChange={e => setSellingPrice(e.target.value)}
            placeholder="0"
            min="0"
            step="any"
            className="input-field"
            disabled={loading}
          />
        </div>
      </div>

      {/* Category */}
      <div>
        <label className="form-label">الفئة</label>
        <select
          value={categoryId}
          onChange={e => {
            if (e.target.value === '__new__') {
              setShowNewCategory(true)
              setCategoryId('')
            } else {
              setCategoryId(e.target.value)
              setShowNewCategory(false)
            }
          }}
          className="input-field"
          disabled={loading}
        >
          <option value="">— اختر فئة —</option>
          {categories.map(cat => (
            <option key={cat.id} value={cat.id}>{cat.name}</option>
          ))}
          <option value="__new__">+ إضافة فئة جديدة</option>
        </select>

        {showNewCategory && (
          <div className="flex gap-2 mt-2">
            <input
              type="text"
              value={newCategoryName}
              onChange={e => setNewCategoryName(e.target.value)}
              placeholder="اسم الفئة الجديدة"
              className="input-field"
              disabled={catLoading}
              onKeyDown={e => e.key === 'Enter' && (e.preventDefault(), handleAddCategory())}
            />
            <button
              type="button"
              onClick={handleAddCategory}
              disabled={catLoading || !newCategoryName.trim()}
              className="btn-primary whitespace-nowrap px-4"
            >
              {catLoading ? (
                <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
                </svg>
              ) : 'إضافة'}
            </button>
          </div>
        )}
      </div>

      {/* Error */}
      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg px-4 py-3 flex items-center gap-2">
          <svg className="w-4 h-4 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
              d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          {error}
        </div>
      )}

      {/* Actions */}
      <div className="flex gap-3 pt-2">
        <button type="submit" disabled={loading} className="btn-primary flex-1 flex items-center justify-center gap-2">
          {loading && (
            <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
            </svg>
          )}
          {loading ? 'جاري الحفظ...' : (initialData ? 'حفظ التعديلات' : 'إضافة المنتج')}
        </button>
        <button type="button" onClick={onCancel} disabled={loading} className="btn-ghost px-6">
          إلغاء
        </button>
      </div>
    </form>
  )
}
