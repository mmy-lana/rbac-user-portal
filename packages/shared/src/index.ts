export * from './constants/roles.constant';
export * from './constants/permissions.constant';
export * from './types/api-response.type';
export * from './types/session.type';
export * from './dto/auth.dto';
export * from './dto/invitation.dto';

import { SystemRole } from './constants/roles.constant';
import { Permission } from './constants/permissions.constant';

export function hasPermission(
  user: { role: SystemRole; permissions: Permission[] },
  permission: Permission
): boolean {
  if (user.role === SystemRole.OWNER) {
    return true;
  }
  return user.permissions.includes(permission);
}
