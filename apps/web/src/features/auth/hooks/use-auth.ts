import * as React from 'react';
import {
  useMutation,
  useQuery,
  useQueryClient,
  type UseMutationResult,
  type UseQueryResult,
} from '@tanstack/react-query';
import {
  ApiError,
  apiRequest,
  configureApiClient,
  refreshAccessToken,
} from '../../../lib/api-client';
import { useAuthStore } from '../store/auth-store';
import type { MeResponseDto, Permission, SystemRole } from '@rbac/shared';

/**
 * Server-state layer for the auth domain.
 *
 * Query-key conventions:
 *  - `['session', 'me']` — the caller's profile. Every permission-aware view
 *    derives from it, so a role change invalidates the whole UI in one place.
 *  - mutations that change identity clear the session cache explicitly rather
 *    than relying on a global invalidation.
 */

const ME_QUERY_KEY = ['session', 'me'] as const;

export interface LoginResponse {
  user: MeResponseDto;
  tokens: { accessToken: string; expiresIn: number };
}

export interface SessionSnapshot {
  user: MeResponseDto;
  role: SystemRole;
  permissions: Permission[];
}

/**
 * Bridges the non-React HTTP client to the Zustand session store.
 *
 * Mounted once, above the router, so every request the app makes afterwards can
 * read the current access token, write a refreshed one, and clear the session
 * when the server ends it.
 */
export function useApiClientBridge(): void {
  const setAccessToken = useAuthStore((state) => state.setAccessToken);
  const clearSession = useAuthStore((state) => state.clearSession);

  React.useEffect(() => {
    configureApiClient({
      getAccessToken: () => useAuthStore.getState().accessToken,
      setAccessToken,
      onSessionTerminated: (reason) => clearSession(reason),
    });
  }, [setAccessToken, clearSession]);
}

/**
 * Restores a session after a page reload.
 *
 * The access token is gone (it is memory-only), but the HttpOnly refresh cookie
 * survives, so one silent `POST /auth/refresh` restores the session without the
 * user re-entering credentials. Failures are silent by design: an unauthenticated
 * visitor simply lands on the login screen.
 */
export function useSessionBootstrap(): { isRestoring: boolean } {
  const setRestoring = useAuthStore((state) => state.setRestoring);
  const isRestoring = useAuthStore((state) => state.isRestoring);

  React.useEffect(() => {
    let cancelled = false;

    void (async () => {
      const refreshed = await refreshAccessToken();
      if (cancelled) return;

      if (!refreshed) {
        setRestoring(false);
        return;
      }

      try {
        const user = await apiRequest<MeResponseDto>('/auth/me');
        if (cancelled) return;
        useAuthStore.getState().setUser(user);
      } catch {
        // The refresh succeeded but `/me` did not — treat as unauthenticated.
        useAuthStore.getState().clearSession();
      } finally {
        if (!cancelled) setRestoring(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [setRestoring]);

  return { isRestoring };
}

/** `GET /auth/me` — the caller's profile and effective permissions. */
export function useCurrentUser(): UseQueryResult<MeResponseDto, ApiError> {
  const hasToken = useAuthStore((state) => state.accessToken !== null);

  return useQuery<MeResponseDto, ApiError>({
    queryKey: ME_QUERY_KEY,
    queryFn: () => apiRequest<MeResponseDto>('/auth/me'),
    enabled: hasToken,
    staleTime: 60_000,
    retry: 1,
  });
}

/** `POST /auth/login` — establishes the session and stores it in memory. */
export function useLogin(): UseMutationResult<
  LoginResponse,
  ApiError,
  { email: string; password: string }
> {
  const setSession = useAuthStore((state) => state.setSession);
  const queryClient = useQueryClient();

  return useMutation<LoginResponse, ApiError, { email: string; password: string }>({
    mutationFn: async (credentials) =>
      apiRequest<LoginResponse>('/auth/login', {
        method: 'POST',
        body: credentials,
        authenticated: false,
      }),
    onSuccess: (response) => {
      setSession(response.user, response.tokens.accessToken);
      queryClient.setQueryData(ME_QUERY_KEY, response.user);
    },
  });
}

/**
 * `POST /auth/logout`.
 *
 * The server-side termination is attempted even when the local session is
 * already gone, so a stale refresh cookie cannot survive a sign-out.
 */
export function useLogout(): UseMutationResult<{ revoked: boolean }, ApiError, void> {
  const clearSession = useAuthStore((state) => state.clearSession);
  const queryClient = useQueryClient();

  return useMutation<{ revoked: boolean }, ApiError, void>({
    mutationFn: () => apiRequest<{ revoked: boolean }>('/auth/logout', { method: 'POST' }),
    onSettled: () => {
      clearSession();
      queryClient.clear();
    },
  });
}