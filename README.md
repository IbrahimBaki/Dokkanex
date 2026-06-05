# دكانيكس — Dokanex

Product management PWA built with React, Vite, Tailwind CSS, and Supabase.

## Features

- **Products** — grid view with image, wholesale price, selling price, and category badge
- **Real-time sync** — Supabase Realtime keeps the product list live across devices
- **Search & filter** — instant name search and category filter tabs
- **Add / Edit / Delete** — full CRUD with image upload to Supabase Storage
- **Categories** — separate page to add, rename, and delete categories
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

## Database Schema

```sql
-- Categories
create table categories (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  created_at timestamptz default now()
);

-- Products
create table products (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  image_url text,
  wholesale_price numeric not null,
  selling_price numeric not null,
  category_id uuid references categories(id) on delete set null,
  created_at timestamptz default now()
);
```

Storage bucket: `product-images` (public)

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
│   ├── CategoryFilter.jsx   # horizontal filter pills
│   ├── ConfirmDialog.jsx    # delete confirmation modal
│   ├── Navbar.jsx           # top navigation bar
│   ├── ProductCard.jsx      # product grid card
│   ├── ProductForm.jsx      # shared add/edit form
│   └── SearchBar.jsx        # real-time search input
├── pages/
│   ├── AddProductPage.jsx   # /add route
│   ├── CategoriesPage.jsx   # /categories route
│   ├── EditProductPage.jsx  # /edit/:id route
│   └── ProductsPage.jsx     # / route (main)
├── lib/
│   └── supabase.js          # Supabase client + image helpers
├── App.jsx                  # router setup
└── main.jsx                 # entry point
```

## License

MIT
