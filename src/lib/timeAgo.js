export function timeAgo(dateString, lang = 'ar') {
  if (!dateString) return ''
  const date = new Date(dateString)
  const now = new Date()
  const diff = now - date
  const minutes = Math.floor(diff / 60000)
  const hours = Math.floor(diff / 3600000)
  const days = Math.floor(diff / 86400000)
  const locale = lang === 'ar' ? 'ar-EG' : 'en-US'
  const rtf = new Intl.RelativeTimeFormat(locale, { numeric: 'auto' })

  if (minutes < 1) return rtf.format(0, 'second')
  if (minutes < 60) return rtf.format(-minutes, 'minute')
  if (hours < 24) return date.toLocaleTimeString(locale, { hour: '2-digit', minute: '2-digit' })
  if (days < 7) return rtf.format(-days, 'day')
  return date.toLocaleDateString(locale, { day: 'numeric', month: 'long', year: 'numeric' })
}
