# Step 3B-C3-A — Sync Lifecycle Coexistence

During C3-A, V1 exclusively owns catalog `sync_queue` work and V2 exclusively owns inventory `outbox_operations`. V1 processes a legacy row only when its payload or the matching local entity proves that it belongs to the active user; another user's rows and ambiguous rows remain untouched. V2 runs with `legacyBridgeMode: 'disabled'` by default, so it creates no bridge operations during coexistence. The explicit enabled bridge remains the approved, opt-in C2 behavior only.

Both V1 and V2 pulls are user-scoped. A User A pull preserves User A pending product/category intent and does not remove User B products or categories. The lifecycle coordinator serializes V1 full sync, stale receipt-less recovery, V2 sync, succeeded-outbox cleanup, success timestamp persistence, and scoped status refresh. Generation and session checks make the current account authoritative across an account switch.

Abandoned recovery returns only stale, receipt-less `syncing` rows for the requested user to `pending`; fresh, receipt-bearing, and other-user rows are unchanged. UI status is also user-scoped: legacy pending count and each V2 state (`pending`, `retryable_failed`, `conflict`, `blocked`, and `permanent_failed`) remain distinct, and the lifecycle success timestamp is scoped to its user. Cleanup runs only after a successful V2 lifecycle.

C3-B is deferred: catalog handoff from V1 to V2, image staging/handling, and retirement of the competing V1 runtime are not part of C3-A.
