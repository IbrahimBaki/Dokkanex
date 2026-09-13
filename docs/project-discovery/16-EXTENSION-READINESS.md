# Extension readiness

## Assessment

The current application is sufficiently mapped to plan major extensions: its entry points, page composition, data flow, local schema, remote tables used, authorization assumptions, distribution paths, and main risks are documented. The critical architectural constraint is that it is a direct-to-Supabase browser application with an offline mutation queue, not a conventional frontend/backend system.

## Non-negotiable context for future developers

1. Preserve or deliberately replace the local-first contract: UI reads Dexie, writes queue records, and syncs push then pull. Add migrations for every local schema change and define conflict/deletion behavior before expanding domains.
2. Establish a version-controlled Supabase schema, RLS policies, and storage policies before relying on database behavior. Current remote enforcement cannot be reviewed from this repository.
3. Remove and rotate the browser-exposed privileged credential before expanding administration. Implement privileged operations in a server/Edge Function with server-side authorization.
4. Treat products/categories as the only active business entities. The ERP schema visible only in historical branches is not a foundation present in this branch.
5. Add tests and CI before significant data-model work, starting with auth/RLS and synchronization.

## Remaining external confirmations

- Actual Supabase table definitions, constraints, RLS, grants, Storage policy, Auth confirmation setting, and admin role provisioning.
- Whether deployed users have data created against any older/historical ERP schema.
- Browser/PWA and packaged desktop acceptance tests.

These are external-state confirmations, not gaps in the checked-out source map. Do not start feature implementation until the security remediation decision and Supabase schema/RLS baseline are agreed.
