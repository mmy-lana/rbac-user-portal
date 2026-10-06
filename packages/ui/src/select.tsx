import * as React from 'react';
import { cn } from './utils/cn';

export interface VaultSelectOption {
  value: string;
  label: string;
  disabled?: boolean;
}

export interface VaultSelectProps
  extends Omit<React.SelectHTMLAttributes<HTMLSelectElement>, 'size' | 'children'> {
  label: string;
  options: readonly VaultSelectOption[];
  error?: string | undefined;
  helperText?: string | undefined;
}

/**
 * Native select, vault-styled.
 *
 * A native control is deliberate: it inherits the platform picker on mobile,
 * which is larger, faster and more accessible than any custom listbox, and it
 * keeps keyboard and screen-reader behaviour correct for free. The 44px minimum
 * height preserves the touch-target contract on phones.
 *
 * The chevron is a background layer, not a positioned overlay, so it can never
 * intercept a tap meant for the control itself.
 */
export const VaultSelect = React.forwardRef<HTMLSelectElement, VaultSelectProps>(
  ({ label, options, error, helperText, id, className, required, ...props }, ref) => {
    const generatedId = React.useId();
    const selectId = id ?? generatedId;
    const messageId = `${selectId}-message`;

    const hasError = typeof error === 'string' && error.length > 0;
    const message = hasError ? error : helperText;

    return (
      <div className="w-full flex flex-col space-y-1.5">
        <label
          htmlFor={selectId}
          className="text-xs font-mono uppercase tracking-wider text-vault-text-secondary flex items-center gap-1"
        >
          {label}
          {required === true && (
            <span aria-hidden="true" className="text-vault-danger">
              *
            </span>
          )}
        </label>

        <div className="relative">
          <select
            id={selectId}
            ref={ref}
            required={required}
            aria-invalid={hasError || undefined}
            aria-describedby={message ? messageId : undefined}
            className={cn(
              'w-full min-h-[44px] pl-3.5 pr-10 py-2 appearance-none',
              'bg-vault-surface text-vault-text-primary font-mono text-sm border',
              'transition-colors outline-none',
              hasError
                ? 'border-vault-danger focus-visible:ring-vault-danger'
                : 'border-vault-border focus-visible:border-vault-accent',
              'focus-visible:ring-2 focus-visible:ring-offset-1 focus-visible:ring-offset-vault-bg focus-visible:ring-vault-accent',
              'disabled:opacity-60 disabled:cursor-not-allowed',
              className
            )}
            style={{
              backgroundImage:
                "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='%2394a3b8' stroke-width='2'%3E%3Cpath d='m6 9 6 6 6-6'/%3E%3C/svg%3E\")",
              backgroundRepeat: 'no-repeat',
              backgroundPosition: 'right 0.75rem center',
              backgroundSize: '1rem 1rem',
            }}
            {...props}
          >
            {options.map((option) => (
              <option key={option.value} value={option.value} disabled={option.disabled}>
                {option.label}
              </option>
            ))}
          </select>
        </div>

        {message !== undefined && message !== null && message !== '' ? (
          <p
            id={messageId}
            aria-live="polite"
            className={cn(
              'text-xs font-mono leading-tight',
              hasError ? 'text-vault-danger' : 'text-vault-text-tertiary'
            )}
          >
            {message}
          </p>
        ) : null}
      </div>
    );
  }
);
VaultSelect.displayName = 'VaultSelect';