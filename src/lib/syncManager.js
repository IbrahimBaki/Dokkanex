import { db } from './db';
import { supabase, deleteImage } from './supabase';

export async function pullFromSupabase(userId) {
  const tables = ['categories', 'products'];

  for (const table of tables) {
    const { data, error } = await supabase
      .from(table)
      .select('*')
      .eq('user_id', userId);

    if (!error && data) {
      await db[table].clear();
      if (data.length > 0) await db[table].bulkPut(data);
    }
  }

  await db.app_meta.put({ key: 'last_sync', value: new Date().toISOString() });
}

export async function pushToSupabase() {
  const queue = await db.sync_queue.orderBy('id').toArray();
  if (queue.length === 0) return { pushed: 0, failed: 0 };

  let pushed = 0;
  let failed = 0;

  for (const item of queue) {
    try {
      if (item.operation === 'INSERT') {
        const { error } = await supabase.from(item.table_name).insert(item.data);
        if (error) throw error;
      } else if (item.operation === 'UPDATE') {
        const { error } = await supabase
          .from(item.table_name)
          .update(item.data)
          .eq('id', item.record_id);
        if (error) throw error;
      } else if (item.operation === 'DELETE') {
        if (item.table_name === 'products' && item.data?.image_url) {
          await deleteImage(item.data.image_url);
        }
        const { error } = await supabase
          .from(item.table_name)
          .delete()
          .eq('id', item.record_id);
        if (error) throw error;
      }
      await db.sync_queue.delete(item.id);
      pushed++;
    } catch {
      failed++;
    }
  }

  return { pushed, failed };
}

export async function fullSync(userId) {
  const pushResult = await pushToSupabase();
  await pullFromSupabase(userId);
  return pushResult;
}

export async function addToQueue(table_name, operation, record_id, data) {
  await db.sync_queue.add({
    table_name,
    operation,
    record_id,
    data,
    created_at: new Date().toISOString()
  });
}

export async function getPendingCount() {
  return await db.sync_queue.count();
}

export async function getLastSync() {
  const meta = await db.app_meta.get('last_sync');
  return meta?.value || null;
}
