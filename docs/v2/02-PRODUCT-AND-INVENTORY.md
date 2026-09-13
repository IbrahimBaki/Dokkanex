# DokkanX V2 — Product and Inventory

**Status:** Approved V2 Core product, inventory UX, and business-rule direction.  
**Scope:** Documentation/design only. It defines intended user behavior, not the database schema, migrations, routes, implementation, or production behavior.

This specification follows [V2 Navigation and Home](01-NAVIGATION-AND-HOME.md). Its intended users are very small retail businesses: stationery, hardware/paint, household-goods, and similar shops.

## 1. Product UX principles

**Simple for the user, powerful underneath** applies to products and inventory as follows:

1. **A product is easy to describe.** The everyday form contains only what helps sell, buy, find, and count the item.
2. **Stock is understandable, not technical.** Users see what remains, whether it needs attention, and clear actions such as Add quantity or Stock count. They do not need to know about records, IDs, or internal movement types.
3. **A quantity has a unit.** Quantities can be decimal values; DokkanX must not assume every shop sells only whole pieces.
4. **Product details and stock history have different responsibilities.** Name, image, category, unit, and prices are product details. Current stock comes from stock activity and must not be silently rewritten by ordinary product edits.
5. **Existing data is safe.** V2 preserves all existing accounts, products, categories, images, prices, and current product usability. It does not turn a previously untracked quantity into zero.
6. **Offline work is normal.** Browsing, product maintenance, stock setup, adjustment, and locally known history remain usable without a network connection.
7. **Attention is clear but calm.** Low, out, and negative quantities stand out enough to act on; they do not turn the catalog into an alarm screen.

Normal user-facing language should use terms equivalent to **Products, Inventory, Purchase price/Cost, Selling price, Unit, Remaining, In stock, Low stock, Out of stock, Add quantity, Remove quantity, and Stock count**. Do not expose UUIDs, synchronization metadata, warehouse IDs, movement IDs, or “stock ledger” terminology.

## 2. Product create and edit fields

### V2 Core product fields

| Field | Create experience | Edit experience | Rule |
|---|---|---|---|
| Product name | Required | Editable | Primary identifier shown throughout the app. |
| Product image | Optional | Editable/removable | Preserve the current optional-image behavior. |
| Category | Optional | Editable | Existing categories remain available from product management; they are not primary navigation. |
| Purchase price / Cost | Visible | Editable | V2 user-facing wording replaces the unclear wholesale concept; exact preservation/mapping of existing values is deferred to Step 3. |
| Selling price | Visible | Editable | Existing selling-price data is preserved. |
| Unit | Visible; defaults to Piece | Editable with care | One product has one stock unit in V2 Core. |
| Opening quantity | Visible on create; optional | Not an ordinary edit field after stock is initialized | Entering a value creates opening-stock activity conceptually. Leaving it unset means Stock not set, not zero. |
| Low-stock threshold | Visible; optional/configurable | Editable | Drives Low stock only after quantity is known. |
| Current stock | Not a manually typed product field | Display only: `Current stock: X [unit]` | Change through **Adjust Stock**, never by silently replacing the balance. |

The product creation form should group fields in a simple order: identity (name, image, category), prices (purchase/cost and selling), then stock setup (unit, opening quantity, threshold). Notes and additional details are explicitly outside the primary form. They may be separately scoped later only if they do not make daily product creation harder.

### Product edit rule

Once an opening balance or any stock activity exists, the Edit Product screen shows a concise current-stock line and a clear **Adjust Stock** action. Editing name, image, category, unit, or prices must not silently alter historical stock activity or rewrite the current quantity. The future implementation must define an understandable safeguard for a unit change when quantity/history already exist; see Step 3 open decisions.

## 3. Unit-of-measure rules

### V2 Core units

The simple selector initially offers:

- Piece (default)
- Pack
- Box
- Meter
- Kilogram
- Gram
- Liter

Quantities and low-stock thresholds support decimal values. Examples include `2.5 meters`, `0.75 kilograms`, and `12 pieces`. The UI should format a quantity together with its selected unit wherever it could otherwise be unclear.

### Deliberate limits

- A product has exactly one stock unit in V2 Core.
- No conversion exists in V2 Core: a Pack is not automatically converted to Pieces, and Kilograms are not converted to Grams.
- Users should create a distinct product if they need separately tracked sellable units before conversion support is designed.
- The system must not imply that an entered decimal is invalid merely because the default unit is Piece; quantity precision follows the business need, not an integer-only assumption.

## 4. Existing-product migration UX

### Compatibility rule

All production products that predate V2 inventory begin with the semantic state **Stock not set**. This is distinct from zero and must never be displayed as Out of stock or Low stock merely because a numeric quantity was not previously recorded.

| Existing product condition | V2 user-facing result |
|---|---|
| No inventory initialized yet | `Stock not set`; product remains visible, searchable, sellable, and editable. It is excluded from low/out-of-stock attention. |
| User initializes quantity | The product receives opening-stock activity and a known Current stock. Normal status rules then apply. |
| User does not initialize it yet | No forced onboarding, catalog-wide zeroing, or interruption of daily product use. |

### Progressive initialization

Inventory can be initialized one product at a time from the product edit/detail context, Inventory list action menu, or an explicitly scoped future bulk workflow. The individual flow should ask for the actual starting quantity and unit already assigned to the product, then clearly confirm that stock is now being tracked.

A future optional bulk stock-initialization workflow may help users with large catalogs filter **Stock not set** products and enter quantities progressively. It must not be mandatory onboarding, block sales/product work, or force completion for the full catalog.

## 5. Inventory states

The everyday user-facing states are exactly:

| State | Meaning | Attention behavior |
|---|---|---|
| In stock | Quantity is known and above its low-stock threshold. | Normal/quiet. |
| Low stock | Quantity is known, greater than zero, and at or below the user-defined threshold. | Noticeable, action-oriented. |
| Out of stock | Quantity is known and zero or below zero. | Strong attention state. A negative value remains visible. |
| Stock not set | No opening quantity or other inventory initialization exists. | Quiet, neutral state; never treated as zero/low/out. |

Negative stock is not a fifth primary label. It is a high-severity **Out of stock** condition with a visible negative quantity and attention treatment, for example “-2 pieces”.

If a product has no configured low-stock threshold, it can be In stock when known-positive or Out of stock when zero/negative; it is not automatically Low stock. The threshold’s default value and whether it is prefilled remain a Step 3 decision.

## 6. Inventory screen

Inventory is one of the five V2 primary destinations. It is a fast operational view for shops with hundreds or thousands of products—not a warehouse-management or accounting screen.

### Desktop structure

Prioritize a compact table/list with:

- Product (image may be a small secondary thumbnail)
- Category where useful
- Current quantity
- Unit
- Inventory status
- Last stock activity where useful, using plain language/time
- Simple action menu

Provide fast search and these primary filters:

- All
- Low stock
- Out of stock
- Stock not set

The action menu should lead with stock-relevant actions—Initialize stock when unset, or Adjust Stock when known—without exposing raw history-management controls.

### Mobile structure

Use a compact, readable list row: product name, short quantity-and-unit line, status, and an action affordance. Search and the same four status filters must remain available without turning the screen into a wide table. Large image cards are not the primary inventory presentation.

## 7. Manual stock workflows

Manual actions use familiar verbs and show the before/after result before confirmation. They conceptually create activity; they never replace a known balance without explanation.

| User action | Input | Result shown to user | Conceptual effect |
|---|---|---|---|
| Add quantity | Amount (decimal), optional simple reason | `20 + 5 = 25 pieces` | Positive manual activity |
| Remove quantity | Amount (decimal), optional simple reason | `20 − 3 = 17 pieces` | Negative manual activity |
| Stock count / Set actual quantity | Actual counted amount (decimal) | `Counted 18; current is 20; stock will change by -2` | Difference/adjustment activity, not a replacement of history |
| Damaged or lost stock | Amount (decimal), optional simple reason | `20 − 2 = 18 pieces` | Negative damage/loss activity |

**Adjust Stock** is the entry point. It presents the four user-facing choices in plain language. A user selecting Stock count enters the physical count, rather than an unexplained signed adjustment; DokkanX calculates the difference and makes the consequence clear before posting.

## 8. Stock movement business rules

Inventory history is conceptually movement-based. The user need not see that internal term, but the business rule is non-negotiable: the known current quantity is derived from recorded stock activity, not an arbitrarily mutable product field.

### Sources of activity

| Source | Direction | V2 status |
|---|---|---|
| Opening stock | In | Required concept when a user initializes a product’s known quantity. |
| Manual addition | In | V2 Core manual action. |
| Manual removal | Out | V2 Core manual action. |
| Stock count adjustment | In or Out | V2 Core manual action based on the count difference. |
| Damage/loss | Out | V2 Core manual action. |
| Purchase | In | Future automatic source once Purchases is separately specified. |
| Sale | Out | Future automatic source once Sales is separately specified. |
| Sale return | In | Future source. |
| Purchase return | Out | Future source. |

Once posted, history should not normally be edited or deleted directly. A mistake is corrected by a new corrective activity, preserving an auditable sequence. This is a business rule, not a mandate for a particular schema; exact record shape, posting lifecycle, IDs, and synchronization/idempotency rules are deferred to Step 3.

## 9. Negative-stock behavior

V2 Core does **not** hard-block negative stock. This supports real shops with imperfect counts, offline work, and later multi-device synchronization.

When an operation would reduce known stock below zero, the system must interrupt only long enough to make the impact explicit and ask for confirmation. Example:

> Only 3 pieces are currently available. Continuing will make stock -2.

The authorized user may continue. Afterward, the product displays as Out of stock with its negative remaining quantity and receives attention treatment in Inventory/Home. It must not be silently allowed, silently clamped to zero, or hidden.

For Stock not set, the future sales/removal design must explain that there is no known balance without pretending one exists. It must not fabricate a zero balance. The exact confirmation/capture behavior is an open Step 3/Sales decision.

## 10. Product list and card changes

The V2 Products destination preserves the current catalog page’s strengths: product search, category filtering, product images, familiar grid/list modes, and clear add-product access.

| Presentation | Primary information | Secondary information |
|---|---|---|
| Grid/card | Product name, image, selling price, current stock/status | Category only where useful; do not crowd the card with every field. |
| List/table | Product name, selling price, purchase price/cost, category, quantity/unit, inventory state | Image and last update/activity where useful. |
| Product detail/edit | Core product fields, current stock line, Adjust Stock action | Activity/history access only if separately designed and kept understandable. |

Low and out-of-stock status should be visually noticeable through a compact label, quantity, and restrained color treatment—not by making every card red. Migrated products show a quiet **Stock not set** label, never `0` unless the user has actually initialized/recorded zero stock.

## 11. Purchase-price terminology and existing values

Current production code calls the existing field `wholesale_price`; current UI has corresponding wholesale wording. V2 needs the clear user-facing concept **Purchase price / Cost** because it better matches small-shop daily language.

This is a terminology and semantics decision, not permission to reinterpret historical values. Existing `wholesale_price`, `selling_price`, and all other product data must be retained exactly until Step 3 verifies the deployed schema and agrees an explicit field-mapping/migration plan. The team must determine whether each historical wholesale value truly represents acquisition cost, another price tier, or a mixed legacy usage before changing its label or business meaning.

## 12. Offline-first rules

The following workflows must work against locally known data while offline:

- Browse and search products
- Add/edit products and categories
- Initialize stock
- Add/remove stock, record a count, and record damage/loss
- View locally known stock history

Normal inventory work must not be disabled just because the device is offline. Pending changes receive quiet, plain-language status such as “Changes will sync when you are online”; successful synchronization is confirmed calmly. The application must preserve the user’s local result immediately and must not invent a remote-only dependency for core work.

Conflict resolution, versioning, ordering, duplicate prevention/idempotency, history reconciliation, and cross-device behavior are implementation requirements for Step 3. They are particularly important because a locally accepted removal or sale can produce a negative balance after delayed synchronization.

## 13. Representative user flows

### A. New user creates a product with opening stock

1. User selects **Add Product** from Products or Home.
2. User enters a required name and, as needed, image, category, purchase/cost price, selling price, unit, opening quantity, and low-stock threshold.
3. Unit defaults to Piece; the user may choose another simple unit.
4. User enters `12` as opening quantity and saves.
5. The product appears immediately with `Current stock: 12 pieces` and In stock/Low stock as determined by its threshold.
6. Conceptually, DokkanX has recorded opening stock rather than treating `12` as an untracked mutable field. If offline, the result is usable locally and marked pending sync quietly.

### B. Existing production user initializes one old product

1. User finds an existing product that shows **Stock not set**.
2. User chooses **Initialize stock** from its product or Inventory action.
3. User enters the actual current quantity, for example `8`, and confirms the unit.
4. DokkanX confirms that stock is now being tracked and shows `Current stock: 8 pieces`.
5. Only this product changes state; no other legacy product is set to zero or forced through onboarding.

### C. User receives stock manually

1. User opens a known-stock product showing `20 pieces` and chooses **Adjust Stock** > **Add quantity**.
2. User enters `5`.
3. DokkanX previews `20 + 5 = 25 pieces`.
4. User confirms; the product immediately shows `25 pieces` and the local activity is available offline/pending sync if necessary.

### D. User performs a physical stock count

1. User opens a product showing `20 pieces` and chooses **Adjust Stock** > **Stock count**.
2. User enters the actual count: `18`.
3. DokkanX explains `Counted 18; current is 20; stock will change by -2`.
4. User confirms; current stock becomes `18 pieces` through a corrective adjustment activity. The prior history is retained.

### E. User attempts to remove more than available

1. User opens a product showing `3 pieces` and chooses **Adjust Stock** > **Remove quantity**.
2. User enters `5`.
3. Before confirmation, DokkanX displays: `Only 3 pieces are currently available. Continuing will make stock -2.`
4. User can cancel or continue if authorized.
5. If continued, current stock is `-2 pieces`, status is Out of stock, and the product appears as requiring attention.

## 14. Explicitly deferred from V2 Core

- Barcode scanning and barcode hardware integration
- Multiple warehouses or branches
- Unit conversion and pack/carton conversion
- Variants
- Serial numbers
- Batch/lot and expiry tracking
- Advanced costing methods
- Reservations
- Purchase orders
- Warehouse transfers
- Notes/additional-detail form expansion
- Full sales/purchases workflows, returns, and their automatic stock effects
- Inventory reporting, valuation, and accounting behavior

The future architecture may leave room for these capabilities, but V2 Core must not expose them or add their complexity to normal product/inventory work.

## 15. Open implementation decisions for Step 3

The following require technical/data design and, where indicated, a product decision before implementation:

1. **Canonical schema and migration:** how products, known/unset inventory state, thresholds, units, and immutable activity are represented remotely and in IndexedDB; how current production records are safely migrated.
2. **Historical price mapping:** whether `wholesale_price` can be shown as Purchase price/Cost, and any migration/display strategy that preserves legacy meaning.
3. **Price validation:** whether purchase/cost and selling price remain required, may be blank, or may be zero; this specification only makes Product name required.
4. **Threshold default:** whether it starts blank, has a user-configurable default, or is required at stock initialization.
5. **Unit changes:** the safe user flow when a product with known quantity/history needs a different unit, given that conversion is out of scope.
6. **Posting and correction model:** exact transaction boundaries, allowed correction actors, reason capture, reversal semantics, and whether an accidental opening-stock entry is corrected rather than edited.
7. **Offline correctness:** queue model, ordering, idempotency keys, conflict/version rules, local materialization of quantity, and multi-device reconciliation.
8. **Stock-not-set removal/sale behavior:** confirmation and follow-up state when an operation is attempted with no known balance.
9. **Permissions:** which roles may continue a negative operation, initialize stock, or post/correct manual actions.
10. **History UX:** retention, locally cached range, sort/filter behavior, and how much history is shown without creating an ERP-style ledger screen.
11. **Precision and formatting:** decimal storage/rounding policy per unit and price, locale display rules, and prevention of floating-point errors.
12. **Deletion/archive behavior:** how product deletion interacts with recorded stock history and later sales/purchase references.

## 16. Acceptance criteria for future implementation

- [ ] Product management exposes the approved V2 Core fields without exposing internal IDs, sync metadata, or warehouse/movement terminology.
- [ ] Product name is required; image and category remain optional; the unit selector defaults to Piece and offers the seven approved initial units.
- [ ] Quantity and low-stock threshold accept decimal values and display with their unit.
- [ ] Creating with opening quantity creates an opening-stock state/activity conceptually; a blank opening quantity means Stock not set, not zero.
- [ ] Editing product attributes never silently rewrites known stock/history; known stock is displayed with an Adjust Stock action.
- [ ] Existing production products preserve all data and begin as Stock not set unless explicitly initialized; none are mass-initialized to zero.
- [ ] Inventory offers fast search and All, Low stock, Out of stock, and Stock not set filters; desktop favors a compact list/table and mobile a compact readable list.
- [ ] The only normal user-facing inventory states are In stock, Low stock, Out of stock, and Stock not set; negative values are visible Out of stock attention states.
- [ ] Manual add/remove/count/damage flows preview the before/after quantity and create corrective activity rather than overwriting history.
- [ ] A removal/sale that would make known stock negative gives a clear warning and permits an authorized confirmation; it never silently clamps, hides, or hard-blocks the result.
- [ ] Products and all core inventory actions work offline against local data, with quiet pending/success sync communication.
- [ ] V2 Core excludes the explicitly deferred warehouse, conversion, barcode, variant, tracking, and advanced-costing features.
- [ ] Step 3 resolves the listed migration, schema, sync, price-mapping, permission, and precision decisions before any production implementation.
