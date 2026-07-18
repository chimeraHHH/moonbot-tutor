import { apiError, apiSuccess } from '@/lib/server/api-response';
import { isAuthEnabled } from '@/lib/server/auth';
import { isDatabaseConfigured, queryOne } from '@/lib/server/db';
import {
  getServerWebSearchProviders,
  getServerImageProviders,
  getServerVideoProviders,
  getServerTTSProviders,
} from '@/lib/server/provider-config';

const version = process.env.npm_package_version || '0.1.0';

export async function GET() {
  const databaseConfigured = isDatabaseConfigured();
  if (databaseConfigured) {
    try {
      await queryOne('SELECT 1 AS ready');
    } catch {
      return apiError('INTERNAL_ERROR', 503, 'Database is not ready');
    }
  }

  return apiSuccess({
    status: 'ok',
    version,
    auth: {
      enabled: isAuthEnabled(),
      databaseReady: databaseConfigured,
    },
    capabilities: {
      webSearch: Object.keys(getServerWebSearchProviders()).length > 0,
      imageGeneration: Object.keys(getServerImageProviders()).length > 0,
      videoGeneration: Object.keys(getServerVideoProviders()).length > 0,
      tts: Object.values(getServerTTSProviders()).some((info) => !info.disabled),
    },
  });
}
