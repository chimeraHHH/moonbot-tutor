'use client';

import { useEffect, type ReactNode } from 'react';
import { activateClientStorageScope, partitionForUser } from '@/lib/client-storage/scope';
import { subscribeAuthIdentityChanges } from '@/lib/client-storage/auth-identity-sync';

/**
 * Installs the server-authenticated user partition before descendants render.
 * Persist stores opt out of eager hydration, so no guest/previous-account
 * value can enter their in-memory state before this boundary is established.
 */
export function ClientStorageScope({ userId, children }: { userId?: string; children: ReactNode }) {
  if (typeof window !== 'undefined') {
    activateClientStorageScope(userId);
  } else {
    // Keep SSR deterministic without mutating module-global state shared by
    // concurrent requests. `partitionForUser` also validates the input shape.
    void partitionForUser(userId);
  }

  useEffect(
    () =>
      subscribeAuthIdentityChanges(() => {
        window.location.reload();
      }),
    [],
  );

  return children;
}
