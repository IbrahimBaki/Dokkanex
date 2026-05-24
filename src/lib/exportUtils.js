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

// Renders a hidden div to a canvas and triggers PNG download / share
export async function exportAsImage(products, fields, categoryMap) {
  const container = document.createElement('div')
  container.style.cssText = `
    position: fixed; top: -9999px; left: -9999px;
    width: 480px; background: #ffffff; padding: 24px;
    font-family: 'Segoe UI', Tahoma, Arial, sans-serif;
    direction: rtl; text-align: right;
  `

  // Header
  const header = document.createElement('div')
  header.style.cssText = 'margin-bottom:16px; padding-bottom:12px; border-bottom:2px solid #e2e8f0;'
  header.innerHTML = `
    <div style="font-size:18px;font-weight:700;color:#1e293b;">Dokkan<span style="color:#F59E0B">X</span></div>
    <div style="font-size:12px;color:#94a3b8;margin-top:2px;">قائمة المنتجات — ${products.length} منتج</div>
  `
  container.appendChild(header)

  // Rows
  products.forEach((p, i) => {
    const row = document.createElement('div')
    row.style.cssText = `
      display:flex; align-items:center; gap:12px; padding:10px 0;
      border-bottom:1px solid #f1f5f9;
    `
    const num = document.createElement('div')
    num.style.cssText = 'width:24px;height:24px;background:#eef2ff;border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:11px;font-weight:700;color:#4f46e5;flex-shrink:0;'
    num.textContent = i + 1
    row.appendChild(num)

    const info = document.createElement('div')
    info.style.cssText = 'flex:1;'
    const nameLine = document.createElement('div')
    nameLine.style.cssText = 'font-size:13px;font-weight:700;color:#1e293b;'
    nameLine.textContent = fields.includes('name') ? p.name : '—'
    info.appendChild(nameLine)

    const meta = []
    if (fields.includes('category') && categoryMap[p.category_id])
      meta.push(`<span style="background:#e0e7ff;color:#4338ca;font-size:10px;padding:1px 6px;border-radius:999px;">${categoryMap[p.category_id].name}</span>`)
    if (fields.includes('updated_at'))
      meta.push(`<span style="color:#94a3b8;font-size:10px;">${timeAgo(p.updated_at || p.created_at)}</span>`)
    if (meta.length) {
      const metaLine = document.createElement('div')
      metaLine.style.cssText = 'margin-top:3px;display:flex;gap:6px;flex-wrap:wrap;'
      metaLine.innerHTML = meta.join('')
      info.appendChild(metaLine)
    }

    row.appendChild(info)

    const prices = document.createElement('div')
    prices.style.cssText = 'text-align:left;flex-shrink:0;'
    if (fields.includes('selling_price') && p.selling_price) {
      const sp = document.createElement('div')
      sp.style.cssText = 'font-size:14px;font-weight:700;color:#059669;'
      sp.textContent = p.selling_price
      prices.appendChild(sp)
    }
    if (fields.includes('wholesale_price') && p.wholesale_price) {
      const wp = document.createElement('div')
      wp.style.cssText = 'font-size:11px;color:#64748b;margin-top:1px;'
      wp.textContent = p.wholesale_price
      prices.appendChild(wp)
    }
    row.appendChild(prices)
    container.appendChild(row)
  })

  // Footer
  const footer = document.createElement('div')
  footer.style.cssText = 'margin-top:16px;font-size:10px;color:#cbd5e1;text-align:center;'
  footer.textContent = `تصدير من DokkanX • ${new Date().toLocaleDateString('ar-EG')}`
  container.appendChild(footer)

  document.body.appendChild(container)

  try {
    const canvas = await html2canvas(container, { scale: 2, useCORS: true, backgroundColor: '#ffffff' })
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

  // jsPDF has no Arabic shaping built-in — use a canvas-based approach:
  // render the same div then embed as image in the PDF
  const canvas = await exportAsImage(products, fields, categoryMap)
  const imgData = canvas.toDataURL('image/png')

  const pageWidth = doc.internal.pageSize.getWidth()
  const pageHeight = doc.internal.pageSize.getHeight()
  const imgWidth = pageWidth - 20
  const imgHeight = (canvas.height * imgWidth) / canvas.width

  let y = 10
  let remaining = imgHeight
  while (remaining > 0) {
    const sliceHeight = Math.min(remaining, pageHeight - 20)
    doc.addImage(imgData, 'PNG', 10, y, imgWidth, sliceHeight, '', 'FAST')
    remaining -= sliceHeight
    if (remaining > 0) { doc.addPage(); y = 10 }
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
