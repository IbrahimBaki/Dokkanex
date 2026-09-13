# Extension readiness

## Assessment

The current application is sufficiently mapped to plan major extensions: its entry points, page composition, data flow, local schema, remote tables used, authorization assumptions, distribution paths, and main risks are documented. The critical architectural constraint is that it is a direct-to-Supabase browser application with an offline mutation queue, not a conventional frontend/backend system.

## Non-negotiable context for future developers

1. Preserve or deliberately replace the local-first contract: UI reads Dexie, writes queue records, and syncs push then pull. Add migrations for every local schema change and define conflict/deletion behavior before expanding domains.
2. The pulled baseline and V2 foundation now version database/RLS evidence. Preserve the additive migration boundary: active V1 domains, dormant remote ERP objects, and V2 inventory objects are distinct until the client migration is complete. Storage hardening remains a later compatibility transition.
3. Remove and rotate the browser-exposed privileged credential before expanding administration. Implement privileged operations in a server/Edge Function with server-side authorization.
4. Treat products/categories as the only active V1 business entities. The pulled remote schema confirms dormant ERP tables, but the backup audit found no rows; do not revive or depend on them. V2 inventory is active database foundation only, pending client integration.
5. Add tests and CI before significant data-model work, starting with auth/RLS and synchronization.

## Remaining external confirmations

- Production drift since the pulled baseline, Storage policy transition, Auth confirmation setting, and admin role provisioning.
- Whether any environment outside the audited production snapshot has meaningful older ERP data.
- Browser/PWA and packaged desktop acceptance tests.

These are external-state confirmations, not gaps in the checked-out source map. Do not start feature implementation until the security remediation decision and Supabase schema/RLS baseline are agreed.
