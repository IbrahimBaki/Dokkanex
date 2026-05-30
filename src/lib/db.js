import Dexie from 'dexie';

export const db = new Dexie('DokkanexDB');

db.version(1).stores({
  products: 'id, name, category_id, user_id, created_at, updated_at',
  categories: 'id, name, user_id, created_at',
  sync_queue: '++id, table_name, operation, record_id, created_at',
  app_meta: 'key'
});
