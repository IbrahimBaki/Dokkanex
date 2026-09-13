# Authentication and permissions

## Authentication

`AuthProvider` creates the standard Supabase browser client with `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY`, restores `supabase.auth.getSession()` at startup, and listens to `onAuthStateChange`. Its `signIn`, `signUp`, and `signOut` call password auth APIs. The Supabase JS client owns persisted session/token handling; this repository does not add a custom guard, cookie, token refresh flow, provider, or server session.

`LoginPage` and `RegisterPage` perform basic browser validation. Registration requires matching passwords and a six-character minimum, then navigates to `/`; whether email confirmation is required is remotely configured and **unable to confirm**. On an authenticated state change, the app requests persistent browser storage for its offline database.

## Route protection and role matrix

| Capability | Unauthenticated | Authenticated user | `app_metadata.role === superadmin` |
|---|---:|---:|---:|
| Landing/login/register | Yes (logged-in users redirected) | Redirected to products | Redirected to products |
| Own catalog/category/dashboard UI | No | Yes | Yes |
| `/admin*` UI | No | `403` | Yes |
| Direct product/category REST operation | Depends on Supabase GRANT/RLS | Intended own rows only | Depends on remote policy/client |
| Admin user listing/ban/global data | No | No UI path | Yes UI path, but see critical risk |

`PrivateLayout` checks only that a user exists. `AdminRoute` additionally checks the session user's `app_metadata?.role === 'superadmin'`. There are no policies, gates, permission records, department/team checks, or ownership checks in local code.

## Ownership enforcement

Normal reads filter Supabase pull requests by `user_id`; local creates set it from the active session. Updates/deletes sent by sync filter only by row `id`, so database RLS is the actual security boundary. Current RLS/GRANT state is not versioned in the checkout.

## Critical privileged path

`src/lib/adminSupabase.js` reads `VITE_SUPABASE_SERVICE_ROLE_KEY` and creates a service-role client in the browser bundle. Vite exposes `VITE_*` variables to client code. `adminOps` uses that client for Auth Admin APIs, global table reads, and user bans. The `AdminRoute` check is only a client-side UI gate and cannot make an exposed service-role credential safe. This is a **confirmed critical authorization/secrets risk**, not an acceptable server-side superadmin design. Rotate any exposed service key and move privileged work behind a server/Edge Function before further public distribution.

An historical, removed Git document describes intended `auth.uid() = user_id` RLS policies. It is not present in the current tree and cannot confirm deployed policy state.
