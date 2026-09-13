# Frontend architecture

`src/main.jsx` mounts `App` under `StrictMode`, loads `index.css`, and initializes i18n. `App` wraps routes in `AuthProvider` then `SyncProvider`; `OfflineNotice` is rendered outside the providers. `HashRouter` supports static/PWA and Electron file loading.

## Page/component map

| Area | Key implementation |
|---|---|
| Public | `LandingPage`, `LoginPage`, `RegisterPage` |
| Signed-in shell | `PrivateLayout`, `Navbar`, `OfflineNotice` |
| Catalog | `ProductsPage`, `ProductCard`, `ProductForm`, `SearchBar`, `CategoryFilter`, `ConfirmDialog` |
| Categories | `CategoriesPage` plus `ConfirmDialog` |
| Analytics | `DashboardPage` computes aggregates in-browser from Dexie records |
| Export | selection state in `ProductsPage`; `ExportModal`; `exportUtils` builds text/image/PDF |
| Admin | `AdminRoute`, `AdminLayout`, `AdminNavbar`, three `pages/admin/*` |

State is context (`user`, loading/auth actions; sync progress/count/last-sync/version/online) plus page-local React state. Persistent UI preferences are `localStorage` keys `lang` and `products-view`; data persistence is IndexedDB. There are no reducers, server-state library, URL query-state, toast library, component library, or frontend unit tests.

Forms use controlled inputs and manual checks. `ProductForm` enforces required name and numeric prices; categories require nonblank trimmed names. Error messages are inline. Modals are `ConfirmDialog`, `ExportModal`, and product detail overlay. Search/category filtering and 100-item pagination are all in-memory after the complete local list is read.

Tailwind is scanned from `index.html` and `src`; layout is responsive through utility classes. Arabic is the default, document direction/language switches in `src/i18n/index.js`, and English/Arabic dictionaries are in JSON. The mobile UI uses fixed add/export controls and bottom-sheet-style modals; desktop uses responsive grids/tables.
