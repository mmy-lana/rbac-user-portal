import * as React from 'react';
import { VaultBadge, VaultButton } from '@rbac/ui';
import { useAuthStore } from '../../features/auth/store/auth-store';

/**
 * Clears every trace of the session and returns to the login screen.
 *
 * Exposed as a module function (not a hook) so the error boundary — which by
 * definition renders outside the React tree that owns the store — can still reach
 * it, and so it works from the fallback screen of a crashed subtree.
 *
 * The refresh cookie is HttpOnly and cannot be cleared from JavaScript; the next
 * sign-in rotates it, and `POST /auth/logout` (best effort) invalidates the stored
 * digest first.
 */
export function resetVaultSession(): void {
  useAuthStore.getState().clearSession('Session was reset locally.');
  try {
    window.sessionStorage.clear();
  } catch {
    // Storage may be unavailable; the in-memory reset above already succeeded.
  }
  window.location.assign('/login');
}

interface VaultErrorBoundaryProps {
  children: React.ReactNode;
  /** Rendered instead of the default screen, for route-level scoping. */
  fallback?: (state: { error: Error; reset: () => void }) => React.ReactNode;
  /** Shown in the default fallback; distinguishes root from route level. */
  scope?: string;
}

interface VaultErrorBoundaryState {
  error: Error | null;
}

/**
 * Render-time error boundary.
 *
 * React unmounts the whole tree when an error escapes a component, which on a
 * single-page app means a blank page with no way back. Catching here keeps the
 * shell alive: the user gets an explanation, a way to retry the subtree, and a
 * way to reset the session — which is the common cause (corrupt or stale session
 * state) of these failures.
 *
 * Two instances are mounted: one at the root for anything outside the router, and
 * one around the routed content so a crash in a single screen does not take the
 * session header down with it.
 */
export class VaultErrorBoundary extends React.Component<
  VaultErrorBoundaryProps,
  VaultErrorBoundaryState
> {
  override state: VaultErrorBoundaryState = { error: null };

  static getDerivedStateFromError(error: Error): VaultErrorBoundaryState {
    return { error };
  }

  override componentDidCatch(error: Error, info: React.ErrorInfo): void {
    // Client-side telemetry only: the message and component stack, never the
    // user's data.
    process.stderr.write(
      `${JSON.stringify({
        level: 'error',
        event: 'react_render_error',
        scope: this.props.scope ?? 'root',
        message: error.message,
        componentStack: info.componentStack,
      })}\n`
    );
  }

  private readonly reset = (): void => {
    this.setState({ error: null });
  };

  override render(): React.ReactNode {
    const { error } = this.state;
    const { children, fallback } = this.props;

    if (!error) return children;

    if (fallback) {
      return fallback({ error, reset: this.reset });
    }

    return (
      <div className="min-h-dvh flex items-center justify-center bg-vault-bg px-3 py-8">
        <div
          role="alert"
          className="w-full max-w-[480px] border border-vault-danger-border bg-vault-surface p-5 tablet:p-6 flex flex-col gap-4"
        >
          <div className="flex items-center gap-2">
            <span aria-hidden="true" className="w-2.5 h-2.5 bg-vault-danger border border-vault-danger shrink-0" />
            <h1 className="text-sm font-mono font-bold uppercase tracking-wider text-vault-text-primary">
              Vault integrity fault
            </h1>
          </div>

          <p className="text-xs font-mono text-vault-text-secondary leading-relaxed">
            The console hit an unexpected state and stopped rendering this view. No action was
            applied to the vault.
          </p>

          <VaultBadge variant="crimson" indicator="square">
            {this.props.scope ?? 'Application'} error
          </VaultBadge>

          <div className="flex flex-col gap-2 tablet:flex-row">
            <VaultButton variant="secondary" className="w-full tablet:w-auto" onClick={this.reset}>
              Retry view
            </VaultButton>
            <VaultButton variant="danger" className="w-full tablet:w-auto" onClick={resetVaultSession}>
              Reset session
            </VaultButton>
          </div>
        </div>
      </div>
    );
  }
}