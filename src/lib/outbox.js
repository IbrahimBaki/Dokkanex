import { db as defaultDb } from './db';

export const OUTBOX_STATUSES = new Set([
  'pending', 'syncing', 'succeeded', 'retryable_failed', 'conflict', 'blocked', 'permanent_failed'
]);

const PROJECTED_STATUSES = new Set(['pending', 'syncing', 'retryable_failed']);
const ALLOWED_AUTOMATIC_TRANSITIONS = {
  pending: new Set(['syncing', 'blocked']),
  retryable_failed: new Set(['syncing', 'blocked']),
  syncing: new Set(['succeeded', 'retryable_failed', 'conflict', 'permanent_failed']),
};

const stateId = (userId) => `outbox_sequence:${userId}`;

export async function createOutboxOperation(input, database = defaultDb) {
  if (!input.operation_id || !input.user_id || !input.entity_type || !input.entity_id || !input.action) {
    throw new Error('Outbox operation requires operation_id, user_id, entity_type, entity_id, and action');
  }
  const now = new Date().toISOString();
  return database.transaction('rw', database.outbox_operations, database.sync_state, async () => {
    const id = stateId(input.user_id);
    const state = await database.sync_state.get(id);
    const sequence = (state?.next_sequence ?? 0) + 1;
    const operation = {
      ...input,
      sequence,
      status: 'pending',
      depends_on: input.depends_on ?? null,
      depends_on_many: [...new Set((input.depends_on_many ?? []).filter((dependency) => dependency && dependency !== input.operation_id))],
      created_at: now,
      updated_at: now,
      attempt_count: 0,
      last_attempt_at: null,
      last_error_code: null,
      last_error_message: null,
      server_receipt: null,
      reconciled_at: null,
    };
    await database.outbox_operations.add(operation);
    await database.sync_state.put({
      id,
      user_id: input.user_id,
      scope: 'outbox_sequence',
      next_sequence: sequence,
      updated_at: now,
    });
    return operation;
  });
}

export async function transitionOutboxOperation(operationId, status, patch = {}, database = defaultDb) {
  if (!OUTBOX_STATUSES.has(status)) throw new Error('Invalid outbox status');
  const operation = await database.outbox_operations.get(operationId);
  if (!operation) throw new Error('Outbox operation not found');
  if (!ALLOWED_AUTOMATIC_TRANSITIONS[operation.status]?.has(status)) {
    throw new Error(`Automatic outbox transition from ${operation.status} to ${status} is not allowed`);
  }
  const safePatch = { ...patch };
  delete safePatch.status;
  delete safePatch.updated_at;
  delete safePatch.attempt_count;
  delete safePatch.last_attempt_at;
  const now = new Date().toISOString();
  const update = { ...safePatch, status, updated_at: now };
  if (status === 'syncing') {
    update.attempt_count = operation.attempt_count + 1;
    update.last_attempt_at = now;
  }
  await database.outbox_operations.update(operationId, update);
  return database.outbox_operations.get(operationId);
}

export async function recoverAbandonedSyncing(
  userId,
  { staleAfterMs = 5 * 60 * 1000, now = Date.now() } = {},
  database = defaultDb,
) {
  const syncing = await database.outbox_operations.where('[user_id+status+sequence]').between([userId, 'syncing', -Infinity], [userId, 'syncing', Infinity]).toArray();
  const cutoff = now - staleAfterMs;
  const recoverable = syncing.filter((operation) => (
    !operation.server_receipt
    && operation.last_attempt_at
    && Date.parse(operation.last_attempt_at) < cutoff
  ));
  await database.transaction('rw', database.outbox_operations, async () => {
    for (const operation of recoverable) {
      await database.outbox_operations.update(operation.operation_id, { status: 'pending', updated_at: new Date().toISOString() });
    }
  });
  return recoverable.length;
}

export async function getProjectableOutbox(userId, productId, database = defaultDb) {
  const rows = await database.outbox_operations.where('[user_id+entity_type+entity_id]').equals([userId, 'inventory_movement', productId]).toArray();
  return rows.filter((row) => PROJECTED_STATUSES.has(row.status)).sort((a, b) => a.sequence - b.sequence);
}

export async function cleanupSucceededOutbox(userId, { keepRecent = 50 } = {}, database = defaultDb) {
  const rows = await database.outbox_operations.where('[user_id+status+sequence]').between([userId, 'succeeded', -Infinity], [userId, 'succeeded', Infinity]).toArray();
  const unresolvedDependencies = new Set((await database.outbox_operations.where('user_id').equals(userId).toArray())
    .filter((row) => !row.reconciled_at)
    .flatMap((row) => [row.depends_on, ...(row.depends_on_many ?? [])].filter(Boolean)));
  const eligible = rows.filter((row) => row.server_receipt && row.reconciled_at && !unresolvedDependencies.has(row.operation_id)).sort((a, b) => b.sequence - a.sequence);
  const remove = eligible.slice(keepRecent);
  await database.outbox_operations.bulkDelete(remove.map((row) => row.operation_id));
  return remove.length;
}

// C2 bridge boundary: this proves ownership but intentionally does not move or
// process any legacy queue row. Ambiguous records remain untouched/blocked.
export async function proveLegacyQueueOwnership(row, userId, database = defaultDb) {
  const payloadUser = row?.data?.user_id;
  if (payloadUser) return { proven: payloadUser === userId, reason: 'payload_user_id' };
  if (!row?.record_id || !['products', 'categories'].includes(row.table_name)) {
    return { proven: false, reason: 'ambiguous' };
  }
  const table = row.table_name === 'products' ? database.products : database.categories;
  const entity = await table.get(row.record_id);
  return { proven: entity?.user_id === userId, reason: entity?.user_id ? 'local_entity' : 'ambiguous' };
}
