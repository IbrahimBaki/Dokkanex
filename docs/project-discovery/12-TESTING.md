# Testing and quality

## Current state

No current unit, integration, browser/E2E, frontend-test, PHP test, test configuration, fixture, factory, seed, lint, formatter, static-analysis, or type-check script was found. `package.json` contains build/dev/preview/Electron scripts only. `npm ls --depth=0` resolves dependencies successfully.

GitHub Actions runs `npm install` then `npm run release` only for pushed `v*` tags; it does not run tests or a separate build validation job. There is no development CI trigger.

## Highest-risk missing coverage

1. Authorization/RLS and privileged admin operations, including proof that a browser cannot obtain admin capabilities.
2. Offline queue ordering, duplicate mutations, failed image upload, retry and multi-user/same-browser behavior.
3. Remote/local deletion and category/product referential behavior.
4. Authentication/session expiry, signup confirmation and ban behavior.
5. Export output and browser capability fallbacks.
6. PWA offline reload/service-worker upgrade and packaged Electron launch/update behavior.

Before major extensions, add automated tests around extracted sync/data services and browser tests for protected workflows; integration tests require an isolated Supabase project or a faithfully configured local Supabase stack.
