import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useSync } from '../context/SyncContext'
import { addQuantities, compareQuantities, formatQuantityForUnit, normalizeQuantityForUnit, quantityInputStepForUnit, subtractQuantities } from '../lib/quantity'
import { addStock, getInventoryStatus, recordDamageLoss, recordStockCount, removeStock } from '../lib/inventoryLocal'

const ACTIONS = ['add', 'remove', 'count', 'damage']
export default function AdjustStockDialog({ product, currentBalance, userId, onAdjusted, onClose }) {
  const { t } = useTranslation(); const { handleSync, refreshMeta } = useSync()
  const [action, setAction] = useState('add'), [value, setValue] = useState(''), [warning, setWarning] = useState(null), [error, setError] = useState(''), [loading, setLoading] = useState(false)
  const unit = product.unit || 'piece'; const current = currentBalance.current_quantity
  let preview = null
  try { if (value.trim() !== '') { const n=normalizeQuantityForUnit(value, product.unit); preview = action==='add' ? addQuantities(current,n) : action==='count' ? n : subtractQuantities(current,n) } } catch {}
  async function submit(confirmed=false) {
    let n; try { n=normalizeQuantityForUnit(value, product.unit); if (compareQuantities(n,'0') < (action==='count'?0:1)) throw Error() } catch { setError(t('adjustStock.invalidQuantity')); return }
    setLoading(true); setError('')
    try {
      let result
      if(action==='add') result=await addStock({userId,productId:product.id,quantity:n})
      if(action==='remove') result=await removeStock({userId,productId:product.id,quantity:subtractQuantities('0',n),allowNegative:confirmed,confirmedBeforeQuantity:confirmed ? warning?.before_quantity : null})
      if(action==='damage') result=await recordDamageLoss({userId,productId:product.id,quantity:subtractQuantities('0',n),allowNegative:confirmed,confirmedBeforeQuantity:confirmed ? warning?.before_quantity : null})
      if(action==='count') result=await recordStockCount({userId,productId:product.id,countedQuantity:n})
      if(result.status==='negative_confirmation_required'){setWarning(result);return}
      if(result.status==='no_change'){setError(t('adjustStock.noChange'));return}
      await onAdjusted(result.balance); refreshMeta(); if(navigator.onLine) handleSync(); onClose()
    } catch(e){setError(e.message)} finally {setLoading(false)}
  }
  return <div className="fixed inset-0 z-50 bg-black/50 flex items-end sm:items-center justify-center p-0 sm:p-4" onClick={onClose}><div className="bg-white w-full sm:max-w-sm sm:rounded-2xl rounded-t-2xl p-5 space-y-4" onClick={e=>e.stopPropagation()}>
    <div><h2 className="text-lg font-bold">{t('adjustStock.title')}</h2><p className="text-sm text-slate-600">{product.name} · {t('adjustStock.current',{quantity:formatQuantityForUnit(current, product.unit),unit:t(`productForm.units.${unit}`)})}</p></div>
    <div className="grid grid-cols-2 gap-2">{ACTIONS.map(a=><button key={a} onClick={()=>{setAction(a);setWarning(null)}} className={`rounded-lg p-2 text-sm ${action===a?'bg-indigo-600 text-white':'bg-slate-100'}`}>{t(`adjustStock.actions.${a}`)}</button>)}</div>
    <input type="number" min="0" step={quantityInputStepForUnit(unit)} value={value} onChange={e=>{setValue(e.target.value);setWarning(null)}} className="input-field" placeholder={t('adjustStock.quantity')} />
    {preview!==null&&<p className="text-sm text-slate-600">{t('adjustStock.preview',{quantity:formatQuantityForUnit(preview, product.unit),unit:t(`productForm.units.${unit}`)})}</p>}
    {warning&&<div className="bg-amber-50 text-amber-800 rounded-lg p-3 text-sm"><p>{t('adjustStock.negativeWarning',{before:formatQuantityForUnit(warning.before_quantity, product.unit),after:formatQuantityForUnit(warning.after_quantity, product.unit),unit:t(`productForm.units.${unit}`)})}</p><button onClick={()=>submit(true)} className="btn-primary mt-2 w-full">{t('adjustStock.confirmNegative')}</button></div>}
    {error&&<p className="text-sm text-red-700">{error}</p>}<div className="flex gap-2"><button onClick={onClose} className="btn-ghost flex-1">{t('adjustStock.cancel')}</button><button onClick={()=>submit(false)} disabled={loading||!!warning} className="btn-primary flex-1">{t('adjustStock.confirm')}</button></div>
  </div></div>
}
