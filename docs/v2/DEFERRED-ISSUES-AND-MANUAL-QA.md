# Deferred issues and manual QA

All items below require automated coverage and must be fixed by Step 7 hardening / before production release.

1. Product-create pending/retryable pull preservation — risk: medium. Verify offline-created product remains after a pull that omits it.
2. Same-owner duplicate create mismatch — risk: medium. Verify a 23505 with different canonical fields becomes conflict.
3. Hidden duplicate create / PGRST116 — risk: medium. Verify it ends finite and does not retry forever.
4. Wrong-owner duplicate create — risk: high. Verify it never reconciles as success.
5. `wholesale_price` `"12.50"` versus canonical `12.5` — risk: low. Verify lost-response reconciliation succeeds.
6. Dependency release after product-create success — risk: medium. Verify dependent metadata/archive becomes ready after reconciliation.
7. Multiple consecutive offline metadata edits before the prior metadata operation reconciles may require chaining/coalescing to avoid optimistic-concurrency conflicts — risk: medium/high. Verify manually and add automated coverage by Step 7 hardening / before production release.
8. Offline category deletion may temporarily leave local products carrying the deleted category_id until canonical product pull applies remote ON DELETE SET NULL — risk: medium UX/local consistency. Create/use a category, delete offline, inspect products, reconnect, and verify category_id becomes null by Step 7 / before production release.
9. Ambiguous historical V1 queue rows are retained and never sent automatically — risk: high. Resolve ownership/manual disposition before production release.
10. Category create followed by offline edit/delete may temporarily reappear after create reconciliation/pull until the dependent operation processes — risk: medium UX consistency. Verify/fix by Step 7 before production release.
11. Privileged admin capability is temporarily unavailable pending server-side authorization — risk: medium operational. Rebuild only behind a server or Edge Function before any future admin release.
12. New-product image staging occurs after the atomic product-plus-opening save; a local staging failure can leave the safe product draft without its optional image — risk: low UX/retry. Verify image re-selection/retry and harden before production release if it proves disruptive.
13. Optional simple reason capture for manual stock adjustments is not yet implemented — risk: low UX/audit enrichment. Decide before Step 7/release whether V2 Core requires it.
14. Adjust Stock entry from Products experience may be polished or expanded; Inventory is currently the primary operational entry — risk: low UX. Verify before release.
15. Focused regression coverage for local purchase zero-write invalid-input guarantees, archived rollback, calculated rounding/document-total parity, and generic `depends_on_many` normalization/readiness/missing-dependency/combined-dependency/cleanup retention-release remains incomplete — risk: medium. Implementation and current unit/integration/build validation pass; manually exercise invalid local purchase, rounded multi-line totals, and dependency release/cleanup behavior. Must fix by Step 7 hardening / before production release.
