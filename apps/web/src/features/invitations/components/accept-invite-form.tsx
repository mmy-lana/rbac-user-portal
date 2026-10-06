import * as React from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { VaultBadge, VaultButton, VaultCard, VaultInput } from '@rbac/ui';
import {
  MIN_PASSWORD_LENGTH,
  ROLE_LABELS,
  type MeResponseDto,
  type SystemRole,
} from '@rbac/shared';
import { useAcceptInvitation, useValidateInvitationToken } from '../hooks/use-invitations';
import { useAuthStore } from '../../auth/store/auth-store';
import { ApiError } from '../../../lib/api-client';

/**
 * Public invitation claim screen.
 *
 * Data minimisation: the target email is **not** shown before the claim. It is
 * revealed only on the completion screen, sourced from the `UserEntity` returned
 * by the accept response, so an anonymous visitor cannot use this page to confirm
 * whether a given address is registered.
 *
 * Token handling: the raw claim token is read strictly from the route parameter.
 * It is never taken from the query string, because query strings land verbatim in
 * access logs, analytics payloads and `Referer` headers.
 *
 * Viewports:
 *  - 360 / 390 / 430px — centred card at 100% width with zero side margins, a
 *    security status banner on top, stacked full-width fields and an 8-segment
 *    strength meter; the submit control is 48px tall.
 *  - 768px and up — the card centres on both axes at a fixed 480px inside the
 *    bordered console field.
 */

const STRENGTH_SEGMENTS = 8;

/**
 * Coarse passphrase strength estimate.
 *
 * This is an interface affordance, not a security control — the server applies
 * the real constraints — so it favours clear, explainable signals (length, class
 * diversity) over an opaque score.
 */
function scorePassphrase(passphrase: string): number {
  if (passphrase.length === 0) return 0;

  let score = passphrase.length >= MIN_PASSWORD_LENGTH ? 3 : 1;
  if (passphrase.length >= 16) score += 2;
  if (/[a-z]/.test(passphrase) && /[A-Z]/.test(passphrase)) score += 1;
  if (/\d/.test(passphrase)) score += 1;
  if (/[^A-Za-z0-9]/.test(passphrase)) score += 1;

  return Math.min(STRENGTH_SEGMENTS, score);
}

function strengthLabel(score: number): string {
  if (score <= 2) return 'Weak — add length and character variety';
  if (score <= 5) return 'Fair — add length or a symbol';
  return 'Strong — suitable for a vault identity';
}

type ClaimPhase =
  | { kind: 'validating' }
  | { kind: 'rejected'; reason: string }
  | { kind: 'form' }
  | { kind: 'complete'; user: MeResponseDto };

export const AcceptInviteForm: React.FC = () => {
  // Path parameter only — `useSearchParams` is deliberately not used here.
  const { token } = useParams<{ token: string }>();

  const validation = useValidateInvitationToken(token);
  const acceptMutation = useAcceptInvitation();
  const setSession = useAuthStore((state) => state.setSession);
  const navigate = useNavigate();

  const [phase, setPhase] = React.useState<ClaimPhase>({ kind: 'validating' });
  const [firstName, setFirstName] = React.useState('');
  const [lastName, setLastName] = React.useState('');
  const [password, setPassword] = React.useState('');
  const [confirmPassword, setConfirmPassword] = React.useState('');
  const [fieldErrors, setFieldErrors] = React.useState<Record<string, string>>({});
  const [submitError, setSubmitError] = React.useState<string | null>(null);

  // Fold the token probe result into the screen's phase machine.
  React.useEffect(() => {
    const result = validation.data;
    if (result === undefined) return;

    if (result.status === 'rejected') {
      setPhase({ kind: 'rejected', reason: result.reason });
      return;
    }
    setPhase({ kind: 'form' });
  }, [validation.data]);

  const strength = scorePassphrase(password);

  const issuedRole: SystemRole | null = React.useMemo(() => {
    const result = validation.data;
    return result && result.status === 'valid' ? result.role : null;
  }, [validation.data]);

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>): Promise<void> => {
    event.preventDefault();
    setSubmitError(null);

    const errors: Record<string, string> = {};
    if (firstName.trim().length === 0) errors['firstName'] = 'First name is required.';
    if (lastName.trim().length === 0) errors['lastName'] = 'Last name is required.';
    if (password.length < MIN_PASSWORD_LENGTH) {
      errors['password'] = `Passphrase must be at least ${MIN_PASSWORD_LENGTH} characters.`;
    }
    if (confirmPassword !== password) {
      errors['confirmPassword'] = 'Passphrases do not match.';
    }

    setFieldErrors(errors);
    if (Object.keys(errors).length > 0) return;

    try {
      const result = await acceptMutation.mutateAsync({
        token: token ?? '',
        firstName: firstName.trim(),
        lastName: lastName.trim(),
        password,
      });
      // Claiming signs the invitee straight in — one session issuance path.
      setSession(result.user, result.tokens.accessToken);
      setPhase({ kind: 'complete', user: result.user });
    } catch (error: unknown) {
      setSubmitError(
        error instanceof ApiError ? error.message : 'The claim could not be completed.'
      );
    }
  };

  const handleFinish = (): void => {
    navigate('/', { replace: true });
  };

  return (
    <main className="min-h-dvh bg-vault-bg text-vault-text-primary font-sans flex flex-col">
      <div className="flex items-center justify-between gap-3 px-3 py-3 border-b border-vault-border bg-vault-surface tablet:px-6">
        <div className="flex items-center gap-2 min-w-0">
          <span aria-hidden="true" className="w-2.5 h-2.5 bg-vault-accent border border-vault-accent shrink-0" />
          <span className="text-[11px] font-mono uppercase tracking-[0.3em] text-vault-text-secondary truncate">
            Vault Secure Gateway
          </span>
        </div>
        <VaultBadge variant="emerald" indicator="dot">
          Channel verified
        </VaultBadge>
      </div>

      <div className="flex-1 flex items-center justify-center py-6 tablet:px-6">
        {phase.kind === 'validating' ? (
          <div role="status" aria-live="polite" className="px-4 text-center">
            <p className="text-xs font-mono uppercase tracking-widest text-vault-accent">
              Verifying claim credential…
            </p>
          </div>
        ) : null}

        {phase.kind === 'rejected' ? (
          <div className="px-3 w-full max-w-[480px]">
            <VaultCard title="Claim rejected" subtitle="This invitation link cannot be used.">
              <div className="flex flex-col gap-4">
                <div
                  role="alert"
                  className="text-xs font-mono text-vault-danger border border-vault-danger-border bg-vault-danger-surface px-3 py-2 leading-relaxed"
                >
                  {phase.reason}
                </div>
                <VaultButton
                  variant="secondary"
                  className="w-full"
                  onClick={() => navigate('/login')}
                >
                  Return to sign in
                </VaultButton>
              </div>
            </VaultCard>
          </div>
        ) : null}

        {phase.kind === 'complete' ? (
          <div className="px-3 w-full max-w-[480px]">
            <VaultCard title="Clearance finalized" subtitle="Your vault identity is now active.">
              <div className="flex flex-col gap-4">
                <div className="flex flex-col gap-2 border border-vault-accent-border bg-vault-accent-surface px-3 py-3">
                  <p className="text-[11px] font-mono uppercase tracking-widest text-vault-text-tertiary">
                    Registered identity
                  </p>
                  <p className="text-sm font-mono text-vault-text-primary break-all">
                    {phase.user.email}
                  </p>
                  <VaultBadge variant="emerald" indicator="square">
                    {phase.user.role}
                  </VaultBadge>
                </div>
                <VaultButton variant="primary" className="w-full" onClick={handleFinish}>
                  Enter the vault
                </VaultButton>
              </div>
            </VaultCard>
          </div>
        ) : null}

        {phase.kind === 'form' ? (
          <div className="w-full max-w-[480px] border border-vault-border">
            <VaultCard
              title="Finalize clearance"
              subtitle={
                issuedRole
                  ? `Assigned enclave privilege: ${ROLE_LABELS[issuedRole]}`
                  : 'Complete identity registration'
              }
            >
              <div className="mb-4">
                <VaultBadge variant="cyan" indicator="square">
                  Role: {issuedRole ? ROLE_LABELS[issuedRole] : 'Assigned'}
                </VaultBadge>
              </div>

              <form onSubmit={(event) => void handleSubmit(event)} noValidate>
                <div className="flex flex-col gap-4">
                  {submitError ? (
                    <p
                      role="alert"
                      className="text-xs font-mono text-vault-danger border border-vault-danger-border bg-vault-danger-surface px-3 py-2"
                    >
                      {submitError}
                    </p>
                  ) : null}

                  <div className="flex flex-col tablet:grid tablet:grid-cols-2 tablet:gap-4 gap-4">
                    <VaultInput
                      label="First name"
                      value={firstName}
                      onChange={(event) => setFirstName(event.target.value)}
                      error={fieldErrors['firstName']}
                      autoComplete="given-name"
                      required
                    />
                    <VaultInput
                      label="Last name"
                      value={lastName}
                      onChange={(event) => setLastName(event.target.value)}
                      error={fieldErrors['lastName']}
                      autoComplete="family-name"
                      required
                    />
                  </div>

                  <VaultInput
                    label="Passphrase"
                    type="password"
                    value={password}
                    onChange={(event) => setPassword(event.target.value)}
                    error={fieldErrors['password']}
                    helperText={`Minimum ${MIN_PASSWORD_LENGTH} characters.`}
                    autoComplete="new-password"
                    required
                  />

                  {/* 8-segment strength meter: an explicit, non-colour-only signal. */}
                  <div>
                    <div
                      role="progressbar"
                      aria-valuemin={0}
                      aria-valuemax={STRENGTH_SEGMENTS}
                      aria-valuenow={strength}
                      aria-label="Passphrase strength"
                      className="flex gap-1"
                    >
                      {Array.from({ length: STRENGTH_SEGMENTS }, (_, index) => (
                        <span
                          key={index}
                          aria-hidden="true"
                          className={
                            index < strength
                              ? 'h-2 flex-1 bg-vault-accent border border-vault-accent'
                              : 'h-2 flex-1 bg-vault-surface-elevated border border-vault-border'
                          }
                        />
                      ))}
                    </div>
                    <p
                      className="mt-1.5 text-[11px] font-mono text-vault-text-tertiary"
                      aria-live="polite"
                    >
                      {strengthLabel(strength)}
                    </p>
                  </div>

                  <VaultInput
                    label="Confirm passphrase"
                    type="password"
                    value={confirmPassword}
                    onChange={(event) => setConfirmPassword(event.target.value)}
                    error={fieldErrors['confirmPassword']}
                    autoComplete="new-password"
                    required
                  />

                  <VaultButton
                    type="submit"
                    variant="primary"
                    isLoading={acceptMutation.isPending}
                    className="w-full"
                    style={{ minHeight: '48px' }}
                  >
                    Finalize clearance
                  </VaultButton>
                </div>
              </form>
            </VaultCard>
          </div>
        ) : null}
      </div>
    </main>
  );
};
AcceptInviteForm.displayName = 'AcceptInviteForm';