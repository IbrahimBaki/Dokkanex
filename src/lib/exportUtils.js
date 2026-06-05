import { jsPDF } from 'jspdf'
import html2canvas from 'html2canvas'
import { timeAgo } from './timeAgo'

const FIELD_LABELS = {
  name: 'اسم المنتج',
  category: 'الفئة',
  selling_price: 'سعر البيع',
  wholesale_price: 'سعر الجملة',
  updated_at: 'آخر تعديل',
}

export { FIELD_LABELS }

export function buildShareText(products, fields, categoryMap) {
  const lines = products.map((p, i) => {
    const parts = []
    if (fields.includes('name')) parts.push(p.name)
    if (fields.includes('category') && categoryMap[p.category_id])
      parts.push(`الفئة: ${categoryMap[p.category_id].name}`)
    if (fields.includes('selling_price') && p.selling_price)
      parts.push(`سعر البيع: ${p.selling_price}`)
    if (fields.includes('wholesale_price') && p.wholesale_price)
      parts.push(`سعر الجملة: ${p.wholesale_price}`)
    if (fields.includes('updated_at'))
      parts.push(`آخر تعديل: ${timeAgo(p.updated_at || p.created_at)}`)
    return `${i + 1}. ${parts.join(' | ')}`
  })
  return `قائمة المنتجات (${products.length})\n\n${lines.join('\n')}`
}

// Returns a deterministic color from a palette based on a string key
function categoryColor(key) {
  const palette = [
    { bg: '#e0e7ff', text: '#4338ca' },
    { bg: '#fce7f3', text: '#9d174d' },
    { bg: '#d1fae5', text: '#065f46' },
    { bg: '#fef3c7', text: '#92400e' },
    { bg: '#dbeafe', text: '#1e40af' },
    { bg: '#f3e8ff', text: '#6b21a8' },
    { bg: '#ffedd5', text: '#9a3412' },
    { bg: '#ccfbf1', text: '#0f766e' },
  ]
  let hash = 0
  for (let i = 0; i < (key || '').length; i++) hash = (hash * 31 + key.charCodeAt(i)) & 0xffff
  return palette[hash % palette.length]
}

// Renders a hidden div to a canvas and triggers PNG download / share
export async function exportAsImage(products, fields, categoryMap) {
  const container = document.createElement('div')
  container.style.cssText = `
    position: fixed; top: -9999px; left: -9999px;
    width: 680px; background: #f8fafc;
    font-family: 'Segoe UI', Tahoma, Arial, sans-serif;
    direction: rtl; text-align: right;
  `

  // ── Header ──────────────────────────────────────────────────────────────
  const header = document.createElement('div')
  header.style.cssText = `
    background: linear-gradient(135deg, #4f46e5 0%, #7c3aed 100%);
    padding: 24px 28px 20px; border-radius: 0;
  `
  header.innerHTML = `
    <div style="display:flex;align-items:center;justify-content:space-between;">
      <div>
        <div style="font-size:26px;font-weight:800;color:#ffffff;letter-spacing:-0.5px;">
          Dokkan<span style="color:#fbbf24;">X</span>
        </div>
        <div style="font-size:13px;color:#c4b5fd;margin-top:4px;">قائمة المنتجات</div>
      </div>
      <div style="text-align:left;">
        <div style="background:rgba(255,255,255,0.15);border-radius:999px;padding:6px 16px;display:inline-block;">
          <span style="font-size:22px;font-weight:800;color:#fbbf24;">${products.length}</span>
          <span style="font-size:12px;color:#e0d9ff;margin-right:4px;">منتج</span>
        </div>
        <div style="font-size:11px;color:#a5b4fc;margin-top:6px;text-align:left;">
          ${new Date().toLocaleDateString('ar-EG', { year: 'numeric', month: 'long', day: 'numeric' })}
        </div>
      </div>
    </div>
  `
  container.appendChild(header)

  // ── Field header row ─────────────────────────────────────────────────────
  const colHeader = document.createElement('div')
  colHeader.style.cssText = `
    display:flex; align-items:center; gap:12px;
    padding:10px 20px; background:#eef2ff;
    border-bottom:1px solid #c7d2fe;
  `
  const showName = fields.includes('name')
  const showCat = fields.includes('category')
  const showSell = fields.includes('selling_price')
  const showWhole = fields.includes('wholesale_price')
  const showDate = fields.includes('updated_at')

  colHeader.innerHTML = `
    <div style="width:32px;flex-shrink:0;"></div>
    <div style="flex:1;font-size:11px;font-weight:700;color:#4f46e5;">${showName ? 'المنتج' : ''}</div>
    ${showSell || showWhole ? `<div style="width:110px;flex-shrink:0;font-size:11px;font-weight:700;color:#4f46e5;text-align:left;">السعر</div>` : ''}
  `
  container.appendChild(colHeader)

  // ── Product rows ─────────────────────────────────────────────────────────
  products.forEach((p, i) => {
    const row = document.createElement('div')
    const isEven = i % 2 === 0
    row.style.cssText = `
      display:flex; align-items:center; gap:12px;
      padding:12px 20px;
      background:${isEven ? '#ffffff' : '#f8fafc'};
      border-bottom:1px solid #f1f5f9;
    `

    // Index badge
    const num = document.createElement('div')
    num.style.cssText = `
      width:28px;height:28px;background:#4f46e5;border-radius:50%;
      display:flex;align-items:center;justify-content:center;
      font-size:12px;font-weight:800;color:#ffffff;flex-shrink:0;
    `
    num.textContent = i + 1
    row.appendChild(num)

    // Info column
    const info = document.createElement('div')
    info.style.cssText = 'flex:1;min-width:0;'

    if (showName) {
      const nameLine = document.createElement('div')
      nameLine.style.cssText = 'font-size:14px;font-weight:700;color:#1e293b;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;'
      nameLine.textContent = p.name
      info.appendChild(nameLine)
    }

    const metaParts = []
    if (showCat && categoryMap[p.category_id]) {
      const cat = categoryMap[p.category_id]
      const c = categoryColor(cat.name)
      metaParts.push(`<span style="background:${c.bg};color:${c.text};font-size:10px;font-weight:600;padding:2px 8px;border-radius:999px;">${cat.name}</span>`)
    }
    if (showDate) {
      metaParts.push(`<span style="color:#94a3b8;font-size:10px;">${timeAgo(p.updated_at || p.created_at)}</span>`)
    }
    if (metaParts.length) {
      const metaLine = document.createElement('div')
      metaLine.style.cssText = 'margin-top:4px;display:flex;gap:6px;flex-wrap:wrap;align-items:center;'
      metaLine.innerHTML = metaParts.join('')
      info.appendChild(metaLine)
    }

    row.appendChild(info)

    // Price column
    if (showSell || showWhole) {
      const prices = document.createElement('div')
      prices.style.cssText = 'width:110px;flex-shrink:0;text-align:left;'

      if (showSell && p.selling_price != null) {
        const sp = document.createElement('div')
        sp.style.cssText = 'font-size:16px;font-weight:800;color:#059669;'
        sp.innerHTML = `${p.selling_price} <span style="font-size:10px;font-weight:600;color:#34d399;">ج.م</span>`
        prices.appendChild(sp)
      }

      if (showWhole && p.wholesale_price != null) {
        const wp = document.createElement('div')
        wp.style.cssText = 'font-size:11px;color:#94a3b8;margin-top:2px;'
        wp.innerHTML = `جملة: <span style="font-weight:600;color:#64748b;">${p.wholesale_price}</span>`
        prices.appendChild(wp)
      }

      // Profit margin pill
      if (showSell && showWhole && p.selling_price && p.wholesale_price) {
        const margin = ((p.selling_price - p.wholesale_price) / p.selling_price * 100).toFixed(0)
        if (margin > 0) {
          const pill = document.createElement('div')
          pill.style.cssText = 'margin-top:4px;background:#dcfce7;color:#15803d;font-size:10px;font-weight:700;padding:1px 6px;border-radius:999px;display:inline-block;'
          pill.textContent = `${margin}% ربح`
          prices.appendChild(pill)
        }
      }

      row.appendChild(prices)
    }

    container.appendChild(row)
  })

  // ── Summary bar ──────────────────────────────────────────────────────────
  const hasAnyPrice = showSell || showWhole
  if (hasAnyPrice) {
    const totalSell = products.reduce((s, p) => s + (Number(p.selling_price) || 0), 0)
    const totalWhole = products.reduce((s, p) => s + (Number(p.wholesale_price) || 0), 0)
    const avgMargin = totalSell > 0 ? ((totalSell - totalWhole) / totalSell * 100).toFixed(1) : null

    const summary = document.createElement('div')
    summary.style.cssText = `
      background:#eef2ff; padding:14px 20px;
      display:flex; gap:0; border-top:2px solid #c7d2fe;
    `

    const stats = []
    stats.push({ label: 'عدد المنتجات', value: products.length, unit: 'منتج' })
    if (showSell) stats.push({ label: 'إجمالي سعر البيع', value: totalSell.toLocaleString('ar-EG'), unit: 'ج.م' })
    if (showWhole) stats.push({ label: 'إجمالي سعر الجملة', value: totalWhole.toLocaleString('ar-EG'), unit: 'ج.م' })
    if (avgMargin !== null) stats.push({ label: 'متوسط الهامش', value: `${avgMargin}%`, unit: '' })

    stats.forEach((s, idx) => {
      const cell = document.createElement('div')
      cell.style.cssText = `
        flex:1; text-align:center;
        ${idx < stats.length - 1 ? 'border-left:1px solid #c7d2fe;' : ''}
        padding: 0 8px;
      `
      cell.innerHTML = `
        <div style="font-size:15px;font-weight:800;color:#4f46e5;">${s.value} <span style="font-size:10px;font-weight:600;color:#818cf8;">${s.unit}</span></div>
        <div style="font-size:10px;color:#6366f1;margin-top:2px;">${s.label}</div>
      `
      summary.appendChild(cell)
    })

    container.appendChild(summary)
  }

  // ── Footer ───────────────────────────────────────────────────────────────
  const footer = document.createElement('div')
  footer.style.cssText = `
    padding:12px 20px; background:#1e1b4b;
    display:flex; align-items:center; justify-content:space-between;
  `
  footer.innerHTML = `
    <div style="font-size:13px;font-weight:700;color:#e0e7ff;">
      Dokkan<span style="color:#fbbf24;">X</span>
      <span style="font-size:10px;font-weight:400;color:#6366f1;margin-right:6px;">by Baghdadi Tech</span>
    </div>
    <div style="font-size:10px;color:#6366f1;">
      ${new Date().toLocaleDateString('ar-EG', { year: 'numeric', month: 'long', day: 'numeric' })}
    </div>
  `
  container.appendChild(footer)

  document.body.appendChild(container)

  try {
    const canvas = await html2canvas(container, { scale: 3, useCORS: true, backgroundColor: '#f8fafc' })
    return canvas
  } finally {
    document.body.removeChild(container)
  }
}

export async function downloadImage(products, fields, categoryMap) {
  const canvas = await exportAsImage(products, fields, categoryMap)
  const link = document.createElement('a')
  link.download = `dokkanx-products-${Date.now()}.png`
  link.href = canvas.toDataURL('image/png')
  link.click()
}

export async function shareAsImage(products, fields, categoryMap) {
  const canvas = await exportAsImage(products, fields, categoryMap)
  return new Promise((resolve, reject) => {
    canvas.toBlob(async (blob) => {
      if (!blob) return reject(new Error('failed to create blob'))
      const file = new File([blob], 'products.png', { type: 'image/png' })
      if (navigator.canShare?.({ files: [file] })) {
        try {
          await navigator.share({ files: [file], title: 'قائمة المنتجات' })
          resolve()
        } catch (e) {
          reject(e)
        }
      } else {
        // fallback: just download
        const link = document.createElement('a')
        link.download = `dokkanx-products-${Date.now()}.png`
        link.href = URL.createObjectURL(blob)
        link.click()
        resolve()
      }
    }, 'image/png')
  })
}

export async function exportAsPDF(products, fields, categoryMap) {
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' })

  const canvas = await exportAsImage(products, fields, categoryMap)
  const imgData = canvas.toDataURL('image/png')

  const margin = 15
  const pageWidth = doc.internal.pageSize.getWidth()
  const pageHeight = doc.internal.pageSize.getHeight()
  const imgWidth = pageWidth - margin * 2
  const imgHeight = (canvas.height * imgWidth) / canvas.width

  let y = margin
  let remaining = imgHeight
  while (remaining > 0) {
    const sliceHeight = Math.min(remaining, pageHeight - margin * 2)
    doc.addImage(imgData, 'PNG', margin, y, imgWidth, sliceHeight, '', 'FAST')
    remaining -= sliceHeight
    if (remaining > 0) { doc.addPage(); y = margin }
  }

  doc.save(`dokkanx-products-${Date.now()}.pdf`)
}

export async function shareAsText(products, fields, categoryMap) {
  const text = buildShareText(products, fields, categoryMap)
  if (navigator.share) {
    await navigator.share({ text, title: 'قائمة المنتجات' })
  } else {
    await navigator.clipboard.writeText(text)
  }
}
