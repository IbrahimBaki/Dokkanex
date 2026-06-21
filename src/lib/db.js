import Dexie from 'dexie';

export const db = new Dexie('DokkanexDB');

db.version(1).stores({
  products: 'id, name, category_id, user_id, created_at, updated_at',
  categories: 'id, name, user_id, created_at',
  sync_queue: '++id, table_name, operation, record_id, created_at',
  app_meta: 'key'
});

db.version(2).stores({
  products: 'id, name, category_id, user_id, created_at, updated_at, image_url, image_base64',
  categories: 'id, name, user_id, created_at',
  sync_queue: '++id, table_name, operation, record_id, created_at',
  app_meta: 'key'
});

// Close this tab's handle when another tab triggers a DB version upgrade.
db.on('versionchange', () => db.close());

// Open the DB eagerly at module load so the first real operation never races
// against Chrome's IndexedDB initialisation (which can throw UnknownError).
export const dbReady = db.open();
