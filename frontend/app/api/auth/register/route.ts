import { cookies } from 'next/headers';
import { type NextRequest } from 'next/server';
import { apiError, apiSuccess } from '@/lib/server/api-response';
import { getSessionCookieOptions, isAuthEnabled } from '@/lib/server/auth';
import {
  createSession,
  createUser,
  markUserLogin,
  recordLoginAttempt,
  writeAuditLog,
} from '@/lib/server/auth-store';
import { normalizeEmail } from '@/lib/server/auth-types';
import { isDatabaseConfigured } from '@/lib/server/db';
import { createSessionToken, SESSION_COOKIE_NAME } from '@/lib/server/session-token';

function getRequestMeta(req: NextRequest) {
  return {
    ipAddress:
      req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
      req.headers.get('x-real-ip') ||
      null,
    userAgent: req.headers.get('user-agent'),
  };
}

function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

export async function POST(req: NextRequest) {
  if (!isAuthEnabled()) {
    return apiSuccess({ authenticated: false, authEnabled: false });
  }
  if (!isDatabaseConfigured()) {
    return apiError('INTERNAL_ERROR', 503, 'Database is not configured');
  }
  if (!process.env.SESSION_SECRET && !process.env.ACCESS_CODE) {
    return apiError('INTERNAL_ERROR', 500, 'SESSION_SECRET is required');
  }

  let body: { email?: string; password?: string; displayName?: string };
  try {
    body = await req.json();
  } catch {
    return apiError('INVALID_REQUEST', 400, 'Invalid JSON body');
  }

  const email = normalizeEmail(body.email || '');
  const password = body.password || '';
  const displayName = body.displayName?.trim() || '';
  const meta = getRequestMeta(req);

  if (!isValidEmail(email)) {
    return apiError('INVALID_REQUEST', 400, 'Enter a valid email address');
  }
  if (displayName.length < 1 || displayName.length > 80) {
    return apiError('INVALID_REQUEST', 400, 'Display name must be 1-80 characters');
  }
  if (password.length < 8) {
    return apiError('INVALID_REQUEST', 400, 'Password must be at least 8 characters');
  }

  try {
    const user = await createUser({
      email,
      password,
      displayName,
      role: 'student',
    });

    const session = await createSession({ userId: user.id, ...meta });
    await markUserLogin(user.id);
    await recordLoginAttempt({ email, success: true, ...meta });
    await writeAuditLog({
      actorUserId: user.id,
      action: 'auth.register',
      targetType: 'user',
      targetId: user.id,
      metadata: { email: user.email, role: user.role },
      ...meta,
    });

    const token = createSessionToken({
      sid: session.id,
      uid: user.id,
      role: user.role,
      exp: Math.floor(session.expiresAt.getTime() / 1000),
    });
    const cookieStore = await cookies();
    cookieStore.set(SESSION_COOKIE_NAME, token, getSessionCookieOptions());

    return apiSuccess(
      {
        authenticated: true,
        user: {
          id: user.id,
          email: user.email,
          displayName: user.displayName,
          role: user.role,
        },
      },
      201,
    );
  } catch (error) {
    const code = (error as { code?: string }).code;
    if (code === '23505') {
      return apiError('INVALID_REQUEST', 409, 'Email already exists');
    }
    throw error;
  }
}
