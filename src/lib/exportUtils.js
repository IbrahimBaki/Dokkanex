import { jsPDF } from 'jspdf'
import html2canvas from 'html2canvas'
import { timeAgo } from './timeAgo'
import i18n from '../i18n'

export function getFieldLabels() {
  const t = (k, opts) => i18n.t(k, opts)
  return {
    name:            t('export.fields.name'),
    category:        t('export.fields.category'),
    selling_price:   t('export.fields.selling_price'),
    wholesale_price: t('export.fields.wholesale_price'),
    updated_at:      t('export.fields.updated_at'),
  }
}

export function buildShareText(products, fields, categoryMap) {
  const t = (k, opts) => i18n.t(k, opts)
  const lang = i18n.language
  const lines = products.map((p, i) => {
    const parts = []
    if (fields.includes('name')) parts.push(p.name)
    if (fields.includes('category') && categoryMap[p.category_id])
      parts.push(t('shareText.category', { name: categoryMap[p.category_id].name }))
    if (fields.includes('selling_price') && p.selling_price != null)
      parts.push(t('shareText.sellingPrice', { price: p.selling_price }))
    if (fields.includes('wholesale_price') && p.wholesale_price != null)
      parts.push(t('shareText.wholesalePrice', { price: p.wholesale_price }))
    if (fields.includes('updated_at'))
      parts.push(t('shareText.lastEdited', { time: timeAgo(p.updated_at || p.created_at, lang) }))
    return `${i + 1}. ${parts.join(' | ')}`
  })
  return `${t('shareText.header', { count: products.length })}\n\n${lines.join('\n')}`
}

// Shared printable document renderer. Both invoices and quotations use the same
// document hierarchy: shop header, metadata, a conventional table, and DokkanX footer.
const escapeHtml = (value) => String(value ?? '').replace(/[&<>'"]/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[char]))

function selectedColumns(fields) {
  const labels = getFieldLabels()
  const columns = []
  if (fields.includes('name')) columns.push({ key: 'name', label: labels.name, width: '38%' })
  if (fields.includes('category')) columns.push({ key: 'category', label: labels.category, width: '20%' })
  if (fields.includes('selling_price')) columns.push({ key: 'selling_price', label: labels.selling_price, width: '15%' })
  if (fields.includes('wholesale_price')) columns.push({ key: 'wholesale_price', label: labels.wholesale_price, width: '15%' })
  if (fields.includes('updated_at')) columns.push({ key: 'updated_at', label: labels.updated_at, width: '16%' })
  return columns.length ? columns : [{ key: 'name', label: labels.name, width: '100%' }]
}

function waitForImages(element) {
  return Promise.all([...element.querySelectorAll('img')].map((image) => {
    if (image.complete) return Promise.resolve()
    return new Promise((resolve) => {
      image.addEventListener('load', resolve, { once: true })
      image.addEventListener('error', resolve, { once: true })
    })
  }))
}

// Renders the quotation as the same printable document structure used by invoices.
export async function exportAsImage(products, fields, categoryMap, shopProfile = {}) {
  const t = (k, opts) => i18n.t(k, opts)
  const lang = i18n.language
  const isRtl = lang === 'ar'
  const currency = t('imageExport.currency')
  const shopName = shopProfile.shop_name || 'DokkanX'
  const shopLogo = shopProfile.logo_url || '/files/logo-navbar.svg'
  const contact = [shopProfile.phone, shopProfile.address].filter(Boolean).join(' · ')
  const columns = selectedColumns(fields)

  const article = document.createElement('article')
  article.dir = isRtl ? 'rtl' : 'ltr'
  article.style.cssText = `
    position:fixed;top:-10000px;left:-10000px;width:1100px;box-sizing:border-box;
    padding:32px;background:#fff;color:#0f172a;font-family:'Segoe UI',Tahoma,Arial,sans-serif;
    direction:${isRtl ? 'rtl' : 'ltr'};text-align:${isRtl ? 'right' : 'left'};
  `

  const header = document.createElement('header')
  header.style.cssText = 'display:flex;align-items:flex-start;justify-content:space-between;gap:24px;border-bottom:2px solid #4f46e5;padding-bottom:20px;'
  header.innerHTML = `
    <div style="min-width:0;flex:1;">
      <h2 style="margin:0;color:#4338ca;font-size:24px;line-height:1.2;font-weight:700;">${escapeHtml(shopName)}</h2>
      ${shopProfile.phone ? `<p style="margin:4px 0 0;color:#475569;font-size:14px;line-height:1.5;">${escapeHtml(shopProfile.phone)}</p>` : ''}${shopProfile.address ? `<p style="margin:0;color:#475569;font-size:14px;line-height:1.5;">${escapeHtml(shopProfile.address)}</p>` : ''}
    </div>
    <img src="${escapeHtml(shopLogo)}" crossorigin="anonymous" alt="شعار المحل" style="height:56px;max-width:128px;object-fit:contain;" />
  `
  article.appendChild(header)

  const metadata = document.createElement('div')
  metadata.style.cssText = 'display:flex;align-items:center;justify-content:space-between;gap:20px;margin:20px 0;font-size:14px;color:#334155;'
  metadata.innerHTML = `
    <span>عرض سعر: <b style="color:#0f172a;">قائمة المنتجات والأسعار</b></span>
    <span>${new Date().toLocaleDateString(isRtl ? 'ar-EG' : 'en-US', { year: 'numeric', month: 'long', day: 'numeric' })}</span>
  `
  article.appendChild(metadata)

  const table = document.createElement('table')
  table.style.cssText = 'width:100%;border-collapse:collapse;table-layout:fixed;font-size:14px;text-align:inherit;'
  const thead = document.createElement('thead')
  const heading = document.createElement('tr')
  heading.style.cssText = 'background:#f8fafc;border-top:1px solid #cbd5e1;border-bottom:1px solid #cbd5e1;color:#475569;'
  columns.forEach((column) => {
    const cell = document.createElement('th')
    cell.textContent = column.label
    cell.style.cssText = `width:${column.width};padding:8px;vertical-align:middle;line-height:1.4;font-weight:700;`
    heading.appendChild(cell)
  })
  thead.appendChild(heading)
  table.appendChild(thead)

  const tbody = document.createElement('tbody')
  products.forEach((product) => {
    const row = document.createElement('tr')
    row.style.cssText = 'border-bottom:1px solid #e2e8f0;'
    columns.forEach((column) => {
      const cell = document.createElement('td')
      cell.style.cssText = 'padding:8px;vertical-align:middle;line-height:1.4;overflow-wrap:anywhere;unicode-bidi:plaintext;'
      if (column.key === 'name') {
        cell.textContent = product.name || '—'
        cell.style.fontWeight = '700'
      } else if (column.key === 'category') {
        cell.textContent = categoryMap[product.category_id]?.name || '—'
      } else if (column.key === 'selling_price' || column.key === 'wholesale_price') {
        const value = product[column.key]
        cell.textContent = value == null ? '—' : `${value} ${currency}`
        cell.style.color = column.key === 'selling_price' ? '#047857' : '#475569'
        cell.style.fontWeight = column.key === 'selling_price' ? '800' : '600'
      } else if (column.key === 'updated_at') {
        cell.textContent = timeAgo(product.updated_at || product.created_at, lang)
        cell.style.color = '#64748b'
      }
      row.appendChild(cell)
    })
    tbody.appendChild(row)
  })
  table.appendChild(tbody)
  article.appendChild(table)

  const footer = document.createElement('footer')
  footer.style.cssText = 'margin-top:32px;padding-top:16px;border-top:1px solid #e2e8f0;text-align:center;color:#64748b;font-size:12px;line-height:1.5;'
  footer.innerHTML = 'صادر عبر <b style="color:#4338ca;">DokkanX</b> · نظام إدارة المتاجر'
  article.appendChild(footer)

  document.body.appendChild(article)
  try {
    await Promise.all([waitForImages(article), document.fonts?.ready || Promise.resolve()])
    return await html2canvas(article, { scale: 2, useCORS: true, backgroundColor: '#ffffff', logging: false })
  } finally {
    article.remove()
  }
}

export async function downloadImage(products, fields, categoryMap, shopProfile = {}) {
  const canvas = await exportAsImage(products, fields, categoryMap, shopProfile)
  const link = document.createElement('a')
  link.download = `dokkanx-quotation-${Date.now()}.png`
  link.href = canvas.toDataURL('image/png')
  link.click()
}

export async function shareAsImage(products, fields, categoryMap, shopProfile = {}) {
  const canvas = await exportAsImage(products, fields, categoryMap, shopProfile)
  return new Promise((resolve, reject) => {
    canvas.toBlob(async (blob) => {
      if (!blob) return reject(new Error('failed to create blob'))
      const file = new File([blob], 'quotation.png', { type: 'image/png' })
      if (navigator.canShare?.({ files: [file] })) {
        try { await navigator.share({ files: [file], title: 'عرض سعر DokkanX' }); resolve() }
        catch (error) { reject(error) }
      } else {
        const link = document.createElement('a')
        link.download = `dokkanx-quotation-${Date.now()}.png`
        link.href = URL.createObjectURL(blob)
        link.click()
        resolve()
      }
    }, 'image/png')
  })
}

export function getPdfPageLayout(canvasWidth, canvasHeight, pageWidth, pageHeight, margin = 15) {
  const printableWidth = pageWidth - margin * 2
  const printableHeight = pageHeight - margin * 2
  const imageWidthAtFullPage = printableWidth
  const imageHeightAtFullPage = (canvasHeight * imageWidthAtFullPage) / canvasWidth

  if (imageHeightAtFullPage > printableHeight && imageHeightAtFullPage <= printableHeight * 1.35) {
    const imageHeight = printableHeight
    const imageWidth = (canvasWidth * imageHeight) / canvasHeight
    return [{
      x: margin + (printableWidth - imageWidth) / 2,
      y: margin,
      width: imageWidth,
      height: imageHeight,
    }]
  }

  const imageWidth = imageWidthAtFullPage
  const imageHeight = imageHeightAtFullPage
  if (imageHeight <= printableHeight) {
    return [{
      x: margin,
      y: margin + (printableHeight - imageHeight) / 2,
      width: imageWidth,
      height: imageHeight,
    }]
  }

  const pages = []
  for (let offset = 0; offset < imageHeight; offset += printableHeight) {
    pages.push({ x: margin, y: margin - offset, width: imageWidth, height: imageHeight })
  }
  return pages
}

export async function exportAsPDF(products, fields, categoryMap, shopProfile = {}) {
  // Six lines leave room for long Arabic product names while keeping every page
  // visually identical to a landscape invoice and avoiding any clipping.
  const rowsPerPage = 8
  const groups = products.length
    ? Array.from({ length: Math.ceil(products.length / rowsPerPage) }, (_, index) => products.slice(index * rowsPerPage, (index + 1) * rowsPerPage))
    : [[]]
  const pdf = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' })

  for (let index = 0; index < groups.length; index += 1) {
    const canvas = await exportAsImage(groups[index], fields, categoryMap, shopProfile)
    if (index) pdf.addPage('a4', 'landscape')
    const pageWidth = pdf.internal.pageSize.getWidth()
    const pageHeight = pdf.internal.pageSize.getHeight()
    const margin = 10
    const printableWidth = pageWidth - margin * 2
    const printableHeight = pageHeight - margin * 2
    const scale = Math.min(printableWidth / canvas.width, printableHeight / canvas.height)
    const width = canvas.width * scale
    const height = canvas.height * scale
    pdf.addImage(canvas.toDataURL('image/png'), 'PNG', (pageWidth - width) / 2, (pageHeight - height) / 2, width, height, undefined, 'FAST')
  }
  pdf.save(`dokkanx-quotation-${Date.now()}.pdf`)
}

export async function shareAsText(products, fields, categoryMap) {
  const text = buildShareText(products, fields, categoryMap)
  if (navigator.share) {
    await navigator.share({ text, title: i18n.t('imageExport.shareTitle') })
  } else {
    await navigator.clipboard.writeText(text)
  }
}
