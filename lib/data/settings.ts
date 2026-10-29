import { createPublicClient } from '@/lib/supabase/public';
import { demoSettings } from '@/lib/demo-data';
import { isDemoMode } from '@/lib/config';
import type { SiteSettings } from '@/lib/types';

const fallback: SiteSettings = {
  site_name: '众成精品车行', tagline: '真实车源，透明信息', consultation_phone: null, consultation_wechat: null,
};

export async function getSiteSettings(): Promise<SiteSettings> {
  if (isDemoMode) return demoSettings;
  const client = createPublicClient();
  if (!client) return fallback;
  const { data } = await client.from('site_settings').select('site_name, tagline, consultation_phone, consultation_wechat').eq('id', true).maybeSingle();
  return data ? data as SiteSettings : fallback;
}
