import * as React from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { VaultBadge, VaultButton, VaultCard, VaultInput } from '@rbac/ui';
import { useLogin } from '../hooks/use-auth';
import { useAuthStore } from '../store/auth-store';
import { ApiError } from '../../../lib/api-client';

/**
 * Vault login screen.
 *
 * Viewport behaviour follows the design system rules:
 *  - 360px / 390px / 430px — single column, 12px gutters, full-width card;
 *  - 768px — centred card at a fixed comfortable width;
 *  - 1024px+ — centred within the vault shell with the console framing.
 *
 * State cues never depend on hover: the submit button carries a pressed fill, an
 * explicit focus halo, a spinner while authenticating, and the error is rendered
 * as a persistent bordered block with an `aria-live` region rather than a
 * transient colour change.
 */
export const LoginForm: React.FC = () => {
  const [email, setEmail] = React.useState('');
  const [password, setPassword] = React.useState('');
  const [fieldErrors, setFieldErrors] = React.useState<{ email?: string; password?: string }>({});
  const [formError, setFormError] = React.useState<string | null>(null);

  const loginMutation = useLogin();
  const navigate = useNavigate();
  const location = useLocation();
  const terminatedReason = useAuthStore((state) => state.terminatedReason);

  const redirectTo = (location.state as { from?: string } | null)?.from ?? '/';

  const validate = (): boolean => {
    const next: { email?: string; password?: string } = {};

    if (email.trim().length === 0) {
      next.email = 'Security identity is required.';
    } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
      next.email = 'Enter a valid email address.';
    }

    if (password.length === 0) {
      next.password = 'Passphrase is required.';
    } else if (password.length < 8) {
      next.password = 'Passphrase must be at least 8 characters.';
    }

    setFieldErrors(next);
    return Object.keys(next).length === 0;
  };

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>): Promise<void> => {
    event.preventDefault();
    setFormError(null);

    if (!validate()) return;

    try {
      await loginMutation.mutateAsync({ email: email.trim(), password });
      navigate(redirectTo, { replace: true });
    } catch (error: unknown) {
      setFormError(
        error instanceof ApiError
          ? error.message
          : 'The vault is unreachable. Verify connectivity and try again.'
      );
    }
  };

  return (
    <main className="min-h-dvh bg-vault-bg text-vault-text-primary font-sans flex flex-col">
      <header className="flex items-center justify-between gap-3 px-3 py-3 tablet:px-6">
        <div className="flex items-center gap-2 min-w-0">
          <span
            aria-hidden="true"
            className="w-2.5 h-2.5 bg-vault-accent border border-vault-accent shrink-0"
          />
          <span className="text-[11px] font-mono uppercase tracking-[0.3em] text-vault-text-secondary truncate">
            Vault Secure Gateway
          </span>
        </div>
        <VaultBadge variant="neutral" indicator="square">
          Encrypted
        </VaultBadge>
      </header>

      <div className="flex-1 flex items-center justify-center px-3 pb-8 tablet:px-6">
        <div className="w-full max-w-[420px]">
          <VaultCard
            title="Security Clearance Challenge"
            subtitle="Identity authentication required to enter the vault"
            className="w-full"
          >
            <form onSubmit={(event) => void handleSubmit(event)} noValidate>
              <div className="flex flex-col gap-4">
                {terminatedReason && !formError ? (
                  <p
                    role="status"
                    className="text-xs font-mono text-vault-warning border border-vault-warning-border bg-vault-warning-surface px-3 py-2 leading-relaxed"
                  >
                    {terminatedReason}
                  </p>
                ) : null}

                {formError ? (
                  <div
                    role="alert"
                    aria-live="assertive"
                    className="text-xs font-mono text-vault-danger border border-vault-danger-border bg-vault-danger-surface px-3 py-2 leading-relaxed"
                  >
                    {formError}
                  </div>
                ) : null}

                <VaultInput
                  label="Security Identity Email"
                  type="email"
                  name="email"
                  autoComplete="username"
                  inputMode="email"
                  placeholder="operator@vault.internal"
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  error={fieldErrors.email}
                  helperText="The address provisioned for this vault tenant."
                  required
                  autoFocus
                />

                <VaultInput
                  label="Cryptographic Passphrase"
                  type="password"
                  name="password"
                  autoComplete="current-password"
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  error={fieldErrors.password}
                  helperText="At least 8 characters. Sessions expire after 15 minutes of inactivity."
                  required
                />

                <VaultButton
                  type="submit"
                  variant="primary"
                  isLoading={loginMutation.isPending}
                  className="w-full"
                >
                  Authenticate Key
                </VaultButton>

                <p className="text-[11px] font-mono text-vault-text-tertiary leading-relaxed text-center">
                  Sessions are bound to this device. Signing out revokes the refresh
                  credential server-side.
                </p>
              </div>
            </form>
          </VaultCard>
        </div>
      </div>
    </main>
  );
};
LoginForm.displayName = 'LoginForm';