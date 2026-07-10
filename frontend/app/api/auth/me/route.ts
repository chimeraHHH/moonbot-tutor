import { apiSuccess } from '@/lib/server/api-response';
import { getCurrentUser, isAuthEnabled } from '@/lib/server/auth';

export async function GET() {
  if (!isAuthEnabled()) {
    return apiSuccess({ authEnabled: false, authenticated: false });
  }

  const user = await getCurrentUser();
  return apiSuccess({
    authEnabled: true,
    authenticated: !!user,
    user: user
      ? {
          id: user.id,
          email: user.email,
          displayName: user.displayName,
          role: user.role,
          status: user.status,
        }
      : null,
  });
}
