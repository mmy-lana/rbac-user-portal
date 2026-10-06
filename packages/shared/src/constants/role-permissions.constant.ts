import { SystemRole } from './roles.constant';
import { ALL_PERMISSIONS, SystemPermissions, type Permission } from './permissions.constant';

/**
 * Canonical role → permission grants.
 *
 * This map is the single source of truth for authorisation decisions at runtime
 * and is provisioned into `roles` / `permissions` / `role_permissions` by the
 * idempotent seed script. Keeping it in `@rbac/shared` lets the API, the seed
 * and the React client agree on one definition — the client needs it to render
 * permission-aware UI without duplicating the rules.
 *
 * Posture: default-deny. Anything not listed here grants nothing.
 */
export const ROLE_PERMISSIONS: Readonly<Record<SystemRole, readonly Permission[]>> = {
  [SystemRole.OWNER]: ALL_PERMISSIONS,

  // Full control over invitations and the user directory, minus destructive
  // user deletion and the audit trail, which stay owner-only.
  [SystemRole.ADMIN]: [
    SystemPermissions.USERS_READ,
    SystemPermissions.USERS_WRITE,
    SystemPermissions.INVITATIONS_CREATE,
    SystemPermissions.INVITATIONS_READ,
    SystemPermissions.INVITATIONS_REVOKE,
    SystemPermissions.AUDIT_READ,
  ],

  // Read-only observer: can inspect the user directory, invitations and audit
  // trail, but holds no mutating grant at all.
  [SystemRole.AUDITOR]: [
    SystemPermissions.USERS_READ,
    SystemPermissions.INVITATIONS_READ,
    SystemPermissions.AUDIT_READ,
  ],

  [SystemRole.MEMBER]: [SystemPermissions.USERS_READ],
} as const;

/** Permissions granted to a role, as a fresh mutable array. */
export function permissionsForRole(role: SystemRole): Permission[] {
  return [...(ROLE_PERMISSIONS[role] ?? [])];
}

/** Human-readable role labels shared by the API and the UI. */
export const ROLE_LABELS: Readonly<Record<SystemRole, string>> = {
  [SystemRole.OWNER]: 'Owner',
  [SystemRole.ADMIN]: 'Administrator',
  [SystemRole.AUDITOR]: 'Auditor',
  [SystemRole.MEMBER]: 'Member',
} as const;