import { NextResponse, type NextRequest } from 'next/server';
import { ADMIN_SESSION_COOKIE } from '@/lib/auth/constants';

const PUBLIC_ADMIN_PATHS = new Set(['/admin/login', '/admin/forgot-password']);

export function proxy(request: NextRequest) {
  const path = request.nextUrl.pathname;
  if (path.startsWith('/admin/') && !PUBLIC_ADMIN_PATHS.has(path) && !request.cookies.get(ADMIN_SESSION_COOKIE)?.value) {
    const url = request.nextUrl.clone();
    url.pathname = '/admin/login';
    url.search = '';
    return NextResponse.redirect(url);
  }
  return NextResponse.next();
}

export const config = { matcher: ['/admin/:path*'] };
