import { afterEach, describe, expect, it, vi } from 'vitest';
import { createDatabase } from '../../src/lib/db';
import { createOutboxOperation, transitionOutboxOperation } from '../../src/lib/outbox';
import { createV2SyncRunner } from '../../src/lib/v2Sync';
import { getStagedImageBlob, immutableImagePath, queueImageReplacement, removeStagedImageBlob, stageImageBlob } from '../../src/lib/v2Images';

const A = 'user-a'; const B = 'user-b'; const OLD = '11111111-1111-4111-8111-111111111111'; const databases = [];
async function fresh() { const database = createDatabase(`v2-images-${crypto.randomUUID()}`); databases.push(database); await database.open(); return database; }
afterEach(async () => Promise.all(databases.splice(0).map(async (database) => { database.close(); await database.delete(); })));

function rows(data) {
  const chain = { eq: () => chain, neq: () => chain, gt: () => chain, order: () => chain, single: async () => ({ data: data[0] ?? null, error: null }), then: (resolve) => resolve({ data, error: null }) };
  return chain;
}
function client({ active = A, upload = async () => ({ data: { path: 'ignored' }, error: null }), canonical = null, rpc = async () => ({ data: { status: 'accepted', product: canonical }, error: null }) } = {}) {
  const remove = vi.fn(async () => ({ data: [], error: null }));
  return {
    auth: { getSession: async () => ({ data: { session: active ? { user: { id: active } } : null } }) }, rpc,
    storage: { from: () => ({ upload, remove, getPublicUrl: (path) => ({ data: { publicUrl: `https://example.test/storage/v1/object/public/product-images/${path}` } }) }) },
    from: (table) => ({ select: () => rows(table === 'products' ? (canonical ? [canonical] : []) : []) }), remove,
  };
}
async function product(database, image_url = `https://example.test/storage/v1/object/public/product-images/user-a/p/${OLD}.jpg`) {
  await database.products.put({ id: 'p', user_id: A, name: 'P', image_url, metadata_version: 1 });
}

describe('V2 image outbox primitives', () => {
  it('uses one immutable path for every retry of the same operation', () => {
    expect(immutableImagePath(A, 'p', 'op')).toBe('user-a/p/op.jpg');
    expect(immutableImagePath(A, 'p', 'op')).toBe('user-a/p/op.jpg');
  });

  it('keeps same-operation staged image data strictly user scoped', async () => {
    const database = await fresh(); await product(database); await database.products.put({ id: 'b-p', user_id: B });
    await stageImageBlob({ userId: A, productId: 'p', operationId: 'shared-op', image: 'A-image' }, database);
    await stageImageBlob({ userId: B, productId: 'b-p', operationId: 'shared-op', image: 'B-image' }, database);
    expect((await getStagedImageBlob(A, 'shared-op', database)).image).toBe('A-image');
    expect((await getStagedImageBlob(B, 'shared-op', database)).image).toBe('B-image');
    expect(await removeStagedImageBlob(A, 'shared-op', database)).toBe(true);
    expect(await getStagedImageBlob(A, 'shared-op', database)).toBeNull();
    expect((await getStagedImageBlob(B, 'shared-op', database)).image).toBe('B-image');
  });

  it('keeps the old canonical image and metadata dependency untouched when upload fails', async () => {
    const database = await fresh(); await product(database); const { operation } = await queueImageReplacement({ userId: A, productId: 'p', operationId: 'upload-fail', image: 'new-image', expectedMetadataVersion: 1, oldImageUrl: (await database.products.get('p')).image_url }, database);
    await createV2SyncRunner({ client: client({ upload: async () => ({ error: { message: 'network failed' } }) }), database }).sync(A);
    expect(await database.outbox_operations.get(operation.operation_id)).toMatchObject({ status: 'retryable_failed' });
    expect(await database.outbox_operations.get('upload-fail:metadata')).toBeUndefined();
    expect(await database.products.get('p')).toMatchObject({ image_url: expect.stringContaining(`/${OLD}.jpg`) });
  });

  it('persists an upload receipt, clears staging, and creates dependent metadata only after upload', async () => {
    const database = await fresh(); await product(database); const { operation, path } = await queueImageReplacement({ userId: A, productId: 'p', operationId: 'upload-ok', image: 'new-image', expectedMetadataVersion: 1, patch: { name: 'P2' }, oldImageUrl: (await database.products.get('p')).image_url }, database);
    await createV2SyncRunner({ client: client(), database }).sync(A);
    expect(await database.outbox_operations.get(operation.operation_id)).toMatchObject({ status: 'succeeded', server_receipt: { path, image_url: expect.stringContaining(path) } });
    expect(await getStagedImageBlob(A, operation.operation_id, database)).toBeNull();
    expect(await database.outbox_operations.get('upload-ok:metadata')).toMatchObject({ depends_on: 'upload-ok', payload: { patch: expect.objectContaining({ image_url: expect.stringContaining(path) }) } });
  });

  it('rolls back every local upload-finalization write when staged cleanup fails', async () => {
    const database = await fresh(); await product(database); const { operation } = await queueImageReplacement({ userId: A, productId: 'p', operationId: 'finalize-fails', image: 'new-image', expectedMetadataVersion: 1 }, database);
    const originalDelete = database.image_blobs.delete.bind(database.image_blobs);
    database.image_blobs.delete = async () => { throw new Error('local cleanup failed'); };
    await createV2SyncRunner({ client: client(), database }).sync(A);
    database.image_blobs.delete = originalDelete;
    expect(await database.outbox_operations.get(operation.operation_id)).toMatchObject({ status: 'retryable_failed', server_receipt: null });
    expect(await getStagedImageBlob(A, operation.operation_id, database)).toBeTruthy();
    expect(await database.outbox_operations.get('finalize-fails:metadata')).toBeUndefined();
  });

  it('finalizes safely after a retry receives remote 409 for the same immutable path', async () => {
    const database = await fresh(); await product(database); const { operation, path } = await queueImageReplacement({ userId: A, productId: 'p', operationId: 'retry-409', image: 'new-image', expectedMetadataVersion: 1 }, database);
    await transitionOutboxOperation(operation.operation_id, 'syncing', {}, database); await transitionOutboxOperation(operation.operation_id, 'retryable_failed', {}, database); await database.outbox_operations.update(operation.operation_id, { next_attempt_at: null });
    const upload = vi.fn(async () => ({ error: { statusCode: 409, message: 'already exists' } }));
    await createV2SyncRunner({ client: client({ upload }), database }).sync(A);
    expect(upload).toHaveBeenCalledWith(path, 'new-image', expect.any(Object));
    const finalized = await database.outbox_operations.get(operation.operation_id);
    expect(finalized).toMatchObject({ status: 'succeeded', server_receipt: { path } });
    expect(await database.outbox_operations.get('retry-409:metadata')).toMatchObject({ status: 'pending', depends_on: 'retry-409' });
    expect(await getStagedImageBlob(A, operation.operation_id, database)).toBeNull();
  });

  it('does not schedule deletion when image metadata conflicts', async () => {
    const database = await fresh(); const old = `https://example.test/storage/v1/object/public/product-images/user-a/p/${OLD}.jpg`; await product(database, old);
    await createOutboxOperation({ operation_id: 'metadata-conflict', user_id: A, entity_type: 'product_metadata', action: 'update', entity_id: 'p', payload: { expected_metadata_version: 1, patch: { image_url: 'new-url' }, old_image_url: old } }, database);
    await createV2SyncRunner({ client: client({ canonical: { id: 'p', user_id: A, image_url: old }, rpc: async () => ({ data: { status: 'conflict' }, error: null }) }), database }).sync(A);
    expect(await database.outbox_operations.get('metadata-conflict')).toMatchObject({ status: 'conflict' });
    expect(await database.outbox_operations.get('metadata-conflict:image-delete')).toBeUndefined();
  });

  it('deletes an old V2 object only after accepted metadata and canonical verification', async () => {
    const database = await fresh(); const old = `https://example.test/storage/v1/object/public/product-images/user-a/p/${OLD}.jpg`; const current = 'https://example.test/storage/v1/object/public/product-images/user-a/p/22222222-2222-4222-8222-222222222222.jpg'; await product(database, old);
    await createOutboxOperation({ operation_id: 'metadata-ok', user_id: A, entity_type: 'product_metadata', action: 'update', entity_id: 'p', payload: { expected_metadata_version: 1, patch: { image_url: current }, old_image_url: old } }, database);
    const remote = { id: 'p', user_id: A, image_url: current }; const api = client({ canonical: remote, rpc: async () => ({ data: { status: 'accepted', product: remote }, error: null }) }); const runner = createV2SyncRunner({ client: api, database });
    await runner.sync(A);
    expect(await database.outbox_operations.get('metadata-ok:image-delete')).toMatchObject({ status: 'pending', depends_on: 'metadata-ok' });
    await runner.sync(A);
    expect(api.remove).toHaveBeenCalledWith([`user-a/p/${OLD}.jpg`]);
    expect(await database.outbox_operations.get('metadata-ok:image-delete')).toMatchObject({ status: 'succeeded' });
  });

  it('retains old objects when canonical still references them or the path is legacy', async () => {
    const database = await fresh(); const old = `https://example.test/storage/v1/object/public/product-images/user-a/p/${OLD}.jpg`; await product(database, old);
    await createOutboxOperation({ operation_id: 'keep-current', user_id: A, entity_type: 'image_delete', action: 'delete', entity_id: 'p', payload: { old_image_url: old } }, database);
    const api = client({ canonical: { id: 'p', user_id: A, image_url: old } }); await createV2SyncRunner({ client: api, database }).sync(A);
    expect(api.remove).not.toHaveBeenCalled(); expect(await database.outbox_operations.get('keep-current')).toMatchObject({ status: 'retryable_failed' });
    await database.products.put({ id: 'p2', user_id: A, image_url: 'legacy-file.jpg' });
    await createOutboxOperation({ operation_id: 'keep-legacy', user_id: A, entity_type: 'image_delete', action: 'delete', entity_id: 'p2', payload: { old_image_url: 'legacy-file.jpg' } }, database);
    await createV2SyncRunner({ client: api, database }).sync(A);
    expect(api.remove).not.toHaveBeenCalled(); expect(await database.outbox_operations.get('keep-legacy')).toMatchObject({ status: 'retryable_failed' });
  });

  it('does not mutate local state after an account switch during upload or delete responses', async () => {
    const database = await fresh(); const old = `https://example.test/storage/v1/object/public/product-images/user-a/p/${OLD}.jpg`; await product(database, old);
    let active = A; let finishUpload; const uploadWait = new Promise((resolve) => { finishUpload = resolve; }); const uploadStarted = vi.fn();
    const { operation } = await queueImageReplacement({ userId: A, productId: 'p', operationId: 'switch-upload', image: 'new', expectedMetadataVersion: 1, oldImageUrl: old }, database);
    const api = client({ upload: async () => { uploadStarted(); return uploadWait; } }); const runner = createV2SyncRunner({ client: api, database, getActiveUserId: async () => active }); const run = runner.sync(A);
    await vi.waitFor(() => expect(uploadStarted).toHaveBeenCalled()); active = B; finishUpload({ data: { path: 'ignored' }, error: null }); expect(await run).toMatchObject({ cancelled: true });
    expect(await database.outbox_operations.get(operation.operation_id)).toMatchObject({ status: 'syncing', server_receipt: null }); expect(await getStagedImageBlob(A, operation.operation_id, database)).toBeTruthy();
    await database.products.put({ id: 'p2', user_id: A, image_url: `https://example.test/storage/v1/object/public/product-images/user-a/p2/${OLD}.jpg` });
    await createOutboxOperation({ operation_id: 'switch-delete', user_id: A, entity_type: 'image_delete', action: 'delete', entity_id: 'p2', payload: { old_image_url: `https://example.test/storage/v1/object/public/product-images/user-a/p2/${OLD}.jpg` } }, database);
    active = A; let finishFetch; let fetchStarted; const started = new Promise((resolve) => { fetchStarted = resolve; }); const fetched = new Promise((resolve) => { finishFetch = resolve; }); api.from = () => ({ select: () => ({ eq: () => ({ single: async () => { fetchStarted(); return fetched; } }) }) }); const deleteRun = runner.sync(A);
    await started; active = B; finishFetch({ data: { id: 'p2', user_id: A, image_url: 'new-url' }, error: null }); expect(await deleteRun).toMatchObject({ cancelled: true }); expect(api.remove).not.toHaveBeenCalled();
  });
});
