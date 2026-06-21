import { createClient } from '@supabase/supabase-js'

// WARNING: service role key is exposed in the Vite bundle.
// Acceptable for an internal employee-only tool. Never ship this to a public-facing app.
const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const serviceRoleKey = import.meta.env.VITE_SUPABASE_SERVICE_ROLE_KEY

export const adminSupabase = createClient(supabaseUrl, serviceRoleKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false
  }
})
