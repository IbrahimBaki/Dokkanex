# Test foundation

This foundation keeps current behavior tests separate from V2 specifications that cannot truthfully run until the V2 migration, Dexie upgrade, RPCs, and UI exist.

| Command | Purpose |
|---|---|
| `npm test` | Current unit tests in JSDOM with `fake-indexeddb`. |
| `npm run test:watch` | Watch-mode unit tests. |
| `npm run test:integration` | Local-Supabase integration suite. It currently contains only an explicit skipped V2 boundary specification. |
| `npm run test:e2e` | Playwright E2E suite; starts Vite unless an existing local server is available. |
| `npm run test:e2e:list` | Lists E2E tests without launching a browser. |
| `npm run validate` | Unit tests followed by the production Vite build. |

## Local Supabase rule

Future integration tests must target an isolated **local** Supabase stack only. They must never use a linked project, production URL, production credentials, or production data. Once Step 3B-B adds the V2 schema, this suite must cover migration recreation, RLS ownership, movement idempotency, explicit-zero initialization, decimal arithmetic, negative stock, retry behavior, per-user local isolation, Dexie upgrade, and image replacement safety.
