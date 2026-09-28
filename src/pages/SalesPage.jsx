import { useEffect, useMemo, useState } from 'react'
import { useAuth } from '../context/AuthContext'
import { useSync } from '../context/SyncContext'
import { getProducts } from '../lib/offlineOps'
import { getUserInventoryBalanceMap, isInventoryInitialized } from '../lib/inventoryLocal'
import { formatQuantityForUnit, multiplyMoney, normalizeMoney, subtractQuantities } from '../lib/quantity'
import { recordSale } from '../lib/salesV2'
import { getShopProfile } from '../lib/shopProfile'
import { db } from '../lib/db'
import { recordSaleReturn } from '../lib/saleReturnsV2'
import { jsPDF } from 'jspdf'
import html2canvas from 'html2canvas'
import { supabase } from '../lib/supabase'

const money = (value) => new Intl.NumberFormat('ar-EG', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(Number(value || 0))

export default function SalesPage() {
  const { user } = useAuth()
  const { handleSync, refreshMeta, syncVersion } = useSync()
  const [products, setProducts] = useState([])
  const [balances, setBalances] = useState(new Map())
  const [invoices, setInvoices] = useState([])
  const [invoiceQuery, setInvoiceQuery] = useState('')
  const [query, setQuery] = useState('')
  const [lines, setLines] = useState([])
  const [customerName, setCustomerName] = useState('')
  const [customers, setCustomers] = useState([])
  const [customerPhone, setCustomerPhone] = useState('')
  const [notes, setNotes] = useState('')
  const [paymentMethod, setPaymentMethod] = useState('cash')
  const [notice, setNotice] = useState(null)
  const [saving, setSaving] = useState(false)
  const [savedInvoice, setSavedInvoice] = useState(null)
  const [returning, setReturning] = useState(false)
  const [returnQuantities, setReturnQuantities] = useState({})
  const [returnReason, setReturnReason] = useState('')
  const [invoiceReturns, setInvoiceReturns] = useState([])

  const reload = async () => {
    if (!user?.id) return
    const [nextProducts, nextBalances, nextInvoices] = await Promise.all([getProducts(user.id), getUserInventoryBalanceMap(user.id), db.v2_sale_documents.where('user_id').equals(user.id).toArray()])
    setProducts(nextProducts.filter((p) => !p.archived_at))
    setBalances(nextBalances)
    setInvoices(nextInvoices.sort((a, b) => new Date(b.sold_at) - new Date(a.sold_at)))
  }
  useEffect(() => { reload() }, [user?.id, syncVersion]) // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { if (!user?.id) return; supabase.from('customers').select('id,name,phone').eq('user_id', user.id).is('deleted_at', null).order('name').then(({ data }) => setCustomers(data || [])) }, [user?.id, syncVersion])

  const available = useMemo(() => { const term = query.trim().toLocaleLowerCase(); return products.filter((product) => product.name.toLocaleLowerCase().includes(term) || String(product.sku || '').toLocaleLowerCase().includes(term)) }, [products, query])
  const subtotal = useMemo(() => lines.reduce((sum, line) => Number(sum) + Number(multiplyMoney(line.quantity || '0', line.unitPrice || '0')), 0), [lines])
  const discount = useMemo(() => lines.reduce((sum, line) => Number(sum) + Number(line.discountAmount || 0), 0), [lines])
  const total = subtotal - discount
  const visibleInvoices = useMemo(() => { const q = invoiceQuery.trim().toLocaleLowerCase(); return !q ? invoices : invoices.filter((invoice) => [invoice.invoice_number, invoice.customer_name, invoice.payment_method].some((value) => String(value || '').toLocaleLowerCase().includes(q))) }, [invoices, invoiceQuery])

  function addLine(product) {
    const balance = balances.get(product.id)
    if (!isInventoryInitialized(balance)) return setNotice({ type: 'error', text: `لا يمكن بيع «${product.name}» قبل تحديد كمية المخزون.` })
    if (lines.some((line) => line.productId === product.id)) return
    setLines((current) => [...current, { productId: product.id, name: product.name, unit: product.unit || 'piece', quantity: '1', unitPrice: String(product.selling_price ?? 0), discountAmount: '0', currentQuantity: balance.current_quantity }])
  }

  function updateLine(id, patch) { setLines((current) => current.map((line) => line.productId === id ? { ...line, ...patch } : line)) }

  async function openInvoice(document) {
    const invoiceLines = await db.v2_sale_lines.where('sale_id').equals(document.id).toArray()
    const returns = await db.v2_sale_return_documents.where('sale_id').equals(document.id).toArray()
    setSavedInvoice({ ...document, lines: invoiceLines, profile: document.profile_snapshot || {} }); setInvoiceReturns(returns.sort((a, b) => new Date(b.returned_at) - new Date(a.returned_at))); setReturning(false); setReturnQuantities({}); setReturnReason('')
  }

  async function submitReturn() {
    const linesToReturn = savedInvoice.lines.filter((line) => Number(returnQuantities[line.id] || 0) > 0).map((line) => ({ saleLineId: line.id, quantity: returnQuantities[line.id] }))
    if (!linesToReturn.length) return setNotice({ type: 'error', text: 'أدخل كمية مرتجعة واحدة على الأقل.' })
    try { await recordSaleReturn({ userId: user.id, saleId: savedInvoice.id, reason: returnReason, lines: linesToReturn }); setNotice({ type: 'success', text: 'تم حفظ المرتجع وإعادة الكمية للمخزون.' }); setReturning(false); await openInvoice(savedInvoice); await reload(); await refreshMeta(); if (navigator.onLine) handleSync() }
    catch (error) { setNotice({ type: 'error', text: error.message || 'تعذر حفظ المرتجع.' }) }
  }

  async function exportInvoice(kind) {
    const element = document.querySelector('.invoice-print')
    if (!element || !savedInvoice) return
    const canvas = await html2canvas(element, { scale: 2, backgroundColor: '#ffffff', useCORS: true })
    const name = `dokkanx-invoice-${savedInvoice.invoice_number}`
    if (kind === 'image') { const link = document.createElement('a'); link.download = `${name}.png`; link.href = canvas.toDataURL('image/png'); link.click(); return }
    const pdf = new jsPDF({ orientation: canvas.width > canvas.height ? 'landscape' : 'portrait', unit: 'mm', format: 'a4' })
    const width = pdf.internal.pageSize.getWidth() - 20, height = canvas.height * width / canvas.width
    pdf.addImage(canvas.toDataURL('image/png'), 'PNG', 10, 10, width, height); pdf.save(`${name}.pdf`)
  }

  async function submit(allowNegative = false, confirmedBeforeQuantities = {}) {
    if (!lines.length) return setNotice({ type: 'error', text: 'أضف منتجًا واحدًا على الأقل للفاتورة.' })
    setSaving(true); setNotice(null)
    try {
      const profileSnapshot = await getShopProfile(user.id)
      const result = await recordSale({ userId: user.id, customerName, notes, paymentMethod, profileSnapshot, allowNegative, confirmedBeforeQuantities, lines }, undefined)
      if (result.status === 'negative_confirmation_required') {
        const names = result.affected.map((item) => products.find((p) => p.id === item.product_id)?.name ?? item.product_id).join('، ')
        const confirmation = Object.fromEntries(result.affected.map((item) => [item.product_id, item.before_quantity]))
        setNotice({ type: 'confirm', text: `سيصبح مخزون ${names} سالبًا. هل تريد تأكيد البيع؟`, confirmation })
        return
      }
      setSavedInvoice({ ...result.document, lines: result.lines, profile: profileSnapshot })
      setLines([]); setCustomerName(''); setNotes('')
      setNotice({ type: 'success', text: `تم حفظ الفاتورة ${result.document.invoice_number}. ستتزامن تلقائيًا عند الاتصال.` })
      await reload(); await refreshMeta(); if (navigator.onLine) handleSync()
    } catch (error) { setNotice({ type: 'error', text: error.message || 'تعذر حفظ الفاتورة.' }) }
    finally { setSaving(false) }
  }

  async function saveCustomer() {
    const name = customerName.trim(); if (!name) return setNotice({ type: 'error', text: 'اكتب اسم العميل أولًا.' })
    const existing = customers.find((customer) => customer.name.trim().toLocaleLowerCase() === name.toLocaleLowerCase())
    if (existing) return setNotice({ type: 'success', text: 'العميل محفوظ بالفعل.' })
    const { data, error } = await supabase.from('customers').insert({ user_id: user.id, name, phone: customerPhone.trim() || null }).select('id,name,phone').single()
    if (error) return setNotice({ type: 'error', text: error.message || 'تعذر حفظ العميل.' })
    setCustomers((current) => [...current, data].sort((a, b) => a.name.localeCompare(b.name))); setNotice({ type: 'success', text: 'تم حفظ العميل.' })
  }

  return <main className="page-container max-w-6xl">
    <div className="mb-6"><h1 className="page-title">فاتورة بيع جديدة</h1><p className="page-subtitle">يُخصم المخزون فور حفظ الفاتورة. لا يمكن بيع منتج لم يُحدَّد مخزونه بعد.</p></div>
    {notice && <div className={`mb-4 rounded-xl border px-4 py-3 text-sm ${notice.type === 'error' ? 'border-red-200 bg-red-50 text-red-700' : notice.type === 'confirm' ? 'border-amber-200 bg-amber-50 text-amber-800' : 'border-emerald-200 bg-emerald-50 text-emerald-700'}`}><p>{notice.text}</p>{notice.type === 'confirm' && <div className="mt-3 flex gap-2"><button className="rounded-lg bg-amber-600 px-3 py-1.5 font-medium text-white" onClick={() => submit(true, notice.confirmation)}>تأكيد البيع</button><button className="rounded-lg border border-amber-300 px-3 py-1.5" onClick={() => setNotice(null)}>رجوع</button></div>}</div>}
    <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.35fr)]">
      <section className="card overflow-hidden"><div className="border-b bg-slate-50 px-4 py-3"><label className="block text-sm font-bold text-slate-800">أضف منتجًا</label><p className="mt-0.5 text-xs text-slate-500">ابحث بالاسم أو الباركود ثم أضفه للسلة.</p></div><div className="p-4"><input className="input-field mb-3" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="ابحث بالاسم أو الباركود…" />
        <div className="max-h-[480px] space-y-2 overflow-auto pr-1">{available.map((product) => { const balance = balances.get(product.id); const initialized = isInventoryInitialized(balance); return <button disabled={!initialized || lines.some((line) => line.productId === product.id)} onClick={() => addLine(product)} key={product.id} className="flex w-full items-center justify-between rounded-xl border border-slate-200 px-3 py-2.5 text-right transition-colors hover:border-indigo-300 hover:bg-indigo-50/40 disabled:cursor-not-allowed disabled:opacity-50"><span className="min-w-0"><b className="block truncate text-sm text-slate-800">{product.name}</b><small className="text-slate-500">{initialized ? `المتاح: ${formatQuantityForUnit(balance.current_quantity, product.unit || 'piece')}` : 'المخزون غير محدد'}</small></span><span className="shrink-0 rounded-lg bg-indigo-50 px-2 py-1 text-sm font-semibold text-indigo-700">+ إضافة</span></button> })}</div></div>
      </section>
      <section className="card overflow-hidden"><div className="border-b bg-slate-50 px-4 py-3"><h2 className="text-sm font-bold text-slate-800">تفاصيل الفاتورة</h2></div><div className="p-4"><div className="grid gap-3 sm:grid-cols-2"><div><input list="saved-customers" className="input-field" value={customerName} onChange={(e) => { setCustomerName(e.target.value); const match = customers.find((customer) => customer.name === e.target.value); if (match) setCustomerPhone(match.phone || '') }} placeholder="اسم العميل (اختياري)" /><datalist id="saved-customers">{customers.map((customer) => <option key={customer.id} value={customer.name}>{customer.phone || ''}</option>)}</datalist><div className="mt-2 flex gap-2"><input className="input-field py-1.5 text-sm" value={customerPhone} onChange={(e) => setCustomerPhone(e.target.value)} placeholder="هاتف العميل" /><button type="button" className="btn-ghost shrink-0 px-3 py-1 text-sm" onClick={saveCustomer}>حفظ العميل</button></div></div><select className="input-field" value={paymentMethod} onChange={(e) => setPaymentMethod(e.target.value)}><option value="cash">نقدي</option><option value="card">بطاقة</option><option value="transfer">تحويل</option></select></div>
        <div className="mt-4 space-y-3">{lines.length ? lines.map((line) => <div key={line.productId} className="rounded-xl bg-slate-50 p-3"><div className="flex justify-between gap-3"><b className="text-slate-800">{line.name}</b><button className="text-sm text-red-600" onClick={() => setLines((current) => current.filter((item) => item.productId !== line.productId))}>حذف</button></div><div className="mt-3 grid grid-cols-3 gap-2"><label className="text-xs text-slate-500">الكمية<input type="number" min="0" step={line.unit === 'piece' || line.unit === 'pack' || line.unit === 'box' ? '1' : '0.001'} className="input-field mt-1" value={line.quantity} onChange={(e) => updateLine(line.productId, { quantity: e.target.value })} /></label><label className="text-xs text-slate-500">سعر الوحدة<input type="number" min="0" step="0.01" className="input-field mt-1" value={line.unitPrice} onChange={(e) => updateLine(line.productId, { unitPrice: e.target.value })} /></label><label className="text-xs text-slate-500">خصم<input type="number" min="0" step="0.01" className="input-field mt-1" value={line.discountAmount} onChange={(e) => updateLine(line.productId, { discountAmount: e.target.value })} /></label></div><p className="mt-2 text-left text-sm font-semibold text-slate-700">{money(subtractQuantities(multiplyMoney(line.quantity || '0', line.unitPrice || '0'), line.discountAmount || '0'))} ج.م</p></div>) : <p className="py-12 text-center text-sm text-slate-400">اختر المنتجات لتكوين الفاتورة.</p>}</div>
        <textarea className="input-field mt-4 min-h-20" value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="ملاحظات على الفاتورة (اختياري)" /><div className="mt-4 rounded-xl bg-indigo-50 p-4 text-sm"><p className="flex justify-between text-slate-600"><span>الإجمالي قبل الخصم</span><b>{money(subtotal)} ج.م</b></p><p className="mt-2 flex justify-between text-slate-600"><span>الخصم</span><b>{money(discount)} ج.م</b></p><p className="mt-3 flex justify-between border-t border-indigo-100 pt-3 text-xl font-bold text-indigo-950"><span>الإجمالي</span><span>{money(total)} ج.م</span></p></div><button disabled={saving || !lines.length} onClick={() => submit()} className="btn-primary mt-5 w-full py-3 disabled:opacity-50">{saving ? 'جارٍ الحفظ…' : 'حفظ فاتورة البيع'}</button></div>
      </section>
    </div>
    <section className="card mt-6 overflow-hidden"><div className="border-b px-5 py-4"><h2 className="font-bold text-slate-900">الفواتير السابقة</h2><p className="mt-1 text-xs text-slate-500">تُعرض الفواتير المحفوظة على هذا الجهاز، ويمكن فتحها وطباعتها مرة أخرى.</p><input className="input-field mt-3" value={invoiceQuery} onChange={(e) => setInvoiceQuery(e.target.value)} placeholder="ابحث برقم الفاتورة أو اسم العميل أو طريقة الدفع…" /></div>{invoices.length === 0 ? <p className="px-5 py-10 text-center text-sm text-slate-400">لا توجد فواتير محفوظة بعد.</p> : visibleInvoices.length === 0 ? <p className="px-5 py-10 text-center text-sm text-slate-400">لا توجد نتائج مطابقة.</p> : <div className="divide-y">{visibleInvoices.map((invoice) => <button key={invoice.id} onClick={() => openInvoice(invoice)} className="flex w-full items-center justify-between gap-3 px-5 py-3 text-right hover:bg-slate-50"><span><b className="block text-sm text-slate-800">{invoice.invoice_number}</b><small className="text-slate-500">{new Date(invoice.sold_at).toLocaleString('ar-EG')}{invoice.customer_name ? ` · ${invoice.customer_name}` : ''}</small></span><span className="font-bold text-indigo-700">{money(invoice.total_amount)} ج.م</span></button>)}</div>}</section>
    {savedInvoice && <div className="fixed inset-0 z-50 overflow-auto bg-slate-950/45 p-4"><div className="mx-auto my-6 max-w-2xl rounded-2xl bg-white shadow-xl"><div className="no-print flex items-center justify-between border-b p-4"><b>معاينة الفاتورة</b><button className="text-slate-500" onClick={() => setSavedInvoice(null)}>إغلاق</button></div><article className="invoice-print p-8" dir="rtl"><header className="flex items-start justify-between border-b-2 border-indigo-600 pb-5"><div><h2 className="text-2xl font-bold text-indigo-700">{savedInvoice.profile.shop_name || 'DokkanX'}</h2><p className="mt-1 text-sm text-slate-600">{savedInvoice.profile.phone}</p><p className="text-sm text-slate-600">{savedInvoice.profile.address}</p></div>{savedInvoice.profile.logo_url ? <img className="h-14 max-w-32 object-contain" src={savedInvoice.profile.logo_url} alt="شعار المحل" /> : <img className="h-10" src="/files/logo-navbar.svg" alt="DokkanX" />}</header><div className="my-5 flex justify-between text-sm"><span>فاتورة: <b>{savedInvoice.invoice_number}</b></span><span>{new Date(savedInvoice.sold_at).toLocaleString('ar-EG')}</span></div><table className="w-full text-right text-sm"><thead className="border-y bg-slate-50 text-slate-600"><tr><th className="p-2">المنتج</th><th className="p-2">الكمية</th><th className="p-2">السعر</th><th className="p-2">الإجمالي</th></tr></thead><tbody>{savedInvoice.lines.map((line) => <tr key={line.id} className="border-b"><td className="p-2">{line.product_name_snapshot}</td><td className="p-2">{formatQuantityForUnit(line.quantity, line.unit_snapshot)}</td><td className="p-2">{money(line.unit_price)}</td><td className="p-2">{money(line.line_total)}</td></tr>)}</tbody></table><footer className="mt-8 border-t border-slate-200 pt-4 text-center text-xs text-slate-500">{savedInvoice.profile.return_policy && <p className="mb-1">{savedInvoice.profile.return_policy}</p>}{savedInvoice.profile.invoice_footer && <p className="mb-1">{savedInvoice.profile.invoice_footer}</p>}<p>صادر عبر <b className="text-indigo-700">DokkanX</b> · نظام إدارة المتاجر</p></footer>{invoiceReturns.length > 0 && <section className="no-print mt-6 border-t pt-4"><h3 className="font-bold text-slate-800">سجل المرتجعات</h3>{invoiceReturns.map((item) => <div key={item.id} className="mt-2 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-900"><b>مرتجع {money(item.total_amount)} ج.م</b><span className="mx-2">·</span>{new Date(item.returned_at).toLocaleString('ar-EG')}{item.reason && <span className="block mt-1">السبب: {item.reason}</span>}</div>)}</section>}</article>{returning && <div className="no-print border-t bg-amber-50 p-4"><b className="text-amber-900">تسجيل مرتجع</b>{savedInvoice.lines.map((line) => <label key={line.id} className="mt-2 flex items-center justify-between text-sm"><span>{line.product_name_snapshot}</span><input className="input-field w-24" type="number" min="0" max={line.quantity} step="0.001" value={returnQuantities[line.id] || ''} onChange={(e) => setReturnQuantities((q) => ({ ...q, [line.id]: e.target.value }))} /></label>)}<input className="input-field mt-3" placeholder="سبب المرتجع (اختياري)" value={returnReason} onChange={(e) => setReturnReason(e.target.value)} /><button className="btn-primary mt-3" onClick={submitReturn}>تأكيد المرتجع</button></div>}<div className="no-print flex justify-end gap-2 border-t p-4"><button className="btn-ghost" onClick={() => setReturning(!returning)}>{returning ? 'إلغاء المرتجع' : 'إرجاع منتجات'}</button><button className="btn-ghost" onClick={() => exportInvoice('image')}>صورة</button><button className="btn-ghost" onClick={() => exportInvoice('pdf')}>PDF</button><button className="btn-primary" onClick={() => window.print()}>طباعة الفاتورة</button></div></div></div>}
  </main>
}
