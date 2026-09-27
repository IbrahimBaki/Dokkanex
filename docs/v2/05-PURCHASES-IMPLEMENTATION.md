# Purchases V2 foundation

## Status

Step 5A1 and 5A2 are complete and validated locally. Step 5B (purchase UI) remains the next feature slice.

## Local document and FIFO model

V2 uses new v2_purchase_documents and v2_purchase_lines; dormant ERP purchase tables are not reused. Purchases are immutable documents with free-text supplier, exact six-decimal costs, and per-line product/unit snapshots. Stock-not-set products are rejected rather than treated as zero. A purchase has one durable outbox operation and waits for unresolved inventory work on every product line; later inventory work waits for that purchase.

## Remote reconciliation

The V2 runner posts the same document UUID, line UUIDs, and movement UUIDs to post_purchase_v2 on every retry. An accepted receipt marks only the purchase operation reconciled; the authoritative line movements and balances still arrive through the normal user-scoped pull. Until those canonical movements arrive, locally recorded purchase quantities remain projected, so a delayed or stale pull cannot temporarily reduce stock or cause a duplicate post. The database RPC is atomic and idempotent, rejects cross-owner, duplicate-product, reused-movement, invalid, and stock-not-set input, and exposes the purchase tables as owner-scoped read-only records.

## Validation

- Full unit suite: 83 tests passing.
- Local Supabase integration suite: 30 tests passing.
- Production build: passing.
