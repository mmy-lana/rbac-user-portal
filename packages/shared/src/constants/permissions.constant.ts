export const SystemPermissions = {
  USERS_READ: 'users:read',
  USERS_WRITE: 'users:write',
  USERS_DELETE: 'users:delete',
  INVITATIONS_CREATE: 'invitations:create',
  INVITATIONS_READ: 'invitations:read',
  INVITATIONS_REVOKE: 'invitations:revoke',
  AUDIT_READ: 'audit:read',
} as const;

export type Permission = (typeof SystemPermissions)[keyof typeof SystemPermissions];

export const ALL_PERMISSIONS: Permission[] = Object.values(SystemPermissions) as Permission[];
