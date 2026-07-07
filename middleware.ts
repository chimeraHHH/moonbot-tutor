import { NextRequest, NextResponse } from 'next/server';

const SESSION_COOKIE_NAME = 'sophos_session';

/** Convert string to Uint8Array */
function encode(str: string): Uint8Array {
  return new TextEncoder().encode(str);
}

/** Convert ArrayBuffer to hex string */
function bufToHex(buf: ArrayBuffer): string {
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

/** Verify an HMAC-signed token using Web Crypto API (Edge-compatible) */
async function verifyToken(token: string, accessCode: string): Promise<boolean> {
  const dotIndex = token.indexOf('.');
  if (dotIndex === -1) return false;

  const timestamp = token.substring(0, dotIndex);
  const signature = token.substring(dotIndex + 1);

  const keyData = encode(accessCode);
  const key = await crypto.subtle.importKey(
    'raw',
    keyData.buffer as ArrayBuffer,
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );

  const data = encode(timestamp);
  const expected = bufToHex(await crypto.subtle.sign('HMAC', key, data.buffer as ArrayBuffer));

  // Constant-length comparison (not truly constant-time in JS, but sufficient here)
  if (signature.length !== expected.length) return false;
  let mismatch = 0;
  for (let i = 0; i < signature.length; i++) {
    mismatch |= signature.charCodeAt(i) ^ expected.charCodeAt(i);
  }
  return mismatch === 0;
}

function isAuthEnabled(): boolean {
  return process.env.AUTH_ENABLED === 'true' || Boolean(process.env.DATABASE_URL);
}

function getSessionSecret(): string | undefined {
  return process.env.SESSION_SECRET || process.env.ACCESS_CODE;
}

function decodeBase64Url(value: string): string {
  const base64 = value.replace(/-/g, '+').replace(/_/g, '/');
  const padded = base64.padEnd(base64.length + ((4 - (base64.length % 4)) % 4), '=');
  return atob(padded);
}

function isPublicAuthPath(pathname: string): boolean {
  return (
    pathname === '/login' ||
    pathname === '/api/health' ||
    pathname.startsWith('/api/auth/') ||
    pathname.startsWith('/api/access-code/')
  );
}

async function verifySessionToken(
  token: string,
): Promise<{ uid: string; role: string; exp: number } | null> {
  const secret = getSessionSecret();
  if (!secret) return null;

  const [payload, signature] = token.split('.');
  if (!payload || !signature) return null;

  const keyData = encode(secret);
  const key = await crypto.subtle.importKey(
    'raw',
    keyData.buffer as ArrayBuffer,
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const data = encode(payload);
  const expected = btoa(
    String.fromCharCode(
      ...new Uint8Array(await crypto.subtle.sign('HMAC', key, data.buffer as ArrayBuffer)),
    ),
  )
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/g, '');

  if (signature.length !== expected.length) return null;
  let mismatch = 0;
  for (let i = 0; i < signature.length; i++) {
    mismatch |= signature.charCodeAt(i) ^ expected.charCodeAt(i);
  }
  if (mismatch !== 0) return null;

  try {
    const claims = JSON.parse(decodeBase64Url(payload)) as {
      uid?: string;
      role?: string;
      exp?: number;
    };
    if (!claims.uid || !claims.role || !claims.exp) return null;
    if (claims.exp * 1000 <= Date.now()) return null;
    return { uid: claims.uid, role: claims.role, exp: claims.exp };
  } catch {
    return null;
  }
}

export async function middleware(request: NextRequest) {
  const accessCode = process.env.ACCESS_CODE;
  const { pathname } = request.nextUrl;
  const publicAuthPath = isPublicAuthPath(pathname);

  if (accessCode && !publicAuthPath) {
    // Check cookie — validate HMAC signature, not just existence
    const cookie = request.cookies.get('openmaic_access');
    if (!cookie?.value || !(await verifyToken(cookie.value, accessCode))) {
      // API requests without valid cookie → 401
      if (pathname.startsWith('/api/')) {
        return NextResponse.json(
          { success: false, errorCode: 'INVALID_REQUEST', error: 'Access code required' },
          { status: 401 },
        );
      }

      // Page requests → let through, frontend shows modal
      return NextResponse.next();
    }
  }

  if (!isAuthEnabled() || publicAuthPath) {
    return NextResponse.next();
  }

  const sessionCookie = request.cookies.get(SESSION_COOKIE_NAME);
  const claims = sessionCookie?.value ? await verifySessionToken(sessionCookie.value) : null;
  if (!claims) {
    if (pathname.startsWith('/api/')) {
      return NextResponse.json(
        { success: false, errorCode: 'INVALID_REQUEST', error: 'Authentication required' },
        { status: 401 },
      );
    }

    const loginUrl = request.nextUrl.clone();
    loginUrl.pathname = '/login';
    loginUrl.search = '';
    loginUrl.searchParams.set('next', `${pathname}${request.nextUrl.search}`);
    return NextResponse.redirect(loginUrl);
  }

  if (pathname.startsWith('/admin') || pathname.startsWith('/api/admin/')) {
    if (claims.role !== 'admin') {
      if (pathname.startsWith('/api/')) {
        return NextResponse.json(
          { success: false, errorCode: 'INVALID_REQUEST', error: 'Admin role required' },
          { status: 403 },
        );
      }
      const fallbackUrl = request.nextUrl.clone();
      fallbackUrl.pathname = '/student';
      fallbackUrl.search = '';
      return NextResponse.redirect(fallbackUrl);
    }
  }

  return NextResponse.next();
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|apple-icon.png|logos/|avatars/|vendor/).*)'],
};
