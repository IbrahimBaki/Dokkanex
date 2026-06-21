import { useState, useEffect, useRef } from 'react'
import { useTranslation } from 'react-i18next'
import { deleteImage, supabase } from '../lib/supabase'
import { useSync } from '../context/SyncContext'
import { getCategories, addCategory, addProduct, updateProduct } from '../lib/offlineOps'
import { compressAndConvertToBase64 } from '../lib/imageUtils'

export default function ProductForm({ initialData, onSuccess, onCancel }) {
  const { t } = useTranslation()
  const { refreshMeta } = useSync()
  const [name, setName] = useState(initialData?.name || '')
  const [wholesalePrice, setWholesalePrice] = useState(initialData?.wholesale_price || '')
  const [sellingPrice, setSellingPrice] = useState(initialData?.selling_price || '')
  const [categoryId, setCategoryId] = useState(initialData?.category_id || '')
  const [categories, setCategories] = useState([])
  const [imageBase64, setImageBase64] = useState(null)
  const [imagePreview, setImagePreview] = useState(
    initialData?.image_base64 || initialData?.image_url || null
  )
  const [imageLoading, setImageLoading] = useState(false)
  const [newCategoryName, setNewCategoryName] = useState('')
  const [showNewCategory, setShowNewCategory] = useState(false)
  const [loading, setLoading] = useState(false)
  const [catLoading, setCatLoading] = useState(false)
  const [error, setError] = useState('')
  const fileInputRef = useRef(null)

  useEffect(() => {
    fetchCategories()
  }, [])

  async function fetchCategories() {
    const { data } = await supabase.auth.getSession()
    const userId = data.session?.user?.id
    if (!userId) return
    const cats = await getCategories(userId)
    setCategories(cats.sort((a, b) => a.name.localeCompare(b.name)))
  }

  async function handleImageChange(e) {
    const file = e.target.files[0]
    if (!file) return
    setImageLoading(true)
    setError('')
    try {
      const base64 = await compressAndConvertToBase64(file)
      setImageBase64(base64)
      setImagePreview(base64)
    } catch {
      setError(t('productForm.errors.imageError'))
    } finally {
      setImageLoading(false)
      if (fileInputRef.current) fileInputRef.current.value = ''
    }
  }

  function removeImage() {
    setImageBase64(null)
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
      setError(t('productForm.errors.categoryAdd', { error: e.message }))
    } finally {
      setCatLoading(false)
    }
  }

  async function handleSubmit(e) {
    e.preventDefault()
    setError('')

    if (!name.trim()) return setError(t('productForm.errors.nameRequired'))
    if (!wholesalePrice || isNaN(wholesalePrice)) return setError(t('productForm.errors.invalidWholesale'))
    if (!sellingPrice || isNaN(sellingPrice)) return setError(t('productForm.errors.invalidSelling'))

    setLoading(true)
    try {
      const payload = {
        name: name.trim(),
        wholesale_price: parseFloat(wholesalePrice),
        selling_price: parseFloat(sellingPrice),
        category_id: categoryId || null,
      }

      let result

      if (initialData?.id) {
        const hadImage = !!(initialData.image_url || initialData.image_base64)
        const imageRemoved = imagePreview === null && hadImage

        if (imageRemoved) {
          payload.image_url = null
          payload.image_base64 = null
          if (initialData.image_url) await deleteImage(initialData.image_url).catch(() => {})
          result = await updateProduct(initialData.id, payload, null)
        } else if (imageBase64) {
          result = await updateProduct(initialData.id, payload, imageBase64)
        } else {
          if (initialData.image_url) payload.image_url = initialData.image_url
          result = await updateProduct(initialData.id, payload, null)
        }
      } else {
        result = await addProduct(payload, imageBase64)
      }

      refreshMeta()
      onSuccess(result)
    } catch (e) {
      setError(t('productForm.errors.saveFailed', { error: e.message }))
    } finally {
      setLoading(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      {/* Product Name */}
      <div>
        <label className="form-label">{t('productForm.name')} <span className="text-red-500">*</span></label>
        <input
          type="text"
          value={name}
          onChange={e => setName(e.target.value)}
          placeholder={t('productForm.namePlaceholder')}
          className="input-field"
          disabled={loading}
        />
      </div>

      {/* Image Upload */}
      <div>
        <label className="form-label">{t('productForm.image')}</label>
        {imagePreview ? (
          <div className="relative w-full aspect-video rounded-xl overflow-hidden border border-slate-200 bg-slate-50">
            <img src={imagePreview} alt={t('productForm.imagePreviewAlt')} className="w-full h-full object-cover" />
            <button
              type="button"
              onClick={removeImage}
              disabled={loading}
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
            onClick={() => fileInputRef.current?.click()}
            disabled={loading || imageLoading}
            className="w-full border-2 border-dashed border-slate-300 rounded-xl py-8 flex flex-col items-center gap-2 hover:border-indigo-400 hover:bg-indigo-50 transition-colors text-slate-500"
          >
            {imageLoading ? (
              <>
                <svg className="w-8 h-8 animate-spin text-indigo-400" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
                </svg>
                <span className="text-sm font-medium text-indigo-500">{t('productForm.compressingImage')}</span>
              </>
            ) : (
              <>
                <svg className="w-8 h-8 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
                    d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                </svg>
                <span className="text-sm font-medium">{t('productForm.clickToSelectImage')}</span>
                <span className="text-xs text-slate-400">{t('productForm.worksOffline')}</span>
              </>
            )}
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
          <label className="form-label">{t('productForm.wholesalePrice')} <span className="text-red-500">*</span></label>
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
          <label className="form-label">{t('productForm.sellingPrice')} <span className="text-red-500">*</span></label>
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
        <label className="form-label">{t('productForm.category')}</label>
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
          <option value="">{t('productForm.selectCategory')}</option>
          {categories.map(cat => (
            <option key={cat.id} value={cat.id}>{cat.name}</option>
          ))}
          <option value="__new__">{t('productForm.addNewCategory')}</option>
        </select>

        {showNewCategory && (
          <div className="flex gap-2 mt-2">
            <input
              type="text"
              value={newCategoryName}
              onChange={e => setNewCategoryName(e.target.value)}
              placeholder={t('productForm.newCategoryName')}
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
              ) : t('productForm.add')}
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
        <button type="submit" disabled={loading || imageLoading} className="btn-primary flex-1 flex items-center justify-center gap-2">
          {loading && (
            <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
            </svg>
          )}
          {loading ? t('productForm.saving') : (initialData ? t('productForm.saveChanges') : t('productForm.addProduct'))}
        </button>
        <button type="button" onClick={onCancel} disabled={loading} className="btn-ghost px-6">
          {t('productForm.cancel')}
        </button>
      </div>
    </form>
  )
}
