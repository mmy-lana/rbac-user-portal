# UI Primitives & Design System Specification

## Design Tokens & Theme Specification (Tailwind CSS v4)

Injected directly into `apps/web/src/styles/app.css` using the `@theme` directive:

```css
@import "tailwindcss";

@theme {
  --color-vault-bg: #090a0f;
  --color-vault-surface: #11131a;
  --color-vault-surface-elevated: #181b24;
  --color-vault-surface-hover: #1f232f;
  --color-vault-border: #262b3a;
  --color-vault-border-bright: #3c445c;

  --color-vault-text-primary: #f1f5f9;
  --color-vault-text-secondary: #94a3b8;
  --color-vault-text-tertiary: #64748b;

  --color-vault-accent: #00e599;
  --color-vault-accent-surface: rgba(0, 229, 153, 0.08);
  --color-vault-accent-border: rgba(0, 229, 153, 0.35);

  --color-vault-warning: #f59e0b;
  --color-vault-warning-surface: rgba(245, 158, 11, 0.08);
  --color-vault-warning-border: rgba(245, 158, 11, 0.35);

  --color-vault-danger: #ef4444;
  --color-vault-danger-surface: rgba(239, 68, 68, 0.08);
  --color-vault-danger-border: rgba(239, 68, 68, 0.35);

  --color-vault-cyan: #06b6d4;
  --color-vault-cyan-surface: rgba(6, 182, 212, 0.08);
  --color-vault-cyan-border: rgba(6, 182, 212, 0.35);

  --font-mono: 'JetBrains Mono', 'Fira Code', monospace;
  --font-sans: 'Inter', system-ui, -apple-system, sans-serif;
}
```

## Viewport Layout Rules

- `360px` (Ultra-compact mobile): Single column exclusively. Tables convert into high-density stacked cards. Modals take 100% viewport width and snap to bottom. Margins are fixed at 12px.
- `390px` (Standard mobile): Single column. Modals take full screen width with 16px bottom pad. Grid elements maintain 100% width.
- `430px` (Large mobile): Single column. Stat containers allow 2-column distribution. Modals maintain full width with rounded top corners.
- `768px` (Tablet): Two-column forms allowed. Tables retain horizontal structural matrix with horizontal scrolling containers. Modals center with 480px fixed width.
- `1024px+` (Desktop/Monitor): Full multi-column vault management layout. Modals center at fixed 540px width with backdrop blur.

Interactive Target Minimums:
- All buttons, select menus, input triggers, and actionable table elements must have a strict bounding box of at least 44x44px.
- Hover dependency is prohibited; state cues must be driven by visible badges, active-tap highlights (`active:scale-[0.98]`), borders, and explicit focus-visible halos (`focus-visible:ring-2 focus-visible:ring-vault-accent`).

## Atomic Component Specifications

### VaultButton (`packages/ui/src/button.tsx`)

```tsx
import * as React from 'react';

export interface VaultButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'danger' | 'ghost';
  isLoading?: boolean;
}

export const VaultButton = React.forwardRef<HTMLButtonElement, VaultButtonProps>(
  ({ variant = 'primary', isLoading = false, children, disabled, className = '', ...props }, ref) => {
    const baseStyles =
      'min-h-[44px] min-w-[44px] px-4 py-2 text-xs uppercase tracking-widest font-mono font-semibold select-none flex items-center justify-center transition-all duration-150 border active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-offset-vault-bg disabled:opacity-50 disabled:pointer-events-none';

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
```

### VaultInput (`packages/ui/src/input.tsx`)

```tsx
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
```

### VaultBadge (`packages/ui/src/badge.tsx`)

```tsx
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
```

### VaultCard (`packages/ui/src/card.tsx`)

```tsx
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
```
