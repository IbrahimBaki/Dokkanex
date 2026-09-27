import { v4 as uuidv4 } from 'uuid';
import { db as defaultDb } from './db';
import { addQuantities, multiplyMoney, normalizeMoney, normalizeQuantityForUnit } from './quantity';
import { createOutboxOperation } from './outbox';
import { getLatestInventoryTail } from './inventoryLocal';

export async function recordPurchase({ userId, purchasedAt = new Date().toISOString(), supplierName = null, reference = null, lines }, database = defaultDb) {
  if (!lines?.length) throw Error('Purchase requires lines');
  if (new Set(lines.map((line) => line.productId)).size !== lines.length) throw Error('Duplicate product line');

  return database.transaction('rw', database.products, database.inventory_balances, database.inventory_movements, database.v2_purchase_documents, database.v2_purchase_lines, database.outbox_operations, database.sync_state, async () => {
    const id = uuidv4();
    let total = '0.000000';
    const normalized = [];
    for (const input of lines) {
      const product = await database.products.get(input.productId);
      const balance = await database.inventory_balances.get(input.productId);
      if (!product || product.user_id !== userId) throw Error('Product does not belong');
      if (product.archived_at) throw Error('Product is archived');
      if (!balance || balance.user_id !== userId || (!balance.locally_initialized && !balance.server_initialized)) throw Error('stock_not_initialized');
      const quantity = normalizeQuantityForUnit(input.quantity, product.unit);
      const unit_cost = normalizeMoney(input.unitCost);
      if (quantity <= '0.000000' || unit_cost < '0.000000') throw Error('Invalid purchase line');
      const line_total = multiplyMoney(quantity, unit_cost);
      total = addQuantities(total, line_total);
      normalized.push({ id: uuidv4(), purchase_id: id, user_id: userId, product_id: product.id, product_name_snapshot: product.name, unit_snapshot: product.unit || 'piece', quantity, unit_cost, line_total, movement_id: uuidv4() });
    }
    const depends_on_many = [...new Set((await Promise.all(normalized.map((line) => getLatestInventoryTail(userId, line.product_id, database)))).filter(Boolean))];
    const doc = { id, user_id: userId, purchased_at: purchasedAt, supplier_name: supplierName, reference, total_amount: total, created_at: new Date().toISOString(), updated_at: new Date().toISOString() };
    const op = await createOutboxOperation({ operation_id: id, user_id: userId, entity_type: 'purchase', action: 'post', entity_id: id, depends_on_many, payload: { ...doc, lines: normalized } }, database);
    for (const line of normalized) {
      await database.v2_purchase_lines.add(line);
      await database.inventory_movements.add({ id: line.movement_id, user_id: userId, product_id: line.product_id, movement_type: 'purchase', qty_change: line.quantity, status: 'pending', client_created_at: purchasedAt, source_operation_id: id, sequence: op.sequence });
      const balance = await database.inventory_balances.get(line.product_id);
      await database.inventory_balances.put({ ...balance, current_quantity: addQuantities(balance.current_quantity, line.quantity), projected_revision: (balance.projected_revision || 0) + 1, pending_count: (balance.pending_count || 0) + 1 });
    }
    await database.v2_purchase_documents.add(doc);
    return { document: doc, lines: normalized, operation: op };
  });
}
