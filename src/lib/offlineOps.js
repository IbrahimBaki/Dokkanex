import { db } from './db';
import { addToQueue } from './syncManager';
import { v4 as uuidv4 } from 'uuid';
import { supabase } from './supabase';

async function getUserId() {
  const { data } = await supabase.auth.getSession();
  return data.session?.user?.id;
}

// ===== PRODUCTS =====
export const getProducts = (userId) =>
  db.products.where('user_id').equals(userId).toArray();

export const getProductById = (id) =>
  db.products.get(id);

export async function addProduct(data) {
  const userId = await getUserId();
  const record = {
    ...data,
    id: uuidv4(),
    user_id: userId,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString()
  };
  await db.products.add(record);
  await addToQueue('products', 'INSERT', record.id, record);
  return record;
}

export async function updateProduct(id, data) {
  const updated = { ...data, updated_at: new Date().toISOString() };
  await db.products.update(id, updated);
  const full = await db.products.get(id);
  await addToQueue('products', 'UPDATE', id, full);
  return full;
}

export async function deleteProduct(id) {
  const product = await db.products.get(id);
  await db.products.delete(id);
  await addToQueue('products', 'DELETE', id, { image_url: product?.image_url });
}

// ===== CATEGORIES =====
export const getCategories = (userId) =>
  db.categories.where('user_id').equals(userId).toArray();

export async function addCategory(data) {
  const userId = await getUserId();
  const record = {
    ...data,
    id: uuidv4(),
    user_id: userId,
    created_at: new Date().toISOString()
  };
  await db.categories.add(record);
  await addToQueue('categories', 'INSERT', record.id, record);
  return record;
}

export async function updateCategory(id, data) {
  await db.categories.update(id, data);
  const full = await db.categories.get(id);
  await addToQueue('categories', 'UPDATE', id, full);
  return full;
}

export async function deleteCategory(id) {
  await db.categories.delete(id);
  await addToQueue('categories', 'DELETE', id, null);
}
