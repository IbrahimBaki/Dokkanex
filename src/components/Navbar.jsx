import { NavLink } from 'react-router-dom'

export default function Navbar() {
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
            to="/"
            end
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
          <img src="/icons/logo-mark.png" alt="Dokanex" className="w-8 h-8 object-contain" />
          <span className="font-bold text-slate-800 text-lg">دكانيكس</span>
        </div>
      </div>
    </nav>
  )
}
