import { type NextRequest } from 'next/server';
import {
  normalizeDisplayName,
  normalizeLoginIdentifier,
  validateDisplayName,
  validatePassword,
} from '@/lib/auth/validation';
import { apiError, apiSuccess } from '@/lib/server/api-response';
import { getCurrentUser } from '@/lib/server/auth';
import { createUser, listUsers, writeAuditLog } from '@/lib/server/auth-store';
import { isUserRole, type UserRole } from '@/lib/server/auth-types';
import {
  getRequestMeta,
  readJsonBody,
  rejectCrossOriginRequest,
} from '@/lib/server/request-security';

async function requireAdmin() {
  const user = await getCurrentUser();
  if (!user) return { error: apiError('INVALID_REQUEST', 401, 'Authentication required') };
  if (user.role !== 'admin')
    return { error: apiError('INVALID_REQUEST', 403, 'Admin role required') };
  return { user };
}

export async function GET(req: NextRequest) {
  const auth = await requireAdmin();
  if (auth.error) return auth.error;

  const query = req.nextUrl.searchParams.get('q')?.slice(0, 80) || '';
  const requestedLimit = Number(req.nextUrl.searchParams.get('limit') || 100);
  const users = await listUsers({
    query,
    limit: Number.isFinite(requestedLimit) ? requestedLimit : 100,
  });
  return apiSuccess({ users });
}

export async function POST(req: NextRequest) {
  const originError = rejectCrossOriginRequest(req);
  if (originError) return originError;

  const auth = await requireAdmin();
  if (auth.error) return auth.error;

  const parsedBody = await readJsonBody<{
    identifier?: string;
    password?: string;
    confirmPassword?: string;
    displayName?: string;
    role?: UserRole;
  }>(req);
  if (!parsedBody.ok) return parsedBody.response;
  const body = parsedBody.value;

  const identifier = normalizeLoginIdentifier(body.identifier || '');
  const displayName = normalizeDisplayName(body.displayName || '');
  const displayNameError = validateDisplayName(displayName);
  const passwordError = validatePassword(body.password || '');
  if (!identifier) {
    return apiError('INVALID_REQUEST', 400, '请输入有效的手机号或邮箱');
  }
  if (displayNameError) return apiError('INVALID_REQUEST', 400, displayNameError);
  if (passwordError) return apiError('INVALID_REQUEST', 400, passwordError);
  if (body.password !== body.confirmPassword) {
    return apiError('INVALID_REQUEST', 400, '两次输入的密码不一致');
  }
  if (!isUserRole(body.role)) {
    return apiError('INVALID_REQUEST', 400, '请选择有效角色');
  }

  try {
    const user = await createUser({
      identifier: identifier.value,
      email: identifier.email,
      phone: identifier.phone,
      password: body.password!,
      displayName,
      role: body.role,
    });
    const meta = getRequestMeta(req);
    await writeAuditLog({
      actorUserId: auth.user.id,
      action: 'admin.user.create',
      targetType: 'user',
      targetId: user.id,
      metadata: { identifierType: user.identifierType, role: user.role },
      ...meta,
    });
    return apiSuccess({ user }, 201);
  } catch (error) {
    const code = (error as { code?: string }).code;
    if (code === '23505') {
      return apiError('INVALID_REQUEST', 409, '该手机号或邮箱已注册');
    }
    throw error;
  }
}
