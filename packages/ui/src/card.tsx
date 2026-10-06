import * as React from 'react';

export interface VaultCardProps {
  title?: string;
  subtitle?: string;
  action?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}

export const VaultCard: React.FC<VaultCardProps> = ({ title, subtitle, action, children, className = '' }) => {
  return (
    <div className={`bg-vault-surface border border-vault-border p-4 md:p-6 flex flex-col ${className}`}>
      {(title || action) && (
        <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-4 mb-4 border-b border-vault-border gap-2">
          <div>
            {title && <h3 className="text-sm md:text-base font-mono font-bold uppercase tracking-wider text-vault-text-primary">{title}</h3>}
            {subtitle && <p className="text-xs font-mono text-vault-text-tertiary mt-0.5">{subtitle}</p>}
          </div>
          {action && <div className="self-start sm:self-auto">{action}</div>}
        </div>
      )}
      <div className="w-full">{children}</div>
    </div>
  );
};
