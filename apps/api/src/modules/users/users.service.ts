import { Injectable } from '@nestjs/common';
import { eq, users, roles } from '@rbac/database';
import {
  parseSystemRole,
  parseUserStatus,
  toIsoString,
  toIsoStringOrNull,
  type SystemRole,
  type UserEntity,
  type UserStatus,
} from '@rbac/shared';
import { DatabaseService } from '../database/database.service';

/**
 * Row shape returned by the credential lookup. Includes `passwordHash`, which is
 * why it is deliberately *not* part of the public `UserEntity` contract.
 */
export interface UserWithSecrets {
  id: string;
  email: string;
  passwordHash: string;
  firstName: string;
  lastName: string;
  roleId: string;
  role: SystemRole | null;
  status: UserStatus;
  lastLoginAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * Row shape returned by non-credential lookups: identical to
 * {@link UserWithSecrets} without the password digest.
 */
export interface UserRecord {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  roleId: string;
  role: SystemRole | null;
  status: UserStatus;
  lastLoginAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

/** Session-bearing projection used by the refresh flow. */
export interface AuthUserRecord extends UserWithSecrets {
  refreshTokenHash: string | null;
}

/** Joined row as returned by Drizzle: enums are still string unions here. */
interface JoinedUserRow {
  id: string;
  email: string;
  passwordHash: string;
  firstName: string;
  lastName: string;
  roleId: string;
  role: string | null;
  status: string;
  refreshTokenHash: string | null;
  lastLoginAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

function toAuthUserRecord(row: JoinedUserRow): AuthUserRecord {
  return {
    id: row.id,
    email: row.email,
    passwordHash: row.passwordHash,
    firstName: row.firstName,
    lastName: row.lastName,
    roleId: row.roleId,
    // `pgEnum` columns surface as string unions; the contract uses enums.
    role: row.role === null ? null : parseSystemRole(row.role),
    status: parseUserStatus(row.status),
    refreshTokenHash: row.refreshTokenHash,
    lastLoginAt: row.lastLoginAt,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

/**
 * Projects a joined row onto the shared `UserEntity` contract.
 *
 * `UserEntity` is a *composed* projection — `role` comes from the `roles` join
 * and timestamps are serialised to ISO-8601. A row whose role does not resolve
 * is a hard error rather than a silent downgrade to `MEMBER`, which would turn a
 * data-integrity fault into an authorisation fault.
 */
export function toUserEntity(user: UserRecord): UserEntity {
  if (user.role === null) {
    throw new Error(`User ${user.id} references a role that does not resolve to a system role.`);
  }

  return {
    id: user.id,
    email: user.email,
    firstName: user.firstName,
    lastName: user.lastName,
    roleId: user.roleId,
    role: user.role,
    status: user.status,
    lastLoginAt: toIsoStringOrNull(user.lastLoginAt),
    createdAt: toIsoString(user.createdAt),
    updatedAt: toIsoString(user.updatedAt),
  };
}

/** Projection shared by every user lookup; `role` carries an explicit alias. */
const userProjection = {
  id: users.id,
  email: users.email,
  passwordHash: users.passwordHash,
  firstName: users.firstName,
  lastName: users.lastName,
  roleId: users.roleId,
  role: roles.name,
  status: users.status,
  refreshTokenHash: users.refreshTokenHash,
  lastLoginAt: users.lastLoginAt,
  createdAt: users.createdAt,
  updatedAt: users.updatedAt,
} as const;

@Injectable()
export class UsersService {
  constructor(private readonly dbService: DatabaseService) {}

  /**
   * Credential lookup for the login and refresh flows. Returns `undefined` when
   * no account matches the address.
   *
   * `role: roles.name` is an explicit alias: `UserEntity.role` is typed as the
   * `SystemRole` enum, so the `pgEnum` string union must be narrowed by
   * {@link parseSystemRole} before it crosses the module boundary.
   */
  async findByEmail(email: string): Promise<UserWithSecrets | undefined> {
    const rows = await this.dbService.db
      .select(userProjection)
      .from(users)
      .leftJoin(roles, eq(users.roleId, roles.id))
      .where(eq(users.email, email))
      .limit(1);

    const row = rows.at(0);
    return row ? toAuthUserRecord(row as JoinedUserRow) : undefined;
  }

  /** Session-bearing lookup used by the single-use refresh rotation. */
  async findAuthRecordById(id: string): Promise<AuthUserRecord | undefined> {
    const rows = await this.dbService.db
      .select(userProjection)
      .from(users)
      .leftJoin(roles, eq(users.roleId, roles.id))
      .where(eq(users.id, id))
      .limit(1);

    const row = rows.at(0);
    return row ? toAuthUserRecord(row as JoinedUserRow) : undefined;
  }

  /** Public profile projection for `/me` and directory views. */
  async findById(id: string): Promise<UserEntity | undefined> {
    const record = await this.findAuthRecordById(id);
    return record ? toUserEntity(record) : undefined;
  }

  async findRecordById(id: string): Promise<UserRecord | undefined> {
    const record = await this.findAuthRecordById(id);
    if (!record) return undefined;

    const { passwordHash: _passwordHash, refreshTokenHash: _refreshTokenHash, ...rest } = record;
    return rest;
  }

  async existsByEmail(email: string): Promise<boolean> {
    const rows = await this.dbService.db
      .select({ id: users.id })
      .from(users)
      .where(eq(users.email, email))
      .limit(1);
    return rows.length > 0;
  }
}