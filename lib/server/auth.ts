import { cookies, headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { isDatabaseConfigured } from '@/lib/server/db';
import { findUserById, touchAndReadSession } from '@/lib/server/auth-store';
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
    return await touchAndReadSession({ sessionId: claims.sid, userId: claims.uid });
  } catch {
    return null;
  }
}

export async function getCurrentUserFast(): Promise<AuthUser | null> {
  if (!isAuthEnabled()) return null;

  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE_NAME)?.value;
  const claims = token ? verifySessionToken(token) : null;
  if (!claims) return null;

  return findUserById(claims.uid);
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
    secure: process.env.NODE_ENV === 'production',
  };
}
