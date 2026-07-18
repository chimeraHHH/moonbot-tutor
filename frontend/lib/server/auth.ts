import { cookies, headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { isDatabaseConfigured } from '@/lib/server/db';
import { touchAndReadSession } from '@/lib/server/auth-store';
import type { AuthUser, UserRole } from '@/lib/server/auth-types';
import {
  SESSION_COOKIE_NAME,
  SESSION_MAX_AGE_SECONDS,
  verifySessionToken,
} from '@/lib/server/session-token';

export function isAuthEnabled(): boolean {
  return process.env.AUTH_ENABLED === 'true' || isDatabaseConfigured();
}

export function canAccessRole(userRole: UserRole, requiredRoles: UserRole[]): boolean {
  return requiredRoles.includes(userRole);
}

function getPublicAppUrl(): string | undefined {
  return (
    process.env.AUTH_PUBLIC_URL ||
    process.env.NEXT_PUBLIC_APP_URL ||
    process.env.APP_URL ||
    process.env.SITE_URL
  );
}

function shouldUseSecureSessionCookie(): boolean {
  const override = process.env.AUTH_COOKIE_SECURE?.trim().toLowerCase();
  if (override === 'true') return true;
  if (override === 'false') return false;

  const publicUrl = getPublicAppUrl();
  if (publicUrl) {
    try {
      return new URL(publicUrl).protocol === 'https:';
    } catch {
      return process.env.NODE_ENV === 'production';
    }
  }

  return process.env.NODE_ENV === 'production';
}

export async function getRequestMeta(): Promise<{
  ipAddress: string | null;
  userAgent: string | null;
}> {
  const headerStore = await headers();
  return {
    ipAddress:
      headerStore.get('x-forwarded-for')?.split(',')[0]?.trim() ||
      headerStore.get('x-real-ip') ||
      null,
    userAgent: headerStore.get('user-agent'),
  };
}

export async function getCurrentUser(): Promise<AuthUser | null> {
  if (!isAuthEnabled()) return null;

  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE_NAME)?.value;
  if (!token) return null;

  const claims = verifySessionToken(token);
  if (!claims) return null;

  try {
    return await touchAndReadSession({ sessionId: claims.sid });
  } catch {
    return null;
  }
}

export async function requireCurrentUser(): Promise<AuthUser> {
  const user = await getCurrentUser();
  if (!user) {
    redirect('/login');
  }
  return user;
}

export async function requireRole(requiredRoles: UserRole[]): Promise<AuthUser> {
  const user = await requireCurrentUser();
  if (!canAccessRole(user.role, requiredRoles)) {
    redirect('/student');
  }
  return user;
}

export function getSessionCookieOptions() {
  return {
    httpOnly: true,
    sameSite: 'lax' as const,
    path: '/',
    maxAge: SESSION_MAX_AGE_SECONDS,
    secure: shouldUseSecureSessionCookie(),
    priority: 'high' as const,
  };
}
