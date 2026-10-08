import * as React from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';
import { VaultBadge, VaultButton } from '@rbac/ui';
import { SystemPermissions } from '@rbac/shared';
import { AppShell } from '../components/layout/app-shell';
import { VaultErrorBoundary } from '../components/error/vault-error-boundary';
import { LoginForm } from '../features/auth/components/login-form';
import { AcceptInviteForm } from '../features/invitations/components/accept-invite-form';
import { InvitationsTable } from '../features/invitations/components/invitations-table';
import { AuditLogView } from '../features/audit/components/audit-log-view';
import { ProtectedRoute, PublicOnlyRoute } from './protected-route';

/**
 * Route table.
 *
 * Every protected screen sits behind a permission wrapper, and the grant
 * declared here mirrors the one the API enforces — `invitations:read` for the
 * ledger, `audit:read` for the trail. A role that holds neither never renders the
 * navigation item and never reaches the component.
 *
 * The public claim route is deliberately outside `AppShell` and outside every
 * permission gate: an invitee has no session yet, and must be able to complete a
 * claim from a link they were sent.
 */
export const AppRouter: React.FC = () => {
  return (
    <Routes>
      {/* Public surfaces */}
      <Route element={<PublicOnlyRoute />}>
        <Route path="/login" element={<LoginForm />} />
      </Route>
      <Route path="/invitations/accept/:token" element={<AcceptInviteForm />} />

      {/* Authenticated shell */}
      <Route element={<ProtectedRoute />}>
        <Route element={<AppShell />}>
          <Route
            index
            element={
              <VaultErrorBoundary scope="Invitation ledger">
                <ProtectedRoute permissions={[SystemPermissions.INVITATIONS_READ]}>
                  <InvitationsTable />
                </ProtectedRoute>
              </VaultErrorBoundary>
            }
          />
          <Route
            path="audit"
            element={
              <VaultErrorBoundary scope="Security telemetry">
                <ProtectedRoute permissions={[SystemPermissions.AUDIT_READ]}>
                  <AuditLogView />
                </ProtectedRoute>
              </VaultErrorBoundary>
            }
          />
        </Route>
      </Route>

      <Route path="*" element={<NotFoundRoute />} />
    </Routes>
  );
};
AppRouter.displayName = 'AppRouter';

/** Catch-all: explains the dead end instead of silently redirecting. */
const NotFoundRoute: React.FC = () => (
  <div className="min-h-dvh flex items-center justify-center bg-vault-bg px-3">
    <div className="w-full max-w-[480px] border border-vault-border bg-vault-surface p-5 tablet:p-6 flex flex-col gap-4">
      <div className="flex items-center gap-2">
        <span aria-hidden="true" className="w-2.5 h-2.5 bg-vault-warning border border-vault-warning shrink-0" />
        <h1 className="text-sm font-mono font-bold uppercase tracking-wider text-vault-text-primary">
          Unmapped route
        </h1>
      </div>
      <p className="text-xs font-mono text-vault-text-secondary leading-relaxed">
        This address does not correspond to any enclave in the vault.
      </p>
      <VaultBadge variant="amber" indicator="square">
        404
      </VaultBadge>
      <VaultButton variant="secondary" className="w-full" onClick={() => window.location.assign('/')}>
        Return to the portal
      </VaultButton>
    </div>
  </div>
);