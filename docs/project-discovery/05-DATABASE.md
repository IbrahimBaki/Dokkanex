# Database discovery

## Evidence boundary

The current tree has no database migration, schema dump, seed, factory, or Supabase policy file. The remote PostgreSQL schema and RLS policy state therefore cannot be fully verified without Supabase project access. The following remote columns are confirmed by current client reads/writes, not by a schema artifact.

| Remote table | Confirmed columns used | Relationships / notes |
|---|---|---|
| `products` | `id`, `user_id`, `name`, `image_url`, `wholesale_price`, `selling_price`, `category_id`, `created_at`, `updated_at` | `user_id` is queried for ownership; `category_id` is treated as nullable. `id` is client UUID. |
| `categories` | `id`, `user_id`, `name`, `created_at` | Queried by `user_id`; update sends full local record. |
| Supabase Auth users | `id`, `email`, `created_at`, `banned_until`, `app_metadata` | Used by admin APIs; managed by Supabase Auth. |
| Storage bucket `product-images` | object path/public URL | Browser uploads JPEGs and obtains public URLs. |

```mermaid
erDiagram
  auth_users ||--o{ categories : user_id
  auth_users ||--o{ products : user_id
  categories o|--o{ products : category_id
```

## Local IndexedDB schema

`src/lib/db.js` declares Dexie database `DokkanexDB`. Version 2 is the active code schema:

| Store | Indexed fields / content |
|---|---|
| `products` | Primary `id`; indexes `name`, `category_id`, `user_id`, timestamps, `image_url`, `image_base64` |
| `categories` | Primary `id`; indexes `name`, `user_id`, `created_at` |
| `sync_queue` | Auto-increment `id`; table, operation, record id, data, timestamp |
| `app_meta` | Key/value metadata, currently `last_sync` |

No remote indexes, FK constraints, uniqueness constraints, trigger behavior, soft deletes, audit history, or RLS policies can be asserted from current files. Historical branch SQL is explicitly not used as current schema evidence.

## Schema consistency observations

- Local products have `image_base64`, a deliberately Dexie-only field stripped before remote writes.
- Category pull calls `db.categories.clear()` for every user sync, while products are merged. In a shared browser profile this can remove other users' cached categories.
- The client supplies `user_id`, IDs, and timestamps. Remote RLS/defaults/constraints must protect those fields; their actual presence is unverified.
