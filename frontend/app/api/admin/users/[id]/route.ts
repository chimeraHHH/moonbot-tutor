import { type NextRequest } from 'next/server';
import { normalizeDisplayName, validateDisplayName, validatePassword } from '@/lib/auth/validation';
import { apiError, apiSuccess } from '@/lib/server/api-response';
import { getCurrentUser } from '@/lib/server/auth';
import { updateUser, writeAuditLog } from '@/lib/server/auth-store';
import { isUserRole, type UserRole, type UserStatus } from '@/lib/server/auth-types';
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

function isUserStatus(value: unknown): value is UserStatus {
  return value === 'active' || value === 'disabled';
}

export async function PATCH(req: NextRequest, context: { params: Promise<{ id: string }> }) {
  const originError = rejectCrossOriginRequest(req);
  if (originError) return originError;

  const auth = await requireAdmin();
  if (auth.error) return auth.error;

  const { id } = await context.params;
  const parsedBody = await readJsonBody<{
    displayName?: string;
    role?: UserRole;
    status?: UserStatus;
    password?: string;
    confirmPassword?: string;
  }>(req);
  if (!parsedBody.ok) return parsedBody.response;
  const body = parsedBody.value;

  if (body.role !== undefined && !isUserRole(body.role)) {
    return apiError('INVALID_REQUEST', 400, 'Invalid role');
  }
  if (body.status !== undefined && !isUserStatus(body.status)) {
    return apiError('INVALID_REQUEST', 400, 'Invalid status');
  }
  let displayName: string | undefined;
  if (body.displayName !== undefined) {
    displayName = normalizeDisplayName(body.displayName);
    const displayNameError = validateDisplayName(displayName);
    if (displayNameError) return apiError('INVALID_REQUEST', 400, displayNameError);
  }
  if (body.password !== undefined) {
    const passwordError = validatePassword(body.password);
    if (passwordError) return apiError('INVALID_REQUEST', 400, passwordError);
    if (body.password !== body.confirmPassword) {
      return apiError('INVALID_REQUEST', 400, '两次输入的密码不一致');
    }
  }
  if (id === auth.user.id && body.status === 'disabled') {
    return apiError('INVALID_REQUEST', 400, 'You cannot disable your own account');
  }
  if (id === auth.user.id && body.role && body.role !== 'admin') {
    return apiError('INVALID_REQUEST', 400, 'You cannot remove your own admin role');
  }

  const securityChanged =
    body.role !== undefined || body.status !== undefined || body.password !== undefined;

  let user;
  try {
    user = await updateUser(id, {
      displayName,
      role: body.role,
      status: body.status,
      password: body.password || undefined,
      revokeSessions: securityChanged,
    });
  } catch (error) {
    if (error instanceof Error && error.message === 'User not found') {
      return apiError('INVALID_REQUEST', 404, '用户不存在');
    }
    throw error;
  }

  const meta = getRequestMeta(req);
  await writeAuditLog({
    actorUserId: auth.user.id,
    action: 'admin.user.update',
    targetType: 'user',
    targetId: user.id,
    metadata: {
      displayNameChanged: body.displayName !== undefined,
      role: body.role,
      status: body.status,
      passwordChanged: Boolean(body.password),
      sessionsRevoked: securityChanged,
    },
    ...meta,
  });

  return apiSuccess({ user });
}
