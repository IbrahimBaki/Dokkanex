# Testing and quality

## Current state

The original discovery found no tests. Step 3B-A/B now adds Vitest/JSDOM/fake-indexeddb unit coverage, a local PostgreSQL/Supabase integration suite, Playwright E2E scaffolding, and a development CI build/test workflow. The V2 local integration suite verifies migrations, RPC idempotency, stock-count conflict/retry, metadata versioning, RLS, archive, and balance rebuild; it must run only against local Supabase.

GitHub Actions retains the tag-only release workflow and now has a development CI workflow for dependency installation, unit tests, and the production build. Local-Supabase integration and browser E2E jobs remain intentionally outside cloud CI until a safe local-service CI arrangement is added.

## Highest-risk missing coverage

1. Authorization/RLS and privileged admin operations, including proof that a browser cannot obtain admin capabilities.
2. Offline queue ordering, duplicate mutations, failed image upload, retry and multi-user/same-browser behavior.
3. Remote/local deletion and category/product referential behavior.
4. Authentication/session expiry, signup confirmation and ban behavior.
5. Export output and browser capability fallbacks.
6. PWA offline reload/service-worker upgrade and packaged Electron launch/update behavior.

Before major extensions, add automated tests around extracted sync/data services and browser tests for protected workflows; integration tests require an isolated Supabase project or a faithfully configured local Supabase stack.
