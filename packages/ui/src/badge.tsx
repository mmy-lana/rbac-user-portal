import * as React from 'react';

export interface VaultBadgeProps {
  variant: 'emerald' | 'amber' | 'crimson' | 'cyan' | 'neutral';
  children: React.ReactNode;
  className?: string;
}

export const VaultBadge: React.FC<VaultBadgeProps> = ({ variant, children, className = '' }) => {
  const styles = {
    emerald: 'bg-vault-accent-surface text-vault-accent border-vault-accent-border',
    amber: 'bg-vault-warning-surface text-vault-warning border-vault-warning-border',
    crimson: 'bg-vault-danger-surface text-vault-danger border-vault-danger-border',
    cyan: 'bg-vault-cyan-surface text-vault-cyan border-vault-cyan-border',
    neutral: 'bg-vault-surface text-vault-text-secondary border-vault-border',
  };

  return (
    <span
      className={`inline-flex items-center min-h-[24px] px-2 py-0.5 text-[11px] font-mono tracking-widest uppercase border ${styles[variant]} ${className}`}
    >
      {children}
    </span>
  );
};
