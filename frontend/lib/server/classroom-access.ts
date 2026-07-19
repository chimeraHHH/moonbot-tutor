import { createHash, randomBytes, randomUUID, timingSafeEqual } from 'crypto';
import type { NextRequest } from 'next/server';
import { getCurrentUser, isAuthEnabled } from '@/lib/server/auth';
import type { AuthUser } from '@/lib/server/auth-types';
import { query, queryOne } from '@/lib/server/db';

const SHARE_ID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const SHARE_SECRET_PATTERN = /^[A-Za-z0-9_-]{43}$/;
const EMPTY_TOKEN_HASH = Buffer.alloc(32);

export function getSecureClassroomShareOrigin(): string | null {
  const configuredUrl =
    process.env.AUTH_PUBLIC_URL ||
    process.env.NEXT_PUBLIC_APP_URL ||
    process.env.APP_URL ||
    process.env.SITE_URL;
  if (!configuredUrl) return null;
  try {
    const url = new URL(configuredUrl);
    return url.protocol === 'https:' ? url.origin : null;
  } catch {
    return null;
  }
}

export function isSecureClassroomShareTransport(req: NextRequest): boolean {
  if (!getSecureClassroomShareOrigin()) return false;
  const forwardedProtocol = req.headers
    .get('x-forwarded-proto')
    ?.split(',')[0]
    ?.trim()
    .toLowerCase();
  return req.nextUrl.protocol === 'https:' || forwardedProtocol === 'https';
}

interface ClassroomRecord {
  id: string;
  ownerUserId: string | null;
}

interface ClassroomShareRecord {
  id: string;
  classroomId: string;
  tokenHash: string;
  expiresAt: Date | string;
  revokedAt: Date | string | null;
}

export type ClassroomAccessReason = 'local-development' | 'owner' | 'admin' | 'share';

export type ClassroomAccessResult =
  | {
      allowed: true;
      reason: ClassroomAccessReason;
      user: AuthUser | null;
      shareExpiresAt?: string;
    }
  | { allowed: false; status: 401 | 404; user: AuthUser | null };

export interface ClassroomShareSummary {
  id: string;
  expiresAt: string;
  revokedAt: string | null;
  createdAt: string;
}

function parseShareToken(token: string): { shareId: string } | null {
  if (!token || token.length > 128) return null;
  const separator = token.indexOf('.');
  if (separator < 0 || separator !== token.lastIndexOf('.')) return null;
  const shareId = token.slice(0, separator);
  const secret = token.slice(separator + 1);
  if (!SHARE_ID_PATTERN.test(shareId) || !SHARE_SECRET_PATTERN.test(secret)) return null;
  return { shareId };
}

/** Hash the complete bearer token. The raw token is returned once and is never persisted. */
export function hashClassroomShareToken(token: string): string {
  return createHash('sha256').update(`classroom-share.${token}`).digest('hex');
}

function tokenHashMatches(storedHash: string | undefined, presentedHash: string): boolean {
  let expected = EMPTY_TOKEN_HASH;
  if (storedHash && /^[a-f0-9]{64}$/.test(storedHash)) {
    expected = Buffer.from(storedHash, 'hex');
  }
  const actual = Buffer.from(presentedHash, 'hex');
  return timingSafeEqual(expected, actual);
}

/**
 * Share tokens may be supplied as `?shareToken=...` (required by media elements)
 * or as a standard Bearer token. Query wins only when it is the sole token source;
 * conflicting credentials are rejected rather than guessed.
 */
export function classroomShareCookieName(classroomId: string): string {
  return `sophos_classroom_share_${classroomId}`;
}

export function readClassroomShareToken(
  req: NextRequest,
  classroomId?: string,
): string | undefined {
  const queryToken = req.nextUrl.searchParams.get('shareToken')?.trim() || undefined;
  const authorization = req.headers.get('authorization')?.trim();
  const bearerMatch = authorization?.match(/^Bearer\s+([^\s]+)$/i);
  const bearerToken = bearerMatch?.[1];
  if (queryToken && bearerToken && queryToken !== bearerToken) return undefined;
  if (queryToken || bearerToken) return queryToken || bearerToken;
  return classroomId ? req.cookies.get(classroomShareCookieName(classroomId))?.value : undefined;
}

async function verifyClassroomShareToken(
  classroomId: string,
  token: string,
): Promise<string | null> {
  const parsed = parseShareToken(token);
  if (!parsed) return null;

  const presentedHash = hashClassroomShareToken(token);
  const share = await queryOne<ClassroomShareRecord>(
    `SELECT id,
            classroom_id AS "classroomId",
            token_hash AS "tokenHash",
            expires_at AS "expiresAt",
            revoked_at AS "revokedAt"
       FROM classroom_shares
      WHERE id = $1`,
    [parsed.shareId],
  );

  // Always perform a fixed-length comparison, including for unknown share ids.
  const hashMatches = tokenHashMatches(share?.tokenHash, presentedHash);
  if (!share || !hashMatches) return null;
  if (share.classroomId !== classroomId || share.revokedAt) return null;
  const expiresAt = new Date(share.expiresAt);
  return expiresAt.getTime() > Date.now() ? expiresAt.toISOString() : null;
}

/**
 * Central authorization policy for classroom JSON and every classroom artifact.
 * Authenticated deployments fail closed for missing ownership metadata. Admins may
 * recover legacy ownerless records; normal users need ownership or an active share.
 */
export async function authorizeClassroomAccess(input: {
  classroomId: string;
  shareToken?: string;
  secureShareTransport?: boolean;
  ownerOnly?: boolean;
}): Promise<ClassroomAccessResult> {
  if (!isAuthEnabled()) {
    return { allowed: true, reason: 'local-development', user: null };
  }

  const user = await getCurrentUser();
  const classroom = await queryOne<ClassroomRecord>(
    `SELECT id, owner_user_id AS "ownerUserId"
       FROM classrooms
      WHERE id = $1`,
    [input.classroomId],
  );

  if (!classroom) return { allowed: false, status: 404, user };
  if (user?.role === 'admin') return { allowed: true, reason: 'admin', user };
  if (user && classroom.ownerUserId === user.id) {
    return { allowed: true, reason: 'owner', user };
  }

  // Bearer shares are never accepted on a deployment whose authoritative
  // public URL is not HTTPS. This keeps an HTTP-only deployment functional for
  // owners while refusing to expose reusable share secrets in plaintext.
  if (
    !input.ownerOnly &&
    input.shareToken &&
    input.secureShareTransport &&
    getSecureClassroomShareOrigin()
  ) {
    const shareExpiresAt = await verifyClassroomShareToken(input.classroomId, input.shareToken);
    if (shareExpiresAt) {
      return { allowed: true, reason: 'share', user, shareExpiresAt };
    }
  }

  // Authenticated cross-owner and all bad/cross-resource share tokens are hidden.
  return { allowed: false, status: user || input.shareToken ? 404 : 401, user };
}

export async function createClassroomShare(input: {
  classroomId: string;
  createdByUserId: string;
  expiresAt: Date;
}): Promise<{ id: string; token: string; expiresAt: string }> {
  const id = randomUUID();
  const token = `${id}.${randomBytes(32).toString('base64url')}`;
  const tokenHash = hashClassroomShareToken(token);
  const row = await queryOne<{ id: string; expiresAt: Date | string }>(
    `INSERT INTO classroom_shares (
       id, classroom_id, created_by_user_id, token_hash, expires_at
     ) VALUES ($1, $2, $3, $4, $5)
     RETURNING id, expires_at AS "expiresAt"`,
    [id, input.classroomId, input.createdByUserId, tokenHash, input.expiresAt],
  );
  if (!row) throw new Error('Failed to create classroom share');
  return { id: row.id, token, expiresAt: new Date(row.expiresAt).toISOString() };
}

export async function listClassroomShares(classroomId: string): Promise<ClassroomShareSummary[]> {
  const rows = await query<{
    id: string;
    expiresAt: Date | string;
    revokedAt: Date | string | null;
    createdAt: Date | string;
  }>(
    `SELECT id,
            expires_at AS "expiresAt",
            revoked_at AS "revokedAt",
            created_at AS "createdAt"
       FROM classroom_shares
      WHERE classroom_id = $1
      ORDER BY created_at DESC`,
    [classroomId],
  );
  return rows.map((row) => ({
    id: row.id,
    expiresAt: new Date(row.expiresAt).toISOString(),
    revokedAt: row.revokedAt ? new Date(row.revokedAt).toISOString() : null,
    createdAt: new Date(row.createdAt).toISOString(),
  }));
}

export async function revokeClassroomShare(input: {
  shareId: string;
  classroomId: string;
}): Promise<boolean> {
  const row = await queryOne<{ id: string }>(
    `UPDATE classroom_shares
        SET revoked_at = COALESCE(revoked_at, now())
      WHERE id = $1 AND classroom_id = $2
      RETURNING id`,
    [input.shareId, input.classroomId],
  );
  return Boolean(row);
}

export function isValidClassroomShareId(value: string): boolean {
  return SHARE_ID_PATTERN.test(value);
}
