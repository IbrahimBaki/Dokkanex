import { v4 as uuidv4 } from 'uuid';
import { db as defaultDb } from './db';
import { createOutboxOperation } from './outbox';

export const IMAGE_BUCKET = 'product-images';
const blobId = (userId, operationId) => `v2:image:${userId}:${operationId}`;
const sequenceStateId = (userId) => `outbox_sequence:${userId}`;

export const immutableImagePath = (userId, productId, operationId) => `${userId}/${productId}/${operationId}.jpg`;

export async function stageImageBlob({ userId, productId, operationId, image }, database = defaultDb) {
  if (!userId || !productId || !operationId || image == null) throw new Error('Image staging requires user, product, operation, and image');
  const product = await database.products.get(productId);
  if (!product || product.user_id !== userId) throw new Error('Product does not belong to this user');
  const row = { id: blobId(userId, operationId), user_id: userId, product_id: productId, operation_id: operationId, image, updated_at: new Date().toISOString() };
  await database.image_blobs.put(row);
  return row;
}

export async function getStagedImageBlob(userId, operationId, database = defaultDb) {
  const row = await database.image_blobs.get(blobId(userId, operationId));
  return row?.user_id === userId && row.operation_id === operationId ? row : null;
}

// Keep receipt, dependent metadata, sequence, and staged data as one local
// commit. Remote upload/auth work is deliberately completed before this call.
export async function finalizeImageUpload(userId, productId, operationId, receipt, database = defaultDb) {
  return database.transaction('rw', database.products, database.outbox_operations, database.sync_state, database.image_blobs, async () => {
    const upload = await database.outbox_operations.get(operationId);
    const staged = await database.image_blobs.get(blobId(userId, operationId));
    if (!upload || upload.user_id !== userId || upload.entity_id !== productId || upload.entity_type !== 'image_upload' || upload.status !== 'syncing') throw new Error('Image upload ownership changed');
    if (!staged || staged.user_id !== userId || staged.product_id !== productId) throw new Error('Staged image ownership changed');
    const metadataId = `${operationId}:metadata`;
    if (await database.outbox_operations.get(metadataId)) throw new Error('Image metadata operation already exists');
    const now = new Date().toISOString();
    const sequenceState = await database.sync_state.get(sequenceStateId(userId));
    const sequence = (sequenceState?.next_sequence ?? 0) + 1;
    const metadata = upload.payload.metadata ?? {};
    const canonicalVersion = upload.depends_on ? (await database.products.get(productId))?.metadata_version : undefined;
    await database.outbox_operations.add({
      operation_id: metadataId, user_id: userId, entity_type: 'product_metadata', action: 'update', entity_id: productId,
      depends_on: operationId, sequence, status: 'pending',
      payload: { expected_metadata_version: canonicalVersion ?? metadata.expected_metadata_version, patch: { ...(metadata.patch ?? {}), image_url: receipt.image_url }, old_image_url: metadata.old_image_url ?? null },
      created_at: now, updated_at: now, attempt_count: 0, last_attempt_at: null, last_error_code: null, last_error_message: null, server_receipt: null, reconciled_at: null,
    });
    await database.sync_state.put({ id: sequenceStateId(userId), user_id: userId, scope: 'outbox_sequence', next_sequence: sequence, updated_at: now });
    await database.outbox_operations.update(operationId, { status: 'succeeded', server_receipt: receipt, reconciled_at: now, updated_at: now });
    await database.image_blobs.delete(blobId(userId, operationId));
    return { metadata_operation_id: metadataId, sequence };
  });
}

export async function removeStagedImageBlob(userId, operationId, database = defaultDb) {
  const row = await getStagedImageBlob(userId, operationId, database);
  if (!row) return false;
  await database.image_blobs.delete(row.id);
  return true;
}

// This is deliberately a primitive: no catalog UI calls it during B2.
export async function queueImageReplacement({ userId, productId, image, expectedMetadataVersion, patch = {}, oldImageUrl = null, operationId = uuidv4(), dependsOn = null }, database = defaultDb) {
  await stageImageBlob({ userId, productId, operationId, image }, database);
  const path = immutableImagePath(userId, productId, operationId);
  const operation = await createOutboxOperation({
    operation_id: operationId, user_id: userId, entity_type: 'image_upload', action: 'upload', entity_id: productId,
    depends_on: dependsOn, payload: { path, metadata: { expected_metadata_version: expectedMetadataVersion, patch, old_image_url: oldImageUrl } },
  }, database);
  return { operation, path };
}

export async function queueImageRemoval({ userId, productId, expectedMetadataVersion, patch = {}, oldImageUrl = null, operationId = uuidv4() }, database = defaultDb) {
  return createOutboxOperation({
    operation_id: operationId, user_id: userId, entity_type: 'product_metadata', action: 'update', entity_id: productId,
    payload: { expected_metadata_version: expectedMetadataVersion, patch: { ...patch, image_url: null }, old_image_url: oldImageUrl },
  }, database);
}
