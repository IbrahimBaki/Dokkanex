import { v4 as uuidv4 } from 'uuid';
import { db as defaultDb } from './db';
import { createOutboxOperation } from './outbox';
import { initializeStock } from './inventoryLocal';

const metadataFields = new Set(['name', 'image_url', 'category_id', 'selling_price', 'wholesale_price', 'low_stock_threshold', 'unit']);
const productPayload = (product) => ({ id: product.id, user_id: product.user_id, name: product.name, image_url: product.image_url ?? null, wholesale_price: product.wholesale_price, selling_price: product.selling_price, category_id: product.category_id ?? null, unit: product.unit ?? 'piece', low_stock_threshold: product.low_stock_threshold ?? null });
async function owned(table, userId, id, database) { const row = await database[table].get(id); if (!row || row.user_id !== userId) throw new Error(`${table} does not belong to this user`); return row; }
export async function applyProductMetadataLocal({ userId, productId, patch }, database = defaultDb) { const product=await owned('products',userId,productId,database); const safe=Object.fromEntries(Object.entries(patch ?? {}).filter(([key])=>metadataFields.has(key))); if(!Object.keys(safe).length) throw new Error('No approved metadata fields'); await database.products.update(product.id,{...safe,updated_at:new Date().toISOString()}); return database.products.get(product.id); }
async function unresolvedProductCreate(userId, productId, database) { const rows=await database.outbox_operations.where('user_id').equals(userId).toArray(); return rows.find(row=>row.entity_type==='product'&&row.action==='create'&&row.entity_id===productId&&!row.reconciled_at)?.operation_id ?? null; }
async function unresolvedCategoryCreate(userId, categoryId, database) { if (!categoryId) return null; const rows=await database.outbox_operations.where('user_id').equals(userId).toArray(); return rows.find(row=>row.entity_type==='category'&&row.action==='create'&&row.entity_id===categoryId&&!row.reconciled_at)?.operation_id ?? null; }

export async function createProduct({ userId, id = uuidv4(), ...fields }, database = defaultDb) {
  const product = { ...fields, id, user_id: userId, image_url: fields.image_url ?? null, metadata_version: fields.metadata_version ?? 0, created_at: new Date().toISOString(), updated_at: new Date().toISOString() };
  return database.transaction('rw', database.products, database.outbox_operations, database.sync_state, async () => { const depends_on=await unresolvedCategoryCreate(userId,product.category_id,database); await database.products.add(product); const operation = await createOutboxOperation({ operation_id: id, user_id: userId, entity_type: 'product', action: 'create', entity_id: id, depends_on, payload: productPayload(product) }, database); return { product, operation }; });
}

// Opening stock is part of a new-product business save, not a later best-effort
// local write. Nested Dexie transactions reuse this outer transaction.
export async function createProductWithOpeningStock({ openingQuantity, ...input }, database = defaultDb) {
  return database.transaction('rw', database.products, database.inventory_balances, database.inventory_movements, database.outbox_operations, database.sync_state, async () => {
    const created = await createProduct(input, database);
    const opening = await initializeStock({ userId: input.userId, productId: created.product.id, quantity: openingQuantity }, database);
    return { ...created, opening };
  });
}
export async function updateProductMetadata({ userId, productId, patch, operationId = uuidv4() }, database = defaultDb) {
  const product = await owned('products', userId, productId, database); const safe = Object.fromEntries(Object.entries(patch).filter(([key]) => metadataFields.has(key))); if (!Object.keys(safe).length) throw new Error('No approved metadata fields');
  return database.transaction('rw', database.products, database.outbox_operations, database.sync_state, async () => { const depends_on=await unresolvedProductCreate(userId,productId,database); await database.products.update(productId, { ...safe, updated_at: new Date().toISOString() }); return createOutboxOperation({ operation_id: operationId, user_id: userId, entity_type: 'product_metadata', action: 'update', entity_id: productId, depends_on, payload: { expected_metadata_version: product.metadata_version ?? 0, patch: safe } }, database); });
}
export async function archiveProduct({ userId, productId, operationId = uuidv4() }, database = defaultDb) { await owned('products', userId, productId, database); const depends_on=await unresolvedProductCreate(userId,productId,database); return createOutboxOperation({ operation_id: operationId, user_id: userId, entity_type: 'product_archive', action: 'archive', entity_id: productId, depends_on, payload: {} }, database); }
export async function createCategory({ userId, id = uuidv4(), ...fields }, database = defaultDb) { const category={...fields,id,user_id:userId,created_at:fields.created_at ?? new Date().toISOString()}; return database.transaction('rw',database.categories,database.outbox_operations,database.sync_state,async()=>{await database.categories.add(category); const operation=await createOutboxOperation({operation_id:id,user_id:userId,entity_type:'category',action:'create',entity_id:id,payload:category},database); return {category,operation};}); }
export async function updateCategory({ userId, categoryId, patch, operationId = uuidv4() }, database = defaultDb) { const safe=Object.fromEntries(Object.entries(patch ?? {}).filter(([key])=>key==='name')); if (!Object.keys(safe).length) throw new Error('No approved category fields'); const category=await owned('categories',userId,categoryId,database); return database.transaction('rw',database.categories,database.outbox_operations,database.sync_state,async()=>{await database.categories.update(categoryId,safe); return createOutboxOperation({operation_id:operationId,user_id:userId,entity_type:'category',action:'update',entity_id:categoryId,payload:{...category,...safe,id:category.id,user_id:category.user_id,created_at:category.created_at}},database);}); }
export async function deleteCategory({ userId, categoryId, operationId = uuidv4() }, database = defaultDb) { await owned('categories',userId,categoryId,database); return database.transaction('rw',database.categories,database.outbox_operations,database.sync_state,async()=>{await database.categories.delete(categoryId); return createOutboxOperation({operation_id:operationId,user_id:userId,entity_type:'category',action:'delete',entity_id:categoryId,payload:{}},database);}); }
