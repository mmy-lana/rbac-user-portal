import * as React from 'react';
import { useNavigate } from 'react-router-dom';
import { VaultCard, VaultInput, VaultButton } from '@rbac/ui';
import { useAuthStore } from '../store/auth-store';

export const LoginForm: React.FC = () => {
  const [email, setEmail] = React.useState('owner@vault.internal');
  const [password, setPassword] = React.useState('CorrectHorseBatteryStaple2026!');
  const [error, setError] = React.useState('');
  const [loading, setLoading] = React.useState(false);
  const setAuth = useAuthStore((s) => s.setAuth);
  const navigate = useNavigate();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      const res = await fetch('http://localhost:3000/api/v1/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
        credentials: 'include',
      });

      const json = await res.json();
      if (!res.ok) {
        throw new Error(json.error?.message || 'Authentication check failed');
      }

      setAuth(json.data.user, json.data.tokens.accessToken);
      navigate('/');
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'System clearance refused');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-[80vh] flex items-center justify-center p-4">
      <VaultCard
        title="SECURITY CLEARANCE CHALLENGE"
        subtitle="IDENTITY AUTHENTICATION REQUIRED"
        className="w-full max-w-md"
      >
        <form onSubmit={handleSubmit} className="space-y-4">
          <VaultInput
            label="Security Identity Email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
          />
          <VaultInput
            label="Cryptographic Passphrase"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
          />
          {error ? <p className="text-xs font-mono text-vault-danger">{error}</p> : null}
          <VaultButton type="submit" variant="primary" isLoading={loading} className="w-full">
            AUTHENTICATE KEY
          </VaultButton>
        </form>
      </VaultCard>
    </div>
  );
};
