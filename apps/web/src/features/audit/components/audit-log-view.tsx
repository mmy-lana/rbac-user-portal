import * as React from 'react';
import {
  VaultBadge,
  VaultButton,
  VaultCard,
  VaultDataView,
  type VaultBadgeVariant,
  type VaultDataColumn,
} from '@rbac/ui';
import type { SystemRole } from '@rbac/shared';
import { useAuditLog, type AuditEntry } from '../hooks/use-audit-log';

/**
 * Security trail view.
 *
 * Visible only to identities holding `audit:read` (OWNER, ADMIN, AUDITOR) — the
 * route wrapper refuses the others before this component ever mounts.
 *
 * Severity mapping is explicit rather than inferred: a colour alone must never
 * carry meaning, so each badge also spells out its action.
 */

const ACTION_VARIANT: Record<string, VaultBadgeVariant> = {
  'auth:sign_in': 'emerald',
  'auth:sign_in_failed': 'amber',
  'auth:session_terminated': 'crimson',
  'role:assigned': 'cyan',
  'role:change_rejected': 'crimson',
  'invitation:issued': 'cyan',
  'invitation:accepted': 'emerald',
  'invitation:revoked': 'crimson',
  'invitation:expired': 'amber',
  'invitation:claim_rejected': 'amber',
};

function formatTimestamp(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return date.toISOString().replace('T', ' ').slice(0, 19);
}

function summarisePayload(payload: unknown): string {
  if (payload === null || payload === undefined) return '—';
  if (typeof payload !== 'object') return String(payload);

  const entries = Object.entries(payload as Record<string, unknown>);
  if (entries.length === 0) return '—';

  return entries
    .slice(0, 3)
    .map(([key, value]) => `${key}: ${typeof value === 'object' ? JSON.stringify(value) : String(value)}`)
    .join(' · ');
}

export const AuditLogView: React.FC = () => {
  const [page, setPage] = React.useState(1);
  const query = useAuditLog(page);

  const columns: VaultDataColumn<AuditEntry>[] = React.useMemo(
    () => [
      {
        key: 'action',
        header: 'Event',
        isPrimary: true,
        render: (entry) => (
          <VaultBadge variant={ACTION_VARIANT[entry.action] ?? 'neutral'} indicator="dot">
            {entry.action}
          </VaultBadge>
        ),
      },
      {
        key: 'resource',
        header: 'Resource',
        render: (entry) => (
          <span className="break-all">
            {entry.resourceType}:{entry.resourceId}
          </span>
        ),
      },
      {
        key: 'actor',
        header: 'Actor',
        render: (entry) => <span className="break-all">{entry.actorId ?? 'system'}</span>,
      },
      {
        key: 'payload',
        header: 'Detail',
        hideOnCompact: true,
        render: (entry) => <span className="break-all">{summarisePayload(entry.payload)}</span>,
      },
      {
        key: 'ip',
        header: 'Source IP',
        render: (entry) => <span>{entry.ipAddress}</span>,
      },
      {
        key: 'createdAt',
        header: 'Recorded',
        render: (entry) => <span>{formatTimestamp(entry.createdAt)}</span>,
      },
    ],
    []
  );

  const pagination = query.data?.pagination;

  return (
    <VaultCard
      title="Security Telemetry"
      subtitle={
        pagination
          ? `${pagination.totalRecords} event${pagination.totalRecords === 1 ? '' : 's'} · page ${pagination.page} of ${Math.max(1, pagination.totalPages)}`
          : 'Append-only trail of privileged actions'
      }
      action={
        pagination && pagination.totalPages > 1 ? (
          <div className="flex items-center gap-2">
            <VaultButton
              variant="secondary"
              onClick={() => setPage((current) => Math.max(1, current - 1))}
              disabled={pagination.page <= 1}
            >
              Prev
            </VaultButton>
            <VaultButton
              variant="secondary"
              onClick={() => setPage((current) => current + 1)}
              disabled={pagination.page >= pagination.totalPages}
            >
              Next
            </VaultButton>
          </div>
        ) : null
      }
    >
      <VaultDataView
        caption="Security audit trail"
        columns={columns}
        rows={query.data?.entries ?? []}
        rowKey={(entry) => entry.id}
        isLoading={query.isLoading}
        emptyState={
          <p className="text-xs font-mono uppercase tracking-widest text-vault-text-tertiary">
            No telemetry recorded yet
          </p>
        }
      />
    </VaultCard>
  );
};
AuditLogView.displayName = 'AuditLogView';

/** Re-exported for the route layer's type imports. */
export type { SystemRole };