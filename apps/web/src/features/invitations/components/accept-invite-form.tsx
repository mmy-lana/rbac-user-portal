import * as React from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { VaultCard, VaultInput, VaultButton, VaultBadge } from '@rbac/ui';
import { useAuthStore } from '../../auth/store/auth-store';

export const AcceptInviteForm: React.FC = () => {
  const { token } = useParams<{ token: string }>();
  const [role, setRole] = React.useState<string | null>(null);
  const [firstName, setFirstName] = React.useState('');
  const [lastName, setLastName] = React.useState('');
  const [password, setPassword] = React.useState('');
  const [confirmPassword, setConfirmPassword] = React.useState('');
  const [error, setError] = React.useState('');
  const [loading, setLoading] = React.useState(false);
  const [validating, setValidating] = React.useState(true);
  const setSession = useAuthStore((s) => s.setSession);
  const navigate = useNavigate();

  React.useEffect(() => {
    async function validate() {
      try {
        const res = await fetch(`http://localhost:3000/api/v1/invitations/validate/${token}`);
        const json = await res.json();
        if (!res.ok) {
          throw new Error(json.error?.message || 'Token verification failed');
        }
        setRole(json.data.role);
      } catch (err: unknown) {
        setError(err instanceof Error ? err.message : 'Invalid invitation credential');
      } finally {
        setValidating(false);
      }
    }
    if (token) {
      validate();
    }
  }, [token]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (password !== confirmPassword) {
      setError('Passphrase verification mismatch');
      return;
    }

    setLoading(true);
    setError('');

    try {
      const res = await fetch(`http://localhost:3000/api/v1/invitations/accept/${token}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ firstName, lastName, password }),
        credentials: 'include',
      });

      const json = await res.json();
      if (!res.ok) {
        throw new Error(json.error?.message || 'Clearance authorization failed');
      }

      setSession(json.data.user, json.data.tokens.accessToken);
      navigate('/');
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Submission rejected');
    } finally {
      setLoading(false);
    }
  };

  if (validating) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4">
        <span className="text-xs font-mono text-vault-accent animate-pulse uppercase tracking-widest">
          CHECKING CLEARANCE CREDENTIALS...
        </span>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-4">
      <VaultCard
        title="CREDENTIAL FINALIZATION"
        subtitle={role ? `ASSIGNED ENCLAVE PRIVILEGE: ${role}` : 'IDENTITY SETUP'}
        className="w-full max-w-md"
      >
        {role ? (
          <div className="mb-4">
            <VaultBadge variant="cyan">ASSIGNED LEVEL: {role}</VaultBadge>
          </div>
        ) : null}
        <form onSubmit={handleSubmit} className="space-y-4">
          <VaultInput
            label="First Identity Name"
            value={firstName}
            onChange={(e) => setFirstName(e.target.value)}
            required
          />
          <VaultInput
            label="Last Identity Name"
            value={lastName}
            onChange={(e) => setLastName(e.target.value)}
            required
          />
          <VaultInput
            label="Passphrase Key"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
          />
          <VaultInput
            label="Confirm Passphrase Key"
            type="password"
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            required
          />
          {error ? <p className="text-xs font-mono text-vault-danger">{error}</p> : null}
          <VaultButton type="submit" variant="primary" isLoading={loading} className="w-full">
            FINALIZE CLEARANCE
          </VaultButton>
        </form>
      </VaultCard>
    </div>
  );
};
