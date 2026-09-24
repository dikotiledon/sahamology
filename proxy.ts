import { NextRequest, NextResponse } from 'next/server';
import { verifySessionToken } from './lib/auth';

const SESSION_NAME = 'sahamology_session';

// Define paths that don't require authentication
const PUBLIC_PATHS = [
  '/api/auth/verify-password',
  '/api/auth/check-password',
  '/api/auth/set-password', // Allow initial setup
  // The Chrome extension POSTs the intercepted Stockbit JWT here. It has no
  // session cookie and no CRON secret (it is an external client), so this
  // route must bypass the session gate. The route itself validates the
  // payload; CORS is handled by the route's OPTIONS/POST headers.
  '/api/update-token',
];

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // 1. Allow background jobs/cron via secret token
  const authHeader = request.headers.get('authorization');
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret && authHeader === `Bearer ${cronSecret}`) {
    return NextResponse.next();
  }

  // 2. Only protect API routes
  if (!pathname.startsWith('/api')) {
    return NextResponse.next();
  }

  // Allow public auth routes
  if (PUBLIC_PATHS.some(path => pathname.startsWith(path))) {
    return NextResponse.next();
  }

  // Check for session cookie
  const sessionCookie = request.cookies.get(SESSION_NAME)?.value;

  if (!sessionCookie) {
    return NextResponse.json(
      { success: false, error: 'Unauthorized: No session' },
      { status: 401 }
    );
  }

  // Verify token
  const session = await verifySessionToken(sessionCookie);
  if (!session) {
    // Session invalid or expired
    const response = NextResponse.json(
      { success: false, error: 'Unauthorized: Invalid session' },
      { status: 401 }
    );
    
    // Clear the invalid cookie
    response.cookies.delete(SESSION_NAME);
    return response;
  }

  return NextResponse.next();
}

export const config = {
  matcher: '/api/:path*',
};
