'use client';

import { createBrowserClient } from '@supabase/ssr';
import { getSupabasePublicConfig } from '@/lib/config';

export function createSupabaseBrowserClient() {
  const config = getSupabasePublicConfig();
  if (!config) throw new Error('尚未配置 Supabase 环境变量');
  return createBrowserClient(config.url, config.anonKey);
}
