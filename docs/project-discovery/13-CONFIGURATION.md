# Configuration and deployment

## Environment variables

| Variable | Used by | Required |
|---|---|---|
| `VITE_SUPABASE_URL` | browser Supabase clients and PWA cache URL expectation | Yes |
| `VITE_SUPABASE_ANON_KEY` | normal browser Supabase client | Yes |
| `VITE_SUPABASE_SERVICE_ROLE_KEY` | current browser admin client | Presently required for admin UI but must be removed from client configuration; never publish it |

No `.env.example` exists. `.env` is ignored. Secret values must never be committed, documented, or placed under a `VITE_` prefix when they grant privileged access. Any service-role value already used by a frontend build should be rotated.

## Build and distribution

- `npm run dev`, `build`, `preview`: Vite.
- `npm run electron:dev`: concurrent Vite and Electron; `electron:start` waits for localhost:5173.
- `electron:build:linux`, `:win`, or generic `electron:build`: Vite build then electron-builder.
- `npm run release`: build and electron-builder publish to the configured GitHub repository. `.github/workflows/release.yml` runs it for Windows, Linux, and macOS when a `v*` tag is pushed.

Vite uses `base: './'`, PWA auto-update registration, static asset precache patterns, and a `NetworkFirst` runtime cache whose URL is hard-coded to one Supabase project. The manifest is RTL Arabic, standalone, portrait. Electron disables Node integration and enables context isolation; preload intentionally exposes no API.

There are no Docker/container, server deployment, database migration, queue, cache/session, broadcast, mail, scheduler, feature-flag, or environment-mode configurations in the current project. `CLAUDE.md` is shared-environment guidance and its Laravel/MySQL instructions do not apply to this React application.
