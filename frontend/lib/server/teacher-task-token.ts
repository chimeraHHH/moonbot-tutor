import { createHmac, timingSafeEqual } from 'crypto';

const TOKEN_TTL_SECONDS = 12 * 60 * 60;
const TASK_ID_PATTERN = /^[A-Za-z0-9_.-]{1,128}$/;

interface TeacherTaskClaims {
  tid: string;
  uid: string;
  exp: number;
}

function getSecret(): string {
  const secret = process.env.SESSION_SECRET;
  if (!secret || secret.length < 32) {
    throw new Error('SESSION_SECRET must contain at least 32 characters');
  }
  return secret;
}

function sign(payload: string): string {
  return createHmac('sha256', getSecret())
    .update(`teacher-task.${payload}`)
    .digest('base64url');
}

export function createTeacherTaskToken(taskId: string, userId: string): string {
  if (!TASK_ID_PATTERN.test(taskId) || !userId) throw new Error('Invalid teacher task claims');
  const claims: TeacherTaskClaims = {
    tid: taskId,
    uid: userId,
    exp: Math.floor(Date.now() / 1000) + TOKEN_TTL_SECONDS,
  };
  const payload = Buffer.from(JSON.stringify(claims), 'utf8').toString('base64url');
  return `${payload}.${sign(payload)}`;
}

export function verifyTeacherTaskToken(
  token: string,
  expectedTaskId: string,
  expectedUserId: string,
): boolean {
  if (!token || token.length > 2048 || !TASK_ID_PATTERN.test(expectedTaskId) || !expectedUserId) {
    return false;
  }
  const segments = token.split('.');
  if (segments.length !== 2) return false;
  const [payload, signature] = segments;
  if (!payload || !signature) return false;

  const actual = Buffer.from(signature, 'base64url');
  const expected = Buffer.from(sign(payload), 'base64url');
  if (actual.length !== expected.length || !timingSafeEqual(actual, expected)) return false;

  try {
    const claims = JSON.parse(
      Buffer.from(payload, 'base64url').toString('utf8'),
    ) as TeacherTaskClaims;
    return (
      claims.tid === expectedTaskId &&
      claims.uid === expectedUserId &&
      Number.isSafeInteger(claims.exp) &&
      claims.exp * 1000 > Date.now()
    );
  } catch {
    return false;
  }
}
