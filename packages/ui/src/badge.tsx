import * as React from 'react';
import { cn } from './utils/cn';

/**
 * Security severity tokens. The names map 1:1 onto the design-system theme
 * colours so a badge never hard-codes a hex value:
 *
 *  - `emerald` — granted / active / verified (accent).
 *  - `cyan`    — informational / in-flight (encrypted, pending confirmation).
 *  - `amber`   — warning / expiring / suspended.
 *  - `crimson` — destructive / revoked / denied.
 *  - `neutral` — inert / unknown / archived.
 */
export type VaultBadgeVariant = 'emerald' | 'amber' | 'crimson' | 'cyan' | 'neutral';

export interface VaultBadgeProps extends React.HTMLAttributes<HTMLSpanElement> {
  variant: VaultBadgeVariant;
  children: React.ReactNode;
  /**
   * Renders a non-colour cue next to the label. Colour alone is never the sole
   * carrier of status, so a status badge should always ship its own text.
   */
  indicator?: 'dot' | 'square' | 'none';
}

const BADGE_VARIANTS: Record<VaultBadgeVariant, string> = {
  emerald: 'bg-vault-accent-surface text-vault-accent border-vault-accent-border',
  amber: 'bg-vault-warning-surface text-vault-warning border-vault-warning-border',
  crimson: 'bg-vault-danger-surface text-vault-danger border-vault-danger-border',
  cyan: 'bg-vault-cyan-surface text-vault-cyan border-vault-cyan-border',
  neutral: 'bg-vault-surface text-vault-text-secondary border-vault-border',
};

/**
 * Status pill. Intentionally **not** an interactive element — badges are never
 * focusable, so the 44x44 touch-target rule does not apply to them.
 */
export const VaultBadge: React.FC<VaultBadgeProps> = ({
  variant,
  children,
  className,
  indicator = 'none',
  ...props
}) => {
  return (
    <span
      data-variant={variant}
      className={cn(
        'inline-flex items-center gap-1.5 min-h-[24px] px-2 py-0.5',
        'text-[11px] font-mono tracking-widest uppercase border',
        BADGE_VARIANTS[variant],
        className
      )}
      {...props}
    >
      {indicator === 'dot' && (
        <span aria-hidden="true" className="w-1.5 h-1.5 rounded-full bg-current shrink-0" />
      )}
      {indicator === 'square' && (
        <span aria-hidden="true" className="w-1.5 h-1.5 bg-current shrink-0" />
      )}
      {children}
    </span>
  );
};
VaultBadge.displayName = 'VaultBadge';