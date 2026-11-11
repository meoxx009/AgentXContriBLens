import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  if (pathname === '/app' || pathname === '/app/') {
    const sessionCookie = request.cookies.get('contriblens_session');
    if (!sessionCookie?.value) {
      const loginUrl = new URL('/login', request.url);
      loginUrl.searchParams.set('next', '/app/scan');
      return NextResponse.redirect(loginUrl);
    }
    return NextResponse.redirect(new URL('/app/scan', request.url));
  }
  if (pathname.startsWith('/app')) {
    const sessionCookie = request.cookies.get('contriblens_session');
    if (!sessionCookie?.value) {
      const loginUrl = new URL('/login', request.url);
      loginUrl.searchParams.set('next', pathname);
      return NextResponse.redirect(loginUrl);
    }
  }
  return NextResponse.next();
}

export const config = {
  matcher: ['/app/:path*'],
};
