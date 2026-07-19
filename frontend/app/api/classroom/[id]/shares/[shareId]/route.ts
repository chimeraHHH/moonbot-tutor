import { type NextRequest } from 'next/server';
import { apiError, apiSuccess } from '@/lib/server/api-response';
import { getCurrentUser, isAuthEnabled } from '@/lib/server/auth';
import {
  authorizeClassroomAccess,
  isValidClassroomShareId,
  revokeClassroomShare,
} from '@/lib/server/classroom-access';
import { isValidClassroomId } from '@/lib/server/classroom-storage';
import { rejectCrossOriginRequest } from '@/lib/server/request-security';

export const dynamic = 'force-dynamic';

export async function DELETE(
  req: NextRequest,
  context: { params: Promise<{ id: string; shareId: string }> },
) {
  const originError = rejectCrossOriginRequest(req);
  if (originError) return originError;

  const { id, shareId } = await context.params;
  if (!isValidClassroomId(id) || !isValidClassroomShareId(shareId)) {
    return apiError('INVALID_REQUEST', 400, 'Invalid classroom share');
  }
  if (!isAuthEnabled()) {
    return apiError('INVALID_REQUEST', 404, 'Sharing is unavailable');
  }
  const user = await getCurrentUser();
  if (!user) {
    return apiError('INVALID_REQUEST', 401, 'Authentication required');
  }
  const access = await authorizeClassroomAccess({ classroomId: id, ownerOnly: true });
  if (!access.allowed) {
    return apiError('INVALID_REQUEST', 404, 'Classroom not found');
  }

  const revoked = await revokeClassroomShare({ classroomId: id, shareId });
  if (!revoked) {
    return apiError('INVALID_REQUEST', 404, 'Classroom share not found');
  }
  const response = apiSuccess({ revoked: true });
  response.headers.set('Cache-Control', 'private, no-store');
  return response;
}
