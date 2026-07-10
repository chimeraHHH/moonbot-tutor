import { type NextRequest } from 'next/server';
import { apiError, apiSuccess } from '@/lib/server/api-response';
import { getCurrentUser } from '@/lib/server/auth';
import { createUser, listUsers, writeAuditLog } from '@/lib/server/auth-store';
import { isUserRole, type UserRole } from '@/lib/server/auth-types';

async function requireAdmin() {
  const user = await getCurrentUser();
  if (!user) return { error: apiError('INVALID_REQUEST', 401, 'Authentication required') };
  if (user.role !== 'admin')
    return { error: apiError('INVALID_REQUEST', 403, 'Admin role required') };
  return { user };
}

export async function GET() {
  const auth = await requireAdmin();
  if (auth.error) return auth.error;

  const users = await listUsers();
  return apiSuccess({ users });
}

export async function POST(req: NextRequest) {
  const auth = await requireAdmin();
  if (auth.error) return auth.error;

  let body: {
    email?: string;
    password?: string;
    displayName?: string;
    role?: UserRole;
  };
  try {
    body = await req.json();
  } catch {
    return apiError('INVALID_REQUEST', 400, 'Invalid JSON body');
  }

  if (!body.email || !body.password || !body.displayName || !isUserRole(body.role)) {
    return apiError('INVALID_REQUEST', 400, 'email, password, displayName and role are required');
  }

  try {
    const user = await createUser({
      email: body.email,
      password: body.password,
      displayName: body.displayName,
      role: body.role,
    });
    await writeAuditLog({
      actorUserId: auth.user.id,
      action: 'admin.user.create',
      targetType: 'user',
      targetId: user.id,
      metadata: { email: user.email, role: user.role },
    });
    return apiSuccess({ user }, 201);
  } catch (error) {
    const code = (error as { code?: string }).code;
    if (code === '23505') {
      return apiError('INVALID_REQUEST', 409, 'Email already exists');
    }
    throw error;
  }
}
