import { randomUUID } from 'crypto';
import { query, queryOne } from '@/lib/server/db';
import { hashPassword } from '@/lib/server/password';
import type { AuthUser, UserRole, UserStatus } from '@/lib/server/auth-types';
import { SESSION_IDLE_TIMEOUT_SECONDS, SESSION_MAX_AGE_SECONDS } from '@/lib/server/session-token';

interface UserRow {
  id: string;
  login_identifier: string;
  email: string | null;
  phone: string | null;
  display_name: string;
  role: UserRole;
  status: UserStatus;
  created_at: Date;
  updated_at: Date;
  last_login_at: Date | null;
}

interface UserWithPasswordRow extends UserRow {
  password_hash: string;
}

export interface UserWithPassword extends AuthUser {
  passwordHash: string;
}

function mapUser(row: UserRow): AuthUser {
  return {
    id: row.id,
    loginIdentifier: row.login_identifier,
    identifierType: row.email ? 'email' : 'phone',
    email: row.email,
    phone: row.phone,
    displayName: row.display_name,
    role: row.role,
    status: row.status,
    createdAt: row.created_at.toISOString(),
    updatedAt: row.updated_at.toISOString(),
    lastLoginAt: row.last_login_at?.toISOString() ?? null,
  };
}

function mapUserWithPassword(row: UserWithPasswordRow): UserWithPassword {
  return {
    ...mapUser(row),
    passwordHash: row.password_hash,
  };
}

export async function findUserByIdentifier(identifier: string): Promise<UserWithPassword | null> {
  const row = await queryOne<UserWithPasswordRow>(
    `SELECT id, login_identifier, email, phone, password_hash, display_name, role, status,
            created_at, updated_at, last_login_at
       FROM users
      WHERE login_identifier = $1`,
    [identifier],
  );
  return row ? mapUserWithPassword(row) : null;
}

export async function findUserById(userId: string): Promise<AuthUser | null> {
  const row = await queryOne<UserRow>(
    `SELECT id, login_identifier, email, phone, display_name, role, status,
            created_at, updated_at, last_login_at
       FROM users
      WHERE id = $1`,
    [userId],
  );
  return row ? mapUser(row) : null;
}

export async function listUsers(input?: { query?: string; limit?: number }): Promise<AuthUser[]> {
  const search = input?.query?.trim() || '';
  const limit = Math.min(Math.max(input?.limit ?? 100, 1), 200);
  const rows = await query<UserRow>(
    `SELECT id, login_identifier, email, phone, display_name, role, status,
            created_at, updated_at, last_login_at
       FROM users
      WHERE ($1 = '' OR login_identifier ILIKE '%' || $1 || '%' OR display_name ILIKE '%' || $1 || '%')
      ORDER BY created_at DESC
      LIMIT $2`,
    [search, limit],
  );
  return rows.map(mapUser);
}

export async function createUser(input: {
  identifier: string;
  email: string | null;
  phone: string | null;
  password: string;
  displayName: string;
  role: UserRole;
  status?: UserStatus;
}): Promise<AuthUser> {
  const passwordHash = await hashPassword(input.password);
  const row = await queryOne<UserRow>(
    `INSERT INTO users (
       id, login_identifier, email, phone, password_hash, display_name, role, status
     )
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
     RETURNING id, login_identifier, email, phone, display_name, role, status,
               created_at, updated_at, last_login_at`,
    [
      randomUUID(),
      input.identifier,
      input.email,
      input.phone,
      passwordHash,
      input.displayName,
      input.role,
      input.status ?? 'active',
    ],
  );
  if (!row) throw new Error('Failed to create user');
  return mapUser(row);
}

export async function updateUser(
  userId: string,
  patch: Partial<{
    displayName: string;
    role: UserRole;
    status: UserStatus;
    password: string;
    revokeSessions: boolean;
  }>,
): Promise<AuthUser> {
  const updates: string[] = [];
  const params: unknown[] = [];

  function setColumn(column: string, value: unknown) {
    params.push(value);
    updates.push(`${column} = $${params.length}`);
  }

  if (patch.displayName !== undefined) setColumn('display_name', patch.displayName.trim());
  if (patch.role !== undefined) setColumn('role', patch.role);
  if (patch.status !== undefined) setColumn('status', patch.status);
  if (patch.password) setColumn('password_hash', await hashPassword(patch.password));

  if (updates.length === 0) {
    const existing = await findUserById(userId);
    if (!existing) throw new Error('User not found');
    return existing;
  }

  setColumn('updated_at', new Date());
  params.push(userId);
  const userIdParam = params.length;
  params.push(patch.revokeSessions === true);
  const revokeSessionsParam = params.length;

  const row = await queryOne<UserRow>(
    `WITH updated_user AS (
       UPDATE users
          SET ${updates.join(', ')}
        WHERE id = $${userIdParam}
        RETURNING id, login_identifier, email, phone, display_name, role, status,
                  created_at, updated_at, last_login_at
     ), revoked_sessions AS (
       UPDATE sessions
          SET revoked_at = now()
        WHERE user_id = $${userIdParam}
          AND $${revokeSessionsParam}::boolean
          AND revoked_at IS NULL
          AND EXISTS (SELECT 1 FROM updated_user)
        RETURNING id
     )
     SELECT updated_user.*,
            (SELECT count(*) FROM revoked_sessions) AS revoked_session_count
       FROM updated_user`,
    params,
  );
  if (!row) throw new Error('User not found');
  return mapUser(row);
}

export async function createSession(input: {
  userId: string;
  ipAddress?: string | null;
  userAgent?: string | null;
}): Promise<{ id: string; expiresAt: Date }> {
  const id = randomUUID();
  const expiresAt = new Date(Date.now() + SESSION_MAX_AGE_SECONDS * 1000);

  await query(
    `INSERT INTO sessions (id, user_id, expires_at, ip_address, user_agent)
     VALUES ($1, $2, $3, $4, $5)`,
    [id, input.userId, expiresAt, input.ipAddress ?? null, input.userAgent ?? null],
  );

  await query(
    `UPDATE sessions
        SET revoked_at = now()
      WHERE user_id = $1
        AND revoked_at IS NULL
        AND id NOT IN (
          SELECT id
            FROM sessions
           WHERE user_id = $1 AND revoked_at IS NULL AND expires_at > now()
           ORDER BY created_at DESC
           LIMIT 10
        )`,
    [input.userId],
  );

  await query(
    `DELETE FROM sessions
      WHERE (expires_at < now() - interval '30 days')
         OR (revoked_at IS NOT NULL AND revoked_at < now() - interval '30 days')`,
  );

  return { id, expiresAt };
}

export async function touchAndReadSession(input: { sessionId: string }): Promise<AuthUser | null> {
  const row = await queryOne<UserRow>(
    `UPDATE sessions AS s
        SET last_seen_at = now()
       FROM users AS u
      WHERE s.id = $1
        AND s.user_id = u.id
        AND s.revoked_at IS NULL
        AND s.expires_at > now()
        AND s.last_seen_at > now() - ($2::int * interval '1 second')
        AND u.status = 'active'
      RETURNING u.id, u.login_identifier, u.email, u.phone, u.display_name, u.role,
                u.status, u.created_at, u.updated_at, u.last_login_at`,
    [input.sessionId, SESSION_IDLE_TIMEOUT_SECONDS],
  );
  return row ? mapUser(row) : null;
}

export async function revokeSession(sessionId: string): Promise<void> {
  await query(`UPDATE sessions SET revoked_at = now() WHERE id = $1 AND revoked_at IS NULL`, [
    sessionId,
  ]);
}

export async function revokeSessionsForUser(userId: string): Promise<void> {
  await query(`UPDATE sessions SET revoked_at = now() WHERE user_id = $1 AND revoked_at IS NULL`, [
    userId,
  ]);
}

export async function markUserLogin(userId: string): Promise<void> {
  await query(`UPDATE users SET last_login_at = now(), updated_at = now() WHERE id = $1`, [userId]);
}

export type AuthAttemptKind = 'login' | 'register';

export async function recordAuthAttempt(input: {
  kind: AuthAttemptKind;
  identifier: string;
  success: boolean;
  failureReason?: string;
  ipAddress?: string | null;
  userAgent?: string | null;
}): Promise<void> {
  await query(
    `INSERT INTO auth_attempts (kind, identifier, success, failure_reason, ip_address, user_agent)
     VALUES ($1, $2, $3, $4, $5, $6)`,
    [
      input.kind,
      input.identifier,
      input.success,
      input.failureReason ?? null,
      input.ipAddress ?? null,
      input.userAgent ?? null,
    ],
  );

  if (input.success) {
    await query(
      `DELETE FROM auth_attempts
        WHERE kind = $1 AND identifier = $2 AND success = false AND created_at > now() - interval '1 day'`,
      [input.kind, input.identifier],
    );
  }
}

export async function countRecentFailedAuthAttempts(input: {
  kind: AuthAttemptKind;
  identifier: string;
  ipAddress?: string | null;
}): Promise<{ matched: number; global: number }> {
  const row = await queryOne<{ matched: string; global: string }>(
    `SELECT
       count(*) FILTER (
         WHERE identifier = $2 OR ($3::text IS NOT NULL AND ip_address = $3)
       )::text AS matched,
       count(*)::text AS global
       FROM auth_attempts
      WHERE success = false
        AND kind = $1
        AND created_at > now() - interval '15 minutes'`,
    [input.kind, input.identifier, input.ipAddress ?? null],
  );
  return {
    matched: Number(row?.matched ?? 0),
    global: Number(row?.global ?? 0),
  };
}

export async function countRecentRegistrationAttempts(input: {
  ipAddress?: string | null;
}): Promise<{ fromIp: number; global: number }> {
  const row = await queryOne<{ from_ip: string; global: string }>(
    `SELECT
       count(*) FILTER (
         WHERE $1::text IS NOT NULL
           AND ip_address = $1
           AND created_at > now() - interval '15 minutes'
       )::text AS from_ip,
       count(*) FILTER (WHERE created_at > now() - interval '1 hour')::text AS global
     FROM auth_attempts
     WHERE kind = 'register'`,
    [input.ipAddress ?? null],
  );
  return {
    fromIp: Number(row?.from_ip ?? 0),
    global: Number(row?.global ?? 0),
  };
}

export async function writeAuditLog(input: {
  actorUserId?: string | null;
  action: string;
  targetType?: string | null;
  targetId?: string | null;
  metadata?: Record<string, unknown>;
  ipAddress?: string | null;
  userAgent?: string | null;
}): Promise<void> {
  await query(
    `INSERT INTO audit_logs (actor_user_id, action, target_type, target_id, metadata, ip_address, user_agent)
     VALUES ($1, $2, $3, $4, $5::jsonb, $6, $7)`,
    [
      input.actorUserId ?? null,
      input.action,
      input.targetType ?? null,
      input.targetId ?? null,
      JSON.stringify(input.metadata ?? {}),
      input.ipAddress ?? null,
      input.userAgent ?? null,
    ],
  );
}
