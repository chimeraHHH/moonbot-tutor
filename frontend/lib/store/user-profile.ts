/**
 * User Profile Store
 * Persists avatar, nickname & bio to localStorage
 */

import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import { scopedLocalStorage, subscribeClientStorageScope } from '@/lib/client-storage/scope';

/** Predefined avatar options */
export const AVATAR_OPTIONS = [
  '/avatars/user.png',
  '/avatars/teacher-2.png',
  '/avatars/assist-2.png',
  '/avatars/clown-2.png',
  '/avatars/curious-2.png',
  '/avatars/note-taker-2.png',
  '/avatars/thinker-2.png',
] as const;

export interface UserProfileState {
  /** Local avatar path or data-URL (for custom uploads) */
  avatar: string;
  nickname: string;
  bio: string;
  setAvatar: (avatar: string) => void;
  setNickname: (nickname: string) => void;
  setBio: (bio: string) => void;
}

const DEFAULT_USER_PROFILE = {
  avatar: AVATAR_OPTIONS[0],
  nickname: '',
  bio: '',
} as const;

const userProfileStorage = createJSONStorage<UserProfileState>(() => scopedLocalStorage);
const discardUserProfileStorage = {
  getItem: () => null,
  setItem: () => {},
  removeItem: () => {},
};

export const useUserProfileStore = create<UserProfileState>()(
  persist(
    (set) => ({
      ...DEFAULT_USER_PROFILE,
      setAvatar: (avatar) => set({ avatar }),
      setNickname: (nickname) => set({ nickname }),
      setBio: (bio) => set({ bio }),
    }),
    {
      name: 'user-profile-storage',
      storage: userProfileStorage,
      // The authenticated partition is installed by the root layout. Eager
      // hydration here would briefly load guest/previous-account data first.
      skipHydration: true,
    },
  ),
);

export function resetAndRehydrateUserProfileStore(): Promise<void> | void {
  useUserProfileStore.persist.setOptions({ storage: discardUserProfileStorage });
  useUserProfileStore.setState(useUserProfileStore.getInitialState(), true);
  useUserProfileStore.persist.setOptions({ storage: userProfileStorage });
  return useUserProfileStore.persist.rehydrate();
}

subscribeClientStorageScope(() => void resetAndRehydrateUserProfileStore(), {
  emitCurrent: true,
});
