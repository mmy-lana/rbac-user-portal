import { InvitationStatus, SystemRole, UserStatus } from '../constants/roles.constant';

/**
 * PostgreSQL `pgEnum` columns surface as plain string literal unions, while the
 * shared contract models them as TypeScript enums. These parsers are the single
 * boundary where a database value becomes a domain value.
 *
 * Every parser is total: unknown input never degrades into a permissive default
 * cast. A value outside the enum means the database and the application contract
 * have diverged, and that must fail loudly instead of silently becoming
 * `MEMBER`/`ACTIVE` — a wrong default in an RBAC system is a privilege bug.
 */

const SYSTEM_ROLES: readonly SystemRole[] = Object.values(SystemRole);
const USER_STATUSES: readonly UserStatus[] = Object.values(UserStatus);
const INVITATION_STATUSES: readonly InvitationStatus[] = Object.values(InvitationStatus);

function parseEnumValue<T extends string>(allowed: readonly T[], value: string, context: string): T {
  const match = allowed.find((candidate) => candidate === value);
  if (match === undefined) {
    throw new Error(`Invalid ${context} value "${value}". Expected one of: ${allowed.join(', ')}.`);
  }
  return match;
}

/** Returns the matching role, or `null` when the column is NULL or unknown-shaped. */
export function toSystemRole(value: string | null | undefined): SystemRole | null {
  if (value === null || value === undefined) return null;
  return parseEnumValue<SystemRole>(SYSTEM_ROLES, value, 'SystemRole');
}

/** Returns the matching role or throws. Use where the column is `NOT NULL`. */
export function parseSystemRole(value: string | null | undefined): SystemRole {
  if (value === null || value === undefined) {
    throw new Error('Expected a non-null SystemRole but received null.');
  }
  return parseEnumValue<SystemRole>(SYSTEM_ROLES, value, 'SystemRole');
}

export function toUserStatus(value: string | null | undefined): UserStatus | null {
  if (value === null || value === undefined) return null;
  return parseEnumValue<UserStatus>(USER_STATUSES, value, 'UserStatus');
}

export function parseUserStatus(value: string | null | undefined): UserStatus {
  if (value === null || value === undefined) {
    throw new Error('Expected a non-null UserStatus but received null.');
  }
  return parseEnumValue<UserStatus>(USER_STATUSES, value, 'UserStatus');
}

export function toInvitationStatus(
  value: string | null | undefined
): InvitationStatus | null {
  if (value === null || value === undefined) return null;
  return parseEnumValue<InvitationStatus>(INVITATION_STATUSES, value, 'InvitationStatus');
}

export function parseInvitationStatus(value: string | null | undefined): InvitationStatus {
  if (value === null || value === undefined) {
    throw new Error('Expected a non-null InvitationStatus but received null.');
  }
  return parseEnumValue<InvitationStatus>(INVITATION_STATUSES, value, 'InvitationStatus');
}

/** Narrowing membership tests used by guards and UI conditionals. */
export function isSystemRole(value: unknown): value is SystemRole {
  return SYSTEM_ROLES.includes(value as SystemRole);
}

export function isUserStatus(value: unknown): value is UserStatus {
  return USER_STATUSES.includes(value as UserStatus);
}

export function isInvitationStatus(value: unknown): value is InvitationStatus {
  return INVITATION_STATUSES.includes(value as InvitationStatus);
}