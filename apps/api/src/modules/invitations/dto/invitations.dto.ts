import { Type } from 'class-transformer';
import { IsEmail, IsIn, IsInt, IsOptional, IsString, Length, Max, MaxLength, Min } from 'class-validator';
import { InvitationStatus } from '@rbac/shared';

/** Roles an invitation may assign. `OWNER` is excluded by design. */
export const ASSIGNABLE_ROLES = ['ADMIN', 'AUDITOR', 'MEMBER'] as const;

export type AssignableRole = (typeof ASSIGNABLE_ROLES)[number];

/** Runtime values accepted by the status filter. */
export const INVITATION_STATUS_VALUES = [
  InvitationStatus.PENDING,
  InvitationStatus.ACCEPTED,
  InvitationStatus.EXPIRED,
  InvitationStatus.REVOKED,
] as const;

/** Body for `POST /api/v1/invitations`. */
export class CreateInvitationDto {
  @IsEmail({}, { message: 'A valid email address is required.' })
  @MaxLength(255)
  email!: string;

  @IsString()
  @Length(8, 64, { message: 'roleId must be a provisioned role identifier.' })
  roleId!: string;
}

/**
 * Body for `POST /api/v1/invitations/accept/:token`.
 *
 * `confirmPassword` is deliberately absent: it is a client-side typo guard and
 * must never be transmitted, so the server can never be asked to compare it.
 */
export class AcceptInvitationDto {
  @IsString()
  @Length(1, 100)
  firstName!: string;

  @IsString()
  @Length(1, 100)
  lastName!: string;

  @IsString()
  @Length(12, 128, { message: 'Passphrase must be between 12 and 128 characters.' })
  password!: string;
}

/** Query for `GET /api/v1/invitations`. */
export class ListInvitationsQueryDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number;

  @IsOptional()
  @IsIn(INVITATION_STATUS_VALUES, {
    message: `status must be one of: ${INVITATION_STATUS_VALUES.join(', ')}`,
  })
  status?: InvitationStatus;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  search?: string;
}