import * as React from 'react';
import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import { VaultBadge, VaultButton } from '@rbac/ui';
import { useAuthStore } from '../../features/auth/store/auth-store';
import { useLogout } from '../../features/auth/hooks/use-auth';
import { resetVaultSession } from '../error/vault-error-boundary';
import { hasPermission, type Permission } from '@rbac/shared';

/**
 * Authenticated application shell.
 *
 * Responsive structure:
 *  - 360 / 390 / 430px — a single sticky header (brand + clearance badge +
 *    terminate control) and a fixed bottom tab bar for primary navigation, padded
 *    by `env(safe-area-inset-bottom)` so the iOS home indicator never covers a tab.
 *  - 768px — header and inline navigation sit on one row; the bottom bar is gone.
 *  - 1024px+ — the same row with a wider content well and full metadata.
 *
 * Security context is always on screen: the signed-in identity, its role badge
 * and the session state are visible without interaction, so an operator can tell
 * *which* clearance they are acting under at any moment.
 *
 * Every interactive target in the shell — tabs and the terminate control — carries
 * a 44px minimum bounding box.
 */

interface NavItem {
  to: string;
  label: string;
  permission: Permission;
  glyph: string;
}

const NAV_ITEMS: NavItem[] = [
  { to: '/', label: 'Invitations', permission: 'invitations:read', glyph: '◫' },
  { to: '/audit', label: 'Audit', permission: 'audit:read', glyph: '⛨' },
];

export const AppShell: React.FC = () => {
  const user = useAuthStore((state) => state.user);
  const navigate = useNavigate();
  const logoutMutation = useLogout();

  const subject = user ? { role: user.role, permissions: user.permissions } : null;
  const visibleNav = NAV_ITEMS.filter(
    (item) => subject !== null && hasPermission(subject, item.permission)
  );

  const handleTerminate = async (): Promise<void> => {
    // The server revokes the refresh digest; the store clears in `onSettled`
    // either way, so the UI never leaves the operator half-signed-in.
    await logoutMutation.mutateAsync().catch(() => undefined);
    navigate('/login', { replace: true });
  };

  return (
    <div className="min-h-dvh bg-vault-bg text-vault-text-primary font-sans flex flex-col">
      <header className="sticky top-0 z-40 border-b border-vault-border bg-vault-surface">
        <div className="mx-auto w-full max-w-7xl px-3 tablet:px-6">
          <div className="flex min-h-[56px] items-center justify-between gap-3">
            <div className="flex min-w-0 items-center gap-2">
              <span
                aria-hidden="true"
                className="w-2.5 h-2.5 bg-vault-accent border border-vault-accent shrink-0"
              />
              <span className="text-[11px] font-mono uppercase tracking-[0.25em] text-vault-text-secondary truncate">
                Vault Portal
              </span>
            </div>

            {/* Security context: identity, clearance and session state. */}
            <div className="flex items-center gap-2 min-w-0">
              {user ? (
                <>
                  <div className="hidden tablet:flex flex-col items-end leading-tight min-w-0">
                    <span className="text-[11px] font-mono text-vault-text-secondary truncate max-w-[220px]">
                      {user.email}
                    </span>
                    <span className="text-[10px] font-mono uppercase tracking-widest text-vault-text-tertiary">
                      Session active · {user.status.toLowerCase()}
                    </span>
                  </div>
                  <VaultBadge variant="emerald" indicator="dot">
                    {user.role}
                  </VaultBadge>
                  <VaultButton
                    variant="ghost"
                    className="shrink-0"
                    onClick={() => void handleTerminate()}
                    isLoading={logoutMutation.isPending}
                  >
                    <span aria-hidden="true">⏻</span>
                    <span className="hidden tablet:inline">Terminate</span>
                    <span className="sr-only tablet:hidden">Terminate session</span>
                  </VaultButton>
                </>
              ) : null}
            </div>
          </div>

          {/* Inline navigation — tablet and up. */}
          {visibleNav.length > 0 ? (
            <nav aria-label="Primary" className="hidden tablet:flex items-center gap-1 pb-2">
              {visibleNav.map((item) => (
                <NavLink
                  key={item.to}
                  to={item.to}
                  end={item.to === '/'}
                  className={({ isActive }) =>
                    [
                      'inline-flex min-h-[44px] items-center gap-2 px-3 border text-[11px] font-mono uppercase tracking-widest transition-colors',
                      'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-vault-accent focus-visible:ring-offset-2 focus-visible:ring-offset-vault-surface',
                      isActive
                        ? 'bg-vault-accent-surface text-vault-accent border-vault-accent-border'
                        : 'bg-transparent text-vault-text-secondary border-transparent active:bg-vault-surface-hover',
                    ].join(' ')
                  }
                >
                  <span aria-hidden="true">{item.glyph}</span>
                  {item.label}
                </NavLink>
              ))}
            </nav>
          ) : null}
        </div>
      </header>

      <main className="flex-1 w-full max-w-7xl mx-auto px-3 tablet:px-6 py-4 tablet:py-6 desktop:py-8">
        <Outlet />
      </main>

      {/* Bottom tab bar — phones and small tablets. */}
      {visibleNav.length > 0 ? (
        <nav
          aria-label="Primary"
          className="tablet:hidden fixed bottom-0 inset-x-0 z-40 border-t border-vault-border bg-vault-surface/95 backdrop-blur-sm"
          style={{ paddingBottom: 'max(env(safe-area-inset-bottom, 0px), 8px)' }}
        >
          <ul className="flex items-stretch">
            {visibleNav.map((item) => (
              <li key={item.to} className="flex-1">
                <NavLink
                  to={item.to}
                  end={item.to === '/'}
                  className={({ isActive }) =>
                    [
                      'flex min-h-[48px] flex-col items-center justify-center gap-1 px-2',
                      'text-[10px] font-mono uppercase tracking-widest transition-colors',
                      'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-vault-accent',
                      isActive
                        ? 'text-vault-accent bg-vault-accent-surface'
                        : 'text-vault-text-secondary active:bg-vault-surface-hover',
                    ].join(' ')
                  }
                >
                  <span aria-hidden="true" className="text-sm leading-none">
                    {item.glyph}
                  </span>
                  {item.label}
                </NavLink>
              </li>
            ))}
            <li className="flex-1">
              <button
                type="button"
                onClick={resetVaultSession}
                className="w-full min-h-[48px] flex flex-col items-center justify-center gap-1 px-2 text-[10px] font-mono uppercase tracking-widest text-vault-text-secondary active:bg-vault-surface-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-vault-accent"
              >
                <span aria-hidden="true" className="text-sm leading-none">
                  ⏻
                </span>
                Reset
              </button>
            </li>
          </ul>
        </nav>
      ) : null}

      {/* Spacer so the fixed tab bar never occludes the last row of content. */}
      {visibleNav.length > 0 ? <div className="tablet:hidden h-16" aria-hidden="true" /> : null}
    </div>
  );
};
AppShell.displayName = 'AppShell';