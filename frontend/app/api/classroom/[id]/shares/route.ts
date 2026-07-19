import { type NextRequest } from 'next/server';
import { apiError, apiSuccess } from '@/lib/server/api-response';
import { getCurrentUser, isAuthEnabled } from '@/lib/server/auth';
import {
  authorizeClassroomAccess,
  createClassroomShare,
  getSecureClassroomShareOrigin,
  isSecureClassroomShareTransport,
  listClassroomShares,
} from '@/lib/server/classroom-access';
import { isValidClassroomId } from '@/lib/server/classroom-storage';
import { readJsonBody, rejectCrossOriginRequest } from '@/lib/server/request-security';

const DEFAULT_SHARE_TTL_SECONDS = 7 * 24 * 60 * 60;
const MIN_SHARE_TTL_SECONDS = 5 * 60;
const MAX_SHARE_TTL_SECONDS = 30 * 24 * 60 * 60;

export const dynamic = 'force-dynamic';

async function requireShareManager(classroomId: string) {
  if (!isAuthEnabled()) {
    return {
      ok: false as const,
      response: apiError('INVALID_REQUEST', 404, 'Sharing is unavailable'),
    };
  }
  const user = await getCurrentUser();
  if (!user) {
    return {
      ok: false as const,
      response: apiError('INVALID_REQUEST', 401, 'Authentication required'),
    };
  }
  const access = await authorizeClassroomAccess({ classroomId, ownerOnly: true });
  if (!access.allowed) {
    return {
      ok: false as const,
      response: apiError('INVALID_REQUEST', 404, 'Classroom not found'),
    };
  }
  return { ok: true as const, user };
}

export async function GET(_req: NextRequest, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  if (!isValidClassroomId(id)) {
    return apiError('INVALID_REQUEST', 400, 'Invalid classroom id');
  }
  const manager = await requireShareManager(id);
  if (!manager.ok) return manager.response;

  const shares = await listClassroomShares(id);
  const response = apiSuccess({ shares });
  response.headers.set('Cache-Control', 'private, no-store');
  return response;
}

export async function POST(req: NextRequest, context: { params: Promise<{ id: string }> }) {
  const originError = rejectCrossOriginRequest(req);
  if (originError) return originError;

  const { id } = await context.params;
  if (!isValidClassroomId(id)) {
    return apiError('INVALID_REQUEST', 400, 'Invalid classroom id');
  }
  const manager = await requireShareManager(id);
  if (!manager.ok) return manager.response;

  const shareOrigin = getSecureClassroomShareOrigin();
  if (!shareOrigin || !isSecureClassroomShareTransport(req)) {
    return apiError('INVALID_REQUEST', 503, 'Classroom sharing requires HTTPS');
  }

  const parsedBody = await readJsonBody<{ expiresInSeconds?: unknown }>(req);
  if (!parsedBody.ok) return parsedBody.response;
  const requestedTtl = parsedBody.value.expiresInSeconds ?? DEFAULT_SHARE_TTL_SECONDS;
  if (
    !Number.isSafeInteger(requestedTtl) ||
    Number(requestedTtl) < MIN_SHARE_TTL_SECONDS ||
    Number(requestedTtl) > MAX_SHARE_TTL_SECONDS
  ) {
    return apiError(
      'INVALID_REQUEST',
      400,
      `expiresInSeconds must be an integer between ${MIN_SHARE_TTL_SECONDS} and ${MAX_SHARE_TTL_SECONDS}`,
    );
  }

  const expiresAt = new Date(Date.now() + Number(requestedTtl) * 1000);
  const share = await createClassroomShare({
    classroomId: id,
    createdByUserId: manager.user.id,
    expiresAt,
  });
  const shareUrl = `${shareOrigin}/classroom/${encodeURIComponent(id)}?shareToken=${encodeURIComponent(share.token)}`;

  // The bearer token is intentionally returned only in this creation response.
  const response = apiSuccess({ share: { ...share, url: shareUrl } }, 201);
  response.headers.set('Cache-Control', 'private, no-store');
  response.headers.set('Referrer-Policy', 'no-referrer');
  return response;
}
