import { beforeEach, describe, expect, it, vi } from 'vitest';
import { db, dbReady } from '../../src/lib/db';
import { getLegacyPendingCount, pullFromSupabase, pushToSupabase } from '../../src/lib/syncManager';
import { supabase } from '../../src/lib/supabase';

describe('V1 legacy queue ownership', () => {
  beforeEach(async () => {
    vi.restoreAllMocks();
    await dbReady;
    await Promise.all(db.tables.map((table) => table.clear()));
  });

  it('never pushes User B or ambiguous queue work while syncing User A', async () => {
    await db.products.put({ id: 'b-product', user_id: 'user-b', name: 'B product' });
    await db.sync_queue.bulkAdd([
      { table_name: 'products', operation: 'UPDATE', record_id: 'b-product', data: { user_id: 'user-b', name: 'B update' }, created_at: 'old' },
      { table_name: 'products', operation: 'UPDATE', record_id: 'unknown-product', data: {}, created_at: 'old' },
    ]);
    const from = vi.spyOn(supabase, 'from');

    await expect(pushToSupabase('user-a')).resolves.toEqual({ pushed: 0, failed: 0 });

    expect(from).not.toHaveBeenCalled();
    expect(await getLegacyPendingCount('user-a')).toBe(0);
    expect(await getLegacyPendingCount('user-b')).toBe(1);
    expect(await db.sync_queue.count()).toBe(2);
  });

  it('preserves User A pending catalog records and User B records during a direct User A V1 pull', async () => {
    await db.products.bulkPut([{ id: 'a-product', user_id: 'user-a', name: 'A draft' }, { id: 'b-product', user_id: 'user-b', name: 'B product' }]);
    await db.categories.bulkPut([{ id: 'a-category', user_id: 'user-a', name: 'A draft category' }, { id: 'b-category', user_id: 'user-b', name: 'B category' }]);
    await db.sync_queue.bulkAdd([
      { table_name: 'products', operation: 'UPDATE', record_id: 'a-product', data: {}, created_at: 'old' },
      { table_name: 'categories', operation: 'UPDATE', record_id: 'a-category', data: { user_id: 'user-a' }, created_at: 'old' },
    ]);
    vi.spyOn(supabase, 'from').mockImplementation(() => ({ select: () => ({ eq: () => ({ range: async () => ({ data: [], error: null }) }) }) }));

    await pullFromSupabase('user-a');

    expect(await db.products.get('a-product')).toMatchObject({ user_id: 'user-a' });
    expect(await db.categories.get('a-category')).toMatchObject({ user_id: 'user-a' });
    expect(await db.products.get('b-product')).toMatchObject({ user_id: 'user-b' });
    expect(await db.categories.get('b-category')).toMatchObject({ user_id: 'user-b' });
  });

  it('does not apply a stale in-flight User A V1 pull response after account invalidation', async () => {
    await db.categories.put({ id: 'a-local', user_id: 'user-a', name: 'A local' });
    await db.products.put({ id: 'b-product', user_id: 'user-b', name: 'B product' });
    await db.categories.put({ id: 'b-category', user_id: 'user-b', name: 'B category' });
    let resolveRemote;
    let started;
    const response = new Promise((resolve) => { resolveRemote = resolve; });
    const requestStarted = new Promise((resolve) => { started = resolve; });
    vi.spyOn(supabase, 'from').mockImplementation(() => ({
      select: () => ({ eq: () => ({ range: async () => { started(); return response; } }) }),
    }));
    let current = true;
    const pull = pullFromSupabase('user-a', { isCurrent: async () => current });
    await requestStarted;
    current = false;
    resolveRemote({ data: [{ id: 'a-remote', user_id: 'user-a', name: 'Stale remote' }], error: null });

    await expect(pull).resolves.toEqual({ cancelled: true });
    expect(await db.categories.get('a-local')).toMatchObject({ user_id: 'user-a' });
    expect(await db.categories.get('a-remote')).toBeUndefined();
    expect(await db.products.get('b-product')).toMatchObject({ user_id: 'user-b' });
    expect(await db.categories.get('b-category')).toMatchObject({ user_id: 'user-b' });
  });
});
