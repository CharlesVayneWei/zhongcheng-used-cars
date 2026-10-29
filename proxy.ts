import { createServerClient } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';
import { getSupabasePublicConfig } from '@/lib/config';

export async function proxy(request: NextRequest) {
  const config = getSupabasePublicConfig();
  let response = NextResponse.next({ request });
  if (!config) {
    if (request.nextUrl.pathname.startsWith('/admin/') && !['/admin/login', '/admin/forgot-password'].includes(request.nextUrl.pathname)) {
      const url = request.nextUrl.clone();
      url.pathname = '/admin/login';
      url.searchParams.set('error', 'config');
      return NextResponse.redirect(url);
    }
    return response;
  }

  const client = createServerClient(config.url, config.anonKey, {
    cookies: {
      getAll: () => request.cookies.getAll(),
      setAll: (cookiesToSet) => {
        cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
        response = NextResponse.next({ request });
        cookiesToSet.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
      },
    },
  });
  const { data: { user } } = await client.auth.getUser();
  const path = request.nextUrl.pathname;
  if (path.startsWith('/admin/') && !['/admin/login', '/admin/forgot-password'].includes(path)) {
    let allowed = false;
    if (user) {
      const { data } = await client.from('admin_profiles').select('user_id').eq('user_id', user.id).maybeSingle();
      allowed = Boolean(data);
    }
    if (!allowed) {
      const url = request.nextUrl.clone();
      url.pathname = '/admin/login';
      url.search = '';
      return NextResponse.redirect(url);
    }
  }
  return response;
}

export const config = {
  matcher: ['/admin/:path*'],
};
