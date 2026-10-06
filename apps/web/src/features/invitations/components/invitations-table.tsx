import * as React from 'react';
import { VaultCard, VaultButton, VaultBadge, VaultInput } from '@rbac/ui';
import { useAuthStore } from '../../auth/store/auth-store';
import { InvitationEntity, SystemRole } from '@rbac/shared';

export const InvitationsTable: React.FC = () => {
  const { accessToken, user } = useAuthStore();
  const [invitations, setInvitations] = React.useState<InvitationEntity[]>([]);
  const [emailInput, setEmailInput] = React.useState('');
  const [roleInput, setRoleInput] = React.useState('rol_00000000-0000-0000-0000-000000000004');
  const [loading, setLoading] = React.useState(false);
  const [createdUrl, setCreatedUrl] = React.useState('');

  const fetchInvitations = React.useCallback(async () => {
    if (!accessToken) return;
    try {
      const res = await fetch('http://localhost:3000/api/v1/invitations', {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      const json = await res.json();
      if (res.ok) {
        setInvitations(json.data || []);
      }
    } catch {
      // Fallback network catch
    }
  }, [accessToken]);

  React.useEffect(() => {
    fetchInvitations();
  }, [fetchInvitations]);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!accessToken) return;
    setLoading(true);
    try {
      const res = await fetch('http://localhost:3000/api/v1/invitations', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify({ email: emailInput, roleId: roleInput }),
      });
      const json = await res.json();
      if (res.ok) {
        setEmailInput('');
        setCreatedUrl(json.data.invitationUrl);
        fetchInvitations();
      }
    } finally {
      setLoading(false);
    }
  };

  const handleRevoke = async (id: string) => {
    if (!accessToken) return;
    try {
      const res = await fetch(`http://localhost:3000/api/v1/invitations/${id}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      if (res.ok) {
        fetchInvitations();
      }
    } catch {
      // Catch network error
    }
  };

  const canCreate = user?.role === SystemRole.OWNER || user?.role === SystemRole.ADMIN;

  return (
    <div className="space-y-6">
      {canCreate ? (
        <VaultCard title="DISPATCH ENCLAVE INVITATION" subtitle="GENERATE CRYPTOGRAPHIC ONBOARDING CLEARANCE">
          <form onSubmit={handleCreate} className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <VaultInput
                label="Target Identity Email"
                type="email"
                value={emailInput}
                onChange={(e) => setEmailInput(e.target.value)}
                required
              />
              <div className="flex flex-col space-y-1.5">
                <label className="text-xs font-mono uppercase tracking-wider text-vault-text-secondary">
                  Authorization Level
                </label>
                <select
                  value={roleInput}
                  onChange={(e) => setRoleInput(e.target.value)}
                  className="min-h-[44px] px-3.5 py-2 bg-vault-surface text-vault-text-primary font-mono text-sm border border-vault-border outline-none focus-visible:ring-2 focus-visible:ring-vault-accent"
                >
                  <option value="rol_00000000-0000-0000-0000-000000000004">MEMBER</option>
                  <option value="rol_00000000-0000-0000-0000-000000000003">AUDITOR</option>
                  <option value="rol_00000000-0000-0000-0000-000000000002">ADMIN</option>
                </select>
              </div>
            </div>
            <VaultButton type="submit" variant="primary" isLoading={loading} className="w-full sm:w-auto">
              ISSUE INVITATION
            </VaultButton>
          </form>

          {createdUrl ? (
            <div className="mt-4 p-3 bg-vault-bg border border-vault-accent-border font-mono text-xs break-all">
              <span className="text-vault-accent">SECURE TOKEN LINK:</span> {createdUrl}
            </div>
          ) : null}
        </VaultCard>
      ) : null}

      <VaultCard title="PORTAL CLEARANCE INVITATIONS" subtitle="AUDITABLE LEDGER OF ACTIVE AND CONSUMED KEYS">
        <div className="overflow-x-auto">
          <table className="w-full text-left font-mono text-xs border-collapse">
            <thead>
              <tr className="border-b border-vault-border text-vault-text-secondary">
                <th className="py-3 px-4">IDENTITY</th>
                <th className="py-3 px-4">ROLE</th>
                <th className="py-3 px-4">STATUS</th>
                <th className="py-3 px-4">EXPIRATION</th>
                <th className="py-3 px-4 text-right">ACTION</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-vault-border">
              {invitations.length === 0 ? (
                <tr>
                  <td colSpan={5} className="py-6 text-center text-vault-text-tertiary">
                    NO RECORDED CLEARANCE VECTORS FOUND
                  </td>
                </tr>
              ) : (
                invitations.map((inv) => (
                  <tr key={inv.id} className="hover:bg-vault-surface-elevated/50">
                    <td className="py-3 px-4">{inv.email}</td>
                    <td className="py-3 px-4">
                      <VaultBadge variant="cyan">{inv.role}</VaultBadge>
                    </td>
                    <td className="py-3 px-4">
                      <VaultBadge
                        variant={
                          inv.status === 'PENDING'
                            ? 'amber'
                            : inv.status === 'ACCEPTED'
                            ? 'emerald'
                            : 'crimson'
                        }
                      >
                        {inv.status}
                      </VaultBadge>
                    </td>
                    <td className="py-3 px-4 text-vault-text-tertiary">
                      {new Date(inv.expiresAt).toLocaleDateString()}
                    </td>
                    <td className="py-3 px-4 text-right">
                      {inv.status === 'PENDING' && canCreate ? (
                        <VaultButton
                          variant="danger"
                          onClick={() => handleRevoke(inv.id)}
                          className="min-h-[36px] py-1 px-3 text-[10px]"
                        >
                          REVOKE
                        </VaultButton>
                      ) : (
                        <span className="text-vault-text-tertiary">IMMUTABLE</span>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </VaultCard>
    </div>
  );
};
