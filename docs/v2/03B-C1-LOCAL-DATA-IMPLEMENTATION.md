# DokkanX V2 — Step 3B-C1 Local Data Implementation

**Status:** Local-only foundation. No remote V2 sync, UI integration, or production change is included.

## Dexie V3 schema

`src/lib/db.js` retains V1/V2 declarations and adds version 3 without an upgrade callback that rewrites old records. Existing `products`, `categories`, `sync_queue`, and `app_meta` records remain intact. New stores are user-scoped:

| Store | Key/index intent |
|---|---|
| `inventory_balances` | `product_id`; `user_id`, user/product and user/update indexes |
| `inventory_movements` | movement UUID; user/product/status and user/product/server-sequence indexes |
| `outbox_operations` | operation UUID; user/status/sequence, user/entity, and user/created indexes |
| `sync_state` | durable per-user scope records, including the outbox counter |
| `image_blobs` | reserved user-scoped staged-image storage; no current UI writer |

No old record is cleared or given an invented `user_id`. A legacy product with no V3 balance remains **Stock not set**.

## Local balance and movement model

Balances explicitly separate canonical remote fields (`server_quantity`, `server_revision`, `server_initialized`) from the local projection (`current_quantity`, `projected_revision`, `locally_initialized`, `pending_count`). A pending opening makes the local product initialized immediately without claiming remote acceptance.

`inventory_movements` uses the same UUID as its outbox operation. Pending and accepted movement data are separate states of the same business operation; C1 never mutates a pending movement into a different operation.

`src/lib/quantity.js` uses `decimal.js-light`, stores/transmits six-place canonical strings, rejects meaningful precision beyond six places, and avoids JavaScript Number arithmetic for inventory calculation.

## Outbox, sequence, and legacy bridge

`outbox_operations` stores user ownership, entity/action/payload, dependency, durable per-user sequence, status, attempts/errors, receipt, and reconciliation marker. The next sequence lives in `sync_state` and is allocated in the same Dexie transaction as the outbox row. Sequence is per user and survives reload.

Inventory commands chain later operations to the latest pending inventory operation for that product. They never coalesce movements. Retryable failures remain projected; conflict, blocked, permanent failure, and reconciled success are excluded.

The old `sync_queue` is retained unchanged. `proveLegacyQueueOwnership()` only proves a future bridge candidate from explicit payload/local entity ownership; it does not migrate, assign, or process legacy work. C2 must mark ambiguous work blocked.

## Local commands and projection

`initializeStock`, `addStock`, `removeStock`, `recordDamageLoss`, and `recordStockCount` require explicit `userId` and `productId`, verify locally owned products, write balance/movement/outbox state atomically, and allow negative projected stock for removal/damage. Counts capture projected base quantity/revision and create no row for equal count (`no_change`).

`replayPendingProjection()` replays pending, syncing, and retryable-failed movement intent in sequence over a remote base. It handles opening, signed manual movements, and stock-count targets. It does not simulate RPC success or send network requests.

## Test coverage and C2 handoff

Unit coverage uses fake IndexedDB for V2→V3 preservation, no invented stock, user partitions, concurrent per-user sequences, Decimal operations, commands, dependency chains, stock-count behavior, projection rules, legacy queue boundary, status recovery, and retention. Local Supabase integration tests remain the separate remote-contract suite.

C2 must implement only remote reconciliation/sync: user-scoped pull cursors, V2 RPC posting with stable UUID retries, legacy queue bridge decisions, accepted movement/balance merge, outbox reconciliation/cleanup, image sequencing, and metadata retry reconciliation. It must not process another account’s partition or treat local projected revision as an accepted server revision.
