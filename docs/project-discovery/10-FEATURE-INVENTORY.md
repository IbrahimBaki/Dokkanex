# Feature inventory

| Feature | Implementation | Data/permission dependency | Status/tests |
|---|---|---|---|
| Email/password auth | `AuthContext`, login/register pages | Supabase Auth | Complete client path; untested |
| Per-user products | pages, `ProductForm`, `offlineOps`, sync | `products`, intended RLS | Complete local-first path; no tests |
| Product images | form compression, image/sync helpers | public `product-images` bucket | Partial: integrity/error edge cases; no tests |
| Categories | page/form, offline ops, sync | `categories`, intended RLS | Complete basic CRUD; no tests |
| Offline mode/sync | Dexie, SyncContext, syncManager, PWA | IndexedDB, browser online state, Supabase | Partial: no conflict resolution/retries UI/tests |
| Browse/search/filter/pagination | ProductsPage/components | local data | Complete (100 local rows/page); no tests |
| View preference | ProductsPage | `localStorage` | Complete |
| Export/share | ExportModal/exportUtils | Browser share/download/clipboard/canvas | Complete client functions; browser support varies; no tests |
| Dashboard | DashboardPage | local products/categories | Complete simple calculations; no tests |
| Arabic/English | i18n JSON/index | localStorage | Complete UI coverage as supplied; no tests |
| PWA install/cache | VitePWA config | service worker/browser | Configured; production behavior not exercised here |
| Electron packaging/updater | main/preload and npm build config | GitHub releases | Configured; untested here |
| Superadmin operations | route/admin pages/adminOps | app metadata + service role | Functionally implemented, security-blocked/unsafe |
| Realtime sync | README claim only | Supabase Realtime | Not implemented in current source |
| ERP (customers/invoices/etc.) | historical branch only | historical SQL | Legacy/not in current master |

`scripts/import_products.py` is possibly unused: no npm script or code path invokes it. The generated `dist*` directories are also non-source artifacts.
