import { create } from 'zustand';
import { hasPermission, type MeResponseDto, type Permission } from '@rbac/shared';

/**
 * Client session state.
 *
 * Security posture:
 *  - the **access token is never persisted**. It stays in this in-memory store
 *    and is dropped on reload, which forces a cookie-backed refresh — the token
 *    is only useful to an attacker who can also read the HttpOnly cookie;
 *  - the profile persisted to `sessionStorage` contains no credential material,
 *    only display metadata and the permission list used for UI gating;
 *  - `localStorage` is never used: anything there survives the tab and is
 *    readable by any script running on the origin.
 */

const STORAGE_KEY = 'vault.session.profile';

interface PersistedProfile {
  user: MeResponseDto;
}

export interface AuthState {
  user: MeResponseDto | null;
  accessToken: string | null;
  /** True while the post-reload refresh exchange has not resolved yet. */
  isRestoring: boolean;
  /** Human-readable reason the last session ended, if any. */
  terminatedReason: string | null;

  setSession: (user: MeResponseDto, accessToken: string) => void;
  setAccessToken: (accessToken: string) => void;
  setUser: (user: MeResponseDto) => void;
  setRestoring: (isRestoring: boolean) => void;
  clearSession: (reason?: string) => void;
}

function readPersistedProfile(): MeResponseDto | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as PersistedProfile;
    return parsed.user ?? null;
  } catch {
    return null;
  }
}

function writePersistedProfile(user: MeResponseDto | null): void {
  if (typeof window === 'undefined') return;
  try {
    if (user === null) {
      window.sessionStorage.removeItem(STORAGE_KEY);
      return;
    }
    window.sessionStorage.setItem(STORAGE_KEY, JSON.stringify({ user }));
  } catch {
    // Storage can be unavailable (private mode, quota). The in-memory session
    // still works, so failing to persist is not fatal.
  }
}

export const useAuthStore = create<AuthState>((set) => ({
  user: readPersistedProfile(),
  accessToken: null,
  isRestoring: true,
  terminatedReason: null,

  setSession: (user, accessToken) => {
    writePersistedProfile(user);
    set({ user, accessToken, isRestoring: false, terminatedReason: null });
  },

  setAccessToken: (accessToken) => set({ accessToken }),

  setUser: (user) => {
    writePersistedProfile(user);
    set({ user });
  },

  setRestoring: (isRestoring) => set({ isRestoring }),

  clearSession: (reason) => {
    writePersistedProfile(null);
    set({ user: null, accessToken: null, isRestoring: false, terminatedReason: reason ?? null });
  },
}));

/** Non-reactive read used by the HTTP client, which lives outside React. */
export function getAccessToken(): string | null {
  return useAuthStore.getState().accessToken;
}

/** Permission gate shared by routes and navigation items. */
export function useHasPermission(permission: Permission): boolean {
  const user = useAuthStore((state) => state.user);
  if (!user) return false;
  return hasPermission({ role: user.role, permissions: user.permissions }, permission);
}

export function useHasAnyPermission(permissions: readonly Permission[]): boolean {
  const user = useAuthStore((state) => state.user);
  if (!user) return false;
  if (permissions.length === 0) return false;
  return permissions.some((permission) =>
    hasPermission({ role: user.role, permissions: user.permissions }, permission)
  );
}