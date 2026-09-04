import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

/**
 * Edge-level route protection. This only checks whether an access cookie is
 * present — it cannot verify the JWT signature without pulling in the secret,
 * and it does not need to: every API route re-checks authentication and
 * permissions server-side. This middleware exists purely to avoid flashing a
 * protected page before a client-side redirect kicks in.
 */
const PROTECTED_PREFIXES = ['/dashboard', '/admin', '/settings'];
const AUTH_PAGES = ['/login', '/register'];
const ACCESS_COOKIE = 'fm_access';
const REFRESH_COOKIE = 'fm_refresh';

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const hasSession = Boolean(
    request.cookies.get(ACCESS_COOKIE)?.value || request.cookies.get(REFRESH_COOKIE)?.value,
  );

  const isProtected = PROTECTED_PREFIXES.some((prefix) => pathname.startsWith(prefix));
  if (isProtected && !hasSession) {
    const url = request.nextUrl.clone();
    url.pathname = '/login';
    url.searchParams.set('next', pathname);
    return NextResponse.redirect(url);
  }

  const isAuthPage = AUTH_PAGES.some((prefix) => pathname.startsWith(prefix));
  if (isAuthPage && hasSession) {
    const url = request.nextUrl.clone();
    url.pathname = '/dashboard';
    url.search = '';
    return NextResponse.redirect(url);
  }

  return NextResponse.next();
}

export const config = {
  matcher: ['/dashboard/:path*', '/admin/:path*', '/settings/:path*', '/login', '/register'],
};
