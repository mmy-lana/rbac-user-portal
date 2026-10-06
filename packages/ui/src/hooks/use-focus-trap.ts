import * as React from 'react';

/**
 * Selector for natively focusable, tab-navigable descendants.
 *
 * `[tabindex="-1"]` is excluded so programmatically focusable helpers (such as a
 * container that receives focus purely to scope the trap) are skipped by the
 * natural Tab order.
 */
const FOCUSABLE_SELECTOR = [
  'a[href]',
  'area[href]',
  'button:not([disabled])',
  'input:not([disabled]):not([type="hidden"])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  'iframe',
  'object',
  'embed',
  '[contenteditable]:not([contenteditable="false"])',
  '[tabindex]:not([tabindex="-1"])',
].join(',');

/** Focusable descendants in DOM order, filtered to actually rendered elements. */
export function getFocusableElements(container: HTMLElement): HTMLElement[] {
  const candidates = Array.from(
    container.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR)
  );
  return candidates.filter(
    (element) =>
      !element.hasAttribute('disabled') &&
      element.getAttribute('aria-hidden') !== 'true' &&
      (element.offsetWidth > 0 || element.offsetHeight > 0 || element === document.activeElement)
  );
}

/**
 * Confines keyboard focus to `container` while `active` is true.
 *
 * Implemented as a document-level `keydown` listener in the capture phase rather
 * than a `focusin` listener: trapping on `focusin` fights browser-native focus
 * restoration on close and on element removal, whereas intercepting Tab before
 * it is applied keeps the caret deterministic on every engine.
 *
 * On release the element that was focused before activation is restored, so
 * closing a dialog returns the user to the trigger they came from (WCAG 2.4.3).
 */
export function useFocusTrap<T extends HTMLElement>(
  active: boolean
): React.RefObject<T | null> {
  const containerRef = React.useRef<T | null>(null);

  React.useEffect(() => {
    if (!active) return;

    const container = containerRef.current;
    if (!container) return;

    const previouslyFocused =
      document.activeElement instanceof HTMLElement ? document.activeElement : null;

    // Prefer the first explicitly marked target (e.g. the first field of a form),
    // otherwise fall back to the first focusable element, otherwise the panel.
    const preferred = container.querySelector<HTMLElement>('[data-autofocus="true"]');
    const initial = preferred ?? getFocusableElements(container)[0] ?? container;
    initial.focus();

    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key !== 'Tab') return;

      const focusable = getFocusableElements(container);
      const first = focusable.at(0);
      const last = focusable.at(focusable.length - 1);
      if (first === undefined || last === undefined) {
        // Nothing to move to — keep focus pinned on the panel itself.
        event.preventDefault();
        container.focus();
        return;
      }

      const current = document.activeElement;
      const inside = current !== null && container.contains(current);

      if (event.shiftKey && (!inside || current === first)) {
        event.preventDefault();
        last.focus();
        return;
      }

      if (!event.shiftKey && current === last) {
        event.preventDefault();
        first.focus();
      }
    };

    document.addEventListener('keydown', onKeyDown, true);
    return () => {
      document.removeEventListener('keydown', onKeyDown, true);
      previouslyFocused?.focus?.();
    };
  }, [active]);

  return containerRef;
}