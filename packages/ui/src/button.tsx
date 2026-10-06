import * as React from 'react';
import { cn } from './utils/cn';

export type VaultButtonVariant = 'primary' | 'secondary' | 'danger' | 'ghost';

export interface VaultButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: VaultButtonVariant;
  isLoading?: boolean;
}

/**
 * Primary interactive primitive.
 *
 * State model (no hover dependency — every state is legible on a touch device):
 *  - normal   — themed surface + border.
 *  - focus    — `focus-visible:ring-2` halo with a background-coloured offset.
 *  - active   — `active:scale-[0.98]` press feedback plus a variant-specific
 *               solid fill, so a tap is visible without a pointer.
 *  - loading  — spinner replaces the label; the control is disabled and marked
 *               `aria-busy` so assistive tech reports the pending state.
 *  - disabled — 50% opacity, pointer events suppressed.
 *  - destructive — `danger` variant, carrying its own high-contrast active fill
 *               so a destructive tap cannot be confused with a neutral one.
 *
 * Geometry is locked to a minimum 44x44px bounding box (WCAG 2.5.5 / target
 * size rule); override with `size` only for non-interactive decorative usage.
 */
export const VaultButton = React.forwardRef<HTMLButtonElement, VaultButtonProps>(
  (
    {
      variant = 'primary',
      isLoading = false,
      type = 'button',
      children,
      disabled,
      className,
      ...props
    },
    ref
  ) => {
    const baseStyles = cn(
      'min-h-[44px] min-w-[44px] px-4 py-2 text-xs uppercase tracking-widest font-mono font-semibold',
      'select-none flex items-center justify-center gap-2 border',
      'transition-all duration-150 cursor-pointer',
      'active:scale-[0.98]',
      'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-offset-vault-bg',
      'disabled:opacity-50 disabled:pointer-events-none'
    );

    const variants: Record<VaultButtonVariant, string> = {
      primary:
        'bg-vault-accent text-vault-bg border-vault-accent hover:brightness-110 active:brightness-95 active:ring-vault-accent focus-visible:ring-vault-accent',
      secondary:
        'bg-vault-surface-elevated text-vault-text-primary border-vault-border hover:border-vault-border-bright active:bg-vault-surface-hover active:border-vault-border-bright focus-visible:ring-vault-border-bright',
      danger:
        'bg-vault-danger-surface text-vault-danger border-vault-danger-border hover:bg-vault-danger-surface active:bg-vault-danger active:text-vault-bg active:border-vault-danger focus-visible:ring-vault-danger',
      ghost:
        'bg-transparent text-vault-text-secondary border-transparent hover:text-vault-text-primary active:bg-vault-surface active:text-vault-text-primary focus-visible:ring-vault-border',
    };

    return (
      <button
        ref={ref}
        type={type}
        disabled={disabled === true || isLoading}
        aria-busy={isLoading || undefined}
        data-variant={variant}
        data-loading={isLoading ? 'true' : undefined}
        className={cn(baseStyles, variants[variant], className)}
        {...props}
      >
        {isLoading ? (
          <>
            <span
              aria-hidden="true"
              className="inline-block w-4 h-4 border-2 border-current border-t-transparent animate-spin rounded-full shrink-0"
            />
            {/* Visual label is suppressed, but the accessible name survives so
                screen readers announce what is being waited on. */}
            <span className="sr-only">{children}</span>
          </>
        ) : (
          children
        )}
      </button>
    );
  }
);
VaultButton.displayName = 'VaultButton';