import { db as defaultDb } from './db'
import { v4 as uuidv4 } from 'uuid'
import { createOutboxOperation } from './outbox'

export const DEFAULT_SHOP_PROFILE = Object.freeze({ shop_name: 'DokkanX', phone: '', address: '', tax_number: '', logo_url: '', return_policy: '', invoice_footer: '' })

export async function getShopProfile(userId, database = defaultDb) {
  const profile = await database.shop_profiles.get(userId)
  return { ...DEFAULT_SHOP_PROFILE, ...(profile ?? {}), user_id: userId }
}

export async function saveShopProfile({ userId, profile }, database = defaultDb) {
  const record = { ...DEFAULT_SHOP_PROFILE, ...profile, user_id: userId, updated_at: new Date().toISOString() }
  return database.transaction('rw', database.shop_profiles, database.outbox_operations, database.sync_state, async () => {
    await database.shop_profiles.put(record)
    const operation = await createOutboxOperation({ operation_id: uuidv4(), user_id: userId, entity_type: 'shop_profile', action: 'upsert', entity_id: userId, payload: record }, database)
    return { record, operation }
  })
}
