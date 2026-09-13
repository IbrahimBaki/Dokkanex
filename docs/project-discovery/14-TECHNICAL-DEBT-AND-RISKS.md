# Technical debt and risks

## Confirmed

| Class/severity | Finding and evidence |
|---|---|
| Security / critical | `src/lib/adminSupabase.js` uses `VITE_SUPABASE_SERVICE_ROLE_KEY`. Vite injects `VITE_*` values into the renderer, exposing a credential capable of bypassing RLS and calling Auth Admin APIs. `AdminRoute` is client-side only. Rotate the key and relocate admin operations server-side. |
| Security / critical | `README-BUILD.md` previously included real-looking credential values. It has been redacted in this documentation phase; assess Git history and rotate affected credentials. |
| Authorization / high | Current RLS, table GRANTs, storage policies, and schema are absent from version control. Normal update/delete requests filter only by `id`; enforcement is wholly remote and unverified. |
| Data integrity / high | Sync processes queued INSERT/UPDATE/DELETE independently with no coalescing, transaction, conflict/version policy, or user-facing failed-operation state. Last writer and partial failure behavior are undefined. |
| Data integrity / medium | Category pull clears all local categories, not only the active user's. Sync queue is also not user-scoped. Shared-browser account changes can corrupt/hide offline state. |
| Data integrity / medium | Image removal deletes remote storage immediately before the product update is synced; a later failure can leave a remote row with a broken URL. |
| Documentation mismatch / medium | README describes a simple unauthenticated realtime CRUD app and outdated tree/schema; current code is offline-first, authenticated, admin-capable, and has no Realtime subscription. |
| Quality / medium | No automated test, lint, type-check, or non-release CI exists. |
| Configuration / medium | Workbox runtime caching pins a specific Supabase host rather than deriving it from configuration; changing projects can make caching inconsistent. |
| Scalability / medium | Full per-user remote datasets are loaded into IndexedDB; pages filter/sort in memory. Admin user retrieval is limited to 1,000 and global products to 500 without paging UI. |
| Performance / low | The validated production build emits a 1.25 MB minified main JavaScript chunk (367.83 kB gzip) and Vite reports its default chunk-size warning; routes are not code-split. |

## Suspected / requires confirmation

| Class | Finding |
|---|---|
| Authorization | Remote RLS, table grants, bucket policy, and admin role-assignment process may be incomplete or inconsistent; they must be audited in Supabase. |
| Data integrity | Deleting a category with linked products may fail, null references, or leave stale category IDs depending on unknown FK constraints. |
| UX/reliability | Sync catches most errors silently and reports only a pending count; users may not know which mutation failed or why. |
| Maintainability | `uploadImage` is exported but not used by the current offline form path; `scripts/import_products.py` is not wired. Confirm whether they are retained intentionally. |

Historical ERP branches and deleted documents should not be revived accidentally: their schema changes are not tracked or exercised by current `master`.
