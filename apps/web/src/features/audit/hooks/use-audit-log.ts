import { useQuery } from '@tanstack/react-query';
import { apiRequestEnvelope } from '../../../lib/api-client';
import type { ApiResponseEnvelope } from '@rbac/shared';

export interface AuditEntry {
  id: string;
  actorId: string | null;
  action: string;
  resourceType: string;
  resourceId: string;
  payload: unknown;
  ipAddress: string;
  userAgent: string;
  createdAt: string;
}

export interface AuditPage {
  entries: AuditEntry[];
  pagination: {
    totalRecords: number;
    page: number;
    limit: number;
    totalPages: number;
  };
}

export const AUDIT_QUERY_KEY = ['audit-logs'] as const;

/**
 * `GET /audit-logs` — the security trail.
 *
 * The route is already gated on `audit:read` by `ProtectedRoute`; the request
 * itself is still enforced by `RbacGuard` on the server. This hook is only about
 * presentation.
 */
export function useAuditLog(page: number) {
  return useQuery<AuditPage, Error>({
    queryKey: [...AUDIT_QUERY_KEY, page],
    queryFn: async () => {
      const envelope = await apiRequestEnvelope<AuditEntry[]>('/audit-logs', {
        query: { page, limit: 25 },
      });
      return {
        entries: envelope.data ?? [],
        pagination: envelope.meta.pagination ?? {
          totalRecords: 0,
          page: 1,
          limit: 25,
          totalPages: 0,
        },
      };
    },
    placeholderData: (previous) => previous,
  });
}

export type { ApiResponseEnvelope };