import { v4 as uuidv4 } from 'uuid'
import { db as defaultDb } from './db'
import { addQuantities, compareQuantities, normalizeQuantityForUnit } from './quantity'
import { createOutboxOperation } from './outbox'
import { getLatestInventoryTail } from './inventoryLocal'

export async function recordSaleReturn({ userId, saleId, reason = null, lines }, database = defaultDb) {
  if (!lines?.length) throw Error('Return requires lines')
  if (new Set(lines.map((line) => line.saleLineId)).size !== lines.length) throw Error('Duplicate return line')
  return database.transaction('rw', database.v2_sale_documents, database.v2_sale_lines, database.v2_sale_return_documents, database.v2_sale_return_lines, database.products, database.inventory_balances, database.inventory_movements, database.outbox_operations, database.sync_state, async () => {
    const sale = await database.v2_sale_documents.get(saleId); if (!sale || sale.user_id !== userId) throw Error('Sale does not belong')
    const id = uuidv4(), normalized = []; let total = '0.000000'
    for (const input of lines) {
      const saleLine = await database.v2_sale_lines.get(input.saleLineId); if (!saleLine || saleLine.sale_id !== saleId || saleLine.user_id !== userId) throw Error('Invalid sale line')
      const product = await database.products.get(saleLine.product_id); const balance = await database.inventory_balances.get(saleLine.product_id)
      if (!product || !balance || balance.user_id !== userId) throw Error('Product stock is unavailable')
      const quantity = normalizeQuantityForUnit(input.quantity, saleLine.unit_snapshot)
      if (compareQuantities(quantity, '0') <= 0) throw Error('Invalid return quantity')
      const previous = (await database.v2_sale_return_lines.where('sale_line_id').equals(saleLine.id).toArray()).filter((line) => line.user_id === userId).reduce((sum, line) => addQuantities(sum, line.quantity), '0.000000')
      if (compareQuantities(addQuantities(previous, quantity), saleLine.quantity) > 0) throw Error('Return exceeds sold quantity')
      const lineTotal = String((Number(saleLine.line_total) * Number(quantity) / Number(saleLine.quantity)).toFixed(6)); total = addQuantities(total, lineTotal)
      normalized.push({ id: uuidv4(), return_id: id, sale_line_id: saleLine.id, user_id: userId, product_id: saleLine.product_id, quantity, movement_id: uuidv4() })
    }
    const deps = [...new Set((await Promise.all(normalized.map((line) => getLatestInventoryTail(userId, line.product_id, database)))).filter(Boolean))]
    const doc = { id, user_id: userId, sale_id: saleId, returned_at: new Date().toISOString(), reason: reason || null, total_amount: total, created_at: new Date().toISOString() }
    const op = await createOutboxOperation({ operation_id: id, user_id: userId, entity_type: 'sale_return', action: 'post', entity_id: id, depends_on_many: deps, payload: { ...doc, lines: normalized } }, database)
    for (const line of normalized) { await database.v2_sale_return_lines.add(line); await database.inventory_movements.add({ id: line.movement_id, user_id: userId, product_id: line.product_id, movement_type: 'sale_return', qty_change: line.quantity, status: 'pending', client_created_at: doc.returned_at, source_operation_id: id, sequence: op.sequence }); const balance = await database.inventory_balances.get(line.product_id); await database.inventory_balances.put({ ...balance, current_quantity: addQuantities(balance.current_quantity, line.quantity), projected_revision: (balance.projected_revision || 0) + 1, pending_count: (balance.pending_count || 0) + 1, last_movement_id: line.movement_id, updated_at: doc.returned_at }) }
    await database.v2_sale_return_documents.add(doc); return { document: doc, lines: normalized, operation: op }
  })
}
