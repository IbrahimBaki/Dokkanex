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

// Renders a hidden div to a canvas and triggers PNG download / share
export async function exportAsImage(products, fields, categoryMap, shopProfile = {}, options = {}) {
  const t = (k, opts) => i18n.t(k, opts)
  const lang = i18n.language
  const isRtl = lang === 'ar'
  const currency = t('imageExport.currency')
  const shopName = shopProfile.shop_name || 'DokkanX'
  const shopLogo = shopProfile.logo_url || '/files/logo-mark.svg'
  const contact = [shopProfile.phone, shopProfile.address].filter(Boolean).join(' · ')

  const container = document.createElement('div')
  container.style.cssText = `
    position: fixed; top: -9999px; left: -9999px;
    width: ${options.a4 ? '760px' : '680px'}; background: #f8fafc;
    font-family: 'Segoe UI', Tahoma, Arial, sans-serif;
    direction: ${isRtl ? 'rtl' : 'ltr'}; text-align: ${isRtl ? 'right' : 'left'};
  `

  // ── Header ──────────────────────────────────────────────────────────────
  const header = document.createElement('div')
  header.style.cssText = `
    background: linear-gradient(135deg, #4f46e5 0%, #7c3aed 100%);
    padding: 24px 28px 20px; border-radius: 0;
  `
  header.innerHTML = `
    <div style="display:flex;align-items:center;justify-content:space-between;">
      <div style="display:flex;align-items:center;gap:10px;min-width:0;">
        <img src="${shopLogo}" crossorigin="anonymous" style="width:38px;height:38px;border-radius:10px;object-fit:contain;background:#ffffff;" />
        <div style="min-width:0;"><div style="font-size:20px;font-weight:800;color:#ffffff;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${shopName}</div><div style="font-size:12px;color:#ddd6fe;margin-top:3px;">${t('imageExport.productList')}${contact ? ` · ${contact}` : ''}</div></div>
      </div>
      <div style="text-align:${isRtl ? 'left' : 'right'};">
        <div style="display:inline-block;">
          <span style="font-size:16px;font-weight:800;color:#fbbf24;">${products.length}</span>
          <span style="font-size:12px;color:#e0d9ff;margin-${isRtl ? 'right' : 'left'}:4px;">${t('imageExport.products')}</span>
        </div>
        <div style="font-size:11px;color:#a5b4fc;margin-top:6px;text-align:${isRtl ? 'left' : 'right'};">
          ${new Date().toLocaleDateString(isRtl ? 'ar-EG' : 'en-US', { year: 'numeric', month: 'long', day: 'numeric' })}
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
  const showName  = fields.includes('name')
  const showCat   = fields.includes('category')
  const showSell  = fields.includes('selling_price')
  const showWhole = fields.includes('wholesale_price')
  const showDate  = fields.includes('updated_at')

  colHeader.innerHTML = `
    <div style="flex:1;font-size:11px;font-weight:700;color:#4f46e5;">${showName ? t('imageExport.product') : ''}</div>
    ${showSell || showWhole ? `<div style="width:110px;flex-shrink:0;font-size:11px;font-weight:700;color:#4f46e5;text-align:${isRtl ? 'left' : 'right'};">${t('imageExport.price')}</div>` : ''}
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

    const info = document.createElement('div')
    info.style.cssText = 'flex:1;min-width:0;'

    if (showName) {
      const nameLine = document.createElement('div')
      nameLine.dir = isRtl ? 'rtl' : 'ltr'
      nameLine.style.cssText = 'font-size:14px;font-weight:700;color:#1e293b;line-height:20px;white-space:normal;overflow:visible;word-break:break-word;unicode-bidi:plaintext;'
      nameLine.textContent = p.name
      info.appendChild(nameLine)
    }

    const metaParts = []
    if (showCat && categoryMap[p.category_id]) {
      metaParts.push(t("shareText.category", { name: categoryMap[p.category_id].name }))
    }
    if (showDate) {
      metaParts.push(timeAgo(p.updated_at || p.created_at, lang))
    }
    if (metaParts.length) {
      const metaLine = document.createElement("div")
      metaLine.style.cssText = "margin-top:4px;font-size:11px;line-height:16px;color:#64748b;"
      metaLine.textContent = metaParts.join(" • ")
      info.appendChild(metaLine)
    }

    row.appendChild(info)

    if (showSell || showWhole) {
      const prices = document.createElement('div')
      prices.style.cssText = `width:110px;flex-shrink:0;text-align:${isRtl ? 'left' : 'right'};`

      if (showSell && p.selling_price != null) {
        const sp = document.createElement('div')
        sp.style.cssText = 'font-size:16px;font-weight:800;color:#059669;'
        sp.innerHTML = `${p.selling_price} <span style="font-size:10px;font-weight:600;color:#34d399;">${currency}</span>`
        prices.appendChild(sp)
      }

      if (showWhole && p.wholesale_price != null) {
        const wp = document.createElement('div')
        wp.style.cssText = 'font-size:11px;color:#94a3b8;margin-top:2px;'
        wp.innerHTML = `${t('imageExport.wholesale')}: <span style="font-weight:600;color:#64748b;">${p.wholesale_price}</span>`
        prices.appendChild(wp)
      }

      row.appendChild(prices)
    }

    container.appendChild(row)
  })

  // ── Footer ─────────────────────────────────────────────────────────────
  const footer = document.createElement('div')
  footer.style.cssText = `
    padding:12px 20px; background:#1e1b4b;
    display:flex; align-items:center; justify-content:space-between;
  `
  footer.innerHTML = `
    <div style="font-size:11px;font-weight:700;color:#e0e7ff;">صادر عبر <span style="color:#bef264;">DokkanX</span> · نظام إدارة المتاجر</div>
    <div style="font-size:10px;color:#6366f1;">
      ${new Date().toLocaleDateString(isRtl ? 'ar-EG' : 'en-US', { year: 'numeric', month: 'long', day: 'numeric' })}
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
          await navigator.share({ files: [file], title: i18n.t('imageExport.shareTitle') })
          resolve()
        } catch (e) {
          reject(e)
        }
      } else {
        const link = document.createElement('a')
        link.download = `dokkanx-products-${Date.now()}.png`
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

  // A short, slightly-tall image looks best when it fills the page height and
  // is centered horizontally. Very long lists still paginate at full width.
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
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' })
  const rowsPerPage = 12
  const groups = products.length ? Array.from({ length: Math.ceil(products.length / rowsPerPage) }, (_, index) => products.slice(index * rowsPerPage, (index + 1) * rowsPerPage)) : [[]]
  for (let index = 0; index < groups.length; index++) {
    const canvas = await exportAsImage(groups[index], fields, categoryMap, shopProfile, { a4: true, page: index + 1, pages: groups.length })
    if (index > 0) doc.addPage()
    const pageWidth = doc.internal.pageSize.getWidth(); const pageHeight = doc.internal.pageSize.getHeight(); const margin = 10
    const width = pageWidth - margin * 2; const height = (canvas.height * width) / canvas.width
    doc.addImage(canvas.toDataURL('image/png'), 'PNG', margin, margin, width, Math.min(height, pageHeight - margin * 2), '', 'FAST')
  }
  doc.save(`dokkanx-products-${Date.now()}.pdf`)
}

export async function shareAsText(products, fields, categoryMap) {
  const text = buildShareText(products, fields, categoryMap)
  if (navigator.share) {
    await navigator.share({ text, title: i18n.t('imageExport.shareTitle') })
  } else {
    await navigator.clipboard.writeText(text)
  }
}
