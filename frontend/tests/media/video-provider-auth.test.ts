import { describe, expect, it } from 'vitest';
import { videoProviderRequiresApiKey } from '@/lib/media/video-providers';

describe('video provider authentication policy', () => {
  it('allows the server-managed DeepSolve bridge without a fake API key', () => {
    expect(videoProviderRequiresApiKey('deep-solve')).toBe(false);
  });

  it('still requires credentials for commercial video providers', () => {
    expect(videoProviderRequiresApiKey('seedance')).toBe(true);
    expect(videoProviderRequiresApiKey('veo')).toBe(true);
  });
});
