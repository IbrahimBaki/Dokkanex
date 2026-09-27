import { execFileSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import pg from 'pg';
import { createClient } from '@supabase/supabase-js';
import 'fake-indexeddb/auto';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createDatabase } from '../../src/lib/db.js';
import { initializeStock } from '../../src/lib/inventoryLocal.js';
import { createV2SyncRunner } from '../../src/lib/v2Sync.js';

const USER_A = '11111111-1111-4111-8111-111111111111';
const USER_B = '22222222-2222-4222-8222-222222222222';
const INSTANCE_ID = '00000000-0000-0000-0000-000000000000';

function localDatabaseUrl() {
  const output = localSupabaseEnv();
  const line = output.DB_URL;
  if (!line) throw new Error('Local Supabase DB_URL is unavailable. Run `supabase start` locally.');
  return line;
}

function localSupabaseEnv() {
  const output = execFileSync('npx', ['supabase', 'status', '-o', 'env'], {
    encoding: 'utf8',
    cwd: process.cwd(),
  });
  return Object.fromEntries(output.split(/\r?\n/)
    .filter((entry) => entry.includes('='))
    .map((entry) => {
      const separator = entry.indexOf('=');
      return [entry.slice(0, separator), entry.slice(separator + 1).replace(/^"|"$/g, '')];
    }));
}

let pool;

async function asUser(userId, callback) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query('SET LOCAL ROLE authenticated');
    await client.query("SELECT set_config('request.jwt.claim.sub', $1, true)", [userId]);
    const result = await callback(client);
    await client.query('COMMIT');
    return result;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

async function createProduct(userId, suffix = randomUUID()) {
  const { rows } = await pool.query(
    `INSERT INTO public.products (id, name, wholesale_price, selling_price, user_id)
     VALUES ($1, $2, 1, 2, $3) RETURNING id`,
    [randomUUID(), `V2 local test ${suffix}`, userId],
  );
  return rows[0].id;
}

async function postMovement(userId, productId, type, quantity, operationId = randomUUID(), extra = {}) {
  return asUser(userId, async (client) => {
    const { rows } = await client.query(
      `SELECT public.post_inventory_movement(
        $1::uuid, $2::uuid, $3::text, $4::numeric, $5::timestamptz,
        $6::text, $7::text, $8::uuid
      ) AS receipt`,
      [
        operationId,
        productId,
        type,
        quantity,
        extra.clientCreatedAt ?? '2026-09-13T00:00:00.000Z',
        extra.reason ?? null,
        extra.note ?? null,
        extra.reversesMovementId ?? null,
      ],
    );
    return rows[0].receipt;
  });
}

async function postCount(userId, productId, base, revision, counted, operationId = randomUUID(), extra = {}) {
  return asUser(userId, async (client) => {
    const { rows } = await client.query(
      `SELECT public.post_stock_count(
        $1::uuid, $2::uuid, $3::numeric, $4::bigint, $5::numeric,
        $6::timestamptz, $7::text, $8::text
      ) AS receipt`,
      [
        operationId, productId, base, revision, counted,
        extra.clientCreatedAt ?? '2026-09-13T00:00:00.000Z', extra.reason ?? null, extra.note ?? null,
      ],
    );
    return rows[0].receipt;
  });
}

async function balance(productId) {
  const { rows } = await pool.query(
    'SELECT current_quantity::text AS quantity, revision, last_movement_id FROM public.inventory_balances WHERE product_id = $1',
    [productId],
  );
  return rows[0] ?? null;
}

const delay = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));

async function startUserTransaction(userId) {
  const client = await pool.connect();
  await client.query('BEGIN');
  await client.query('SET LOCAL ROLE authenticated');
  await client.query("SELECT set_config('request.jwt.claim.sub', $1, true)", [userId]);
  return client;
}

beforeAll(async () => {
  pool = new pg.Pool({ connectionString: localDatabaseUrl() });
  await pool.query(
    `INSERT INTO auth.users (
      instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
      raw_app_meta_data, raw_user_meta_data, created_at, updated_at
    ) VALUES
      ($1, $2, 'authenticated', 'authenticated', 'v2-test-a@example.test', 'not-used', now(), '{}'::jsonb, '{}'::jsonb, now(), now()),
      ($1, $3, 'authenticated', 'authenticated', 'v2-test-b@example.test', 'not-used', now(), '{}'::jsonb, '{}'::jsonb, now(), now())
    ON CONFLICT (id) DO NOTHING`,
    [INSTANCE_ID, USER_A, USER_B],
  );
});

beforeEach(async () => {
  await pool.query('TRUNCATE public.inventory_balances, public.stock_movements, public.products, public.categories CASCADE');
});

afterAll(async () => {
  if (pool) await pool.end();
});

describe('local V2 inventory migration, RPC, and RLS foundation', () => {
  it('enforces authenticated product/category ownership and category association integrity', async () => {
    const categoryA = randomUUID();
    const categoryB = randomUUID();
    await pool.query(
      'INSERT INTO public.categories (id, name, user_id) VALUES ($1, $2, $3), ($4, $5, $6)',
      [categoryA, 'A category', USER_A, categoryB, 'B category', USER_B],
    );
    const productA = await createProduct(USER_A);
    const productB = await createProduct(USER_B);

    expect((await asUser(USER_A, (client) => client.query('SELECT id FROM public.products WHERE id = $1', [productB]))).rows).toEqual([]);
    expect((await asUser(USER_A, (client) => client.query('UPDATE public.products SET name = $2 WHERE id = $1', [productB, 'not allowed']))).rowCount).toBe(0);
    expect((await asUser(USER_A, (client) => client.query('DELETE FROM public.products WHERE id = $1', [productB]))).rowCount).toBe(0);
    await expect(asUser(USER_A, (client) => client.query(
      'INSERT INTO public.products (id, name, wholesale_price, selling_price, user_id) VALUES ($1, $2, 1, 2, $3)',
      [randomUUID(), 'wrong owner', USER_B],
    ))).rejects.toMatchObject({ code: '42501' });
    await expect(asUser(USER_A, (client) => client.query(
      'INSERT INTO public.products (id, name, wholesale_price, selling_price, user_id, category_id) VALUES ($1, $2, 1, 2, $3, $4)',
      [randomUUID(), 'wrong category owner', USER_A, categoryB],
    ))).rejects.toMatchObject({ code: '23514' });
    expect((await asUser(USER_A, (client) => client.query('UPDATE public.categories SET name = $2 WHERE id = $1', [categoryB, 'not allowed']))).rowCount).toBe(0);
    expect((await asUser(USER_A, (client) => client.query('DELETE FROM public.categories WHERE id = $1', [categoryB]))).rowCount).toBe(0);
    expect((await asUser(USER_A, (client) => client.query('SELECT id FROM public.categories WHERE id = $1', [categoryB]))).rows).toEqual([]);
    await expect(asUser(USER_A, (client) => client.query(
      'INSERT INTO public.categories (id, name, user_id) VALUES ($1, $2, $3)',
      [randomUUID(), 'wrong owner category', USER_B],
    ))).rejects.toMatchObject({ code: '42501' });

    expect((await asUser(USER_A, (client) => client.query('UPDATE public.products SET category_id = $2 WHERE id = $1', [productA, categoryA]))).rowCount).toBe(1);
    expect((await asUser(USER_A, (client) => client.query('SELECT id FROM public.categories WHERE id = $1', [categoryA]))).rows).toHaveLength(1);
  });

  it('keeps product-images writes scoped to the authenticated path prefix and reports product ownership drift', async () => {
    const storagePolicies = await pool.query(
      "SELECT policyname, cmd, COALESCE(qual, '') AS qual, COALESCE(with_check, '') AS with_check FROM pg_policies WHERE schemaname = 'storage' AND tablename = 'objects' AND policyname LIKE 'product_images_%' ORDER BY policyname",
    );
    expect(storagePolicies.rows.map(({ policyname, cmd }) => ({ policyname, cmd }))).toEqual([
      { policyname: 'product_images_delete_own_prefix', cmd: 'DELETE' },
      { policyname: 'product_images_insert_own_prefix', cmd: 'INSERT' },
      { policyname: 'product_images_public_read', cmd: 'SELECT' },
    ]);
    for (const policy of storagePolicies.rows.filter(({ cmd }) => cmd === 'INSERT' || cmd === 'DELETE')) {
      expect(`${policy.qual} ${policy.with_check}`).toContain("bucket_id = 'product-images'::text");
      expect(`${policy.qual} ${policy.with_check}`).toContain("(auth.uid())::text");
    }

    const productId = await createProduct(USER_A);
    await postMovement(USER_A, productId, 'opening', '3');
    await pool.query('UPDATE public.inventory_balances SET user_id = $2 WHERE product_id = $1', [productId, USER_B]);
    const drift = await pool.query('SELECT issue FROM public.v2_inventory_balance_drift() WHERE product_id = $1', [productId]);
    expect(drift.rows).toEqual([{ issue: 'balance_product_owner_mismatch' }]);
    await pool.query('UPDATE public.inventory_balances SET user_id = $2 WHERE product_id = $1', [productId, USER_A]);
    await pool.query('UPDATE public.stock_movements SET user_id = $2 WHERE product_id = $1', [productId, USER_B]);
    const movementDrift = await pool.query('SELECT issue FROM public.v2_inventory_balance_drift() WHERE product_id = $1', [productId]);
    expect(movementDrift.rows).toEqual([{ issue: 'movement_product_owner_mismatch' }]);
  });

  it('exposes the additive V2 schema without initializing legacy products', async () => {
    const productId = await createProduct(USER_A, 'legacy-compatible');
    const { rows } = await pool.query(
      `SELECT metadata_version, low_stock_threshold, archived_at,
              EXISTS (SELECT 1 FROM public.inventory_balances WHERE product_id = p.id) AS initialized
       FROM public.products p WHERE id = $1`,
      [productId],
    );
    expect(rows[0]).toMatchObject({ metadata_version: '0', low_stock_threshold: null, archived_at: null, initialized: false });
  });

  it('keeps local Auth login and V1 product/category CRUD compatible', async () => {
    const env = localSupabaseEnv();
    const client = createClient(env.API_URL, env.ANON_KEY, { auth: { persistSession: false } });
    const email = `v2-v1-compat-${randomUUID()}@example.test`;
    const password = 'local-test-password';
    const signup = await client.auth.signUp({ email, password });
    expect(signup.error).toBeNull();
    await client.auth.signOut();
    const login = await client.auth.signInWithPassword({ email, password });
    expect(login.error).toBeNull();
    expect(login.data.user).toBeTruthy();
    const category = await client.from('categories').insert({
      id: randomUUID(),
      name: 'V1 compatibility',
      user_id: login.data.user.id,
    }).select().single();
    expect(category.error).toBeNull();
    const product = await client.from('products').insert({
      id: randomUUID(),
      name: 'V1 product',
      image_url: 'legacy-image-url',
      wholesale_price: 1,
      selling_price: 2,
      category_id: category.data.id,
      user_id: login.data.user.id,
    }).select().single();
    expect(product.error).toBeNull();
    const edited = await client.from('products').update({ name: 'V1 product edited', unit: 'piece' }).eq('id', product.data.id).select().single();
    expect(edited.error).toBeNull();
    expect(edited.data.metadata_version).toBe(1);
    const removedCategory = await client.from('categories').delete().eq('id', category.data.id);
    expect(removedCategory.error).toBeNull();
    const afterCategoryDelete = await client.from('products').select('category_id,image_url').eq('id', product.data.id).single();
    expect(afterCategoryDelete.error).toBeNull();
    expect(afterCategoryDelete.data).toEqual({ category_id: null, image_url: 'legacy-image-url' });
    await client.auth.signOut();
  });

  it('syncs an offline local opening through the authenticated browser RPC path', async () => {
    const env = localSupabaseEnv();
    const client = createClient(env.API_URL, env.ANON_KEY, { auth: { persistSession: false } });
    const email = `v2-c2-${randomUUID()}@example.test`;
    const password = 'local-test-password';
    expect((await client.auth.signUp({ email, password })).error).toBeNull();
    await client.auth.signOut();
    const login = await client.auth.signInWithPassword({ email, password });
    expect(login.error).toBeNull();
    const remoteProduct = await client.from('products').insert({
      id: randomUUID(), name: 'C2 local opening', wholesale_price: 1, selling_price: 2, user_id: login.data.user.id,
    }).select().single();
    expect(remoteProduct.error).toBeNull();
    const database = createDatabase(`c2-local-${randomUUID()}`);
    await database.open();
    try {
      await database.products.put(remoteProduct.data);
      const local = await initializeStock({ userId: login.data.user.id, productId: remoteProduct.data.id, quantity: '2.125' }, database);
      const runner = createV2SyncRunner({ client, database });
      await runner.sync(login.data.user.id);
      expect(await database.outbox_operations.get(local.operation.operation_id)).toMatchObject({ status: 'succeeded', reconciled_at: expect.any(String) });
      expect(await database.inventory_balances.get(remoteProduct.data.id)).toMatchObject({ server_quantity: '2.125000', server_revision: 1 });
      const remoteMovement = await client.from('stock_movements').select('id').eq('id', local.operation.operation_id);
      expect(remoteMovement.data).toHaveLength(1);
    } finally {
      database.close();
      await database.delete();
      await client.auth.signOut();
    }
  });

  it('creates an explicit zero opening balance and retains six-decimal quantities', async () => {
    const zeroProduct = await createProduct(USER_A, 'zero');
    const decimalProduct = await createProduct(USER_A, 'decimal');
    await postMovement(USER_A, zeroProduct, 'opening', '0');
    await postMovement(USER_A, decimalProduct, 'opening', '2.125000');
    expect(await balance(zeroProduct)).toMatchObject({ quantity: '0.000000', revision: '1' });
    expect(await balance(decimalProduct)).toMatchObject({ quantity: '2.125000', revision: '1' });
  });

  it('does not permit regular movements before opening, but permits negative balances after opening', async () => {
    const productId = await createProduct(USER_A);
    await expect(postMovement(USER_A, productId, 'manual_add', '1')).rejects.toMatchObject({ code: '23514' });
    await postMovement(USER_A, productId, 'opening', '1');
    await postMovement(USER_A, productId, 'manual_remove', '-3');
    expect(await balance(productId)).toMatchObject({ quantity: '-2.000000', revision: '2' });
  });

  it('is UUID-first idempotent and rejects a UUID reused with a different payload', async () => {
    const productId = await createProduct(USER_A);
    const operationId = randomUUID();
    const first = await postMovement(USER_A, productId, 'opening', '2.0', operationId);
    await postMovement(USER_A, productId, 'manual_add', '4');
    const retry = await postMovement(USER_A, productId, 'opening', '2.000000', operationId);
    expect(first.balance_after).toBe('2.000000');
    expect(retry.balance_after).toBe('2.000000');
    await expect(postMovement(USER_A, productId, 'opening', '3', operationId)).rejects.toMatchObject({ code: '22023' });
    const { rows } = await pool.query('SELECT count(*)::int AS count FROM public.stock_movements WHERE product_id = $1', [productId]);
    expect(rows[0].count).toBe(2);
  });

  it('does not leak a different user’s UUID receipt or permit a second opening', async () => {
    const productA = await createProduct(USER_A);
    const productB = await createProduct(USER_B);
    const operationId = randomUUID();
    await postMovement(USER_A, productA, 'opening', '1', operationId);
    await expect(postMovement(USER_B, productB, 'opening', '1', operationId)).rejects.toMatchObject({ code: '42501' });
    await expect(postMovement(USER_A, productA, 'opening', '1')).rejects.toMatchObject({ code: '23505' });
  });

  it('makes stock count compare both base quantity and revision, then retries accepted receipts', async () => {
    const productId = await createProduct(USER_A);
    await postMovement(USER_A, productId, 'opening', '20');
    const countId = randomUUID();
    const accepted = await postCount(USER_A, productId, '20', 1, '18', countId);
    expect(accepted).toMatchObject({ status: 'accepted', balance_after: '18.000000', revision_after: 2 });
    await postMovement(USER_A, productId, 'manual_add', '5');
    const retry = await postCount(USER_A, productId, '20.000000', 1, '18.0', countId);
    expect(retry).toMatchObject({ status: 'accepted', balance_after: '18.000000', revision_after: 2 });
    const conflict = await postCount(USER_A, productId, '18', 2, '17');
    expect(conflict).toMatchObject({ status: 'conflict', current_quantity: '23.000000', current_revision: 3 });
  });

  it('increments metadata version once per direct or RPC update and handles stale metadata', async () => {
    const productId = await createProduct(USER_A);
    await asUser(USER_A, (client) => client.query('UPDATE public.products SET name = $2 WHERE id = $1', [productId, 'V1 direct update']));
    const { rows: firstRows } = await pool.query('SELECT metadata_version FROM public.products WHERE id = $1', [productId]);
    expect(firstRows[0].metadata_version).toBe('1');
    const response = await asUser(USER_A, async (client) => {
      const { rows } = await client.query(
        "SELECT public.update_product_metadata($1, $2, $3::jsonb) AS result",
        [productId, 1, JSON.stringify({ name: 'V2 update' })],
      );
      return rows[0].result;
    });
    expect(response.product.metadata_version).toBe(2);
    const stale = await asUser(USER_A, async (client) => {
      const { rows } = await client.query(
        "SELECT public.update_product_metadata($1, $2, $3::jsonb) AS result",
        [productId, 1, JSON.stringify({ name: 'stale' })],
      );
      return rows[0].result;
    });
    expect(stale).toEqual({ status: 'conflict' });
  });

  it('updates wholesale_price as purchase cost without touching dormant cost_price or weakening ownership', async () => {
    const productId = await createProduct(USER_A);
    await pool.query('UPDATE public.products SET cost_price = 77 WHERE id = $1', [productId]);
    const accepted = await asUser(USER_A, async (client) => {
      const { rows } = await client.query("SELECT public.update_product_metadata($1, $2, $3::jsonb) AS result", [productId, 1, JSON.stringify({ wholesale_price: 12.5 })]);
      return rows[0].result;
    });
    expect(accepted.product.wholesale_price).toBe(12.5);
    expect(accepted.product.metadata_version).toBe(2);
    expect((await pool.query('SELECT cost_price FROM public.products WHERE id = $1', [productId])).rows[0].cost_price).toBe('77.00');
    await expect(asUser(USER_B, (client) => client.query("SELECT public.update_product_metadata($1, $2, $3::jsonb)", [productId, 2, JSON.stringify({ wholesale_price: 99 })]))).rejects.toMatchObject({ code: '42501' });
  });

  it('allows unchanged units after initialization but rejects actual changes', async () => {
    const productId = await createProduct(USER_A);
    await postMovement(USER_A, productId, 'opening', '1');
    await expect(asUser(USER_A, (client) => client.query('UPDATE public.products SET unit = unit WHERE id = $1', [productId]))).resolves.toBeDefined();
    await expect(asUser(USER_A, (client) => client.query("UPDATE public.products SET unit = 'kilogram' WHERE id = $1", [productId]))).rejects.toMatchObject({ code: '23514' });
  });

  it('enforces own-row read access and denies direct inventory writes and anonymous access', async () => {
    const productA = await createProduct(USER_A);
    const productB = await createProduct(USER_B);
    await postMovement(USER_A, productA, 'opening', '1');
    await postMovement(USER_B, productB, 'opening', '1');
    await asUser(USER_A, async (client) => {
      const balances = await client.query('SELECT product_id FROM public.inventory_balances');
      const movements = await client.query('SELECT product_id FROM public.stock_movements');
      expect(balances.rows).toHaveLength(1);
      expect(movements.rows).toHaveLength(1);
      await expect(client.query('UPDATE public.inventory_balances SET current_quantity = 99 WHERE product_id = $1', [productA])).rejects.toMatchObject({ code: '42501' });
    });
    await expect(asUser(USER_A, (client) => client.query('DELETE FROM public.stock_movements WHERE product_id = $1', [productA]))).rejects.toMatchObject({ code: '42501' });
    const anonymous = await pool.connect();
    try {
      await anonymous.query('BEGIN');
      await anonymous.query('SET LOCAL ROLE anon');
      await expect(anonymous.query('SELECT * FROM public.inventory_balances')).rejects.toMatchObject({ code: '42501' });
    } finally {
      await anonymous.query('ROLLBACK').catch(() => {});
      anonymous.release();
    }
    const anonymousRpc = await pool.connect();
    try {
      await anonymousRpc.query('BEGIN');
      await anonymousRpc.query('SET LOCAL ROLE anon');
      await expect(anonymousRpc.query('SELECT public.post_inventory_movement($1, $2, $3, $4)', [randomUUID(), productA, 'manual_add', 1])).rejects.toMatchObject({ code: '42501' });
    } finally {
      await anonymousRpc.query('ROLLBACK').catch(() => {});
      anonymousRpc.release();
    }
  });

  it('archives without deleting history and rebuilds only initialized V2 balances', async () => {
    const initialized = await createProduct(USER_A, 'initialized');
    const unset = await createProduct(USER_A, 'unset');
    await postMovement(USER_A, initialized, 'opening', '3');
    await postMovement(USER_A, initialized, 'manual_add', '2');
    await asUser(USER_A, (client) => client.query('SELECT public.archive_product($1)', [initialized]));
    const archived = await pool.query('SELECT archived_at IS NOT NULL AS archived FROM public.products WHERE id = $1', [initialized]);
    expect(archived.rows[0].archived).toBe(true);
    expect((await pool.query('SELECT count(*)::int AS count FROM public.stock_movements WHERE product_id = $1', [initialized])).rows[0].count).toBe(2);
    await pool.query('UPDATE public.inventory_balances SET current_quantity = 999 WHERE product_id = $1', [initialized]);
    const drift = await pool.query('SELECT * FROM public.v2_inventory_balance_drift() WHERE product_id = $1', [initialized]);
    expect(drift.rows).toHaveLength(1);
    await pool.query('SELECT public.v2_rebuild_inventory_balance($1)', [initialized]);
    expect(await balance(initialized)).toMatchObject({ quantity: '5.000000', revision: '2' });
    await pool.query('SELECT public.v2_rebuild_inventory_balance($1)', [unset]);
    expect(await balance(unset)).toBeNull();
  });

  it('keeps internal receipts and maintenance helpers unavailable to browser roles', async () => {
    const productId = await createProduct(USER_A);
    const receipt = await postMovement(USER_A, productId, 'opening', '1');
    const movementId = receipt.movement.id;
    await expect(asUser(USER_B, (client) => client.query('SELECT public.v2_inventory_receipt($1)', [movementId]))).rejects.toMatchObject({ code: '42501' });
    await expect(asUser(USER_B, (client) => client.query('SELECT public.v2_inventory_balance_drift()'))).rejects.toMatchObject({ code: '42501' });
    await expect(asUser(USER_B, (client) => client.query('SELECT public.v2_rebuild_inventory_balance($1)', [productId]))).rejects.toMatchObject({ code: '42501' });
    const anonymous = await pool.connect();
    try {
      await anonymous.query('BEGIN');
      await anonymous.query('SET LOCAL ROLE anon');
      await expect(anonymous.query('SELECT public.v2_inventory_receipt($1)', [movementId])).rejects.toMatchObject({ code: '42501' });
    } finally {
      await anonymous.query('ROLLBACK').catch(() => {});
      anonymous.release();
    }
  });

  it('serializes concurrent identical operation UUIDs for opening and manual movement', async () => {
    const productId = await createProduct(USER_A);
    const openingId = randomUUID();
    const [firstOpening, secondOpening] = await Promise.all([
      postMovement(USER_A, productId, 'opening', '2', openingId),
      postMovement(USER_A, productId, 'opening', '2.000000', openingId),
    ]);
    expect(firstOpening).toMatchObject({ status: 'accepted', balance_after: '2.000000' });
    expect(secondOpening).toMatchObject({ status: 'accepted', balance_after: '2.000000' });
    const movementId = randomUUID();
    const [firstAdd, secondAdd] = await Promise.all([
      postMovement(USER_A, productId, 'manual_add', '3', movementId),
      postMovement(USER_A, productId, 'manual_add', '3.0', movementId),
    ]);
    expect(firstAdd).toMatchObject({ status: 'accepted', balance_after: '5.000000' });
    expect(secondAdd).toMatchObject({ status: 'accepted', balance_after: '5.000000' });
    const { rows } = await pool.query('SELECT count(*)::int AS count FROM public.stock_movements WHERE product_id = $1', [productId]);
    expect(rows[0].count).toBe(2);
  });

  it('serializes concurrent stock-count UUIDs and rejects cross-user UUID collisions without leakage', async () => {
    const productA = await createProduct(USER_A);
    const productB = await createProduct(USER_B);
    await postMovement(USER_A, productA, 'opening', '10');
    const countId = randomUUID();
    const [first, second] = await Promise.all([
      postCount(USER_A, productA, '10', 1, '8', countId),
      postCount(USER_A, productA, '10.000000', 1, '8.0', countId),
    ]);
    expect(first).toMatchObject({ status: 'accepted', balance_after: '8.000000' });
    expect(second).toMatchObject({ status: 'accepted', balance_after: '8.000000' });
    await expect(postMovement(USER_B, productB, 'opening', '1', countId)).rejects.toMatchObject({ code: '42501' });
    expect(await balance(productB)).toBeNull();
  });

  it('serializes a user cursor through commit order while allowing only per-user ordering guarantees', async () => {
    const productId = await createProduct(USER_A);
    await postMovement(USER_A, productId, 'opening', '1');
    const held = await startUserTransaction(USER_A);
    try {
      await held.query(
        'SELECT public.post_inventory_movement($1, $2, $3, $4)',
        [randomUUID(), productId, 'manual_add', '1'],
      );
      let secondCompleted = false;
      const waiting = postMovement(USER_A, productId, 'manual_add', '1').then((value) => {
        secondCompleted = true;
        return value;
      });
      await delay(100);
      expect(secondCompleted).toBe(false);
      await held.query('COMMIT');
      const result = await waiting;
      expect(result.status).toBe('accepted');
    } finally {
      await held.query('ROLLBACK').catch(() => {});
      held.release();
    }
    const { rows } = await pool.query(
      `SELECT server_sequence FROM public.stock_movements
       WHERE product_id = $1 ORDER BY server_sequence`, [productId],
    );
    expect(rows.map((row) => Number(row.server_sequence))).toEqual([...rows.map((row) => Number(row.server_sequence))].sort((a, b) => a - b));
    expect(await balance(productId)).toMatchObject({ quantity: '3.000000', revision: '3' });
  });

  it('uses unambiguous normalized JSON payload hashing and enforces movement directions', async () => {
    const productId = await createProduct(USER_A);
    const operationId = randomUUID();
    await postMovement(USER_A, productId, 'opening', '1', operationId, { reason: 'a|b', note: 'c|d' });
    await postMovement(USER_A, productId, 'opening', '1.000000', operationId, { reason: 'a|b', note: 'c|d' });
    await expect(postMovement(USER_A, productId, 'opening', '1', operationId, { reason: 'a', note: 'b|c|d' })).rejects.toMatchObject({ code: '22023' });
    await expect(postMovement(USER_A, productId, 'manual_add', '-1')).rejects.toMatchObject({ code: '22023' });
    await expect(postMovement(USER_A, productId, 'manual_remove', '1')).rejects.toMatchObject({ code: '22023' });
    await expect(postMovement(USER_A, productId, 'damage_loss', '1')).rejects.toMatchObject({ code: '22023' });
    const uninitialized = await createProduct(USER_A);
    await expect(postMovement(USER_A, uninitialized, 'opening', '-1')).rejects.toMatchObject({ code: '22023' });
  });

  it('returns typed no_change for an equal physical count without writing a movement or revision', async () => {
    const productId = await createProduct(USER_A);
    await postMovement(USER_A, productId, 'opening', '10');
    const result = await postCount(USER_A, productId, '10', 1, '10');
    expect(result).toEqual({ status: 'no_change', current_quantity: '10.000000', current_revision: 1 });
    expect(await balance(productId)).toMatchObject({ quantity: '10.000000', revision: '1' });
    const { rows } = await pool.query('SELECT count(*)::int AS count FROM public.stock_movements WHERE product_id = $1', [productId]);
    expect(rows[0].count).toBe(1);
  });

  it('allows a negative system balance to be physically counted as zero but rejects negative physical counts', async () => {
    const productId = await createProduct(USER_A);
    await postMovement(USER_A, productId, 'opening', '1');
    await postMovement(USER_A, productId, 'manual_remove', '-3');
    const corrected = await postCount(USER_A, productId, '-2', 2, '0');
    expect(corrected).toMatchObject({ status: 'accepted', balance_after: '0.000000', revision_after: 3 });
    const before = await balance(productId);
    const movementCount = await pool.query('SELECT count(*)::int AS count FROM public.stock_movements WHERE product_id = $1', [productId]);
    await expect(postCount(USER_A, productId, '0', 3, '-1')).rejects.toMatchObject({ code: '22023' });
    expect(await balance(productId)).toEqual(before);
    expect((await pool.query('SELECT count(*)::int AS count FROM public.stock_movements WHERE product_id = $1', [productId])).rows[0].count).toBe(movementCount.rows[0].count);
  });

  it('validates V2 units and non-negative low-stock thresholds without restricting V1 direct values', async () => {
    const productId = await createProduct(USER_A);
    const update = (patch) => asUser(USER_A, async (client) => {
      const { rows } = await client.query('SELECT public.update_product_metadata($1, $2, $3::jsonb) AS result', [productId, 0, JSON.stringify(patch)]);
      return rows[0].result;
    });
    await expect(update({ unit: 'unknown' })).rejects.toMatchObject({ code: '22023' });
    await expect(update({ unit: '' })).rejects.toMatchObject({ code: '22023' });
    await expect(update({ low_stock_threshold: '-0.1' })).rejects.toMatchObject({ code: '22023' });
    const accepted = await update({ unit: 'kilogram', low_stock_threshold: '0.125000' });
    expect(accepted.product).toMatchObject({ unit: 'kilogram', low_stock_threshold: 0.125, metadata_version: 1 });
  });

  it('enforces the low-stock threshold database constraint for null, zero, decimals, and privileged direct writes', async () => {
    const productId = await createProduct(USER_A);
    await pool.query('UPDATE public.products SET low_stock_threshold = NULL WHERE id = $1', [productId]);
    await pool.query('UPDATE public.products SET low_stock_threshold = 0 WHERE id = $1', [productId]);
    await pool.query('UPDATE public.products SET low_stock_threshold = 0.125000 WHERE id = $1', [productId]);
    await expect(pool.query('UPDATE public.products SET low_stock_threshold = -0.000001 WHERE id = $1', [productId])).rejects.toMatchObject({ code: '23514' });
  });

  it('detects missing and orphan balance corruption and makes archive retries stable', async () => {
    const initialized = await createProduct(USER_A);
    const unset = await createProduct(USER_A);
    await postMovement(USER_A, initialized, 'opening', '5');
    await pool.query('DELETE FROM public.inventory_balances WHERE product_id = $1', [initialized]);
    await expect(postMovement(USER_A, initialized, 'opening', '5')).rejects.toMatchObject({ code: '23514' });
    const openings = await pool.query(
      "SELECT count(*)::int AS count FROM public.stock_movements WHERE product_id = $1 AND movement_type = 'opening'",
      [initialized],
    );
    expect(openings.rows[0].count).toBe(1);
    let diagnostic = await pool.query('SELECT issue FROM public.v2_inventory_balance_drift() WHERE product_id = $1', [initialized]);
    expect(diagnostic.rows).toEqual([{ issue: 'missing_balance' }]);
    await pool.query('SELECT public.v2_rebuild_inventory_balance($1)', [initialized]);
    expect(await balance(initialized)).toMatchObject({ quantity: '5.000000', revision: '1' });
    await pool.query(
      `INSERT INTO public.inventory_balances (product_id, user_id, current_quantity, initialized_at)
       VALUES ($1, $2, 0, now())`, [unset, USER_A],
    );
    diagnostic = await pool.query('SELECT issue FROM public.v2_inventory_balance_drift() WHERE product_id = $1', [unset]);
    expect(diagnostic.rows).toEqual([{ issue: 'orphan_balance' }]);
    await pool.query('SELECT public.v2_rebuild_inventory_balance($1)', [unset]);
    expect(await balance(unset)).toBeNull();
    const first = await asUser(USER_A, async (client) => (await client.query('SELECT public.archive_product($1) AS result', [initialized])).rows[0].result);
    const second = await asUser(USER_A, async (client) => (await client.query('SELECT public.archive_product($1) AS result', [initialized])).rows[0].result);
    expect(second.product.archived_at).toBe(first.product.archived_at);
    expect(second.product.metadata_version).toBe(first.product.metadata_version);
  });

  it('rejects user B posting a new operation to user A product without mutation or product disclosure', async () => {
    const productA = await createProduct(USER_A);
    await postMovement(USER_A, productA, 'opening', '4');
    const before = await balance(productA);
    await expect(postMovement(USER_B, productA, 'manual_remove', '-1')).rejects.toMatchObject({ code: '42501' });
    expect(await balance(productA)).toEqual(before);
    const { rows } = await pool.query('SELECT count(*)::int AS count FROM public.stock_movements WHERE product_id = $1', [productA]);
    expect(rows[0].count).toBe(1);
  });

  it('posts an atomic, idempotent two-line V2 purchase with exact numeric totals', async () => {
    const first=await createProduct(USER_A), second=await createProduct(USER_A); await postMovement(USER_A,first,'opening','1'); await postMovement(USER_A,second,'opening','1');
    const purchaseId=randomUUID(); const lines=[{line_id:randomUUID(),product_id:first,movement_id:randomUUID(),quantity:'3',unit_cost:'0.1'},{line_id:randomUUID(),product_id:second,movement_id:randomUUID(),quantity:'2.125',unit_cost:'4.5'}];
    const call=(input=lines)=>asUser(USER_A,async client=>(await client.query('SELECT public.post_purchase_v2($1,$2,$3,$4,$5::jsonb) AS result',[purchaseId,'2026-09-19T00:00:00Z',null,null,JSON.stringify(input)])).rows[0].result);
    expect(await call()).toMatchObject({status:'accepted',total_amount:9.8625}); expect(await balance(first)).toMatchObject({quantity:'4.000000'});expect(await balance(second)).toMatchObject({quantity:'3.125000'});
    const totals=await pool.query('SELECT line_total::text FROM public.v2_purchase_lines WHERE purchase_id=$1 ORDER BY line_total',[purchaseId]);expect(totals.rows.map(x=>x.line_total)).toEqual(['0.300000','9.562500']);
    await expect(call([...lines].reverse())).resolves.toMatchObject({status:'accepted'});expect((await pool.query('SELECT count(*)::int count FROM public.v2_purchase_documents WHERE id=$1',[purchaseId])).rows[0].count).toBe(1);
    await expect(call([{...lines[0],quantity:'4'},lines[1]])).rejects.toMatchObject({code:'P0001',message:'purchase_idempotency_conflict'});
  });

  it('rejects invalid, stock-not-set, cross-account, duplicate-product, and reused-movement purchases atomically', async () => {
    const a=await createProduct(USER_A), b=await createProduct(USER_A), other=await createProduct(USER_B); await postMovement(USER_A,a,'opening','3');await postMovement(USER_B,other,'opening','3');
    const line=(product,overrides={})=>({line_id:randomUUID(),product_id:product,movement_id:randomUUID(),quantity:'1',unit_cost:'1',...overrides});
    const call=(lines)=>asUser(USER_A,c=>c.query('SELECT public.post_purchase_v2($1,$2,$3,$4,$5::jsonb)',[randomUUID(),'2026-09-19T00:00:00Z',null,null,JSON.stringify(lines)]));
    const before=await balance(a); for(const lines of [[line(a),line(a,{quantity:'0'})],[line(a),line(b)],[line(a),line(other)],[line(a),line(a)]]) await expect(call(lines)).rejects.toBeDefined();
    expect(await balance(a)).toEqual(before);expect(await balance(b)).toBeNull();expect(await balance(other)).toMatchObject({quantity:'3.000000'});
    const good=line(a);await call([good]);const after=await balance(a);await expect(call([line(a,{movement_id:good.movement_id})])).rejects.toBeDefined();expect(await balance(a)).toEqual(after);
  });

  it('keeps purchase tables read-only and user-scoped, with RPC unavailable to anon', async () => {
    const product=await createProduct(USER_A);await postMovement(USER_A,product,'opening','1');const id=randomUUID(),line={line_id:randomUUID(),product_id:product,movement_id:randomUUID(),quantity:'1',unit_cost:'1'};
    await asUser(USER_A,c=>c.query('SELECT public.post_purchase_v2($1,$2,$3,$4,$5::jsonb)',[id,'2026-09-19T00:00:00Z',null,null,JSON.stringify([line])]));
    expect((await asUser(USER_A,c=>c.query('SELECT id FROM public.v2_purchase_documents WHERE id=$1',[id]))).rows).toHaveLength(1);expect((await asUser(USER_B,c=>c.query('SELECT id FROM public.v2_purchase_documents WHERE id=$1',[id]))).rows).toEqual([]);
    await expect(asUser(USER_A,c=>c.query('INSERT INTO public.v2_purchase_documents(id,user_id,purchased_at,total_amount) VALUES($1,$2,now(),0)',[randomUUID(),USER_A]))).rejects.toBeDefined();
    await expect(asUser(USER_A,c=>c.query('UPDATE public.v2_purchase_documents SET reference=$2 WHERE id=$1',[id,'x']))).rejects.toBeDefined();await expect(asUser(USER_A,c=>c.query('DELETE FROM public.v2_purchase_documents WHERE id=$1',[id]))).rejects.toBeDefined();
    await expect(pool.query('SET ROLE anon; SELECT public.post_purchase_v2($1,$2,$3,$4,$5::jsonb)',[randomUUID(),'2026-09-19T00:00:00Z',null,null,'[]'])).rejects.toBeDefined();
  });

  it('rejects meaningful over-precision and canonicalizes equivalent purchase retry decimals', async () => {
    const product=await createProduct(USER_A);await postMovement(USER_A,product,'opening','1');const call=(id,line)=>asUser(USER_A,c=>c.query('SELECT public.post_purchase_v2($1,$2,$3,$4,$5::jsonb)',[id,'2026-09-19T00:00:00Z',null,null,JSON.stringify([line])]));
    for(const line of [{line_id:randomUUID(),product_id:product,movement_id:randomUUID(),quantity:'1.0000001',unit_cost:'1'},{line_id:randomUUID(),product_id:product,movement_id:randomUUID(),quantity:'1',unit_cost:'0.1000001'}]) await expect(call(randomUUID(),line)).rejects.toMatchObject({code:'22023'});
    expect(await balance(product)).toMatchObject({quantity:'1.000000'});const id=randomUUID(),line={line_id:randomUUID(),product_id:product,movement_id:randomUUID(),quantity:'3',unit_cost:'0.1'};await call(id,line);const after=await balance(product);await expect(call(id,{...line,quantity:'3.000000',unit_cost:'0.100000'})).resolves.toBeDefined();expect(await balance(product)).toEqual(after);
  });
});
