export function timeAgo(dateString) {
  if (!dateString) return ''
  const date = new Date(dateString)
  const now = new Date()
  const diff = now - date
  const minutes = Math.floor(diff / 60000)
  const hours = Math.floor(diff / 3600000)
  const days = Math.floor(diff / 86400000)

  if (minutes < 1) return 'الآن'
  if (minutes < 60) return `منذ ${minutes} دقيقة`
  if (hours < 24) return `اليوم الساعة ${date.toLocaleTimeString('ar-EG', { hour: '2-digit', minute: '2-digit' })}`
  if (days < 7) return `منذ ${days} ${days === 1 ? 'يوم' : 'أيام'}`
  return date.toLocaleDateString('ar-EG', { day: 'numeric', month: 'long', year: 'numeric' })
}
