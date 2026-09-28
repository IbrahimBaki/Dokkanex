import { db as defaultDb } from './db';
import { addQuantities, normalizeQuantity } from './quantity';
import { proveLegacyQueueOwnership, transitionOutboxOperation, createOutboxOperation } from './outbox';
import { getProjectableInventoryMovements, replayPendingProjection } from './inventoryLocal';
import { finalizeImageUpload, getStagedImageBlob, IMAGE_BUCKET, immutableImagePath } from './v2Images';
import Decimal from 'decimal.js-light';

const RUNNERS = new Map();
const RETRY_BASE_MS = 1_000;
const RETRY_MAX_MS = 5 * 60 * 1_000;
const REMOTE_PAGE_SIZE = 500;

// Supabase limits a single select response to 1,000 rows by default. V2 keeps a
// complete offline mirror, so every full pull must collect all pages before merge.
function orderForPagination(query, column) {
  return typeof query.order === 'function' ? query.order(column, { ascending: true }) : query;
}

async function selectAllPages(buildQuery, pageSize = REMOTE_PAGE_SIZE) {
  const rows = [];
  for (let from = 0; ; from += pageSize) {
    const query = buildQuery();
    // The fallback keeps older lightweight test clients compatible; Supabase
    // always provides range(), so production requests are always paginated.
    const response = typeof query.range === 'function'
      ? await query.range(from, from + pageSize - 1)
      : await query;
    if (response.error) throw response.error;
    const page = response.data ?? [];
    rows.push(...page);
    if (typeof query.range !== 'function' || page.length < pageSize) return rows;
  }
}


const stateId = (userId, scope) => `v2:${scope}:${userId}`;
const nowIso = () => new Date().toISOString();

export function classifySyncError(error) {
  const code = error?.code ?? error?.status;
  const message = String(error?.message ?? '').toLowerCase();
  if (!error || message.includes('network') || message.includes('fetch') || message.includes('timeout') || (typeof code === 'number' && code >= 500)) return { state: 'retryable_failed', code: 'network' };
  if (code === '42501' || code === 401 || code === 403) return { state: 'permanent_failed', code: 'authorization' };
  if (code === '23514' || code === '22023' || code === 400) return { state: 'permanent_failed', code: 'validation' };
  return { state: 'retryable_failed', code: 'remote_error' };
}

function retryAt(attemptCount, now = Date.now()) {
  return new Date(now + Math.min(RETRY_MAX_MS, RETRY_BASE_MS * (2 ** Math.max(0, attemptCount - 1)))).toISOString();
}

async function activeUserId(client) {
  const { data, error } = await client.auth.getSession();
  if (error) throw error;
  return data.session?.user?.id ?? null;
}

function safeMessage(error) {
  return String(error?.message ?? 'Sync failed').replace(/[\r\n]+/g, ' ').slice(0, 240);
}

export async function selectReadyOutbox(userId, database = defaultDb, now = Date.now()) {
  const rows = await database.outbox_operations.where('user_id').equals(userId).toArray();
  const byId = new Map(rows.map((row) => [row.operation_id, row]));
  return rows
    .filter((row) => row.status === 'pending' || (row.status === 'retryable_failed' && (!row.next_attempt_at || Date.parse(row.next_attempt_at) <= now)))
    .filter((row) => (!row.depends_on || byId.get(row.depends_on)?.reconciled_at)
      && (row.depends_on_many ?? []).every((dependency) => byId.get(dependency)?.reconciled_at))
    .filter((row) => !rows.some((earlier) => (
      earlier.sequence < row.sequence
      && earlier.entity_type === row.entity_type
      && earlier.entity_id === row.entity_id
      && !earlier.reconciled_at
    )))
    .sort((a, b) => a.sequence - b.sequence)
    .filter((row, index, sorted) => !sorted.slice(0, index).some((earlier) => earlier.entity_type === row.entity_type && earlier.entity_id === row.entity_id));
}

export async function recomputeProduct(userId, productId, database) {
  const balance = await database.inventory_balances.get(productId);
  const movements = await getProjectableInventoryMovements(userId, productId, database);
  const canonical = balance?.server_initialized
    ? { server_initialized: true, server_quantity: balance.server_quantity, server_revision: balance.server_revision }
    : { server_initialized: false, server_quantity: null, server_revision: 0 };
  const projected = replayPendingProjection(canonical, movements);
  if (!projected.initialized && !balance) return null;
  const current = {
    ...(balance ?? { product_id: productId, user_id: userId, server_initialized: false, server_quantity: null, server_revision: 0 }),
    user_id: userId,
    locally_initialized: projected.initialized,
    current_quantity: projected.current_quantity,
    projected_revision: projected.projected_revision,
    pending_count: movements.length,
    updated_at: nowIso(),
  };
  await database.inventory_balances.put(current);
  return current;
}

async function reconcileAcceptedInventoryOperation(userId, operation, receipt, database) {
  const movement = receipt.movement;
  await database.transaction('rw', database.inventory_movements, database.inventory_balances, database.outbox_operations, async () => {
    const currentOperation = await database.outbox_operations.get(operation.operation_id);
    if (!currentOperation || currentOperation.user_id !== userId) throw new Error('Outbox operation ownership changed');
    if (movement) {
      await database.inventory_movements.put({ ...movement, id: movement.id, user_id: userId, qty_change: normalizeQuantity(movement.qty_change), status: 'accepted' });
    }
    const local = await database.inventory_balances.get(operation.entity_id);
    await database.inventory_balances.put({
      ...(local ?? { product_id: operation.entity_id, user_id: userId }),
      product_id: operation.entity_id, user_id: userId,
      server_initialized: true,
      server_quantity: normalizeQuantity(receipt.balance_after),
      server_revision: Number(receipt.revision_after),
      initialized_at: local?.initialized_at ?? movement?.posted_at ?? nowIso(),
      last_movement_id: movement?.id ?? local?.last_movement_id ?? null,
      updated_at: nowIso(),
    });
    await database.outbox_operations.update(operation.operation_id, { status: 'succeeded', server_receipt: receipt, reconciled_at: nowIso(), updated_at: nowIso() });
    if (movement) await database.inventory_movements.update(movement.id, { status: 'accepted' });
  });
}

async function reconcileNoChangeOperation(operation, response, database) {
  await database.transaction('rw', database.outbox_operations, async () => {
    await database.outbox_operations.update(operation.operation_id, {
      status: 'succeeded', server_receipt: { ...response, local_observation: true }, reconciled_at: nowIso(), updated_at: nowIso(),
    });
  });
}

function metadataValueEquals(key, intended, remote) {
  if (intended === null || remote === null || intended === undefined || remote === undefined) return intended === remote;
  if (key === 'low_stock_threshold') return normalizeQuantity(intended) === normalizeQuantity(remote);
  if (key === 'selling_price' || key === 'wholesale_price') {
    try { return new Decimal(String(intended)).equals(new Decimal(String(remote))); } catch { return false; }
  }
  return String(intended) === String(remote);
}

async function mergeProduct(userId, product, database) {
  if (!product || product.user_id !== userId) return;
  const local = await database.products.get(product.id);
  // A V2 metadata draft is held in its outbox payload; the canonical product
  // always wins locally, while the draft remains reviewable in that operation.
  await database.products.put({ ...(local ?? {}), ...product, id: product.id, user_id: userId });
}

async function postInventory(client, operation) {
  const payload = operation.payload;
  if (operation.action === 'stock_count') {
    return client.rpc('post_stock_count', {
      p_operation_id: operation.operation_id, p_product_id: operation.entity_id,
      p_expected_base_balance: payload.base_balance, p_expected_revision: payload.base_revision,
      p_counted_quantity: payload.counted_quantity, p_client_created_at: payload.client_created_at,
      p_reason: payload.reason ?? null, p_note: payload.note ?? null,
    });
  }
  return client.rpc('post_inventory_movement', {
    p_operation_id: operation.operation_id, p_product_id: operation.entity_id,
    p_movement_type: payload.movement_type, p_quantity: payload.qty_change,
    p_client_created_at: payload.client_created_at, p_reason: payload.reason ?? null,
    p_note: payload.note ?? null, p_reverses_movement_id: payload.reverses_movement_id ?? null,
  });
}

async function postPurchase(client, operation) {
  const payload = operation.payload ?? {};
  return client.rpc('post_purchase_v2', {
    p_purchase_id: operation.operation_id,
    p_purchased_at: payload.purchased_at,
    p_supplier_name: payload.supplier_name ?? null,
    p_reference: payload.reference ?? null,
    p_lines: (payload.lines ?? []).map((line) => ({
      line_id: line.id,
      product_id: line.product_id,
      movement_id: line.movement_id,
      quantity: line.quantity,
      unit_cost: line.unit_cost,
    })),
  });
}

async function reconcileAcceptedPurchaseOperation(userId, operation, receipt, database) {
  await database.transaction('rw', database.outbox_operations, database.v2_purchase_documents, async () => {
    const current = await database.outbox_operations.get(operation.operation_id);
    if (!current || current.user_id !== userId) throw new Error('Purchase operation ownership changed');
    const document = await database.v2_purchase_documents.get(operation.entity_id);
    if (!document || document.user_id !== userId) throw new Error('Purchase document ownership changed');
    await database.outbox_operations.update(operation.operation_id, {
      status: 'succeeded', server_receipt: receipt, reconciled_at: nowIso(), updated_at: nowIso(),
    });
  });
}

async function postSale(client, operation) {
  const payload = operation.payload ?? {};
  return client.rpc("post_sale_v2", {
    p_sale_id: operation.operation_id, p_sold_at: payload.sold_at, p_payment_method: payload.payment_method ?? "cash",
    p_customer_name: payload.customer_name ?? null, p_notes: payload.notes ?? null, p_profile_snapshot: payload.profile_snapshot ?? {},
    p_allow_negative: Boolean(payload.allow_negative),
    p_lines: (payload.lines ?? []).map((line) => ({ line_id: line.id, product_id: line.product_id, movement_id: line.movement_id, quantity: line.quantity, unit_price: line.unit_price, discount_amount: line.discount_amount })),
  });
}

async function postShopProfile(client, operation) {
  return client.from('v2_shop_profiles').upsert(operation.payload).select().single();
}
async function postSaleReturn(client, operation) { const p = operation.payload; return client.rpc('post_sale_return_v2', { p_return_id: operation.operation_id, p_sale_id: p.sale_id, p_returned_at: p.returned_at, p_reason: p.reason ?? null, p_lines: p.lines.map((line) => ({ line_id: line.id, sale_line_id: line.sale_line_id, movement_id: line.movement_id, quantity: line.quantity })) }); }

async function reconcileAcceptedSaleOperation(userId, operation, receipt, database) {
  await database.transaction("rw", database.outbox_operations, database.v2_sale_documents, async () => {
    const current = await database.outbox_operations.get(operation.operation_id);
    const document = await database.v2_sale_documents.get(operation.entity_id);
    if (!current || current.user_id !== userId || !document || document.user_id !== userId) throw new Error("Sale operation ownership changed");
    await database.v2_sale_documents.update(operation.entity_id, { invoice_number: receipt.invoice_number ?? document.invoice_number, total_amount: receipt.total_amount ?? document.total_amount, updated_at: nowIso() });
    await database.outbox_operations.update(operation.operation_id, { status: "succeeded", server_receipt: receipt, reconciled_at: nowIso(), updated_at: nowIso() });
  });
}

async function pushCategory(client, operation) {
  const payload = operation.payload ?? {};
  if (operation.action === 'create') return client.from('categories').insert(payload).select().single();
  if (operation.action === 'update') return client.from('categories').update(payload).eq('id', operation.entity_id).select().single();
  return client.from('categories').delete().eq('id', operation.entity_id).select();
}

async function reconcileDuplicateProductCreate(userId, operation, client, database, isCurrent) {
  const remote = await client.from('products').select('*').eq('id', operation.entity_id).single();
  if (!await isCurrent()) return { cancelled: true };
  const intended = operation.payload;
  const matches = remote.data && remote.data.user_id === userId && ['id', 'user_id', 'name', 'image_url', 'category_id', 'unit'].every((key) => metadataValueEquals(key, intended[key] ?? null, remote.data[key] ?? null)) && ['wholesale_price', 'selling_price', 'low_stock_threshold'].every((key) => metadataValueEquals(key, intended[key] ?? null, remote.data[key] ?? null));
  if (remote.error || !matches) return { conflict: true };
  await database.transaction('rw', database.products, database.outbox_operations, async () => {
    await mergeProduct(userId, remote.data, database);
    await database.outbox_operations.update(operation.operation_id, { status: 'succeeded', server_receipt: { status: 'accepted', product: remote.data, recovered_duplicate: true }, reconciled_at: nowIso(), updated_at: nowIso() });
  });
  return { pushed: true };
}

function imagePath(reference) {
  if (typeof reference !== 'string') return null;
  const marker = `/storage/v1/object/public/${IMAGE_BUCKET}/`;
  return reference.includes(marker) ? reference.split(marker)[1] : (reference.includes('/') ? reference : null);
}

function isOwnedV2ImagePath(userId, productId, path) {
  return new RegExp(`^${userId}/${productId}/[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\\.jpg$`, 'i').test(path ?? '');
}

function imageUrl(client, path) {
  return client.storage.from(IMAGE_BUCKET).getPublicUrl(path).data.publicUrl;
}

async function imageUploadPayload(image) {
  if (typeof image === 'string' && image.startsWith('data:')) return (await fetch(image)).blob();
  return image;
}

async function enqueueImageDelete(userId, operation, canonical, database) {
  const oldImageUrl = operation.payload?.old_image_url;
  if (!oldImageUrl || canonical?.image_url === oldImageUrl) return;
  const path = imagePath(oldImageUrl);
  // Legacy/unprefixed objects carry no V2 ownership proof and are retained.
  if (!isOwnedV2ImagePath(userId, operation.entity_id, path)) return;
  const id = `${operation.operation_id}:image-delete`;
  if (await database.outbox_operations.get(id)) return;
  await createOutboxOperation({
    operation_id: id, user_id: userId, entity_type: 'image_delete', action: 'delete', entity_id: operation.entity_id,
    depends_on: operation.operation_id, payload: { old_image_url: oldImageUrl },
  }, database);
}

async function pushImageUpload(userId, operation, client, database, isCurrent) {
  const staged = await getStagedImageBlob(userId, operation.operation_id, database);
  if (!staged || staged.product_id !== operation.entity_id) throw Object.assign(new Error('Staged image is unavailable'), { code: '22023' });
  const path = immutableImagePath(userId, operation.entity_id, operation.operation_id);
  const upload = await client.storage.from(IMAGE_BUCKET).upload(path, await imageUploadPayload(staged.image), { contentType: 'image/jpeg', upsert: false });
  if (upload.error && ![409, '409'].includes(upload.error.statusCode) && ![409, '409'].includes(upload.error.status)) throw upload.error;
  if (!await isCurrent()) return { cancelled: true };
  const receipt = { path, image_url: imageUrl(client, path), uploaded: true };
  await finalizeImageUpload(userId, operation.entity_id, operation.operation_id, receipt, database);
  return { pushed: true };
}

async function pushImageDelete(userId, operation, client, database, isCurrent) {
  const oldPath = imagePath(operation.payload?.old_image_url);
  if (!isOwnedV2ImagePath(userId, operation.entity_id, oldPath)) throw Object.assign(new Error('Old image ownership is not proven'), { code: 'image_delete_not_safe' });
  const remote = await client.from('products').select('*').eq('id', operation.entity_id).single();
  if (!await isCurrent()) return { cancelled: true };
  if (remote.error) throw remote.error;
  if (!remote.data || remote.data.user_id !== userId || remote.data.image_url === operation.payload.old_image_url) throw Object.assign(new Error('Canonical image still requires old object'), { code: 'image_delete_not_safe' });
  const removed = await client.storage.from(IMAGE_BUCKET).remove([oldPath]);
  if (!await isCurrent()) return { cancelled: true };
  if (removed.error) throw removed.error;
  await transitionOutboxOperation(operation.operation_id, 'succeeded', { server_receipt: { deleted: oldPath }, reconciled_at: nowIso() }, database);
  return { pushed: true };
}

async function reconcileDuplicateCategoryCreate(userId, operation, client, database, isCurrent) {
  const remote = await client.from('categories').select('*').eq('id', operation.entity_id).single();
  if (!await isCurrent()) return { cancelled: true };
  if (remote.error) return { lookup_error: remote.error };
  if (!remote.data) return { unresolved: true };
  if (remote.data.user_id !== userId) return { ownership_mismatch: true };
  await database.transaction('rw', database.categories, database.outbox_operations, async () => {
    await database.categories.put({ ...remote.data, user_id: userId });
    await database.outbox_operations.update(operation.operation_id, {
      status: 'succeeded', server_receipt: { status: 'accepted', category: remote.data, recovered_duplicate: true }, reconciled_at: nowIso(), updated_at: nowIso(),
    });
  });
  return { reconciled: true };
}

async function pushOperation(userId, operation, { client, database, isCurrent }) {
  if (!await isCurrent()) return { cancelled: true };
  const syncing = await transitionOutboxOperation(operation.operation_id, 'syncing', {}, database);
  if (!await isCurrent()) return { cancelled: true };
  try {
    let response;
    if (operation.entity_type === 'inventory_movement') response = await postInventory(client, syncing);
    else if (operation.entity_type === 'purchase' && operation.action === 'post') response = await postPurchase(client, syncing);
    else if (operation.entity_type === 'sale' && operation.action === 'post') response = await postSale(client, syncing);
    else if (operation.entity_type === 'shop_profile' && operation.action === 'upsert') response = await postShopProfile(client, syncing);
    else if (operation.entity_type === 'sale_return' && operation.action === 'post') response = await postSaleReturn(client, syncing);
    else if (operation.entity_type === 'product' && operation.action === 'create') response = await client.from('products').insert(operation.payload).select().single();
    else if (operation.entity_type === 'image_upload') return await pushImageUpload(userId, syncing, client, database, isCurrent);
    else if (operation.entity_type === 'image_delete') return await pushImageDelete(userId, syncing, client, database, isCurrent);
    else if (operation.entity_type === 'product_metadata') response = await client.rpc('update_product_metadata', { p_product_id: operation.entity_id, p_expected_metadata_version: operation.payload.expected_metadata_version, p_patch: operation.payload.patch });
    else if (operation.entity_type === 'product_archive') response = await client.rpc('archive_product', { p_product_id: operation.entity_id });
    else if (operation.entity_type === 'category') response = await pushCategory(client, operation);
    else throw Object.assign(new Error('Unsupported V2 operation'), { code: '22023' });
    if (!await isCurrent()) return { cancelled: true };
    if (response.error) throw response.error;
    const result = response.data;
    if (operation.entity_type === 'inventory_movement') {
      if (result?.status === 'conflict') {
        if (!await isCurrent()) return { cancelled: true };
        await transitionOutboxOperation(operation.operation_id, 'conflict', { last_error_code: 'stock_count_conflict', last_error_message: 'Stock changed remotely' }, database);
        return { conflict: true };
      }
      if (result?.status === 'no_change') {
        if (!await isCurrent()) return { cancelled: true };
        await reconcileNoChangeOperation(operation, result, database);
        return { no_change: true };
      }
      if (!await isCurrent()) return { cancelled: true };
      await reconcileAcceptedInventoryOperation(userId, operation, result, database);
      await recomputeProduct(userId, operation.entity_id, database);
    } else if (operation.entity_type === 'purchase' && operation.action === 'post') {
      if (result?.status !== 'accepted' || result.purchase_id !== operation.operation_id) {
        throw Object.assign(new Error('Invalid purchase receipt'), { code: '22023' });
      }
      await reconcileAcceptedPurchaseOperation(userId, operation, result, database);
    } else if (operation.entity_type === 'sale' && operation.action === 'post') {
      if (result?.status !== 'accepted' || result.sale_id !== operation.operation_id) throw Object.assign(new Error('Invalid sale receipt'), { code: '22023' });
      await reconcileAcceptedSaleOperation(userId, operation, result, database);
    } else if (operation.entity_type === 'shop_profile' && operation.action === 'upsert') {
      if (!result || result.user_id !== userId) throw Object.assign(new Error('Invalid shop profile receipt'), { code: '22023' });
      await database.transaction('rw', database.shop_profiles, database.outbox_operations, async () => {
        await database.shop_profiles.put(result);
        await database.outbox_operations.update(operation.operation_id, { status: 'succeeded', server_receipt: result, reconciled_at: nowIso(), updated_at: nowIso() });
      });
    } else if (operation.entity_type === 'sale_return' && operation.action === 'post') {
      if (result?.status !== 'accepted' || result.return_id !== operation.operation_id) throw Object.assign(new Error('Invalid return receipt'), { code: '22023' });
      await transitionOutboxOperation(operation.operation_id, 'succeeded', { server_receipt: result, reconciled_at: nowIso() }, database);
    } else if (operation.entity_type === 'product' && operation.action === 'create') {
      if (!await isCurrent()) return { cancelled: true };
      await database.transaction('rw', database.products, database.outbox_operations, async () => {
        await mergeProduct(userId, result, database);
        await database.outbox_operations.update(operation.operation_id, { status: 'succeeded', server_receipt: { status: 'accepted', product: result }, reconciled_at: nowIso(), updated_at: nowIso() });
      });
    } else if (operation.entity_type === 'product_metadata') {
      if (result?.status === 'conflict') {
        const remote = await client.from('products').select('*').eq('id', operation.entity_id).single();
        if (!await isCurrent()) return { cancelled: true };
        if (remote.data) await mergeProduct(userId, remote.data, database);
        const intended = operation.payload.patch ?? {};
        const applied = remote.data && Object.entries(intended).every(([key, value]) => metadataValueEquals(key, value, remote.data[key]));
        await transitionOutboxOperation(operation.operation_id, applied ? 'succeeded' : 'conflict', applied ? { reconciled_at: nowIso() } : { last_error_code: 'metadata_conflict', last_error_message: 'Product changed remotely' }, database);
        if (applied) await enqueueImageDelete(userId, operation, remote.data, database);
      } else {
        if (!await isCurrent()) return { cancelled: true };
        await mergeProduct(userId, result.product, database);
        await transitionOutboxOperation(operation.operation_id, 'succeeded', { server_receipt: result, reconciled_at: nowIso() }, database);
        await enqueueImageDelete(userId, operation, result.product, database);
      }
    } else if (operation.entity_type === 'product_archive') {
      if (!await isCurrent()) return { cancelled: true };
      await mergeProduct(userId, result.product, database);
      await transitionOutboxOperation(operation.operation_id, 'succeeded', { server_receipt: result, reconciled_at: nowIso() }, database);
    } else {
      if (!await isCurrent()) return { cancelled: true };
      if (operation.action === 'delete') await database.categories.delete(operation.entity_id);
      else if (result) await database.categories.put({ ...result, user_id: userId });
      await transitionOutboxOperation(operation.operation_id, 'succeeded', { server_receipt: result ?? { deleted: true }, reconciled_at: nowIso() }, database);
    }
    return { pushed: true };
  } catch (error) {
    if (!await isCurrent()) return { cancelled: true };
    if (operation.entity_type === 'inventory_movement' && operation.payload?.movement_type === 'opening' && error?.code === '23505') {
      await transitionOutboxOperation(operation.operation_id, 'conflict', { last_error_code: 'inventory_already_initialized', last_error_message: 'Inventory was initialized remotely' }, database);
      return { conflict: true };
    }
    if (operation.entity_type === 'product' && operation.action === 'create' && error?.code === '23505') {
      const recovered = await reconcileDuplicateProductCreate(userId, operation, client, database, isCurrent);
      if (recovered.cancelled) return recovered;
      if (recovered.conflict) { await transitionOutboxOperation(operation.operation_id, 'conflict', { last_error_code: 'product_duplicate_unresolved', last_error_message: 'Duplicate product is not owned by this account' }, database); return recovered; }
      return recovered;
    }
    if (operation.entity_type === 'category' && operation.action === 'create' && error?.code === '23505') {
      if (!await isCurrent()) return { cancelled: true };
      const recovered = await reconcileDuplicateCategoryCreate(userId, operation, client, database, isCurrent);
      if (recovered.cancelled) return { cancelled: true };
      if (recovered.reconciled) return { pushed: true, recovered_duplicate: true };
      if (recovered.lookup_error) {
        if (!await isCurrent()) return { cancelled: true };
        const classification = classifySyncError(recovered.lookup_error);
        const failed = await transitionOutboxOperation(operation.operation_id, classification.state, { last_error_code: classification.code, last_error_message: safeMessage(recovered.lookup_error) }, database);
        if (classification.state === 'retryable_failed') await database.outbox_operations.update(operation.operation_id, { next_attempt_at: retryAt(failed.attempt_count) });
        return { failed: true, classification };
      }
      if (recovered.ownership_mismatch) {
        await transitionOutboxOperation(operation.operation_id, 'permanent_failed', { last_error_code: 'category_duplicate_ownership_mismatch', last_error_message: 'Duplicate category is not owned by this account' }, database);
        return { failed: true };
      }
      await transitionOutboxOperation(operation.operation_id, 'conflict', { last_error_code: 'category_duplicate_unresolved', last_error_message: 'Duplicate category could not be reconciled' }, database);
      return { conflict: true };
    }
    if (operation.entity_type === 'image_delete' && error?.code === 'image_delete_not_safe') {
      const failed = await transitionOutboxOperation(operation.operation_id, 'retryable_failed', { last_error_code: error.code, last_error_message: safeMessage(error) }, database);
      await database.outbox_operations.update(operation.operation_id, { next_attempt_at: retryAt(failed.attempt_count) });
      return { skipped: true };
    }
    const classification = classifySyncError(error);
    const failed = await transitionOutboxOperation(operation.operation_id, classification.state, { last_error_code: classification.code, last_error_message: safeMessage(error) }, database);
    if (classification.state === 'retryable_failed') await database.outbox_operations.update(operation.operation_id, { next_attempt_at: retryAt(failed.attempt_count) });
    return { failed: true, classification };
  }
}

export async function pullUserState(userId, { client, database = defaultDb, isCurrent = async () => true }) {
  if (!await isCurrent()) return;
  const [products, categories, balances, sales, saleLines, saleReturns, saleReturnLines, profile, cursorState] = await Promise.all([
    selectAllPages(() => orderForPagination(client.from('products').select('*').eq('user_id', userId), 'id')),
    selectAllPages(() => orderForPagination(client.from('categories').select('*').eq('user_id', userId), 'id')),
    selectAllPages(() => orderForPagination(client.from('inventory_balances').select('*').eq('user_id', userId), 'product_id')),
    selectAllPages(() => orderForPagination(client.from('v2_sale_documents').select('*').eq('user_id', userId), 'id')),
    selectAllPages(() => orderForPagination(client.from('v2_sale_lines').select('*').eq('user_id', userId), 'id')),
    selectAllPages(() => orderForPagination(client.from('v2_sale_return_documents').select('*').eq('user_id', userId), 'id')),
    selectAllPages(() => orderForPagination(client.from('v2_sale_return_lines').select('*').eq('user_id', userId), 'id')),
    selectAllPages(() => orderForPagination(client.from('v2_shop_profiles').select('*').eq('user_id', userId), 'user_id')),
    database.sync_state.get(stateId(userId, 'movement_cursor')),
  ]);
  if (!await isCurrent()) return;
  const cursor = Number(cursorState?.value ?? 0);
  const movements = await selectAllPages(() => orderForPagination(client.from('stock_movements').select('*').eq('user_id', userId).neq('movement_type', 'legacy').gt('server_sequence', cursor), 'server_sequence'));
  if (!await isCurrent()) return;
  const legacyProductIds = new Set();
  for (const row of await database.sync_queue.toArray()) {
    if (row.table_name !== 'products' || !row.record_id || row.v2_bridge_status === 'bridged') continue;
    if ((await proveLegacyQueueOwnership(row, userId, database)).proven) legacyProductIds.add(row.record_id);
  }
  if (!await isCurrent()) return;
  await database.transaction('rw', database.products, database.categories, database.inventory_balances, database.inventory_movements, database.v2_sale_documents, database.v2_sale_lines, database.v2_sale_return_documents, database.v2_sale_return_lines, database.shop_profiles, database.outbox_operations, database.sync_state, async () => {
    const unresolved = await database.outbox_operations.where('user_id').equals(userId).toArray();
    const pendingProductIds = new Set(unresolved
      .filter((row) => ((row.entity_type === 'product' && row.action === 'create') || ['product_metadata', 'product_archive', 'image_upload', 'image_delete'].includes(row.entity_type) || (row.entity_type === 'legacy_queue' && row.source_table === 'products')) && !row.reconciled_at)
      .map((row) => row.entity_id));
    const pendingCategoryIds = new Set(unresolved
      .filter((row) => row.entity_type === 'category' && !row.reconciled_at)
      .map((row) => row.entity_id));
    const remoteProductIds = new Set(products.map((row) => row.id));
    for (const row of products) await mergeProduct(userId, row, database);
    for (const local of await database.products.where('user_id').equals(userId).toArray()) if (!remoteProductIds.has(local.id) && !pendingProductIds.has(local.id) && !legacyProductIds.has(local.id)) await database.products.delete(local.id);
    const remoteCategoryIds = new Set(categories.map((row) => row.id));
    for (const row of categories) await database.categories.put({ ...row, user_id: userId });
    for (const local of await database.categories.where('user_id').equals(userId).toArray()) if (!remoteCategoryIds.has(local.id) && !pendingCategoryIds.has(local.id)) await database.categories.delete(local.id);
    for (const row of sales) await database.v2_sale_documents.put({ ...row, user_id: userId, updated_at: row.created_at });
    for (const row of saleLines) await database.v2_sale_lines.put({ ...row, user_id: userId });
    for (const row of saleReturns) await database.v2_sale_return_documents.put({ ...row, user_id: userId });
    for (const row of saleReturnLines) await database.v2_sale_return_lines.put({ ...row, user_id: userId });
    if (profile?.[0]) await database.shop_profiles.put(profile[0]);
    for (const row of balances) await database.inventory_balances.put({
      ...(await database.inventory_balances.get(row.product_id) ?? {}), product_id: row.product_id, user_id: userId,
      server_initialized: true, server_quantity: normalizeQuantity(row.current_quantity), server_revision: Number(row.revision),
      initialized_at: row.initialized_at, last_movement_id: row.last_movement_id, updated_at: row.updated_at,
    });
    let nextCursor = cursor;
    for (const row of movements) {
      await database.inventory_movements.put({ ...row, id: row.id, user_id: userId, qty_change: normalizeQuantity(row.qty_change), status: 'accepted' });
      const localOperation = await database.outbox_operations.get(row.id);
      if (localOperation && localOperation.user_id === userId && ['pending', 'syncing', 'retryable_failed'].includes(localOperation.status)) {
        await database.outbox_operations.update(row.id, { status: 'succeeded', reconciled_at: nowIso(), server_receipt: { status: 'accepted', movement: row }, updated_at: nowIso() });
      }
      nextCursor = Math.max(nextCursor, Number(row.server_sequence));
    }
    await database.sync_state.put({ id: stateId(userId, 'movement_cursor'), user_id: userId, scope: 'movement_cursor', value: nextCursor, updated_at: nowIso() });
  });
  const affected = new Set([...(balances ?? []).map((row) => row.product_id), ...movements.map((row) => row.product_id)]);
  for (const productId of affected) await recomputeProduct(userId, productId, database);
}

export async function bridgeLegacyQueue(userId, database = defaultDb) {
  const rows = await database.sync_queue.orderBy('id').toArray();
  for (const row of rows) {
    if (row.v2_bridge_operation_id) continue;
    const ownership = await proveLegacyQueueOwnership(row, userId, database);
    if (!ownership.proven) {
      await database.sync_queue.update(row.id, { v2_bridge_status: 'ownership_unresolved', v2_bridge_reason: ownership.reason });
      continue;
    }
    await database.transaction('rw', database.sync_queue, database.outbox_operations, database.sync_state, async () => {
      if (row.v2_bridge_operation_id) return;
      const supportedCategory = row.table_name === 'categories' && ['INSERT', 'UPDATE', 'DELETE'].includes(row.operation);
      const operation = await createOutboxOperation({
        operation_id: `legacy-${row.id}`, user_id: userId,
        entity_type: supportedCategory ? 'category' : 'legacy_queue',
        action: supportedCategory ? ({ INSERT: 'create', UPDATE: 'update', DELETE: 'delete' }[row.operation]) : 'blocked',
        entity_id: row.record_id ?? `legacy-${row.id}`, payload: row.data ?? {}, source_table: row.table_name,
        depends_on: null,
      }, database);
      if (!supportedCategory) await database.outbox_operations.update(operation.operation_id, { status: 'blocked', last_error_code: 'legacy_mapping_unsupported', last_error_message: 'Legacy queue row was retained for review' });
      await database.sync_queue.update(row.id, { v2_bridge_operation_id: operation.operation_id, v2_bridge_status: supportedCategory ? 'bridged' : 'blocked' });
    });
  }
}

export function getV2SyncStatus(userId, database = defaultDb) {
  return database.outbox_operations.where('user_id').equals(userId).toArray().then((rows) => ({
    pending: rows.filter((row) => row.status === 'pending').length,
    retryable_failed: rows.filter((row) => row.status === 'retryable_failed').length,
    conflict: rows.filter((row) => row.status === 'conflict').length,
    permanent_failed: rows.filter((row) => row.status === 'permanent_failed').length,
    blocked: rows.filter((row) => row.status === 'blocked').length,
  }));
}

export function createV2SyncRunner({ client, database = defaultDb, getActiveUserId = () => activeUserId(client), legacyBridgeMode = 'disabled' }) {
  let generation = 0;
  return {
    invalidate() { generation += 1; },
    async sync(userId) {
      const key = `${userId}`;
      if (RUNNERS.has(key)) return RUNNERS.get(key);
      const runGeneration = generation;
      const run = (async () => {
        const isCurrent = async () => generation === runGeneration && await getActiveUserId() === userId;
        if (!await isCurrent()) return { cancelled: true };
        if (legacyBridgeMode === 'enabled') await bridgeLegacyQueue(userId, database);
        const ready = await selectReadyOutbox(userId, database);
        const results = [];
        for (const operation of ready) {
          if (!await isCurrent()) return { cancelled: true, results };
          results.push(await pushOperation(userId, operation, { client, database, isCurrent }));
        }
        if (await isCurrent()) await pullUserState(userId, { client, database, isCurrent });
        return { results, cancelled: !await isCurrent() };
      })().finally(() => RUNNERS.delete(key));
      RUNNERS.set(key, run);
      return run;
    },
  };
}
