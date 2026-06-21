import { createClient } from '@supabase/supabase-js'

// WARNING: service role key is exposed in the Vite bundle.
// Acceptable for an internal employee-only tool. Never ship this to a public-facing app.
const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const serviceRoleKey = import.meta.env.VITE_SUPABASE_SERVICE_ROLE_KEY

let _client = null

// Lazy init — client is created only when first needed, not at module load time.
// This prevents a crash on app load when the service role key is not set.
export function getAdminClient() {
  if (!_client) {
    _client = createClient(supabaseUrl, serviceRoleKey, {
      auth: { autoRefreshToken: false, persistSession: false }
    })
  }
  return _client
}
