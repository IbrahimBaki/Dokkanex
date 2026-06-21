import { useState, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { useAuth } from '../../context/AuthContext'
import { listAllUsers, banUser, unbanUser } from '../../lib/adminOps'
import ConfirmDialog from '../../components/ConfirmDialog'

function isUserBanned(user) {
  if (!user.banned_until) return false
  return new Date(user.banned_until) > new Date()
}

export default function AdminUsersPage() {
  const { t } = useTranslation()
  const { user: me } = useAuth()
  const [users, setUsers] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [search, setSearch] = useState('')
  const [confirm, setConfirm] = useState(null) // { user, action: 'ban'|'unban' }
  const [toggling, setToggling] = useState(null)

  useEffect(() => {
    listAllUsers()
      .then(setUsers)
      .catch(e => setError(e.message))
      .finally(() => setLoading(false))
  }, [])

  async function handleToggle() {
    if (!confirm) return
    const { user: target, action } = confirm
    setConfirm(null)
    setToggling(target.id)
    try {
      if (action === 'ban') await banUser(target.id)
      else await unbanUser(target.id)
      setUsers(prev => prev.map(u =>
        u.id === target.id
          ? { ...u, banned_until: action === 'ban' ? '9999-01-01T00:00:00Z' : null }
          : u
      ))
    } catch (e) {
      setError(e.message)
    } finally {
      setToggling(null)
    }
  }

  const filtered = users.filter(u =>
    u.email?.toLowerCase().includes(search.toLowerCase())
  )

  if (loading) return (
    <div className="flex justify-center py-20">
      <svg className="w-8 h-8 animate-spin text-indigo-500" fill="none" viewBox="0 0 24 24">
        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
      </svg>
    </div>
  )

  return (
    <div className="max-w-7xl mx-auto px-4 py-6 space-y-5">
      <div className="flex items-center justify-between gap-4">
        <h1 className="text-xl font-bold text-slate-800">{t('admin.users.title')}</h1>
        <span className="text-sm text-slate-500">{filtered.length} {t('admin.users.count')}</span>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg px-4 py-3">{error}</div>
      )}

      <input
        type="text"
        value={search}
        onChange={e => setSearch(e.target.value)}
        placeholder={t('admin.users.searchPlaceholder')}
        className="w-full max-w-sm border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400"
        dir="ltr"
      />

      <div className="bg-white rounded-xl border border-slate-200 overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-slate-100 text-slate-500 text-xs uppercase tracking-wide">
              <th className="px-4 py-3 text-start">{t('admin.users.colEmail')}</th>
              <th className="px-4 py-3 text-start">{t('admin.users.colJoined')}</th>
              <th className="px-4 py-3 text-start">{t('admin.users.colStatus')}</th>
              <th className="px-4 py-3 text-end">{t('admin.users.colActions')}</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map(u => {
              const banned = isUserBanned(u)
              const isMe = u.id === me?.id
              return (
                <tr key={u.id} className="border-b border-slate-50 hover:bg-slate-50">
                  <td className="px-4 py-3 text-slate-700 font-medium" dir="ltr">{u.email}</td>
                  <td className="px-4 py-3 text-slate-400" dir="ltr">
                    {new Date(u.created_at).toLocaleDateString()}
                  </td>
                  <td className="px-4 py-3">
                    <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-semibold ${
                      banned ? 'bg-red-50 text-red-600' : 'bg-emerald-50 text-emerald-700'
                    }`}>
                      {banned ? t('admin.users.statusBanned') : t('admin.users.statusActive')}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-end">
                    {!isMe && (
                      <button
                        disabled={toggling === u.id}
                        onClick={() => setConfirm({ user: u, action: banned ? 'unban' : 'ban' })}
                        className={`px-3 py-1 rounded-lg text-xs font-medium transition-colors disabled:opacity-50 ${
                          banned
                            ? 'bg-emerald-50 text-emerald-700 hover:bg-emerald-100'
                            : 'bg-red-50 text-red-700 hover:bg-red-100'
                        }`}
                      >
                        {toggling === u.id
                          ? '...'
                          : banned
                            ? t('admin.users.activate')
                            : t('admin.users.deactivate')}
                      </button>
                    )}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      <ConfirmDialog
        open={!!confirm}
        title={confirm?.action === 'ban' ? t('admin.users.deactivateTitle') : t('admin.users.activateTitle')}
        message={
          confirm?.action === 'ban'
            ? t('admin.users.deactivateConfirm', { email: confirm?.user.email })
            : t('admin.users.activateConfirm', { email: confirm?.user.email })
        }
        onConfirm={handleToggle}
        onCancel={() => setConfirm(null)}
      />
    </div>
  )
}
