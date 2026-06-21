# Intake: Superadmin Dashboard — User & System Management

**ID:** q-superadmin-dashboard
**Title:** Superadmin Dashboard for User and System Management
**Type:** Feature

---

## Description

DokkanX currently has no administrative layer. Every registered user has equal access and the system has no way to identify, restrict, or inspect users from a central view.

This story adds a **superadmin dashboard** — a separate, role-gated section of the app (under `/admin`) that gives one or more designated superadmins full visibility and control over the system:

- View all registered users with key stats (product count, registration date)
- Activate or deactivate user accounts (disable login without deleting data)
- Browse all products and categories across all users
- View system-level KPI cards (total users, active users, total products, total categories)

**Database:** Supabase (Postgres). User auth is managed by `supabase.auth`. Products and categories are in Supabase tables `products` and `categories` (each row has a `user_id` foreign key referencing `auth.users.id`).

**Superadmin identity:** A user is considered superadmin if their `app_metadata.role === 'superadmin'` (set once via Supabase SQL or Dashboard). This never touches the client-side anon key — the admin API calls use a separate Supabase client initialised with `VITE_SUPABASE_SERVICE_ROLE_KEY` (acceptable for an internal, employee-only tool; not a public-facing SaaS).

---

## Acceptance Criteria

1. **Route guard:** Navigating to `/admin` or any sub-route while not logged in redirects to `/login`. Navigating there as a regular user shows a "Not authorized" page. Only `app_metadata.role === 'superadmin'` passes through.
2. **Admin login:** The existing `/login` page is re-used; after login, if the user is superadmin they can navigate to `/admin`. No separate admin login UI is needed.
3. **Admin Overview page (`/admin`):**
   - Stat cards: Total Users, Active Users, Deactivated Users, Total Products, Total Categories.
   - Data is fetched live from Supabase using the service-role client.
4. **Users page (`/admin/users`):**
   - Table listing all users: email, registration date, product count, status (active / deactivated).
   - Search/filter by email.
   - Toggle button per row to activate or deactivate the user (`auth.admin.updateUserById` with `{ ban_duration: 'none' }` to activate, `{ ban_duration: '876000h' }` to deactivate).
   - Confirmation dialog before deactivating (re-use existing `ConfirmDialog` component from `src/components/ConfirmDialog.jsx`).
   - Superadmin's own account cannot be deactivated from the UI.
5. **Products page (`/admin/products`):**
   - Table listing all products across all users: product name, category, owner email, selling price, created date.
   - Search by product name.
   - Read-only view (no edit/delete in admin for v1).
6. **Admin Navbar:** Separate from the regular `Navbar`. Links: Overview, Users, Products. Shows superadmin email and a logout button.
7. **i18n:** All new strings added to both `src/i18n/en.json` and `src/i18n/ar.json` under an `"admin"` key namespace.
8. **No regression:** Existing user-facing routes (`/products`, `/dashboard`, etc.) are unaffected.

---

## Technical Hints

### Existing patterns to follow
- **Auth context:** `src/context/AuthContext.jsx` — `useAuth()` hook exposes `{ user, loading, signIn, signOut }`. The `user` object from Supabase contains `app_metadata`.
- **Route protection:** `src/components/PrivateLayout.jsx` and `src/components/PublicRoute.jsx` — model the new `AdminRoute` guard on these.
- **Router root:** `src/App.jsx` — uses `HashRouter` with `react-router-dom v6`. Add `/admin/*` routes here wrapping an `AdminLayout`.
- **Supabase client:** `src/lib/supabase.js` — exports `supabase` (anon key). Create a sibling `src/lib/adminSupabase.js` that exports `adminSupabase = createClient(url, serviceRoleKey)`.
- **Confirmation dialog:** `src/components/ConfirmDialog.jsx` — already exists, re-use as-is.
- **i18n:** `src/i18n/en.json` and `src/i18n/ar.json` — both have flat top-level namespace objects. Add `"admin": { ... }` key to each.
- **Styling:** Tailwind CSS with utility classes consistent with existing pages (bg-white, rounded-xl, border border-slate-200, text-slate-700, etc.).

### New files to create
| File | Purpose |
|------|---------|
| `src/lib/adminSupabase.js` | Supabase client with service role key; exports `adminSupabase` |
| `src/lib/adminOps.js` | Functions: `listAllUsers()`, `toggleUserBan()`, `listAllProducts()`, `getSystemStats()` |
| `src/components/AdminRoute.jsx` | Route guard: checks `user.app_metadata.role === 'superadmin'` |
| `src/components/AdminLayout.jsx` | Admin shell: AdminNavbar + `<Outlet />` |
| `src/components/AdminNavbar.jsx` | Top nav for admin area |
| `src/pages/admin/AdminOverviewPage.jsx` | Stat cards + system KPIs |
| `src/pages/admin/AdminUsersPage.jsx` | All users table with ban toggle |
| `src/pages/admin/AdminProductsPage.jsx` | All products table (read-only) |

### Supabase Admin API calls (all use service role key)
```js
// List all users
adminSupabase.auth.admin.listUsers({ page: 1, perPage: 1000 })

// Ban user
adminSupabase.auth.admin.updateUserById(userId, { ban_duration: '876000h' })

// Unban user
adminSupabase.auth.admin.updateUserById(userId, { ban_duration: 'none' })

// All products (cross-user) — join with auth.users via profiles or use user email from users list
adminSupabase.from('products').select('id, name, category_id, user_id, selling_price, created_at').order('created_at', { ascending: false })
```

### Env variable to add
```
VITE_SUPABASE_SERVICE_ROLE_KEY=<your_service_role_key>
```
This must be added to `.env` (already in `.gitignore`).

### Set superadmin role (one-time SQL in Supabase dashboard)
```sql
UPDATE auth.users
SET raw_app_meta_data = raw_app_meta_data || '{"role": "superadmin"}'
WHERE email = 'ibbaqi@gmail.com';
```

---

## Out of Scope (v1)

- Editing or deleting products/categories from the admin UI
- Managing categories from admin
- Granular permissions (multiple admin roles)
- Audit log / admin action history
- Admin-specific 2FA
- Email notifications to users when banned/unbanned
- Pagination beyond 1000 users (Supabase default limit)
