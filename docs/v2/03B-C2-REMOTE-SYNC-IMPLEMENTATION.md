# Step 3B-C2 — Remote Sync Implementation

**Confirmed from implementation:** `src/lib/v2Sync.js` is a separate V2 data-layer runner. It is deliberately not wired into `SyncContext` or the product/inventory UI yet; V1 `syncManager` continues to own the existing `sync_queue` runtime until C3 lifecycle migration.

## Runner and account boundary

`createV2SyncRunner({ client, database, getActiveUserId })` requires an explicit `userId`. It verifies the current authenticated session before remote work and before applying a remote response. A per-runner generation token invalidates stale work after logout/account switch; a process-local per-user promise prevents overlapping V2 runs. No V2 query, outbox selection, or local merge crosses `user_id` partitions.

## Outbox processing

`selectReadyOutbox()` selects only `pending` operations and due `retryable_failed` operations, ordered by durable per-user `sequence`. Dependencies must be reconciled before processing; later operations for the same entity wait behind earlier ready work. `syncing`, `succeeded`, `conflict`, `blocked`, and `permanent_failed` are not selected.

The strict C1.1 state machine is used for all automatic transitions. Transient/network failures use bounded exponential retry (`next_attempt_at`); authorization and validation failures become `permanent_failed`; stock-count and metadata version conflicts become `conflict`. Operation UUIDs and payloads are never changed on retry.

## RPC mapping and reconciliation

Inventory `post` operations call `post_inventory_movement`; `stock_count` calls `post_stock_count`. The outbox `operation_id` is the RPC UUID. Accepted/duplicate receipts merge their canonical movement and balance, then mark the operation `succeeded` and `reconciled_at`. Projection replay only includes unresolved `pending`, `syncing`, and `retryable_failed` intent.

Accepted inventory reconciliation is one Dexie transaction: canonical movement, canonical balance, `status = succeeded`, receipt, and `reconciled_at` commit together. If a response is lost after the remote commit, the incremental movement pull recognizes the matching operation UUID and deliberately resolves local `pending`, `syncing`, or `retryable_failed` work to canonical success. This is recovery from server evidence, not a relaxation of generic outbox transitions.

Stock-count `conflict` is retained for review and never recalculated automatically. A returned `no_change` has no server movement receipt; C2 stores the received response as a durable **local observation** (`local_observation: true`) and marks it reconciled without inventing a movement. If that response is lost, no marker exists; a retry that conflicts after later remote activity remains a reviewable conflict.

Metadata operations use `update_product_metadata`; archive operations use `archive_product`. On stale metadata response C2 pulls the canonical product and compares only the original whitelisted patch fields. String, ID, unit, and image fields are exact/null-aware; `low_stock_threshold` is compared as a normalized decimal and `selling_price` as numerically equivalent values without changing stored precision. If each intended field is already canonical the operation is resolved; otherwise it remains a conflict. `wholesale_price` and `cost_price` are untouched.

## Pull, cursor, and local projection

Pulls are RLS-scoped to the active user for products, categories, balances, and non-legacy movements. The movement cursor is `sync_state.id = v2:movement_cursor:<userId>`. A Dexie transaction merges movement rows, outbox reconciliation markers, and advances the cursor only after the batch is durably stored. The cursor relies on the approved per-user server-sequence invariant; it is not treated as globally commit-ordered.

Remote balances populate `server_quantity`, `server_revision`, and `server_initialized`. `recomputeProduct()` replays unresolved local operations over that canonical base. Absence of a remote balance does not erase a pending local opening; a product with neither is still **Stock not set**.

## Categories and legacy bridge

New V2 category outbox actions use the existing authenticated category browser API with simple owner-scoped last-write-wins behavior. A successful category delete is followed by a user-scoped product pull, allowing the remote `ON DELETE SET NULL` category effect to replace stale local references.

`bridgeLegacyQueue()` never deletes legacy `sync_queue` rows. It proves ownership from `data.user_id` or a matching owned local product/category. Proven category CRUD is bridged once and marked locally; proven unsupported product mutations receive a blocked operation for that owner. Ambiguous ownership creates **no user-scoped outbox operation** and remains neutrally marked for future re-evaluation. A full product pull also preserves only local products with ownership-proven unresolved legacy product work; it does not preserve arbitrary stale products indefinitely.

## C3 handoff

C3 must wire runner lifecycle, online/offline triggers, and sync status into `SyncContext`, replace legacy runtime processing only after migration coverage, add staged image sequencing, surface conflicts/blocked work, and implement bounded outbox cleanup scheduling.

The pre-production hardening item from C1 remains: the server drift diagnostic must additionally compare canonical movement/balance ownership to `products.user_id` before production deployment.
