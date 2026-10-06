import { create } from 'zustand';
import { SystemRole, Permission, MeResponseDto } from '@rbac/shared';

interface AuthState {
  user: MeResponseDto | null;
  accessToken: string | null;
  isAuthenticated: boolean;
  setAuth: (user: MeResponseDto, token: string) => void;
  clearAuth: () => void;
}

export const useAuthStore = create<AuthState>((set) => ({
  user: null,
  accessToken: null,
  isAuthenticated: false,
  setAuth: (user, token) => set({ user, accessToken: token, isAuthenticated: true }),
  clearAuth: () => set({ user: null, accessToken: null, isAuthenticated: false }),
}));
