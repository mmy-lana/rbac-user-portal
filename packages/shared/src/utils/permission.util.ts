import { SystemRole } from '../constants/roles.constant';
import { permissionsForRole } from '../constants/role-permissions.constant';
import type { Permission } from '../constants/permissions.constant';

/**
 * Authorisation predicates.
 *
 * Both the NestJS `RbacGuard` (server side) and the React permission-aware route
 * wrappers (client side) call these helpers, so a screen and its endpoint can
 * never disagree about who may do what.
 *
 * `OWNER` is the root of trust: it holds every permission by definition, which
 * keeps the portal usable even if a role/permission row is missing from the
 * database. Every other role is default-deny — an absent grant denies.
 */

export interface PermissionSubject {
  role: SystemRole;
  permissions: readonly Permission[];
}

export function hasPermission(subject: PermissionSubject, permission: Permission): boolean {
  if (subject.role === SystemRole.OWNER) return true;
  return subject.permissions.includes(permission);
}

/** True when the subject holds at least one of the listed permissions. */
export function hasAnyPermission(
  subject: PermissionSubject,
  permissions: readonly Permission[]
): boolean {
  if (subject.role === SystemRole.OWNER) return true;
  return permissions.some((permission) => subject.permissions.includes(permission));
}

/** True only when the subject holds every listed permission. */
export function hasAllPermissions(
  subject: PermissionSubject,
  permissions: readonly Permission[]
): boolean {
  if (subject.role === SystemRole.OWNER) return true;
  if (permissions.length === 0) return false;
  return permissions.every((permission) => subject.permissions.includes(permission));
}

const ROLE_RANK: Readonly<Record<SystemRole, number>> = {
  [SystemRole.OWNER]: 3,
  [SystemRole.ADMIN]: 2,
  [SystemRole.AUDITOR]: 1,
  [SystemRole.MEMBER]: 0,
} as const;

/**
 * True when `actor` outranks `target` and may therefore act on it. An actor can
 * never act on an equal or higher-ranked account — this is what stops an
 * administrator from editing an owner or another administrator.
 */
export function outranks(actor: SystemRole, target: SystemRole): boolean {
  return ROLE_RANK[actor] > ROLE_RANK[target];
}

/** Effective permissions of a subject, resolving the OWNER override. */
export function effectivePermissions(subject: PermissionSubject): Permission[] {
  return subject.role === SystemRole.OWNER ? permissionsForRole(SystemRole.OWNER) : [...subject.permissions];
}