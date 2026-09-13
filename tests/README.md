# Test foundation

This foundation keeps current behavior tests separate from V2 specifications that cannot truthfully run until the V2 migration, Dexie upgrade, RPCs, and UI exist.

| Command | Purpose |
|---|---|
| `npm test` | Current unit tests in JSDOM with `fake-indexeddb`. |
| `npm run test:watch` | Watch-mode unit tests. |
| `npm run test:integration` | Local-Supabase integration suite for the V2 migration, RPCs, RLS, metadata versioning, V1 compatibility, and balance rebuild. |
| `npm run test:e2e` | Playwright E2E suite; starts Vite unless an existing local server is available. |
| `npm run test:e2e:list` | Lists E2E tests without launching a browser. |
| `npm run validate` | Unit tests followed by the production Vite build. |

## Local Supabase rule

Integration tests target an isolated **local** Supabase stack only. They must never use a linked project, production URL, production credentials, or production data. The Step 3B-B suite covers the remote foundation through local PostgreSQL/authenticated-role tests; future Dexie upgrade, per-user local isolation, retry transport, and image replacement coverage remain pending the later client/offline work.
