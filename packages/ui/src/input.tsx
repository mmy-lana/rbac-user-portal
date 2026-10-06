import * as React from 'react';

export interface VaultInputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label: string;
  error?: string;
  helperText?: string;
}

export const VaultInput = React.forwardRef<HTMLInputElement, VaultInputProps>(
  ({ label, error, helperText, id, className = '', ...props }, ref) => {
    const inputId = id || React.useId();

    return (
      <div className="w-full flex flex-col space-y-1.5">
        <label htmlFor={inputId} className="text-xs font-mono uppercase tracking-wider text-vault-text-secondary">
          {label}
        </label>
        <div className="relative">
          <input
            id={inputId}
            ref={ref}
            className={`w-full min-h-[44px] px-3.5 py-2 bg-vault-surface text-vault-text-primary font-mono text-sm border transition-colors outline-none focus-visible:ring-2 focus-visible:ring-vault-accent focus-visible:ring-offset-1 focus-visible:ring-offset-vault-bg ${
              error
                ? 'border-vault-danger focus-visible:ring-vault-danger'
                : 'border-vault-border focus-visible:border-vault-accent'
            } ${className}`}
            {...props}
          />
        </div>
        {error ? (
          <p className="text-xs font-mono text-vault-danger leading-tight">{error}</p>
        ) : helperText ? (
          <p className="text-xs font-mono text-vault-text-tertiary leading-tight">{helperText}</p>
        ) : null}
      </div>
    );
  }
);
VaultInput.displayName = 'VaultInput';
