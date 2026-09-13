# دكانيكس — Dokanex

Arabic-first, bilingual, offline-first product-catalog PWA/desktop app built with React, Vite, Tailwind CSS, IndexedDB, and Supabase.

For the implementation-validated architecture, data model, authorization caveats, and extension constraints, start at [the project-discovery index](docs/project-discovery/00-PROJECT-INDEX.md).

## Features

- **Products** — grid view with image, wholesale price, selling price, and category badge
- **Offline-first sync** — local IndexedDB changes are queued and pushed to Supabase when online
- **Search & filter** — instant name search and category filter tabs
- **Add / Edit / Delete** — full CRUD with image upload to Supabase Storage
- **Categories and analytics** — category CRUD plus catalog/margin dashboard
- **Export/share** — selected products can be shared as text/image or exported as PDF
- **Authentication and admin** — email/password accounts plus a superadmin UI (see security note in discovery docs)
- **PWA** — installable on Android/iOS, works offline via service worker
- **Arabic RTL** — full Arabic interface with right-to-left layout
- **Electron-ready** — HashRouter routing works in Electron without a server

## Tech Stack

| Layer | Technology |
|-------|-----------|
| UI | React 18 + Vite 5 |
| Styling | Tailwind CSS 3 |
| Backend | Supabase (PostgreSQL + Storage) |
| PWA | vite-plugin-pwa + Workbox |
| Routing | React Router 6 (HashRouter) |

## Data model

The current code accesses Supabase `products` and `categories` directly and uses IndexedDB as its working store. The repository currently does **not** contain a canonical remote schema migration or RLS policy file, so the SQL below is a legacy sketch rather than a deployable source of truth. See [database discovery](docs/project-discovery/05-DATABASE.md).

```sql
-- Categories
create table categories (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  name text not null,
  created_at timestamptz default now()
);

-- Products
create table products (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  name text not null,
  image_url text,
  wholesale_price numeric not null,
  selling_price numeric not null,
  category_id uuid references categories(id) on delete set null,
  created_at timestamptz default now()
);
```

Storage bucket used by the client: `product-images` (the deployed bucket policy must be reviewed separately).

## Getting Started

### 1. Clone & install

```bash
git clone git@github.com:IbrahimBaki/Dokkanex.git
cd Dokkanex
npm install
```

### 2. Configure environment

```bash
cp .env.example .env
```

Edit `.env` with your Supabase project credentials:

```
VITE_SUPABASE_URL=https://your-project-ref.supabase.co
VITE_SUPABASE_ANON_KEY=your-anon-key-here
```

### 3. Run dev server

```bash
npm run dev
```

App runs at `http://localhost:5173`

### 4. Build for production

```bash
npm run build
```

Output in `dist/`

## Deploy to Vercel

1. Push to GitHub
2. Import the repo on [vercel.com](https://vercel.com)
3. Vercel auto-detects Vite — no extra config needed
4. Add environment variables in **Settings → Environment Variables**:
   - `VITE_SUPABASE_URL`
   - `VITE_SUPABASE_ANON_KEY`
5. Deploy

> HashRouter means no `vercel.json` rewrites are needed — all routing is hash-based.

## PWA Install

Once deployed, open the URL in Chrome on Android → three-dot menu → **Add to Home Screen**. The app installs as a standalone app with no browser chrome.

## Project Structure

```
src/
├── components/
│   ├── ProductForm.jsx      # local-first add/edit form
│   ├── ProductCard.jsx      # grid/list/detail display
│   ├── *Route.jsx           # auth/admin route guards
│   └── *Layout.jsx          # signed-in/admin shells
├── context/
│   ├── AuthContext.jsx      # Supabase auth session
│   └── SyncContext.jsx      # offline-sync state
├── pages/
│   ├── admin/               # superadmin pages
│   ├── ProductsPage.jsx      # /products route
│   ├── CategoriesPage.jsx    # /categories route
│   └── DashboardPage.jsx     # /dashboard route
├── lib/
│   ├── db.js                # Dexie IndexedDB schema
│   ├── offlineOps.js        # local CRUD/outbox
│   ├── syncManager.js       # push/pull synchronization
│   └── supabase.js          # normal Supabase client/storage helpers
├── i18n/                    # Arabic/English translations
├── App.jsx                  # router setup
└── main.jsx                 # entry point
```

## License

MIT
