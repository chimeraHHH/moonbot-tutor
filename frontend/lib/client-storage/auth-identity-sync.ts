/** Cross-tab session identity invalidation. */

export const AUTH_IDENTITY_EPOCH_KEY = 'sophos:auth-identity-epoch:v1';
const AUTH_IDENTITY_CHANNEL = 'sophos:auth-identity:v1';

interface AuthIdentityMessage {
  sourceId: string;
  epoch: string;
}

const sourceId =
  typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
    ? crypto.randomUUID()
    : `tab-${Date.now()}-${Math.random().toString(36).slice(2)}`;

function isAuthIdentityMessage(value: unknown): value is AuthIdentityMessage {
  if (!value || typeof value !== 'object') return false;
  const message = value as Partial<AuthIdentityMessage>;
  return typeof message.sourceId === 'string' && typeof message.epoch === 'string';
}

/**
 * Notify every other tab after login, registration or logout succeeds and
 * before this tab navigates. The epoch key is deliberately device-wide: tabs
 * may currently be mounted under different account partitions.
 */
export function broadcastAuthIdentityChange(): string {
  const epoch = `${Date.now()}:${Math.random().toString(36).slice(2)}`;
  if (typeof window === 'undefined') return epoch;

  try {
    window.localStorage.setItem(AUTH_IDENTITY_EPOCH_KEY, epoch);
  } catch {
    // BroadcastChannel may still be available when localStorage is blocked.
  }

  if (typeof BroadcastChannel !== 'undefined') {
    try {
      const channel = new BroadcastChannel(AUTH_IDENTITY_CHANNEL);
      channel.postMessage({ sourceId, epoch } satisfies AuthIdentityMessage);
      channel.close();
    } catch {
      // The storage event remains the fallback.
    }
  }

  return epoch;
}

/** Subscribe to identity changes originating in another tab. */
export function subscribeAuthIdentityChanges(listener: () => void): () => void {
  if (typeof window === 'undefined') return () => {};

  const onStorage = (event: StorageEvent) => {
    if (event.key === AUTH_IDENTITY_EPOCH_KEY && event.newValue) listener();
  };
  window.addEventListener('storage', onStorage);

  let channel: BroadcastChannel | undefined;
  if (typeof BroadcastChannel !== 'undefined') {
    try {
      channel = new BroadcastChannel(AUTH_IDENTITY_CHANNEL);
      channel.addEventListener('message', (event: MessageEvent<unknown>) => {
        if (isAuthIdentityMessage(event.data) && event.data.sourceId !== sourceId) listener();
      });
    } catch {
      channel = undefined;
    }
  }

  return () => {
    window.removeEventListener('storage', onStorage);
    channel?.close();
  };
}
