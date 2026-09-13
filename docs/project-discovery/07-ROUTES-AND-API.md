# Routes and API surface

Routes are hash routes; a web URL uses `/#/products`, not a server route. There is no bespoke HTTP API/controller layer.

| Route | Guard/layout | Page and primary data consumer |
|---|---|---|
| `/` | `RootRoute` | Landing when anonymous; redirects users to products |
| `/login`, `/register` | `PublicRoute` | Password auth via `AuthContext` |
| `/products` | `PrivateLayout` | `ProductsPage`; IndexedDB read, local delete/outbox |
| `/add` | `PrivateLayout` | `AddProductPage`/`ProductForm`; local create/outbox |
| `/edit/:id` | `PrivateLayout` | `EditProductPage`/`ProductForm`; local update/outbox |
| `/categories` | `PrivateLayout` | `CategoriesPage`; local category CRUD/outbox |
| `/dashboard` | `PrivateLayout` | `DashboardPage`; local aggregate calculations |
| `/admin` | `AdminRoute`/`AdminLayout` | global stats through `adminOps` |
| `/admin/users` | `AdminRoute`/`AdminLayout` | list and ban/unban via Auth Admin API |
| `/admin/products` | `AdminRoute`/`AdminLayout` | up to 500 global product rows plus user lookup |

## Supabase API groups invoked by the client

| Group | Operations | Caller |
|---|---|---|
| Auth | get session, observe auth state, password signup/signin, signout | `AuthContext`; admin list/update users |
| `products` REST | select filtered `user_id`, insert, update by `id`, delete by `id`; admin global select/count | `syncManager`; `adminOps` |
| `categories` REST | select filtered `user_id`, insert, update by `id`, delete by `id`; admin count | `syncManager`; `adminOps` |
| Storage | upload/remove/get public URL in `product-images` | image/sync helpers |

Normal client mutations have no request DTO/schema; their payloads are local record objects (with `image_base64` and `_old_image_url` stripped before transmission). Responses are mostly Supabase error objects or side effects; no typed resources or pagination protocol is used. The only remote pagination is 1,000-row pull pages; the admin product list is capped at 500 and user listing at 1,000.
