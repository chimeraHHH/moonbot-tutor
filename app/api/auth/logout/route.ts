import { cookies } from 'next/headers';
import { apiSuccess } from '@/lib/server/api-response';
import { getSessionCookieOptions } from '@/lib/server/auth';
import { revokeSession } from '@/lib/server/auth-store';
import { SESSION_COOKIE_NAME, verifySessionToken } from '@/lib/server/session-token';

export async function POST() {
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE_NAME)?.value;
  const claims = token ? verifySessionToken(token) : null;
  if (claims) {
    await revokeSession(claims.sid);
  }

  cookieStore.set(SESSION_COOKIE_NAME, '', {
    ...getSessionCookieOptions(),
    maxAge: 0,
  });

  return apiSuccess({ authenticated: false });
}
