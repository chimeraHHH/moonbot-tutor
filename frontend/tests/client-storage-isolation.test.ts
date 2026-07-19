import { readFileSync } from 'node:fs';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  activateClientStorageScope,
  clearCurrentAccountBrowserStorage,
  findLegacyLocalStorageEntries,
  findLegacySessionStorageEntries,
  importLegacyLocalStorageEntries,
  importLegacySessionStorageEntries,
  LEGACY_DATABASE_NAME,
  partitionForUser,
  scopedDatabaseName,
  scopedLocalStorage,
  scopedSessionStorage,
  scopedStorageKey,
  setClientStoragePersistenceMode,
} from '@/lib/client-storage/scope';
import { loadAssets, saveAsset } from '@/lib/teacher/history';
import {
  databaseSummaryHasRecords,
  db,
  getActiveDatabaseName,
  getClientDatabaseDiagnostics,
} from '@/lib/utils/database';
import { canOfferUnownedLegacyImport } from '@/lib/server/legacy-import-policy';

class MemoryStorage implements Storage {
  private readonly values = new Map<string, string>();

  get length(): number {
    return this.values.size;
  }

  clear(): void {
    this.values.clear();
  }

  getItem(key: string): string | null {
    return this.values.get(key) ?? null;
  }

  key(index: number): string | null {
    return [...this.values.keys()][index] ?? null;
  }

  removeItem(key: string): void {
    this.values.delete(key);
  }

  setItem(key: string, value: string): void {
    this.values.set(key, value);
  }
}

let local: MemoryStorage;
let session: MemoryStorage;

beforeEach(() => {
  local = new MemoryStorage();
  session = new MemoryStorage();
  vi.stubGlobal('localStorage', local);
  vi.stubGlobal('sessionStorage', session);
  vi.stubGlobal('CustomEvent', class CustomEventStub {});
  vi.stubGlobal('window', {
    localStorage: local,
    sessionStorage: session,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(),
  });
  setClientStoragePersistenceMode('account');
  activateClientStorageScope(null);
});

describe('client storage partitions', () => {
  it('maps guest and authenticated users to distinct stable keys and databases', () => {
    const guest = partitionForUser(null);
    const userA = partitionForUser('user/a');
    const userB = partitionForUser('user/b');

    expect(guest).toBe('guest');
    expect(userA).toBe('user:user%2Fa');
    expect(userA).not.toBe(userB);
    expect(scopedStorageKey('settings-storage', userA)).not.toBe(
      scopedStorageKey('settings-storage', userB),
    );
    expect(scopedDatabaseName(userA)).not.toBe(scopedDatabaseName(userB));
    expect(scopedDatabaseName(guest)).not.toBe(LEGACY_DATABASE_NAME);
  });

  it('isolates localStorage and sessionStorage when accounts switch', () => {
    activateClientStorageScope('user-a');
    scopedLocalStorage.setItem('requirementDraft', 'A draft');
    scopedSessionStorage.setItem('generationSession', 'A session');

    activateClientStorageScope('user-b');
    expect(scopedLocalStorage.getItem('requirementDraft')).toBeNull();
    expect(scopedSessionStorage.getItem('generationSession')).toBeNull();
    scopedLocalStorage.setItem('requirementDraft', 'B draft');
    scopedSessionStorage.setItem('generationSession', 'B session');

    activateClientStorageScope('user-a');
    expect(scopedLocalStorage.getItem('requirementDraft')).toBe('A draft');
    expect(scopedSessionStorage.getItem('generationSession')).toBe('A session');
    expect(local.getItem('requirementDraft')).toBeNull();
    expect(session.getItem('generationSession')).toBeNull();
  });

  it('uses a safe no-op browser and Dexie facade in memory-only share mode', async () => {
    activateClientStorageScope('share-viewer');
    scopedLocalStorage.setItem('quizResults:scene-1', 'private-result');
    const accountDatabaseName = db.name;

    setClientStoragePersistenceMode('memory-only');
    expect(scopedLocalStorage.getItem('quizResults:scene-1')).toBeNull();
    scopedLocalStorage.setItem('quizResults:scene-2', 'shared-result');
    scopedSessionStorage.setItem('generationSession', 'shared-session');
    expect(db.name).toBe('MAIC-Memory-Only');
    await expect(db.stages.toArray()).resolves.toEqual([]);
    await expect(db.audioFiles.get('shared-audio')).resolves.toBeUndefined();
    await expect(
      db.generatedAgents.where('stageId').equals('shared-stage').delete(),
    ).resolves.toBeUndefined();
    let transactionRan = false;
    await db.transaction('rw', db.stages, async () => {
      transactionRan = true;
      await db.stages.clear();
    });
    expect(transactionRan).toBe(true);
    expect(local.getItem(scopedStorageKey('quizResults:scene-2'))).toBeNull();
    expect(session.getItem(scopedStorageKey('generationSession'))).toBeNull();

    setClientStoragePersistenceMode('account');
    expect(db.name).toBe(accountDatabaseName);
    expect(scopedLocalStorage.getItem('quizResults:scene-1')).toBe('private-result');
    expect(scopedLocalStorage.getItem('quizResults:scene-2')).toBeNull();
  });

  it('clears only the active account partition', () => {
    local.setItem('theme', 'dark');
    local.setItem('sophos:auth-identity-epoch:v1', 'epoch');
    activateClientStorageScope('clear-a');
    scopedLocalStorage.setItem('settings-storage', 'A');
    scopedSessionStorage.setItem('generationSession', 'A-session');
    activateClientStorageScope('clear-b');
    scopedLocalStorage.setItem('settings-storage', 'B');
    scopedSessionStorage.setItem('generationSession', 'B-session');

    const removed = clearCurrentAccountBrowserStorage();
    expect(removed).toEqual({ localStorageEntries: 1, sessionStorageEntries: 1 });
    expect(scopedLocalStorage.getItem('settings-storage')).toBeNull();
    expect(local.getItem('theme')).toBe('dark');
    expect(local.getItem('sophos:auth-identity-epoch:v1')).toBe('epoch');

    activateClientStorageScope('clear-a');
    expect(scopedLocalStorage.getItem('settings-storage')).toBe('A');
    expect(scopedSessionStorage.getItem('generationSession')).toBe('A-session');

    const settings = readFileSync(
      new URL('../components/settings/general-settings.tsx', import.meta.url),
      'utf8',
    );
    expect(settings).toContain('clearCurrentAccountBrowserStorage()');
    expect(settings).not.toContain('localStorage.clear()');
    expect(settings).not.toContain('sessionStorage.clear()');
  });

  it('keeps teacher task history private to the active account', () => {
    activateClientStorageScope('teacher-a');
    saveAsset({
      id: 'asset-a',
      type: 'manim-video',
      title: 'A private task',
      status: 'running',
      createdAt: 1,
      updatedAt: 1,
      ref: { taskId: 'task-a', taskAccessToken: 'secret-a' },
    });
    expect(loadAssets().map((asset) => asset.id)).toEqual(['asset-a']);

    activateClientStorageScope('teacher-b');
    expect(loadAssets()).toEqual([]);
    saveAsset({
      id: 'asset-b',
      type: 'classroom-ppt',
      title: 'B private task',
      status: 'ready',
      createdAt: 2,
      updatedAt: 2,
      ref: { classroomId: 'classroom-b' },
    });

    activateClientStorageScope('teacher-a');
    expect(loadAssets().map((asset) => asset.id)).toEqual(['asset-a']);
  });

  it('never imports unowned legacy keys without confirmation or overwrites account data', () => {
    local.setItem('user-profile-storage', 'legacy-profile');
    activateClientStorageScope('user-a');

    expect(() =>
      importLegacyLocalStorageEntries(['user-profile-storage'], { confirmed: false }),
    ).toThrow('explicit confirmation');
    expect(scopedLocalStorage.getItem('user-profile-storage')).toBeNull();

    expect(importLegacyLocalStorageEntries(['user-profile-storage'], { confirmed: true })).toEqual({
      imported: ['user-profile-storage'],
      skipped: [],
    });
    expect(scopedLocalStorage.getItem('user-profile-storage')).toBe('legacy-profile');
    expect(local.getItem('user-profile-storage')).toBe('legacy-profile');

    scopedLocalStorage.setItem('user-profile-storage', 'account-profile');
    expect(importLegacyLocalStorageEntries(['user-profile-storage'], { confirmed: true })).toEqual({
      imported: [],
      skipped: ['user-profile-storage'],
    });
    expect(scopedLocalStorage.getItem('user-profile-storage')).toBe('account-profile');
  });

  it('refuses to import credential-bearing legacy settings and teacher task assets', () => {
    local.setItem('settings-storage', '{"apiKey":"legacy-secret"}');
    local.setItem('sophos:teacher:assets:v1', '{"taskAccessToken":"legacy-task-token"}');
    activateClientStorageScope('admin-recovery');

    expect(
      importLegacyLocalStorageEntries(['settings-storage', 'sophos:teacher:assets:v1'], {
        confirmed: true,
      }),
    ).toEqual({
      imported: [],
      skipped: ['settings-storage', 'sophos:teacher:assets:v1'],
    });
    expect(scopedLocalStorage.getItem('settings-storage')).toBeNull();
    expect(scopedLocalStorage.getItem('sophos:teacher:assets:v1')).toBeNull();
  });

  it('detects only account-owned legacy entries and keeps device preferences shared', () => {
    local.setItem('theme', 'dark');
    local.setItem('locale', 'zh-CN');
    local.setItem('settings-storage', '{"apiKey":"legacy-secret"}');
    local.setItem('sophos:teacher:assets:v1', '{"taskAccessToken":"legacy-token"}');
    local.setItem('user-profile-storage', 'legacy-profile');
    local.setItem('quizResults:scene-1', '[]');
    local.setItem(scopedStorageKey('settings-storage', partitionForUser('other-user')), 'scoped');
    session.setItem('generationSession', 'legacy-session');

    expect(findLegacyLocalStorageEntries()).toEqual([
      'quizResults:scene-1',
      'user-profile-storage',
    ]);
    expect(findLegacySessionStorageEntries()).toEqual(['generationSession']);
    expect(findLegacyLocalStorageEntries()).not.toContain('theme');
    expect(findLegacyLocalStorageEntries()).not.toContain('locale');
    expect(findLegacyLocalStorageEntries()).not.toContain('settings-storage');
    expect(findLegacyLocalStorageEntries()).not.toContain('sophos:teacher:assets:v1');

    activateClientStorageScope('import-user');
    expect(importLegacySessionStorageEntries(['generationSession'], { confirmed: true })).toEqual({
      imported: ['generationSession'],
      skipped: [],
    });
    expect(scopedSessionStorage.getItem('generationSession')).toBe('legacy-session');
  });

  it('resolves Dexie lazily and evicts the previous account instance on switch', () => {
    activateClientStorageScope('dexie-a');
    expect(db.name).toBe(getActiveDatabaseName());
    const databaseA = getActiveDatabaseName();
    expect(getClientDatabaseDiagnostics().residentNames).toContain(databaseA);

    activateClientStorageScope('dexie-b');
    expect(getClientDatabaseDiagnostics().residentNames).not.toContain(databaseA);
    expect(db.name).toBe(getActiveDatabaseName());
    expect(getActiveDatabaseName()).not.toBe(databaseA);
  });
});

describe('legacy import prompt policy', () => {
  it('detects whether a database contains records before allowing a merge', () => {
    expect(databaseSummaryHasRecords({ exists: true, recordsByTable: { stages: 1 } })).toBe(true);
    expect(databaseSummaryHasRecords({ exists: true, recordsByTable: { stages: 0 } })).toBe(false);
  });

  it('is hidden by default and available only to an admin with the explicit server flag', () => {
    expect(canOfferUnownedLegacyImport({ featureFlag: undefined, userRole: 'admin' })).toBe(false);
    expect(canOfferUnownedLegacyImport({ featureFlag: 'false', userRole: 'admin' })).toBe(false);
    expect(canOfferUnownedLegacyImport({ featureFlag: 'true', userRole: 'student' })).toBe(false);
    expect(canOfferUnownedLegacyImport({ featureFlag: 'true', userRole: undefined })).toBe(false);
    expect(canOfferUnownedLegacyImport({ featureFlag: 'true', userRole: 'admin' })).toBe(true);
  });

  it('gates the prompt server-side, suppresses public shares and requires confirmation', () => {
    const rootLayout = readFileSync(new URL('../app/layout.tsx', import.meta.url), 'utf8');
    const prompt = readFileSync(
      new URL('../components/workspace/legacy-data-import-prompt.tsx', import.meta.url),
      'utf8',
    );

    expect(rootLayout).toContain('process.env.ALLOW_UNOWNED_LEGACY_IMPORT');
    expect(rootLayout).toContain('{allowUnownedLegacyImport && <LegacyDataImportPrompt />}');
    expect(prompt).toContain("params.has('shareToken')");
    expect(prompt).toContain('只有你明确确认后');
    expect(prompt).toContain('disabled={importing || discovery.databaseBlocked}');
    expect(prompt).toContain('importLegacyDatabase({ confirmed: true })');
    expect(prompt).toContain('window.location.reload()');
  });

  it('keeps the recovery flag disabled in deployment manifests', () => {
    const deploymentFiles = [
      '../../.github/workflows/ci-cd.yml',
      '../../docker-compose.yml',
      '../Dockerfile',
      '../../services/code2video/Dockerfile',
    ];

    for (const relativePath of deploymentFiles) {
      const contents = readFileSync(new URL(relativePath, import.meta.url), 'utf8');
      expect(contents).not.toContain('ALLOW_UNOWNED_LEGACY_IMPORT');
    }
  });
});

describe('shared classroom client isolation', () => {
  it('uses memory-only storage, skips account caches and resets share-derived stores', () => {
    const classroom = readFileSync(
      new URL('../app/classroom/[id]/page.tsx', import.meta.url),
      'utf8',
    );
    const stage = readFileSync(new URL('../lib/store/stage.ts', import.meta.url), 'utf8');

    expect(classroom).toContain(
      "setClientStoragePersistenceMode(isSharedClassroom ? 'memory-only'",
    );
    expect(classroom).toContain('if (!isSharedClassroom) {');
    expect(classroom).toContain('restoreFromDB(classroomId)');
    expect(classroom).toContain('{ persist: !isSharedClassroom }');
    expect(classroom).toContain('readOnly={isSharedClassroom}');
    expect(classroom).toContain('resetAndRehydrateSettingsStore()');
    expect(classroom).toContain('resetAndRehydrateAgentRegistry()');
    expect(stage).toContain("if (persistenceMode !== 'account') return false");
  });
});

describe('cross-tab auth identity invalidation', () => {
  it('broadcasts an epoch, ignores the source tab and reloads peer notifications', async () => {
    type MessageListener = (event: { data: unknown }) => void;
    class FakeBroadcastChannel {
      static instances = new Set<FakeBroadcastChannel>();
      private readonly listeners = new Set<MessageListener>();

      constructor(_name: string) {
        FakeBroadcastChannel.instances.add(this);
      }

      addEventListener(_type: string, listener: MessageListener): void {
        this.listeners.add(listener);
      }

      postMessage(data: unknown): void {
        for (const instance of FakeBroadcastChannel.instances) {
          if (instance !== this) {
            for (const listener of instance.listeners) listener({ data });
          }
        }
      }

      close(): void {
        FakeBroadcastChannel.instances.delete(this);
      }
    }

    let storageListener: ((event: { key: string; newValue: string }) => void) | undefined;
    vi.stubGlobal('BroadcastChannel', FakeBroadcastChannel);
    vi.stubGlobal('window', {
      localStorage: local,
      sessionStorage: session,
      addEventListener: (type: string, listener: typeof storageListener) => {
        if (type === 'storage') storageListener = listener;
      },
      removeEventListener: vi.fn(),
    });

    const { AUTH_IDENTITY_EPOCH_KEY, broadcastAuthIdentityChange, subscribeAuthIdentityChanges } =
      await import('@/lib/client-storage/auth-identity-sync');
    const listener = vi.fn();
    const unsubscribe = subscribeAuthIdentityChanges(listener);

    const epoch = broadcastAuthIdentityChange();
    expect(local.getItem(AUTH_IDENTITY_EPOCH_KEY)).toBe(epoch);
    expect(listener).not.toHaveBeenCalled();

    const peer = new FakeBroadcastChannel('sophos:auth-identity:v1');
    peer.postMessage({ sourceId: 'another-tab', epoch: 'peer-epoch' });
    expect(listener).toHaveBeenCalledTimes(1);

    storageListener?.({ key: AUTH_IDENTITY_EPOCH_KEY, newValue: 'storage-epoch' });
    expect(listener).toHaveBeenCalledTimes(2);
    unsubscribe();
  });

  it('notifies after auth mutation and before every hard navigation', () => {
    const login = readFileSync(new URL('../app/login/page.tsx', import.meta.url), 'utf8');
    const register = readFileSync(new URL('../app/register/page.tsx', import.meta.url), 'utf8');
    const sidebar = readFileSync(
      new URL('../components/workspace/role-sidebar.tsx', import.meta.url),
      'utf8',
    );
    const admin = readFileSync(
      new URL('../components/admin/admin-dashboard.tsx', import.meta.url),
      'utf8',
    );

    for (const source of [login, register, sidebar, admin]) {
      expect(source.indexOf('broadcastAuthIdentityChange()')).toBeGreaterThan(-1);
      expect(source.indexOf('broadcastAuthIdentityChange()')).toBeLessThan(
        source.indexOf('window.location.replace('),
      );
    }
  });
});

describe('scoped Zustand stores', () => {
  it('rehydrates profiles and provider settings only from the active user partition', async () => {
    activateClientStorageScope('zustand-a');
    const { useUserProfileStore } = await import('@/lib/store/user-profile');
    const { useSettingsStore } = await import('@/lib/store/settings');
    await useUserProfileStore.persist.rehydrate();
    await useSettingsStore.persist.rehydrate();

    useUserProfileStore.getState().setNickname('Account A');
    useSettingsStore.getState().setModel('openai', 'model-a');

    activateClientStorageScope('zustand-b');
    await useUserProfileStore.persist.rehydrate();
    await useSettingsStore.persist.rehydrate();
    expect(useUserProfileStore.getState().nickname).toBe('');
    expect(useSettingsStore.getState().modelId).toBe('');

    useUserProfileStore.getState().setNickname('Account B');
    useSettingsStore.getState().setModel('openai', 'model-b');

    activateClientStorageScope('zustand-a');
    await useUserProfileStore.persist.rehydrate();
    await useSettingsStore.persist.rehydrate();
    expect(useUserProfileStore.getState().nickname).toBe('Account A');
    expect(useSettingsStore.getState().modelId).toBe('model-a');
  });

  it('discards share-only profile, settings and agent registry mutations on exit', async () => {
    activateClientStorageScope('share-state-user');
    const { resetAndRehydrateUserProfileStore, useUserProfileStore } =
      await import('@/lib/store/user-profile');
    const { resetAndRehydrateSettingsStore, useSettingsStore } =
      await import('@/lib/store/settings');
    const { resetAndRehydrateAgentRegistry, useAgentRegistry } =
      await import('@/lib/orchestration/registry/store');
    await resetAndRehydrateUserProfileStore();
    await resetAndRehydrateSettingsStore();
    await resetAndRehydrateAgentRegistry();

    useUserProfileStore.getState().setNickname('Account owner');
    useSettingsStore.getState().setModel('openai', 'owner-model');
    const originalAgentName = useAgentRegistry.getState().getAgent('default-1')?.name;

    setClientStoragePersistenceMode('memory-only');
    useUserProfileStore.getState().setNickname('Shared visitor');
    useSettingsStore.getState().setModel('openai', 'shared-model');
    useAgentRegistry.getState().updateAgent('default-1', { name: 'Shared agent' });

    setClientStoragePersistenceMode('account');
    await resetAndRehydrateUserProfileStore();
    await resetAndRehydrateSettingsStore();
    await resetAndRehydrateAgentRegistry();
    expect(useUserProfileStore.getState().nickname).toBe('Account owner');
    expect(useSettingsStore.getState().modelId).toBe('owner-model');
    expect(useAgentRegistry.getState().getAgent('default-1')?.name).toBe(originalAgentName);
  });
});
