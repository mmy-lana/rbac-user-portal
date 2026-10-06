import * as React from 'react';
import { createPortal } from 'react-dom';
import { useFocusTrap } from './hooks/use-focus-trap';
import { VaultButton } from './button';
import { cn } from './utils/cn';

export interface VaultModalProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  subtitle?: string;
  children: React.ReactNode;
  /** Footer controls (confirm/cancel). Must hold 44px-minimum touch targets. */
  footer?: React.ReactNode;
  /**
   * Blocks backdrop click and Escape dismissal — use while a destructive or
   * irreversible operation is in flight so the request cannot be orphaned.
   */
  isDismissDisabled?: boolean;
  className?: string;
}

const FOCUSABLE_PANEL_TAB_INDEX = -1;

/**
 * Portal-rendered dialog.
 *
 * Viewport adaptation (see the design system rules):
 *  - 360px / 390px / 430px — full-width bottom sheet, `12px` side margins,
 *    rounded top corners only, and a drag-handle affordance. Content scrolls
 *    inside the sheet so the on-screen keyboard never traps the action row.
 *  - 768px — centred, `480px` fixed width, fully rounded.
 *  - 1024px+ — centred, `540px`, with the blurred backdrop treatment.
 *
 * Accessibility contract:
 *  - `role="dialog"` + `aria-modal="true"` + `aria-labelledby` bound to the title.
 *  - Focus is trapped while open and restored to the invoking element on close.
 *  - Escape and backdrop dismissal close the dialog unless locked.
 *  - Background scroll is locked, including iOS Safari overscroll.
 *  - Background content is hidden from assistive technology via `aria-hidden`,
 *    which is why the dialog must be portalled outside the app root.
 */
export const VaultModal: React.FC<VaultModalProps> = ({
  isOpen,
  onClose,
  title,
  subtitle,
  children,
  footer,
  isDismissDisabled = false,
  className,
}) => {
  const panelRef = useFocusTrap<HTMLDivElement>(isOpen);
  const [isMounted, setIsMounted] = React.useState(false);
  const generatedId = React.useId();
  const titleId = `${generatedId}-title`;
  const subtitleId = `${generatedId}-subtitle`;

  // Portals require a DOM; `useEffect` keeps SSR/hydration safe.
  React.useEffect(() => {
    setIsMounted(true);
  }, []);

  React.useEffect(() => {
    if (!isOpen) return;

    const { body } = document;
    const previousOverflow = body.style.overflow;
    const previousPaddingRight = body.style.paddingRight;
    const scrollbarWidth = window.innerWidth - document.documentElement.clientWidth;

    body.style.overflow = 'hidden';
    if (scrollbarWidth > 0) {
      // Compensate for the removed scrollbar so the page does not shift.
      body.style.paddingRight = `${scrollbarWidth}px`;
    }

    return () => {
      body.style.overflow = previousOverflow;
      body.style.paddingRight = previousPaddingRight;
    };
  }, [isOpen]);

  const handleEscape = React.useCallback(
    (event: KeyboardEvent) => {
      if (event.key !== 'Escape' || isDismissDisabled) return;
      event.stopPropagation();
      onClose();
    },
    [isDismissDisabled, onClose]
  );

  React.useEffect(() => {
    if (!isOpen) return;
    document.addEventListener('keydown', handleEscape);
    return () => document.removeEventListener('keydown', handleEscape);
  }, [isOpen, handleEscape]);

  if (!isMounted || !isOpen) return null;

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-end tablet:items-center justify-center">
      <div
        data-testid="vault-modal-backdrop"
        aria-hidden="true"
        onClick={isDismissDisabled ? undefined : onClose}
        className="absolute inset-0 bg-vault-bg/80 backdrop-blur-sm lg:backdrop-blur-md"
      />

      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={subtitle ? subtitleId : undefined}
        tabIndex={FOCUSABLE_PANEL_TAB_INDEX}
        className={cn(
          'relative w-full max-h-[90dvh] overflow-y-auto overscroll-contain',
          'bg-vault-surface border border-vault-border',
          'rounded-t-xl px-3 pb-4 pt-3',
          'tablet:max-w-[480px] tablet:rounded-xl tablet:px-6 tablet:pb-6 tablet:pt-5',
          'lg:max-w-[540px]',
          'shadow-[0_-8px_32px_rgba(0,0,0,0.45)] lg:shadow-[0_8px_32px_rgba(0,0,0,0.55)]',
          'focus:outline-none',
          className
        )}
      >
        <div
          aria-hidden="true"
          className="mx-auto mb-3 h-1 w-10 rounded-full bg-vault-border-bright tablet:hidden"
        />

        <div className="flex items-start justify-between gap-3 pb-4 border-b border-vault-border">
          <div className="min-w-0">
            <h2
              id={titleId}
              className="text-sm tablet:text-base font-mono font-bold uppercase tracking-wider text-vault-text-primary break-words"
            >
              {title}
            </h2>
            {subtitle && (
              <p id={subtitleId} className="text-xs font-mono text-vault-text-tertiary mt-1 break-words">
                {subtitle}
              </p>
            )}
          </div>

          <VaultButton
            variant="ghost"
            aria-label="Close dialog"
            onClick={onClose}
            disabled={isDismissDisabled}
            className="-mr-2 -mt-1 shrink-0"
          >
            <span aria-hidden="true" className="text-base leading-none">
              ✕
            </span>
          </VaultButton>
        </div>

        <div className="py-4">{children}</div>

        {footer && (
          <div className="flex flex-col-reverse gap-2 pt-4 border-t border-vault-border tablet:flex-row tablet:justify-end">
            {footer}
          </div>
        )}
      </div>
    </div>,
    document.body
  );
};
VaultModal.displayName = 'VaultModal';