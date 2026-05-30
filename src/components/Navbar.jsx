import { NavLink, useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { useSync } from '../context/SyncContext'
import logoNavbar from '/files/logo-navbar.svg'

export default function Navbar() {
  const { user, signOut } = useAuth()
  const navigate = useNavigate()
  const { syncing, pendingCount, lastSync, isOnline, handleSync } = useSync()

  async function handleLogout() {
    await signOut()
    navigate('/login')
  }

  return (
    <nav className="bg-white border-b border-slate-200 sticky top-0 z-40 shadow-sm">
      <div className="max-w-2xl mx-auto px-4 h-14 flex items-center justify-between">

        <div className="flex items-center gap-1">
          <NavLink
            to="/categories"
            className={({ isActive }) =>
              `px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                isActive
                  ? 'bg-indigo-50 text-indigo-600'
                  : 'text-slate-600 hover:bg-slate-100'
              }`
            }
          >
            الفئات
          </NavLink>
          <NavLink
            to="/products"
            className={({ isActive }) =>
              `px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                isActive
                  ? 'bg-indigo-50 text-indigo-600'
                  : 'text-slate-600 hover:bg-slate-100'
              }`
            }
          >
            المنتجات
          </NavLink>
          <NavLink
            to="/dashboard"
            className={({ isActive }) =>
              `px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                isActive
                  ? 'bg-indigo-50 text-indigo-600'
                  : 'text-slate-600 hover:bg-slate-100'
              }`
            }
          >
            التحليلات
          </NavLink>
        </div>

        <div className="flex items-center gap-2">

          {/* Online/Offline indicator */}
          <span
            className={`w-2 h-2 rounded-full shrink-0 ${isOnline ? 'bg-emerald-400' : 'bg-red-400'}`}
            title={isOnline ? 'متصل' : 'غير متصل'}
          />

          {/* Sync button */}
          <button
            onClick={handleSync}
            disabled={syncing || !isOnline}
            title={lastSync ? `آخر مزامنة: ${new Date(lastSync).toLocaleTimeString('ar-EG')}` : 'لم تتم مزامنة بعد'}
            className="relative flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs
              bg-blue-50 text-blue-700 hover:bg-blue-100
              disabled:opacity-50 disabled:cursor-not-allowed
              transition-all duration-200"
          >
            <svg
              className={`w-3.5 h-3.5 ${syncing ? 'animate-spin' : ''}`}
              fill="none" stroke="currentColor" viewBox="0 0 24 24"
            >
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
            </svg>
            {syncing ? 'مزامنة...' : 'مزامنة'}
            {pendingCount > 0 && !syncing && (
              <span className="absolute -top-1 -right-1 bg-red-500 text-white text-[10px] font-bold rounded-full w-4 h-4 flex items-center justify-center leading-none">
                {pendingCount > 9 ? '9+' : pendingCount}
              </span>
            )}
          </button>

          <img src={logoNavbar} alt="DokkanX" className="h-8 w-auto" />
          <div className="w-px h-5 bg-slate-200" />
          <span
            className="text-xs text-slate-400 max-w-[90px] truncate hidden sm:block"
            title={user?.email}
          >
            {user?.email}
          </span>
          <button
            onClick={handleLogout}
            className="p-1.5 rounded-lg text-slate-500 hover:bg-red-50 hover:text-red-600 transition-colors"
            title="تسجيل الخروج"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
            </svg>
          </button>
        </div>

      </div>
    </nav>
  )
}
