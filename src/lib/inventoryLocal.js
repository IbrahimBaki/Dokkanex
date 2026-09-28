import { db as defaultDb } from './db';
import { addQuantities, compareQuantities, normalizeQuantity, normalizeQuantityForUnit, subtractQuantities } from './quantity';
import { createOutboxOperation, getProjectableOutbox } from './outbox';
import { v4 as uuidv4 } from 'uuid';

const PROJECTABLE = new Set(['pending', 'syncing', 'retryable_failed']);

async function ownedProduct(userId, productId, database) {
  const product = await database.products.get(productId);
  if (!product || product.user_id !== userId) throw new Error('Product does not belong to this user');
  return product;
}

export function isInventoryInitialized(balance) {
  return Boolean(balance?.locally_initialized || balance?.server_initialized);
}

function statusFor(balance, threshold) {
  if (!isInventoryInitialized(balance)) return 'stock_not_set';
  if (compareQuantities(balance.current_quantity, '0') <= 0) return 'out_of_stock';
  if (threshold !== null && threshold !== undefined && compareQuantities(balance.current_quantity, threshold) <= 0) return 'low_stock';
  return 'in_stock';
}

export function getInventoryStatus(balance, threshold = null) {
  return statusFor(balance, threshold);
}

export async function getUserInventoryBalanceMap(userId, database = defaultDb) {
  const balances = await database.inventory_balances.where('user_id').equals(userId).toArray();
  return new Map(balances.map((balance) => [balance.product_id, balance]));
}

export function buildInventoryRows({ userId, products, categories, balanceMap }) {
  const categoriesById = new Map(categories.filter((category) => category.user_id === userId).map((category) => [category.id, category]));
  return products.filter((product) => product.user_id === userId).map((product) => {
    const candidate = balanceMap.get(product.id);
    const balance = candidate?.user_id === userId ? candidate : null;
    return { product, balance, category: categoriesById.get(product.category_id) ?? null, status: getInventoryStatus(balance, product.low_stock_threshold ?? null) };
  });
}

export function filterInventoryRows(rows, search, filter) {
  const query = search.trim().toLocaleLowerCase();
  return rows.filter((row) => {
    const matchesSearch = !query || row.product.name.toLocaleLowerCase().includes(query) || row.category?.name?.toLocaleLowerCase().includes(query);
    const matchesFilter = filter === 'all' || row.status === filter;
    return matchesSearch && matchesFilter;
  });
}

export async function getProductStockActivity({ userId, productId, limit = 20 }, database = defaultDb) {
  const product = await ownedProduct(userId, productId, database);
  if (!product) throw new Error('Product does not belong to this user');
  const [movements, operations] = await Promise.all([
    database.inventory_movements.where('product_id').equals(productId).toArray(),
    database.outbox_operations.where('user_id').equals(userId).toArray(),
  ]);
  const operationById = new Map(operations.map((operation) => [operation.operation_id, operation]));
  return movements.filter((movement) => movement.user_id === userId && movement.product_id === productId).map((movement) => {
    const operation = operationById.get(movement.source_operation_id ?? movement.id);
    const rawStatus = operation?.status ?? (movement.status === 'accepted' ? 'succeeded' : movement.status);
    const sync_state = ['conflict', 'blocked', 'permanent_failed'].includes(rawStatus) ? 'needs_attention' : ['succeeded', 'accepted'].includes(rawStatus) ? 'synced' : 'pending';
    return { ...movement, sync_state };
  }).sort((a, b) => {
    const at = Date.parse(a.posted_at ?? a.client_created_at ?? 0); const bt = Date.parse(b.posted_at ?? b.client_created_at ?? 0);
    return bt - at || (b.server_sequence ?? -1) - (a.server_sequence ?? -1) || (b.sequence ?? -1) - (a.sequence ?? -1) || String(b.id).localeCompare(String(a.id));
  }).slice(0, limit);
}

export function replayPendingProjection(canonical, pendingMovements) {
  let initialized = Boolean(canonical?.server_initialized);
  let quantity = initialized ? normalizeQuantity(canonical.server_quantity) : null;
  let revision = canonical?.server_revision ?? 0;
  for (const movement of [...pendingMovements].sort((a, b) => a.sequence - b.sequence)) {
    if (!PROJECTABLE.has(movement.status)) continue;
    if (movement.movement_type === 'opening') {
      if (initialized) throw new Error('Opening cannot replay over initialized stock');
      initialized = true;
      quantity = normalizeQuantity(movement.qty_change);
      revision += 1;
    } else if (!initialized) {
      throw new Error('Inventory movement depends on opening stock');
    } else if (movement.movement_type === 'stock_count') {
      quantity = normalizeQuantity(movement.counted_quantity);
      revision += 1;
    } else {
      quantity = addQuantities(quantity, movement.qty_change);
      revision += 1;
    }
  }
  return { initialized, current_quantity: quantity, projected_revision: revision };
}

export async function getLatestInventoryTail(userId, productId, database = defaultDb) {
  const rows = await database.outbox_operations.where('user_id').equals(userId).toArray();
  return rows.filter(row => !row.reconciled_at && ((row.entity_type === 'inventory_movement' && row.entity_id === productId) || (['purchase', 'sale'].includes(row.entity_type) && row.payload?.lines?.some(line => line.product_id === productId)))).sort((a,b)=>a.sequence-b.sequence).at(-1)?.operation_id ?? null;
}

export async function getProjectableInventoryMovements(userId, productId, database = defaultDb) {
  const [movements, operations] = await Promise.all([database.inventory_movements.where('product_id').equals(productId).toArray(), database.outbox_operations.where('user_id').equals(userId).toArray()]);
  const byId=new Map(operations.map(operation=>[operation.operation_id,operation]));
  return movements.filter(movement=>movement.user_id===userId&&movement.product_id===productId).map(movement=>({movement,operation:byId.get(movement.source_operation_id??movement.id)})).filter(({movement,operation})=>PROJECTABLE.has(operation?.status) || (['purchase', 'sale'].includes(operation?.entity_type) && operation.status === 'succeeded' && movement.status !== 'accepted')).sort((a,b)=>a.operation.sequence-b.operation.sequence).map(({movement,operation})=>({...movement,status:PROJECTABLE.has(operation.status) ? operation.status : 'pending',sequence:operation.sequence}));
}

async function unresolvedProductCreateDependency(userId, productId, database) {
  const rows = await database.outbox_operations.where('user_id').equals(userId).toArray();
  return rows.find((row) => row.entity_type === 'product' && row.action === 'create' && row.entity_id === productId && !row.reconciled_at)?.operation_id ?? null;
}

async function writeMovement({ userId, productId, movementType, qtyChange, baseBalance = null, baseRevision = null, countedQuantity = null }, database) {
  const id = uuidv4();
  const dependency = await getLatestInventoryTail(userId, productId, database)
    ?? await unresolvedProductCreateDependency(userId, productId, database);
  const movement = {
    id,
    user_id: userId,
    product_id: productId,
    movement_type: movementType,
    qty_change: normalizeQuantity(qtyChange),
    client_created_at: new Date().toISOString(),
    posted_at: null,
    server_sequence: null,
    base_balance: baseBalance === null ? null : normalizeQuantity(baseBalance),
    base_revision: baseRevision,
    counted_quantity: countedQuantity === null ? null : normalizeQuantity(countedQuantity),
    status: 'pending',
  };
  const operation = await createOutboxOperation({
    operation_id: id,
    user_id: userId,
    entity_type: 'inventory_movement',
    action: movementType === 'stock_count' ? 'stock_count' : 'post',
    entity_id: productId,
    payload: movement,
    depends_on: dependency,
  }, database);
  movement.sequence = operation.sequence;
  await database.inventory_movements.add(movement);
  return { movement, operation };
}

async function balanceFor(userId, productId, database) {
  const balance = await database.inventory_balances.get(productId);
  if (balance && balance.user_id !== userId) throw new Error('Balance does not belong to this user');
  return balance ?? null;
}

export async function initializeStock({ userId, productId, quantity }, database = defaultDb) {
  let normalized = normalizeQuantity(quantity);
  if (compareQuantities(normalized, '0') < 0) throw new Error('Opening quantity cannot be negative');
  return database.transaction('rw', database.products, database.inventory_balances, database.inventory_movements, database.outbox_operations, database.sync_state, async () => {
    const product = await ownedProduct(userId, productId, database);
    normalized = normalizeQuantityForUnit(normalized, product.unit);
    if (await balanceFor(userId, productId, database)) throw new Error('Stock is already initialized');
    const { movement, operation } = await writeMovement({ userId, productId, movementType: 'opening', qtyChange: normalized }, database);
    const now = new Date().toISOString();
    const balance = {
      product_id: productId, user_id: userId,
      server_quantity: null, server_revision: 0, server_initialized: false,
      current_quantity: normalized, projected_revision: 1, locally_initialized: true,
      initialized_at: now, last_movement_id: movement.id, updated_at: now, pending_count: 1,
    };
    await database.inventory_balances.add(balance);
    return { movement, operation, balance };
  });
}

async function adjustStock({ userId, productId, quantity, movementType, allowNegative = true, confirmedBeforeQuantity = null }, database) {
  let normalized = normalizeQuantity(quantity);
  if (movementType === 'manual_add' && compareQuantities(normalized, '0') <= 0) throw new Error('Add quantity must be positive');
  if (['manual_remove', 'damage_loss'].includes(movementType) && compareQuantities(normalized, '0') >= 0) throw new Error('Removal quantity must be negative');
  return database.transaction('rw', database.products, database.inventory_balances, database.inventory_movements, database.outbox_operations, database.sync_state, async () => {
    const product = await ownedProduct(userId, productId, database);
    normalized = normalizeQuantityForUnit(normalized, product.unit);
    const balance = await balanceFor(userId, productId, database);
    if (!balance?.locally_initialized && !balance?.server_initialized) throw new Error('Stock must be initialized first');
    const after = addQuantities(balance.current_quantity, normalized);
    if (['manual_remove', 'damage_loss'].includes(movementType) && compareQuantities(after, '0') < 0) {
      const confirmedCurrent = confirmedBeforeQuantity === null || compareQuantities(balance.current_quantity, confirmedBeforeQuantity) === 0;
      if (!allowNegative || !confirmedCurrent) return { status: 'negative_confirmation_required', before_quantity: balance.current_quantity, after_quantity: after };
    }
    const { movement, operation } = await writeMovement({ userId, productId, movementType, qtyChange: normalized }, database);
    const updated = {
      ...balance,
      current_quantity: after,
      projected_revision: balance.projected_revision + 1,
      last_movement_id: movement.id,
      updated_at: new Date().toISOString(),
      pending_count: balance.pending_count + 1,
    };
    await database.inventory_balances.put(updated);
    return { movement, operation, balance: updated, would_be_negative: compareQuantities(updated.current_quantity, '0') < 0 };
  });
}

export const addStock = (input, database = defaultDb) => adjustStock({ ...input, movementType: 'manual_add' }, database);
export const removeStock = (input, database = defaultDb) => adjustStock({ ...input, movementType: 'manual_remove' }, database);
export const recordDamageLoss = (input, database = defaultDb) => adjustStock({ ...input, movementType: 'damage_loss' }, database);

export async function recordStockCount({ userId, productId, countedQuantity }, database = defaultDb) {
  let counted = normalizeQuantity(countedQuantity);
  if (compareQuantities(counted, '0') < 0) throw new Error('Physical count cannot be negative');
  return database.transaction('rw', database.products, database.inventory_balances, database.inventory_movements, database.outbox_operations, database.sync_state, async () => {
    const product = await ownedProduct(userId, productId, database);
    counted = normalizeQuantityForUnit(counted, product.unit);
    const balance = await balanceFor(userId, productId, database);
    if (!balance?.locally_initialized && !balance?.server_initialized) throw new Error('Stock must be initialized first');
    if (compareQuantities(counted, balance.current_quantity) === 0) return { status: 'no_change', balance };
    const { movement, operation } = await writeMovement({
      userId, productId, movementType: 'stock_count',
      qtyChange: subtractQuantities(counted, balance.current_quantity),
      baseBalance: balance.current_quantity, baseRevision: balance.projected_revision,
      countedQuantity: counted,
    }, database);
    const updated = {
      ...balance, current_quantity: counted, projected_revision: balance.projected_revision + 1,
      last_movement_id: movement.id, updated_at: new Date().toISOString(), pending_count: balance.pending_count + 1,
    };
    await database.inventory_balances.put(updated);
    return { status: 'pending', movement, operation, balance: updated };
  });
}
