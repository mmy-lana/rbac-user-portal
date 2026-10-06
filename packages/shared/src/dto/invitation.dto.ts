import { SystemRole, InvitationStatus } from '../constants/roles.constant';

export interface InvitationEntity {
  id: string;
  email: string;
  roleId: string;
  role: SystemRole;
  status: InvitationStatus;
  invitedByUserId: string;
  invitedByEmail: string;
  expiresAt: string;
  acceptedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface CreateInvitationDto {
  email: string;
  roleId: string;
}

export interface AcceptInvitationDto {
  firstName: string;
  lastName: string;
  password: string;
}

export interface RevokeInvitationDto {
  invitationId: string;
}

export interface PaginationParams {
  page: number;
  limit: number;
  search?: string;
  status?: InvitationStatus;
}
