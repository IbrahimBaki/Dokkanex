# Documentation audit

All current Markdown files were read before this discovery set was created. Current implementation was used to validate claims.

| File | Purpose | Accuracy/implementation confirmation | Action |
|---|---|---|---|
| `README.md` | Original product setup, stack, schema, PWA/Vercel notes, old tree | Partly accurate for React/Vite/Tailwind/Supabase/PWA/HashRouter. Outdated on app scope, routes/tree, schema, and "Realtime" claim; it omits auth, Dexie sync, admin, exports, Electron details. Schema cannot be confirmed. | Retain as concise onboarding but update/consolidate it against this discovery index in a future documentation pass. |
| `README-BUILD.md` | Arabic Windows Electron build guide | Build commands/paths broadly match `package.json`; it included credential values and said the app needs internet, which conflicts with implemented offline-first local operations. | Updated here to remove credentials; retain as localized build guide and amend offline wording later. |
| `CLAUDE.md` | Shared local deployment-container guidance | Not runtime documentation for this checkout. Its Laravel/PHP/MySQL instructions conflict with actual React/Supabase implementation; it describes the parent shared workspace. | Retain only as environment context; do not use it as Dokanex architecture/runbook. |
| `.squad/README.md` | squad-kit planning workflow | Accurate for `.squad` workflow; unrelated to runtime. | Retain. |

## Historical material

Git history/feature branches contain `docs/rls-permission-fix.md` and `supabase/migrations/0001_erp_schema.sql`, but neither exists in current `master`. They are not included in the current documentation inventory as active files. The former gives useful but unverified RLS remediation context; the latter describes an inactive ERP design. Treat both as historical only.

This `docs/project-discovery/` hierarchy is new because the repository lacked an established engineering-discovery documentation structure. It complements rather than deletes existing documents.
