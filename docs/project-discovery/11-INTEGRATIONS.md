# External integrations

| Integration | Purpose/entry point | Configuration/failure/security |
|---|---|---|
| Supabase Auth | User/password sessions; admin user operations | `VITE_SUPABASE_URL`, anon key; remote provider settings unknown. Admin path must not use a browser service key. |
| Supabase Postgres/PostgREST | `products` and `categories` sync/admin reads | Same URL/keys; failures are largely swallowed by sync and retried only on a later sync. RLS/GRANT state is not versioned here. |
| Supabase Storage | Public product image objects | Bucket literal `product-images`; upload/remove errors are inconsistently surfaced. Public URLs mean access policy is security-sensitive. |
| Browser storage/PWA | IndexedDB outbox, localStorage preferences, persistent-storage request, Workbox cache | Browser quota/eviction and service-worker lifecycle apply; no telemetry/recovery UX. |
| Browser share/export | Web Share, Clipboard, canvas/image download, jsPDF | `exportUtils`; feature availability differs by browser and errors are mostly console-only. |
| Electron/GitHub Releases | Desktop host, packaged updater | `electron/main.cjs`; `electron-updater` checks GitHub only when packaged and fails silently. Tag CI publishes with `GITHUB_TOKEN`. |

No SMS, WhatsApp API, email sender, payment gateway, webhook receiver, analytics SDK, external search service, or AI service call exists. "WhatsApp" in export UI means generated share text, not a WhatsApp integration.
