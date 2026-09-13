# Repository structure

| Path | Responsibility |
|---|---|
| `src/main.jsx` | React mount and global CSS/i18n bootstrap |
| `src/App.jsx` | Hash routes and provider/layout composition |
| `src/pages/` | Public, signed-in catalog, analytics, and admin pages |
| `src/components/` | Layouts, route guards, product UI, dialogs and controls |
| `src/context/` | `AuthContext` and `SyncContext` |
| `src/lib/` | Supabase clients, IndexedDB access, sync, images, export helpers |
| `src/i18n/` | Arabic/English dictionaries and direction/language switching |
| `src/index.css` | Tailwind layers and project utility/component styles |
| `public/` | Logos, icons and static assets |
| `electron/` | Main and preload processes |
| `scripts/` | Python icon/product-import utilities; not wired into npm scripts |
| `.github/workflows/release.yml` | Tag-triggered Electron build/publish matrix |
| `vite.config.js` | React and PWA configuration |
| `package.json`, `package-lock.json` | npm dependency/script source of truth |
| `dist/`, `dist-electron/` | Generated build artifacts present locally; ignored by Git |
| `AI/`, `.squad/` | Planning/support artifacts, not runtime code |

Entry points are `index.html` -> `src/main.jsx` -> `src/App.jsx` for web/PWA and `electron/main.cjs` for desktop. Electron loads Vite in development and `dist/index.html` from its packaged ASAR in production.

No monorepo/workspace manifest, Docker file, Compose file, server manifest, Supabase project directory, or current database migration is tracked in the current branch.
