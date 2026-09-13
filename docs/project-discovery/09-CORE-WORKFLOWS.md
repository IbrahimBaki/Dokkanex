# Core workflows

## Sign in and initial synchronization

User submits `LoginPage` -> `AuthContext.signIn` -> Supabase password API -> auth listener stores `user` -> `SyncProvider` awaits `dbReady` -> if online, `fullSync(user.id)` -> push queued records, pull `categories` then `products` filtered by user -> pages observe `syncVersion` and reread Dexie. Offline login can only use a session already persisted by Supabase; no custom offline credential flow exists.

## Create/edit/delete product

User opens add/edit page -> `ProductForm` validates name/prices and optionally compresses image client-side -> `offlineOps.addProduct`/`updateProduct` writes Dexie and queues a product operation -> success returns to `/products` -> UI displays local result. On manual sync, login sync, or `online`, `syncManager.pushToSupabase` uploads any base64 image, strips local-only fields, then inserts/updates/deletes the row. Successful push removes its queue item; pull refreshes local data. Delete is immediate in local UI and confirms through `ConfirmDialog`.

Important behavior: a product image removal deletes its storage object immediately in `ProductForm`, before its queued database update. Thus an offline/failed subsequent sync can leave the remote product referring to a missing image.

## Category CRUD

`CategoriesPage` (or inline product form) trims a name -> `offlineOps` writes/deletes/updates Dexie and queues the operation -> page updates its local list -> later sync sends the mutation. No client check prevents duplicate category names or deleting a category used by products. The remote constraint and RLS behavior are unknown.

## Catalog browse/export

`ProductsPage` reads current-user local records and categories -> sorts products by `created_at` -> filters name/category in memory -> renders grid/list and 100-item pages. User selects filtered products -> `ExportModal` allows field selection -> `exportUtils` creates share text, canvas image, image download, or PDF using browser APIs. It does not call the backend.

## Administration

User navigates to `/admin/*` -> `AdminRoute` checks session app metadata -> admin page calls `adminOps` -> a browser-instantiated service-role client invokes Supabase Auth Admin or unscoped table APIs -> UI displays results or error. This workflow is architecturally unsafe because its secret/capability is client-delivered; see [risk 14](14-TECHNICAL-DEBT-AND-RISKS.md).

## Analytics

`DashboardPage` reads local products/categories after a sync-version change and computes totals, category counts, product margins, buckets, and top ten. "Total catalog value" is the sum of selling prices once per product; it is not inventory valuation and does not use quantities.
