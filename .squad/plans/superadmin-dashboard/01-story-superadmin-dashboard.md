# Plan: Superadmin Dashboard — User & System Management

**Intake:** `.squad/stories/q-superadmin-dashboard/intake.md`
**Sequence:** 01
**Estimated tasks:** 10

---

## Context

DokkanX is a React 18 + Vite + Tailwind + Supabase app (HashRouter, offline-first via Dexie). There is currently no admin layer — all authenticated users are equal. This plan adds a fully isolated `/admin/*` section protected by a superadmin role check (`user.app_metadata.role === 'superadmin'`). Admin API calls (list users, ban/unban) use a separate Supabase client initialised with the service role key from `VITE_SUPABASE_SERVICE_ROLE_KEY`.

---

## Pre-flight checklist (verify before implementing)

- [ ] `.env` file contains `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` (already used in `src/lib/supabase.js`)
- [ ] Add `VITE_SUPABASE_SERVICE_ROLE_KEY` to `.env` with your Supabase project's service role key
- [ ] Run the one-time SQL in Supabase dashboard to grant superadmin role:
  ```sql
  UPDATE auth.users
  SET raw_app_meta_data = raw_app_meta_data || '{"role": "superadmin"}'
  WHERE email = 'ibbaqi@gmail.com';
  ```
- [ ] Verify `products` table exists in Supabase (it does — synced from `syncManager.js`)

---

## Task 1 — Create `src/lib/adminSupabase.js`

Create a second Supabase client using the service role key. This client bypasses RLS and has admin API access.

**File:** `src/lib/adminSupabase.js`

```js
import { createClient } from '@supabase/supabase-js'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const serviceRoleKey = import.meta.env.VITE_SUPABASE_SERVICE_ROLE_KEY

export const adminSupabase = createClient(supabaseUrl, serviceRoleKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false
  }
})
```

---

## Task 2 — Create `src/lib/adminOps.js`

All admin data operations in one place. Uses `adminSupabase` for everything.

**File:** `src/lib/adminOps.js`

```js
import { adminSupabase } from './adminSupabase'

export async function listAllUsers() {
  const { data, error } = await adminSupabase.auth.admin.listUsers({ page: 1, perPage: 1000 })
  if (error) throw error
  return data.users
}

export async function banUser(userId) {
  const { error } = await adminSupabase.auth.admin.updateUserById(userId, {
    ban_duration: '876000h'
  })
  if (error) throw error
}

export async function unbanUser(userId) {
  const { error } = await adminSupabase.auth.admin.updateUserById(userId, {
    ban_duration: 'none'
  })
  if (error) throw error
}

export async function listAllProducts() {
  const { data, error } = await adminSupabase
    .from('products')
    .select('id, name, category_id, user_id, selling_price, created_at')
    .order('created_at', { ascending: false })
    .limit(500)
  if (error) throw error
  return data
}

export async function getSystemStats() {
  const { data: usersData, error: usersError } = await adminSupabase.auth.admin.listUsers({
    page: 1, perPage: 1000
  })
  if (usersError) throw usersError

  const { count: productCount, error: prodError } = await adminSupabase
    .from('products')
    .select('id', { count: 'exact', head: true })
  if (prodError) throw prodError

  const { count: categoryCount, error: catError } = await adminSupabase
    .from('categories')
    .select('id', { count: 'exact', head: true })
  if (catError) throw catError

  const users = usersData.users
  const activeUsers = users.filter(u => !u.banned_until || new Date(u.banned_until) < new Date()).length

  return {
    totalUsers: users.length,
    activeUsers,
    deactivatedUsers: users.length - activeUsers,
    totalProducts: productCount,
    totalCategories: categoryCount
  }
}
```

---

## Task 3 — Create `src/components/AdminRoute.jsx`

Route guard that replaces `PrivateLayout`'s role. Redirects to `/login` if not authenticated, shows "not authorized" if authenticated but not superadmin.

**File:** `src/components/AdminRoute.jsx`

```jsx
import { Navigate, Outlet } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'

export default function AdminRoute() {
  const { user, loading } = useAuth()

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <svg className="w-8 h-8 animate-spin text-indigo-500" fill="none" viewBox="0 0 24 24">
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
        </svg>
      </div>
    )
  }

  if (!user) return <Navigate to="/login" replace />

  if (user.app_metadata?.role !== 'superadmin') {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
        <div className="text-center">
          <p className="text-2xl font-bold text-slate-800 mb-2">403</p>
          <p className="text-slate-500">Not authorized</p>
        </div>
      </div>
    )
  }

  return <Outlet />
}
```

---

## Task 4 — Create `src/components/AdminNavbar.jsx`

Separate top nav for the admin area. Links: Overview, Users, Products. Shows logged-in email and logout.

**File:** `src/components/AdminNavbar.jsx`

```jsx
import { NavLink, useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { useAuth } from '../context/AuthContext'

export default function AdminNavbar() {
  const { t } = useTranslation()
  const { user, signOut } = useAuth()
  const navigate = useNavigate()

  async function handleLogout() {
    await signOut()
    navigate('/login')
  }

  const linkClass = ({ isActive }) =>
    `px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
      isActive ? 'bg-red-50 text-red-700' : 'text-slate-600 hover:bg-slate-100'
    }`

  return (
    <nav className="bg-white border-b border-slate-200 sticky top-0 z-40 shadow-sm">
      <div className="max-w-7xl mx-auto px-4 h-14 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-xs font-bold uppercase tracking-wide text-red-600 bg-red-50 px-2 py-0.5 rounded mr-2">
            {t('admin.badge')}
          </span>
          <NavLink to="/admin" end className={linkClass}>{t('admin.nav.overview')}</NavLink>
          <NavLink to="/admin/users" className={linkClass}>{t('admin.nav.users')}</NavLink>
          <NavLink to="/admin/products" className={linkClass}>{t('admin.nav.products')}</NavLink>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-xs text-slate-400 hidden sm:block">{user?.email}</span>
          <button
            onClick={handleLogout}
            className="p-1.5 rounded-lg text-slate-500 hover:bg-red-50 hover:text-red-600 transition-colors"
            title={t('nav.logout')}
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
```

---

## Task 5 — Create `src/components/AdminLayout.jsx`

Thin layout wrapper that renders `AdminNavbar` above the outlet.

**File:** `src/components/AdminLayout.jsx`

```jsx
import { Outlet } from 'react-router-dom'
import AdminNavbar from './AdminNavbar'

export default function AdminLayout() {
  return (
    <div className="min-h-screen bg-slate-50">
      <AdminNavbar />
      <main className="pb-16">
        <Outlet />
      </main>
    </div>
  )
}
```

---

## Task 6 — Create `src/pages/admin/AdminOverviewPage.jsx`

System KPI cards. Fetches `getSystemStats()` on mount.

**File:** `src/pages/admin/AdminOverviewPage.jsx`

```jsx
import { useState, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { getSystemStats } from '../../lib/adminOps'

function StatCard({ icon, label, value, valueClass = 'text-slate-800' }) {
  return (
    <div className="bg-white rounded-xl border border-slate-200 p-5 flex flex-col gap-1">
      <span className="text-2xl">{icon}</span>
      <span className={`text-2xl font-bold ${valueClass}`}>{value}</span>
      <span className="text-xs text-slate-500">{label}</span>
    </div>
  )
}

export default function AdminOverviewPage() {
  const { t } = useTranslation()
  const [stats, setStats] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    getSystemStats()
      .then(setStats)
      .catch(e => setError(e.message))
      .finally(() => setLoading(false))
  }, [])

  if (loading) return (
    <div className="flex justify-center py-20">
      <svg className="w-8 h-8 animate-spin text-indigo-500" fill="none" viewBox="0 0 24 24">
        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
      </svg>
    </div>
  )

  if (error) return (
    <div className="max-w-7xl mx-auto px-4 py-10 text-center text-red-600">{error}</div>
  )

  return (
    <div className="max-w-7xl mx-auto px-4 py-6 space-y-6">
      <h1 className="text-xl font-bold text-slate-800">{t('admin.overview.title')}</h1>
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5">
        <StatCard icon="👥" label={t('admin.overview.totalUsers')} value={stats.totalUsers} />
        <StatCard icon="✅" label={t('admin.overview.activeUsers')} value={stats.activeUsers} valueClass="text-emerald-600" />
        <StatCard icon="🚫" label={t('admin.overview.deactivatedUsers')} value={stats.deactivatedUsers} valueClass="text-red-600" />
        <StatCard icon="📦" label={t('admin.overview.totalProducts')} value={stats.totalProducts} />
        <StatCard icon="📁" label={t('admin.overview.totalCategories')} value={stats.totalCategories} />
      </div>
    </div>
  )
}
```

---

## Task 7 — Create `src/pages/admin/AdminUsersPage.jsx`

Users table with search, status badge, and ban/unban toggle. Re-uses `ConfirmDialog`.

**File:** `src/pages/admin/AdminUsersPage.jsx`

```jsx
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

      {confirm && (
        <ConfirmDialog
          title={confirm.action === 'ban' ? t('admin.users.deactivateTitle') : t('admin.users.activateTitle')}
          message={
            confirm.action === 'ban'
              ? t('admin.users.deactivateConfirm', { email: confirm.user.email })
              : t('admin.users.activateConfirm', { email: confirm.user.email })
          }
          onConfirm={handleToggle}
          onCancel={() => setConfirm(null)}
        />
      )}
    </div>
  )
}
```

---

## Task 8 — Create `src/pages/admin/AdminProductsPage.jsx`

Read-only table of all products across all users.

**File:** `src/pages/admin/AdminProductsPage.jsx`

```jsx
import { useState, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { listAllProducts, listAllUsers } from '../../lib/adminOps'

export default function AdminProductsPage() {
  const { t, i18n } = useTranslation()
  const [products, setProducts] = useState([])
  const [userMap, setUserMap] = useState({})
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [search, setSearch] = useState('')

  useEffect(() => {
    Promise.all([listAllProducts(), listAllUsers()])
      .then(([prods, users]) => {
        setProducts(prods)
        setUserMap(Object.fromEntries(users.map(u => [u.id, u.email])))
      })
      .catch(e => setError(e.message))
      .finally(() => setLoading(false))
  }, [])

  const locale = i18n.language === 'ar' ? 'ar-EG' : 'en-US'
  const filtered = products.filter(p =>
    p.name?.toLowerCase().includes(search.toLowerCase())
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
        <h1 className="text-xl font-bold text-slate-800">{t('admin.products.title')}</h1>
        <span className="text-sm text-slate-500">{filtered.length} {t('admin.products.count')}</span>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg px-4 py-3">{error}</div>
      )}

      <input
        type="text"
        value={search}
        onChange={e => setSearch(e.target.value)}
        placeholder={t('admin.products.searchPlaceholder')}
        className="w-full max-w-sm border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400"
      />

      <div className="bg-white rounded-xl border border-slate-200 overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-slate-100 text-slate-500 text-xs uppercase tracking-wide">
              <th className="px-4 py-3 text-start">{t('admin.products.colName')}</th>
              <th className="px-4 py-3 text-start">{t('admin.products.colOwner')}</th>
              <th className="px-4 py-3 text-start">{t('admin.products.colPrice')}</th>
              <th className="px-4 py-3 text-start">{t('admin.products.colDate')}</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map(p => (
              <tr key={p.id} className="border-b border-slate-50 hover:bg-slate-50">
                <td className="px-4 py-3 text-slate-700 font-medium">{p.name}</td>
                <td className="px-4 py-3 text-slate-400 text-xs" dir="ltr">
                  {userMap[p.user_id] || p.user_id}
                </td>
                <td className="px-4 py-3 text-slate-600" dir="ltr">
                  {p.selling_price ? p.selling_price.toLocaleString(locale) : '—'}
                </td>
                <td className="px-4 py-3 text-slate-400" dir="ltr">
                  {new Date(p.created_at).toLocaleDateString()}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
```

---

## Task 9 — Wire routes in `src/App.jsx`

Add the `/admin/*` route block after the existing `<Route element={<PrivateLayout />}>` block.

**File:** `src/App.jsx` — add these imports at the top:
```js
import AdminRoute from './components/AdminRoute'
import AdminLayout from './components/AdminLayout'
import AdminOverviewPage from './pages/admin/AdminOverviewPage'
import AdminUsersPage from './pages/admin/AdminUsersPage'
import AdminProductsPage from './pages/admin/AdminProductsPage'
```

**Inside `<Routes>`, after the closing `</Route>` of PrivateLayout:**
```jsx
<Route element={<AdminRoute />}>
  <Route element={<AdminLayout />}>
    <Route path="/admin" element={<AdminOverviewPage />} />
    <Route path="/admin/users" element={<AdminUsersPage />} />
    <Route path="/admin/products" element={<AdminProductsPage />} />
  </Route>
</Route>
```

---

## Task 10 — Add i18n strings

**`src/i18n/en.json`** — add at the end (before the closing `}`):
```json
"admin": {
  "badge": "Admin",
  "nav": {
    "overview": "Overview",
    "users": "Users",
    "products": "All Products"
  },
  "overview": {
    "title": "System Overview",
    "totalUsers": "Total Users",
    "activeUsers": "Active Users",
    "deactivatedUsers": "Deactivated Users",
    "totalProducts": "Total Products",
    "totalCategories": "Total Categories"
  },
  "users": {
    "title": "Users",
    "count": "users",
    "searchPlaceholder": "Search by email...",
    "colEmail": "Email",
    "colJoined": "Joined",
    "colStatus": "Status",
    "colActions": "Actions",
    "statusActive": "Active",
    "statusBanned": "Deactivated",
    "activate": "Activate",
    "deactivate": "Deactivate",
    "activateTitle": "Activate User",
    "deactivateTitle": "Deactivate User",
    "activateConfirm": "Activate account for {{email}}?",
    "deactivateConfirm": "Deactivate account for {{email}}? They will not be able to log in."
  },
  "products": {
    "title": "All Products",
    "count": "products",
    "searchPlaceholder": "Search by product name...",
    "colName": "Product",
    "colOwner": "Owner",
    "colPrice": "Selling Price",
    "colDate": "Created"
  }
}
```

**`src/i18n/ar.json`** — add the same block with Arabic values:
```json
"admin": {
  "badge": "مشرف",
  "nav": {
    "overview": "نظرة عامة",
    "users": "المستخدمون",
    "products": "كل المنتجات"
  },
  "overview": {
    "title": "نظرة عامة على النظام",
    "totalUsers": "إجمالي المستخدمين",
    "activeUsers": "المستخدمون النشطون",
    "deactivatedUsers": "الحسابات المعطّلة",
    "totalProducts": "إجمالي المنتجات",
    "totalCategories": "إجمالي الفئات"
  },
  "users": {
    "title": "المستخدمون",
    "count": "مستخدم",
    "searchPlaceholder": "ابحث بالبريد الإلكتروني...",
    "colEmail": "البريد الإلكتروني",
    "colJoined": "تاريخ الانضمام",
    "colStatus": "الحالة",
    "colActions": "الإجراءات",
    "statusActive": "نشط",
    "statusBanned": "معطّل",
    "activate": "تفعيل",
    "deactivate": "تعطيل",
    "activateTitle": "تفعيل الحساب",
    "deactivateTitle": "تعطيل الحساب",
    "activateConfirm": "هل تريد تفعيل حساب {{email}}؟",
    "deactivateConfirm": "هل تريد تعطيل حساب {{email}}؟ لن يتمكن من تسجيل الدخول."
  },
  "products": {
    "title": "كل المنتجات",
    "count": "منتج",
    "searchPlaceholder": "ابحث باسم المنتج...",
    "colName": "المنتج",
    "colOwner": "المالك",
    "colPrice": "سعر البيع",
    "colDate": "تاريخ الإنشاء"
  }
}
```

---

## Important implementation notes

1. **`ConfirmDialog` props** — inspect `src/components/ConfirmDialog.jsx` before Task 7 to verify the exact prop names (`title`, `message`, `onConfirm`, `onCancel`). Adjust if different.

2. **Service role key security** — this key is exposed in the Vite bundle. It is acceptable for an internal employee-only tool but must never be shipped to a public-facing app. Add a comment in `adminSupabase.js` noting this.

3. **Supabase `banned_until`** — the Supabase JS v2 `banned_until` field on users is a datetime string or `null`. A user is banned if `banned_until` is in the future. The `876000h` duration equals ~100 years (effectively permanent).

4. **`app_metadata` vs `user_metadata`** — `app_metadata` is only writeable by the service role, never by the user themselves. Always check `user.app_metadata.role`, not `user_metadata`.

5. **`listAllProducts` RLS** — the `products` table likely has RLS enabled with a policy like `user_id = auth.uid()`. Since `adminSupabase` uses the service role key, it bypasses RLS automatically. No policy changes needed.

6. **Directory creation** — create `src/pages/admin/` directory before writing the page files.

---

## File creation order (avoids import errors during dev)

1. `src/lib/adminSupabase.js`
2. `src/lib/adminOps.js`
3. `src/components/AdminRoute.jsx`
4. `src/components/AdminNavbar.jsx`
5. `src/components/AdminLayout.jsx`
6. `src/pages/admin/AdminOverviewPage.jsx`
7. `src/pages/admin/AdminUsersPage.jsx`
8. `src/pages/admin/AdminProductsPage.jsx`
9. `src/App.jsx` (add imports + routes)
10. `src/i18n/en.json` (append admin block)
11. `src/i18n/ar.json` (append admin block)
