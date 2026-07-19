/**
 * Browser persistence partitioning.
 *
 * Authentication cookies are server-owned, while IndexedDB/localStorage are
 * shared by every account using the same browser profile. Every piece of
 * account data therefore has to be addressed through the active partition.
 * The old, unscoped keys and `MAIC-Database` are deliberately quarantined:
 * callers may import them only through an explicit, confirmed migration.
 */

export const LEGACY_DATABASE_NAME = 'MAIC-Database';

const STORAGE_PREFIX = 'sophos:account:v1';
const DATABASE_PREFIX = 'MAIC-Database:sophos:account:v1';
const GUEST_PARTITION = 'guest';

export const LEGACY_ACCOUNT_LOCAL_STORAGE_KEYS = [
  'user-profile-storage',
  'agent-registry-storage',
  'maic-agent-threads',
  'maic-agent-active-session',
  'requirementDraft',
  'pblChatDraft',
  'webSearchEnabled',
  'recentClassroomsOpen',
  'interactiveModeEnabled',
] as const;

const LEGACY_ACCOUNT_LOCAL_STORAGE_PREFIXES = [
  'quizDraft:',
  'quizAnswers:',
  'quizResults:',
] as const;

function isImportableLegacyLocalStorageKey(key: string): boolean {
  return (
    (LEGACY_ACCOUNT_LOCAL_STORAGE_KEYS as readonly string[]).includes(key) ||
    LEGACY_ACCOUNT_LOCAL_STORAGE_PREFIXES.some((prefix) => key.startsWith(prefix))
  );
}

export const LEGACY_ACCOUNT_SESSION_STORAGE_KEYS = [
  'generationSession',
  'generationParams',
] as const;

export type ClientStoragePartition = 'guest' | `user:${string}`;
export type ClientStoragePersistenceMode = 'account' | 'memory-only';

type ScopeListener = (
  partition: ClientStoragePartition,
  previousPartition: ClientStoragePartition,
) => void;

let activePartition: ClientStoragePartition = GUEST_PARTITION;
let persistenceMode: ClientStoragePersistenceMode = 'account';
let hasActivatedPartition = false;
const listeners = new Set<ScopeListener>();

/** Turn an authenticated user id into an opaque, collision-safe partition. */
export function partitionForUser(userId?: string | null): ClientStoragePartition {
  const normalized = userId?.trim();
  return normalized ? `user:${encodeURIComponent(normalized)}` : GUEST_PARTITION;
}

export function getClientStoragePartition(): ClientStoragePartition {
  return activePartition;
}

export function getClientStoragePersistenceMode(): ClientStoragePersistenceMode {
  return persistenceMode;
}

/** Shared/public classrooms use memory-only state and may never touch account caches. */
export function setClientStoragePersistenceMode(mode: ClientStoragePersistenceMode): void {
  persistenceMode = mode;
}

export function isClientStoragePersistenceEnabled(): boolean {
  return persistenceMode === 'account';
}

/**
 * Activate a partition before account-owned client components read storage.
 * Listeners reset in-memory Zustand state and rehydrate from the new account.
 */
export function activateClientStorageScope(userId?: string | null): ClientStoragePartition {
  const nextPartition = partitionForUser(userId);
  const previousPartition = activePartition;
  const shouldNotify = !hasActivatedPartition || nextPartition !== previousPartition;

  activePartition = nextPartition;
  hasActivatedPartition = true;

  if (shouldNotify) {
    for (const listener of listeners) listener(nextPartition, previousPartition);
  }

  return nextPartition;
}

export function subscribeClientStorageScope(
  listener: ScopeListener,
  options: { emitCurrent?: boolean } = {},
): () => void {
  listeners.add(listener);
  if (options.emitCurrent && hasActivatedPartition) {
    listener(activePartition, activePartition);
  }
  return () => listeners.delete(listener);
}

export function scopedStorageKey(
  key: string,
  partition: ClientStoragePartition = activePartition,
): string {
  return `${STORAGE_PREFIX}:${partition}:${key}`;
}

export function scopedDatabaseName(partition: ClientStoragePartition = activePartition): string {
  return `${DATABASE_PREFIX}:${partition}`;
}

function getLocalStorage(): Storage | undefined {
  if (typeof window === 'undefined') return undefined;
  try {
    return window.localStorage;
  } catch {
    return undefined;
  }
}

function getSessionStorage(): Storage | undefined {
  if (typeof window === 'undefined') return undefined;
  try {
    return window.sessionStorage;
  } catch {
    return undefined;
  }
}

function findLegacyEntries(
  storage: Storage | undefined,
  exactKeys: readonly string[],
  prefixes: readonly string[] = [],
): string[] {
  if (!storage) return [];
  const matches = new Set<string>();
  for (const key of exactKeys) {
    if (storage.getItem(key) !== null) matches.add(key);
  }
  for (let index = 0; index < storage.length; index += 1) {
    const key = storage.key(index);
    if (key && prefixes.some((prefix) => key.startsWith(prefix))) matches.add(key);
  }
  return [...matches].sort();
}

/** Enumerate only known account-owned legacy keys; theme and locale stay device-wide. */
export function findLegacyLocalStorageEntries(): string[] {
  return findLegacyEntries(
    getLocalStorage(),
    LEGACY_ACCOUNT_LOCAL_STORAGE_KEYS,
    LEGACY_ACCOUNT_LOCAL_STORAGE_PREFIXES,
  );
}

export function findLegacySessionStorageEntries(): string[] {
  return findLegacyEntries(getSessionStorage(), LEGACY_ACCOUNT_SESSION_STORAGE_KEYS);
}

/** Zustand-compatible storage adapter that resolves the active scope per call. */
export const scopedLocalStorage = {
  getItem(key: string): string | null {
    if (!isClientStoragePersistenceEnabled()) return null;
    return getLocalStorage()?.getItem(scopedStorageKey(key)) ?? null;
  },
  setItem(key: string, value: string): void {
    if (!isClientStoragePersistenceEnabled()) return;
    getLocalStorage()?.setItem(scopedStorageKey(key), value);
  },
  removeItem(key: string): void {
    if (!isClientStoragePersistenceEnabled()) return;
    getLocalStorage()?.removeItem(scopedStorageKey(key));
  },
};

/** Account-scoped tab storage for generation drafts and navigation hand-offs. */
export const scopedSessionStorage = {
  getItem(key: string): string | null {
    if (!isClientStoragePersistenceEnabled()) return null;
    return getSessionStorage()?.getItem(scopedStorageKey(key)) ?? null;
  },
  setItem(key: string, value: string): void {
    if (!isClientStoragePersistenceEnabled()) return;
    getSessionStorage()?.setItem(scopedStorageKey(key), value);
  },
  removeItem(key: string): void {
    if (!isClientStoragePersistenceEnabled()) return;
    getSessionStorage()?.removeItem(scopedStorageKey(key));
  },
};

function removePartitionEntries(storage: Storage | undefined): number {
  if (!storage) return 0;
  const prefix = `${STORAGE_PREFIX}:${activePartition}:`;
  const keys: string[] = [];
  for (let index = 0; index < storage.length; index += 1) {
    const key = storage.key(index);
    if (key?.startsWith(prefix)) keys.push(key);
  }
  for (const key of keys) storage.removeItem(key);
  return keys.length;
}

/** Remove only the active account's browser keys; device and other-user data survive. */
export function clearCurrentAccountBrowserStorage(): {
  localStorageEntries: number;
  sessionStorageEntries: number;
} {
  return {
    localStorageEntries: removePartitionEntries(getLocalStorage()),
    sessionStorageEntries: removePartitionEntries(getSessionStorage()),
  };
}

/**
 * Explicit opt-in bridge for old unowned localStorage entries.
 *
 * Nothing calls this automatically. A future import UI must show the user the
 * legacy keys and pass `confirmed: true`; existing account data is never
 * overwritten and legacy entries remain available until the user removes them.
 */
export function importLegacyLocalStorageEntries(
  keys: readonly string[],
  options: { confirmed: boolean },
): { imported: string[]; skipped: string[] } {
  if (!options.confirmed) throw new Error('Legacy storage import requires explicit confirmation');

  const storage = getLocalStorage();
  const imported: string[] = [];
  const skipped: string[] = [];
  if (!storage) return { imported, skipped: [...keys] };

  for (const key of keys) {
    if (!isImportableLegacyLocalStorageKey(key)) {
      skipped.push(key);
      continue;
    }
    try {
      const legacyValue = storage.getItem(key);
      const destination = scopedStorageKey(key);
      if (legacyValue === null || storage.getItem(destination) !== null) {
        skipped.push(key);
        continue;
      }
      storage.setItem(destination, legacyValue);
      imported.push(key);
    } catch {
      skipped.push(key);
    }
  }

  return { imported, skipped };
}

/** Explicit sessionStorage counterpart used by the same import confirmation. */
export function importLegacySessionStorageEntries(
  keys: readonly string[],
  options: { confirmed: boolean },
): { imported: string[]; skipped: string[] } {
  if (!options.confirmed) throw new Error('Legacy storage import requires explicit confirmation');

  const storage = getSessionStorage();
  const imported: string[] = [];
  const skipped: string[] = [];
  if (!storage) return { imported, skipped: [...keys] };

  for (const key of keys) {
    if (!(LEGACY_ACCOUNT_SESSION_STORAGE_KEYS as readonly string[]).includes(key)) {
      skipped.push(key);
      continue;
    }
    try {
      const legacyValue = storage.getItem(key);
      const destination = scopedStorageKey(key);
      if (legacyValue === null || storage.getItem(destination) !== null) {
        skipped.push(key);
        continue;
      }
      storage.setItem(destination, legacyValue);
      imported.push(key);
    } catch {
      skipped.push(key);
    }
  }

  return { imported, skipped };
}
