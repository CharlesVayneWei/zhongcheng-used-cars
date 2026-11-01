import 'server-only';

import { headers } from 'next/headers';
import { hashFingerprint } from '@/lib/security/tokens';

export async function requestMetadata(loginName = '') {
  const requestHeaders = await headers();
  const forwarded = requestHeaders.get('x-forwarded-for')?.split(',')[0]?.trim();
  const ip = requestHeaders.get('x-real-ip') || forwarded || 'unknown';
  const userAgent = requestHeaders.get('user-agent')?.slice(0, 500) || null;
  return {
    ipHash: hashFingerprint(ip),
    userAgent,
    authFingerprint: hashFingerprint(`${ip}:${loginName}`),
  };
}
