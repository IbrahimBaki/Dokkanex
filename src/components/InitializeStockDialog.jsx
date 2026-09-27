import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useSync } from '../context/SyncContext'
import { db } from '../lib/db'
import { compareQuantities, normalizeQuantityForUnit, quantityInputStepForUnit } from '../lib/quantity'
import { initializeStock, isInventoryInitialized } from '../lib/inventoryLocal'

export default function InitializeStockDialog({ product, userId, onInitialized, onClose }) {
  const { t } = useTranslation()
  const { handleSync, refreshMeta } = useSync()
  const [quantity, setQuantity] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  async function confirm(event) {
    event.preventDefault()
    let normalized
    try {
      normalized = normalizeQuantityForUnit(quantity, product.unit)
      if (compareQuantities(normalized, '0') < 0) throw new Error('negative')
    } catch {
      setError(t('initializeStock.invalidQuantity'))
      return
    }
    setLoading(true)
    setError('')
    try {
      const current = await db.inventory_balances.get(product.id)
      if (current?.user_id !== undefined && current.user_id !== userId) throw new Error('ownership')
      if (isInventoryInitialized(current)) {
        setError(t('initializeStock.alreadyInitialized'))
        await onInitialized?.(current)
        return
      }
      const result = await initializeStock({ userId, productId: product.id, quantity: normalized })
      await onInitialized?.(result.balance)
      refreshMeta()
      if (navigator.onLine) handleSync()
      onClose()
    } catch (cause) {
      if (String(cause?.message).includes('already initialized')) {
        setError(t('initializeStock.alreadyInitialized'))
        return
      }
      setError(t('initializeStock.failed', { error: cause.message }))
    } finally {
      setLoading(false)
    }
  }

  const unit = product.unit || 'piece'
  return (
    <div className="fixed inset-0 z-50 bg-black/50 flex items-end sm:items-center justify-center p-0 sm:p-4" onClick={onClose}>
      <form className="bg-white w-full sm:max-w-sm sm:rounded-2xl rounded-t-2xl p-5 shadow-2xl space-y-4" onSubmit={confirm} onClick={event => event.stopPropagation()}>
        <div>
          <h2 className="text-lg font-bold text-slate-800">{t('initializeStock.title')}</h2>
          <p className="text-sm text-slate-500 mt-1">{t('initializeStock.startsTracking')}</p>
        </div>
        <div className="rounded-lg bg-slate-50 px-3 py-2">
          <p className="font-medium text-slate-800">{product.name}</p>
          <p className="text-sm text-slate-500">{t('initializeStock.unit')}: {t(`productForm.units.${unit}`)}</p>
        </div>
        <div>
          <label className="form-label">{t('initializeStock.quantity')}</label>
          <input autoFocus type="number" min="0" step={quantityInputStepForUnit(unit)} value={quantity} onChange={event => setQuantity(event.target.value)} className="input-field" disabled={loading} />
        </div>
        {error && <p className="text-sm text-red-700 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{error}</p>}
        <div className="flex gap-3 pt-1">
          <button type="button" className="btn-ghost flex-1" onClick={onClose} disabled={loading}>{t('initializeStock.cancel')}</button>
          <button type="submit" className="btn-primary flex-1" disabled={loading}>{loading ? t('initializeStock.saving') : t('initializeStock.confirm')}</button>
        </div>
      </form>
    </div>
  )
}
