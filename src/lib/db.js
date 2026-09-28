import Dexie from 'dexie';

export function createDatabase(name = 'DokkanexDB') {
  const database = new Dexie(name);

  database.version(1).stores({
  products: 'id, name, category_id, user_id, created_at, updated_at',
  categories: 'id, name, user_id, created_at',
  sync_queue: '++id, table_name, operation, record_id, created_at',
  app_meta: 'key'
  });

  database.version(2).stores({
  products: 'id, name, category_id, user_id, created_at, updated_at, image_url, image_base64',
  categories: 'id, name, user_id, created_at',
  sync_queue: '++id, table_name, operation, record_id, created_at',
  app_meta: 'key'
  });

  database.version(3).stores({
    products: 'id, name, category_id, user_id, created_at, updated_at, image_url, image_base64',
    categories: 'id, name, user_id, created_at',
    sync_queue: '++id, table_name, operation, record_id, created_at',
    app_meta: 'key',
    inventory_balances: 'product_id, user_id, [user_id+product_id], [user_id+updated_at]',
    inventory_movements: 'id, user_id, product_id, movement_type, status, server_sequence, [user_id+product_id+server_sequence], [user_id+product_id+status]',
    outbox_operations: 'operation_id, user_id, entity_type, entity_id, status, sequence, [user_id+status+sequence], [user_id+entity_type+entity_id], [user_id+created_at]',
    sync_state: 'id, user_id, scope, [user_id+scope]',
    image_blobs: 'id, user_id, operation_id, product_id, [user_id+product_id]'
  });

  database.version(4).stores({
    products: 'id, name, category_id, user_id, created_at, updated_at, image_url, image_base64', categories: 'id, name, user_id, created_at', sync_queue: '++id, table_name, operation, record_id, created_at', app_meta: 'key',
    inventory_balances: 'product_id, user_id, [user_id+product_id], [user_id+updated_at]', inventory_movements: 'id, user_id, product_id, movement_type, status, server_sequence, [user_id+product_id+server_sequence], [user_id+product_id+status]', outbox_operations: 'operation_id, user_id, entity_type, entity_id, status, sequence, [user_id+status+sequence], [user_id+entity_type+entity_id], [user_id+created_at]', sync_state: 'id, user_id, scope, [user_id+scope]', image_blobs: 'id, user_id, operation_id, product_id, [user_id+product_id]',
    v2_purchase_documents: 'id, user_id, purchased_at, created_at, [user_id+purchased_at]', v2_purchase_lines: 'id, purchase_id, user_id, product_id, movement_id, [user_id+product_id]'
  });

  database.version(5).stores({
    products: 'id, name, category_id, user_id, created_at, updated_at, image_url, image_base64', categories: 'id, name, user_id, created_at', sync_queue: '++id, table_name, operation, record_id, created_at', app_meta: 'key',
    inventory_balances: 'product_id, user_id, [user_id+product_id], [user_id+updated_at]', inventory_movements: 'id, user_id, product_id, movement_type, status, server_sequence, [user_id+product_id+server_sequence], [user_id+product_id+status]', outbox_operations: 'operation_id, user_id, entity_type, entity_id, status, sequence, [user_id+status+sequence], [user_id+entity_type+entity_id], [user_id+created_at]', sync_state: 'id, user_id, scope, [user_id+scope]', image_blobs: 'id, user_id, operation_id, product_id, [user_id+product_id]',
    v2_purchase_documents: 'id, user_id, purchased_at, created_at, [user_id+purchased_at]', v2_purchase_lines: 'id, purchase_id, user_id, product_id, movement_id, [user_id+product_id]',
    v2_sale_documents: 'id, user_id, sold_at, invoice_number, created_at, [user_id+sold_at]', v2_sale_lines: 'id, sale_id, user_id, product_id, movement_id, [user_id+product_id]', shop_profiles: 'user_id, updated_at'
  });

  database.version(6).stores({
    products: 'id, name, category_id, user_id, created_at, updated_at, image_url, image_base64', categories: 'id, name, user_id, created_at', sync_queue: '++id, table_name, operation, record_id, created_at', app_meta: 'key', inventory_balances: 'product_id, user_id, [user_id+product_id], [user_id+updated_at]', inventory_movements: 'id, user_id, product_id, movement_type, status, server_sequence, [user_id+product_id+server_sequence], [user_id+product_id+status]', outbox_operations: 'operation_id, user_id, entity_type, entity_id, status, sequence, [user_id+status+sequence], [user_id+entity_type+entity_id], [user_id+created_at]', sync_state: 'id, user_id, scope, [user_id+scope]', image_blobs: 'id, user_id, operation_id, product_id, [user_id+product_id]', v2_purchase_documents: 'id, user_id, purchased_at, created_at, [user_id+purchased_at]', v2_purchase_lines: 'id, purchase_id, user_id, product_id, movement_id, [user_id+product_id]', v2_sale_documents: 'id, user_id, sold_at, invoice_number, created_at, [user_id+sold_at]', v2_sale_lines: 'id, sale_id, user_id, product_id, movement_id, [user_id+product_id]', shop_profiles: 'user_id, updated_at', v2_sale_return_documents: 'id, user_id, sale_id, returned_at, [user_id+sale_id]', v2_sale_return_lines: 'id, return_id, sale_line_id, user_id, product_id, movement_id, [user_id+product_id]'
  });

  // Close this tab's handle when another tab triggers a DB version upgrade.
  database.on('versionchange', () => database.close());
  return database;
}

export const db = createDatabase();

// Open the DB eagerly at module load so the first real operation never races
// against Chrome's IndexedDB initialisation (which can throw UnknownError).
export const dbReady = db.open();
