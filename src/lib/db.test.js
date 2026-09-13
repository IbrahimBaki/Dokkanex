import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { db, dbReady } from './db';

describe('current local database foundation', () => {
  beforeEach(async () => {
    await dbReady;
    await Promise.all(db.tables.map((table) => table.clear()));
  });

  afterAll(async () => {
    db.close();
    await db.delete();
  });

  it('retains the current V2 Dexie schema before the future inventory upgrade', async () => {
    expect(db.verno).toBe(2);
    expect(db.tables.map((table) => table.name).sort()).toEqual([
      'app_meta',
      'categories',
      'products',
      'sync_queue',
    ]);
  });

  it('stores the current offline product record shape without requiring a network', async () => {
    await db.products.put({
      id: 'local-product',
      name: 'Local product',
      user_id: 'local-user',
      created_at: '2026-09-13T00:00:00.000Z',
    });

    await expect(db.products.get('local-product')).resolves.toMatchObject({
      id: 'local-product',
      user_id: 'local-user',
    });
  });
});
