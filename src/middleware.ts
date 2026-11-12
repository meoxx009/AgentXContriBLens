import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

function isJwtExpired(token: string): boolean {
  try {
    const parts = token.split('.');
    if (parts.length !== 3) return true;
    const payload = JSON.parse(atob(parts[1].replace(/-/g, '+').replace(/_/g, '/')));
    if (!payload.exp) return false;
    return payload.exp * 1000 < Date.now();
  } catch {
    return false;
  }
}

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const sessionCookie = request.cookies.get('contriblens_session');
  const token = sessionCookie?.value;
  const isAuthenticated = Boolean(token && !isJwtExpired(token));

  // If already authenticated and accessing login or signup, redirect directly to /app/scan
  if (pathname === '/login' || pathname === '/signup') {
    if (isAuthenticated) {
      return NextResponse.redirect(new URL('/app/scan', request.url));
    }
    return NextResponse.next();
  }

  // Handle protected /app routes
  if (pathname === '/app' || pathname === '/app/') {
    if (!isAuthenticated) {
      const loginUrl = new URL('/login', request.url);
      loginUrl.searchParams.set('next', '/app/scan');
      return NextResponse.redirect(loginUrl);
    }
    return NextResponse.redirect(new URL('/app/scan', request.url));
  }

  if (pathname.startsWith('/app')) {
    if (!isAuthenticated) {
      const loginUrl = new URL('/login', request.url);
      loginUrl.searchParams.set('next', pathname);
      return NextResponse.redirect(loginUrl);
    }
  }

  return NextResponse.next();
}

export const config = {
  matcher: ['/app/:path*', '/login', '/signup'],
};
