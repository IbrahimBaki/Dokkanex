import Dexie from 'dexie';
import { afterEach, describe, expect, it } from 'vitest';
import { createDatabase } from '../../src/lib/db';
import { addQuantities, compareQuantities, formatQuantity, normalizeQuantity, subtractQuantities } from '../../src/lib/quantity';
import {
  addStock, buildInventoryRows, filterInventoryRows, getInventoryStatus, getProductStockActivity, getUserInventoryBalanceMap, initializeStock, isInventoryInitialized, recordDamageLoss, recordStockCount,
  removeStock, replayPendingProjection, getLatestInventoryTail,
} from '../../src/lib/inventoryLocal';
import { recordPurchase } from '../../src/lib/purchasesV2';
import { recomputeProduct } from '../../src/lib/v2Sync';
import {
  cleanupSucceededOutbox, createOutboxOperation, getProjectableOutbox,
  proveLegacyQueueOwnership, recoverAbandonedSyncing, transitionOutboxOperation,
} from '../../src/lib/outbox';

const databases = [];
const USER_A = 'user-a';
const USER_B = 'user-b';

async function freshDatabase(label = crypto.randomUUID()) {
  const database = createDatabase(`V3-test-${label}`);
  databases.push(database);
  await database.open();
  return database;
}

async function product(database, id, userId = USER_A, threshold = null) {
  await database.products.put({ id, user_id: userId, name: id, low_stock_threshold: threshold });
}

afterEach(async () => {
  await Promise.all(databases.splice(0).map(async (database) => {
    database.close();
    await database.delete();
  }));
});

describe('decimal quantity utility', () => {
  it('normalizes valid six-place quantities without Number arithmetic', () => {
    expect(normalizeQuantity(2)).toBe('2.000000');
    expect(normalizeQuantity('2.0000000')).toBe('2.000000');
    expect(normalizeQuantity('2.125')).toBe('2.125000');
    expect(normalizeQuantity('0.000001')).toBe('0.000001');
    expect(normalizeQuantity('-2.5')).toBe('-2.500000');
    expect(addQuantities('0.1', '0.2')).toBe('0.300000');
    expect(subtractQuantities('1', '0.875')).toBe('0.125000');
    expect(compareQuantities('2.0', '2.000000')).toBe(0);
    expect(formatQuantity('2.125000')).toBe('2.125');
  });

  it('rejects invalid, infinite, and meaningful over-precision input', () => {
    for (const value of ['invalid', 'Infinity', '0.0000001', Number.NaN, Number.POSITIVE_INFINITY]) {
      expect(() => normalizeQuantity(value)).toThrow();
    }
  });
});

describe('Dexie V2 to V3 upgrade', () => {
  it('preserves legacy stores and invents no inventory state', async () => {
    const name = `upgrade-${crypto.randomUUID()}`;
    const v2 = new Dexie(name);
    v2.version(2).stores({
      products: 'id, name, category_id, user_id, created_at, updated_at, image_url, image_base64',
      categories: 'id, name, user_id, created_at',
      sync_queue: '++id, table_name, operation, record_id, created_at',
      app_meta: 'key',
    });
    await v2.open();
    await v2.products.put({ id: 'legacy-product', user_id: USER_A, name: 'Legacy' });
    await v2.categories.put({ id: 'legacy-category', user_id: USER_A, name: 'Category' });
    await v2.sync_queue.add({ table_name: 'products', operation: 'UPDATE', record_id: 'legacy-product', data: {}, created_at: 'old' });
    await v2.app_meta.put({ key: 'last_sync', value: 'old' });
    v2.close();
    const upgraded = createDatabase(name);
    databases.push(upgraded);
    await upgraded.open();
    expect(await upgraded.products.get('legacy-product')).toMatchObject({ user_id: USER_A });
    expect(await upgraded.categories.get('legacy-category')).toMatchObject({ user_id: USER_A });
    expect(await upgraded.sync_queue.count()).toBe(1);
    expect(await upgraded.app_meta.get('last_sync')).toMatchObject({ value: 'old' });
    expect(await upgraded.inventory_balances.count()).toBe(0);
    expect(getInventoryStatus(null)).toBe('stock_not_set');
    expect(upgraded.tables.map((table) => table.name)).toContain('outbox_operations');
  });
});

describe('local V2 inventory commands and projection', () => {
  it('creates a pending zero/decimal opening and FIFO dependencies without inventing remote state', async () => {
    const database = await freshDatabase();
    await product(database, 'p1');
    const opening = await initializeStock({ userId: USER_A, productId: 'p1', quantity: '0' }, database);
    expect(opening.balance).toMatchObject({ server_initialized: false, locally_initialized: true, current_quantity: '0.000000', projected_revision: 1 });
    const add = await addStock({ userId: USER_A, productId: 'p1', quantity: '2.125' }, database);
    const remove = await removeStock({ userId: USER_A, productId: 'p1', quantity: '-3' }, database);
    expect(add.operation.depends_on).toBe(opening.operation.operation_id);
    expect(remove.operation.depends_on).toBe(add.operation.operation_id);
    expect(remove.balance.current_quantity).toBe('-0.875000');
    expect(remove.would_be_negative).toBe(true);
    const movements = await database.inventory_movements.where('product_id').equals('p1').toArray();
    expect(movements.map((movement) => movement.id)).toContain(opening.operation.operation_id);
  });

  it('adjusts add/remove/damage/count locally with confirmation and FIFO safety', async () => {
    const database = await freshDatabase(); await product(database, 'adjust'); await initializeStock({ userId: USER_A, productId: 'adjust', quantity: '20' }, database);
    const add = await addStock({ userId: USER_A, productId: 'adjust', quantity: '5' }, database); expect(add.balance.current_quantity).toBe('25.000000');
    const remove = await removeStock({ userId: USER_A, productId: 'adjust', quantity: '-3' }, database); expect(remove.balance.current_quantity).toBe('22.000000');
    const damage = await recordDamageLoss({ userId: USER_A, productId: 'adjust', quantity: '-2' }, database); expect(damage).toMatchObject({ balance:{current_quantity:'20.000000'}, movement:{movement_type:'damage_loss'} });
    const count = await recordStockCount({ userId: USER_A, productId: 'adjust', countedQuantity: '18' }, database); expect(count.balance.current_quantity).toBe('18.000000');
    const noChange = await recordStockCount({ userId: USER_A, productId: 'adjust', countedQuantity: '18' }, database); expect(noChange.status).toBe('no_change');
    expect(count.operation.depends_on).toBe(damage.operation.operation_id); expect(await database.sync_queue.count()).toBe(0);
  });

  it('requires transactional confirmation before negative remove and uses latest balance', async () => {
    const database=await freshDatabase(); await product(database,'negative'); await initializeStock({userId:USER_A,productId:'negative',quantity:'3'},database);
    const beforeMovements=await database.inventory_movements.count(), beforeOps=await database.outbox_operations.count(); const warning=await removeStock({userId:USER_A,productId:'negative',quantity:'-5',allowNegative:false},database);
    expect(warning).toEqual({status:'negative_confirmation_required',before_quantity:'3.000000',after_quantity:'-2.000000'}); expect(await database.inventory_movements.count()).toBe(beforeMovements);expect(await database.outbox_operations.count()).toBe(beforeOps);
    const committed=await removeStock({userId:USER_A,productId:'negative',quantity:'-5',allowNegative:true},database);expect(committed.balance.current_quantity).toBe('-2.000000');expect(getInventoryStatus(committed.balance)).toBe('out_of_stock');
  });

  it('revalidates a negative confirmation against the exact latest balance before commit', async () => {
    const database=await freshDatabase(); await product(database,'race'); await initializeStock({userId:USER_A,productId:'race',quantity:'3'},database);
    const first=await removeStock({userId:USER_A,productId:'race',quantity:'-5',allowNegative:false},database); expect(first).toMatchObject({before_quantity:'3.000000',after_quantity:'-2.000000'});
    await addStock({userId:USER_A,productId:'race',quantity:'1'},database); const movementsBefore=await database.inventory_movements.count(), outboxBefore=await database.outbox_operations.count();
    const refreshed=await removeStock({userId:USER_A,productId:'race',quantity:'-5',allowNegative:true,confirmedBeforeQuantity:first.before_quantity},database);
    expect(refreshed).toEqual({status:'negative_confirmation_required',before_quantity:'4.000000',after_quantity:'-1.000000'}); expect(await database.inventory_movements.count()).toBe(movementsBefore); expect(await database.outbox_operations.count()).toBe(outboxBefore);
    const committed=await removeStock({userId:USER_A,productId:'race',quantity:'-5',allowNegative:true,confirmedBeforeQuantity:refreshed.before_quantity},database); expect(committed.balance.current_quantity).toBe('-1.000000'); expect(await database.inventory_movements.count()).toBe(movementsBefore+1);
  });

  it('supports damage, count adjustment/no-change, and status distinctions', async () => {
    const database = await freshDatabase();
    await product(database, 'p2', USER_A, '2');
    expect(getInventoryStatus(null, '2')).toBe('stock_not_set');
    await initializeStock({ userId: USER_A, productId: 'p2', quantity: '5' }, database);
    const damage = await recordDamageLoss({ userId: USER_A, productId: 'p2', quantity: '-4' }, database);
    expect(getInventoryStatus(damage.balance, '2')).toBe('low_stock');
    const noChange = await recordStockCount({ userId: USER_A, productId: 'p2', countedQuantity: '1' }, database);
    expect(noChange.status).toBe('no_change');
    const adjustment = await recordStockCount({ userId: USER_A, productId: 'p2', countedQuantity: '3' }, database);
    expect(adjustment.movement).toMatchObject({ movement_type: 'stock_count', qty_change: '2.000000', base_balance: '1.000000', base_revision: 2 });
    expect(adjustment.balance.current_quantity).toBe('3.000000');
    await expect(recordStockCount({ userId: USER_A, productId: 'p2', countedQuantity: '-1' }, database)).rejects.toThrow();
  });

  it('uses exactly the four stock states without treating unset stock as zero', () => {
    expect(getInventoryStatus(null, '2')).toBe('stock_not_set');
    expect(getInventoryStatus({ locally_initialized: false, server_initialized: false }, '2')).toBe('stock_not_set');
    expect(getInventoryStatus({ locally_initialized: true, current_quantity: '0.000000' }, null)).toBe('out_of_stock');
    expect(getInventoryStatus({ locally_initialized: true, current_quantity: '-2.125000' }, null)).toBe('out_of_stock');
    expect(formatQuantity('-2.125000')).toBe('-2.125');
    expect(getInventoryStatus({ locally_initialized: true, current_quantity: '3.000000' }, '2')).toBe('in_stock');
    expect(getInventoryStatus({ locally_initialized: true, current_quantity: '2.000000' }, '2')).toBe('low_stock');
    expect(getInventoryStatus({ locally_initialized: true, current_quantity: '0.125000' }, null)).toBe('in_stock');
  });

  it('distinguishes Stock not set from initialized stock for ProductForm unit locking', () => {
    expect(isInventoryInitialized(null)).toBe(false);
    expect(isInventoryInitialized({ locally_initialized: false, server_initialized: false })).toBe(false);
    expect(isInventoryInitialized({ locally_initialized: true, server_initialized: false })).toBe(true);
    expect(isInventoryInitialized({ locally_initialized: false, server_initialized: true })).toBe(true);
  });

  it('loads only the active user inventory balance map and prevents duplicate opening stock', async () => {
    const database = await freshDatabase();
    await product(database, 'a', USER_A);
    await product(database, 'b', USER_B);
    const zero = await initializeStock({ userId: USER_A, productId: 'a', quantity: '0' }, database);
    await initializeStock({ userId: USER_B, productId: 'b', quantity: '2.125' }, database);
    const map = await getUserInventoryBalanceMap(USER_A, database);
    expect(map.get('a')).toMatchObject({ user_id: USER_A, current_quantity: '0.000000' });
    expect(map.has('b')).toBe(false);
    await expect(initializeStock({ userId: USER_A, productId: 'a', quantity: '1' }, database)).rejects.toThrow('already initialized');
    expect(await database.inventory_movements.where('product_id').equals('a').count()).toBe(1);
    expect(zero.operation.depends_on).toBeNull();
    expect(await database.sync_queue.count()).toBe(0);
  });

  it('builds an isolated inventory view and composes search with the four required filters', () => {
    const products = [
      { id: 'unset', user_id: USER_A, name: 'Legacy tea', unit: 'piece', low_stock_threshold: null, category_id: 'ca' },
      { id: 'zero', user_id: USER_A, name: 'Zero rice', unit: 'pack', low_stock_threshold: null, category_id: 'ca' },
      { id: 'negative', user_id: USER_A, name: 'Negative flour', unit: 'kilogram', low_stock_threshold: null, category_id: null },
      { id: 'low', user_id: USER_A, name: 'Low sugar', unit: 'pack', low_stock_threshold: '2', category_id: 'ca' },
      { id: 'normal', user_id: USER_A, name: 'Normal coffee', unit: 'piece', low_stock_threshold: null, category_id: null },
      { id: 'other', user_id: USER_B, name: 'Other user', unit: 'piece', low_stock_threshold: null, category_id: 'cb' },
    ];
    const categories = [{ id: 'ca', user_id: USER_A, name: 'Food' }, { id: 'cb', user_id: USER_B, name: 'Other' }];
    const balanceMap = new Map([
      ['zero', { product_id: 'zero', user_id: USER_A, locally_initialized: true, current_quantity: '0.000000' }],
      ['negative', { product_id: 'negative', user_id: USER_A, locally_initialized: true, current_quantity: '-1.250000' }],
      ['low', { product_id: 'low', user_id: USER_A, locally_initialized: true, current_quantity: '2.000000' }],
      ['normal', { product_id: 'normal', user_id: USER_A, locally_initialized: true, current_quantity: '0.125000' }],
      ['other', { product_id: 'other', user_id: USER_B, locally_initialized: true, current_quantity: '9.000000' }],
    ]);
    const rows = buildInventoryRows({ userId: USER_A, products, categories, balanceMap });
    expect(rows.map((row) => row.product.id)).toEqual(['unset', 'zero', 'negative', 'low', 'normal']);
    expect(rows.find((row) => row.product.id === 'unset').status).toBe('stock_not_set');
    expect(rows.find((row) => row.product.id === 'zero').status).toBe('out_of_stock');
    expect(rows.find((row) => row.product.id === 'negative')).toMatchObject({ status: 'out_of_stock', balance: { current_quantity: '-1.250000' } });
    expect(filterInventoryRows(rows, '', 'low_stock').map((row) => row.product.id)).toEqual(['low']);
    expect(filterInventoryRows(rows, 'rice', 'out_of_stock').map((row) => row.product.id)).toEqual(['zero']);
    expect(filterInventoryRows(rows, 'food', 'stock_not_set').map((row) => row.product.id)).toEqual(['unset']);
    expect(filterInventoryRows(rows, '', 'all').map((row) => row.product.id)).not.toContain('other');
  });

  it('shows pending null-server-sequence activity immediately and keeps UUID reconciliation singular', async () => {
    const database=await freshDatabase(); await product(database,'activity'); const opening=await initializeStock({userId:USER_A,productId:'activity',quantity:'1'},database); const add=await addStock({userId:USER_A,productId:'activity',quantity:'2'},database);
    await database.inventory_movements.update(opening.movement.id,{client_created_at:'2026-01-01T00:00:00.000Z',sequence:1,server_sequence:null}); await database.inventory_movements.update(add.movement.id,{client_created_at:'2026-01-01T00:00:00.000Z',sequence:2,server_sequence:null});
    let activity=await getProductStockActivity({userId:USER_A,productId:'activity'},database); expect(activity.map(x=>x.id)).toEqual([add.movement.id,opening.movement.id]); expect(activity[0].sync_state).toBe('pending');
    await database.inventory_movements.put({...add.movement,user_id:USER_A,product_id:'activity',status:'accepted',server_sequence:9,posted_at:'2026-01-02T00:00:00.000Z'}); await database.outbox_operations.update(add.operation.operation_id,{status:'succeeded'});
    activity=await getProductStockActivity({userId:USER_A,productId:'activity'},database); expect(activity.filter(x=>x.id===add.movement.id)).toHaveLength(1); expect(activity.find(x=>x.id===add.movement.id).sync_state).toBe('synced'); expect(activity.length).toBeLessThanOrEqual(20);
  });

  it('replays only pending business intent deterministically', () => {
    const projected = replayPendingProjection(
      { server_initialized: true, server_quantity: '10', server_revision: 4 },
      [
        { sequence: 3, status: 'pending', movement_type: 'manual_remove', qty_change: '-2' },
        { sequence: 2, status: 'retryable_failed', movement_type: 'manual_add', qty_change: '1' },
        { sequence: 4, status: 'conflict', movement_type: 'manual_add', qty_change: '99' },
        { sequence: 5, status: 'pending', movement_type: 'stock_count', counted_quantity: '7', qty_change: '-2' },
      ],
    );
    expect(projected).toEqual({ initialized: true, current_quantity: '7.000000', projected_revision: 7 });
  });

  it('makes a multi-product purchase wait for each product inventory tail', async () => {
    const database = await freshDatabase();
    await product(database, 'purchase-a'); await product(database, 'purchase-b');
    const a = await initializeStock({ userId: USER_A, productId: 'purchase-a', quantity: '1' }, database);
    const b = await initializeStock({ userId: USER_A, productId: 'purchase-b', quantity: '1' }, database);
    const purchase = await recordPurchase({ userId: USER_A, lines: [
      { productId: 'purchase-a', quantity: '3', unitCost: '1' },
      { productId: 'purchase-b', quantity: '2', unitCost: '1' },
    ] }, database);
    expect(purchase.operation.depends_on_many.sort()).toEqual([a.operation.operation_id, b.operation.operation_id].sort());
  });

  it('makes a manual inventory operation wait behind a pending purchase', async () => {
    const database = await freshDatabase(); await product(database, 'purchase-follow');
    await initializeStock({ userId: USER_A, productId: 'purchase-follow', quantity: '1' }, database);
    const purchase = await recordPurchase({ userId: USER_A, lines: [{ productId: 'purchase-follow', quantity: '3', unitCost: '1' }] }, database);
    const adjustment = await addStock({ userId: USER_A, productId: 'purchase-follow', quantity: '1' }, database);
    expect(adjustment.operation.depends_on).toBe(purchase.operation.operation_id);
  });

  it('replays a pending purchase over a pulled canonical balance', async () => {
    const database = await freshDatabase(); await product(database, 'purchase-projection');
    await database.inventory_balances.put({ product_id: 'purchase-projection', user_id: USER_A, server_initialized: true, server_quantity: '10.000000', server_revision: 1, locally_initialized: true, current_quantity: '10.000000', projected_revision: 1, pending_count: 0 });
    await createOutboxOperation({ operation_id: 'purchase-projection-op', user_id: USER_A, entity_type: 'purchase', action: 'post', entity_id: 'purchase-projection-doc', payload: { lines: [{ product_id: 'purchase-projection' }] } }, database);
    await database.inventory_movements.add({ id: 'purchase-projection-movement', user_id: USER_A, product_id: 'purchase-projection', movement_type: 'purchase', qty_change: '3.000000', source_operation_id: 'purchase-projection-op', status: 'pending', client_created_at: '2026-01-01T00:00:00.000Z' });
    const balance = await recomputeProduct(USER_A, 'purchase-projection', database);
    expect(balance.current_quantity).toBe('13.000000');
  });

  it('uses a purchase owner operation for stock activity status', async () => {
    const database = await freshDatabase(); await product(database, 'purchase-activity');
    await createOutboxOperation({ operation_id: 'purchase-activity-op', user_id: USER_A, entity_type: 'purchase', action: 'post', entity_id: 'purchase-activity-doc', payload: { lines: [{ product_id: 'purchase-activity' }] } }, database);
    await database.inventory_movements.add({ id: 'purchase-activity-movement', user_id: USER_A, product_id: 'purchase-activity', movement_type: 'purchase', qty_change: '3.000000', source_operation_id: 'purchase-activity-op', status: 'pending', client_created_at: '2026-01-01T00:00:00.000Z' });
    expect((await getProductStockActivity({ userId: USER_A, productId: 'purchase-activity' }, database))[0].sync_state).toBe('pending');
    await database.outbox_operations.update('purchase-activity-op', { status: 'conflict' });
    expect((await getProductStockActivity({ userId: USER_A, productId: 'purchase-activity' }, database))[0].sync_state).toBe('needs_attention');
  });

  it('never uses another user purchase as a local inventory tail or projection source', async () => {
    const database = await freshDatabase(); await product(database, 'isolated-purchase', USER_A);
    await database.inventory_balances.put({ product_id: 'isolated-purchase', user_id: USER_A, server_initialized: true, server_quantity: '10.000000', server_revision: 1, locally_initialized: true, current_quantity: '10.000000', projected_revision: 1, pending_count: 0 });
    await createOutboxOperation({ operation_id: 'other-user-purchase', user_id: USER_B, entity_type: 'purchase', action: 'post', entity_id: 'other-user-doc', payload: { lines: [{ product_id: 'isolated-purchase' }] } }, database);
    await database.inventory_movements.add({ id: 'other-user-purchase-movement', user_id: USER_B, product_id: 'isolated-purchase', movement_type: 'purchase', qty_change: '3.000000', source_operation_id: 'other-user-purchase', status: 'pending', client_created_at: '2026-01-01T00:00:00.000Z' });
    expect(await getLatestInventoryTail(USER_A, 'isolated-purchase', database)).toBeNull();
    expect((await recomputeProduct(USER_A, 'isolated-purchase', database)).current_quantity).toBe('10.000000');
  });
});

describe('outbox state, sequence, bridge, and isolation', () => {
  it('allocates durable unique per-user sequences under rapid concurrent writes', async () => {
    const database = await freshDatabase();
    const operations = await Promise.all(Array.from({ length: 10 }, (_, index) => createOutboxOperation({
      operation_id: `a-${index}`, user_id: USER_A, entity_type: 'inventory_movement', action: 'post', entity_id: 'p', payload: {},
    }, database)));
    expect(operations.map((operation) => operation.sequence).sort((a, b) => a - b)).toEqual([1,2,3,4,5,6,7,8,9,10]);
    const other = await createOutboxOperation({ operation_id: 'b-1', user_id: USER_B, entity_type: 'inventory_movement', action: 'post', entity_id: 'p', payload: {} }, database);
    expect(other.sequence).toBe(1);
  });

  it('keeps user partitions and legacy queue ownership boundaries separate', async () => {
    const database = await freshDatabase();
    await product(database, 'a-product', USER_A);
    await product(database, 'b-product', USER_B);
    await initializeStock({ userId: USER_A, productId: 'a-product', quantity: '1' }, database);
    await initializeStock({ userId: USER_B, productId: 'b-product', quantity: '2' }, database);
    expect(await database.inventory_balances.where('user_id').equals(USER_A).count()).toBe(1);
    expect(await database.inventory_movements.where('user_id').equals(USER_B).count()).toBe(1);
    expect((await getProjectableOutbox(USER_A, 'a-product', database)).every((operation) => operation.user_id === USER_A)).toBe(true);
    expect((await getProjectableOutbox(USER_A, 'b-product', database))).toEqual([]);
    await database.sync_queue.add({ table_name: 'products', operation: 'UPDATE', record_id: 'a-product', data: {}, created_at: 'old' });
    const legacy = await database.sync_queue.toCollection().first();
    expect(await proveLegacyQueueOwnership(legacy, USER_A, database)).toMatchObject({ proven: true });
    expect(await proveLegacyQueueOwnership({ table_name: 'products', record_id: 'missing', data: {} }, USER_A, database)).toMatchObject({ proven: false });
    expect(await database.inventory_balances.where('user_id').equals(USER_B).count()).toBe(1);
  });

  it('manages outbox transitions, recovery, projection eligibility, and retention safely', async () => {
    const database = await freshDatabase();
    const first = await createOutboxOperation({ operation_id: 'one', user_id: USER_A, entity_type: 'inventory_movement', action: 'post', entity_id: 'p', payload: {} }, database);
    const firstAttempt = await transitionOutboxOperation(first.operation_id, 'syncing', { status: 'succeeded', attempt_count: 99, last_attempt_at: 'not-allowed' }, database);
    expect(firstAttempt).toMatchObject({ status: 'syncing', attempt_count: 1 });
    expect(firstAttempt.last_attempt_at).not.toBe('not-allowed');
    await transitionOutboxOperation(first.operation_id, 'retryable_failed', { last_error_code: 'offline' }, database);
    expect((await getProjectableOutbox(USER_A, 'p', database)).map((row) => row.operation_id)).toEqual(['one']);
    const retryAttempt = await transitionOutboxOperation(first.operation_id, 'syncing', {}, database);
    expect(retryAttempt.attempt_count).toBe(2);
    await transitionOutboxOperation(first.operation_id, 'conflict', {}, database);
    expect(await getProjectableOutbox(USER_A, 'p', database)).toEqual([]);
    await expect(transitionOutboxOperation(first.operation_id, 'pending', {}, database)).rejects.toThrow();
    await expect(transitionOutboxOperation(first.operation_id, 'syncing', {}, database)).rejects.toThrow();
    const blocked = await createOutboxOperation({ operation_id: 'blocked', user_id: USER_A, entity_type: 'inventory_movement', action: 'post', entity_id: 'p', payload: {}, depends_on: 'missing' }, database);
    await transitionOutboxOperation(blocked.operation_id, 'blocked', {}, database);
    expect((await database.outbox_operations.get(blocked.operation_id)).status).toBe('blocked');
    const retryBlocked = await createOutboxOperation({ operation_id: 'retry-blocked', user_id: USER_A, entity_type: 'inventory_movement', action: 'post', entity_id: 'p', payload: {} }, database);
    await transitionOutboxOperation(retryBlocked.operation_id, 'syncing', {}, database);
    await transitionOutboxOperation(retryBlocked.operation_id, 'retryable_failed', {}, database);
    await transitionOutboxOperation(retryBlocked.operation_id, 'blocked', {}, database);
    expect((await database.outbox_operations.get(retryBlocked.operation_id)).status).toBe('blocked');
    const permanent = await createOutboxOperation({ operation_id: 'permanent', user_id: USER_A, entity_type: 'inventory_movement', action: 'post', entity_id: 'p', payload: {} }, database);
    await transitionOutboxOperation(permanent.operation_id, 'syncing', {}, database);
    await transitionOutboxOperation(permanent.operation_id, 'permanent_failed', {}, database);
    await expect(transitionOutboxOperation(permanent.operation_id, 'pending', {}, database)).rejects.toThrow();
    await expect(transitionOutboxOperation(permanent.operation_id, 'syncing', {}, database)).rejects.toThrow();
    const succeeded = await createOutboxOperation({ operation_id: 'succeeded', user_id: USER_A, entity_type: 'inventory_movement', action: 'post', entity_id: 'p', payload: {} }, database);
    await transitionOutboxOperation(succeeded.operation_id, 'syncing', {}, database);
    await transitionOutboxOperation(succeeded.operation_id, 'succeeded', { server_receipt: { ok: true } }, database);
    await expect(transitionOutboxOperation(succeeded.operation_id, 'pending', {}, database)).rejects.toThrow();
    await expect(transitionOutboxOperation(succeeded.operation_id, 'syncing', {}, database)).rejects.toThrow();
    const abandoned = await createOutboxOperation({ operation_id: 'two', user_id: USER_A, entity_type: 'inventory_movement', action: 'post', entity_id: 'p', payload: {} }, database);
    await transitionOutboxOperation(abandoned.operation_id, 'syncing', {}, database);
    const fresh = await createOutboxOperation({ operation_id: 'fresh', user_id: USER_A, entity_type: 'inventory_movement', action: 'post', entity_id: 'p', payload: {} }, database);
    const freshSyncing = await transitionOutboxOperation(fresh.operation_id, 'syncing', {}, database);
    const durable = await createOutboxOperation({ operation_id: 'three', user_id: USER_A, entity_type: 'inventory_movement', action: 'post', entity_id: 'p', payload: {} }, database);
    await transitionOutboxOperation(durable.operation_id, 'syncing', { server_receipt: { status: 'accepted' } }, database);
    await database.outbox_operations.update(abandoned.operation_id, { last_attempt_at: new Date(Date.now() - 10_000).toISOString() });
    await database.outbox_operations.update(durable.operation_id, { last_attempt_at: new Date(Date.now() - 10_000).toISOString() });
    expect(await recoverAbandonedSyncing(USER_A, { staleAfterMs: 5_000, now: Date.now() }, database)).toBe(1);
    expect((await database.outbox_operations.get(abandoned.operation_id)).status).toBe('pending');
    expect((await database.outbox_operations.get(durable.operation_id)).status).toBe('syncing');
    expect((await database.outbox_operations.get(freshSyncing.operation_id)).status).toBe('syncing');
    for (const id of ['old-1', 'old-2']) {
      const op = await createOutboxOperation({ operation_id: id, user_id: USER_A, entity_type: 'inventory_movement', action: 'post', entity_id: 'p', payload: {} }, database);
      await transitionOutboxOperation(op.operation_id, 'syncing', {}, database);
      await transitionOutboxOperation(op.operation_id, 'succeeded', { server_receipt: { ok: true }, reconciled_at: new Date().toISOString() }, database);
    }
    expect(await cleanupSucceededOutbox(USER_A, { keepRecent: 1 }, database)).toBe(1);
  });
});
