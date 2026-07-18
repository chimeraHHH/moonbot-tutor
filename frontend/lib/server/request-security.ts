import type { NextRequest, NextResponse } from 'next/server';
import { apiError } from '@/lib/server/api-response';

type JsonBodyResult<T> = { ok: true; value: T } | { ok: false; response: NextResponse };

export function rejectCrossOriginRequest(req: NextRequest) {
  const origin = req.headers.get('origin');
  if (!origin) return null;

  let expectedOrigin = req.nextUrl.origin;
  const configuredOrigin = process.env.AUTH_PUBLIC_URL;
  if (configuredOrigin) {
    try {
      expectedOrigin = new URL(configuredOrigin).origin;
    } catch {
      return apiError('INTERNAL_ERROR', 500, 'AUTH_PUBLIC_URL is invalid');
    }
  }

  if (origin !== expectedOrigin) {
    return apiError('INVALID_REQUEST', 403, 'Cross-origin request rejected');
  }
  return null;
}

export async function readJsonBody<T>(
  req: NextRequest,
  maxBytes = 8 * 1024,
): Promise<JsonBodyResult<T>> {
  const contentEncoding = req.headers.get('content-encoding');
  if (contentEncoding && contentEncoding.toLowerCase() !== 'identity') {
    return {
      ok: false,
      response: apiError('INVALID_REQUEST', 415, 'Compressed request bodies are not supported'),
    };
  }

  const contentLength = req.headers.get('content-length');
  if (contentLength) {
    const advertisedBytes = Number(contentLength);
    if (!Number.isSafeInteger(advertisedBytes) || advertisedBytes < 0) {
      return {
        ok: false,
        response: apiError('INVALID_REQUEST', 400, 'Invalid Content-Length header'),
      };
    }
    if (advertisedBytes > maxBytes) {
      return {
        ok: false,
        response: apiError('INVALID_REQUEST', 413, 'Request body is too large'),
      };
    }
  }

  if (!req.body) {
    return { ok: false, response: apiError('INVALID_REQUEST', 400, 'Invalid JSON body') };
  }

  const reader = req.body.getReader();
  const decoder = new TextDecoder();
  let totalBytes = 0;
  let text = '';

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      totalBytes += value.byteLength;
      if (totalBytes > maxBytes) {
        await reader.cancel();
        return {
          ok: false,
          response: apiError('INVALID_REQUEST', 413, 'Request body is too large'),
        };
      }
      text += decoder.decode(value, { stream: true });
    }
    text += decoder.decode();
    return { ok: true, value: JSON.parse(text) as T };
  } catch {
    return { ok: false, response: apiError('INVALID_REQUEST', 400, 'Invalid JSON body') };
  } finally {
    reader.releaseLock();
  }
}

export function getRequestMeta(req: NextRequest) {
  const forwardedFor = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim();
  const ipAddress = (forwardedFor || req.headers.get('x-real-ip') || '').slice(0, 64) || null;
  const userAgent = req.headers.get('user-agent')?.slice(0, 512) || null;
  return { ipAddress, userAgent };
}
