import 'server-only';

import { hasDatabaseConfig, isDemoMode } from '@/lib/config';
import { query } from '@/lib/db/pool';
import { demoSettings } from '@/lib/demo-data';
import type { SiteSettings } from '@/lib/types';

const fallback: SiteSettings = {
  site_name: '众成精品车行', tagline: '真实车源，透明信息', consultation_phone: null, consultation_wechat: null,
};

export async function getSiteSettings(): Promise<SiteSettings> {
  if (isDemoMode) return demoSettings;
  if (!hasDatabaseConfig()) return fallback;
  const result = await query<SiteSettings>(
    'select site_name, tagline, consultation_phone, consultation_wechat from site_settings where id = true',
  );
  return result.rows[0] ?? fallback;
}
