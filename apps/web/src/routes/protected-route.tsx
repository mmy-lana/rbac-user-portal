import * as React from 'react';
import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { VaultBadge, VaultButton } from '@rbac/ui';
import { hasAllPermissions, type Permission, type SystemRole } from '@rbac/shared';
import { useAuthStore } from '../features/auth/store/auth-store';
import { resetVaultSession } from '../components/error/vault-error-boundary';

export interface ProtectedRouteProps {
  /**
   * Grants required to enter the route. Every listed permission must be held
   * (conjunctive), mirroring the server's `RbacGuard`, which requires all
   * declared permissions rather than any one of them.
   */
  permissions?: readonly Permission[];
  /** Optional role allow-list, checked in addition to `permissions`. */
  roles?: readonly SystemRole[];
  /**
   * Renders this node instead of the nested `<Outlet/>`. A guard can therefore
   * wrap a single element directly, which is how per-screen permissions are
   * applied without manufacturing a route for every protected view.
   */
  children?: React.ReactNode;
}

/**
 * Gate for authenticated routes.
 *
 * Three states, in this order:
 *
 *  1. **Restoring** — the app is performing its silent refresh exchange after a
 *     reload. Rendering the protected route here would flash the login screen at
 *     an authenticated user, so a neutral boot screen is shown instead.
 *  2. **Unauthenticated** — redirect to `/login`, carrying the attempted path in
 *     router state so the user lands back where they meant to go.
 *  3. **Unauthorised** — the session is valid but lacks the grant. This is
 *     deliberately *not* a redirect loop: an explicit refusal screen explains the
 *     situation instead of bouncing the user to a login they have already passed.
 *
 * The server remains the authority. This wrapper exists so the UI never presents
 * an action the API will reject — not to protect anything.
 */
export const ProtectedRoute: React.FC<ProtectedRouteProps> = ({ permissions, roles, children }) => {
  const user = useAuthStore((state) => state.user);
  const isRestoring = useAuthStore((state) => state.isRestoring);
  const location = useLocation();

  if (isRestoring) {
    return (
      <div
        role="status"
        aria-live="polite"
        className="min-h-dvh flex items-center justify-center bg-vault-bg px-4"
      >
        <p className="text-xs font-mono uppercase tracking-widest text-vault-accent">
          Restoring secure session…
        </p>
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/login" state={{ from: location.pathname }} replace />;
  }

  const subject = { role: user.role, permissions: user.permissions };

  /*
   * A gate declared *without* `permissions` is an authentication-only gate: it
   * exists to keep anonymous visitors out of the shell, not to express an
   * authorisation requirement. Treating "no permissions declared" as "deny" would
   * lock out every identity including the owner, because the root gate carries no
   * grant of its own.
   *
   * Default-deny still holds where it matters: a screen that *does* declare
   * permissions is denied unless the identity holds all of them, and the server's
   * `RbacGuard` independently rejects the request.
   */
  const roleAllowed = roles === undefined || roles.length === 0 || roles.includes(user.role);
  const permissionAllowed =
    permissions === undefined || permissions.length === 0
      ? true
      : hasAllPermissions(subject, permissions);

  if (!roleAllowed || !permissionAllowed) {
    return (
      <div className="min-h-dvh flex items-center justify-center bg-vault-bg px-3 py-8">
        <div className="w-full max-w-[480px] border border-vault-border bg-vault-surface p-5 tablet:p-6 flex flex-col gap-4">
          <div className="flex items-center gap-2">
            <span aria-hidden="true" className="w-2.5 h-2.5 bg-vault-danger border border-vault-danger shrink-0" />
            <h1 className="text-sm font-mono font-bold uppercase tracking-wider text-vault-text-primary">
              Access denied
            </h1>
          </div>

          <p className="text-xs font-mono text-vault-text-secondary leading-relaxed">
            Your identity holds <VaultBadge variant="emerald">{user.role}</VaultBadge> clearance,
            which does not include this enclave.
          </p>

          <VaultButton variant="secondary" className="w-full" onClick={resetVaultSession}>
            Reset session
          </VaultButton>
        </div>
      </div>
    );
  }

  return <>{children ?? <Outlet />}</>;
};

/**
 * Inverse gate: keeps an authenticated user off the login screen.
 *
 * Without it, a signed-in operator who navigates to `/login` sees a form that
 * would rotate their session for no reason.
 */
export const PublicOnlyRoute: React.FC = () => {
  const user = useAuthStore((state) => state.user);
  const isRestoring = useAuthStore((state) => state.isRestoring);

  if (!isRestoring && user) {
    return <Navigate to="/" replace />;
  }

  return <Outlet />;
};