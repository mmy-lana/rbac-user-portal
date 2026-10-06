import * as React from 'react';
import { cn } from './utils/cn';

export interface VaultCardProps extends React.HTMLAttributes<HTMLDivElement> {
  title?: string;
  subtitle?: string;
  /** Header control cluster — must contain only 44px-minimum touch targets. */
  action?: React.ReactNode;
  children: React.ReactNode;
  /** Heading level for the card title, so a page keeps a sane outline. */
  headingLevel?: 2 | 3 | 4 | 5 | 6;
}

/**
 * Surface container. The title is rendered through a dynamic heading element so
 * that a card placed inside a section keeps document outline integrity instead
 * of emitting a stray `<h3>`.
 */
export const VaultCard: React.FC<VaultCardProps> = ({
  title,
  subtitle,
  action,
  children,
  className,
  headingLevel = 3,
  ...props
}) => {
  const Heading = `h${headingLevel}` as 'h2' | 'h3' | 'h4' | 'h5' | 'h6';
  const hasHeader = Boolean(title || subtitle || action);

  return (
    <div
      className={cn('bg-vault-surface border border-vault-border p-4 md:p-6 flex flex-col', className)}
      {...props}
    >
      {hasHeader && (
        <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-4 mb-4 border-b border-vault-border gap-2">
          <div className="min-w-0">
            {title && (
              <Heading className="text-sm md:text-base font-mono font-bold uppercase tracking-wider text-vault-text-primary break-words">
                {title}
              </Heading>
            )}
            {subtitle && (
              <p className="text-xs font-mono text-vault-text-tertiary mt-0.5 break-words">
                {subtitle}
              </p>
            )}
          </div>
          {action && <div className="self-start sm:self-auto shrink-0">{action}</div>}
        </div>
      )}
      <div className="w-full min-w-0">{children}</div>
    </div>
  );
};
VaultCard.displayName = 'VaultCard';