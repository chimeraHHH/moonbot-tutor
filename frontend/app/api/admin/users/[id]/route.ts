import { type NextRequest } from 'next/server';
import { apiError, apiSuccess } from '@/lib/server/api-response';
import { getCurrentUser } from '@/lib/server/auth';
import { updateUser, writeAuditLog } from '@/lib/server/auth-store';
import { isUserRole, type UserRole, type UserStatus } from '@/lib/server/auth-types';

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
  const auth = await requireAdmin();
  if (auth.error) return auth.error;

  const { id } = await context.params;
  let body: {
    displayName?: string;
    role?: UserRole;
    status?: UserStatus;
    password?: string;
  };
  try {
    body = await req.json();
  } catch {
    return apiError('INVALID_REQUEST', 400, 'Invalid JSON body');
  }

  if (body.role !== undefined && !isUserRole(body.role)) {
    return apiError('INVALID_REQUEST', 400, 'Invalid role');
  }
  if (body.status !== undefined && !isUserStatus(body.status)) {
    return apiError('INVALID_REQUEST', 400, 'Invalid status');
  }
  if (id === auth.user.id && body.status === 'disabled') {
    return apiError('INVALID_REQUEST', 400, 'You cannot disable your own account');
  }
  if (id === auth.user.id && body.role && body.role !== 'admin') {
    return apiError('INVALID_REQUEST', 400, 'You cannot remove your own admin role');
  }

  const user = await updateUser(id, {
    displayName: body.displayName,
    role: body.role,
    status: body.status,
    password: body.password || undefined,
  });

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
    },
  });

  return apiSuccess({ user });
}
