import { db } from './db';
import { supabase, deleteImage } from './supabase';
import { uploadBase64ToSupabase } from './imageUtils';

export async function pullFromSupabase(userId) {
  const PAGE_SIZE = 1000;

  // Categories: full replace (no local-only fields)
  let allCatData = [];
  let catFrom = 0;
  while (true) {
    const { data, error } = await supabase
      .from('categories')
      .select('*')
      .eq('user_id', userId)
      .range(catFrom, catFrom + PAGE_SIZE - 1);
    if (error || !data || data.length === 0) break;
    allCatData = allCatData.concat(data);
    if (data.length < PAGE_SIZE) break;
    catFrom += PAGE_SIZE;
  }

  await db.categories.clear();
  if (allCatData.length > 0) await db.categories.bulkPut(allCatData);

  // Products: merge carefully — preserve pending local records (e.g. image_base64 not yet uploaded)
  let allProdData = [];
  let prodFrom = 0;
  while (true) {
    const { data, error } = await supabase
      .from('products')
      .select('*')
      .eq('user_id', userId)
      .range(prodFrom, prodFrom + PAGE_SIZE - 1);
    if (error || !data || data.length === 0) break;
    allProdData = allProdData.concat(data);
    if (data.length < PAGE_SIZE) break;
    prodFrom += PAGE_SIZE;
  }

  if (allProdData.length >= 0) {
    // IDs that still have pending sync operations
    const pendingIds = new Set(
      (await db.sync_queue.where('table_name').equals('products').toArray())
        .map(q => q.record_id)
    );

    // Update/insert products from Supabase that are not pending
    const toUpdate = allProdData.filter(p => !pendingIds.has(p.id));
    if (toUpdate.length > 0) await db.products.bulkPut(toUpdate);

    // Remove products deleted remotely (not pending locally)
    const remoteIds = new Set(allProdData.map(p => p.id));
    const localAll = await db.products.toArray();
    for (const local of localAll) {
      if (!remoteIds.has(local.id) && !pendingIds.has(local.id)) {
        await db.products.delete(local.id);
      }
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
      const rawData = item.data ? { ...item.data } : {};

      // Upload pending Base64 image before INSERT or UPDATE
      if (item.table_name === 'products' && rawData.image_base64 && item.operation !== 'DELETE') {
        try {
          const publicUrl = await uploadBase64ToSupabase(rawData.image_base64, supabase);
          rawData.image_url = publicUrl;
          // Update Dexie so the card shows the real URL immediately
          await db.products.update(item.record_id, { image_url: publicUrl, image_base64: null });
        } catch {
          // Image upload failed — leave queue item, retry on next sync
          failed++;
          continue;
        }
      }

      // Strip Dexie-only fields before sending to Supabase
      delete rawData.image_base64;
      delete rawData._old_image_url;

      if (item.operation === 'INSERT') {
        const { error } = await supabase.from(item.table_name).insert(rawData);
        if (error) throw error;
      } else if (item.operation === 'UPDATE') {
        // Delete old image from Storage if it was replaced
        if (item.table_name === 'products' && item.data?._old_image_url) {
          await deleteImage(item.data._old_image_url).catch(() => {});
        }
        const { error } = await supabase
          .from(item.table_name)
          .update(rawData)
          .eq('id', item.record_id);
        if (error) throw error;
      } else if (item.operation === 'DELETE') {
        if (item.table_name === 'products' && item.data?.image_url) {
          await deleteImage(item.data.image_url).catch(() => {});
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
