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

  it('retains V1 stores while exposing the V6 local inventory, sales, and returns foundation', async () => {
    expect(db.verno).toBe(6);
    expect(db.tables.map((table) => table.name).sort()).toEqual([
      'app_meta',
      'categories',
      'image_blobs',
      'inventory_balances',
      'inventory_movements',
      'outbox_operations',
      'products',
      'shop_profiles',
      'sync_queue',
      'sync_state',
      'v2_purchase_documents',
      'v2_purchase_lines',
      'v2_sale_documents',
      'v2_sale_lines',
      'v2_sale_return_documents',
      'v2_sale_return_lines',
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
