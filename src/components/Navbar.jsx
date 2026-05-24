import { NavLink, useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import logoMark from '/icons/logo-mark.png'

export default function Navbar() {
  const { user, signOut } = useAuth()
  const navigate = useNavigate()

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
        </div>

        <div className="flex items-center gap-2">
          <img src={logoMark} alt="Dokanex" className="w-8 h-8 object-contain" />
          <span className="font-bold text-slate-800 text-lg">دكانيكس</span>
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
