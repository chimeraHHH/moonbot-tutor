import { cookies } from 'next/headers';
import { type NextRequest } from 'next/server';
import {
  normalizeDisplayName,
  normalizeLoginIdentifier,
  validateDisplayName,
  validatePassword,
} from '@/lib/auth/validation';
import { apiError, apiSuccess } from '@/lib/server/api-response';
import { getSessionCookieOptions, isAuthEnabled } from '@/lib/server/auth';
import {
  createSession,
  createUser,
  countRecentRegistrationAttempts,
  markUserLogin,
  recordAuthAttempt,
  writeAuditLog,
} from '@/lib/server/auth-store';
import { isDatabaseConfigured } from '@/lib/server/db';
import {
  getRequestMeta,
  readJsonBody,
  rejectCrossOriginRequest,
} from '@/lib/server/request-security';
import { createSessionToken, SESSION_COOKIE_NAME } from '@/lib/server/session-token';

export async function POST(req: NextRequest) {
  const originError = rejectCrossOriginRequest(req);
  if (originError) return originError;

  if (!isAuthEnabled()) {
    return apiSuccess({ authenticated: false, authEnabled: false });
  }
  if (!isDatabaseConfigured()) {
    return apiError('INTERNAL_ERROR', 503, 'Database is not configured');
  }
  if (!process.env.SESSION_SECRET || process.env.SESSION_SECRET.length < 32) {
    return apiError('INTERNAL_ERROR', 500, 'SESSION_SECRET is not configured securely');
  }

  const parsedBody = await readJsonBody<{
    identifier?: string;
    password?: string;
    confirmPassword?: string;
    displayName?: string;
  }>(req);
  if (!parsedBody.ok) return parsedBody.response;
  const body = parsedBody.value;

  const identifier = normalizeLoginIdentifier(body.identifier || '');
  const password = body.password || '';
  const confirmPassword = body.confirmPassword || '';
  const displayName = normalizeDisplayName(body.displayName || '');
  const meta = getRequestMeta(req);

  if (!identifier) {
    return apiError('INVALID_REQUEST', 400, '请输入有效的手机号或邮箱');
  }
  const displayNameError = validateDisplayName(displayName);
  if (displayNameError) {
    return apiError('INVALID_REQUEST', 400, displayNameError);
  }
  const passwordError = validatePassword(password);
  if (passwordError) {
    return apiError('INVALID_REQUEST', 400, passwordError);
  }
  if (password !== confirmPassword) {
    return apiError('INVALID_REQUEST', 400, '两次输入的密码不一致');
  }

  const registrationAttempts = await countRecentRegistrationAttempts({
    ipAddress: meta.ipAddress,
  });
  if (registrationAttempts.fromIp >= 10 || registrationAttempts.global >= 500) {
    await recordAuthAttempt({
      kind: 'register',
      identifier: identifier.value,
      success: false,
      failureReason: 'rate_limited',
      ...meta,
    });
    return apiError('RATE_LIMITED', 429, '注册请求过于频繁，请稍后再试');
  }

  try {
    const user = await createUser({
      identifier: identifier.value,
      email: identifier.email,
      phone: identifier.phone,
      password,
      displayName,
      role: 'student',
    });

    const session = await createSession({ userId: user.id, ...meta });
    await markUserLogin(user.id);
    await recordAuthAttempt({
      kind: 'register',
      identifier: identifier.value,
      success: true,
      ...meta,
    });
    await writeAuditLog({
      actorUserId: user.id,
      action: 'auth.register',
      targetType: 'user',
      targetId: user.id,
      metadata: { identifierType: user.identifierType, role: user.role },
      ...meta,
    });

    const token = createSessionToken({
      sid: session.id,
      exp: Math.floor(session.expiresAt.getTime() / 1000),
    });
    const cookieStore = await cookies();
    cookieStore.set(SESSION_COOKIE_NAME, token, getSessionCookieOptions());

    return apiSuccess(
      {
        authenticated: true,
        user: {
          id: user.id,
          identifier: user.loginIdentifier,
          identifierType: user.identifierType,
          email: user.email,
          phone: user.phone,
          displayName: user.displayName,
          role: user.role,
        },
      },
      201,
    );
  } catch (error) {
    const code = (error as { code?: string }).code;
    if (code === '23505') {
      await recordAuthAttempt({
        kind: 'register',
        identifier: identifier.value,
        success: false,
        failureReason: 'duplicate_identifier',
        ...meta,
      });
      return apiError('INVALID_REQUEST', 409, '该手机号或邮箱已注册');
    }
    throw error;
  }
}
