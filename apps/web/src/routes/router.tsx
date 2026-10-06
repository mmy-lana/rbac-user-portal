import * as React from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import { AppShell } from '../components/layout/app-shell';
import { LoginForm } from '../features/auth/components/login-form';
import { AcceptInviteForm } from '../features/invitations/components/accept-invite-form';
import { InvitationsTable } from '../features/invitations/components/invitations-table';
import { useAuthStore } from '../features/auth/store/auth-store';

export const AppRouter: React.FC = () => {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);

  return (
    <Routes>
      <Route path="/login" element={<LoginForm />} />
      <Route path="/invitations/accept/:token" element={<AcceptInviteForm />} />

      <Route element={<AppShell />}>
        <Route
          path="/"
          element={
            isAuthenticated ? (
              <InvitationsTable />
            ) : (
              <Navigate to="/login" replace />
            )
          }
        />
      </Route>

      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
};
