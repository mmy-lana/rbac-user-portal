# Core Specification: Schema, Types, and Contracts

## Database Schema (Neon PostgreSQL / DDL)

```sql
CREATE TYPE user_status AS ENUM ('ACTIVE', 'SUSPENDED', 'PENDING_ACTIVATION');
CREATE TYPE invitation_status AS ENUM ('PENDING', 'ACCEPTED', 'EXPIRED', 'REVOKED');
CREATE TYPE system_role AS ENUM ('OWNER', 'ADMIN', 'AUDITOR', 'MEMBER');

CREATE TABLE roles (
    id VARCHAR(64) PRIMARY KEY,
    name system_role NOT NULL UNIQUE,
    description TEXT NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP NOT NULL
);

CREATE TABLE permissions (
    id VARCHAR(64) PRIMARY KEY,
    action VARCHAR(64) NOT NULL,
    resource VARCHAR(64) NOT NULL,
    description TEXT NOT NULL,
    CONSTRAINT uq_permission_action_resource UNIQUE (action, resource)
);

CREATE TABLE role_permissions (
    role_id VARCHAR(64) NOT NULL REFERENCES roles(id) ON DELETE CASCADE,
    permission_id VARCHAR(64) NOT NULL REFERENCES permissions(id) ON DELETE CASCADE,
    PRIMARY KEY (role_id, permission_id)
);

CREATE TABLE users (
    id VARCHAR(64) PRIMARY KEY,
    email VARCHAR(255) NOT NULL UNIQUE,
    password_hash VARCHAR(255) NOT NULL,
    first_name VARCHAR(100) NOT NULL,
    last_name VARCHAR(100) NOT NULL,
    role_id VARCHAR(64) NOT NULL REFERENCES roles(id) ON DELETE RESTRICT,
    status user_status DEFAULT 'PENDING_ACTIVATION' NOT NULL,
    refresh_token_hash VARCHAR(255), -- bcrypt, 12 rounds
    last_login_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP NOT NULL
);

CREATE TABLE invitations (
    id VARCHAR(64) PRIMARY KEY,
    email VARCHAR(255) NOT NULL,
    role_id VARCHAR(64) NOT NULL REFERENCES roles(id) ON DELETE RESTRICT,
    token_hash VARCHAR(64) NOT NULL UNIQUE, -- SHA-256 hex
    status invitation_status DEFAULT 'PENDING' NOT NULL,
    invited_by_user_id VARCHAR(64) NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
    accepted_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP NOT NULL
);

CREATE TABLE audit_logs (
    id VARCHAR(64) PRIMARY KEY,
    actor_id VARCHAR(64) REFERENCES users(id) ON DELETE SET NULL,
    action VARCHAR(64) NOT NULL,
    resource_type VARCHAR(64) NOT NULL,
    resource_id VARCHAR(64) NOT NULL,
    payload JSONB DEFAULT '{}'::jsonb NOT NULL,
    ip_address VARCHAR(45) NOT NULL,
    user_agent TEXT NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP NOT NULL
);

CREATE INDEX idx_users_email ON users(email);
CREATE INDEX idx_invitations_token_hash ON invitations(token_hash);
CREATE INDEX idx_invitations_email ON invitations(email);
CREATE INDEX idx_invitations_status ON invitations(status);
CREATE UNIQUE INDEX uq_active_invitation_email ON invitations(email) WHERE status = 'PENDING';
CREATE INDEX idx_invitations_expires_at ON invitations(expires_at) WHERE status = 'PENDING';
CREATE INDEX idx_audit_logs_actor ON audit_logs(actor_id);
CREATE INDEX idx_audit_logs_created_at ON audit_logs(created_at DESC);
```

## Shared TypeScript Definitions & DTOs

```typescript
export enum SystemRole {
  OWNER = 'OWNER',
  ADMIN = 'ADMIN',
  AUDITOR = 'AUDITOR',
  MEMBER = 'MEMBER',
}

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

export enum UserStatus {
  ACTIVE = 'ACTIVE',
  SUSPENDED = 'SUSPENDED',
  PENDING_ACTIVATION = 'PENDING_ACTIVATION',
}

export enum InvitationStatus {
  PENDING = 'PENDING',
  ACCEPTED = 'ACCEPTED',
  EXPIRED = 'EXPIRED',
  REVOKED = 'REVOKED',
}

/**
 * UserEntity is a composed projection requiring a join:
 * users LEFT JOIN roles ON users.role_id = roles.id.
 * It is not a direct 1:1 mapping of the users table row.
 * 
 * Query Projection Rule:
 * Drizzle select queries projecting roles.name into the UserEntity
 * shape must specify an explicit alias in the select object:
 * { role: roles.name }
 */
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

/**
 * InvitationEntity is a composed projection requiring joins:
 * invitations
 * LEFT JOIN roles ON invitations.role_id = roles.id
 * LEFT JOIN users AS inviter ON invitations.invited_by_user_id = inviter.id.
 */
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

export interface AuthenticatedUserPayload {
  userId: string;
  email: string;
  role: SystemRole;
  permissions: Permission[];
}

export interface MeResponseDto extends UserEntity {
  permissions: Permission[];
}

export interface SessionTokens {
  accessToken: string;
  expiresIn: number;
}

export interface LoginDto {
  email: string;
  password: string;
}

export interface CreateInvitationDto {
  email: string;
  roleId: string;
}

/**
 * Token is delivered exclusively via URL path parameter:
 * POST /api/v1/invitations/accept/:token
 * confirmPassword is validated client-side only and must not be included in the API request body.
 */
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
```
