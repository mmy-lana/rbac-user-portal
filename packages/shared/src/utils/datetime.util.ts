/**
 * Serialisation helpers for the wire contract.
 *
 * Drizzle returns `timestamptz` columns as `Date`; every entity in the shared
 * contract declares ISO-8601 strings so that API responses, JWT claims and the
 * React client all agree on one representation regardless of the driver.
 */

export type DateLike = Date | string;

function toDate(value: DateLike): Date {
  return value instanceof Date ? value : new Date(value);
}

/** ISO-8601 string for a non-null timestamp column. */
export function toIsoString(value: DateLike): string {
  return toDate(value).toISOString();
}

/** ISO-8601 string for a nullable timestamp column. */
export function toIsoStringOrNull(value: DateLike | null | undefined): string | null {
  if (value === null || value === undefined) return null;
  return toDate(value).toISOString();
}

/** True when the timestamp is strictly in the past relative to `now`. */
export function isExpired(value: DateLike, now: DateLike = new Date()): boolean {
  return toDate(value).getTime() <= toDate(now).getTime();
}

/** New date offset from `from` by a whole number of days. */
export function addDays(from: DateLike, days: number): Date {
  const next = new Date(toDate(from).getTime());
  next.setUTCDate(next.getUTCDate() + days);
  return next;
}

/** New date offset from `from` by a whole number of minutes. */
export function addMinutes(from: DateLike, minutes: number): Date {
  return new Date(toDate(from).getTime() + minutes * 60_000);
}