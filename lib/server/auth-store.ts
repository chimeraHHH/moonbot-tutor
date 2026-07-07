import { randomUUID } from 'crypto';
import { query, queryOne } from '@/lib/server/db';
import { hashPassword } from '@/lib/server/password';
import type { AuthUser, UserRole, UserStatus } from '@/lib/server/auth-types';
import { normalizeEmail } from '@/lib/server/auth-types';
import { SESSION_MAX_AGE_SECONDS } from '@/lib/server/session-token';

interface UserRow {
  id: string;
  email: string;
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
    email: row.email,
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

export async function findUserByEmail(email: string): Promise<UserWithPassword | null> {
  const row = await queryOne<UserWithPasswordRow>(
    `SELECT id, email, password_hash, display_name, role, status, created_at, updated_at, last_login_at
       FROM users
      WHERE email = $1`,
    [normalizeEmail(email)],
  );
  return row ? mapUserWithPassword(row) : null;
}

export async function findUserById(userId: string): Promise<AuthUser | null> {
  const row = await queryOne<UserRow>(
    `SELECT id, email, display_name, role, status, created_at, updated_at, last_login_at
       FROM users
      WHERE id = $1`,
    [userId],
  );
  return row ? mapUser(row) : null;
}

export async function listUsers(): Promise<AuthUser[]> {
  const rows = await query<UserRow>(
    `SELECT id, email, display_name, role, status, created_at, updated_at, last_login_at
       FROM users
      ORDER BY created_at DESC`,
  );
  return rows.map(mapUser);
}

export async function createUser(input: {
  email: string;
  password: string;
  displayName: string;
  role: UserRole;
  status?: UserStatus;
}): Promise<AuthUser> {
  const passwordHash = await hashPassword(input.password);
  const row = await queryOne<UserRow>(
    `INSERT INTO users (id, email, password_hash, display_name, role, status)
     VALUES ($1, $2, $3, $4, $5, $6)
     RETURNING id, email, display_name, role, status, created_at, updated_at, last_login_at`,
    [
      randomUUID(),
      normalizeEmail(input.email),
      passwordHash,
      input.displayName.trim() || normalizeEmail(input.email),
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

  const row = await queryOne<UserRow>(
    `UPDATE users
        SET ${updates.join(', ')}
      WHERE id = $${params.length}
      RETURNING id, email, display_name, role, status, created_at, updated_at, last_login_at`,
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

  return { id, expiresAt };
}

export async function touchAndReadSession(input: {
  sessionId: string;
  userId: string;
}): Promise<AuthUser | null> {
  const row = await queryOne<{ id: string }>(
    `UPDATE sessions
        SET last_seen_at = now()
      WHERE id = $1
        AND user_id = $2
        AND revoked_at IS NULL
        AND expires_at > now()
      RETURNING id`,
    [input.sessionId, input.userId],
  );
  if (!row) return null;
  const user = await findUserById(input.userId);
  return user?.status === 'active' ? user : null;
}

export async function revokeSession(sessionId: string): Promise<void> {
  await query(`UPDATE sessions SET revoked_at = now() WHERE id = $1 AND revoked_at IS NULL`, [
    sessionId,
  ]);
}

export async function markUserLogin(userId: string): Promise<void> {
  await query(`UPDATE users SET last_login_at = now(), updated_at = now() WHERE id = $1`, [userId]);
}

export async function recordLoginAttempt(input: {
  email: string;
  success: boolean;
  failureReason?: string;
  ipAddress?: string | null;
  userAgent?: string | null;
}): Promise<void> {
  await query(
    `INSERT INTO login_attempts (email, success, failure_reason, ip_address, user_agent)
     VALUES ($1, $2, $3, $4, $5)`,
    [
      normalizeEmail(input.email),
      input.success,
      input.failureReason ?? null,
      input.ipAddress ?? null,
      input.userAgent ?? null,
    ],
  );
}

export async function countRecentFailedLoginAttempts(input: {
  email: string;
  ipAddress?: string | null;
}): Promise<number> {
  const row = await queryOne<{ count: string }>(
    `SELECT count(*)::text
       FROM login_attempts
      WHERE success = false
        AND created_at > now() - interval '15 minutes'
        AND (email = $1 OR ($2::text IS NOT NULL AND ip_address = $2))`,
    [normalizeEmail(input.email), input.ipAddress ?? null],
  );
  return Number(row?.count ?? 0);
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
