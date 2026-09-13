# DokkanX V2 — Navigation and Home

**Status:** Approved product/UX direction for future V2 implementation.  
**Scope:** Information architecture and interaction intent only. This document does not change the current product, routes, schema, or data.

## 1. Product UX principles

DokkanX serves small, practical businesses—such as stationery, hardware/paint, and household-goods shops—where the owner or staff member needs to work quickly, often from a phone, and may not use accounting or ERP terminology.

The operating principle is: **Simple for the user, powerful underneath.**

1. **Start with daily work, not system structure.** A user should be able to start a sale, receive a purchase, find a product, or check stock without understanding the underlying data model.
2. **Favor familiar shop language.** Use terms equivalent to Products, Inventory, In, Out, Remaining, Sale, and Purchase. Do not surface terms such as ledger, mutation, fulfillment, or stock event in everyday UI.
3. **One obvious next action.** Each destination should have one clear primary purpose. On Home, that purpose is starting a new sale.
4. **Calm, selective information.** Show only information that helps the user act today. Avoid dense KPI dashboards, accounting language, and charts that do not lead to a decision.
5. **Offline is normal.** Core daily work remains available while offline. Network state is informative, not a reason to make the product feel unavailable.
6. **Protect continuity.** V2 must evolve the current production application without requiring users to recreate products, categories, images, prices, or accounts.

## 2. Current-state baseline and reuse

The current UI was reviewed through `src/App.jsx`, `src/components/Navbar.jsx`, `ProductsPage`, `CategoriesPage`, `DashboardPage`, and the supplied product-list screenshots.

Useful behaviors to carry forward:

- The compact, Arabic-first product list, product search, category filtering, grid/list preference, product images, and immediate add-product affordance.
- The existing quiet online indicator and visible pending-sync count.
- Local-first product and category work: everyday operations are available from the local store and synchronize later.
- The current analytics calculations may inform Home summaries later, but the current Analytics screen's catalog-value/margin emphasis is not the V2 Home model.

The current primary destinations—Categories, Products, Analytics—are a V1 information architecture and must not constrain V2. Categories remain useful metadata, but not a daily top-level destination.

## 3. Desktop information architecture

### Primary navigation

Desktop primary navigation contains exactly these five destinations, in this order:

1. **Home**
2. **Products**
3. **Inventory**
4. **Sales**
5. **Purchases**

These labels represent user jobs:

| Destination | Responsibility | Must not become |
|---|---|---|
| Home | Decide what needs attention and begin common work | A complex ERP dashboard or reporting warehouse |
| Products | Find and manage product definitions, prices, images, and categories | A stock-adjustment or transaction screen |
| Inventory | See what remains and act on stock attention/adjustments | A raw accounting ledger |
| Sales | Start and review outgoing customer sales | A generic product browser |
| Purchases | Record and review incoming purchases | A generic settings area |

### Utility area

The desktop utility area retains, separately from the five destinations:

- DokkanX identity/logo
- Online/offline state
- Sync state and an understandable route to sync detail/control
- Arabic/English switch
- Account/settings menu

Logout belongs inside the account/settings menu in V2, not as an unexplained standalone icon. The account menu is also the intended home for account-related actions and later settings access.

The exact visual placement (left/right) must follow the active RTL/LTR direction, but the semantic grouping remains the same: primary work destinations together; identity/status/account utilities together.

## 4. Mobile information architecture

Mobile is designed around five persistent primary destinations:

1. **Home**
2. **Products**
3. **Inventory**
4. **Sale**
5. **Purchase**

Use the singular action labels **Sale** and **Purchase** on mobile to make the two transactional destinations direct and compact. They should clearly start or continue the corresponding daily workflow; they are not merely reports.

The mobile primary navigation must not accumulate secondary functions. Keep the following outside it:

- Categories
- Settings and account actions
- Language switching
- Detailed synchronization controls and history
- Logout
- Export and other product-list utilities
- Future reports

Access secondary functions through contextual entry points (for example, category management from product management) and the account/settings menu. This keeps the daily-navigation mental model stable at five choices.

## 5. Home screen hierarchy

Home answers only three questions:

1. **What happened today?**
2. **Is anything running out?**
3. **What do I need to do next?**

It should be readable in a few seconds and should not resemble a conventional ERP dashboard.

### Section 1 — Quick actions

Place quick actions first, before summaries.

| Priority | Action | Intent |
|---|---|---|
| Primary / visually strongest | **New Sale** | Begin the expected frequent daily action immediately. |
| Secondary | New Purchase | Record stock coming in. |
| Secondary | Add Product | Add a product definition without navigating through the full list. |
| Secondary | Adjust Stock | Correct or record a stock change when that is the user's task. |

New Sale must have the strongest visual priority and largest/touch-friendly affordance. Secondary actions must remain easily discoverable without competing with it.

### Section 2 — Today's summary

Show no more than four primary summary cards:

1. **Today's Sales**
2. **Today's Purchases**
3. **Low Stock**
4. **Out of Stock**

The cards should be simple counts or amounts with plain-language labels and a clear drill-in path where relevant. Do not add margin, catalog value, top-product, category-distribution, tax, profit, or other KPIs to this section. Those can be explored later through reports if needed.

### Section 3 — Stock attention

Show a concise actionable list of products requiring attention. Each item should communicate:

- Product name
- Current quantity
- A clear **Low stock** or **Out of stock** state

This is an attention list, not a full inventory table. It needs a simple, visible path to Inventory for the complete view and any next action.

### Section 4 — Recent activity

Show a short list of approximately five most recent relevant actions, such as:

- A sale
- A purchase
- A stock adjustment

Use simple phrases that say what happened and when. Avoid accounting terms, raw IDs, internal sync terms, and a long audit trail. A later activity/history destination is explicitly outside this document's scope.

### Empty and early-adoption states

When a shop has no products, Home should guide the owner toward **Add Product** without making the screen feel broken. When there are products but no sales/purchases yet, show a calm empty state and retain the quick actions. Empty attention and activity sections should not be replaced by invented metrics.

## 6. Navigation responsibilities and migration intent

| Current V1 concept | V2 destination/placement | Product decision |
|---|---|---|
| Products | Products | Retain as a primary destination; preserve product search, filtering, images, price management, and current catalog continuity. |
| Categories | Product management and/or Settings | Retain as a feature but remove from primary navigation. Product categorization must remain available. |
| Analytics | Home summaries now; Reports later | Remove as a primary standalone concept. Only decision-oriented daily summaries belong on Home. |
| Current add-product floating action | Products and Home quick action | Retain the capability; V2 implementation may adapt the placement to each context. |
| Sync control/status | Utility area and detailed secondary location | Keep visibility, but do not make sync a primary destination or use internal terminology. |
| Standalone logout icon | Account/settings menu | Make the action explicit and grouped with account actions. |

The target information architecture does not imply deletion or replacement of current records. Existing products, categories, images, prices, and accounts remain continuity requirements for the V2 delivery plan.

## 7. Offline-state UX rules

1. **Always show state quietly.** The navigation utility area communicates Online or Offline with a recognizable status indicator and plain-language label/accessible text.
2. **Keep normal work available.** Creating a sale, purchase, product, or stock adjustment must not appear disabled solely because the device is offline, unless a specific operation genuinely requires network access.
3. **Make pending work understandable.** When local changes await synchronization, use user-facing wording such as “Changes will sync when you are online” and a small count/indicator where useful. Never call it a mutation queue.
4. **Confirm successful synchronization without noise.** A brief, calm success state or last-synced indication is sufficient; do not interrupt work with repeated success dialogs.
5. **Explain exceptions at the point of need.** If a particular feature requires connectivity, say why and preserve access to unrelated offline work.
6. **Do not equate offline with failure.** Offline is an expected operating mode. Error styling is reserved for a failed action or a problem that needs user attention.
7. **Preserve status across destinations.** A user should not have to return to Products to discover that work is pending or synchronization succeeded.

## 8. Explicitly deferred ideas

These are intentionally not decided by this navigation/Home specification:

- Sales workflow details: customer selection, line items, discounts, payment methods, receipt behavior, returns, and draft rules.
- Purchases workflow details: suppliers, receiving, costing, payment, and draft rules.
- Inventory model details: units, quantities, reorder thresholds, adjustments, transfers, valuation, and history.
- Database/schema changes, migration strategy, APIs, offline conflict handling, and synchronization implementation.
- Reports information architecture beyond the principle that richer analytics belongs outside primary navigation and Home.
- Roles/permissions, staff workflows, multi-shop behavior, and administration.
- Exact component layout, iconography, colors, responsive breakpoints, animations, and route paths.
- Notifications, barcode scanning, printing, taxes, accounting, customer/supplier management, and integrations.

## 9. Acceptance criteria for future implementation

An implementation of this approved UX direction is acceptable only when all of the following are true:

- [ ] Desktop primary navigation shows Home, Products, Inventory, Sales, and Purchases—no Categories or Analytics primary item.
- [ ] Mobile primary navigation shows Home, Products, Inventory, Sale, and Purchase—no secondary settings/category/sync/logout item.
- [ ] Categories remain reachable from product management or settings and existing category associations remain available.
- [ ] Analytics no longer appears as a standalone primary destination; Home shows only the approved daily summaries, and richer reporting is separately scoped.
- [ ] The utility area includes identity, online/offline state, sync state, language switching, and an account/settings menu.
- [ ] Logout is available in the account/settings menu rather than only as a standalone ambiguous icon.
- [ ] Home begins with Quick actions and gives New Sale clearly stronger priority than New Purchase, Add Product, and Adjust Stock.
- [ ] Home has at most four primary summary cards: Today's Sales, Today's Purchases, Low Stock, and Out of Stock.
- [ ] Home includes a concise stock-attention list with product name, current quantity, state, and a path to Inventory.
- [ ] Home includes approximately five plain-language recent activities, not a dense audit or accounting view.
- [ ] Offline users can continue normal daily work; offline/pending/successful-sync state is understandable without internal technical language.
- [ ] The V2 migration preserves existing user accounts, products, categories, images, and prices without manual recreation.
- [ ] Sales, purchases, inventory, and reports are implemented only after their separate workflow/data/offline specifications are approved.
