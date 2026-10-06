import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ApiError, apiRequest, apiRequestEnvelope } from '../../../lib/api-client';
import type {
  ApiResponseEnvelope,
  InvitationEntity,
  InvitationStatus,
  MeResponseDto,
  SystemRole,
} from '@rbac/shared';

/**
 * Server-state layer for the invitation domain.
 *
 * Invitation lists are the most security-relevant cache in the app, so the keys
 * include every filter value: a stale entry filtered by a different status could
 * otherwise be shown after the operator changes the filter.
 */

export const INVITATIONS_QUERY_KEY = ['invitations'] as const;

export interface InvitationFilters {
  page?: number;
  limit?: number;
  status?: InvitationStatus;
  search?: string;
}

export interface InvitationPage {
  items: InvitationEntity[];
  pagination: {
    totalRecords: number;
    page: number;
    limit: number;
    totalPages: number;
  };
}

export interface CreatedInvitation {
  id: string;
  email: string;
  role: SystemRole;
  status: InvitationStatus;
  expiresAt: string;
  invitationUrl: string;
}

/** `GET /invitations` — paginated, filterable directory. */
export function useInvitations(filters: InvitationFilters) {
  return useQuery<InvitationPage, ApiError>({
    queryKey: [...INVITATIONS_QUERY_KEY, 'list', filters],
    queryFn: async () => {
      const envelope = await apiRequestEnvelope<InvitationEntity[]>('/invitations', {
        query: {
          page: filters.page ?? 1,
          limit: filters.limit ?? 20,
          status: filters.status,
          search: filters.search,
        },
      });
      return {
        items: envelope.data ?? [],
        pagination: envelope.meta.pagination ?? {
          totalRecords: 0,
          page: 1,
          limit: filters.limit ?? 20,
          totalPages: 0,
        },
      };
    },
    placeholderData: (previous) => previous,
  });
}

/** `POST /invitations` — dispatch a claim link. Never retried automatically. */
export function useCreateInvitation() {
  const queryClient = useQueryClient();

  return useMutation<CreatedInvitation, ApiError, { email: string; roleId: string }>({
    mutationFn: (input) =>
      apiRequest<CreatedInvitation>('/invitations', { method: 'POST', body: input }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: INVITATIONS_QUERY_KEY });
    },
  });
}

/** `DELETE /invitations/:id` — revoke a pending invitation. */
export function useRevokeInvitation() {
  const queryClient = useQueryClient();

  return useMutation<{ revoked: boolean }, ApiError, string>({
    mutationFn: (invitationId: string) =>
      apiRequest<{ revoked: boolean }>(`/invitations/${encodeURIComponent(invitationId)}`, {
        method: 'DELETE',
      }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: INVITATIONS_QUERY_KEY });
    },
  });
}

export type TokenValidationState =
  | { status: 'pending' }
  | { status: 'valid'; role: SystemRole }
  | { status: 'rejected'; reason: string };

/**
 * `GET /invitations/validate/:token` — public probe used by the claim screen.
 *
 * Enabled only when a token is present, and retried never: a rejected token is a
 * terminal answer, and retrying a rejection would only amplify traffic against a
 * rate-limited public endpoint.
 */
export function useValidateInvitationToken(token: string | undefined) {
  return useQuery<TokenValidationState, ApiError>({
    queryKey: ['invitations', 'validate', token],
    enabled: typeof token === 'string' && token.length > 0,
    retry: false,
    staleTime: 60_000,
    queryFn: async () => {
      try {
        const result = await apiRequest<{ role: SystemRole; isValid: true }>(
          `/invitations/validate/${encodeURIComponent(token ?? '')}`,
          { authenticated: false }
        );
        return { status: 'valid', role: result.role };
      } catch (error: unknown) {
        const reason =
          error instanceof ApiError ? error.message : 'This invitation link could not be verified.';
        return { status: 'rejected', reason };
      }
    },
  });
}

export interface AcceptInvitationResult {
  user: MeResponseDto;
  tokens: { accessToken: string; expiresIn: number };
}

/**
 * `POST /invitations/accept/:token` — completes the claim and signs the user in.
 *
 * `retry` is pinned to 0: the endpoint is not idempotent, and a retried claim
 * after a network timeout would be rejected as an already-consumed invitation.
 */
export function useAcceptInvitation() {
  const queryClient = useQueryClient();

  return useMutation<
    AcceptInvitationResult,
    ApiError,
    { token: string; firstName: string; lastName: string; password: string }
  >({
    mutationFn: ({ token, ...body }) =>
      apiRequest<AcceptInvitationResult>(`/invitations/accept/${encodeURIComponent(token)}`, {
        method: 'POST',
        body,
        authenticated: false,
      }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: INVITATIONS_QUERY_KEY });
    },
  });
}

/** Narrow helper used by the claim screen's completion state. */
export function isSuccessfulEnvelope<T>(envelope: ApiResponseEnvelope<T>): boolean {
  return envelope.success && envelope.data !== null;
}