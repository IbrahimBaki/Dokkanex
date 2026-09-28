import { v4 as uuidv4 } from 'uuid';
import { db as defaultDb } from './db';
import { addQuantities, compareQuantities, multiplyMoney, normalizeMoney, normalizeQuantityForUnit, subtractQuantities } from './quantity';
import { createOutboxOperation } from './outbox';
import { getLatestInventoryTail, isInventoryInitialized } from './inventoryLocal';

/** Create an immutable local sale and its negative inventory movements atomically. */
export async function recordSale({ userId, soldAt = new Date().toISOString(), paymentMethod = 'cash', customerName = null, notes = null, profileSnapshot = {}, allowNegative = false, confirmedBeforeQuantities = {}, lines }, database = defaultDb) {
  if (!lines?.length) throw Error('Sale requires lines');
  if (new Set(lines.map((line) => line.productId)).size !== lines.length) throw Error('Duplicate product line');

  return database.transaction('rw', database.products, database.inventory_balances, database.inventory_movements, database.v2_sale_documents, database.v2_sale_lines, database.outbox_operations, database.sync_state, async () => {
    const id = uuidv4();
    let subtotal = '0.000000';
    let discountAmount = '0.000000';
    const normalized = [];
    const negative = [];
    for (const input of lines) {
      const product = await database.products.get(input.productId);
      const balance = await database.inventory_balances.get(input.productId);
      if (!product || product.user_id !== userId) throw Error('Product does not belong');
      if (product.archived_at) throw Error('Product is archived');
      if (!balance || balance.user_id !== userId || !isInventoryInitialized(balance)) throw Error('stock_not_initialized');
      const quantity = normalizeQuantityForUnit(input.quantity, product.unit);
      const unit_price = normalizeMoney(input.unitPrice);
      const lineDiscount = normalizeMoney(input.discountAmount ?? '0');
      if (compareQuantities(quantity, '0') <= 0 || compareQuantities(unit_price, '0') < 0 || compareQuantities(lineDiscount, '0') < 0) throw Error('Invalid sale line');
      const lineSubtotal = multiplyMoney(quantity, unit_price);
      const lineTotal = subtractQuantities(lineSubtotal, lineDiscount);
      if (compareQuantities(lineTotal, '0') < 0) throw Error('Line discount exceeds amount');
      const after = subtractQuantities(balance.current_quantity, quantity);
      if (compareQuantities(after, '0') < 0) negative.push({ product_id: product.id, before_quantity: balance.current_quantity, after_quantity: after });
      subtotal = addQuantities(subtotal, lineSubtotal);
      discountAmount = addQuantities(discountAmount, lineDiscount);
      normalized.push({ id: uuidv4(), sale_id: id, user_id: userId, product_id: product.id, product_name_snapshot: product.name, unit_snapshot: product.unit || 'piece', quantity, unit_price, discount_amount: lineDiscount, line_total: lineTotal, movement_id: uuidv4() });
    }
    if (negative.length) {
      const stillConfirmed = allowNegative && negative.every((item) => confirmedBeforeQuantities[item.product_id] && compareQuantities(confirmedBeforeQuantities[item.product_id], item.before_quantity) === 0);
      if (!stillConfirmed) return { status: 'negative_confirmation_required', affected: negative };
    }
    const depends_on_many = [...new Set((await Promise.all(normalized.map((line) => getLatestInventoryTail(userId, line.product_id, database)))).filter(Boolean))];
    const total_amount = subtractQuantities(subtotal, discountAmount);
    const now = new Date().toISOString();
    const doc = { id, user_id: userId, sold_at: soldAt, invoice_number: `LOCAL-${id.slice(0, 8).toUpperCase()}`, payment_method: paymentMethod || 'cash', customer_name: customerName || null, notes: notes || null, subtotal, discount_amount: discountAmount, total_amount, profile_snapshot: profileSnapshot, created_at: now, updated_at: now };
    const op = await createOutboxOperation({ operation_id: id, user_id: userId, entity_type: 'sale', action: 'post', entity_id: id, depends_on_many, payload: { ...doc, allow_negative: Boolean(allowNegative), lines: normalized } }, database);
    for (const line of normalized) {
      await database.v2_sale_lines.add(line);
      await database.inventory_movements.add({ id: line.movement_id, user_id: userId, product_id: line.product_id, movement_type: 'sale', qty_change: subtractQuantities('0', line.quantity), status: 'pending', client_created_at: soldAt, source_operation_id: id, sequence: op.sequence });
      const balance = await database.inventory_balances.get(line.product_id);
      await database.inventory_balances.put({ ...balance, current_quantity: subtractQuantities(balance.current_quantity, line.quantity), projected_revision: (balance.projected_revision || 0) + 1, pending_count: (balance.pending_count || 0) + 1, last_movement_id: line.movement_id, updated_at: now });
    }
    await database.v2_sale_documents.add(doc);
    return { status: 'pending', document: doc, lines: normalized, operation: op, would_be_negative: negative.length > 0 };
  });
}
