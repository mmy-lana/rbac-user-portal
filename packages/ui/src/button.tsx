import * as React from 'react';

export interface VaultButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'danger' | 'ghost';
  isLoading?: boolean;
}

export const VaultButton = React.forwardRef<HTMLButtonElement, VaultButtonProps>(
  ({ variant = 'primary', isLoading = false, children, disabled, className = '', ...props }, ref) => {
    const baseStyles =
      'min-h-[44px] min-w-[44px] px-4 py-2 text-xs uppercase tracking-widest font-mono font-semibold select-none flex items-center justify-center transition-all duration-150 border active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-offset-vault-bg disabled:opacity-50 disabled:pointer-events-none cursor-pointer';

    const variants = {
      primary:
        'bg-vault-accent text-vault-bg border-vault-accent hover:brightness-110 active:brightness-95 focus-visible:ring-vault-accent',
      secondary:
        'bg-vault-surface-elevated text-vault-text-primary border-vault-border active:bg-vault-surface-hover focus-visible:ring-vault-border-bright',
      danger:
        'bg-vault-danger-surface text-vault-danger border-vault-danger-border active:bg-vault-danger active:text-vault-bg focus-visible:ring-vault-danger',
      ghost:
        'bg-transparent text-vault-text-secondary border-transparent active:bg-vault-surface focus-visible:ring-vault-border',
    };

    return (
      <button
        ref={ref}
        disabled={disabled || isLoading}
        className={`${baseStyles} ${variants[variant]} ${className}`}
        {...props}
      >
        {isLoading ? (
          <span className="inline-block w-4 h-4 border-2 border-current border-t-transparent animate-spin rounded-full" />
        ) : (
          children
        )}
      </button>
    );
  }
);
VaultButton.displayName = 'VaultButton';
