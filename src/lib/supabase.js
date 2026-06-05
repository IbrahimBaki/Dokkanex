import { createClient } from '@supabase/supabase-js'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

export const supabase = createClient(supabaseUrl, supabaseAnonKey)

export const STORAGE_BUCKET = 'product-images'

export const uploadImage = async (file) => {
  const ext = file.name.split('.').pop()
  const fileName = `${Date.now()}-${Math.random().toString(36).slice(2, 9)}.${ext}`

  const { data, error } = await supabase.storage
    .from(STORAGE_BUCKET)
    .upload(fileName, file, { cacheControl: '3600', upsert: false })

  if (error) throw new Error('فشل رفع الصورة: ' + error.message)

  const { data: { publicUrl } } = supabase.storage
    .from(STORAGE_BUCKET)
    .getPublicUrl(data.path)

  return publicUrl
}

export const deleteImage = async (imageUrl) => {
  if (!imageUrl) return
  try {
    const marker = `/storage/v1/object/public/${STORAGE_BUCKET}/`
    const parts = imageUrl.split(marker)
    if (parts.length < 2) return
    await supabase.storage.from(STORAGE_BUCKET).remove([parts[1]])
  } catch (e) {
    console.warn('تحذير: فشل حذف الصورة', e)
  }
}
