import { NextRequest, NextResponse } from 'next/server';
import { queryOne } from '@/lib/server/db';
import { SESSION_IDLE_TIMEOUT_SECONDS } from '@/lib/server/session-token';

const SESSION_COOKIE_NAME = 'sophos_session';

function encode(value: string): Uint8Array {
  return new TextEncoder().encode(value);
}

function toBase64Url(buffer: ArrayBuffer): string {
  return btoa(String.fromCharCode(...new Uint8Array(buffer)))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/g, '');
}

function decodeBase64Url(value: string): string {
  const base64 = value.replace(/-/g, '+').replace(/_/g, '/');
  return atob(base64.padEnd(base64.length + ((4 - (base64.length % 4)) % 4), '='));
}

function isAuthEnabled(): boolean {
  return process.env.AUTH_ENABLED === 'true' || Boolean(process.env.DATABASE_URL);
}

function isPublicPath(pathname: string): boolean {
  return (
    pathname === '/' ||
    pathname === '/landing' ||
    pathname === '/login' ||
    pathname === '/register' ||
    pathname === '/api/health' ||
    pathname.startsWith('/api/auth/') ||
    pathname.startsWith('/api/access-code/')
  );
}

async function verifySessionToken(token: string): Promise<{ sid: string } | null> {
  const secret = process.env.SESSION_SECRET;
  if (!secret || secret.length < 32 || token.length > 1024) return null;

  const segments = token.split('.');
  if (segments.length !== 2) return null;
  const [payload, signature] = segments;
  if (!payload || !signature) return null;

  const key = await crypto.subtle.importKey(
    'raw',
    encode(secret).buffer as ArrayBuffer,
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const expected = toBase64Url(
    await crypto.subtle.sign('HMAC', key, encode(payload).buffer as ArrayBuffer),
  );
  if (signature.length !== expected.length) return null;

  let mismatch = 0;
  for (let index = 0; index < signature.length; index += 1) {
    mismatch |= signature.charCodeAt(index) ^ expected.charCodeAt(index);
  }
  if (mismatch !== 0) return null;

  try {
    const claims = JSON.parse(decodeBase64Url(payload)) as { sid?: string; exp?: number };
    if (
      claims.sid &&
      /^[0-9a-f-]{36}$/i.test(claims.sid) &&
      claims.exp &&
      claims.exp * 1000 > Date.now()
    ) {
      return { sid: claims.sid };
    }
    return null;
  } catch {
    return null;
  }
}

async function readActiveSessionRole(sessionId: string): Promise<string | null> {
  const row = await queryOne<{ role: string }>(
    `UPDATE sessions AS s
        SET last_seen_at = now()
       FROM users AS u
      WHERE s.id = $1
        AND s.user_id = u.id
        AND s.revoked_at IS NULL
        AND s.expires_at > now()
        AND s.last_seen_at > now() - ($2::int * interval '1 second')
        AND u.status = 'active'
      RETURNING u.role`,
    [sessionId, SESSION_IDLE_TIMEOUT_SECONDS],
  );
  return row?.role || null;
}

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  if (!isAuthEnabled() || isPublicPath(pathname)) return NextResponse.next();

  const token = request.cookies.get(SESSION_COOKIE_NAME)?.value;
  const claims = token ? await verifySessionToken(token) : null;
  if (claims) {
    const requiresDatabaseCheck = pathname.startsWith('/api/') || pathname.startsWith('/admin');
    if (!requiresDatabaseCheck) return NextResponse.next();

    try {
      const role = await readActiveSessionRole(claims.sid);
      if (role) {
        if (!pathname.startsWith('/admin') && !pathname.startsWith('/api/admin/')) {
          return NextResponse.next();
        }
        if (role === 'admin') return NextResponse.next();
        if (pathname.startsWith('/api/')) {
          return NextResponse.json(
            { success: false, errorCode: 'INVALID_REQUEST', error: 'Admin role required' },
            { status: 403, headers: { 'Cache-Control': 'no-store' } },
          );
        }
        return NextResponse.redirect(new URL('/student', request.nextUrl));
      }
    } catch {
      return NextResponse.json(
        {
          success: false,
          errorCode: 'INTERNAL_ERROR',
          error: 'Authentication service unavailable',
        },
        { status: 503, headers: { 'Cache-Control': 'no-store' } },
      );
    }
  }

  if (pathname.startsWith('/api/')) {
    return NextResponse.json(
      { success: false, errorCode: 'INVALID_REQUEST', error: 'Authentication required' },
      { status: 401, headers: { 'Cache-Control': 'no-store' } },
    );
  }

  const loginUrl = request.nextUrl.clone();
  loginUrl.pathname = '/login';
  loginUrl.search = '';
  loginUrl.searchParams.set('next', `${pathname}${request.nextUrl.search}`);
  return NextResponse.redirect(loginUrl);
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|apple-icon.png|logos/|avatars/|vendor/).*)'],
};
