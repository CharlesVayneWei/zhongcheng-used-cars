import { createClient } from '@supabase/supabase-js';
import { getSupabasePublicConfig } from '@/lib/config';

export function createPublicClient() {
  const config = getSupabasePublicConfig();
  if (!config) return null;
  return createClient(config.url, config.anonKey, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
}
