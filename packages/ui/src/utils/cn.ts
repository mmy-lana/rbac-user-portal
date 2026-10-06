/**
 * Minimal class-name composer.
 *
 * Joins truthy class fragments, de-duplicating whitespace, and supports the
 * common `cn('base', condition && 'active')` pattern without pulling in a
 * runtime dependency (the design system must stay dependency-free apart from
 * React and `@rbac/shared`).
 */
export type ClassValue = string | number | false | null | undefined;

export function cn(...values: ClassValue[]): string {
  const out: string[] = [];
  for (const value of values) {
    if (!value && value !== 0) continue;
    const text = String(value).trim();
    if (text.length > 0) out.push(text);
  }
  return out.join(' ');
}