import { SystemRole } from '../constants/roles.constant';
import { Permission } from '../constants/permissions.constant';

export interface AuthenticatedUserPayload {
  userId: string;
  email: string;
  role: SystemRole;
  permissions: Permission[];
}

export interface SessionTokens {
  accessToken: string;
  expiresIn: number;
}
