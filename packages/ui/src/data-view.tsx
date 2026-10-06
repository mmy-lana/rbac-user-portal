import * as React from 'react';
import { cn } from './utils/cn';

/**
 * Column definition for {@link VaultDataView}.
 *
 * The same descriptor drives both renderings, which is the point of the
 * primitive: the column order, the labels and the cell renderers are declared
 * once and the component decides between a matrix layout (tablet and up) and a
 * stacked card layout (mobile), so the two can never drift apart.
 */
export interface VaultDataColumn<T> {
  /** Stable identifier; also used as the React key suffix. */
  key: string;
  /** Column header text, also reused as the label in the stacked layout. */
  header: string;
  render: (row: T, index: number) => React.ReactNode;
  /**
   * Renders as the headline of the stacked card. Mark the identifier column
   * (email, name, …) as primary so the compact layout has a clear anchor.
   */
  isPrimary?: boolean;
  /** Omit from the stacked card — keep columns that only make sense as columns. */
  hideOnCompact?: boolean;
  align?: 'left' | 'center' | 'right';
  /** Extra Tailwind classes for the header and body cells (e.g. `w-40`). */
  className?: string;
}

export interface VaultDataViewProps<T> {
  columns: VaultDataColumn<T>[];
  rows: readonly T[];
  /** Stable row identity for React keys; must be unique across the collection. */
  rowKey: (row: T, index: number) => string;
  /** Describes the table for assistive technology. */
  caption: string;
  isLoading?: boolean;
  /** Rendered when `rows` is empty and not loading. */
  emptyState?: React.ReactNode;
  className?: string;
}

const ALIGNMENT: Record<'left' | 'center' | 'right', string> = {
  left: 'text-left',
  center: 'text-center',
  right: 'text-right',
};

function LoadingBlock({ caption }: { caption: string }): React.ReactElement {
  return (
    <div role="status" aria-live="polite" className="p-4 flex flex-col gap-3">
      <span className="sr-only">Loading {caption}</span>
      {[0, 1, 2].map((row) => (
        <div key={row} className="flex flex-col gap-2" aria-hidden="true">
          <div className="h-3 w-1/3 bg-vault-surface-elevated border border-vault-border animate-pulse" />
          <div className="h-3 w-2/3 bg-vault-surface-elevated border border-vault-border animate-pulse" />
        </div>
      ))}
    </div>
  );
}

/**
 * Responsive data view.
 *
 * Layout contract:
 *  - `< 768px` — the matrix is replaced by one high-density card per row. Each
 *    card leads with the `isPrimary` column and lists the remaining visible
 *    columns as `label / value` pairs. Columns flagged `hideOnCompact` are
 *    dropped rather than squeezed.
 *  - `>= 768px` — a real `<table>` with `scope="col"` headers inside a
 *    horizontally scrollable container, so wide matrices scroll instead of
 *    wrapping mid-cell.
 *
 * Both renderings are always present in the DOM with mutually exclusive
 * visibility classes: a CSS-only switch means the data exists once, no state is
 * duplicated, and there is no hydration mismatch when the viewport changes.
 */
export function VaultDataView<T>({
  columns,
  rows,
  rowKey,
  caption,
  isLoading = false,
  emptyState,
  className,
}: VaultDataViewProps<T>): React.ReactElement {
  const primaryColumn = columns.find((column) => column.isPrimary === true);
  const stackColumns = columns.filter(
    (column) => column.isPrimary !== true && column.hideOnCompact !== true
  );

  if (isLoading) {
    return <LoadingBlock caption={caption} />;
  }

  if (rows.length === 0) {
    return (
      <div className={cn('p-6 text-center', className)}>
        {emptyState ?? (
          <p className="text-xs font-mono uppercase tracking-widest text-vault-text-tertiary">
            No records
          </p>
        )}
      </div>
    );
  }

  return (
    <div className={cn('w-full', className)}>
      {/* Compact stacked view — phones and small tablets. */}
      <ul className="tablet:hidden flex flex-col gap-3" aria-label={caption}>
        {rows.map((row, index) => {
          const key = rowKey(row, index);
          return (
            <li
              key={key}
              className="bg-vault-surface-elevated border border-vault-border p-3 flex flex-col gap-2"
            >
              {primaryColumn && (
                <div className="font-mono text-sm text-vault-text-primary break-words">
                  {primaryColumn.render(row, index)}
                </div>
              )}
              <dl className="flex flex-col gap-1.5">
                {stackColumns.map((column) => (
                  <div
                    key={`${key}-${column.key}`}
                    className="flex items-baseline justify-between gap-3 min-h-[24px]"
                  >
                    <dt className="text-[11px] font-mono uppercase tracking-widest text-vault-text-tertiary shrink-0">
                      {column.header}
                    </dt>
                    <dd
                      className={cn(
                        'text-xs font-mono text-vault-text-secondary text-right break-words min-w-0',
                        ALIGNMENT[column.align ?? 'left']
                      )}
                    >
                      {column.render(row, index)}
                    </dd>
                  </div>
                ))}
              </dl>
            </li>
          );
        })}
      </ul>

      {/* Tabular view — tablet and up. */}
      <div className="hidden tablet:block w-full overflow-x-auto">
        <table className="w-full border-collapse text-left">
          <caption className="sr-only">{caption}</caption>
          <thead>
            <tr className="border-b border-vault-border">
              {columns.map((column) => (
                <th
                  key={column.key}
                  scope="col"
                  className={cn(
                    'px-3 py-3 text-[11px] font-mono uppercase tracking-widest text-vault-text-tertiary whitespace-nowrap',
                    ALIGNMENT[column.align ?? 'left'],
                    column.className
                  )}
                >
                  {column.header}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row, index) => (
              <tr
                key={rowKey(row, index)}
                className="border-b border-vault-border/60 last:border-b-0"
              >
                {columns.map((column) => (
                  <td
                    key={column.key}
                    className={cn(
                      'px-3 py-3 align-middle text-xs font-mono text-vault-text-secondary',
                      ALIGNMENT[column.align ?? 'left'],
                      column.className
                    )}
                  >
                    {column.render(row, index)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
VaultDataView.displayName = 'VaultDataView';