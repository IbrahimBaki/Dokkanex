import { afterEach, describe, expect, it } from 'vitest';
import { createDatabase } from '../../src/lib/db';
import { initializeStock, recordStockCount } from '../../src/lib/inventoryLocal';
import { recordPurchase } from '../../src/lib/purchasesV2';
import { cleanupSucceededOutbox, createOutboxOperation, recoverAbandonedSyncing, transitionOutboxOperation } from '../../src/lib/outbox';
import { bridgeLegacyQueue, classifySyncError, createV2SyncRunner, getV2SyncStatus, pullUserState, selectReadyOutbox } from '../../src/lib/v2Sync';

const USER_A = 'user-a';
const USER_B = 'user-b';
const databases = [];

async function freshDatabase() {
  const database = createDatabase(`v2-sync-${crypto.randomUUID()}`);
  databases.push(database);
  await database.open();
  return database;
}

function query(data) {
  const chain = {
    eq: () => chain, neq: () => chain, gt: () => chain, order: () => chain,
    single: async () => ({ data: data[0] ?? null, error: null }),
    then: (resolve) => resolve({ data, error: null }),
  };
  return chain;
}

function mockClient({ activeUser = USER_A, rpc = async () => ({ data: { status: 'accepted' }, error: null }), tables = {} } = {}) {
  return {
    auth: { getSession: async () => ({ data: { session: activeUser ? { user: { id: activeUser } } : null }, error: null }) },
    rpc,
    from: (table) => ({
      select: () => query(tables[table] ?? []),
      insert: () => query(tables[table] ?? []),
      update: () => ({ eq: () => query(tables[table] ?? []) }),
      delete: () => query([]),
    }),
  };
}

afterEach(async () => {
  await Promise.all(databases.splice(0).map(async (database) => { database.close(); await database.delete(); }));
});

describe('V2 remote sync runner', () => {
  it('preserves pending User A catalog drafts and all User B catalog records during a User A pull', async () => {
    const database = await freshDatabase();
    await database.products.bulkPut([
      { id: 'a-pending-product', user_id: USER_A, name: 'A draft' },
      { id: 'b-product', user_id: USER_B, name: 'B product' },
    ]);
    await database.categories.bulkPut([
      { id: 'a-pending-category', user_id: USER_A, name: 'A draft category' },
      { id: 'b-category', user_id: USER_B, name: 'B category' },
    ]);
    await createOutboxOperation({ operation_id: 'a-product-draft', user_id: USER_A, entity_type: 'product_metadata', action: 'update', entity_id: 'a-pending-product', payload: {} }, database);
    await createOutboxOperation({ operation_id: 'a-category-draft', user_id: USER_A, entity_type: 'category', action: 'update', entity_id: 'a-pending-category', payload: {} }, database);

    await pullUserState(USER_A, { client: mockClient({ tables: { products: [], categories: [], inventory_balances: [], stock_movements: [] } }), database });

    expect(await database.products.get('a-pending-product')).toMatchObject({ user_id: USER_A });
    expect(await database.categories.get('a-pending-category')).toMatchObject({ user_id: USER_A });
    expect(await database.products.get('b-product')).toMatchObject({ user_id: USER_B });
    expect(await database.categories.get('b-category')).toMatchObject({ user_id: USER_B });
  });

  it('leaves legacy bridge operations absent by default and creates the approved bridge only when enabled', async () => {
    const database = await freshDatabase();
    await database.products.put({ id: 'legacy-a', user_id: USER_A, name: 'Legacy A' });
    await database.sync_queue.add({ table_name: 'products', operation: 'UPDATE', record_id: 'legacy-a', data: {}, created_at: 'old' });
    const client = mockClient({ tables: { products: [], categories: [], inventory_balances: [], stock_movements: [] } });

    await createV2SyncRunner({ client, database }).sync(USER_A);
    expect(await database.outbox_operations.count()).toBe(0);
    expect(await database.sync_queue.toCollection().first()).not.toHaveProperty('v2_bridge_operation_id');

    await createV2SyncRunner({ client, database, legacyBridgeMode: 'enabled' }).sync(USER_A);
    expect(await database.outbox_operations.where('user_id').equals(USER_A).first()).toMatchObject({ entity_type: 'legacy_queue', status: 'blocked', source_table: 'products' });
    expect(await database.sync_queue.toCollection().first()).toMatchObject({ v2_bridge_status: 'blocked' });
  });

  it('recovers only User A stale receipt-less syncing work', async () => {
    const database = await freshDatabase();
    const stale = await createOutboxOperation({ operation_id: 'a-stale', user_id: USER_A, entity_type: 'inventory_movement', action: 'post', entity_id: 'p', payload: {} }, database);
    const fresh = await createOutboxOperation({ operation_id: 'a-fresh', user_id: USER_A, entity_type: 'inventory_movement', action: 'post', entity_id: 'p', payload: {} }, database);
    const receipted = await createOutboxOperation({ operation_id: 'a-receipted', user_id: USER_A, entity_type: 'inventory_movement', action: 'post', entity_id: 'p', payload: {} }, database);
    const otherUser = await createOutboxOperation({ operation_id: 'b-stale', user_id: USER_B, entity_type: 'inventory_movement', action: 'post', entity_id: 'p', payload: {} }, database);
    for (const operation of [stale, fresh, receipted, otherUser]) await transitionOutboxOperation(operation.operation_id, 'syncing', {}, database);
    const old = new Date(Date.now() - 10_000).toISOString();
    await database.outbox_operations.update(stale.operation_id, { last_attempt_at: old });
    await database.outbox_operations.update(receipted.operation_id, { last_attempt_at: old, server_receipt: { accepted: true } });
    await database.outbox_operations.update(otherUser.operation_id, { last_attempt_at: old });

    expect(await recoverAbandonedSyncing(USER_A, { staleAfterMs: 5_000, now: Date.now() }, database)).toBe(1);
    expect(await database.outbox_operations.get(stale.operation_id)).toMatchObject({ status: 'pending' });
    expect(await database.outbox_operations.get(fresh.operation_id)).toMatchObject({ status: 'syncing' });
    expect(await database.outbox_operations.get(receipted.operation_id)).toMatchObject({ status: 'syncing' });
    expect(await database.outbox_operations.get(otherUser.operation_id)).toMatchObject({ status: 'syncing' });
  });

  it('reports each V2 status independently inside the requested user partition', async () => {
    const database = await freshDatabase();
    const states = ['pending', 'retryable_failed', 'conflict', 'blocked', 'permanent_failed'];
    for (const [index, state] of states.entries()) {
      const operation = await createOutboxOperation({ operation_id: `a-${state}`, user_id: USER_A, entity_type: 'inventory_movement', action: 'post', entity_id: `p-${index}`, payload: {} }, database);
      if (state === 'blocked') await transitionOutboxOperation(operation.operation_id, 'blocked', {}, database);
      else if (state !== 'pending') {
        await transitionOutboxOperation(operation.operation_id, 'syncing', {}, database);
        await transitionOutboxOperation(operation.operation_id, state, {}, database);
      }
    }
    await createOutboxOperation({ operation_id: 'b-pending', user_id: USER_B, entity_type: 'inventory_movement', action: 'post', entity_id: 'p', payload: {} }, database);
    expect(await getV2SyncStatus(USER_A, database)).toEqual({ pending: 1, retryable_failed: 1, conflict: 1, blocked: 1, permanent_failed: 1 });
    expect(await getV2SyncStatus(USER_B, database)).toEqual({ pending: 1, retryable_failed: 0, conflict: 0, blocked: 0, permanent_failed: 0 });
  });
  it('selects only the active user’s ready FIFO operations and waits for dependencies', async () => {
    const database = await freshDatabase();
    const first = await createOutboxOperation({ operation_id: 'a1', user_id: USER_A, entity_type: 'category', action: 'create', entity_id: 'c', payload: {} }, database);
    await createOutboxOperation({ operation_id: 'a2', user_id: USER_A, entity_type: 'category', action: 'update', entity_id: 'c', payload: {}, depends_on: first.operation_id }, database);
    await createOutboxOperation({ operation_id: 'b1', user_id: USER_B, entity_type: 'category', action: 'create', entity_id: 'c', payload: {} }, database);
    expect((await selectReadyOutbox(USER_A, database)).map((row) => row.operation_id)).toEqual(['a1']);
    await transitionOutboxOperation('a1', 'syncing', {}, database);
    await transitionOutboxOperation('a1', 'succeeded', { reconciled_at: new Date().toISOString() }, database);
    expect((await selectReadyOutbox(USER_A, database)).map((row) => row.operation_id)).toEqual(['a2']);
  });

  it('posts the same inventory UUID, merges the receipt, and retains user isolation', async () => {
    const database = await freshDatabase();
    await database.products.put({ id: 'p', user_id: USER_A, name: 'Product' });
    const local = await initializeStock({ userId: USER_A, productId: 'p', quantity: '2.5' }, database);
    const rpcCalls = [];
    const client = mockClient({
      rpc: async (name, args) => {
        rpcCalls.push({ name, args });
        return { data: { status: 'accepted', movement: { id: args.p_operation_id, product_id: 'p', user_id: USER_A, qty_change: '2.500000', movement_type: 'opening', server_sequence: 1, posted_at: '2026-01-01T00:00:00Z' }, balance_after: '2.500000', revision_after: 1 }, error: null };
      },
      tables: { products: [{ id: 'p', user_id: USER_A, name: 'Product', metadata_version: 0 }], categories: [], inventory_balances: [{ product_id: 'p', user_id: USER_A, current_quantity: '2.500000', revision: 1, initialized_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-01T00:00:00Z' }], stock_movements: [] },
    });
    const runner = createV2SyncRunner({ client, database });
    await runner.sync(USER_A);
    expect(rpcCalls).toHaveLength(1);
    expect(rpcCalls[0]).toMatchObject({ name: 'post_inventory_movement', args: { p_operation_id: local.operation.operation_id, p_quantity: '2.500000' } });
    expect(await database.outbox_operations.get(local.operation.operation_id)).toMatchObject({ status: 'succeeded', reconciled_at: expect.any(String) });
    expect(await database.inventory_balances.get('p')).toMatchObject({ server_quantity: '2.500000', current_quantity: '2.500000', server_revision: 1 });
    expect(await database.outbox_operations.where('user_id').equals(USER_B).count()).toBe(0);
  });

  it('posts a purchase once with stable document, line, and movement IDs, retaining its projection until the canonical pull arrives', async () => {
    const database = await freshDatabase();
    await database.products.put({ id: 'p', user_id: USER_A, name: 'Product', unit: 'piece' });
    await database.inventory_balances.put({ product_id: 'p', user_id: USER_A, server_initialized: true, server_quantity: '2.000000', server_revision: 1, locally_initialized: true, current_quantity: '2.000000', projected_revision: 1, pending_count: 0 });
    const purchase = await recordPurchase({ userId: USER_A, purchasedAt: '2026-09-20T00:00:00.000Z', supplierName: 'Supplier', reference: 'REF-1', lines: [{ productId: 'p', quantity: '3', unitCost: '0.1' }] }, database);
    const calls = [];
    const client = mockClient({
      rpc: async (name, args) => { calls.push({ name, args }); return { data: { status: 'accepted', purchase_id: args.p_purchase_id, total_amount: 0.3 }, error: null }; },
      tables: { products: [{ id: 'p', user_id: USER_A, name: 'Product', unit: 'piece' }], categories: [], inventory_balances: [{ product_id: 'p', user_id: USER_A, current_quantity: '2.000000', revision: 1, initialized_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-01T00:00:00Z' }], stock_movements: [] },
    });
    await createV2SyncRunner({ client, database }).sync(USER_A);
    expect(calls).toHaveLength(1);
    expect(calls[0]).toMatchObject({ name: 'post_purchase_v2', args: { p_purchase_id: purchase.operation.operation_id, p_purchased_at: purchase.document.purchased_at, p_supplier_name: 'Supplier', p_reference: 'REF-1', p_lines: [{ line_id: purchase.lines[0].id, product_id: 'p', movement_id: purchase.lines[0].movement_id, quantity: '3.000000', unit_cost: '0.100000' }] } });
    expect(await database.outbox_operations.get(purchase.operation.operation_id)).toMatchObject({ status: 'succeeded', reconciled_at: expect.any(String), server_receipt: { purchase_id: purchase.operation.operation_id } });
    expect(await database.inventory_balances.get('p')).toMatchObject({ current_quantity: '5.000000' });
  });

  it('classifies retryable, validation, and stock-count conflict outcomes without silently retrying conflicts', async () => {
    const database = await freshDatabase();
    await database.products.put({ id: 'p', user_id: USER_A, name: 'Product' });
    const opening = await initializeStock({ userId: USER_A, productId: 'p', quantity: '1' }, database);
    const client = mockClient({ rpc: async () => ({ error: { code: '23514', message: 'bad request' } }) });
    await createV2SyncRunner({ client, database }).sync(USER_A);
    expect(await database.outbox_operations.get(opening.operation.operation_id)).toMatchObject({ status: 'permanent_failed', last_error_code: 'validation' });
    expect(classifySyncError({ message: 'network failed' })).toMatchObject({ state: 'retryable_failed' });
    expect(classifySyncError({ code: '42501' })).toMatchObject({ state: 'permanent_failed' });
  });

  it('invalidates an in-flight RPC after it has started without applying its response', async () => {
    const database = await freshDatabase();
    await database.products.put({ id: 'p', user_id: USER_A, name: 'Product' });
    await initializeStock({ userId: USER_A, productId: 'p', quantity: '1' }, database);
    let resolveRpc;
    let rpcStarted;
    const started = new Promise((resolve) => { rpcStarted = resolve; });
    const delayed = new Promise((resolve) => { resolveRpc = resolve; });
    const client = mockClient({ rpc: async () => { rpcStarted(); return delayed; } });
    const runner = createV2SyncRunner({ client, database });
    const run = runner.sync(USER_A);
    await started;
    runner.invalidate();
    resolveRpc({ data: { status: 'accepted', movement: { id: 'ignored', product_id: 'p', user_id: USER_A, qty_change: '1', server_sequence: 1 }, balance_after: '1', revision_after: 1 }, error: null });
    expect(await run).toMatchObject({ cancelled: true });
    expect((await database.inventory_movements.where('id').equals('ignored').count())).toBe(0);
    expect(await database.outbox_operations.get('ignored')).toBeUndefined();
    expect(await database.outbox_operations.get((await database.outbox_operations.where('user_id').equals(USER_A).first()).operation_id)).toMatchObject({ status: 'syncing', server_receipt: null });
  });

  it('recovers a lost accepted response from the canonical cursor pull exactly once', async () => {
    const database = await freshDatabase();
    await database.products.put({ id: 'p', user_id: USER_A, name: 'Product' });
    const local = await initializeStock({ userId: USER_A, productId: 'p', quantity: '2' }, database);
    await transitionOutboxOperation(local.operation.operation_id, 'syncing', {}, database);
    await transitionOutboxOperation(local.operation.operation_id, 'retryable_failed', {}, database);
    const remoteMovement = { id: local.operation.operation_id, user_id: USER_A, product_id: 'p', movement_type: 'opening', qty_change: '2.000000', server_sequence: 7, posted_at: '2026-01-01T00:00:00Z' };
    const client = mockClient({ tables: { products: [{ id: 'p', user_id: USER_A, name: 'Product' }], categories: [], inventory_balances: [{ product_id: 'p', user_id: USER_A, current_quantity: '2', revision: 1, initialized_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-01T00:00:00Z' }], stock_movements: [remoteMovement] } });
    await pullUserState(USER_A, { client, database });
    expect(await database.outbox_operations.get(local.operation.operation_id)).toMatchObject({ status: 'succeeded', reconciled_at: expect.any(String) });
    expect(await database.inventory_movements.where('id').equals(local.operation.operation_id).count()).toBe(1);
    expect((await database.sync_state.get(`v2:movement_cursor:${USER_A}`)).value).toBe(7);
  });

  it('keeps received stock-count no-change evidence locally without inventing a movement', async () => {
    const database = await freshDatabase();
    await database.products.put({ id: 'p', user_id: USER_A, name: 'Product' });
    const opening = await initializeStock({ userId: USER_A, productId: 'p', quantity: '2' }, database);
    await transitionOutboxOperation(opening.operation.operation_id, 'syncing', {}, database);
    await transitionOutboxOperation(opening.operation.operation_id, 'succeeded', { server_receipt: { ok: true }, reconciled_at: new Date().toISOString() }, database);
    const count = await recordStockCount({ userId: USER_A, productId: 'p', countedQuantity: '2' }, database);
    expect(count.status).toBe('no_change');
    const operation = await createOutboxOperation({ operation_id: 'count-no-change', user_id: USER_A, entity_type: 'inventory_movement', action: 'stock_count', entity_id: 'p', payload: { base_balance: '2', base_revision: 1, counted_quantity: '2' } }, database);
    const client = mockClient({ rpc: async () => ({ data: { status: 'no_change', current_quantity: '2.000000', current_revision: 1 }, error: null }) });
    await createV2SyncRunner({ client, database }).sync(USER_A);
    expect(await database.outbox_operations.get(operation.operation_id)).toMatchObject({ status: 'succeeded', reconciled_at: expect.any(String), server_receipt: { status: 'no_change', local_observation: true } });
    expect(await database.inventory_movements.where('id').equals(operation.operation_id).count()).toBe(0);
  });

  it('recognizes semantically equal metadata after a lost response but preserves a real conflict', async () => {
    const database = await freshDatabase();
    const remoteProduct = { id: 'p', user_id: USER_A, name: 'Product', low_stock_threshold: '0.125000', metadata_version: 2 };
    await database.products.put(remoteProduct);
    const equal = await createOutboxOperation({ operation_id: 'metadata-equal', user_id: USER_A, entity_type: 'product_metadata', action: 'update', entity_id: 'p', payload: { expected_metadata_version: 1, patch: { low_stock_threshold: 0.125 } } }, database);
    const client = mockClient({ rpc: async () => ({ data: { status: 'conflict' }, error: null }), tables: { products: [remoteProduct], categories: [], inventory_balances: [], stock_movements: [] } });
    const runner = createV2SyncRunner({ client, database });
    await runner.sync(USER_A);
    expect(await database.outbox_operations.get(equal.operation_id)).toMatchObject({ status: 'succeeded', reconciled_at: expect.any(String) });
    const different = await createOutboxOperation({ operation_id: 'metadata-different', user_id: USER_A, entity_type: 'product_metadata', action: 'update', entity_id: 'p', payload: { expected_metadata_version: 2, patch: { low_stock_threshold: '0.500000' } } }, database);
    await runner.sync(USER_A);
    expect(await database.outbox_operations.get(different.operation_id)).toMatchObject({ status: 'conflict', last_error_code: 'metadata_conflict' });
  });

  it('never attributes ambiguous legacy work and preserves proven legacy product work through a pull', async () => {
    const database = await freshDatabase();
    await database.sync_queue.add({ table_name: 'products', operation: 'UPDATE', record_id: 'missing', data: {}, created_at: 'old' });
    await bridgeLegacyQueue(USER_A, database);
    expect(await database.outbox_operations.where('user_id').equals(USER_A).count()).toBe(0);
    await database.products.put({ id: 'missing', user_id: USER_B, name: 'B product' });
    await bridgeLegacyQueue(USER_B, database);
    expect(await database.outbox_operations.where('user_id').equals(USER_B).first()).toMatchObject({ status: 'blocked', source_table: 'products' });
    const client = mockClient({ activeUser: USER_B, tables: { products: [], categories: [], inventory_balances: [], stock_movements: [] } });
    await pullUserState(USER_B, { client, database });
    expect(await database.products.get('missing')).toMatchObject({ user_id: USER_B });
  });

  it('does not clean a reconciled dependency while unresolved work depends on it', async () => {
    const database = await freshDatabase();
    const parent = await createOutboxOperation({ operation_id: 'parent', user_id: USER_A, entity_type: 'category', action: 'create', entity_id: 'c', payload: {} }, database);
    await transitionOutboxOperation(parent.operation_id, 'syncing', {}, database);
    await transitionOutboxOperation(parent.operation_id, 'succeeded', { server_receipt: { ok: true }, reconciled_at: new Date().toISOString() }, database);
    await createOutboxOperation({ operation_id: 'child', user_id: USER_A, entity_type: 'category', action: 'update', entity_id: 'c', payload: {}, depends_on: parent.operation_id }, database);
    expect(await cleanupSucceededOutbox(USER_A, { keepRecent: 0 }, database)).toBe(0);
    expect(await database.outbox_operations.get(parent.operation_id)).toBeTruthy();
  });

  it('turns a remotely initialized opening SQLSTATE 23505 into reviewable conflict instead of retrying', async () => {
    const database = await freshDatabase();
    await database.products.put({ id: 'p', user_id: USER_A, name: 'Product' });
    const opening = await initializeStock({ userId: USER_A, productId: 'p', quantity: '1' }, database);
    const client = mockClient({ rpc: async () => ({ error: { code: '23505', message: 'stock is already initialized' } }) });
    await createV2SyncRunner({ client, database }).sync(USER_A);
    expect(await database.outbox_operations.get(opening.operation.operation_id)).toMatchObject({ status: 'conflict', last_error_code: 'inventory_already_initialized' });
  });

  it('recovers a duplicate category create from the owner-visible canonical category instead of retrying', async () => {
    const database = await freshDatabase();
    const category = { id: 'c', user_id: USER_A, name: 'Tools' };
    const operation = await createOutboxOperation({ operation_id: 'category-create', user_id: USER_A, entity_type: 'category', action: 'create', entity_id: 'c', payload: category }, database);
    const client = mockClient({ rpc: async () => ({ data: null, error: null }), tables: { products: [], categories: [category], inventory_balances: [], stock_movements: [] } });
    client.from = (table) => {
      if (table === 'categories') return {
        insert: () => ({ select: () => ({ single: async () => ({ data: null, error: { code: '23505', message: 'duplicate key' } }) }) }),
        select: () => query([category]),
      };
      return { select: () => query([]) };
    };
    await createV2SyncRunner({ client, database }).sync(USER_A);
    expect(await database.outbox_operations.get(operation.operation_id)).toMatchObject({ status: 'succeeded', reconciled_at: expect.any(String), server_receipt: { recovered_duplicate: true } });
    expect(await database.categories.get('c')).toMatchObject(category);
  });

  it('makes an unresolved duplicate category create a finite conflict', async () => {
    const database = await freshDatabase();
    const operation = await createOutboxOperation({ operation_id: 'category-unresolved', user_id: USER_A, entity_type: 'category', action: 'create', entity_id: 'c', payload: { id: 'c', user_id: USER_A, name: 'Tools' } }, database);
    const client = mockClient();
    client.from = (table) => table === 'categories'
      ? { insert: () => ({ select: () => ({ single: async () => ({ data: null, error: { code: '23505', message: 'duplicate key' } }) }) }), select: () => query([]) }
      : { select: () => query([]) };
    await createV2SyncRunner({ client, database }).sync(USER_A);
    expect(await database.outbox_operations.get(operation.operation_id)).toMatchObject({ status: 'conflict', last_error_code: 'category_duplicate_unresolved' });
  });

  it('persists a transient duplicate-category lookup failure for retry instead of leaving syncing', async () => {
    const database = await freshDatabase();
    const operation = await createOutboxOperation({ operation_id: 'category-lookup-network', user_id: USER_A, entity_type: 'category', action: 'create', entity_id: 'c', payload: { id: 'c', user_id: USER_A, name: 'Tools' } }, database);
    const client = mockClient();
    client.from = (table) => table === 'categories'
      ? {
          insert: () => ({ select: () => ({ single: async () => ({ data: null, error: { code: '23505', message: 'duplicate key' } }) }) }),
          select: () => ({ eq: () => ({ single: async () => ({ data: null, error: { message: 'network fetch failed' } }), then: (resolve) => resolve({ data: [], error: null }) }) }),
        }
      : { select: () => query([]) };
    await expect(createV2SyncRunner({ client, database }).sync(USER_A)).resolves.toBeTruthy();
    expect(await database.outbox_operations.get(operation.operation_id)).toMatchObject({ status: 'retryable_failed', last_error_code: 'network', next_attempt_at: expect.any(String) });
  });

  it('does not reconcile duplicate category recovery after account invalidation during canonical fetch', async () => {
    const database = await freshDatabase();
    const category = { id: 'c', user_id: USER_A, name: 'Tools' };
    const operation = await createOutboxOperation({ operation_id: 'category-stale', user_id: USER_A, entity_type: 'category', action: 'create', entity_id: 'c', payload: category }, database);
    let resolveFetch;
    let fetchStarted;
    const started = new Promise((resolve) => { fetchStarted = resolve; });
    const delayedFetch = new Promise((resolve) => { resolveFetch = resolve; });
    const client = mockClient();
    client.from = (table) => table === 'categories'
      ? {
          insert: () => ({ select: () => ({ single: async () => ({ data: null, error: { code: '23505', message: 'duplicate key' } }) }) }),
          select: () => ({ eq: () => ({ single: async () => { fetchStarted(); return delayedFetch; } }) }),
        }
      : { select: () => query([]) };
    const runner = createV2SyncRunner({ client, database });
    const run = runner.sync(USER_A);
    await started;
    runner.invalidate();
    resolveFetch({ data: category, error: null });
    expect(await run).toMatchObject({ cancelled: true });
    expect(await database.categories.get('c')).toBeUndefined();
    expect(await database.outbox_operations.get(operation.operation_id)).toMatchObject({ status: 'syncing', reconciled_at: null });
  });

  it('does not advance the movement cursor when canonical merge fails', async () => {
    const database = await freshDatabase();
    const remoteMovement = { id: 'm', user_id: USER_A, product_id: 'p', movement_type: 'opening', qty_change: '1', server_sequence: 3 };
    const client = mockClient({ tables: { products: [], categories: [], inventory_balances: [], stock_movements: [remoteMovement] } });
    const originalPut = database.inventory_movements.put.bind(database.inventory_movements);
    database.inventory_movements.put = async () => { throw new Error('simulated merge failure'); };
    await expect(pullUserState(USER_A, { client, database })).rejects.toThrow('simulated merge failure');
    database.inventory_movements.put = originalPut;
    expect(await database.sync_state.get(`v2:movement_cursor:${USER_A}`)).toBeUndefined();
  });
});
