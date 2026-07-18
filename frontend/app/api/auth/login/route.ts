import { cookies } from 'next/headers';
import { type NextRequest } from 'next/server';
import { normalizeLoginIdentifier, PASSWORD_MAX_LENGTH } from '@/lib/auth/validation';
import { apiError, apiSuccess } from '@/lib/server/api-response';
import { isAuthEnabled, getSessionCookieOptions } from '@/lib/server/auth';
import { isDatabaseConfigured } from '@/lib/server/db';
import {
  countRecentFailedAuthAttempts,
  createSession,
  findUserByIdentifier,
  markUserLogin,
  recordAuthAttempt,
  writeAuditLog,
} from '@/lib/server/auth-store';
import { DUMMY_PASSWORD_HASH, verifyPassword } from '@/lib/server/password';
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

  const parsedBody = await readJsonBody<{ identifier?: string; password?: string }>(req);
  if (!parsedBody.ok) return parsedBody.response;
  const body = parsedBody.value;

  const rawIdentifier = body.identifier?.trim() || '';
  const identifier = normalizeLoginIdentifier(rawIdentifier);
  const password = body.password || '';
  const meta = getRequestMeta(req);

  if (!rawIdentifier || !password || password.length > PASSWORD_MAX_LENGTH) {
    return apiError('INVALID_REQUEST', 400, '请输入手机号/邮箱和密码');
  }

  const attemptIdentifier = identifier?.value || rawIdentifier.toLowerCase().slice(0, 254);
  const failedAttempts = await countRecentFailedAuthAttempts({
    kind: 'login',
    identifier: attemptIdentifier,
    ipAddress: meta.ipAddress,
  });
  if (failedAttempts.matched >= 10 || failedAttempts.global >= 1000) {
    await recordAuthAttempt({
      kind: 'login',
      identifier: attemptIdentifier,
      success: false,
      failureReason: 'rate_limited',
      ...meta,
    });
    return apiError('RATE_LIMITED', 429, '登录尝试过多，请稍后再试');
  }

  const user = identifier ? await findUserByIdentifier(identifier.value) : null;
  const passwordOk = await verifyPassword(password, user?.passwordHash || DUMMY_PASSWORD_HASH);
  if (!user || !passwordOk || user.status !== 'active') {
    await recordAuthAttempt({
      kind: 'login',
      identifier: attemptIdentifier,
      success: false,
      failureReason: user?.status === 'disabled' ? 'disabled_user' : 'invalid_credentials',
      ...meta,
    });
    return apiError('INVALID_REQUEST', 401, '手机号/邮箱或密码错误');
  }

  const session = await createSession({ userId: user.id, ...meta });
  await markUserLogin(user.id);
  await recordAuthAttempt({
    kind: 'login',
    identifier: user.loginIdentifier,
    success: true,
    ...meta,
  });
  await writeAuditLog({
    actorUserId: user.id,
    action: 'auth.login',
    targetType: 'user',
    targetId: user.id,
    ...meta,
  });

  const token = createSessionToken({
    sid: session.id,
    exp: Math.floor(session.expiresAt.getTime() / 1000),
  });
  const cookieStore = await cookies();
  cookieStore.set(SESSION_COOKIE_NAME, token, getSessionCookieOptions());

  return apiSuccess({
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
  });
}
