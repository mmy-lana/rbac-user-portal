import * as React from 'react';
import {
  VaultBadge,
  VaultButton,
  VaultCard,
  VaultDataView,
  VaultInput,
  VaultModal,
  VaultSelect,
  type VaultBadgeVariant,
  type VaultDataColumn,
} from '@rbac/ui';
import { SYSTEM_ROLE_IDS, InvitationStatus, hasPermission, type InvitationEntity } from '@rbac/shared';
import { useAuthStore } from '../../auth/store/auth-store';
import { useCreateInvitation, useInvitations, useRevokeInvitation } from '../hooks/use-invitations';
import { ApiError } from '../../../lib/api-client';

/**
 * Administrative invitation console.
 *
 * Layout contract per viewport:
 *  - 360 / 390 / 430px — filters stack full-width; the "Issue Invitation" trigger
 *    is pinned to a fixed action bar that respects the mobile safe-area inset so
 *    browser chrome never occludes it; the table collapses into stacked cards
 *    with a full-width Revoke control (or a non-interactive status indicator for
 *    identities without `invitations:revoke`).
 *  - 768px — filters lay out in two columns and the table appears inside a
 *    horizontal scroll container with sticky headers.
 *  - 1024px+ — full matrix with every column and both row actions.
 *
 * Every state cue is visible without hover: status and role are colour *plus*
 * text badges, row actions are icon+label buttons with 44px envelopes, and the
 * destructive action is confirmed in a modal rather than on hover.
 */

const STATUS_VARIANT: Record<InvitationStatus, VaultBadgeVariant> = {
  [InvitationStatus.PENDING]: 'cyan',
  [InvitationStatus.ACCEPTED]: 'emerald',
  [InvitationStatus.EXPIRED]: 'amber',
  [InvitationStatus.REVOKED]: 'crimson',
};

const ROLE_VARIANT: Record<string, VaultBadgeVariant> = {
  OWNER: 'emerald',
  ADMIN: 'cyan',
  AUDITOR: 'amber',
  MEMBER: 'neutral',
};

const ASSIGNABLE_ROLES = [
  { value: SYSTEM_ROLE_IDS.ADMIN, label: 'Administrator' },
  { value: SYSTEM_ROLE_IDS.AUDITOR, label: 'Auditor' },
  { value: SYSTEM_ROLE_IDS.MEMBER, label: 'Member' },
] as const;

const STATUS_FILTER_OPTIONS = [
  { value: '', label: 'All statuses' },
  { value: InvitationStatus.PENDING, label: 'Pending' },
  { value: InvitationStatus.ACCEPTED, label: 'Accepted' },
  { value: InvitationStatus.EXPIRED, label: 'Expired' },
  { value: InvitationStatus.REVOKED, label: 'Revoked' },
] as const;

/** Human-readable countdown used in both the table and the stacked cards. */
function describeExpiry(entity: InvitationEntity): string {
  if (entity.status === InvitationStatus.ACCEPTED) return 'Claimed';
  if (entity.status === InvitationStatus.REVOKED) return 'Revoked';

  const remainingMs = new Date(entity.expiresAt).getTime() - Date.now();
  if (remainingMs <= 0) return 'Expired';

  const totalMinutes = Math.floor(remainingMs / 60_000);
  const hours = Math.floor(totalMinutes / 60);
  if (hours >= 24) {
    const days = Math.floor(hours / 24);
    return `${days}d ${hours % 24}h left`;
  }
  if (hours > 0) return `${hours}h ${totalMinutes % 60}m left`;
  return `${Math.max(1, totalMinutes)}m left`;
}

export const InvitationsTable: React.FC = () => {
  const user = useAuthStore((state) => state.user);
  const subject = user ? { role: user.role, permissions: user.permissions } : null;
  const canCreate = subject ? hasPermission(subject, 'invitations:create') : false;
  const canRevoke = subject ? hasPermission(subject, 'invitations:revoke') : false;

  const [search, setSearch] = React.useState('');
  const [debouncedSearch, setDebouncedSearch] = React.useState('');
  const [status, setStatus] = React.useState('');
  const [page, setPage] = React.useState(1);

  const [isIssueOpen, setIsIssueOpen] = React.useState(false);
  const [inviteEmail, setInviteEmail] = React.useState('');
  const [inviteRoleId, setInviteRoleId] = React.useState<string>(SYSTEM_ROLE_IDS.MEMBER);
  const [issuedLink, setIssuedLink] = React.useState<string | null>(null);
  const [issueError, setIssueError] = React.useState<string | null>(null);

  const [revokeTarget, setRevokeTarget] = React.useState<InvitationEntity | null>(null);
  const [revokeError, setRevokeError] = React.useState<string | null>(null);

  // Claim links are shown once. They are held in a ref (not state) so that the
  // row copy action can read them without re-rendering the table on every click.
  const issuedLinks = React.useRef(new Map<string, string>());

  // Debounce the search so each keystroke does not become a request.
  React.useEffect(() => {
    const timer = window.setTimeout(() => {
      setDebouncedSearch(search.trim());
    }, 300);
    return () => window.clearTimeout(timer);
  }, [search]);

  React.useEffect(() => {
    setPage(1);
  }, [debouncedSearch, status]);

  const listQuery = useInvitations({
    page,
    limit: 20,
    ...(status ? { status: status as InvitationStatus } : {}),
    ...(debouncedSearch ? { search: debouncedSearch } : {}),
  });

  const createMutation = useCreateInvitation();
  const revokeMutation = useRevokeInvitation();

  const copyLink = React.useCallback(async (link: string): Promise<void> => {
    try {
      await navigator.clipboard.writeText(link);
    } catch {
      // Clipboard access can be denied (insecure origin, user gesture rules).
      // The link stays visible and selectable in the dialog in that case.
    }
  }, []);

  const closeIssueModal = React.useCallback((): void => {
    setIsIssueOpen(false);
    setIssuedLink(null);
    setIssueError(null);
    setInviteEmail('');
  }, []);

  const handleIssue = async (event: React.FormEvent<HTMLFormElement>): Promise<void> => {
    event.preventDefault();
    setIssueError(null);

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(inviteEmail.trim())) {
      setIssueError('Enter a valid email address for the invitee.');
      return;
    }

    try {
      const created = await createMutation.mutateAsync({
        email: inviteEmail.trim(),
        roleId: inviteRoleId,
      });
      issuedLinks.current.set(created.id, created.invitationUrl);
      setIssuedLink(created.invitationUrl);
    } catch (error: unknown) {
      setIssueError(
        error instanceof ApiError ? error.message : 'The invitation could not be issued.'
      );
    }
  };

  const handleRevoke = async (): Promise<void> => {
    if (!revokeTarget) return;
    setRevokeError(null);

    try {
      await revokeMutation.mutateAsync(revokeTarget.id);
      issuedLinks.current.delete(revokeTarget.id);
      setRevokeTarget(null);
    } catch (error: unknown) {
      setRevokeError(
        error instanceof ApiError ? error.message : 'This invitation could not be revoked.'
      );
    }
  };

  const renderActions = (entity: InvitationEntity): React.ReactNode => {
    if (!canRevoke) {
      // Uniform geometry: the action slot always occupies the same box so the
      // stacked cards keep identical dimensions for read-only identities.
      return (
        <VaultBadge variant="neutral" className="w-full justify-center min-h-[44px]" indicator="square">
          Read only
        </VaultBadge>
      );
    }

    if (entity.status !== InvitationStatus.PENDING) {
      return (
        <VaultBadge
          variant={STATUS_VARIANT[entity.status]}
          className="w-full justify-center min-h-[44px]"
          indicator="square"
        >
          {entity.status}
        </VaultBadge>
      );
    }

    const link = issuedLinks.current.get(entity.id);

    return (
      <div className="flex flex-col tablet:flex-row tablet:items-center tablet:justify-end gap-2">
        {link ? (
          <VaultButton
            variant="secondary"
            className="w-full tablet:w-auto"
            onClick={() => void copyLink(link)}
          >
            <span aria-hidden="true">⧉</span> Copy link
          </VaultButton>
        ) : null}
        <VaultButton
          variant="danger"
          className="w-full tablet:w-auto"
          onClick={() => {
            setRevokeTarget(entity);
            setRevokeError(null);
          }}
        >
          <span aria-hidden="true">⊘</span> Revoke
        </VaultButton>
      </div>
    );
  };

  const columns: VaultDataColumn<InvitationEntity>[] = React.useMemo(
    () => [
      {
        key: 'email',
        header: 'Target email',
        isPrimary: true,
        render: (entity) => <span className="break-all">{entity.email}</span>,
      },
      {
        key: 'role',
        header: 'Role',
        render: (entity) => (
          <VaultBadge variant={ROLE_VARIANT[entity.role] ?? 'neutral'} indicator="square">
            {entity.role}
          </VaultBadge>
        ),
      },
      {
        key: 'status',
        header: 'Status',
        render: (entity) => (
          <VaultBadge variant={STATUS_VARIANT[entity.status]} indicator="dot">
            {entity.status}
          </VaultBadge>
        ),
      },
      {
        key: 'inviter',
        header: 'Inviter',
        hideOnCompact: true,
        render: (entity) => <span className="break-all">{entity.invitedByEmail}</span>,
      },
      {
        key: 'expires',
        header: 'Expiration',
        render: (entity) => <span>{describeExpiry(entity)}</span>,
      },
      {
        key: 'actions',
        header: 'Direct actions',
        align: 'right',
        className: 'w-[220px]',
        render: renderActions,
      },
    ],
    // `renderActions` closes over the current permission set and link map.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [canRevoke, issuedLinks]
  );

  const pagination = listQuery.data?.pagination;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-3 tablet:grid tablet:grid-cols-2 tablet:gap-4">
        <VaultInput
          label="Search by inviter"
          type="search"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder="owner@vault.internal"
          helperText="Filters the directory by the identity that issued the invitation."
        />
        <VaultSelect
          label="Status filter"
          value={status}
          onChange={(event) => setStatus(event.target.value)}
          options={STATUS_FILTER_OPTIONS.map((option) => ({ ...option }))}
          helperText="Narrow the directory to a single lifecycle state."
        />
      </div>

      <VaultCard
        title="Invitation Ledger"
        subtitle={
          pagination
            ? `${pagination.totalRecords} record${pagination.totalRecords === 1 ? '' : 's'} · page ${pagination.page} of ${Math.max(1, pagination.totalPages)}`
            : 'Live invitation state'
        }
        action={
          <div className="flex flex-wrap items-center gap-2">
            {pagination && pagination.totalPages > 1 ? (
              <>
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
              </>
            ) : null}
            {canCreate ? (
              <VaultButton variant="primary" onClick={() => setIsIssueOpen(true)}>
                Issue invitation
              </VaultButton>
            ) : (
              <VaultBadge variant="neutral" indicator="square">
                Read only
              </VaultBadge>
            )}
          </div>
        }
      >
        <VaultDataView
          caption="Invitations issued for this vault tenant"
          columns={columns}
          rows={listQuery.data?.items ?? []}
          rowKey={(entity) => entity.id}
          isLoading={listQuery.isLoading}
          emptyState={
            <div className="flex flex-col items-center gap-3">
              <p className="text-xs font-mono uppercase tracking-widest text-vault-text-tertiary text-center">
                No invitations match the current filters
              </p>
              {canCreate ? (
                <VaultButton variant="secondary" onClick={() => setIsIssueOpen(true)}>
                  Issue the first invitation
                </VaultButton>
              ) : null}
            </div>
          }
        />
      </VaultCard>

      {/*
        Mobile action bar. Offset above the AppShell fixed bottom navigation bar
        (~56px) plus the safe-area inset so it never occludes the tab bar or gets
        occluded by it.
      */}
      {canCreate ? (
        <div
          className="tablet:hidden fixed inset-x-0 z-30 border-t border-vault-border bg-vault-surface px-3 pt-2 backdrop-blur-sm"
          style={{ bottom: 'calc(56px + env(safe-area-inset-bottom, 0px))' }}
        >
          <VaultButton
            variant="primary"
            className="w-full"
            onClick={() => setIsIssueOpen(true)}
            style={{ minHeight: '48px' }}
          >
            Issue invitation
          </VaultButton>
        </div>
      ) : null}

      {/* Spacer so the stacked mobile bars never cover the last row. */}
      <div className="tablet:hidden h-32" aria-hidden="true" />

      <VaultModal
        isOpen={isIssueOpen}
        onClose={closeIssueModal}
        title="Issue invitation"
        subtitle="Generates a single-use claim link valid for 72 hours."
        isDismissDisabled={createMutation.isPending}
        footer={
          <>
            <VaultButton variant="ghost" onClick={closeIssueModal}>
              Close
            </VaultButton>
            {issuedLink ? null : (
              <VaultButton
                variant="primary"
                type="submit"
                form="issue-invitation-form"
                isLoading={createMutation.isPending}
              >
                Generate link
              </VaultButton>
            )}
          </>
        }
      >
        {issuedLink ? (
          <div className="flex flex-col gap-3">
            <p className="text-xs font-mono text-vault-accent leading-relaxed">
              Claim link generated. It is shown once and is never retrievable again.
            </p>
            <p className="text-xs font-mono text-vault-text-secondary break-all border border-vault-border bg-vault-surface-elevated px-3 py-2">
              {issuedLink}
            </p>
            <VaultButton
              variant="secondary"
              className="w-full"
              onClick={() => void copyLink(issuedLink)}
            >
              <span aria-hidden="true">⧉</span> Copy link
            </VaultButton>
          </div>
        ) : (
          <form
            id="issue-invitation-form"
            onSubmit={(event) => void handleIssue(event)}
            noValidate
          >
            <div className="flex flex-col gap-4">
              {issueError ? (
                <p
                  role="alert"
                  className="text-xs font-mono text-vault-danger border border-vault-danger-border bg-vault-danger-surface px-3 py-2"
                >
                  {issueError}
                </p>
              ) : null}
              <VaultInput
                label="Invitee email"
                type="email"
                value={inviteEmail}
                onChange={(event) => setInviteEmail(event.target.value)}
                placeholder="analyst.external@agency.gov"
                helperText="The link is bound to this address and cannot be transferred."
                required
              />
              <VaultSelect
                label="Assigned role"
                value={inviteRoleId}
                onChange={(event) => setInviteRoleId(event.target.value)}
                options={ASSIGNABLE_ROLES.map((role) => ({ ...role }))}
                helperText="Ownership is never granted through an invitation."
                required
              />
            </div>
          </form>
        )}
      </VaultModal>

      <VaultModal
        isOpen={revokeTarget !== null}
        onClose={() => {
          setRevokeTarget(null);
          setRevokeError(null);
        }}
        title="Revoke invitation"
        subtitle={
          revokeTarget
            ? `The claim link for ${revokeTarget.email} stops working immediately.`
            : undefined
        }
        isDismissDisabled={revokeMutation.isPending}
        footer={
          <>
            <VaultButton
              variant="ghost"
              onClick={() => {
                setRevokeTarget(null);
                setRevokeError(null);
              }}
            >
              Keep active
            </VaultButton>
            <VaultButton
              variant="danger"
              onClick={() => void handleRevoke()}
              isLoading={revokeMutation.isPending}
            >
              Revoke now
            </VaultButton>
          </>
        }
      >
        <div className="flex flex-col gap-3">
          {revokeError ? (
            <p
              role="alert"
              className="text-xs font-mono text-vault-danger border border-vault-danger-border bg-vault-danger-surface px-3 py-2"
            >
              {revokeError}
            </p>
          ) : null}
          <p className="text-xs font-mono text-vault-text-secondary leading-relaxed">
            Revocation is permanent. A new invitation must be issued to restore access for this
            address.
          </p>
        </div>
      </VaultModal>
    </div>
  );
};
InvitationsTable.displayName = 'InvitationsTable';