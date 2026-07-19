import { type NextRequest } from 'next/server';
import { randomUUID } from 'crypto';
import { apiSuccess, apiError, API_ERROR_CODES } from '@/lib/server/api-response';
import {
  buildRequestOrigin,
  isValidClassroomId,
  persistClassroom,
  readClassroom,
} from '@/lib/server/classroom-storage';
import { createLogger } from '@/lib/logger';
import { getCurrentUser, isAuthEnabled } from '@/lib/server/auth';
import {
  authorizeClassroomAccess,
  classroomShareCookieName,
  isSecureClassroomShareTransport,
  readClassroomShareToken,
} from '@/lib/server/classroom-access';
import { ClassroomOwnershipConflictError } from '@/lib/server/admin-records';
import { readJsonBody, rejectCrossOriginRequest } from '@/lib/server/request-security';
import type { Scene, Stage } from '@/lib/types/stage';

const log = createLogger('Classroom API');

export async function POST(request: NextRequest) {
  const originError = rejectCrossOriginRequest(request);
  if (originError) return originError;

  let stageId: string | undefined;
  let sceneCount: number | undefined;
  try {
    const user = await getCurrentUser();
    if (isAuthEnabled() && !user) {
      return apiError(API_ERROR_CODES.INVALID_REQUEST, 401, 'Authentication required');
    }

    const parsedBody = await readJsonBody<{ stage?: unknown; scenes?: unknown }>(
      request,
      20 * 1024 * 1024,
    );
    if (!parsedBody.ok) return parsedBody.response;
    const { stage: rawStage, scenes: rawScenes } = parsedBody.value;
    if (
      !rawStage ||
      typeof rawStage !== 'object' ||
      Array.isArray(rawStage) ||
      !Array.isArray(rawScenes) ||
      rawScenes.some((scene) => !scene || typeof scene !== 'object' || Array.isArray(scene))
    ) {
      return apiError(
        API_ERROR_CODES.MISSING_REQUIRED_FIELD,
        400,
        'Invalid required fields: stage, scenes',
      );
    }

    const stageRecord = rawStage as Record<string, unknown>;
    if (
      (stageRecord.id !== undefined && typeof stageRecord.id !== 'string') ||
      (typeof stageRecord.id === 'string' &&
        stageRecord.id.length > 0 &&
        !isValidClassroomId(stageRecord.id)) ||
      (stageRecord.name !== undefined &&
        (typeof stageRecord.name !== 'string' || stageRecord.name.length > 500)) ||
      rawScenes.length > 1000
    ) {
      return apiError(API_ERROR_CODES.INVALID_REQUEST, 400, 'Invalid classroom payload');
    }

    const stage = rawStage as Stage;
    const scenes = rawScenes as Scene[];
    stageId = stage.id;
    sceneCount = scenes.length;

    const id = stage.id || randomUUID();
    if (!isValidClassroomId(id)) {
      return apiError(API_ERROR_CODES.INVALID_REQUEST, 400, 'Invalid classroom id');
    }
    const baseUrl = buildRequestOrigin(request);

    const persisted = await persistClassroom(
      { id, stage: { ...stage, id }, scenes, ownerUserId: user?.id },
      baseUrl,
    );

    return apiSuccess({ id: persisted.id, url: persisted.url }, 201);
  } catch (error) {
    log.error(
      `Classroom storage failed [stageId=${stageId ?? 'unknown'}, scenes=${sceneCount ?? 0}]:`,
      error,
    );
    if (error instanceof ClassroomOwnershipConflictError) {
      return apiError(API_ERROR_CODES.INVALID_REQUEST, 409, 'Classroom id is unavailable');
    }
    return apiError(
      API_ERROR_CODES.INTERNAL_ERROR,
      500,
      'Failed to store classroom',
      error instanceof Error ? error.message : String(error),
    );
  }
}

export async function GET(request: NextRequest) {
  try {
    const id = request.nextUrl.searchParams.get('id');

    if (!id) {
      return apiError(
        API_ERROR_CODES.MISSING_REQUIRED_FIELD,
        400,
        'Missing required parameter: id',
      );
    }

    if (!isValidClassroomId(id)) {
      return apiError(API_ERROR_CODES.INVALID_REQUEST, 400, 'Invalid classroom id');
    }

    const shareToken = readClassroomShareToken(request, id);
    const access = await authorizeClassroomAccess({
      classroomId: id,
      shareToken,
      secureShareTransport: isSecureClassroomShareTransport(request),
    });
    if (!access.allowed) {
      return apiError(
        API_ERROR_CODES.INVALID_REQUEST,
        access.status,
        access.status === 401 ? 'Authentication required' : 'Classroom not found',
      );
    }

    const classroom = await readClassroom(id);
    if (!classroom) {
      return apiError(API_ERROR_CODES.INVALID_REQUEST, 404, 'Classroom not found');
    }

    const response = apiSuccess({ classroom });
    response.headers.set('Cache-Control', 'private, no-store');
    response.headers.set('Vary', 'Cookie, Authorization');
    response.headers.set('Referrer-Policy', 'no-referrer');
    if (access.reason === 'share' && shareToken && access.shareExpiresAt) {
      const maxAge = Math.max(
        0,
        Math.floor((new Date(access.shareExpiresAt).getTime() - Date.now()) / 1000),
      );
      response.cookies.set(classroomShareCookieName(id), shareToken, {
        httpOnly: true,
        sameSite: 'lax',
        // Classroom share grants only exist on HTTPS deployments and must not
        // inherit an operator override intended for the normal session cookie.
        secure: true,
        path: `/api/classroom-media/${id}/`,
        maxAge: Math.min(30 * 24 * 60 * 60, maxAge),
      });
    }
    return response;
  } catch (error) {
    log.error(
      `Classroom retrieval failed [id=${request.nextUrl.searchParams.get('id') ?? 'unknown'}]:`,
      error,
    );
    return apiError(
      API_ERROR_CODES.INTERNAL_ERROR,
      500,
      'Failed to retrieve classroom',
      error instanceof Error ? error.message : String(error),
    );
  }
}
