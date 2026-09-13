# DokkanX V2 — Step 3B-A Legacy Data Audit

**Status:** Completed from a local backup for Step 3B-A review.  
**Scope:** Read-only statistical audit and V2 design impact. No production query, restore, schema change, migration, or application behavior change was performed.

## 1. Audit source and safety boundary

| Item | Audit method | Result |
|---|---|---|
| Source | Local, gitignored PostgreSQL data-only dump: `backups/production-data-2026-09-13.sql` | Used in place; not copied, staged, or committed. |
| Method | In-memory parsing of `INSERT` data blocks and aggregate-only counts | No database restore was needed. |
| Production access | None | No production connection, query, command, or mutation was executed. |
| Sensitive data handling | Aggregate statistics only | This document contains no user identifiers, customer data, product names, emails, image paths, or secrets. |

This is evidence about the backup snapshot only. It does not revise historical Git claims or claim that source-only discovery could have established the same remote-schema facts.

## 2. Products: legacy/dormant field statistics

The dump contains **3,458** `products` rows.

| Field / observation | Aggregate result | Classification |
|---|---:|---|
| `quantity` | 3,458 zero; 0 positive; 0 negative; min/max 0 | **Clearly dormant/default data** |
| `cost_price` | 3,458 zero; 0 positive; 0 negative; min/max 0 | **Clearly dormant/default data** |
| `min_quantity` | 3,458 zero; 0 positive; 0 negative; min/max 0 | **Clearly dormant/default data** |
| `unit` | `piece`: 3,458 | **Clearly dormant/default data** |
| `is_active` | `true`: 3,458 | **Clearly dormant/default data** for this snapshot; it does not prove the intended future meaning of the flag. |
| `deleted_at` | 0 populated | **Clearly dormant/default data** |

### Conclusion for legacy quantities

`products.quantity` cannot represent meaningful historical inventory in this backup: every product has the schema-default value. It can safely remain **ignored for V2 inventory initialization**. Step 3B-B must not copy it into `inventory_balances`, create opening movements from it, or classify these products as zero/out of stock. Existing products remain **Stock not set** until an explicit V2 initialization.

This conclusion applies only to the V2 inventory migration path. The existing column remains in place for V1 client compatibility, as approved in [03 Data and Offline Foundation](03-DATA-AND-OFFLINE-FOUNDATION.md).

## 3. `stock_movements` audit

| Check | Result | Classification |
|---|---:|---|
| Total rows | 0 | **Clearly dormant/default data** |
| Distinct `reason` values | None | **Clearly dormant/default data** |
| `qty_change` zero / positive / negative | 0 / 0 / 0 | **Clearly dormant/default data** |
| Earliest/latest activity | Not applicable | **Clearly dormant/default data** |
| Links to current products | Not applicable; no rows | **Clearly dormant/default data** |

There is no historical movement data to map, preserve as a materialized balance, or reinterpret. The approved design can safely retain the table as a legacy-compatible table and add V2-safe columns/constraints that allow historic `legacy` rows, but this snapshot needs no legacy row transformation. V2 movement history begins with V2 opening movements only when users explicitly initialize stock.

## 4. Dormant ERP-domain table counts

The production backup contains these schema domains, but their data blocks have no rows.

| Domain / table | Row count | Classification |
|---|---:|---|
| Customers (`customers`) | 0 | **Clearly dormant/default data** |
| Suppliers (`suppliers`) | 0 | **Clearly dormant/default data** |
| Sales documents (`invoices`) | 0 | **Clearly dormant/default data** |
| Sales lines (`invoice_items`) | 0 | **Clearly dormant/default data** |
| Purchases (`purchases`) | 0 | **Clearly dormant/default data** |
| Purchase lines (`purchase_items`) | 0 | **Clearly dormant/default data** |
| Payments (`payments`) | 0 | **Clearly dormant/default data** |
| Ledger (`ledger_entries`) | 0 | **Clearly dormant/default data** |

No dormant ERP domain appears to contain meaningful historical user data in this snapshot. V2 Core should continue to avoid depending on these tables. Their presence is a remote-schema fact, not evidence that the current Store application implements those domains.

## 5. `wholesale_price` evidence

The comparison is structural only; it does not inspect or disclose product-level values.

| Comparison across 3,458 products | Count |
|---|---:|
| `wholesale_price < selling_price` | 3,448 |
| `wholesale_price = selling_price` | 3 |
| `wholesale_price > selling_price` | 7 |
| Missing/non-numeric comparison values | 0 |
| `cost_price` nonzero | 0 |
| `wholesale_price > cost_price` | 3,426 |
| `wholesale_price = cost_price` | 32 |
| `wholesale_price < cost_price` | 0 |

### Interpretation

The distribution strongly shows that `wholesale_price` is an actively populated value below the selling price in nearly all products, while `cost_price` is uniformly the zero default. This is **possibly meaningful** evidence that `wholesale_price` is cost/acquisition-like, rather than the dormant `cost_price` column being the effective purchase price.

It is **not sufficient to prove semantics**. The seven products where wholesale price exceeds selling price, and the absence of a product/business glossary or historical workflow evidence, leave open whether it is acquisition cost, a wholesale selling tier, or mixed historical usage. Therefore V2 must preserve both fields unchanged and must not relabel or automatically map either one in Step 3B-B.

## 6. Impact on the approved V2 foundation

| V2 design area | Audit-backed decision |
|---|---|
| Stock-not-set migration | Create no balance rows and no V2 opening movements for existing products. |
| Legacy `products.quantity` / `min_quantity` / `cost_price` | Keep columns intact for compatibility; do not use them as V2 source data. |
| Legacy `unit` | Retain existing value and treat inventory as unset. Its uniform `piece` value is not proof a user selected the unit. |
| Legacy `stock_movements` | No rows require mapping. Keep V2’s legacy-safe constraints because the schema remains compatible with possible future recovery/import scenarios. |
| Dormant ERP tables | Do not delete, migrate, or make V2 Core depend on them in Step 3B-B. |
| Purchase-price terminology | Continue displaying/preserving the existing V1 wholesale field as-is. Do not create or map a V2 `cost_price` field until semantics are explicitly confirmed. |
| Project-discovery drift | Step 3B must update the relevant discovery documents to distinguish active app domains, dormant remote-schema objects, and active V2 schema, with this backup as the evidence boundary. |

## 7. Decisions and blockers before Step 3B-B

### No blocker for the approved foundation migration

The audit supports the approved additive foundation: legacy products can remain Stock not set; legacy quantity data and historical movements do not require mapping; no dormant ERP data needs preservation work beyond non-destructive schema compatibility.

### Product terminology decision deferred, not blocking

Before a future UI change labels `wholesale_price` as **Purchase price / Cost**, a product owner must confirm its business meaning from a reliable source (for example, intended workflow or user-facing legacy documentation). Step 3B-B should not make that semantic decision, rename the field, or move its values. This is not a blocker for inventory foundation work because V2 stock accounting does not depend on product cost.

## 8. Audit limitations

- The dump is one dated snapshot, not a live production query or a complete semantic history.
- Empty tables prove no rows in this snapshot, not that the ERP schema was never used at another time or in another environment.
- Aggregate price comparisons cannot establish business intent for `wholesale_price`.
- No production backup content is included in the repository or this document.
