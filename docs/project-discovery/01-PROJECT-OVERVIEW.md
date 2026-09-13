# Project overview

## What it is

**Confirmed from implementation:** Dokanex/DokkanX is an Arabic-first, bilingual product-catalog manager. Each signed-in user maintains products, prices, images, and categories. It is an offline-first React PWA that can also be packaged as an Electron desktop application. A separate in-app superadmin area lists users and system-wide products and can ban users.

It is not a Laravel/PHP application despite `CLAUDE.md`; that file describes a shared parent Docker environment, not this checkout's application runtime.

## Stack

| Area | Current implementation |
|---|---|
| Language/runtime | JavaScript ESM, Node (CI uses 20) |
| UI | React 18.3.1, React DOM 18.3.1 |
| Build | Vite 5.4.21, `@vitejs/plugin-react` 4.7.0 |
| CSS | Tailwind CSS 3.4.19, PostCSS, Autoprefixer |
| Routing | React Router DOM 6.30.3, `HashRouter` |
| Backend/data/auth | Supabase JS 2.106.1: Auth, PostgREST, Storage |
| Local/offline database | Dexie 4.4.3 over IndexedDB |
| PWA | `vite-plugin-pwa` 0.20.5 / Workbox |
| Internationalization | i18next 26.3.1 / react-i18next 17.0.8 |
| Export | html2canvas, jsPDF, Web Share/Clipboard browser APIs |
| Desktop | Electron 33.4.11, electron-builder 25.1.8, electron-updater |

Versions above are resolved from `package-lock.json`/`npm ls`; `package.json` uses compatible version ranges.

## Main modules

- Product catalog: local CRUD, image compression, search/filter, grid/list display, pagination, selection and export.
- Category catalog: local CRUD, optional product association.
- Analytics dashboard: catalog counts, catalog selling-price sum, category distribution, and price-margin calculations.
- Authentication: email/password signup, login, session restoration, logout.
- Offline synchronization: a per-browser IndexedDB store plus queued Supabase mutations.
- Administration: stats, user listing/ban/unban, and global product list.
- Distribution: Vite PWA build; Electron packages for Linux, Windows, and macOS, with GitHub-release auto-update configuration.

The active V1 UI still has no conventional application server. Since the later pulled-schema evidence and V2 Step 3B foundation, the repository does contain a version-controlled Supabase baseline, an additive inventory migration, database RPCs/triggers, and local integration tests. These are database foundations, not yet active V1 UI workflows.
