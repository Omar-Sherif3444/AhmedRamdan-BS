import { createClient } from '@supabase/supabase-js'

// Public project URL and anon key: safe in the browser, row-level security protects the data.
export const supabase = createClient(import.meta.env.VITE_SUPABASE_URL, import.meta.env.VITE_SUPABASE_ANON_KEY)
