import { SystemRole, UserStatus } from '../constants/roles.constant';
import { Permission } from '../constants/permissions.constant';

export interface UserEntity {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  roleId: string;
  role: SystemRole;
  status: UserStatus;
  lastLoginAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface MeResponseDto extends UserEntity {
  permissions: Permission[];
}

export interface LoginDto {
  email: string;
  password: string;
}
