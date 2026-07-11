import { cookies } from 'next/headers';
import { type NextRequest } from 'next/server';
import { apiError, apiSuccess } from '@/lib/server/api-response';
import { isAuthEnabled, getSessionCookieOptions } from '@/lib/server/auth';
import { isDatabaseConfigured } from '@/lib/server/db';
import {
  countRecentFailedLoginAttempts,
  createSession,
  findUserByEmail,
  markUserLogin,
  recordLoginAttempt,
  writeAuditLog,
} from '@/lib/server/auth-store';
import { verifyPassword } from '@/lib/server/password';
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

  let body: { email?: string; password?: string };
  try {
    body = await req.json();
  } catch {
    return apiError('INVALID_REQUEST', 400, 'Invalid JSON body');
  }

  const email = body.email?.trim().toLowerCase();
  const password = body.password || '';
  const meta = getRequestMeta(req);

  if (!email || !password) {
    return apiError('INVALID_REQUEST', 400, 'Email and password are required');
  }

  const failedAttempts = await countRecentFailedLoginAttempts({
    email,
    ipAddress: meta.ipAddress,
  });
  if (failedAttempts >= 10) {
    await recordLoginAttempt({ email, success: false, failureReason: 'rate_limited', ...meta });
    return apiError('RATE_LIMITED', 429, 'Too many login attempts. Try again later.');
  }

  const user = await findUserByEmail(email);
  const passwordOk = user ? await verifyPassword(password, user.passwordHash) : false;
  if (!user || !passwordOk) {
    await recordLoginAttempt({
      email,
      success: false,
      failureReason: 'invalid_credentials',
      ...meta,
    });
    return apiError('INVALID_REQUEST', 401, 'Invalid email or password');
  }

  if (user.status !== 'active') {
    await recordLoginAttempt({ email, success: false, failureReason: 'disabled_user', ...meta });
    return apiError('INVALID_REQUEST', 403, 'User is disabled');
  }

  const session = await createSession({ userId: user.id, ...meta });
  await markUserLogin(user.id);
  await recordLoginAttempt({ email, success: true, ...meta });
  await writeAuditLog({
    actorUserId: user.id,
    action: 'auth.login',
    targetType: 'user',
    targetId: user.id,
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

  return apiSuccess({
    authenticated: true,
    user: {
      id: user.id,
      email: user.email,
      displayName: user.displayName,
      role: user.role,
    },
  });
}
