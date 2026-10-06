import * as React from 'react';
import { cn } from './utils/cn';

export interface VaultInputProps
  extends Omit<React.InputHTMLAttributes<HTMLInputElement>, 'size'> {
  label: string;
  /** Error message. Presence flips the field into the destructive status. */
  error?: string;
  /** Supporting copy shown only while the field is valid. */
  helperText?: string;
  /** Renders the field in a busy/pending status (e.g. validating a claim token). */
  isPending?: boolean;
}

/**
 * Text field primitive.
 *
 * Accessibility contract:
 *  - the `<label>` is always associated through a stable generated id;
 *  - `aria-invalid` is set only when an error is present, so screen readers
 *    announce "invalid entry" once rather than on every render;
 *  - `aria-describedby` points at whichever message is currently rendered, and
 *    the message region is an `aria-live` node so it is announced when it appears.
 *
 * Geometry: `min-h-[44px]` keeps the tap target compliant at every viewport.
 */
export const VaultInput = React.forwardRef<HTMLInputElement, VaultInputProps>(
  (
    { label, error, helperText, id, className, isPending = false, required, ...props },
    ref
  ) => {
    const generatedId = React.useId();
    const inputId = id ?? generatedId;
    const messageId = `${inputId}-message`;

    const hasError = typeof error === 'string' && error.length > 0;
    const message = hasError ? error : helperText;

    return (
      <div className="w-full flex flex-col space-y-1.5">
        <label
          htmlFor={inputId}
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
          <input
            id={inputId}
            ref={ref}
            required={required}
            aria-invalid={hasError || undefined}
            aria-describedby={message ? messageId : undefined}
            aria-busy={isPending || undefined}
            className={cn(
              'w-full min-h-[44px] px-3.5 py-2 bg-vault-surface text-vault-text-primary',
              'font-mono text-sm border transition-colors outline-none',
              'placeholder:text-vault-text-tertiary placeholder:font-mono',
              'disabled:opacity-60 disabled:cursor-not-allowed',
              'focus-visible:ring-2 focus-visible:ring-offset-1 focus-visible:ring-offset-vault-bg',
              hasError
                ? 'border-vault-danger focus-visible:ring-vault-danger'
                : 'border-vault-border focus-visible:border-vault-accent focus-visible:ring-vault-accent',
              className
            )}
            {...props}
          />
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
VaultInput.displayName = 'VaultInput';