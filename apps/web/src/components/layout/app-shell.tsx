import * as React from 'react';
import { Outlet, useNavigate } from 'react-router-dom';
import { useAuthStore } from '../../features/auth/store/auth-store';
import { VaultBadge, VaultButton } from '@rbac/ui';

export const AppShell: React.FC = () => {
  const { user, clearAuth } = useAuthStore();
  const navigate = useNavigate();

  const handleLogout = () => {
    clearAuth();
    navigate('/login');
  };

  return (
    <div className="min-h-screen bg-vault-bg text-vault-text-primary flex flex-col font-sans">
      <header className="h-16 border-b border-vault-border bg-vault-surface flex items-center justify-between px-4 sm:px-6">
        <div className="flex items-center space-x-3">
          <div className="w-3 h-3 bg-vault-accent border border-vault-accent-border animate-pulse" />
          <h1 className="text-sm font-mono font-bold tracking-widest uppercase">
            SECURE ACCESS PORTAL
          </h1>
        </div>
        {user ? (
          <div className="flex items-center space-x-4">
            <div className="hidden sm:flex flex-col text-right">
              <span className="text-xs font-mono text-vault-text-secondary">{user.email}</span>
              <span className="text-[10px] font-mono text-vault-accent uppercase">{user.role}</span>
            </div>
            <VaultBadge variant="emerald">{user.role}</VaultBadge>
            <VaultButton variant="ghost" onClick={handleLogout} className="text-xs">
              TERMINATE
            </VaultButton>
          </div>
        ) : null}
      </header>
      <main className="flex-1 w-full max-w-7xl mx-auto p-4 sm:p-6 lg:p-8">
        <Outlet />
      </main>
    </div>
  );
};
