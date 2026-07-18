import type { TeacherAsset } from './types';

const STORAGE_KEY = 'sophos:teacher:assets:v1';
const CHANGE_EVENT = 'sophos:teacher:assets:change';

function isBrowser(): boolean {
  return typeof window !== 'undefined';
}

export function loadAssets(): TeacherAsset[] {
  if (!isBrowser()) return [];
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (item): item is TeacherAsset =>
        !!item && typeof item === 'object' && typeof (item as TeacherAsset).id === 'string',
    );
  } catch {
    return [];
  }
}

function writeAssets(assets: TeacherAsset[]): void {
  if (!isBrowser()) return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(assets));
    window.dispatchEvent(new CustomEvent(CHANGE_EVENT));
  } catch {
    /* quota / privacy mode — best effort */
  }
}

export function saveAsset(asset: TeacherAsset): void {
  const list = loadAssets();
  const filtered = list.filter((a) => a.id !== asset.id);
  filtered.unshift(asset);
  writeAssets(filtered);
}

export function updateAsset(
  id: string,
  patch: Partial<Omit<TeacherAsset, 'id' | 'createdAt'>>,
): TeacherAsset | undefined {
  const list = loadAssets();
  const idx = list.findIndex((a) => a.id === id);
  if (idx === -1) return undefined;
  const next: TeacherAsset = {
    ...list[idx],
    ...patch,
    ref: { ...list[idx].ref, ...(patch.ref ?? {}) },
    updatedAt: Date.now(),
  };
  list[idx] = next;
  writeAssets(list);
  return next;
}

export function removeAsset(id: string): void {
  const list = loadAssets().filter((a) => a.id !== id);
  writeAssets(list);
}

/**
 * Subscribe to asset-list changes. Fires on this-tab writes (via CustomEvent)
 * and on cross-tab writes (via storage event). Returns an unsubscribe fn.
 */
export function subscribeToAssets(listener: () => void): () => void {
  if (!isBrowser()) return () => {};
  const onLocal = () => listener();
  const onStorage = (e: StorageEvent) => {
    if (e.key === STORAGE_KEY) listener();
  };
  window.addEventListener(CHANGE_EVENT, onLocal as EventListener);
  window.addEventListener('storage', onStorage);
  return () => {
    window.removeEventListener(CHANGE_EVENT, onLocal as EventListener);
    window.removeEventListener('storage', onStorage);
  };
}
