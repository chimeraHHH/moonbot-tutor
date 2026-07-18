import { cookies } from 'next/headers';
import type { NextRequest } from 'next/server';
import { apiSuccess } from '@/lib/server/api-response';
import { getSessionCookieOptions } from '@/lib/server/auth';
import { revokeSession } from '@/lib/server/auth-store';
import { rejectCrossOriginRequest } from '@/lib/server/request-security';
import { SESSION_COOKIE_NAME, verifySessionToken } from '@/lib/server/session-token';

export async function POST(req: NextRequest) {
  const originError = rejectCrossOriginRequest(req);
  if (originError) return originError;

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

  const response = apiSuccess({ authenticated: false });
  response.headers.set('Cache-Control', 'no-store');
  response.headers.set('Clear-Site-Data', '"cache"');
  return response;
}
